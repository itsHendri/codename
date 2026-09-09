# Privacy

Codename reads the page you point it at and keeps what it reads on your
machine. There is no account, no analytics, and no server of ours.

## What it reads, and when

Nothing is read until you press **Scan** or turn on **Hover inspect** on a
site, and Chrome asks you for access to that site the first time. Access is
per site. Broad host access (`<all_urls>`) is declared as *optional* so that
the prompt can be per site; it is never requested up front.

A scan reads the page's DOM, computed styles and same-origin stylesheets, and
the SVGs it references. Cross-origin stylesheets and external SVGs are fetched
only when you ask for them (a ZIP export, a per-file download), through the
extension's background worker, using the site access you already granted.

## What it stores

| Where | What | Lifetime |
|---|---|---|
| `chrome.storage.session` | The scan of a tab, your edits to its system, element edits and notes, and which panel tab was showing, per tab | Until the browser session ends or the tab leaves the origin |
| `chrome.storage.local` | The bridge pairing code; per-site design decisions (seeds you moved, variables and scales you set) | Until you clear it |
| `chrome.storage.sync` | The panel theme (system, dark, light) | Synced with your Chrome profile |
| `localStorage` of the panel page | A mirror of the theme choice, read before first paint; where you left the Layers split | Same as above |

Nothing here leaves the browser.

## The agent bridge

`codename-bridge` is a program your agent runs for you (or that you run
yourself). It listens on `127.0.0.1` only, refuses connections from anything
but the extension (by Origin) and requires a pairing code, which it prints
on start, hands to the agent through a `pairing_code` tool, and prints again
for `codename-bridge code`. It speaks to your agent over
standard input and output, on your machine. It writes one file,
`~/.codename/bridge.json`, holding the code, port and its own process id, with
owner-only permissions, and removes it on exit.

What the agent can see through the bridge is what the panel shows: the
change set, the selected element, your notes, and a screenshot of the visible
tab when it asks for one. It can paint a preview stylesheet on the page only
after you tick **Agent may change this page** in the panel menu (on by default
for `localhost`). It never writes to your source through the bridge; that is
the agent's job, in your repository, under your review.

## What it never does

- No telemetry, crash reporting or usage tracking.
- No remote calls except fetching the page's own stylesheets and SVGs.
- No reading of tabs you have not scanned or inspected.
- No persistence of page content beyond the scan described above.
