// OmniKit background event page (Firefox): focus-mode blocking, pomodoro, clipboard history, page watcher.

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
    namaz: { on: false, city: "", country: "", times: null, date: null, error: null }
  },
  customAlerts: [], // [{ id, label, time: "HH:MM", daily }]
  // Always-on content scripts, user-switchable. `reporter` defaults OFF: it patches
  // console.error/window.onerror site-wide for the bug reporter, and Chrome attributes
  // ANY page's console.error calls made through that patch to OmniKit's own
  // chrome://extensions Errors panel (there's no way to intercept without this).
  // Off by default so it doesn't pollute that panel with noise from unrelated sites —
  // turn it on in Settings right before you need to capture a bug report.
  featureToggles: { clipboard: true, snippets: true, reporter: false, prayer: false }
};

// --- Always-on content scripts, registered dynamically so each one can be
// switched off by the user instead of running on every page unconditionally. ---

const CONTENT_SCRIPT_DEFS = {
  clipboard: {
    id: "ok-clip",
    js: ["content/clip.js"],
    matches: ["<all_urls>"],
    runAt: "document_idle"
  },
  snippets: {
    id: "ok-snippets",
    js: ["content/snippets.js"],
    matches: ["<all_urls>"],
    runAt: "document_idle",
    allFrames: true,
    matchOriginAsFallback: true
  },
  reporter: {
    id: "ok-reporter",
    js: ["content/reporter.js"],
    matches: ["<all_urls>"],
    runAt: "document_start",
    world: "MAIN"
  }
};

async function syncDynamicContentScripts() {
  const { featureToggles } = await chrome.storage.local.get("featureToggles");
  const toggles = { ...DEFAULTS.featureToggles, ...(featureToggles || {}) };
  const registered = await chrome.scripting.getRegisteredContentScripts();
  const registeredIds = new Set(registered.map((s) => s.id));
  for (const [key, def] of Object.entries(CONTENT_SCRIPT_DEFS)) {
    const wantOn = toggles[key] !== false;
    const isOn = registeredIds.has(def.id);
    if (wantOn && !isOn) {
      await chrome.scripting.registerContentScripts([{
        id: def.id,
        js: def.js,
        matches: def.matches,
        runAt: def.runAt,
        allFrames: def.allFrames,
        matchOriginAsFallback: def.matchOriginAsFallback,
        world: def.world,
        persistAcrossSessions: true
      }]);
    } else if (!wantOn && isOn) {
      await chrome.scripting.unregisterContentScripts({ ids: [def.id] });
    }
  }
}

async function scheduleWatcherAlarm() {
  const { watchInterval } = await chrome.storage.local.get("watchInterval");
  const minutes = Math.max(1, Math.min(1440, Number(watchInterval) || DEFAULT_WATCH_PERIOD_MIN));
  await chrome.alarms.create("watcher", { periodInMinutes: minutes });
}

async function resyncAll() {
  const { focusEnabled, blocklist } = await chrome.storage.local.get(["focusEnabled", "blocklist"]);
  await applyBlockingRules(focusEnabled ? blocklist : []);
  await scheduleWatcherAlarm();
  await resyncAlerts();
  await syncDynamicContentScripts();
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const init = {};
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (stored[key] === undefined) init[key] = value;
  }
  if (Object.keys(init).length) await chrome.storage.local.set(init);
  // Re-sync blocking rules, alarms, and content scripts with stored state after update/reload.
  await resyncAll();
});

chrome.runtime.onStartup.addListener(async () => {
  // Firefox does not persist alarms across browser restarts; recreate them.
  await scheduleWatcherAlarm();
  const { pomodoro } = await chrome.storage.local.get("pomodoro");
  if (pomodoro) await chrome.alarms.create("pomodoro", { when: Math.max(pomodoro.endTime, Date.now() + 1000) });
  await resyncAlerts();
  await syncDynamicContentScripts();
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
    message
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

// Firefox event pages have a DOM, so DOMParser is available here directly.
async function fetchWatchValue(url, selector) {
  try {
    if (!/^https?:\/\//i.test(url)) throw new Error("Only http(s) pages can be watched");
    const res = await fetch(url, { credentials: "omit", cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Strip <script>/<link> so parsing never triggers resource loads.
    const html = (await res.text())
      .replace(/<script\b[\s\S]*?<\/script>/gi, "")
      .replace(/<link\b[^>]*>/gi, "");
    const doc = new DOMParser().parseFromString(html, "text/html");
    const el = doc.querySelector(selector);
    if (!el) throw new Error("Element not found (selector may have changed)");
    return { ok: true, value: (el.textContent || "").trim().slice(0, 500) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
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
  if (!nz || !nz.on || !nz.city || !nz.country) return;
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
        if (typeof msg.text !== "string" || !sender.tab) break;
        await addClip(msg.text, new URL(sender.tab.url).hostname);
        break;
      case "watch:add": {
        if (!/^https?:\/\//i.test(msg.url || "")) break;
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
      case "settings:toggleFeature": {
        const { featureToggles = {} } = await chrome.storage.local.get("featureToggles");
        featureToggles[msg.key] = msg.enabled;
        await chrome.storage.local.set({ featureToggles });
        await syncDynamicContentScripts();
        break;
      }
      case "settings:resyncAll":
        await resyncAll();
        break;
    }
    sendResponse({ ok: true });
  })();
  return true; // keep channel open for async response
});
