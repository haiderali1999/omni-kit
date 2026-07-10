// OmniKit popup: Theme tab — 3 built-in presets + a fully custom theme.
// (Uses $ from popup.js.) Writes directly to storage: a UI preference with
// no side effects outside the popup, unlike the message-routed background state.

const THEME_VARS = ["bg", "panel", "text", "dim", "accent", "border", "danger"];

const THEME_PRESETS = {
  dark: { bg: "#1b1e26", panel: "#232733", text: "#e8eaf0", dim: "#9aa0b0", accent: "#4f8cff", border: "#333a4a", danger: "#e35d6a" },
  light: { bg: "#f5f6f8", panel: "#ffffff", text: "#1b1e26", dim: "#6b7280", accent: "#3d6fe0", border: "#dde1e8", danger: "#d1435a" },
  midnight: { bg: "#0d1117", panel: "#161b22", text: "#e6edf3", dim: "#8b949e", accent: "#7c5cff", border: "#242b36", danger: "#f0616e" }
};

const CUSTOM_FIELD_IDS = {
  bg: "themeBg", panel: "themePanel", text: "themeText", dim: "themeDim",
  accent: "themeAccent", border: "themeBorder", danger: "themeDanger"
};

let currentTheme = { name: "dark", custom: { ...THEME_PRESETS.dark } };

function themeVarsFor(theme) {
  return theme.name === "custom" ? theme.custom : (THEME_PRESETS[theme.name] || THEME_PRESETS.dark);
}

function applyThemeVars(vars) {
  const root = document.documentElement.style;
  for (const key of THEME_VARS) if (vars[key]) root.setProperty(`--${key}`, vars[key]);
}

function setActiveSwatch(name) {
  document.querySelectorAll(".theme-swatch").forEach((b) => b.classList.toggle("active", b.dataset.theme === name));
  $("themeCustom").classList.toggle("hidden", name !== "custom");
}

function fillCustomInputs(vars) {
  for (const [key, id] of Object.entries(CUSTOM_FIELD_IDS)) $(id).value = vars[key];
}

async function saveTheme() {
  await chrome.storage.local.set({ theme: currentTheme });
}

document.querySelectorAll(".theme-swatch").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const name = btn.dataset.theme;
    if (name === "custom") {
      // Seed the custom fields from whatever's currently applied, so editing starts from a sensible base.
      currentTheme = { name: "custom", custom: { ...themeVarsFor(currentTheme) } };
      fillCustomInputs(currentTheme.custom);
    } else {
      currentTheme = { name, custom: currentTheme.custom };
    }
    applyThemeVars(themeVarsFor(currentTheme));
    setActiveSwatch(name);
    await saveTheme();
  });
});

for (const [key, id] of Object.entries(CUSTOM_FIELD_IDS)) {
  $(id).addEventListener("input", (e) => {
    currentTheme = { name: "custom", custom: { ...currentTheme.custom, [key]: e.target.value } };
    applyThemeVars(themeVarsFor(currentTheme));
  });
  $(id).addEventListener("change", saveTheme);
}

// ---------- init ----------
(async () => {
  const { theme } = await chrome.storage.local.get("theme");
  if (theme && theme.name) currentTheme = { name: theme.name, custom: { ...THEME_PRESETS.dark, ...(theme.custom || {}) } };
  applyThemeVars(themeVarsFor(currentTheme));
  setActiveSwatch(currentTheme.name);
  fillCustomInputs(currentTheme.name === "custom" ? currentTheme.custom : themeVarsFor(currentTheme));
})();
