// OmniKit service worker: focus-mode blocking, pomodoro, clipboard history, page watcher.

const RULE_ID_OFFSET = 1000;
const MAX_CLIPS = 300;
const DEFAULT_WATCH_PERIOD_MIN = 30;

const DEFAULTS = {
  blocklist: ["youtube.com", "twitter.com", "x.com", "facebook.com", "instagram.com", "reddit.com", "tiktok.com"],
  focusEnabled: false,
  pomodoro: null, // { phase: 'focus'|'break', endTime: ms, focusMin, breakMin }
  pomodoroStats: {}, // { 'YYYY-MM-DD': completedFocusSessions }
  clips: [], // [{ id, text, source, at, pinned }]
  watches: [], // [{ id, url, title, selector, value, lastChecked, changed, error }]
  watchInterval: DEFAULT_WATCH_PERIOD_MIN, // minutes between automatic checks
  alerts: {
    water: { on: false, min: 60 },
    eye: { on: false, min: 20 },
    namaz: { on: false, city: "Karachi", country: "Pakistan", times: null, date: null, error: null }
  },
  customAlerts: [] // [{ id, label, time: "HH:MM", daily }]
};

async function scheduleWatcherAlarm() {
  const { watchInterval } = await chrome.storage.local.get("watchInterval");
  const minutes = Math.max(1, Math.min(1440, Number(watchInterval) || DEFAULT_WATCH_PERIOD_MIN));
  await chrome.alarms.create("watcher", { periodInMinutes: minutes });
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const init = {};
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (stored[key] === undefined) init[key] = value;
  }
  if (Object.keys(init).length) await chrome.storage.local.set(init);
  // Re-sync blocking rules with stored state after update/reload.
  const { focusEnabled, blocklist } = await chrome.storage.local.get(["focusEnabled", "blocklist"]);
  await applyBlockingRules(focusEnabled ? blocklist : []);
  await scheduleWatcherAlarm();
  await resyncAlerts();
});

chrome.runtime.onStartup.addListener(async () => {
  await resyncAlerts();
});

// --- Focus mode blocking ---

async function applyBlockingRules(domains) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map((r) => r.id);
  const addRules = (domains || []).map((domain, i) => ({
    id: RULE_ID_OFFSET + i,
    priority: 1,
    action: {
      type: "redirect",
      redirect: { extensionPath: "/blocked/blocked.html" }
    },
    condition: {
      urlFilter: `||${domain}^`,
      resourceTypes: ["main_frame"]
    }
  }));
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
}

async function setFocus(enabled) {
  const { blocklist } = await chrome.storage.local.get("blocklist");
  await chrome.storage.local.set({ focusEnabled: enabled });
  await applyBlockingRules(enabled ? blocklist : []);
}

// --- Pomodoro ---

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function startPomodoroPhase(phase, focusMin, breakMin) {
  const minutes = phase === "focus" ? focusMin : breakMin;
  const endTime = Date.now() + minutes * 60 * 1000;
  await chrome.storage.local.set({ pomodoro: { phase, endTime, focusMin, breakMin } });
  await chrome.alarms.create("pomodoro", { when: endTime });
  await setFocus(phase === "focus");
}

async function stopPomodoro() {
  await chrome.alarms.clear("pomodoro");
  await chrome.storage.local.set({ pomodoro: null });
  await setFocus(false);
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "watcher") {
    await checkAllWatches();
    return;
  }
  if (await handleAlertAlarm(alarm.name)) return;
  if (alarm.name !== "pomodoro") return;
  const { pomodoro, pomodoroStats } = await chrome.storage.local.get(["pomodoro", "pomodoroStats"]);
  if (!pomodoro) return;

  if (pomodoro.phase === "focus") {
    const stats = pomodoroStats || {};
    stats[todayKey()] = (stats[todayKey()] || 0) + 1;
    await chrome.storage.local.set({ pomodoroStats: stats });
    notify("Focus session complete! 🎉", `Time for a ${pomodoro.breakMin} minute break.`);
    await startPomodoroPhase("break", pomodoro.focusMin, pomodoro.breakMin);
  } else {
    notify("Break's over", "Start another focus session when you're ready.");
    await stopPomodoro();
  }
});

function notify(title, message, id) {
  chrome.notifications.create(id || crypto.randomUUID(), {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message,
    priority: 2
  });
}

// Clicking a watch notification opens the watched page and clears its flag.
chrome.notifications.onClicked.addListener(async (notifId) => {
  if (!notifId.startsWith("watch-")) return;
  const watchId = notifId.slice(6);
  const { watches = [] } = await chrome.storage.local.get("watches");
  const watch = watches.find((w) => w.id === watchId);
  if (watch) {
    chrome.tabs.create({ url: watch.url });
    watch.changed = false;
    await chrome.storage.local.set({ watches });
  }
  chrome.notifications.clear(notifId);
});

