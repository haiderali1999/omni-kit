# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

OmniKit is a Chrome Manifest V3 extension bundling ten independent tools (dev
utilities, tab/session manager, focus mode + Pomodoro, clipboard history,
price/content watcher, screenshot annotator, CSS inspector, storage/cookie
manager, markdown previewer + GitHub badge, HR toolkit, wellness alerts, bug
report generator, API request inspector) behind one popup UI.

There is no build system, package manager, bundler, or test suite — it's
plain HTML/CSS/JS loaded directly by Chrome. There is nothing to `npm
install` or compile.

## Running & testing changes

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
   select this folder.
2. After editing `background.js` or any manifest-referenced file, click the
   reload icon on the extension's card in `chrome://extensions`.
3. Content scripts (`content/clip.js`, `content/snippets.js`,
   `content/reporter.js`, `content/markdown.js`, `content/github.js`) only
   attach to pages loaded *after* a reload — refresh open tabs to pick up
   changes.
4. To test local `.md` preview, enable **Allow access to file URLs** on the
   extension's card.
5. To test the API inspector, open DevTools (F12) → **OmniKit API** tab, then
   reload the page being inspected.
6. There is no linter or test runner configured — verify changes manually in
   the browser (see the `run` skill for driving the extension end-to-end).

## Architecture

**Service worker (`background.js`) is the single source of truth.** It owns
`chrome.storage.local` for all persistent state (see the `DEFAULTS` object)
and is the only place that touches `chrome.alarms`, `chrome.notifications`,
and `chrome.declarativeNetRequest`. UI surfaces (popup, devtools panel,
content scripts) never write cross-cutting state directly — they send a
`chrome.runtime.sendMessage({ type: "..." })` and the worker's
`chrome.runtime.onMessage` switch statement at the bottom of the file
performs the write and any side effects (rescheduling alarms, reapplying
blocking rules, notifying). When adding a new stateful feature, add a
`DEFAULTS` entry and a new `msg.type` case rather than reading/writing
storage from the popup.

**Storage is the sync mechanism, not message responses.** UI code writes optimistic
local state or waits on `chrome.storage.onChanged` / re-reads storage after
sending a message; message handlers just return `{ ok: true }`.

**Offscreen document for DOM parsing.** Service workers have no `DOMParser`,
so the page watcher (`offscreen/offscreen.js`) runs in an offscreen document
created on demand (`ensureOffscreen()` in `background.js`) and is talked to
via `chrome.runtime.sendMessage({ target: "offscreen", ... })`. The
`onMessage` listener in `background.js` explicitly ignores messages with
`target: "offscreen"` so the two listeners don't race.

**Content scripts by injection mode:**
- Always-on (declared in `manifest.json`, run on every page): `content/clip.js`
  (clipboard capture), `content/snippets.js` (text-expansion, `all_frames`),
  `content/reporter.js` (runs in `world: "MAIN"` at `document_start` to
  monkey-patch `fetch`/`XHR`/`console.error` and buffer errors on
  `window.__okErrors`/`__okNetErrors` for the bug reporter), plus conditional
  scripts matched by URL pattern: `content/markdown.js` (`*.md`/`*.markdown`)
  and `content/github.js` (`github.com/*`).
- On-demand (injected via `chrome.scripting.executeScript` from
  `popup/popup.js` when a toolbar button is clicked): `content/picker.js`
  (element picker for the watcher) and `content/csspeeper.js` (style
  inspector overlay). These check a `window.__omnikit*Active` guard so
  double-injection is a no-op.

**Popup is tab-panelled**, one JS file per feature area
(`popup/popup.js` for Dev/Tabs/Focus, `popup/clips.js`, `popup/watch.js`,
`popup/storagepanel.js`, `popup/hr.js`, `popup/alerts.js`), all loaded into
`popup/popup.html` and operating on the same DOM/storage. The `$ = (id) =>
document.getElementById(id)` helper and `showToast()` in `popup.js` are
reused informally by convention across these files — check for an existing
helper before adding a new one.

**Focus mode blocking** uses `chrome.declarativeNetRequest` dynamic rules
keyed off `RULE_ID_OFFSET`, rewritten wholesale on every blocklist change via
`applyBlockingRules()` (remove-all-then-add, not incremental).

**Pomodoro and focus mode are coupled**: starting/stopping a Pomodoro phase
calls `setFocus()`, so focus-mode blocking auto-toggles with focus/break
phases.

**Cross-cutting UI conventions**: pages that need to hand data to a page
opened in a new tab (screenshot annotator, bug report, blocked page) do so by
writing a `pendingX` key to `chrome.storage.local` before calling
`chrome.tabs.create`, rather than passing data via URL or messages.

**DevTools panel** (`devtools/panel.js`) is a separate execution context
from the popup — it uses `chrome.devtools.network.onRequestFinished` to
capture request/response metadata directly from Chrome's DevTools protocol,
independent of the `content/reporter.js` fetch/XHR patching used for bug
reports.
