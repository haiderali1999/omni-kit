// OmniKit popup: Settings tab — always-on feature toggles + full data backup/restore.
// (Uses $, showToast from popup.js.)

const FEATURE_TOGGLE_IDS = {
  clipboard: "toggleClipboard",
  snippets: "toggleSnippets",
  reporter: "toggleReporter",
  prayer: "togglePrayer"
};

async function renderFeatureToggles() {
  const { featureToggles = {} } = await chrome.storage.local.get("featureToggles");
  for (const [key, elId] of Object.entries(FEATURE_TOGGLE_IDS)) {
    // prayer is opt-in (off unless explicitly enabled); the rest default on except reporter
    $(elId).checked = key === "prayer" || key === "reporter" ? featureToggles[key] === true : featureToggles[key] !== false;
  }
}

for (const [key, elId] of Object.entries(FEATURE_TOGGLE_IDS)) {
  $(elId).addEventListener("change", (e) => {
    chrome.runtime.sendMessage({ type: "settings:toggleFeature", key, enabled: e.target.checked });
    if (key === "prayer" && !e.target.checked) {
      // turning the feature off also stops the alarms and the network calls
      loadAlertConfig().then((a) => {
        a.namaz.on = false;
        return chrome.runtime.sendMessage({ type: "alerts:update", alerts: a });
      });
    }
  });
}

// ---------- export ----------

$("dataExport").addEventListener("click", async () => {
  const data = await chrome.storage.local.get(null);
  const payload = { omnikit: true, exportedAt: new Date().toISOString(), data };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.download = `omnikit-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.href = URL.createObjectURL(blob);
  a.click();
  showToast("Exported ✓");
});

// ---------- import ----------

$("dataImportBtn").addEventListener("click", () => $("dataImportFile").click());

$("dataImportFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch (err) {
    showToast("Not a valid JSON file");
    return;
  }
  const data = parsed && parsed.omnikit ? parsed.data : parsed;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    showToast("Not a recognized OmniKit backup file");
    return;
  }
  if (!confirm("This replaces ALL current OmniKit data on this device with the file's contents. Continue?")) {
    return;
  }
  // Drop one-shot hand-off keys; they are never part of a legitimate backup.
  for (const k of Object.keys(data)) if (k.startsWith("pending")) delete data[k];
  await chrome.storage.local.clear();
  await chrome.storage.local.set(data);
  await chrome.runtime.sendMessage({ type: "settings:resyncAll" });
  showToast("Imported ✓ — reloading…");
  setTimeout(() => location.reload(), 600);
});

// ---------- init ----------
renderFeatureToggles();
