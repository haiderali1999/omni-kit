// OmniKit popup: page watcher tab. (Uses $, activeTab, isScriptablePage from popup.js.)

async function renderWatches() {
  const { watches = [] } = await chrome.storage.local.get("watches");
  const list = $("watchList");
  list.innerHTML = "";
  if (!watches.length) {
    list.innerHTML = '<li><span class="meta">No watches yet. Open a page and pick an element to track.</span></li>';
    return;
  }
  for (const w of watches) {
    const li = document.createElement("li");
    if (w.changed) li.classList.add("watch-changed");

    const info = document.createElement("div");
    info.className = "grow";
    const domain = (() => { try { return new URL(w.url).hostname; } catch { return ""; } })();
    info.innerHTML =
      `<div title="${w.title.replace(/"/g, "&quot;")}">${w.changed ? "🔔 " : ""}${escapeHtml(w.title.slice(0, 50))}</div>` +
      `<div class="watch-value">${escapeHtml((w.value || "").slice(0, 60))}</div>` +
      `<div class="meta">${domain} · checked ${w.lastChecked ? new Date(w.lastChecked).toLocaleTimeString() : "never"}</div>` +
      (w.error ? `<div class="watch-error">⚠ ${escapeHtml(w.error)}</div>` : "");
    info.style.cursor = "pointer";
    info.title = "Open page";
    info.addEventListener("click", async () => {
      chrome.tabs.create({ url: w.url });
      if (w.changed) {
        const { watches = [] } = await chrome.storage.local.get("watches");
        const x = watches.find((y) => y.id === w.id);
        if (x) x.changed = false;
        await chrome.storage.local.set({ watches });
      }
    });

    const check = document.createElement("button");
    check.className = "btn";
    check.textContent = "↻";
    check.title = "Check now";
    check.addEventListener("click", async () => {
      check.textContent = "…";
      await chrome.runtime.sendMessage({ type: "watch:check", id: w.id });
      renderWatches();
    });

    const del = document.createElement("button");
    del.className = "btn danger";
    del.textContent = "✕";
    del.addEventListener("click", async () => {
      const { watches = [] } = await chrome.storage.local.get("watches");
      await chrome.storage.local.set({ watches: watches.filter((x) => x.id !== w.id) });
      renderWatches();
    });

    li.append(info, check, del);
    list.appendChild(li);
  }
}

$("watchPick").addEventListener("click", async () => {
  const tab = await activeTab();
  if (!isScriptablePage(tab)) return alert("Can't pick elements on this page.");
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content/picker.js"] });
  window.close(); // let the user click the element on the page
});

// interval setting: load saved value, apply on change
(async () => {
  const { watchInterval = 30 } = await chrome.storage.local.get("watchInterval");
  $("watchIntervalMin").value = watchInterval;
})();

$("watchIntervalMin").addEventListener("change", async (e) => {
  let minutes = Math.max(1, Math.min(1440, parseInt(e.target.value, 10) || 30));
  e.target.value = minutes;
  await chrome.runtime.sendMessage({ type: "watch:setInterval", minutes });
  showToast(`Checking every ${minutes} min ✓`);
});

$("watchCheckAll").addEventListener("click", async (e) => {
  e.target.textContent = "Checking…";
  await chrome.runtime.sendMessage({ type: "watch:checkAll" });
  e.target.textContent = "Check all now";
  renderWatches();
});

// live-update the list when the background finishes a check
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.watches) renderWatches();
});

renderWatches();
