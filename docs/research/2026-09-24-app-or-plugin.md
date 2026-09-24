# Application or plugin? A structural look, September 2026

Research round asked by Hendri on 2026-09-24 after seeing Omni by Canvs. The brief: forget what is built, look at the long-term goal structurally, and find the most scalable, robust shape for a tool that opens a custom-code web project (forfontsake is the test case), lets a designer adjust the design system and the design on the real page, writes it into the code, and stays agent-agnostic (Claude, Cursor, Codex, ChatGPT, local models).

Four research agents ran in parallel. Their full reports, with sources, are the appendices beside this file:

- [A. Landscape](2026-09-24-appendix-a-landscape.md): 40 tools that put a canvas over code or move tokens to code and agents.
- [B. Packaging](2026-09-24-appendix-b-packaging.md): extension, Electron, Tauri, native Swift, VS Code extension or fork, web app, CDP hybrid.
- [C. Agent protocols](2026-09-24-appendix-c-agent-protocols.md): MCP, ACP, headless CLIs, terms and billing.
- [D. Write-back](2026-09-24-appendix-d-write-back.md): DOM to source, tokens to code, what can be written without an agent.

## The short answer

**The question "plugin or app" is three questions wearing one coat.** Split them and most of the decision makes itself.

1. **Where is the canvas rendered?** The real page in the person's own Chrome (extension), or a page in a browser the tool ships (Electron), or a WebKit view (Tauri, Swift).
2. **Where do files, the dev server and the file tree live?** In a local process, in every option. An extension needs the bridge; an app *is* the bridge with a window.
3. **How does the person's agent get the work?** Over a protocol. This is independent of 1 and 2.

Once split: question 3 has one answer (MCP for pull, ACP for push, appendix C); question 2 is already built and only needs a face; and question 1 is the only real fork, and it turns on two product facts that only Hendri can settle, listed under Questions below.

**Recommendation, with those facts unknown:** do not rebuild as a native app. Keep the real page in real Chrome as the canvas, and grow the bridge into a proper local application that owns the project: a project picker, the file tree in the rail, the dev server, deterministic token writes, and an ACP client that runs whichever agent the person already uses. That gives everything an "IDE with a design layer" implies, except two things that only an embedded Chromium can give: several viewports side by side, and a single one-click install. If either of those is a must, Electron is the one credible app shape, and the migration reuses most of the code.

## Why not just build the app

What the survey found about tools that tried to be the IDE:

- **The desktop visual IDEs for React are gone.** Codux (Wix, Electron, 2022–25) is sunset and its successor is a cloud builder. Utopia's last commit is June 2025. Paperclip is archived. Onlook left Electron in 2025 and gave its reasons in writing: download size, support time spent debugging people's machines, hour-long release builds and a broken updater that stranded users. The desktop tools alive in 2026 (Ship Studio, Subframe, stagewise) survive by hosting the person's agent, not by replacing their editor.
- **The "browser inside the IDE" seat is taken.** Cursor 2.0 (Oct 2025) embedded a browser with element selection, 2.2 added a visual CSS editor, 3.x added Design Mode with multi-select. VS Code 1.110 (Mar 2026) shipped an integrated Chromium browser with element-to-chat. stagewise went from toolbar to Electron browser to "open-source agentic IDE" in twelve months. A one-person Electron app competes with all three on their ground.
- **An embedded browser is a fresh browser.** No logged-in staging, no production site with your session, no other extensions. The plan already records this as the thing none of the adjacent tools have, and the survey confirms nobody has it: web-app tools cannot see localhost, embedded-browser tools cannot see the deployed site with your cookies. The extension sees both.
- **WebKit shells do not fit.** Tauri and a native Swift app render in WKWebView: no Chrome DevTools Protocol, WebKit rendering while the site targets Chrome, Google sign-in refuses embedded WebKit. Embedding real Chromium in either means the Chromium Embedded Framework, about 170 MB and a documented saga of hit-testing hacks (atrium, spring 2026). The Mac App Store is out for any app that spawns a dev server or the person's agent, so a native app buys no distribution advantage either.
- **A VS Code or Cursor extension cannot touch the page.** Webviews are null-origin iframes; a localhost iframe inside one is cross-origin. Pencil lives in the IDE only because it never renders the live page; it owns a file instead.

