// OmniKit popup: dev tools, tab/session manager, focus mode UI.

const $ = (id) => document.getElementById(id);

// ---------- Tab navigation ----------
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $("panel-" + btn.dataset.panel).classList.add("active");
  });
});

// ============================================================
// DEV TOOLS
// ============================================================

$("devTool").addEventListener("change", (e) => {
  document.querySelectorAll(".tool").forEach((t) => t.classList.add("hidden"));
  $("tool-" + e.target.value).classList.remove("hidden");
});

function setOutput(el, text, isError = false) {
  el.textContent = text;
  el.classList.toggle("error", isError);
}

// Global "Copied ✓" toast, shared by all tabs.
const toastEl = document.createElement("div");
toastEl.id = "toast";
document.body.appendChild(toastEl);
let toastTimer = null;

function showToast(msg = "Copied ✓") {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1400);
}

async function copyText(text, btn) {
  if (!text) return;
  await navigator.clipboard.writeText(text);
  showToast();
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => (btn.textContent = orig), 1200);
  }
}

// JSON
$("jsonPretty").addEventListener("click", () => {
  try {
    setOutput($("jsonOutput"), JSON.stringify(JSON.parse($("jsonInput").value), null, 2));
  } catch (e) {
    setOutput($("jsonOutput"), "Invalid JSON: " + e.message, true);
  }
});
$("jsonMinify").addEventListener("click", () => {
  try {
    setOutput($("jsonOutput"), JSON.stringify(JSON.parse($("jsonInput").value)));
  } catch (e) {
    setOutput($("jsonOutput"), "Invalid JSON: " + e.message, true);
  }
});
$("jsonCopy").addEventListener("click", (e) => copyText($("jsonOutput").textContent, e.target));

// JWT
function b64UrlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return decodeURIComponent(
    atob(str).split("").map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")
  );
}
$("jwtDecode").addEventListener("click", () => {
  try {
    const parts = $("jwtInput").value.trim().split(".");
    if (parts.length !== 3) throw new Error("A JWT has 3 dot-separated parts");
    const header = JSON.parse(b64UrlDecode(parts[0]));
    const payload = JSON.parse(b64UrlDecode(parts[1]));
    let out = "HEADER\n" + JSON.stringify(header, null, 2) + "\n\nPAYLOAD\n" + JSON.stringify(payload, null, 2);
    if (payload.exp) {
      const exp = new Date(payload.exp * 1000);
      out += `\n\nexp → ${exp.toLocaleString()} (${exp < new Date() ? "EXPIRED" : "valid"})`;
    }
    setOutput($("jwtOutput"), out);
  } catch (e) {
    setOutput($("jwtOutput"), "Invalid JWT: " + e.message, true);
  }
});

// Base64 (unicode-safe)
$("b64Encode").addEventListener("click", () => {
  try {
    const bytes = new TextEncoder().encode($("b64Input").value);
    setOutput($("b64Output"), btoa(String.fromCharCode(...bytes)));
  } catch (e) {
    setOutput($("b64Output"), e.message, true);
  }
});
$("b64Decode").addEventListener("click", () => {
  try {
    const bin = atob($("b64Input").value.trim());
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    setOutput($("b64Output"), new TextDecoder().decode(bytes));
  } catch (e) {
    setOutput($("b64Output"), "Invalid Base64: " + e.message, true);
  }
});
$("b64Copy").addEventListener("click", (e) => copyText($("b64Output").textContent, e.target));

// URL
$("urlEncode").addEventListener("click", () => setOutput($("urlOutput"), encodeURIComponent($("urlInput").value)));
$("urlDecode").addEventListener("click", () => {
  try {
    setOutput($("urlOutput"), decodeURIComponent($("urlInput").value));
  } catch (e) {
    setOutput($("urlOutput"), "Invalid encoding: " + e.message, true);
  }
});
$("urlCopy").addEventListener("click", (e) => copyText($("urlOutput").textContent, e.target));