// --- Clipboard history ---

async function addClip(text, source) {
  text = (text || "").trim();
  if (!text) return;
  const { clips = [] } = await chrome.storage.local.get("clips");
  if (clips[0] && clips[0].text === text) return; // skip immediate duplicate
  clips.unshift({ id: crypto.randomUUID(), text: text.slice(0, 10000), source, at: Date.now(), pinned: false });
  // Trim unpinned entries beyond the cap.
  let unpinned = clips.filter((c) => !c.pinned).length;
  for (let i = clips.length - 1; i >= 0 && unpinned > MAX_CLIPS; i--) {
    if (!clips[i].pinned) {
      clips.splice(i, 1);
      unpinned--;
    }
  }
  await chrome.storage.local.set({ clips });
}

// --- Page watcher ---

async function ensureOffscreen() {
  const has = await chrome.offscreen.hasDocument();
  if (has) return;
  try {
    await chrome.offscreen.createDocument({
      url: "offscreen/offscreen.html",
      reasons: ["DOM_PARSER"],
      justification: "Fetch and parse watched pages to detect content changes"
    });
  } catch (e) {
    if (!String(e).includes("single offscreen")) throw e;
  }
}

async function fetchWatchValue(url, selector) {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({ target: "offscreen", type: "watch:fetch", url, selector });
}

async function checkWatch(id) {
  const { watches = [] } = await chrome.storage.local.get("watches");
  const watch = watches.find((w) => w.id === id);
  if (!watch) return;
  let result;
  try {
    result = await fetchWatchValue(watch.url, watch.selector);
  } catch (e) {
    result = { ok: false, error: String(e) };
  }
  watch.lastChecked = Date.now();
  if (result && result.ok) {
    watch.error = null;
    if (result.value !== watch.value) {
      watch.changed = true;
      notify(
        "👀 Watched content changed — click to open",
        `"${watch.title}"\n${watch.value} → ${result.value}`.slice(0, 200),
        "watch-" + watch.id
      );
      watch.value = result.value;
    }
  } else {
    watch.error = (result && result.error) || "Unknown error";
  }
  await chrome.storage.local.set({ watches });
}

async function checkAllWatches() {
  const { watches = [] } = await chrome.storage.local.get("watches");
  for (const w of watches) {
    await checkWatch(w.id);
  }
}

// --- Wellness & custom alerts ---

const PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

async function getAlerts() {
  const { alerts } = await chrome.storage.local.get("alerts");
  return alerts || DEFAULTS.alerts;
}

async function applyIntervalAlert(kind, cfg) {
  await chrome.alarms.clear("alert:" + kind);
  if (cfg && cfg.on) {
    chrome.alarms.create("alert:" + kind, { periodInMinutes: Math.max(1, Number(cfg.min) || 30) });
  }
}

async function clearNamazAlarms() {
  for (const p of PRAYERS) await chrome.alarms.clear("namaz:" + p);
  await chrome.alarms.clear("namaz:refresh");
}

async function refreshNamaz() {
  const alerts = await getAlerts();
  const nz = alerts.namaz;
  if (!nz || !nz.on) return;
  const now = new Date();
  const dateStr =
    String(now.getDate()).padStart(2, "0") + "-" +
    String(now.getMonth() + 1).padStart(2, "0") + "-" +
    now.getFullYear();
  try {
    const res = await fetch(
      `https://api.aladhan.com/v1/timingsByCity/${dateStr}` +
      `?city=${encodeURIComponent(nz.city)}&country=${encodeURIComponent(nz.country)}&method=1`
    );
    const data = await res.json();
    if (!data || data.code !== 200) throw new Error("city not found");
    nz.times = {};
    for (const p of PRAYERS) nz.times[p] = (data.data.timings[p] || "").slice(0, 5);
    nz.date = todayKey();
    nz.error = null;
    for (const p of PRAYERS) {
      const [h, m] = nz.times[p].split(":").map(Number);
      const when = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m).getTime();
      if (when > Date.now()) chrome.alarms.create("namaz:" + p, { when });
    }
  } catch (e) {
    nz.error = "Couldn't fetch prayer times — check the city/country spelling. (" + e.message + ")";
  }
  alerts.namaz = nz;
  await chrome.storage.local.set({ alerts });
  // refresh shortly after midnight for the next day's times
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 5).getTime();
  chrome.alarms.create("namaz:refresh", { when: midnight });
}

