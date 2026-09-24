# Appendix A — Landscape: design canvases over custom code, and token tools that reach code and agents

Research agent report, 2026-09-24. Dates are the dates of the cited sources. **unverified** marks anything not confirmed from a primary source.

## Comparison table

| Tool | Form factor | Source mapping (click → file) | Write-back | AI link | Open / paid |
|---|---|---|---|---|---|
| **Onlook** | Was Electron; now web app + cloud container (CodeSandbox SDK) | Build-time attribute stamped on DOM (data-oid) | Live CSS/DOM injection, then AST rewrite; own agent with fast-apply | Own agent (OpenRouter, Morph/Relace, Vercel AI SDK) | Apache-2.0, 26.8k★; closed beta, team pricing, self-host free |
| **Pencil / pen.dev** | VS Code/Cursor/Windsurf/Antigravity extension + desktop app + CLI | None on a live page: its own `.pen` JSON file in the repo | Agent converts canvas → code on request; code → canvas import | Local MCP server; any MCP client | Free for now; app closed-source, `.pen` format open |
| **stagewise** | npm toolbar → Electron "browser" → "open-source agentic IDE" | Toolbar sent DOM + plugin context; now agent has tab DOM/console/debugger | Own agent edits files | Own agent; BYOK; "will open to other agents" (no protocol named) | AGPL-3.0, 6.8k★; Free / $20 / $200 / Enterprise |
| **Ship Studio** | Tauri 2 (Rust) desktop, macOS/Windows | Heuristic: element signature, greps source for the verbatim `className` literal, disambiguates by tag/text/ancestors | Direct file write with drift protection (no AI); dynamic classes read-only | Claude Code / Codex / OpenCode in PTY tabs | MIT, 276★; free, no account |
| **Design Mode (designmode.app)** | Chrome + Firefox extension, side panel | CSS selectors; override stylesheet keyed by selector; "grep-ready selectors + source-file hints" | Agent writes via MCP `get_changes`/`apply_changes`/`export_changes`, or copy-as-prompt | MCP server (cloud relay / local / self-host) | MIT, ~52★; free |
| **Codux (Wix)** | Electron desktop IDE | Renders React components in "boards"; edits styles in source | Direct write to CSS/Sass; variables via Theme Manager | AI board generation (2023); no MCP | Sunset; successor DAZL (web app builder) |
| **Utopia** | Web app (+ embedded VS Code) | React code is the source of truth; AST rewrite | Direct AST write | None | MIT, 3.8k★; last commits June 2025 |
| **Plasmic** | Web Studio; codegen or runtime loader | Own model; registers your code components | Codegen writes generated React into repo | Plasmic MCP (May 2026) | unverified |
| **Webstudio** | Web app, self-hostable | Own project model | CLI export to Remix/React | MCP detail unverified | AGPL core, 9k★ |
| **Builder.io Fusion** | Cloud dev env + desktop app + VS Code ext + CLI | "deterministic source mapping connecting code to pixels" (mechanism unverified) | Agent produces PRs | Own agent; Builder MCP | Free / $24 / $40 / Enterprise |
| **Cursor Design Mode** | Inside Cursor's built-in browser | xpath + component + attributes + computed styles + fiber props + screenshot | Cursor's agent edits | Cursor's agent only | Cursor subscription |
| **Google Stitch** | Web app (Labs) | Generates; no live-code mapping | Export HTML/Tailwind, Figma, DESIGN.md | MCP server + SDK + skills | Free with caps |
| **Figma** | Desktop/web + local and remote MCP | Code Connect; `get_variable_defs`; `generate_figma_design` (live HTML → layers) | Agents write to canvas (`use_figma`, beta Mar 2026); Code Layers preview (Config, Jun 2026) | MCP server; Figma Design Agent is an MCP client | Paid seats |
| **Framer 3** | Web app | Proprietary project | Agent edits canvas/components/CMS/styles on a branch | `npx @framer/agent setup` local bridge + skill; Claude Code, Cursor, Codex, Antigravity, Windsurf | Framer plans |
| **Webflow Source / MCP 2.x** | Web platform (research preview, Sept 2 2026) | "connects your codebase and martech" (details unverified) | Agents work in governed code | MCP 2.0/2.1 | Enterprise-led |
| **Penpot** | Web / self-host | Design file; native tokens | Token JSON export (Tokens Studio shape, not DTCG 2025.10) | Penpot MCP in core (Feb 2026) | Open source |
| **Tokens Studio** | Figma plugin + Studio | Tokens graph | Exports CSS etc. | MCP from €17/mo tier | €17 / €169 / €499 |
| **Style Dictionary v5 / Terrazzo** | Node CLI/lib | DTCG JSON | Generates CSS/SCSS/iOS/Android/… | None | Open source |
| **Supernova / Knapsack / zeroheight** | Web platforms | Design-system data | Exporters | MCP (Supernova Editor MCP can write) | Paid |
| **Storybook 10.3+ / Chromatic** | Node dev server / cloud | Stories | Agents write stories; tokens "future" | Storybook MCP (Apr 2026) | Open source / paid |
| **Subframe** | macOS desktop app + web canvas | Imports components and tokens from repo; own canvas | Deterministic React+Tailwind export, CLI sync | Claude Code/Codex built in + MCP + skills | Free / $20 |
| **v0 / Lovable / Bolt visual edits** | Web | Lovable: Vite plugin stamps stable JSX IDs at compile time | Lovable: client-side Babel/SWC AST mutation, no LLM; v0/Bolt: model | Own agents | Paid; v0 users revolted when deterministic edits started costing credits |
| **Kombai** | VS Code extension | Figma/image → code; Context Graphs reuse tokens | Agent writes | Own agent | Credits |
| **Dyad** | Electron desktop, local | unverified | Own chat agent | BYOK / local models | Apache-2.0 + FSL |
| **Omni by Canvs** | Hosted web app (omni.canvs.in) | Generator, not a code reader | Figma variables (108 across light/dark); "structured information" for agents | Unspecified | Demo-gated |
| **Reticle** | npm SDK + Babel/Next plugin + MCP | `data-reticle-source` at build → file:line | Agent fixes | MCP; built on Claude Agent SDK | SDK open source |
| **Agentation / react-grab / LocatorJS** | npm toolbar / script / extension | Selectors, or React fiber → file:line | Copy for any agent | MIT | Open |
| **Superposition** | Desktop app | Extracts tokens from any live URL | Export CSS/SCSS/JS/Figma/XD | None | Free |

