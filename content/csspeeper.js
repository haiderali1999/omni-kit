// OmniKit CSS Peeper: hover any element to inspect its styles; click to copy
// the CSS summary; Esc (or re-running the script) exits. Injected on demand.
(() => {
  if (window.__omnikitPeeperCleanup) {
    window.__omnikitPeeperCleanup();
    return;
  }

  const hl = document.createElement("div");
  hl.style.cssText =
    "position:fixed;z-index:2147483646;pointer-events:none;background:rgba(143,111,255,.18);" +
    "border:1.5px solid #8f6fff;border-radius:2px;";
  const tip = document.createElement("div");
  tip.style.cssText =
    "position:fixed;z-index:2147483647;pointer-events:none;background:#1b1e26;color:#e8eaf0;" +
    "font:11px/1.5 ui-monospace,Menlo,monospace;padding:10px 12px;border-radius:8px;max-width:360px;" +
    "box-shadow:0 6px 24px rgba(0,0,0,.5);white-space:pre;";
  document.documentElement.append(hl, tip);

  let lastCss = "";

  function rgbToHex(rgb) {
    const m = rgb.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/);
    if (!m) return rgb;
    if (m[4] !== undefined && parseFloat(m[4]) === 0) return "transparent";
    return "#" + [m[1], m[2], m[3]].map((v) => (+v).toString(16).padStart(2, "0")).join("");
  }

  function describe(el) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const cls = el.className && typeof el.className === "string"
      ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
      : "";
    const font = cs.fontFamily.split(",")[0].replace(/["']/g, "");
    const lines = [
      `${el.tagName.toLowerCase()}${cls}  ${Math.round(r.width)}×${Math.round(r.height)}`,
      `font:    ${cs.fontSize} / ${cs.lineHeight} ${font} (${cs.fontWeight})`,
      `color:   ${rgbToHex(cs.color)}`,
      `bg:      ${rgbToHex(cs.backgroundColor)}`,
      `margin:  ${cs.margin}`,
      `padding: ${cs.padding}`
    ];
    if (cs.borderRadius !== "0px") lines.push(`radius:  ${cs.borderRadius}`);
    if (cs.boxShadow !== "none") lines.push(`shadow:  ${cs.boxShadow.slice(0, 60)}`);
    lastCss = [
      `font-family: ${cs.fontFamily};`,
      `font-size: ${cs.fontSize};`,
      `font-weight: ${cs.fontWeight};`,
      `line-height: ${cs.lineHeight};`,
      `color: ${rgbToHex(cs.color)};`,
      `background-color: ${rgbToHex(cs.backgroundColor)};`,
      `margin: ${cs.margin};`,
      `padding: ${cs.padding};`,
      `border-radius: ${cs.borderRadius};`
    ].join("\n");
    return lines.join("\n") + "\n\n🖱 click to copy CSS · Esc to exit";
  }

  function onMove(e) {
    const el = e.target;
    if (el === hl || el === tip) return;
    const r = el.getBoundingClientRect();
    hl.style.left = r.left + "px";
    hl.style.top = r.top + "px";
    hl.style.width = r.width + "px";
    hl.style.height = r.height + "px";
    tip.textContent = describe(el);
    const tw = 370, th = tip.offsetHeight + 10;
    tip.style.left = Math.min(e.clientX + 14, innerWidth - tw) + "px";
    tip.style.top = (e.clientY + 18 + th > innerHeight ? e.clientY - th - 8 : e.clientY + 18) + "px";
  }

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(lastCss).then(() => {
      const saved = tip.textContent;
      tip.textContent = "✓ CSS copied to clipboard";
      setTimeout(() => (tip.textContent = saved), 900);
    });
  }

  function onKey(e) {
    if (e.key === "Escape") cleanup();
  }

  function cleanup() {
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
    hl.remove();
    tip.remove();
    delete window.__omnikitPeeperCleanup;
  }

  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKey, true);
  window.__omnikitPeeperCleanup = cleanup;
})();
