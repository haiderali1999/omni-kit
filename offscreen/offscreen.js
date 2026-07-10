// OmniKit offscreen document: fetches watched pages and extracts the watched
// element's text (DOMParser is unavailable in the service worker).
// Note: works for server-rendered content; JS-rendered values won't appear.

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target !== "offscreen" || msg.type !== "watch:fetch") return;
  (async () => {
    try {
      const res = await fetch(msg.url, { credentials: "omit", cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Strip <link>/<script> tags before parsing: we only read text content,
      // and Chrome would otherwise preload the page's linked resources
      // (triggering "preloaded but not used" warnings on the extension).
      const html = (await res.text())
        .replace(/<script\b[\s\S]*?<\/script>/gi, "")
        .replace(/<link\b[^>]*>/gi, "");
      const doc = new DOMParser().parseFromString(html, "text/html");
      const el = doc.querySelector(msg.selector);
      if (!el) throw new Error("Element not found (selector may have changed)");
      sendResponse({ ok: true, value: (el.textContent || "").trim().slice(0, 500) });
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true;
});