// UUID
$("uuidGen").addEventListener("click", () => setOutput($("uuidOutput"), crypto.randomUUID()));
$("uuidCopy").addEventListener("click", (e) => copyText($("uuidOutput").textContent, e.target));

// Timestamp
function formatTs(date) {
  return [
    `Local:   ${date.toLocaleString()}`,
    `ISO:     ${date.toISOString()}`,
    `Epoch s: ${Math.floor(date.getTime() / 1000)}`,
    `Epoch ms:${date.getTime()}`
  ].join("\n");
}
$("tsNow").addEventListener("click", () => setOutput($("tsOutput"), formatTs(new Date())));
$("tsConvert").addEventListener("click", () => {
  const val = $("tsInput").value.trim();
  let date;
  if (/^\d+$/.test(val)) {
    const n = parseInt(val, 10);
    date = new Date(val.length <= 10 ? n * 1000 : n);
  } else {
    date = new Date(val);
  }
  if (isNaN(date.getTime())) setOutput($("tsOutput"), "Could not parse that as a timestamp or date.", true);
  else setOutput($("tsOutput"), formatTs(date));
});

// Color
function parseColor(str) {
  str = str.trim();
  let m;
  if ((m = str.match(/^#?([0-9a-f]{6})$/i))) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  if ((m = str.match(/^#?([0-9a-f]{3})$/i))) {
    return [...m[1]].map((c) => parseInt(c + c, 16));
  }
  if ((m = str.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i))) {
    return [+m[1], +m[2], +m[3]];
  }
  if ((m = str.match(/^hsla?\(\s*(\d+)[,\s]+(\d+)%[,\s]+(\d+)%/i))) {
    return hslToRgb(+m[1], +m[2], +m[3]);
  }
  return null;
}
function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}
function showColor(rgb) {
  const [r, g, b] = rgb;
  const hex = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  const [h, s, l] = rgbToHsl(r, g, b);
  setOutput($("colorOutput"), `HEX: ${hex}\nRGB: rgb(${r}, ${g}, ${b})\nHSL: hsl(${h}, ${s}%, ${l}%)`);
  $("colorPicker").value = hex;
}
$("colorConvert").addEventListener("click", () => {
  const rgb = parseColor($("colorInput").value);
  if (!rgb) setOutput($("colorOutput"), "Could not parse color. Try #4f8cff, rgb(79,140,255), or hsl(219,100%,65%).", true);
  else showColor(rgb);
});
$("colorPicker").addEventListener("input", (e) => showColor(parseColor(e.target.value)));

// ============================================================
// TABS / SESSIONS
// ============================================================

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function refreshTabStats() {
  const tabs = await chrome.tabs.query({});
  $("tabCount").textContent = tabs.length;
  const seen = new Set();
  let dups = 0;
  for (const t of tabs) {
    if (seen.has(t.url)) dups++;
    else seen.add(t.url);
  }
  $("dupCount").textContent = dups;
}

$("closeDups").addEventListener("click", async () => {
  const tabs = await chrome.tabs.query({});
  const seen = new Set();
  const toClose = [];
  for (const t of tabs) {
    if (seen.has(t.url)) toClose.push(t.id);
    else seen.add(t.url);
  }
  if (toClose.length) await chrome.tabs.remove(toClose);
  refreshTabStats();
});

$("groupByDomain").addEventListener("click", async () => {
  const tabs = await chrome.tabs.query({ currentWindow: true, pinned: false });
  const byDomain = {};
  for (const t of tabs) {
    const d = domainOf(t.url);
    if (!d) continue;
    (byDomain[d] ||= []).push(t.id);
  }
  for (const [domain, ids] of Object.entries(byDomain)) {
    if (ids.length < 2) continue;
    const groupId = await chrome.tabs.group({ tabIds: ids });
    await chrome.tabGroups.update(groupId, { title: domain });
  }
});

async function renderSessions() {
  const { sessions = [] } = await chrome.storage.local.get("sessions");
  const list = $("sessionList");
  list.innerHTML = "";
  if (!sessions.length) {
    list.innerHTML = '<li><span class="meta">No saved sessions yet.</span></li>';
    return;
  }
  for (const s of sessions) {
    const li = document.createElement("li");
    const info = document.createElement("div");
    info.className = "grow";
    info.innerHTML = `<div>${escapeHtml(s.name)}</div><div class="meta">${s.tabs.length} tabs · ${new Date(s.savedAt).toLocaleDateString()}</div>`;
    const restore = document.createElement("button");
    restore.className = "btn";
    restore.textContent = "Restore";
    restore.addEventListener("click", async () => {
      const urls = s.tabs.map((t) => t.url).filter((u) => /^https?:/.test(u));
      if (urls.length) await chrome.windows.create({ url: urls });
    });
    const del = document.createElement("button");
    del.className = "btn danger";
    del.textContent = "✕";
    del.addEventListener("click", async () => {
      const { sessions = [] } = await chrome.storage.local.get("sessions");
      await chrome.storage.local.set({ sessions: sessions.filter((x) => x.id !== s.id) });
      renderSessions();
    });
    li.append(info, restore, del);
    list.appendChild(li);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

$("saveSession").addEventListener("click", async () => {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const name = $("sessionName").value.trim() || `Session ${new Date().toLocaleString()}`;
  const { sessions = [] } = await chrome.storage.local.get("sessions");
  sessions.unshift({
    id: crypto.randomUUID(),
    name,
    savedAt: Date.now(),
    tabs: tabs.map((t) => ({ url: t.url, title: t.title }))
  });
  await chrome.storage.local.set({ sessions });
  $("sessionName").value = "";
  renderSessions();
});

// ============================================================
// FOCUS MODE + POMODORO
// ============================================================

async function renderBlocklist() {
  const { blocklist = [] } = await chrome.storage.local.get("blocklist");
  const list = $("blockList");
  list.innerHTML = "";
  for (const domain of blocklist) {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.className = "grow";
    span.textContent = domain;
    const del = document.createElement("button");
    del.className = "btn danger";
    del.textContent = "✕";
    del.addEventListener("click", async () => {
      const { blocklist = [] } = await chrome.storage.local.get("blocklist");
      await chrome.storage.local.set({ blocklist: blocklist.filter((d) => d !== domain) });
      chrome.runtime.sendMessage({ type: "focus:rulesChanged" });
      renderBlocklist();
    });
    li.append(span, del);
    list.appendChild(li);
  }
}

$("blockAdd").addEventListener("click", async () => {
  let domain = $("blockInput").value.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  if (!domain || !domain.includes(".")) return;
  const { blocklist = [] } = await chrome.storage.local.get("blocklist");
  if (!blocklist.includes(domain)) {
    blocklist.push(domain);
    await chrome.storage.local.set({ blocklist });
    chrome.runtime.sendMessage({ type: "focus:rulesChanged" });
  }
  $("blockInput").value = "";
  renderBlocklist();
});

$("blockInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("blockAdd").click();
});

$("focusToggle").addEventListener("change", (e) => {
  chrome.runtime.sendMessage({ type: "focus:set", enabled: e.target.checked });
});

$("pomodoroStart").addEventListener("click", async () => {
  const focusMin = Math.max(1, parseInt($("focusMin").value, 10) || 25);
  const breakMin = Math.max(1, parseInt($("breakMin").value, 10) || 5);
  await chrome.runtime.sendMessage({ type: "pomodoro:start", focusMin, breakMin });
  renderFocusState();
});

$("pomodoroStop").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "pomodoro:stop" });
  renderFocusState();
});

