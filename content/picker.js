// OmniKit element picker: click any element to start watching it for changes.
(() => {
  if (window.__omnikitPickerActive) return;
  window.__omnikitPickerActive = true;

  const hl = document.createElement("div");
  hl.style.cssText =
    "position:fixed;z-index:2147483647;pointer-events:none;background:rgba(79,140,255,.25);" +
    "border:2px solid #4f8cff;border-radius:3px;transition:all .05s;";
  const tip = document.createElement("div");
  tip.style.cssText =
    "position:fixed;z-index:2147483647;pointer-events:none;background:#1b1e26;color:#e8eaf0;" +
    "font:12px/1.4 -apple-system,sans-serif;padding:6px 10px;border-radius:6px;max-width:340px;" +
    "box-shadow:0 4px 16px rgba(0,0,0,.4);";
  tip.textContent = "👀 Click the element to watch · Esc to cancel";
  document.documentElement.append(hl, tip);

  let current = null;

  function cssPath(el) {
    if (el.id) return "#" + CSS.escape(el.id);
    const parts = [];
    while (el && el !== document.body && el.nodeType === 1) {
      let part = el.tagName.toLowerCase();
      const parent = el.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.tagName === el.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(el) + 1})`;
      }
      parts.unshift(part);
      if (el.parentElement && el.parentElement.id) {
        parts.unshift("#" + CSS.escape(el.parentElement.id));
        break;
      }
      el = el.parentElement;
    }
    return parts.join(" > ");
  }

  function onMove(e) {
    const el = e.target;
    if (el === hl || el === tip) return;
    current = el;
    const r = el.getBoundingClientRect();
    hl.style.left = r.left + "px";
    hl.style.top = r.top + "px";
    hl.style.width = r.width + "px";
    hl.style.height = r.height + "px";
    tip.style.left = Math.min(e.clientX + 12, innerWidth - 350) + "px";
    tip.style.top = Math.min(e.clientY + 16, innerHeight - 50) + "px";
    const text = (el.innerText || "").trim().slice(0, 60);
    tip.textContent = `👀 "${text}" — click to watch · Esc to cancel`;
  }

  function cleanup() {
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
    hl.remove();
    tip.remove();
    window.__omnikitPickerActive = false;
  }

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!current) return cleanup();
    const selector = cssPath(current);
    const value = (current.innerText || "").trim().slice(0, 500);
    chrome.runtime.sendMessage({
      type: "watch:add",
      url: location.href,
      title: `${value.slice(0, 40)} — ${document.title}`.slice(0, 80),
      selector,
      value
    });
    cleanup();
  }

  function onKey(e) {
    if (e.key === "Escape") cleanup();
  }

  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKey, true);
})();