## Notes that matter for the decision

**Onlook, Electron → web.** Their migration doc lists: "Downloading hundreds of MB of app", "Setting up / managing local dev environment", "spent a lot of support time helping users debug their local machine"; the upside is editing anywhere and collaboration. On HN (Jun 2 2025) Kiet Ho added that desktop release builds took over an hour and an autoupdater bug could strand users; a local-server mode was "planned". The move cost them direct DOM access (webview → iframe + injected postMessage script) and the local filesystem (→ cloud container). Sources: https://docs.onlook.com/migrations/electron-to-web-migration · https://news.ycombinator.com/item?id=44127653

**Pencil.** Tom Krcha: "an MCP driven canvas built around open design files that live directly in your codebase and in your IDE, so all your AI agents can read them and write them". The bet is co-location with code and agents; it never touches the running page. https://x.com/tomkrcha/status/1973033972654559476 · https://docs.pencil.dev/getting-started/installation

**stagewise.** Toolbar that forwarded element context into Cursor/Copilot/Windsurf broke when Cursor 1.0 ignored it; they built their own agent, then an Electron "developer browser" (Apr 8 2026: "stitching that together across a browser, a terminal, and an IDE was the real bottleneck"), then "the open source agentic IDE" (May 8 2026). https://www.stagewise.io/news/the-coding-agent-built-for-the-web · https://www.stagewise.io/news/becoming-the-open-source-agentic-ide

**Ship Studio.** No build plugin. A script in the preview iframe captures an element signature; Rust greps source for the verbatim class literal; results are Resolved, Multi (user picks) or ReadOnly (dynamic classes). Direct write with drift protection, "without burning AI credits". Agents hosted in PTY tabs. https://deepwiki.com/ship-studio/ship-studio/5.1-visual-editor

