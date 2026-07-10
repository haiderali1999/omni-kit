// OmniKit popup: HR tab — snippets, candidate clipper, onboarding checklists.
// (Uses $, showToast, escapeHtml, activeTab, isScriptablePage from popup.js.)

// ---------- subtab switching ----------
document.querySelectorAll(".subtab[data-hr]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".subtab[data-hr]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    for (const kind of ["snippets", "candidates", "checklists"]) {
      $("hr-" + kind).classList.toggle("hidden", kind !== btn.dataset.hr);
    }
  });
});

// ============================================================
// SNIPPETS
// ============================================================

let editingSnippetId = null;

function normalizeShortcut(s) {
  s = s.trim();
  if (!s) return "";
  if (!s.startsWith(";")) s = ";" + s;
  return s.replace(/[^;\w-]/g, "");
}

async function renderSnippets() {
  const { snippets = [] } = await chrome.storage.local.get("snippets");
  const list = $("snList");
  list.innerHTML = "";
  if (!snippets.length) {
    list.innerHTML = '<li><span class="meta">No snippets yet. Try shortcut ;reject with a rejection template.</span></li>';
    return;
  }
  for (const sn of snippets) {
    const li = document.createElement("li");
    const info = document.createElement("div");
    info.className = "grow";
    info.innerHTML =
      `<div><b>${escapeHtml(sn.shortcut)}</b> — ${escapeHtml(sn.title || "")}</div>` +
      `<div class="meta">${escapeHtml(sn.body.slice(0, 70))}${sn.body.length > 70 ? "…" : ""}</div>`;
    info.style.cursor = "pointer";
    info.title = "Click to copy the template";
    info.addEventListener("click", async () => {
      await navigator.clipboard.writeText(sn.body);
      showToast("Template copied ✓");
    });

    const edit = document.createElement("button");
    edit.className = "btn";
    edit.textContent = "✎";
    edit.title = "Edit";
    edit.addEventListener("click", () => {
      editingSnippetId = sn.id;
      $("snShortcut").value = sn.shortcut;
      $("snTitle").value = sn.title || "";
      $("snBody").value = sn.body;
      $("snCancel").classList.remove("hidden");
    });

    const del = document.createElement("button");
    del.className = "btn danger";
    del.textContent = "✕";
    del.addEventListener("click", async () => {
      const { snippets = [] } = await chrome.storage.local.get("snippets");
      await chrome.storage.local.set({ snippets: snippets.filter((x) => x.id !== sn.id) });
      renderSnippets();
    });

    li.append(info, edit, del);
    list.appendChild(li);
  }
}

$("snSave").addEventListener("click", async () => {
  const shortcut = normalizeShortcut($("snShortcut").value);
  const body = $("snBody").value;
  if (!shortcut || shortcut.length < 2) return showToast("Give the snippet a shortcut, e.g. ;reject");
  if (!body.trim()) return showToast("Snippet body is empty");
  const { snippets = [] } = await chrome.storage.local.get("snippets");
  const clash = snippets.find((s) => s.shortcut === shortcut && s.id !== editingSnippetId);
  if (clash) return showToast(`${shortcut} is already used`);
  if (editingSnippetId) {
    const sn = snippets.find((s) => s.id === editingSnippetId);
    if (sn) Object.assign(sn, { shortcut, title: $("snTitle").value.trim(), body });
  } else {
    snippets.push({ id: crypto.randomUUID(), shortcut, title: $("snTitle").value.trim(), body });
  }
  await chrome.storage.local.set({ snippets });
  editingSnippetId = null;
  $("snShortcut").value = $("snTitle").value = $("snBody").value = "";
  $("snCancel").classList.add("hidden");
  showToast("Snippet saved ✓");
  renderSnippets();
});

$("snCancel").addEventListener("click", () => {
  editingSnippetId = null;
  $("snShortcut").value = $("snTitle").value = $("snBody").value = "";
  $("snCancel").classList.add("hidden");
});

// ============================================================
// CANDIDATES
// ============================================================

const CANDIDATE_STATUSES = ["Screening", "Interviewed", "Offered", "Hired", "Rejected"];

async function renderCandidates() {
  const { candidates = [] } = await chrome.storage.local.get("candidates");
  const list = $("cdList");
  list.innerHTML = "";
  if (!candidates.length) {
    list.innerHTML = '<li><span class="meta">No candidates saved yet.</span></li>';
    return;
  }
  for (const c of candidates) {
    const li = document.createElement("li");
    const info = document.createElement("div");
    info.className = "grow";
    info.innerHTML =
      `<div>${escapeHtml(c.name)}</div>` +
      `<div class="meta">${escapeHtml((c.note || "").slice(0, 60))}</div>` +
      `<div class="meta">${new Date(c.at).toLocaleDateString()}</div>`;
    info.style.cursor = "pointer";
    info.title = "Open profile page";
    info.addEventListener("click", () => chrome.tabs.create({ url: c.url }));

    const status = document.createElement("select");
    status.style.width = "auto";
    for (const s of CANDIDATE_STATUSES) {
      const opt = document.createElement("option");
      opt.textContent = s;
      opt.selected = c.status === s;
      status.appendChild(opt);
    }
    status.addEventListener("change", async () => {
      const { candidates = [] } = await chrome.storage.local.get("candidates");
      const x = candidates.find((y) => y.id === c.id);
      if (x) x.status = status.value;
      await chrome.storage.local.set({ candidates });
    });

    const del = document.createElement("button");
    del.className = "btn danger";
    del.textContent = "✕";
    del.addEventListener("click", async () => {
      const { candidates = [] } = await chrome.storage.local.get("candidates");
      await chrome.storage.local.set({ candidates: candidates.filter((x) => x.id !== c.id) });
      renderCandidates();
    });

    li.append(info, status, del);
    list.appendChild(li);
  }
}

