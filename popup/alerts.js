// OmniKit popup: alerts tab — namaz, water, eye breaks, meeting/custom alerts.
// (Uses $, showToast, escapeHtml from popup.js.)

const ALERT_PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

const ALERT_DEFAULTS = {
  water: { on: false, min: 60 },
  eye: { on: false, min: 20 },
  namaz: { on: false, city: "Karachi", country: "Pakistan", times: null, date: null, error: null }
};

async function loadAlertConfig() {
  const { alerts } = await chrome.storage.local.get("alerts");
  return Object.assign({}, ALERT_DEFAULTS, alerts || {});
}

async function renderAlertsPanel() {
  const a = await loadAlertConfig();
  $("namazToggle").checked = !!a.namaz.on;
  if (document.activeElement !== $("namazCity")) $("namazCity").value = a.namaz.city || "";
  if (document.activeElement !== $("namazCountry")) $("namazCountry").value = a.namaz.country || "";
  $("waterToggle").checked = !!a.water.on;
  $("waterMin").value = a.water.min;
  $("eyeToggle").checked = !!a.eye.on;
  $("eyeMin").value = a.eye.min;

  const box = $("namazTimes");
  const status = $("namazStatus");
  const today = new Date().toISOString().slice(0, 10);
  if (a.namaz.on && a.namaz.times && a.namaz.date === today) {
    const now = new Date();
    const nowHm = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
    const next = ALERT_PRAYERS.find((p) => a.namaz.times[p] > nowHm);
    box.innerHTML = ALERT_PRAYERS.map((p) =>
      `<div class="pt${p === next ? " next" : ""}"><span class="pname">${p}</span><span class="ptime">${a.namaz.times[p]}</span></div>`
    ).join("");
    status.textContent = `Times for ${a.namaz.city} (AlAdhan API, Univ. of Karachi method).`;
  } else {
    box.innerHTML = "";
    status.textContent = a.namaz.error
      ? "⚠ " + a.namaz.error
      : a.namaz.on
        ? "Fetching today's prayer times…"
        : "Turn on to get a notification at each prayer time.";
  }
}

async function pushAlertConfig() {
  const a = await loadAlertConfig();
  a.namaz.on = $("namazToggle").checked;
  a.namaz.city = $("namazCity").value.trim() || "Karachi";
  a.namaz.country = $("namazCountry").value.trim() || "Pakistan";
  a.water = { on: $("waterToggle").checked, min: Math.max(5, parseInt($("waterMin").value, 10) || 60) };
  a.eye = { on: $("eyeToggle").checked, min: Math.max(5, parseInt($("eyeMin").value, 10) || 20) };
  await chrome.runtime.sendMessage({ type: "alerts:update", alerts: a });
  renderAlertsPanel();
}

for (const id of ["namazToggle", "namazCity", "namazCountry", "waterToggle", "waterMin", "eyeToggle", "eyeMin"]) {
  $(id).addEventListener("change", pushAlertConfig);
}

// custom / meeting alerts
async function renderCustomAlerts() {
  const { customAlerts = [] } = await chrome.storage.local.get("customAlerts");
  const list = $("alertList");
  list.innerHTML = "";
  if (!customAlerts.length) {
    list.innerHTML = '<li><span class="meta">No custom alerts yet.</span></li>';
    return;
  }
  for (const a of customAlerts) {
    const li = document.createElement("li");
    const info = document.createElement("div");
    info.className = "grow";
    info.innerHTML =
      `<div>⏰ ${escapeHtml(a.label)}</div>` +
      `<div class="meta">${a.time} · ${a.daily ? "daily" : "once"}</div>`;
    const del = document.createElement("button");
    del.className = "btn danger";
    del.textContent = "✕";
    del.addEventListener("click", async () => {
      await chrome.runtime.sendMessage({ type: "alerts:customRemove", id: a.id });
      renderCustomAlerts();
    });
    li.append(info, del);
    list.appendChild(li);
  }
}

$("alertAdd").addEventListener("click", async () => {
  const label = $("alertLabel").value.trim();
  const time = $("alertTime").value;
  if (!label) return showToast("Give the alert a label");
  if (!time) return showToast("Pick a time");
  await chrome.runtime.sendMessage({
    type: "alerts:customAdd",
    label,
    time,
    daily: $("alertDaily").checked
  });
  $("alertLabel").value = "";
  showToast(`Alert set for ${time} ✓`);
  renderCustomAlerts();
});

// live-update prayer times once the background fetch completes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.alerts) renderAlertsPanel();
});

renderAlertsPanel();
renderCustomAlerts();
