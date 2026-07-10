// OmniKit screenshot annotator: draws on the captured image with undoable shapes.

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const textInput = document.getElementById("textInput");
const applyCropBtn = document.getElementById("applyCrop");

let img = new Image();
let shapes = []; // { tool, color, size, x1,y1,x2,y2, points, text }
let currentTool = "pen";
let drawing = false;
let current = null;
let cropRect = null;

let sourceTab = null; // { tabId, windowId } of the page that was captured

function loadImage(dataUrl) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.src = dataUrl;
  });
}

async function setBaseImage(dataUrl) {
  img = await loadImage(dataUrl);
  shapes = [];
  cropRect = null;
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  redraw();
}

// ---- load the captured screenshot ----
(async () => {
  const { pendingShot, pendingShotTab, pendingFullPage } = await chrome.storage.local.get([
    "pendingShot", "pendingShotTab", "pendingFullPage"
  ]);
  if (!pendingShot) {
    document.querySelector(".stage").innerHTML =
      '<p style="color:#9aa0b0">No screenshot found. Capture one from the OmniKit popup (📸).</p>';
    return;
  }
  sourceTab = pendingShotTab || null;
  await chrome.storage.local.remove(["pendingShot", "pendingShotTab", "pendingFullPage"]);
  await setBaseImage(pendingShot);
  // popup requested a full-page capture (📜) — run the scroll & stitch right away
  if (pendingFullPage && sourceTab) document.getElementById("fullPage").click();
})();

// ---- full-page capture (scroll & stitch) ----
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

document.getElementById("fullPage").addEventListener("click", async (e) => {
  const btn = e.target;
  if (!sourceTab) return alert("The original tab is unknown — capture again from the popup.");
  btn.disabled = true;
  btn.textContent = "Capturing…";
  try {
    const tabId = sourceTab.tabId;
    const tab = await chrome.tabs.get(tabId); // throws if the tab was closed
    const run = (func, ...args) =>
      chrome.scripting.executeScript({ target: { tabId }, func, args }).then((r) => r[0].result);

    const metrics = await run(() => ({
      scrollHeight: Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0),
      viewportH: innerHeight,
      viewportW: innerWidth,
      dpr: devicePixelRatio,
      originalY: scrollY
    }));

    // bring the page to the front so captureVisibleTab can see it
    const myTab = await chrome.tabs.getCurrent();
    await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
    await sleep(300);

    // Hide fixed/sticky elements (navbars, cookie banners) after the first
    // frame so they appear once at the top instead of repeating per section.
    const hideFixedEls = () => {
      window.__okHidden = [];
      for (const el of document.querySelectorAll("body *")) {
        const p = getComputedStyle(el).position;
        if (p === "fixed" || p === "sticky") {
          window.__okHidden.push([el, el.style.visibility]);
          el.style.visibility = "hidden";
        }
      }
    };
    const restoreFixedEls = () => {
      for (const [el, v] of window.__okHidden || []) el.style.visibility = v;
      delete window.__okHidden;
    };

    const maxSteps = 30; // canvas height safety cap (~30 viewports)
    const steps = Math.min(Math.ceil(metrics.scrollHeight / metrics.viewportH), maxSteps);
    const shots = [];
    for (let i = 0; i < steps; i++) {
      await run((y) => scrollTo(0, y), i * metrics.viewportH);
      if (i === 1) await run(hideFixedEls);
      await sleep(450); // let lazy content render + respect capture rate limit
      const actualY = await run(() => scrollY);
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
      shots.push({ dataUrl, y: actualY });
      await sleep(200);
      if (actualY + metrics.viewportH >= metrics.scrollHeight) break; // reached the bottom early
    }

    // restore the page and come back to the editor
    await run(restoreFixedEls);
    await run((y) => scrollTo(0, y), metrics.originalY);
    if (myTab) await chrome.tabs.update(myTab.id, { active: true });

    // stitch shots into one tall canvas (positioned by real scroll offsets)
    const first = await loadImage(shots[0].dataUrl);
    const scale = first.naturalWidth / metrics.viewportW; // device pixel ratio of the capture
    const stitched = document.createElement("canvas");
    stitched.width = first.naturalWidth;
    stitched.height = Math.round(Math.min(metrics.scrollHeight, steps * metrics.viewportH) * scale);
    const sctx = stitched.getContext("2d");
    for (const shot of shots) {
      const im = shot.dataUrl === shots[0].dataUrl ? first : await loadImage(shot.dataUrl);
      sctx.drawImage(im, 0, Math.round(shot.y * scale));
    }
    await setBaseImage(stitched.toDataURL("image/png"));
  } catch (err) {
    alert("Full-page capture failed: " + err.message);
  }
  btn.disabled = false;
  btn.textContent = "⛶ Full page";
});