$("cdAdd").addEventListener("click", async () => {
  const tab = await activeTab();
  if (!tab) return;
  let note = $("cdNote").value.trim();
  if (!note && isScriptablePage(tab)) {
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => getSelection().toString()
      });
      note = (result || "").trim().slice(0, 300);
    } catch {
      // page not inspectable — note stays empty
    }
  }
  const name = $("cdName").value.trim() || (tab.title || "Unknown").split(/[-|–—]/)[0].trim().slice(0, 60);
  const { candidates = [] } = await chrome.storage.local.get("candidates");
  candidates.unshift({
    id: crypto.randomUUID(),
    name,
    url: tab.url,
    pageTitle: tab.title,
    note,
    status: "Screening",
    at: Date.now()
  });
  await chrome.storage.local.set({ candidates });
  $("cdName").value = $("cdNote").value = "";
  showToast(`Saved ${name} ✓`);
  renderCandidates();
});

$("cdExport").addEventListener("click", async () => {
  const { candidates = [] } = await chrome.storage.local.get("candidates");
  if (!candidates.length) return showToast("Nothing to export");
  const esc = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const rows = [["Name", "Status", "Note", "URL", "Page title", "Saved"].map(esc).join(",")];
  for (const c of candidates) {
    rows.push([c.name, c.status, c.note, c.url, c.pageTitle, new Date(c.at).toISOString().slice(0, 10)].map(esc).join(","));
  }
  const blob = new Blob(["﻿" + rows.join("\r\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.download = `candidates-${new Date().toISOString().slice(0, 10)}.csv`;
  a.href = URL.createObjectURL(blob);
  a.click();
});

// ============================================================
// CHECKLISTS
// ============================================================

async function renderChecklists() {
  const { checklistTemplates = [], checklists = [] } = await chrome.storage.local.get([
    "checklistTemplates", "checklists"
  ]);

  const tplList = $("clTplList");
  tplList.innerHTML = "";
  if (!checklistTemplates.length) {
    tplList.innerHTML = '<li><span class="meta">No templates yet.</span></li>';
  }
  for (const tpl of checklistTemplates) {
    const li = document.createElement("li");
    const info = document.createElement("div");
    info.className = "grow";
    info.innerHTML = `<div>${escapeHtml(tpl.name)}</div><div class="meta">${tpl.items.length} items</div>`;

    const start = document.createElement("button");
    start.className = "btn primary";
    start.textContent = "Start";
    start.addEventListener("click", async () => {
      const { checklists = [] } = await chrome.storage.local.get("checklists");
      checklists.unshift({
        id: crypto.randomUUID(),
        name: `${tpl.name} — ${new Date().toLocaleDateString()}`,
        items: tpl.items.map((text) => ({ text, done: false })),
        at: Date.now()
      });
      await chrome.storage.local.set({ checklists });
      renderChecklists();
      showToast("Checklist started ✓");
    });

    const del = document.createElement("button");
    del.className = "btn danger";
    del.textContent = "✕";
    del.addEventListener("click", async () => {
      const { checklistTemplates = [] } = await chrome.storage.local.get("checklistTemplates");
      await chrome.storage.local.set({ checklistTemplates: checklistTemplates.filter((t) => t.id !== tpl.id) });
      renderChecklists();
    });

    li.append(info, start, del);
    tplList.appendChild(li);
  }

  const active = $("clActive");
  active.innerHTML = "";
  if (!checklists.length) {
    active.innerHTML = '<p class="dim">No active checklists.</p>';
    return;
  }
  for (const cl of checklists) {
    const doneCount = cl.items.filter((i) => i.done).length;
    const box = document.createElement("div");
    box.className = "checklist";

    const head = document.createElement("div");
    head.className = "row";
    head.innerHTML = `<b class="grow">${escapeHtml(cl.name)}</b><span class="dim">${doneCount}/${cl.items.length}</span>`;
    const del = document.createElement("button");
    del.className = "btn danger";
    del.textContent = "✕";
    del.addEventListener("click", async () => {
      const { checklists = [] } = await chrome.storage.local.get("checklists");
      await chrome.storage.local.set({ checklists: checklists.filter((x) => x.id !== cl.id) });
      renderChecklists();
    });
    head.appendChild(del);
    box.appendChild(head);

    for (const [idx, item] of cl.items.entries()) {
      const label = document.createElement("label");
      label.className = "check-item" + (item.done ? " done" : "");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = item.done;
      cb.addEventListener("change", async () => {
        const { checklists = [] } = await chrome.storage.local.get("checklists");
        const x = checklists.find((y) => y.id === cl.id);
        if (x) x.items[idx].done = cb.checked;
        await chrome.storage.local.set({ checklists });
        renderChecklists();
      });
      label.append(cb, document.createTextNode(" " + item.text));
      box.appendChild(label);
    }
    active.appendChild(box);
  }
}

$("clSaveTpl").addEventListener("click", async () => {
  const name = $("clName").value.trim();
  const items = $("clItems").value.split("\n").map((s) => s.trim()).filter(Boolean);
  if (!name) return showToast("Give the template a name");
  if (!items.length) return showToast("Add at least one item");
  const { checklistTemplates = [] } = await chrome.storage.local.get("checklistTemplates");
  checklistTemplates.push({ id: crypto.randomUUID(), name, items });
  await chrome.storage.local.set({ checklistTemplates });
  $("clName").value = $("clItems").value = "";
  showToast("Template saved ✓");
  renderChecklists();
});

// ---------- init ----------
renderSnippets();
renderCandidates();
renderChecklists();
