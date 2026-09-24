# Appendix B — Packaging options for a "live page is the canvas" design tool

Research agent report, 2026-09-24. **[unverified]** = not confirmed from a primary source; **[inferred]** = follows from documented behaviour.

## What the product needs from its shell

| Need | Hard? | Notes |
|---|---|---|
| Same-process DOM access to an arbitrary-origin page (localhost, staging, prod) | Yes | Cross-origin iframes give nothing; you need a content script, a preload, or CDP. |
| CDP-class powers (screenshots, device emulation, `CSS.getMatchedStylesForNode` ranges) | Nice | Today everything is DOM/CSSOM from a content script; CDP buys screenshots, emulation, multi-viewport, precise cascade. |
| Read/write project files, watch, run `npm run dev` | Yes | An extension cannot; some companion process always exists. |
| Host a third-party agent (pty, ACP, app-server, MCP) | Yes | Options differ in whether the agent lives in *your* window or the person's terminal. |
| macOS first, direct distribution | Yes | Mac App Store is off the table for anything that spawns the user's agent or dev server (sandbox). |

## 1. Chrome extension (MV3) + local companion (status quo)

Can: content scripts in any granted origin with full DOM/CSSOM; `chrome.debugger` = CDP from the extension (with the "started debugging" infobar on the tab; Chrome 155, Oct 2026, adds enterprise-policy rejection on managed browsers only); side panel; native messaging (host manifest must be written by an installer, 1 MB message cap) or the existing WebSocket bridge.
Cannot: `showDirectoryPicker()` from popups/side panels (works from a full extension tab); no processes, pty or ports, so the companion is mandatory (two installs, two update channels); remote-hosted code forbidden; store review takes days; one viewport per tab; no terminal in the window.
Effort: lowest. Chrome-only unless ported.
Sources: https://developer.chrome.com/docs/extensions/reference/api/debugger · https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging · https://github.com/WICG/file-system-access/issues/314 · https://developer.chrome.com/blog/debugger-enterprise-policy-restrictions

## 2. Electron app embedding Chromium (`WebContentsView`)

Canvas: real Chromium per pane; `webContents.debugger` = CDP; preload scripts give same-process DOM access to any origin; multiple views side by side = multi-viewport and device frames trivially.
Extensions: `session.extensions.loadExtension` supports unpacked extensions only, a subset of `chrome.*` (`scripting`, `devtools`, `webRequest` full; `runtime`, `storage.local`, `tabs` partial); no `chrome.debugger`, `sidePanel` or native messaging. Reuse the content-script inspector as a preload; the user's other extensions do not run.
Sessions: a fresh profile, so staging behind SSO needs a fresh login; Google sign-in passes in Chromium (fails in embedded WebKit).
FS/process/agent: Node FS, `chokidar`, `node-pty` + xterm.js, ACP subprocess, the existing bridge as a sidecar or in-process.
Distribution: hardened runtime, notarisation, electron-updater; 85–200 MB (Codex Desktop DMG ~330 MiB); 150–300 MB idle plus a renderer per view [inferred]. Onlook: release bundles took 1+ hour and a broken updater stranded users.
Precedents: VS Code 1.109/1.110 (Feb–Mar 2026) integrated browser = CDP-driven Chromium tabs with element-to-chat; Cursor 2.0 (Oct 29 2025) embedded browser with element selection, 2.2 visual CSS editor; stagewise Electron browser (Apr 2026); Onlook v1.
Pain: extension compatibility second-class; DevTools and debugger are mutually exclusive on a view; native modules rebuilt per Electron ABI; you own a browser (certs, popups, downloads, permissions UI).
Sources: https://www.electronjs.org/docs/latest/api/extensions · https://www.electronjs.org/docs/latest/api/debugger · https://code.visualstudio.com/updates/v1_110 · https://cursor.com/changelog/2-0 · https://cursor.com/blog/browser-visual-editor · https://news.ycombinator.com/item?id=44127653

## 3. Tauri v2 (WKWebView on macOS)