And what an app would actually add, item by item:

| Wanted from "an app" | Extension + companion | Electron |
|---|---|---|
| Open a folder, see the file tree, find the component | Bridge reads it, rail shows it, "open in editor" deep-links to Cursor or VS Code | Same, in the same window |
| Start and stop the dev server, pick the port | Bridge already does this | Same |
| Write tokens into source without an agent | Bridge, deterministic (appendix D) | Same |
| Run the person's agent and show progress | Bridge as ACP client, panel shows the strip | Same, plus a terminal in-window |
| The real page with real cookies, staging, production | Yes | No (fresh profile) |
| Several viewports side by side, device frames | No, one viewport per tab (presets and the sweep only) | Yes |
| Screenshots and device emulation into the brief | `chrome.debugger`, with Chrome's infobar on the tab | Yes, quietly |
| One install | No: extension plus a signed companion package | Yes |
| Maintenance | Chrome Web Store review, MV3 rules | You are a browser vendor: signing, notarising, updater, certificates, popups, 200 MB |

## What the research changes regardless of packaging

Three findings apply to the plugin and the app equally, and they are bigger than the packaging question.

**1. Most token changes do not need an agent at all.** CSS custom properties in `:root` and theme scopes (forfontsake's shape), Tailwind v4 `@theme`, shadcn's variable blocks, literal values in `tailwind.config` or Panda, and DTCG JSON can all be rewritten deterministically with format-preserving parsers (postcss, recast, jsonc-parser) and verified by re-reading the page. The agent is for what is computed: `cn()` class names, styled-components, SCSS maps, structural moves, and anything on a production build. Ship Studio sells exactly this ("without burning AI credits"); v0's users revolted when deterministic edits started costing credits. "Make changes" should split into "written" and "handed to the agent".

**2. Agent-agnostic has a protocol now.** Being an MCP server covers every agent for *reading* the brief. For *pushing* work ("run this now"), the Agent Client Protocol from Zed is the one cross-vendor path: Cursor, Gemini CLI, Copilot, opencode, Goose, Cline and about thirty others speak it natively; Claude Code and Codex through adapters maintained by Zed and the ACP org; JetBrains, Devin Desktop, Obsidian and Chrome extensions host it. The tool spawns the agent, hands it the project root and its own MCP server in one call, streams back the files touched and the diffs, and answers permission prompts in its own UI. No chat. "Local models" then means opencode or Goose pointed at Ollama, with an honest note that a 30B coder handles a token edit and not a refactor. Nobody in the design-tool field has taken this option yet. Two constraints: Anthropic now meters ACP and Agent SDK use on Pro and Max plans against a separate credit (June 2026), and the July 2026 MCP spec deprecated Roots and Sampling, so the bridge should not lean on them.

**3. Element-to-source mapping is a ladder, and React 19 removed the easy rung.** `_debugSource` is gone; file and line for React now come from symbolicating debug stacks through the dev server's source maps (bippy, LocatorJS v2 do this), Svelte 5 gives exact lines for free, Vue gives the file, Astro hides its attributes behind a toolbar app, Next 16 killed Babel plugins. The robust order is: build attribute if present, framework dev metadata, dev-server maps, repo grep on class and token names, then the agent. The one plugin worth offering a project is code-inspector-plugin (one line, every bundler), as an upgrade, never a requirement. Codename's `data-v-inspector` reader is already stale for vue-inspector v6.

## What Omni is, and what to take from it

Omni is a hosted, demo-gated generator: one brand colour and an archetype in, OKLCH ramps, a type scale, spacing, elevation and grids out, checked with APCA, exported as Figma variables and "structured information" for an agent. It does not read a codebase or draw on a page, so it is not a competitor; it is the *generator* half of a design-system module, and Codename already has the *extraction* half (named ramps, measured type, observed spacing read off the running page). The layer nobody has built, per appendix A, is the middle: edit the type scale, spacing scale and ramps as a system, with a ratio and a base, against the code that defines them, and write back with light and dark scopes preserved. Codename's ramp engine was moved out of Variables into Export because it did not repaint a page written on variables; with deterministic token writes it can, and that is the Omni-shaped thing that belongs in the panel.

## The three shapes, priced

**A. Extension + companion grown into an app (recommended unless a hard must-have says otherwise).** Reuse everything. New: a companion with a project picker and file tree (fed to the rail), dev-server control in the bar, deterministic token writes with a verify pass, an ACP client behind "Make changes", a signed `.pkg` so the companion installs in one step, and the System editor. Roughly: token writes and verify, two to three weeks; ACP client, three to five weeks; companion UI and installer, two weeks; System editor, open-ended.

**B. Electron.** Reuse the panel as-is in a view, the content-script inspector as a preload, the bridge as the main process. New: window and tab chrome, CDP screenshots and emulation, node-pty and xterm.js, ACP client, signing, notarisation, updater. A first cut in weeks; the browser-vendor tax forever; the real-profile canvas lost. Pick this only if side-by-side viewports or one-click install are non-negotiable.

**C. Hybrid: small desktop shell driving the person's real Chrome over CDP.** Keeps the real profile and adds a window, but Chrome 136+ forces a separate profile for remote debugging unless the person opts in through Chrome 144's dialog and banner. Worth knowing about; not worth building first.

Not credible: Tauri or Swift with WebKit, a VS Code fork, a hosted web app for a local-project audience.

## Questions for Hendri

The decision between A and B turns on the first three. The rest shape the work inside either.

1. **Who else uses this?** Only you, or designers on a team who have the repo cloned and a dev server running, or designers who cannot run a dev server at all? The third group needs a cloud shape and neither A nor B serves them.
2. **Is one viewport at a time acceptable for good?** Framer and Figma show breakpoints side by side; the extension can only do presets and a sweep in one tab. If side-by-side canvases are a must, that alone decides for Electron.
3. **Do you need staging and production pages with your logins?** This is what Electron loses and the extension keeps. If the answer is "only ever localhost", B loses its biggest cost.
4. **What does "see my folder structure like an IDE" need to do?** Find the component that rendered this element, open it in Cursor, or actually read and edit code text in the tool? A file tree in the rail plus "open in editor" covers the first two.
5. **Should token changes be written by the tool itself, no agent, when it can do so safely?** With the agent taking only what is computed or structural.
6. **Which agents do you use day to day, and how are you signed in?** Subscription or API key changes what ACP costs you (Anthropic's Agent SDK credit) and which launch commands go in the table.
7. **The design-system module: generate from scratch like Omni, adjust the existing system as a scale, or both?** And which exports matter: Figma variables through `use_figma`, DTCG JSON, an agent-readable DESIGN.md or skill file?
8. **What project shapes are in scope?** forfontsake is Vite, React 19, plain CSS variables, no Tailwind. Is the target Vite/Next + Tailwind v4 + CSS variables, or also Astro, Svelte, Vue, SCSS?
9. **Are you willing to ask a project to install a one-line dev plugin** for exact file and line on React and Next, with a selector fallback when it is absent?
10. **Do you want a terminal or the agent's output in the same window,** or is "the agent runs, the page repaints, the Changes tab shows the diff" the whole story, as the no-chat rule says?
11. **Is this a personal tool, an open-source project, or a product?** It changes whether one-click install, signing certificates and store review are worth paying for now.
12. **Rebuild or evolve?** Everything above reuses the inspector, the panel and the bridge. If the appetite is a clean rebuild anyway, the same shapes apply, but the order of work changes.

## Decisions, 2026-09-24

Hendri's answers to the questions above, and what they settle.

- **Audience:** other designers in the same situation, with the repo cloned and a dev server running. Local shape; no cloud container.
- **One viewport at a time is fine.** Multiple would need a synthetic canvas, which the live-page rule declines. Electron's main advantage falls away.
- **Staging and production with logins: not now.** The design layer on localhost comes first. The extension keeps that door open at no cost.
- **Folder structure like an IDE: not needed.** What was wanted is knowing where components and styles live; that is shown visually (the rail's layers and components, "defined at" on a variable, open-in-editor), not as a tree of files.
- **Token changes are written by the tool, no agent,** wherever it can do so safely and verify the page; the agent takes only what is computed or structural.
- **Agents:** Claude, Gemini and ChatGPT on subscriptions. Claude Code and Gemini CLI are the first two entries in the ACP launch table; Codex through its adapter where a person has it; ChatGPT itself has no local agent and stays a read-only surface.
- **Design-system module: both.** Generate a system from scratch to start a new project on, and adjust the one a project already runs, as a scale. Export a DESIGN.md the person can hand to any agent; the DTCG token file the export already writes stays as the machine-readable twin.
- **Project shapes:** websites and marketing sites. First targets are CSS custom properties and Tailwind v4 `@theme` (which covers Vite, Next and Astro), then plain CSS rules, then SCSS.
- **Open source.**
- **Evolve, not rebuild.** The shape the research recommends is the shape that exists; the work is additive (below).

Terms explained, since they were unclear: **DTCG JSON** is the W3C Design Tokens Community Group format, a standard JSON file for tokens that Figma, Penpot, Tokens Studio, Style Dictionary and Terrazzo read, first stable in October 2025; DESIGN.md is the prose twin for agents, the JSON is the twin for tools. **Question 9** asked whether Codename may offer a project a one-line addition to its Vite or Next config so that clicking an element gives the exact file and line on React 19, with a fallback to the current name-and-selector reading when the line is absent. **Question 10** asked whether the panel should show the agent's live output while it works, or stay silent apart from the Changes tab; the no-chat rule says silent, with a progress strip of files touched.

## Order of work

Revised the same afternoon, after the System research (plan in `~/.claude/plans/`, decisions below). Each is its own PR.

1. **W40 Token writer (bridge).** `writeTokens` replaces the one-definition Apply: scope-aware (light targets root and `@theme`; dark targets the page's dark blocks; width and scoped never), multi-scope, verified by the panel re-reading the page, reverted on contradiction, and the Changes tab split into Written and Handed to the agent.
2. **W41 Token graph (scan).** Definitions with scope, alias chains, the four type-style forms detected, and the authored declaration for a selected element so the panel can say "is --x".
3. **W42 On the system (Style tab).** The type-style row with a switcher, colour token pills with Swap / Edit globally / Detach, selection tokens aggregated.
4. **W43 System replaces Variables and Export.** Colour ramps and semantic table, type styles and scale, space, radius, elevation, the tokens table by scope, and Export as one action (DESIGN.md, tokens.css, tokens.json, specimen.html, ZIP). Tabs become Style · System · Changes.
5. **W44 Specimen view.** A styles page drawn in the page's own document (light DOM so the page's rules apply), toggled from the bar, selectable, saveable as HTML.
6. **W45 Generate from scratch.** The bridge writes a tokens stylesheet into the project; adoption of literals goes to the agent.
7. **W46 DESIGN.md.**
8. **W47 Agent path, small.** Gemini CLI through its headless JSON, and a per-agent "run in a terminal" option as the zero-risk path if Anthropic's metering lands. The current Make changes path stays.
9. Later: the React 19 source ladder, the optional one-line plugin, the vue-inspector v6 fix, the signed companion package and store listing.

## Decisions on the System environment, 2026-09-24

- **Panel + Specimen view**, not a full-tab takeover. Every tool that edits a system on a real product keeps the product visible; every full-screen styles page previews canned components that drift; the deleted W4 Studio failed for the same reason. The Specimen must be light DOM inside the page so the page's own `h1 {}` and `.card {}` rules apply; a shadow root inherits variables and fonts but not rules.
- **"H1 → H2" means the type style,** not the tag. Tag changes stay with the agent.
- **Generate writes into the project** (a tokens stylesheet; the import and literal adoption go to the agent).
- **Export folds into System** as one action. DESIGN.md is the only agent-facing file; brand.md, SKILL.md, DESIGN_SYSTEM.md, the extractor tokens.json, brand.json and preview.html go. The specimen saves as HTML instead.
