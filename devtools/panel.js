// OmniKit API Inspector: captures network requests via chrome.devtools.network.

const requests = [];
let selectedIndex = -1;

const rowsEl = document.getElementById("rows");
const filterEl = document.getElementById("filter");
const xhrOnlyEl = document.getElementById("xhrOnly");
const detailEl = document.getElementById("detail");
const detailBodyEl = document.getElementById("detailBody");

chrome.devtools.network.onRequestFinished.addListener((entry) => {
  const req = entry.request;
  const res = entry.response;
  const record = {
    method: req.method,
    url: req.url,
    status: res.status,
    type: entry._resourceType || "",
    timeMs: Math.round(entry.time),
    requestHeaders: req.headers || [],
    postData: req.postData ? req.postData.text : null,
    responseHeaders: res.headers || [],
    responseBody: null
  };
  // Response bodies are fetched lazily via entry.getContent when a row is opened.
  record.getContent = (cb) => entry.getContent((body) => cb(body));
  requests.push(record);
  render();
});

function isXhrLike(r) {
  return ["xhr", "fetch"].includes((r.type || "").toLowerCase());
}

function matchesFilter(r, q) {
  if (!q) return true;
  q = q.toLowerCase();
  return (
    r.url.toLowerCase().includes(q) ||
    r.method.toLowerCase().includes(q) ||
    String(r.status).includes(q)
  );
}

function statusClass(status) {
  return "status-" + Math.floor(status / 100) + "xx";
}

function render() {
  const q = filterEl.value.trim();
  const xhrOnly = xhrOnlyEl.checked;
  rowsEl.innerHTML = "";
  requests.forEach((r, i) => {
    if (xhrOnly && !isXhrLike(r)) return;
    if (!matchesFilter(r, q)) return;
    const tr = document.createElement("tr");
    if (i === selectedIndex) tr.classList.add("selected");
    tr.innerHTML = `
      <td>${r.method}</td>
      <td class="${statusClass(r.status)}">${r.status}</td>
      <td class="url" title="${r.url.replace(/"/g, "&quot;")}">${r.url}</td>
      <td>${r.type}</td>
      <td>${r.timeMs} ms</td>`;
    tr.addEventListener("click", () => select(i));
    rowsEl.appendChild(tr);
  });
}

function select(i) {
  selectedIndex = i;
  const r = requests[i];
  detailEl.classList.remove("hidden");
  const headerLines = (headers) => headers.map((h) => `  ${h.name}: ${h.value}`).join("\n");
  let text =
    `${r.method} ${r.url}\nStatus: ${r.status} · ${r.timeMs} ms\n\n` +
    `REQUEST HEADERS\n${headerLines(r.requestHeaders)}\n\n` +
    (r.postData ? `REQUEST BODY\n${tryPretty(r.postData)}\n\n` : "") +
    `RESPONSE HEADERS\n${headerLines(r.responseHeaders)}\n\nRESPONSE BODY\n(loading…)`;
  detailBodyEl.textContent = text;
  r.getContent((body) => {
    if (selectedIndex !== i) return;
    detailBodyEl.textContent = text.replace("(loading…)", body ? tryPretty(body) : "(empty)");
  });
  render();
}

function tryPretty(str) {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

// Headers set automatically by the browser — skip when generating code.
const SKIP_HEADERS = new Set([
  "host", "content-length", "connection", "accept-encoding",
  "sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform",
  "sec-fetch-dest", "sec-fetch-mode", "sec-fetch-site"
]);

function usableHeaders(r) {
  return r.requestHeaders.filter((h) => !SKIP_HEADERS.has(h.name.toLowerCase()) && !h.name.startsWith(":"));
}

function toCurl(r) {
  const parts = [`curl '${r.url.replace(/'/g, "'\\''")}'`];
  if (r.method !== "GET") parts.push(`-X ${r.method}`);
  for (const h of usableHeaders(r)) {
    parts.push(`-H '${h.name}: ${h.value.replace(/'/g, "'\\''")}'`);
  }
  if (r.postData) parts.push(`--data-raw '${r.postData.replace(/'/g, "'\\''")}'`);
  return parts.join(" \\\n  ");
}

function toFetch(r) {
  const headers = {};
  for (const h of usableHeaders(r)) headers[h.name] = h.value;
  const opts = { method: r.method, headers };
  if (r.postData) opts.body = r.postData;
  return `fetch(${JSON.stringify(r.url)}, ${JSON.stringify(opts, null, 2)});`;
}

async function copy(text, btn) {
  await navigator.clipboard.writeText(text);
  const orig = btn.textContent;
  btn.textContent = "Copied!";
  setTimeout(() => (btn.textContent = orig), 1200);
}

document.getElementById("copyCurl").addEventListener("click", (e) => {
  if (selectedIndex >= 0) copy(toCurl(requests[selectedIndex]), e.target);
});

document.getElementById("copyFetch").addEventListener("click", (e) => {
  if (selectedIndex >= 0) copy(toFetch(requests[selectedIndex]), e.target);
});

// Replay runs in the inspected page's context so cookies/CORS behave like the original call.
document.getElementById("replay").addEventListener("click", (e) => {
  if (selectedIndex < 0) return;
  const r = requests[selectedIndex];
  const headers = {};
  for (const h of usableHeaders(r)) headers[h.name] = h.value;
  const code = `fetch(${JSON.stringify(r.url)}, ${JSON.stringify({
    method: r.method,
    headers,
    body: r.postData || undefined
  })}).then(res => console.log('[OmniKit replay]', res.status, res)); '[OmniKit] replay sent — see console'`;
  chrome.devtools.inspectedWindow.eval(code, (result, err) => {
    const orig = e.target.textContent;
    e.target.textContent = err ? "Failed" : "Sent ✓";
    setTimeout(() => (e.target.textContent = orig), 1500);
  });
});

document.getElementById("closeDetail").addEventListener("click", () => {
  selectedIndex = -1;
  detailEl.classList.add("hidden");
  render();
});

document.getElementById("clear").addEventListener("click", () => {
  requests.length = 0;
  selectedIndex = -1;
  detailEl.classList.add("hidden");
  render();
});

filterEl.addEventListener("input", render);
xhrOnlyEl.addEventListener("change", render);
