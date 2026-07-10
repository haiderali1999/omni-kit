// OmniKit: records text copied on any page into clipboard history.
document.addEventListener("copy", () => {
  try {
    const text = document.getSelection()?.toString();
    if (text && text.trim()) {
      chrome.runtime.sendMessage({ type: "clip:add", text });
    }
  } catch {
    // extension context may be invalidated after an update; ignore
  }
});
