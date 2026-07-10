// OmniKit popup: clipboard history tab. (Uses $ and copyText from popup.js.)

async function renderClips() {
  const { clips = [] } = await chrome.storage.local.get("clips");
  const q = $("clipSearch").value.trim().toLowerCase();
  const list = $("clipList");
  list.innerHTML = "";
  const shown = clips.filter((c) => !q || c.text.toLowerCase().includes(q));
  if (!shown.length) {
    list.innerHTML = '<li><span class="meta">Nothing here yet — copy some text on any page.</span></li>';
    return;
  }
  // pinned first
  shown.sort((a, b) => (b.pinned - a.pinned) || (b.at - a.at));
  for (const clip of shown.slice(0, 100)) {
    const li = document.createElement("li");
    if (clip.pinned) li.classList.add("clip-pinned");

    const text = document.createElement("div");
    text.className = "clip-text";
    text.textContent = clip.text;
    text.title = "Click to copy";
    text.addEventListener("click", async () => {
      await navigator.clipboard.writeText(clip.text);
      showToast("Text copied ✓");
      text.style.color = "#5dc98a";
      setTimeout(() => (text.style.color = ""), 700);
    });

    const pin = document.createElement("button");
    pin.className = "btn";
    pin.textContent = clip.pinned ? "★" : "☆";
    pin.title = clip.pinned ? "Unpin" : "Pin";
    pin.addEventListener("click", async () => {
      const { clips = [] } = await chrome.storage.local.get("clips");
      const c = clips.find((x) => x.id === clip.id);
      if (c) c.pinned = !c.pinned;
      await chrome.storage.local.set({ clips });
      renderClips();
    });

    const del = document.createElement("button");
    del.className = "btn danger";
    del.textContent = "✕";
    del.addEventListener("click", async () => {
      const { clips = [] } = await chrome.storage.local.get("clips");
      await chrome.storage.local.set({ clips: clips.filter((x) => x.id !== clip.id) });
      renderClips();
    });

    li.append(text, pin, del);
    list.appendChild(li);
  }
}

$("clipSearch").addEventListener("input", renderClips);

$("clipClear").addEventListener("click", async () => {
  const { clips = [] } = await chrome.storage.local.get("clips");
  await chrome.storage.local.set({ clips: clips.filter((c) => c.pinned) }); // keep pinned
  renderClips();
});

renderClips();