// ---- tool selection ----
document.querySelectorAll(".tool").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tool").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentTool = btn.dataset.tool;
    cropRect = null;
    applyCropBtn.classList.add("hidden");
    redraw();
  });
});

const color = () => document.getElementById("color").value;
const lineWidth = () => +document.getElementById("size").value;

// map mouse position to canvas pixels (canvas may be CSS-scaled)
function pos(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (canvas.width / r.width),
    y: (e.clientY - r.top) * (canvas.height / r.height)
  };
}

// ---- drawing ----
canvas.addEventListener("mousedown", (e) => {
  const p = pos(e);
  if (currentTool === "text") {
    placeTextInput(e, p);
    return;
  }
  drawing = true;
  if (currentTool === "pen") {
    current = { tool: "pen", color: color(), size: lineWidth(), points: [p] };
  } else if (currentTool === "crop") {
    cropRect = { x1: p.x, y1: p.y, x2: p.x, y2: p.y };
  } else {
    current = { tool: currentTool, color: color(), size: lineWidth(), x1: p.x, y1: p.y, x2: p.x, y2: p.y };
  }
});

canvas.addEventListener("mousemove", (e) => {
  if (!drawing) return;
  const p = pos(e);
  if (currentTool === "pen") current.points.push(p);
  else if (currentTool === "crop") {
    cropRect.x2 = p.x;
    cropRect.y2 = p.y;
  } else {
    current.x2 = p.x;
    current.y2 = p.y;
  }
  redraw();
});

window.addEventListener("mouseup", () => {
  if (!drawing) return;
  drawing = false;
  if (currentTool === "crop") {
    applyCropBtn.classList.toggle("hidden", !cropRect || Math.abs(cropRect.x2 - cropRect.x1) < 5);
  } else if (current) {
    shapes.push(current);
    current = null;
  }
  redraw();
});

// ---- text tool ----
let pendingText = null;

function placeTextInput(e, p) {
  pendingText = p;
  textInput.style.left = e.pageX + "px";
  textInput.style.top = e.pageY + "px";
  textInput.classList.remove("hidden");
  textInput.value = "";
  textInput.focus();
}

textInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && textInput.value.trim()) {
    shapes.push({
      tool: "text",
      color: color(),
      size: lineWidth(),
      x1: pendingText.x,
      y1: pendingText.y,
      text: textInput.value
    });
    textInput.classList.add("hidden");
    redraw();
  } else if (e.key === "Escape") {
    textInput.classList.add("hidden");
  }
});

