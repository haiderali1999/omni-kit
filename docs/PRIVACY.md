# OmniKit Privacy Policy

_Last updated: 2026-10-19_

OmniKit is a toolkit that runs entirely inside your browser. **I do not run any server, and I do not collect, receive, sell or share your data.** Everything OmniKit stores stays on your device in the browser's local extension storage and can be wiped by uninstalling the add-on or using Settings → Export / Import.

## What is stored on your device
Clipboard history (text you copy on web pages, only while that feature is on), saved tab sessions, focus-mode blocklist and Pomodoro stats, page-watcher entries (URL, CSS selector, last value), text snippets, HR candidates/checklists, alerts, theme and settings. None of this leaves your device.

## Network requests OmniKit makes
| When | Destination | What is sent |
|---|---|---|
| Page watcher is checking a page **you chose to watch** | That page's own server | A normal GET request (no cookies) |
| You open a repository page on github.com | api.github.com | The public `owner/repo` name shown in the address bar |
| You **opt in** to Prayer times (Settings) and enter a city and country | api.aladhan.com | The city and country you typed |

No analytics, telemetry, advertising or tracking of any kind is included.

## Permissions, and why
- **All sites / tabs / scripting**: clipboard capture, snippet expansion, markdown preview, GitHub badge, element picker, CSS inspector, colour/email finder, storage manager and bug reporter act on pages you are viewing.
- **cookies**: shown in the Storage manager so you can view/edit/delete them. Never transmitted.
- **declarativeNetRequest**: Focus mode redirects blocklisted sites to a local page.
- **notifications, alarms**: Pomodoro, watcher and reminder alerts.
- **storage / unlimitedStorage**: local data above.
- **tabGroups**: "Group by domain".

## Your control
Every always-on feature (clipboard, snippets, bug reporter, prayer times) can be switched off in Settings. Clipboard history can be cleared at any time. Uninstalling removes all data.

## Contact
Haider Ali — haideralimughal512@gmail.com