**Design Mode.** The closest existing thing to Codename: an extension that discovers CSS custom properties across theme scopes, marks token-backed values, offers "swap token" and "edit token globally" in an override sheet, and hands selectors plus source hints to any MCP agent. One developer, 52 stars. https://www.designmode.app/

**Codux → DAZL, Utopia, Paperclip.** A three-year Electron visual IDE for React was sunset in 2025 and its successor is a cloud app-builder; Utopia's last commits are June 2025; paperclip-ui archived July 2025. Desktop visual IDEs that tried to *be* the IDE did not survive; the desktop tools alive today host the person's agent instead (Ship Studio, Subframe).

**Cursor Design Mode.** Sends xpath, component, attributes, computed styles, fiber props and a screenshot to Cursor's agent; 3.7 (Jun 2026) added multi-select and voice. Single-agent. Builder.io's critique (Dec 19 2025): it "has to guess" where code lives, maps to raw values instead of tokens, no reliable undo. https://www.builder.io/blog/cursor-design-mode-visual-editing

**Lovable Visual Edits (Mar 13 2025).** The clearest write-up of deterministic edits: a Vite plugin stamps stable JSX IDs, the codebase is synced to the browser as an AST, edits are client-side Babel/SWC mutations plus a client-side Tailwind generator, no LLM. https://lovable.dev/blog/visual-edits

**Omni by Canvs.** Hosted at omni.canvs.in; walkthrough by Arjun Rajkishore (Sept 22–24 2026): colour ramps from a pasted hex, type scale with line heights snapped to a grid, columns and gutters, spacing, WCAG + APCA checks, mockup previews, "values also arrive as tokens". Exports Figma variables (108 across light and dark); agents "receive the same system as structured information" (format unnamed). Demo only, no pricing. Canvs is a Mumbai/Bangalore BFSI design studio; stated direction is "an agentic design harness that builds components, complete screens and live, project-aware libraries". It generates a system from scratch; it does not read an existing codebase. https://canvs.in/blog/omni-a-walkthrough · https://canvs.in/agents

## Patterns across the field

- **Web app + cloud container** won non-developers (Onlook v2, Builder Fusion, Tempo, Lovable, Bolt, v0). They own the build, which is what makes deterministic mapping possible.
- **Desktop shell with its own webview** won "your machine, your agent, no credits" (Ship Studio, stagewise, Dyad, Subframe). Survivors host agents rather than replace the IDE.
- **IDE extension** won the developer-designer hybrid (Pencil, Kombai) by co-location, and by owning a file rather than the live page.
- **Browser extension** won individual developers who refuse to touch their build (Design Mode, LocatorJS). No file access, so write-back is always "hand to an agent".
- **Mapping techniques, by determinism:** build-time stamping (Lovable, Onlook, Reticle) → React fiber (Cursor, LocatorJS) → verbatim class grep (Ship Studio) → selectors + grep hints (Design Mode) → screenshot + description.
- **Write-back** converged on a hybrid: deterministic for style and text, agent for structure. Routing everything through a model draws credit-cost complaints (v0 2026, Bolt).
- **AI-agnostic** tools are MCP servers exposing state, or PTYs hosting any CLI. Nobody in the set uses ACP yet.
- **Tokens:** only Design Mode and Superposition read tokens from the running page. Stitch's DESIGN.md and Omni's agent export are the new pattern of portable agent-readable system files, generated from scratch.

## What nobody has built yet

1. A live-page editor whose model is the codebase's own token system, editing the type scale, spacing scale and colour ramps as a *system* against the code that defines them, with light/dark/layer scope preserved.
2. Deterministic mapping without owning the build, in an AI-agnostic tool (an optional one-line plugin with a selector fallback).
3. A desktop or local "design layer over any repo" that hosts *your* agent through a standard protocol (MCP + ACP) interchangeably.
4. Runtime token drift: the tokens the page computes vs the source in the repo vs Figma variables, in one view.
5. Code-first export in all three directions from one read of the running app: Figma variables, DTCG JSON, an agent-readable DESIGN.md/SKILL.md.
6. A production-page path: the deployed site and the local dev server as the same canvas, write-back only when the bridge is present.