// ---- rendering ----
function drawShape(s) {
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (s.tool === "pen") {
    ctx.beginPath();
    s.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  } else if (s.tool === "rect") {
    ctx.strokeRect(s.x1, s.y1, s.x2 - s.x1, s.y2 - s.y1);
  } else if (s.tool === "ellipse") {
    ctx.beginPath();
    ctx.ellipse((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, Math.abs(s.x2 - s.x1) / 2, Math.abs(s.y2 - s.y1) / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (s.tool === "arrow") {
    const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
    const head = Math.max(12, s.size * 4);
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s.x2, s.y2);
    ctx.lineTo(s.x2 - head * Math.cos(angle - 0.45), s.y2 - head * Math.sin(angle - 0.45));
    ctx.lineTo(s.x2 - head * Math.cos(angle + 0.45), s.y2 - head * Math.sin(angle + 0.45));
    ctx.closePath();
    ctx.fill();
  } else if (s.tool === "text") {
    const px = 14 + s.size * 3;
    ctx.font = `bold ${px}px -apple-system, sans-serif`;
    ctx.fillText(s.text, s.x1, s.y1);
  }
}

function redraw() {
  if (!img.naturalWidth) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  shapes.forEach(drawShape);
  if (current) drawShape(current);
  if (cropRect) {
    const { x1, y1, x2, y2 } = cropRect;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    ctx.fill("evenodd");
    ctx.strokeStyle = "#4f8cff";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    ctx.restore();
  }
}

// ---- crop ----
applyCropBtn.addEventListener("click", () => {
  if (!cropRect) return;
  const x = Math.min(cropRect.x1, cropRect.x2);
  const y = Math.min(cropRect.y1, cropRect.y2);
  const w = Math.abs(cropRect.x2 - cropRect.x1);
  const h = Math.abs(cropRect.y2 - cropRect.y1);
  cropRect = null;
  redraw(); // flatten current shapes without the crop overlay
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  off.getContext("2d").drawImage(canvas, x, y, w, h, 0, 0, w, h);
  const newImg = new Image();
  newImg.onload = () => {
    img = newImg;
    shapes = [];
    canvas.width = w;
    canvas.height = h;
    applyCropBtn.classList.add("hidden");
    redraw();
  };
  newImg.src = off.toDataURL("image/png");
});

// ---- undo / export ----
document.getElementById("undo").addEventListener("click", () => {
  shapes.pop();
  redraw();
});

document.getElementById("download").addEventListener("click", () => {
  const a = document.createElement("a");
  a.download = `screenshot-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
  a.href = canvas.toDataURL("image/png");
  a.click();
});

// Builds a single-page PDF with the canvas embedded as a JPEG (no libraries).
function canvasToPdfBlob(cnv) {
  const jpegB64 = cnv.toDataURL("image/jpeg", 0.92).split(",")[1];
  const jpegBytes = Uint8Array.from(atob(jpegB64), (c) => c.charCodeAt(0));
  const wPt = (cnv.width * 72 / 96).toFixed(2);
  const hPt = (cnv.height * 72 / 96).toFixed(2);
  const enc = new TextEncoder();

  const chunks = [];
  let offset = 0;
  const offsets = {};
  const push = (bytes) => {
    chunks.push(bytes);
    offset += bytes.length;
  };
  const pushStr = (s) => push(enc.encode(s));

  pushStr("%PDF-1.4\n");
  offsets[1] = offset;
  pushStr("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  offsets[2] = offset;
  pushStr("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  offsets[3] = offset;
  pushStr(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt} ${hPt}] ` +
    `/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`
  );
  offsets[4] = offset;
  pushStr(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${cnv.width} /Height ${cnv.height} ` +
    `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
  );
  push(jpegBytes);
  pushStr("\nendstream\nendobj\n");
  const content = `q ${wPt} 0 0 ${hPt} 0 0 cm /Im0 Do Q`;
  offsets[5] = offset;
  pushStr(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);

  const xrefStart = offset;
  let xref = "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i++) xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  xref += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  pushStr(xref);

  return new Blob(chunks, { type: "application/pdf" });
}

document.getElementById("downloadPdf").addEventListener("click", () => {
  const blob = canvasToPdfBlob(canvas);
  const a = document.createElement("a");
  a.download = `screenshot-${new Date().toISOString().replace(/[:.]/g, "-")}.pdf`;
  a.href = URL.createObjectURL(blob);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});

document.getElementById("copy").addEventListener("click", (e) => {
  canvas.toBlob(async (blob) => {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    e.target.textContent = "Copied!";
    setTimeout(() => (e.target.textContent = "Copy"), 1200);
  });
});