Lose: WKWebView speaks the Safari inspector protocol, not CDP; WebKit rendering while the site targets Chrome; no extensions; Google Identity refuses embedded WebKit; multi-webview-in-one-window is still `unstable` with open bugs. You can inject an initialisation script and take snapshots, so a WebKit canvas is possible.
Gain: 3–10 MB bundles, 30–50 MB idle, Rust, `tauri-pty` + xterm.js (Ship Studio's exact stack).
Embedding Chromium: `tauri-apps/cef-rs` exists; atrium shipped CEF panes (Apr–May 2026): ~170 MB added, a helper app, startup deferred, full CDP, and a saga of hit-testing hacks to layer React chrome over the CEF view. Official Tauri CEF support has no ETA.
Verdict: fits an IDE-style shell with a preview iframe; does not fit "the real Chrome page is the canvas" unless you accept WebKit or do the CEF work.
Sources: https://getatrium.dev/blog/embedding-real-browser-tauri · https://github.com/tauri-apps/cef-rs · https://github.com/tauri-apps/tauri/issues/11376 · https://github.com/ship-studio/ship-studio

## 4. Native macOS (Swift/AppKit/SwiftUI + WKWebView)

Same engine limits as Tauri, first-party APIs (`WKUserScript`, `evaluateJavaScript`, `takeSnapshot`), multiple WKWebViews per window without Tauri's unstable layer. Chromium = CEF from Swift (same ~170 MB and process model).
Mac App Store: child processes inherit the sandbox; sandboxed `forkpty` shells fail; the user's PATH, Homebrew node, `~/.claude` are inaccessible [inferred]; App Review is "very wary of apps that require help from a non-App Store component". So Developer ID + notarisation, direct download only, like Ship Studio, Cursor, stagewise.
Effort: highest (AppKit/SwiftUI panel rewrite or a WKWebView-hosted panel, at which point it is a bespoke Tauri).
Sources: https://developer.apple.com/forums/thread/685544 · https://developer.apple.com/forums/thread/747499

## 5. VS Code / Cursor extension, or a fork

Extension: webviews are sandboxed iframes with a null origin; an iframe of localhost inside is cross-origin and its DOM is unreachable; the 2026 integrated browser has no public extension API yet. Workaround: inject the inspector into the dev server via a Vite/Next plugin and talk over postMessage/WebSocket, which only works for projects you can instrument, not staging or prod. Pencil avoids all of this by not rendering the live page.
Marketplace: Microsoft restricts it to VS Code; forks use Open VSX; publish to both to cover VS Code and Cursor.
Fork: monthly rebases against VS Code; Cursor reportedly staffs 8+ engineers on it; no Marketplace. Not credible for a small team.
AI-agnostic: cannot host Claude Code's UI; competes head-on with Cursor 2.2's visual editor and VS Code's own browser tools on their turf.
Sources: https://github.com/microsoft/vscode/issues/209543 · https://code.visualstudio.com/updates/v1_110 · https://www.devclass.com/development/2025/04/08/vs-code-extension-marketplace-wars-cursor-users-hit-roadblocks/1629343

## 6. Hosted web app + local daemon or cloud container

Onlook's shape. The canvas is an iframe you can only instrument if the project loads your script: no staging or prod, no arbitrary pages. File System Access from a web page works in Chrome but cannot spawn a dev server or an agent, so "web app + local daemon" is the current bridge with the panel served from a URL, and you keep the extension for the canvas anyway.
Fits: collaboration, zero install, people without a local environment. Does not fit: "render an arbitrary local project's dev server, the real page".
Sources: https://docs.onlook.com/migrations/electron-to-web-migration · https://webcontainers.io/

## 7. Desktop shell that drives the user's real Chrome over CDP

Chrome ≥136 (Mar 2025) ignores `--remote-debugging-port` on the default profile; you must use a separate `--user-data-dir`, losing sessions and extensions. Chrome 144 (Dec 2025) added an opt-in `chrome://inspect/#remote-debugging` with a permission dialog per connection and an automation banner. The shell gets Node FS, pty and ACP without bundling Chromium, and can inject the inspector via `Page.addScriptToEvaluateOnNewDocument`. A CDP port is a full-profile takeover surface: bind to localhost, random port, per-session token.
Sources: https://developer.chrome.com/blog/remote-debugging-port · https://developer.chrome.com/blog/chrome-devtools-mcp-debug-your-browser-session

## Recommendation matrix

| Must-haves | Best fit | Second | Avoid |
|---|---|---|---|
| Real Chrome, user's sessions, staging/prod, other extensions, minimum effort | 1. Extension + bridge | 7 | 3, 4, 6 |
| Multiple viewports side by side, screenshots, one install, terminal/agent in-window | 2. Electron | 3 + CEF | 5-fork |
| Smallest app, native feel, IDE-ish shell, WebKit acceptable | 3. Tauri | 4. Native | — |
| Mac App Store presence | none realistic | — | — |
| Zero install, collaboration, cloud sandboxes | 6. Web + container | 6 + extension | — |
| Live inside the person's IDE | 5. Extension (instrumented projects only) | — | 5-fork |
| AI-agnostic agent hosting | 2, 3, 4, 7 (pty + ACP + app-server + Agent SDK) | 1 (agent in the user's terminal; bridge speaks MCP/ACP) | 5 |

The status quo is already the maximal-canvas option (real page, real profile, arbitrary origins) at minimal cost. Its two structural ceilings: one viewport per tab and no in-window agent or terminal; two-part install. Electron is the industry answer to both (VS Code, Cursor, stagewise, Onlook v1), and its price is that you become a browser vendor with a fresh profile.

## Cheapest path from "extension + bridge" to each

| Target | Reuse | New work |
|---|---|---|
| 1 → polish | everything | a signed `.pkg` that installs the bridge (and optionally the native-messaging manifest) removes "start the bridge". |
| 2 Electron | bridge becomes the main process; panel UI drops into a view; content-script inspector becomes a preload or an unpacked extension | window/tab chrome, `webContents.debugger`, `node-pty` + xterm.js, ACP client, signing/notarisation/updater. Weeks for a first cut; ongoing browser-vendor tax. |
| 7 Hybrid | bridge grows a CDP client; inspector injected via CDP; panel stays in-page or in a small shell | Chrome launch/attach flow (separate profile, or Chrome 144 opt-in with dialog and banner). Smallest step that yields screenshots and emulation. |
| 3 Tauri | panel UI as the Tauri frontend; bridge as a sidecar; inspector as an initialisation script | accept WebKit or add cef-rs; tauri-pty; multiwebview instability. |
| 4 Native | inspector via `WKUserScript`; bridge as a bundled Node sidecar | full panel rewrite; CEF if Chromium required. |
| 5 VS Code extension | panel in a webview; bridge in the extension host | a dev plugin that injects the inspector; Marketplace + Open VSX. |
| 6 Web | panel served from a URL; bridge as the daemon; extension for the canvas | auth, hosting. |
