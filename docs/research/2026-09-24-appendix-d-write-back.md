# Appendix D — Write-back: DOM → source, and design-system changes → code

Research agent report, 2026-09-24. Grounded against `forfontsake` (Vite 8.2 + React 19.2, tokens as plain `:root` / `[data-theme]` custom properties in `src/index.css`, no Tailwind) and `codename` (`studio/framework.ts` already probes React `_debugOwner`, Vue `__vnode.ctx`/`__file`, Angular `ng.getComponent`, `data-v-inspector` and `data-inspector-relative-path`; `studio/scan/customProps.ts` records `sheet.href`; `studio/tokenFile.ts` reads DTCG 2025 dimension objects; `packages/bridge` spawns the dev server from the lockfile's package manager).

## 1. Source mapping: DOM node → file + line + component

**React 19.** `_debugSource` is gone (PR #28265); fibers carry `_debugStack` (an `Error` in *generated* coordinates), `_debugOwner` (or a plain `{ name }` across a server-component boundary) and `_debugTask`. Issue facebook/react#32574 lists eight tools broken by this. What works: symbolicate `_debugStack` yourself through the dev server's source maps. MIT building blocks: **bippy** `getSource(fiber)`, **React Grab**, **element-source** (React, Vue, Svelte, Solid, Preact). **LocatorJS v2** (Jan–Aug 2026) does runtime-only resolution with its own VLQ decoding and falls back to Next's `/__nextjs_original-stack-frames`; an open issue from Jul 2026 still reports React 19 failures. Server components have no client fiber. Sources: https://github.com/facebook/react/issues/32574 · https://github.com/aidenybai/bippy · https://github.com/aidenybai/element-source · https://github.com/infi-pc/locatorjs/pull/208

**Compile-time attribute plugins.** **code-inspector-plugin** injects `data-insp-path` across webpack, Vite, Rspack, Farm, esbuild, Turbopack and Mako, for Vue, Nuxt, React, Next, Preact, Solid, Qwik, Svelte, Astro (Turbopack: attribute only; a Next 16 loader-order bug can land it in the RSC graph). **xray** builds on it for React 19 + Next 15+ + Turbopack. Onlook now stamps `data-oid` itself because it owns the sandbox filesystem; a tool over the person's own checkout cannot do that without being a plugin. Sources: https://github.com/zh-lx/code-inspector · https://github.com/ivanstnsk/xray

**Vue:** vite-plugin-vue-inspector v6 no longer injects `data-v-inspector` (codename's reader covers v5 and earlier); fall back to `__vnode.ctx.type.__file` (dev only, file not line). **Svelte 5:** dev builds attach `__svelte_meta.loc` (file, line, column) to every element, no plugin. **Astro:** the compiler emits `data-astro-source-file/loc` but since PR #13602 (Apr 2025) the toolbar strips them from the DOM; a Dev Toolbar app is the sanctioned route. **Next 16:** Turbopack default, Babel unsupported (SWC plugins only); `/__nextjs_launch-editor` and `/__nextjs_original-stack-frames` endpoints; an MCP endpoint at `/_next/mcp` with no DOM→source tool. **Vite dev:** every injected stylesheet is `<style data-vite-dev-id="/abs/path.css">`; JS is served per file with inline maps, so `_debugStack` frames already carry `/src/App.tsx` URLs.

**CSS declaration → file.** CSSOM gives `parentStyleSheet.href` (null for `<style>`; use `ownerNode.dataset.viteDevId`), no rule→line. CDP `CSS.getMatchedStylesForNode` returns every matched rule with `styleSheetId` and a `range`, and `sourceMapURL` gets to the original file:line; cost is the debugger infobar. Without any of that: selector, computed style, rule text and sheet URL, and a grep for a unique class or `--token` name usually finds the declaration.

**Most robust strategy (layered per element):** 1 build-emitted attribute if present; 2 framework dev metadata from the main world (Svelte loc, Vue file, React owner chain plus symbolicated stack); 3 dev-server APIs for symbolication; 4 repo search on class names, `--var` names, text, rule text; 5 the agent with the brief when 1–4 disagree or are empty. The one plugin worth offering is code-inspector-plugin (or a ten-line own Vite/SWC plugin emitting the same attribute), as an accuracy upgrade, never a requirement. In production, say nothing rather than guess.

## 2. Writing design-system changes into code

**DTCG status.** Format Module **2025.10** is the first stable version (Oct 28 2025; Adobe, Google, Microsoft, Figma, Framer, Penpot and others as editors): colour objects with `colorSpace`, dimension objects `{ value, unit }`, aliases, groups. The Resolver Module (sets, modifiers, theming) is still a draft (Jun 17 2026). Style Dictionary v5 uses DTCG as base, 2025.10 support incremental (#1590). Terrazzo claims full DTCG including resolvers in 2.0 and generates a Tailwind v4 `@theme`. Figma: right-click a collection → Export to JSON, drops `description`, composites trail, import promised. Penpot exports the Tokens Studio shape. Tokens Studio has a DTCG/legacy switch. **Read the project's tokens; keep a DTCG file only as an exchange artefact.** Sources: https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/ · https://www.designtokens.org/tr/drafts/resolver/ · https://github.com/style-dictionary/style-dictionary/issues/1590 · https://terrazzo.app/docs/integrations/tailwind/

**Can the tool rewrite it deterministically?**

| Expression | Find | Deterministic rewrite | Hand to the agent when |
|---|---|---|---|
| CSS custom properties in `:root`, `[data-theme]`, `.dark`, media scopes (forfontsake's shape) | postcss walk for `decl.prop === '--x'` per scope | Yes; postcss keeps `raws` (comments, whitespace); write the current mode's scope, report the others | value is `var()`, `color-mix()`, `calc()` and the person typed a literal |
| Tailwind v4 `@theme` / `@theme inline` (+ shadcn's `:root`/`.dark` oklch vars) | postcss: an ordinary at-rule | Yes; `__unstable__loadDesignSystem` from `tailwindcss` resolves a class → the theme var it reads, so an element edit can be routed to the token | the token lives in `@import`ed vendor CSS; `--spacing` multiplier semantics |
| Tailwind v3 `tailwind.config.*` | recast or ts-morph on the object literal | Yes for static literals; recast reprints only the changed node | `require()`, functions, spreads, presets, plugins |
| Open Props | the project's own override | rewrite the override, or insert one (a design decision, confirm) | never touch `node_modules` |
| Panda `panda.config.ts`, vanilla-extract `createGlobalTheme` | ts-morph | Yes for literals (`createTheme` hashes names, needs the contract) | composition, functions, split files |
| SCSS maps | postcss-scss (map is an opaque value) | only simple `$var: value;` | any map, `map.merge` |
| DTCG JSON → Style Dictionary / Terrazzo | tokens JSON is the source | Yes: `jsonc-parser` `modify` (format-preserving), then run the project's build script | never edit generated CSS; build script not discoverable |

Tools: **postcss** (MIT) for anything CSS-shaped, the only CSS parser that preserves formatting; **lightningcss** (MPL-2.0) reprints and drops comments, analysis only; **recast** (MIT) for JS/TS literals; **ts-morph** (MIT) when types matter; **magic-string**; the project's own Prettier/Biome only if present.

## 3. Element-level write-back

How others do it: Onlook `data-oid` → Babel parser, merges Tailwind utilities into a literal `className`, agent for `cn()`/template strings. Cursor Design Mode: overrides until Apply, then the agent writes; Builder.io reports raw values instead of tokens, state blindness, duplication, unreliable undo. Ship Studio: verbatim class grep, direct write with drift protection, dynamic classes read-only. Lovable: Vite plugin IDs, client-side AST mutation, no LLM. Codux wrote CSS/Sass/Stylable directly.

Decision rule for where a change lands: 1 value came from `var(--x)` and the person changed the token → write the token (global by design; the brief counts uses). 2 came from `var(--x)` but only this element should change → do not touch the token; local override (Tailwind utility, own rule declaration, or agent for styled-components). 3 literal matching an existing token → write `var(--x)`. 4 new literal, no token → write where the element's style lives and flag "no token holds this".

Per system: Tailwind class on JSX (literal → tailwind-merge semantics, resolve utilities via the design system, not a hand table; computed → agent); CSS Modules (`data-vite-dev-id` → file, postcss); plain CSS (sheet href → file, selector → rule; CDP ranges settle duplicate selectors); styled-components/Emotion (agent, with component name and declaration); inline style (rarely the right home, note it). Conflicts: compute from the observed cascade, refuse to write when the visible value would not change (`!important`, another rule wins), and say why.

Agent reliability: no published edit success rates from Onlook, stagewise, Cursor or Impeccable; benchmarks measure whole-app generation. The only edit-specific evidence is qualitative (Builder.io on Cursor). So every agent write needs a verification pass: reload, re-read the computed value, say so when it does not match.

## 4. Project understanding

File tree: `git ls-files` or `fs.readdir` + `ignore`; watch with `@parcel/watcher` or chokidar 4. Component files: glob `**/*.{tsx,jsx,vue,svelte,astro}`; names via `@ast-grep/napi` or oxc-parser; no language server. Framework and dev command: `@netlify/build-info`, or the ten-line detector the bridge already has (lockfile → package manager, deps, config files, `scripts.dev`). Start the server by spawning the project's `dev` script under node-pty and parsing the first `http://localhost:PORT`; programmatic Vite/Astro/Next APIs couple you to versions (Next 16 custom servers lose parts of `next dev`). Spawn, don't embed. Cursor points its browser at a URL the person supplies; Onlook runs the app in a CodeSandbox container; Ship Studio runs the dev command in a pty.

## 5. Building blocks and licences

Verified: Onlook Apache-2.0; Ship Studio MIT; stagewise AGPL-3.0; Webstudio and its css-engine AGPL (avoid); lightningcss MPL-2.0 (fine as a dependency); `@ast-grep/napi`, bippy, element-source, react-dev-inspector MIT. From memory, verify: postcss, `@tailwindcss/node`, ts-morph, recast, magic-string, Prettier, chokidar, `@parcel/watcher`, node-pty, Terrazzo, jsonc-parser, `@netlify/build-info`, code-inspector-plugin, LocatorJS, React Grab MIT; Style Dictionary Apache-2.0; Biome MIT/Apache-2.0.
Worth reusing: bippy/element-source, code-inspector-plugin, postcss + `__unstable__loadDesignSystem`, recast, jsonc-parser, `@parcel/watcher`, node-pty, `@netlify/build-info`. Not worth reusing: Onlook's parser (tied to its sandbox FS), Webstudio's engine (AGPL, different model), Plasmic loader.

## Recommended write-back architecture

**The tool writes itself (deterministic, previewed, one-line diff):** token values in CSS custom properties, Tailwind v4 `@theme`, shadcn var blocks (postcss, scope-aware); literal values in `tailwind.config.*`, `panda.config.ts`, `createGlobalTheme` (recast); DTCG JSON when the project builds from it (jsonc-parser, then the project's build); element-level plain CSS and CSS Modules declarations, literal `className` Tailwind edits. Every write gated by "re-read the page: does the computed value now equal what the person set?", reverted with a message when not.
**The tool hands to the agent:** computed classNames, styled-components/Emotion, SCSS maps, config values that are functions or imports, tokens in vendor CSS; structural changes; anything touching a breakpoint or a second theme scope the person did not edit; everything on a production build or unknown framework.
**Plugin it may offer:** code-inspector-plugin or a tiny own plugin, as an accuracy upgrade.
**With nothing installed:** Svelte 5 exact line; Vue file; React component name always, file:line via symbolicated `_debugStack`; any CSS in Vite dev via `data-vite-dev-id`; any CSS anywhere via CSSOM sheet href; CDP ranges as an opt-in precise mode.

## Risks, ranked

1. React source location rests on undocumented internals React has already changed once. Name-only is always safe; lines are advisory; offer the plugin.
2. Agent writes drift from tokens (documented for Cursor), no published success rates. The brief names the token and file; verify by re-reading the page.
3. Framework churn removes hooks (Astro stripped attributes Apr 2025, vue-inspector v6, Next 16 dropped Babel). Feature-test per hook, version matrix in CI.
4. Cascade misattribution. Only write when the observed value changes as predicted; CDP for precise mode.
5. Formatting damage from reprinting. postcss/recast only; the project's own formatter.
6. Tailwind `__unstable__loadDesignSystem` is unstable; v3/v4 diverge. Pin per major.
7. DTCG toolchain immaturity. Read leniently, write minimal edits.
8. Licence exposure (Webstudio, stagewise AGPL).
9. Multi-scope tokens (light/dark/breakpoint). Write the current scope, list the others.
10. Dev-server coupling if embedding framework APIs. Spawn the script.
