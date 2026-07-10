// OmniKit popup: cookies / localStorage / sessionStorage manager for the active tab.
// (Uses $, activeTab, isScriptablePage, escapeHtml from popup.js.)

let storeKind = "cookies"; // 'cookies' | 'local' | 'session'

document.querySelectorAll(".subtab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".subtab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    storeKind = btn.dataset.store;
    renderStore();
  });
});

// Runs inside the page; must be self-contained.
function pageStorageEntries(which) {
  const s = which === "local" ? localStorage : sessionStorage;
  return Object.keys(s).map((k) => [k, s.getItem(k)]);
}
function pageStorageSet(which, key, value) {
  (which === "local" ? localStorage : sessionStorage).setItem(key, value);
}
function pageStorageRemove(which, key) {
  (which === "local" ? localStorage : sessionStorage).removeItem(key);
}

async function getEntries() {
  const tab = await activeTab();
  if (!tab) return { tab, entries: [], err: "No active tab" };
  if (storeKind === "cookies") {
    if (!/^https?:/.test(tab.url || "")) return { tab, entries: [], err: "Cookies unavailable for this page" };
    const cookies = await chrome.cookies.getAll({ url: tab.url });
    return { tab, entries: cookies.map((c) => [c.name, c.value]) };
  }
  if (!isScriptablePage(tab)) return { tab, entries: [], err: "Storage unavailable for this page" };
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: pageStorageEntries,
      args: [storeKind]
    });
    return { tab, entries: result || [] };
  } catch (e) {
    return { tab, entries: [], err: e.message };
  }
}

async function renderStore() {
  const { tab, entries, err } = await getEntries();
  $("storageScope").textContent = tab ? `Scope: ${(() => { try { return new URL(tab.url).hostname; } catch { return tab.url; } })()}` : "";
  const list = $("storeList");
  list.innerHTML = "";
  if (err) {
    list.innerHTML = `<li><span class="meta">${escapeHtml(err)}</span></li>`;
    return;
  }
  if (!entries.length) {
    list.innerHTML = '<li><span class="meta">No entries.</span></li>';
    return;
  }
  for (const [key, value] of entries) {
    const li = document.createElement("li");

    const k = document.createElement("span");
    k.className = "store-key";
    k.textContent = key;
    k.title = key;

    const v = document.createElement("span");
    v.className = "store-val";
    v.textContent = value;
    v.title = "Click to edit";
    v.addEventListener("click", () => {
      $("storeKey").value = key;
      $("storeValue").value = value;
    });

    const copy = document.createElement("button");
    copy.className = "btn";
    copy.textContent = "⧉";
    copy.title = "Copy value";
    copy.addEventListener("click", async () => {
      await navigator.clipboard.writeText(value);
      showToast("Value copied ✓");
    });

    const del = document.createElement("button");
    del.className = "btn danger";
    del.textContent = "✕";
    del.addEventListener("click", async () => {
      const tab = await activeTab();
      if (storeKind === "cookies") {
        await chrome.cookies.remove({ url: tab.url, name: key });
      } else {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: pageStorageRemove,
          args: [storeKind, key]
        });
      }
      renderStore();
    });

    li.append(k, v, copy, del);
    list.appendChild(li);
  }
}

$("storeSave").addEventListener("click", async () => {
  const key = $("storeKey").value;
  const value = $("storeValue").value;
  if (!key) return;
  const tab = await activeTab();
  if (storeKind === "cookies") {
    await chrome.cookies.set({ url: tab.url, name: key, value });
  } else {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: pageStorageSet,
      args: [storeKind, key, value]
    });
  }
  $("storeKey").value = "";
  $("storeValue").value = "";
  renderStore();
});

$("storeExport").addEventListener("click", async () => {
  const { tab, entries } = await getEntries();
  const domain = (() => { try { return new URL(tab.url).hostname; } catch { return "page"; } })();
  const blob = new Blob([JSON.stringify(Object.fromEntries(entries), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${domain}-${storeKind}.json`;
  a.click();
});

$("storeImport").addEventListener("click", () => $("storeImportFile").click());

$("storeImportFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const tab = await activeTab();
    for (const [key, value] of Object.entries(data)) {
      if (storeKind === "cookies") {
        await chrome.cookies.set({ url: tab.url, name: key, value: String(value) });
      } else {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: pageStorageSet,
          args: [storeKind, key, String(value)]
        });
      }
    }
    renderStore();
  } catch (err) {
    alert("Import failed: " + err.message);
  }
  e.target.value = "";
});

renderStore();