function nextTimeOccurrence(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const now = new Date();
  let when = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0).getTime();
  if (when <= Date.now()) when += 24 * 60 * 60 * 1000;
  return when;
}

async function resyncAlerts() {
  const alerts = await getAlerts();
  await applyIntervalAlert("water", alerts.water);
  await applyIntervalAlert("eye", alerts.eye);
  if (alerts.namaz && alerts.namaz.on) await refreshNamaz();
  const { customAlerts = [] } = await chrome.storage.local.get("customAlerts");
  for (const a of customAlerts) {
    chrome.alarms.create("custom:" + a.id, { when: nextTimeOccurrence(a.time) });
  }
}

async function handleAlertAlarm(name) {
  if (name === "alert:water") {
    notify("💧 Water break", "Time to drink a glass of water. Stay hydrated!");
    return true;
  }
  if (name === "alert:eye") {
    notify("👀 Eye break — 20·20·20", "Look at something 20 feet (6 m) away for 20 seconds.");
    return true;
  }
  if (name === "namaz:refresh") {
    await refreshNamaz();
    return true;
  }
  if (name.startsWith("namaz:")) {
    const prayer = name.slice(6);
    notify(`🕌 ${prayer} time`, `It's time for ${prayer} prayer.`);
    return true;
  }
  if (name.startsWith("custom:")) {
    const id = name.slice(7);
    const { customAlerts = [] } = await chrome.storage.local.get("customAlerts");
    const a = customAlerts.find((x) => x.id === id);
    if (a) {
      notify("⏰ " + a.label, a.daily ? `Daily reminder (${a.time})` : `Reminder (${a.time})`);
      if (a.daily) {
        chrome.alarms.create(name, { when: nextTimeOccurrence(a.time) });
      } else {
        await chrome.storage.local.set({ customAlerts: customAlerts.filter((x) => x.id !== id) });
      }
    }
    return true;
  }
  return false;
}

// --- Messages ---

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.target === "offscreen") return; // handled by the offscreen document
  (async () => {
    switch (msg.type) {
      case "focus:set":
        await setFocus(msg.enabled);
        break;
      case "focus:rulesChanged": {
        const { focusEnabled, blocklist } = await chrome.storage.local.get(["focusEnabled", "blocklist"]);
        if (focusEnabled) await applyBlockingRules(blocklist);
        break;
      }
      case "pomodoro:start":
        await startPomodoroPhase("focus", msg.focusMin, msg.breakMin);
        break;
      case "pomodoro:stop":
        await stopPomodoro();
        break;
      case "clip:add":
        await addClip(msg.text, sender.tab ? new URL(sender.tab.url).hostname : "");
        break;
      case "watch:add": {
        const { watches = [] } = await chrome.storage.local.get("watches");
        watches.unshift({
          id: crypto.randomUUID(),
          url: msg.url,
          title: msg.title || msg.url,
          selector: msg.selector,
          value: msg.value,
          lastChecked: Date.now(),
          changed: false,
          error: null
        });
        await chrome.storage.local.set({ watches });
        notify("Watch added ✓", `Now watching: ${msg.value}`.slice(0, 150));
        break;
      }
      case "watch:check":
        await checkWatch(msg.id);
        break;
      case "watch:checkAll":
        await checkAllWatches();
        break;
      case "alerts:update": {
        await chrome.storage.local.set({ alerts: msg.alerts });
        await applyIntervalAlert("water", msg.alerts.water);
        await applyIntervalAlert("eye", msg.alerts.eye);
        if (msg.alerts.namaz.on) await refreshNamaz();
        else await clearNamazAlarms();
        break;
      }
      case "alerts:customAdd": {
        const { customAlerts = [] } = await chrome.storage.local.get("customAlerts");
        const alert = { id: crypto.randomUUID(), label: msg.label, time: msg.time, daily: !!msg.daily };
        customAlerts.push(alert);
        await chrome.storage.local.set({ customAlerts });
        chrome.alarms.create("custom:" + alert.id, { when: nextTimeOccurrence(alert.time) });
        break;
      }
      case "alerts:customRemove": {
        const { customAlerts = [] } = await chrome.storage.local.get("customAlerts");
        await chrome.storage.local.set({ customAlerts: customAlerts.filter((x) => x.id !== msg.id) });
        await chrome.alarms.clear("custom:" + msg.id);
        break;
      }
      case "watch:setInterval": {
        const minutes = Math.max(1, Math.min(1440, Number(msg.minutes) || DEFAULT_WATCH_PERIOD_MIN));
        await chrome.storage.local.set({ watchInterval: minutes });
        await scheduleWatcherAlarm();
        break;
      }
    }
    sendResponse({ ok: true });
  })();
  return true; // keep channel open for async response
});
