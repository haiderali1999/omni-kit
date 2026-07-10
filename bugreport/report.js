// OmniKit bug report composer: shows auto-captured context, lets the reporter
// fill in the human parts, and exports everything as Markdown.

const $ = (id) => document.getElementById(id);
let report = null;

function parseUa(ua) {
  const chrome = (ua.match(/Chrom(?:e|ium)\/(\d+)/) || [])[1];
  const edge = (ua.match(/Edg\/(\d+)/) || [])[1];
  const browser = edge ? `Edge ${edge}` : chrome ? `Chrome ${chrome}` : "Unknown browser";
  let os = "Unknown OS";
  if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Windows NT 10/.test(ua)) os = "Windows 10/11";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Android/.test(ua)) os = "Android";
  else if (/Linux/.test(ua)) os = "Linux";
  return `${browser} · ${os}`;
}

function envRows() {
  return [
    ["Page URL", report.url || "n/a"],
    ["Page title", report.title || "n/a"],
    ["Captured", new Date(report.at).toLocaleString()],
    ["Browser / OS", parseUa(report.ua || "")],
    ["Viewport", report.viewport ? `${report.viewport} @${report.dpr}x` : "n/a"],
    ["Screen", report.screen || "n/a"]
  ];
}

function showToast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1400);
}

(async () => {
  const { pendingBugReport } = await chrome.storage.local.get("pendingBugReport");
  if (!pendingBugReport) {
    document.body.innerHTML = '<p style="padding:40px;color:#9aa0b0">No captured data. Start a report from the OmniKit popup (🐞).</p>';
    return;
  }
  report = pendingBugReport;
  await chrome.storage.local.remove("pendingBugReport");

  $("envTable").innerHTML = envRows()
    .map(([k, v]) => `<tr><td>${k}</td><td>${escapeHtml(v)}</td></tr>`)
    .join("");

  const errs = report.errors || [];
  $("errCount").textContent = `(${errs.length})`;
  $("errLog").innerHTML = errs.length
    ? errs.map((e) => `<div class="err">[${new Date(e.t).toLocaleTimeString()}] ${escapeHtml(e.msg)}${e.src ? " — " + escapeHtml(e.src) : ""}</div>`).join("")
    : '<span class="empty">None recorded on this page ✓</span>';

  const nets = report.netErrors || [];
  $("netCount").textContent = `(${nets.length})`;
  $("netLog").innerHTML = nets.length
    ? nets.map((n) => `<div class="net">${escapeHtml(String(n.method))} ${escapeHtml(String(n.status))} — ${escapeHtml(n.url)}</div>`).join("")
    : '<span class="empty">None recorded on this page ✓</span>';

  if (report.shot) {
    $("shot").src = report.shot;
  } else {
    $("shot").classList.add("hidden");
    $("noShot").classList.remove("hidden");
  }
})();

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function buildMarkdown() {
  const errs = report.errors || [];
  const nets = report.netErrors || [];
  const lines = [
    `## 🐞 ${$("bugTitle").value.trim() || "Untitled bug"}`,
    "",
    `**Severity:** ${$("bugSeverity").value}`,
    `**URL:** ${report.url || "n/a"}`,
    `**Environment:** ${parseUa(report.ua || "")}${report.viewport ? ` · viewport ${report.viewport} @${report.dpr}x` : ""}`,
    `**Captured:** ${new Date(report.at).toLocaleString()}`,
    "",
    "### Steps to reproduce",
    $("bugSteps").value.trim() || "_not provided_",
    "",
    "### Expected result",
    $("bugExpected").value.trim() || "_not provided_",
    "",
    "### Actual result",
    $("bugActual").value.trim() || "_not provided_",
    ""
  ];
  if (errs.length) {
    lines.push(`### Console errors (${errs.length})`, "```");
    for (const e of errs) lines.push(`[${new Date(e.t).toLocaleTimeString()}] ${e.msg}${e.src ? " — " + e.src : ""}`);
    lines.push("```", "");
  }
  if (nets.length) {
    lines.push(`### Failed network requests (${nets.length})`, "", "| Method | Status | URL |", "|---|---|---|");
    for (const n of nets) lines.push(`| ${n.method} | ${n.status} | ${n.url} |`);
    lines.push("");
  }
  if (report.shot) lines.push("_Screenshot attached: see accompanying PNG._");
  return lines.join("\n");
}

$("copyMd").addEventListener("click", async () => {
  await navigator.clipboard.writeText(buildMarkdown());
  showToast("Markdown copied ✓ — paste into Jira / GitHub");
});

$("downloadMd").addEventListener("click", () => {
  const blob = new Blob([buildMarkdown()], { type: "text/markdown" });
  const a = document.createElement("a");
  a.download = `bug-report-${new Date(report.at).toISOString().slice(0, 19).replace(/[:T]/g, "-")}.md`;
  a.href = URL.createObjectURL(blob);
  a.click();
});

$("downloadShot").addEventListener("click", () => {
  if (!report.shot) return showToast("No screenshot for this page");
  const a = document.createElement("a");
  a.download = `bug-screenshot-${new Date(report.at).toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`;
  a.href = report.shot;
  a.click();
});

$("annotateShot").addEventListener("click", async () => {
  if (!report.shot) return showToast("No screenshot for this page");
  await chrome.storage.local.set({ pendingShot: report.shot });
  chrome.tabs.create({ url: chrome.runtime.getURL("screenshot/annotate.html") });
});
