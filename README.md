# OmniKit — Tabs, Focus & Dev Tools

An all-in-one Chrome extension (Manifest V3) for daily users and developers.
Ten tools, one install.

## Features

### 🛠 Dev Tools (popup → Dev tab)
- JSON formatter (pretty / minify)
- JWT decoder with expiry check
- Base64 & URL encode/decode (unicode-safe)
- UUID v4 generator, timestamp converter
- Color converter (HEX ↔ RGB ↔ HSL)
- **Page Color Palette** — extract the most-used colors of any page as clickable swatches

### 🗂 Tab Manager (popup → Tabs tab)
- Live tab & duplicate counts, one-click close duplicates
- Group tabs by domain (native Chrome tab groups)
- Save named sessions and restore them later in a new window

### 🧘 Focus Mode + Pomodoro (popup → Focus tab)
- Block distracting sites (editable blocklist)
- Pomodoro timer with notifications; blocking auto-toggles with focus/break phases
- Daily completed-session stats

### 📋 Clipboard History (popup → Clips tab)
- Everything you copy on web pages is saved automatically
- Search, pin favorites, click to re-copy; "Clear" keeps pinned items

### 👀 Price / Content Watcher (popup → Watch tab)
- Click **Pick element on this page**, then click any price/text on the page
- Checked every 30 minutes in the background; desktop notification on change
- Works best on server-rendered pages (JS-rendered values can't be fetched offline)

### 📸 Smart Screenshot & Annotate (📸 button in popup header)
- Captures the visible tab, opens a full editor: pen, arrow, rectangle,
  ellipse, text, crop, colors, undo — then copy to clipboard or download PNG

### 🎨 CSS Peeper (🎨 button in popup header)
- Hover any element to see tag, size, font, colors, margin/padding, radius, shadow
- Click to copy the CSS summary; Esc to exit

### 🍪 Storage & Cookie Manager (popup → Storage tab)
- View/edit/delete cookies, localStorage and sessionStorage for the current tab
- Export/import each store as JSON (handy for localhost ↔ staging)

### 📝 Markdown Previewer + GitHub Enhancer
- Raw `.md` files (web or local) render as styled GitHub-like pages with a Raw/Preview toggle
- GitHub repo pages get a badge with repo size, default branch, and last-push age

### 👔 HR Toolkit (popup → HR tab)
- **Snippets**: reusable templates with `{placeholders}` that expand when you
  type their shortcut (e.g. `;reject`) in any text field on any site — Gmail,
  LinkedIn, ATS, anywhere
- **Candidates**: save any profile page as a candidate (selected text becomes
  the note), track status (Screening → Hired), export the list as CSV
- **Checklists**: reusable templates (e.g. new-hire onboarding); start one per
  person and tick items off with progress tracking

### 🔔 Alerts (popup → Alerts tab)
- Namaz alerts with auto prayer times for your city (AlAdhan API)
- Water reminders and 20-20-20 eye-break reminders at your chosen interval
- Meeting/custom alerts: one-time or repeat daily

### 🐞 Bug Report Generator (🐞 button in popup header) — for QA & PMs
- One click captures: screenshot, page URL/title, browser & OS, viewport,
  console errors, and failed network requests
- **Console/network capture must be turned on in Settings first** (off by
  default — it patches `console.error` site-wide, which makes Chrome
  attribute *any* site's console errors to OmniKit's own error log; see the
  Settings tab). Turn it on before reproducing the bug, not as a background habit.
- Fill in title/steps/expected/actual + severity, then **Copy as Markdown** —
  paste straight into Jira or GitHub; screenshot downloads separately
- "Annotate screenshot" opens the capture in the drawing editor first

### 🔍 API Request Inspector (DevTools → "OmniKit API" panel)
- Logs network requests with headers and pretty-printed bodies
- Copy any request as **cURL** or **fetch**; replay it in the page's own context

### 🎨 Theme (popup → Theme tab)
- 3 built-in themes: Dark (default), Light, Midnight
- Custom theme: pick your own background, panel, text, accent, border, and
  danger colors — preview updates live as you pick

### ⚙️ Settings (popup → Settings tab)
- Switch off any always-on content script you don't use (clipboard capture,
  snippet expansion, bug-report error buffering) — change applies to tabs
  opened/refreshed after the switch
- Export all OmniKit data (sessions, clips, watches, snippets, candidates,
  checklists, alerts, settings) as one JSON file and import it into OmniKit
  on another browser/machine

## Install (developer mode)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select this folder
4. Pin OmniKit from the puzzle-piece menu

Extras:
- **Local .md preview**: on the extension's card in `chrome://extensions`, enable
  *Allow access to file URLs*
- **API inspector**: open DevTools (F12) → **OmniKit API** tab, then reload the page
- Content scripts (clipboard, snippets, bug reporter, markdown, GitHub) only
  start working on pages loaded *after* the extension is installed/reloaded,
  or after a feature toggle is switched on in Settings

## Project structure

```
manifest.json           MV3 manifest
background.js           Service worker: focus rules, pomodoro, clips, watcher,
                         feature-toggle content script registration
popup/                  Main UI (Dev / Tabs / Focus / Clips / Watch / Storage / Theme / Settings)
content/clip.js         Clipboard capture on all pages
content/picker.js       Element picker for the watcher (injected on demand)
content/csspeeper.js    Style inspector overlay (injected on demand)
content/markdown.*      Raw .md renderer
content/github.js       GitHub repo badge
screenshot/             Screenshot annotation editor
offscreen/              Offscreen document that fetches & parses watched pages
devtools/               DevTools page + API inspector panel
blocked/blocked.html    Page shown instead of blocked sites
icons/                  Extension icons
```

## Permissions used

| Permission | Why |
|---|---|
| `tabs`, `tabGroups` | tab counts, sessions, grouping, screenshot capture |
| `storage`, `unlimitedStorage` | sessions, clips, watches, screenshots in transit |
| `alarms`, `notifications` | pomodoro + watcher schedules and alerts |
| `declarativeNetRequest` | redirect blocked sites during focus mode |
| `scripting` | inject picker / CSS peeper / storage access on demand |
| `cookies` | cookie manager |
| `offscreen` | parse watched pages in the background (no DOM in service workers) |
| host `<all_urls>` | all of the above on any site |
