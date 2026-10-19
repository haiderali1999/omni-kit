# AMO submission pack

## Name
OmniKit — Tabs, Focus & Dev Tools

## Summary (max 250 chars)
All-in-one toolkit: dev utilities, tab sessions, focus mode + Pomodoro, clipboard history, page watcher, screenshot annotator, CSS inspector, storage manager, markdown preview, API inspector. Local-only, no tracking.

## Description
OmniKit puts ten everyday tools behind one toolbar button.

• Dev tools — JSON formatter, JWT decoder, Base64/URL, UUID, timestamps, colour converter, page colour palette
• Tabs — close duplicates, group by domain, save and restore sessions
• Focus — site blocklist with Pomodoro timer and daily stats
• Clipboard history — searchable, pin favourites (can be switched off)
• Page watcher — get notified when a price or text on a page changes
• Screenshot + annotate, CSS inspector, storage/cookie manager
• Markdown preview for .md files and a GitHub repo-size badge
• HR toolkit — snippets (;shortcut), candidate tracker, checklists
• Reminders — water, eye-break and custom alerts; optional prayer times
• DevTools "OmniKit API" panel to inspect and replay requests

Privacy: everything is stored locally. No accounts, analytics or tracking. See the privacy policy.

## Categories
Productivity; Developer Tools

## Support / privacy URLs (you must host these)
- Privacy policy: <URL of docs/PRIVACY.md, e.g. its GitHub page>
- Support email: nj01@724.one

## Notes to reviewers
- No build step, no minification, no bundled libraries: the zip is the plain source.
- `<all_urls>` is required because clipboard history, snippets, element picker, bug reporter and the page watcher must work on whatever site the user is on; the watcher fetches only URLs the user explicitly added.
- `cookies` is used only by the Storage panel to list/edit/delete cookies of the active site at the user's request.
- `content/reporter.js` (MAIN world) is OFF by default and only buffers console errors and failed requests for the user's own bug report.
- Network: api.github.com (public repo size on github.com), api.aladhan.com (opt-in prayer times, city/country typed by user), and user-added watch URLs. Nothing else.
- To test: load temporary add-on, click toolbar icon; reporter and prayer features are toggled in Settings tab.

## Still needed from you
1. Host the privacy policy at a public URL (GitHub Pages or repo link) and paste it above.
2. Screenshots (at least 3, ideally 1280×800): Dev tab, Tabs/Focus tab, screenshot annotator or DevTools panel.
3. Confirm support email.
