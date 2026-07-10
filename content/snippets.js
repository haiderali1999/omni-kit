// OmniKit snippet expander: type a shortcut like ";reject" in any text field
// (inputs, textareas, contenteditable editors like Gmail) and it expands into
// the full template. {placeholder} tokens ask for their values on expansion.
(() => {
  let snippets = [];

  function loadSnippets() {
    try {
      chrome.storage.local.get("snippets", ({ snippets: s }) => {
        snippets = s || [];
      });
    } catch {
      // extension context invalidated after an update; ignore
    }
  }
  loadSnippets();
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.snippets) snippets = changes.snippets.newValue || [];
    });
  } catch {}

  function fillPlaceholders(body) {
    const tokens = [...new Set((body.match(/\{([^{}]+)\}/g) || []))];
    for (const token of tokens) {
      const value = window.prompt(`OmniKit snippet — value for ${token}:`);
      if (value === null) return null; // cancelled
      body = body.split(token).join(value);
    }
    return body;
  }

  function findSnippet(textBeforeCaret) {
    const m = textBeforeCaret.match(/(;[\w-]+)$/);
    if (!m) return null;
    const sn = snippets.find((s) => s.shortcut === m[1]);
    return sn ? { snippet: sn, len: m[1].length } : null;
  }

  function expandInInput(el) {
    const pos = el.selectionStart;
    if (pos == null) return;
    const hit = findSnippet(el.value.slice(0, pos));
    if (!hit) return;
    const body = fillPlaceholders(hit.snippet.body);
    if (body === null) return;
    el.value = el.value.slice(0, pos - hit.len) + body + el.value.slice(pos);
    const newPos = pos - hit.len + body.length;
    el.setSelectionRange(newPos, newPos);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function expandInEditable() {
    const sel = getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;
    const hit = findSnippet(node.textContent.slice(0, range.startOffset));
    if (!hit) return;
    const body = fillPlaceholders(hit.snippet.body);
    if (body === null) return;
    const del = document.createRange();
    del.setStart(node, range.startOffset - hit.len);
    del.setEnd(node, range.startOffset);
    sel.removeAllRanges();
    sel.addRange(del);
    document.execCommand("insertText", false, body);
  }

  document.addEventListener(
    "input",
    (e) => {
      if (!snippets.length) return;
      const el = e.target;
      if (!el) return;
      const tag = (el.tagName || "").toLowerCase();
      if (tag === "textarea" || (tag === "input" && /^(text|search|email|url|)$/.test(el.type || ""))) {
        expandInInput(el);
      } else if (el.isContentEditable) {
        expandInEditable();
      }
    },
    true
  );
})();