let timerInterval = null;

async function renderFocusState() {
  const { focusEnabled, pomodoro, pomodoroStats = {} } = await chrome.storage.local.get([
    "focusEnabled", "pomodoro", "pomodoroStats"
  ]);
  $("focusToggle").checked = !!focusEnabled;
  const today = new Date().toISOString().slice(0, 10);
  const done = pomodoroStats[today] || 0;
  $("todayStats").textContent = done ? `🍅 ${done} focus session${done > 1 ? "s" : ""} completed today` : "";

  clearInterval(timerInterval);
  if (pomodoro && pomodoro.endTime > Date.now()) {
    $("pomodoroTimer").classList.remove("hidden");
    $("pomodoroStop").classList.remove("hidden");
    $("pomodoroStart").classList.add("hidden");
    $("timerPhase").textContent = pomodoro.phase === "focus" ? "Focus" : "Break";
    const tick = () => {
      const ms = pomodoro.endTime - Date.now();
      if (ms <= 0) {
        renderFocusState();
        return;
      }
      const min = Math.floor(ms / 60000);
      const sec = Math.floor((ms % 60000) / 1000);
      $("timerRemaining").textContent = `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    };
    tick();
    timerInterval = setInterval(tick, 1000);
  } else {
    $("pomodoroTimer").classList.add("hidden");
    $("pomodoroStop").classList.add("hidden");
    $("pomodoroStart").classList.remove("hidden");
  }
}

// ============================================================
// HEADER TOOLBAR: screenshot + CSS peeper
// ============================================================

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isScriptablePage(tab) {
  return tab && /^(https?|file):/.test(tab.url || "");
}

async function startCapture(fullPage) {
  try {
    const tab = await activeTab();
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });
    await chrome.storage.local.set({
      pendingShot: dataUrl,
      pendingShotTab: tab ? { tabId: tab.id, windowId: tab.windowId } : null,
      pendingFullPage: !!fullPage
    });
    chrome.tabs.create({ url: chrome.runtime.getURL("screenshot/annotate.html") });
    window.close();
  } catch (e) {
    alert("Can't capture this page: " + e.message);
  }
}

$("captureBtn").addEventListener("click", () => startCapture(false));
$("captureFullBtn").addEventListener("click", () => startCapture(true));

// Runs in the page's MAIN world to read the buffers content/reporter.js keeps.
function collectBugData() {
  return {
    errors: (window.__okErrors || []).slice(-20),
    netErrors: (window.__okNetErrors || []).slice(-20),
    viewport: innerWidth + "×" + innerHeight,
    dpr: devicePixelRatio,
    screen: screen.width + "×" + screen.height
  };
}

$("bugBtn").addEventListener("click", async () => {
  const tab = await activeTab();
  let shot = null;
  try {
    shot = await chrome.tabs.captureVisibleTab(null, { format: "png" });
  } catch {
    // protected page — report proceeds without a screenshot
  }
  let pageData = {};
  if (isScriptablePage(tab)) {
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        func: collectBugData
      });
      pageData = result || {};
    } catch {
      // page couldn't be inspected — env fields will show n/a
    }
  }
  await chrome.storage.local.set({
    pendingBugReport: {
      shot,
      url: tab ? tab.url : "",
      title: tab ? tab.title : "",
      ua: navigator.userAgent,
      at: Date.now(),
      ...pageData
    }
  });
  chrome.tabs.create({ url: chrome.runtime.getURL("bugreport/report.html") });
  window.close();
});

$("peeperBtn").addEventListener("click", async () => {
  const tab = await activeTab();
  if (!isScriptablePage(tab)) return alert("CSS Peeper can't run on this page (browser-internal pages are protected).");
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content/csspeeper.js"] });
  window.close();
});

// ============================================================
// PAGE COLOR PALETTE (Dev tab)
// ============================================================

// Runs inside the inspected page; must be self-contained.
function collectPageColors() {
  const counts = {};
  const toHex = (rgb) => {
    const m = rgb.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/);
    if (!m) return null;
    if (m[4] !== undefined && parseFloat(m[4]) < 0.1) return null;
    return "#" + [m[1], m[2], m[3]].map((v) => (+v).toString(16).padStart(2, "0")).join("");
  };
  const els = document.querySelectorAll("body, body *");
  const limit = Math.min(els.length, 3000);
  for (let i = 0; i < limit; i++) {
    const cs = getComputedStyle(els[i]);
    for (const prop of [cs.color, cs.backgroundColor, cs.borderTopColor]) {
      const hex = toHex(prop);
      if (hex) counts[hex] = (counts[hex] || 0) + 1;
    }
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 16);
}

$("paletteExtract").addEventListener("click", async () => {
  const tab = await activeTab();
  const box = $("paletteSwatches");
  if (!isScriptablePage(tab)) {
    box.textContent = "Can't read colors from this page.";
    return;
  }
  box.textContent = "Extracting…";
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectPageColors });
  box.innerHTML = "";
  for (const [hex] of result || []) {
    const sw = document.createElement("div");
    sw.className = "swatch";
    sw.innerHTML = `<div class="chip" style="background:${hex}"></div><span class="hex">${hex}</span>`;
    sw.addEventListener("click", () => {
      navigator.clipboard.writeText(hex);
      showToast(`${hex} copied ✓`);
      sw.querySelector(".hex").textContent = "copied!";
      setTimeout(() => (sw.querySelector(".hex").textContent = hex), 900);
    });
    box.appendChild(sw);
  }
});

// ============================================================
// EMAIL FINDER (Dev tab) — current page's visible text + mailto links only.
// No auto-scroll, no cross-page automation: run it manually per page.
// ============================================================

// Runs inside the inspected page; must be self-contained.
function collectPageEmails() {
  const EMAIL_RE = /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+/g;
  const found = new Map(); // email(lowercase) -> { email, source }

  for (const a of document.querySelectorAll('a[href^="mailto:"]')) {
    const addr = decodeURIComponent(a.getAttribute("href").slice(7).split("?")[0]).trim();
    if (addr && EMAIL_RE.test(addr)) {
      EMAIL_RE.lastIndex = 0;
      found.set(addr.toLowerCase(), { email: addr, source: "mailto link" });
    }
  }

  const text = document.body ? document.body.innerText : "";
  const matches = text.match(EMAIL_RE) || [];
  for (const m of matches) {
    const key = m.toLowerCase();
    if (!found.has(key)) found.set(key, { email: m, source: "page text" });
  }

  return [...found.values()];
}

async function renderEmailResults(items) {
  const list = $("emailList");
  list.innerHTML = "";
  if (!items.length) {
    list.innerHTML = '<li><span class="meta">No emails found on this page.</span></li>';
    return;
  }
  for (const item of items) {
    const li = document.createElement("li");
    const info = document.createElement("div");
    info.className = "grow";
    info.innerHTML = `<div>${escapeHtml(item.email)}</div><div class="meta">${escapeHtml(item.source)}</div>`;
    const copy = document.createElement("button");
    copy.className = "btn";
    copy.textContent = "Copy";
    copy.addEventListener("click", () => copyText(item.email, copy));
    li.append(info, copy);
    list.appendChild(li);
  }
}

let lastFoundEmails = [];

$("emailExtract").addEventListener("click", async () => {
  const tab = await activeTab();
  const list = $("emailList");
  if (!isScriptablePage(tab)) {
    list.innerHTML = '<li><span class="meta">Can\'t read this page.</span></li>';
    return;
  }
  list.innerHTML = '<li><span class="meta">Scanning…</span></li>';
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectPageEmails });
  lastFoundEmails = result || [];
  renderEmailResults(lastFoundEmails);
});

$("emailCopyAll").addEventListener("click", () => {
  if (!lastFoundEmails.length) return showToast("Nothing to copy — run a scan first");
  copyText(lastFoundEmails.map((i) => i.email).join("\n"));
});

$("emailExportCsv").addEventListener("click", () => {
  if (!lastFoundEmails.length) return showToast("Nothing to export — run a scan first");
  const esc = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const rows = [["Email", "Source"].map(esc).join(",")];
  for (const item of lastFoundEmails) rows.push([item.email, item.source].map(esc).join(","));
  const blob = new Blob(["﻿" + rows.join("\r\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.download = `emails-${new Date().toISOString().slice(0, 10)}.csv`;
  a.href = URL.createObjectURL(blob);
  a.click();
});

// ---------- init ----------
refreshTabStats();
renderSessions();
renderBlocklist();
renderFocusState();
