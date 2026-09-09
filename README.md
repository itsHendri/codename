# Codename

A designer's toolkit in the browser side panel: read the design system a page
is actually running, edit it, watch the real page repaint, and hand the change
to your agent — which can be connected, so you never paste.

## The five tabs

Layers · Variables · Assets · Export · Changes.

- **Layers** — the page as a tree you can pick from, and the selection you
  picked. The tree lists every element with its own text beside it, searches
  by name or content, folds, hides a layer with one click, and lights a row up
  on the page as you run down it. It is the answer to selecting something with
  no distinctive selector, which is most of a real page. Below it, the
  selection, and what you can change about it. Colour and
  type are open at the top, because that is what you came for; spacing, size,
  radius, border, shadow and text collapse behind a one-line summary. A
  selection stays put: walk the tree with the arrow keys, measure it against
  whatever the cursor is over, and pin a note to it for the agent. When a
  value matches one of the page's own variables the panel offers `var(--x)`
  instead of a literal. Select mode lives on the bar across the page.
- **Variables** — what this page runs on, editable, and live on the page
  while **Preview on page** is on.
  - **Page variables** — the custom properties the page's own stylesheets
    define, under the names it gave them (`--ink`, `--paper`, `--mark`),
    grouped by what they hold, with how many declarations use each. Type a
    value and the page repaints; the brief gets one line: the name, what it
    was, what it should be.
  - **Colours on the page** — every colour it paints with, named or not, with
    where it is used and how often. On a page with no variables this is the
    handle: setting one rewrites the rules that hold the literal.
  - **Palette** — three seed colours read off the page with their OKLCH
    readouts, and the 11-step ramp the engine grows from each. Move a seed and
    every page colour that sits on its ramp follows. The semantic tokens built
    on these ramps live in Export: the page never references them, so they
    cannot be live.
  - **Type** — the families the page really renders and the size/weight/
    line-height ladder it renders them at. Drag any number and the rules that
    set that size follow — `font-size: 15px` says what it is, where a variable
    holding `15px` cannot — and a weight or line-height moves inside rules
    whose size names the role.
  - **Space & shape** — the spacing grid, corner radius and elevation, taken
    from the page, with off-grid strays named rather than rounded in. Moving
    the grid rescales the steps the page uses rather than inventing a ladder,
    and rewrites the paddings, margins and gaps that sit on those steps.
  The **Light / Dark** switch on the bar previews the page in the other side
  of its system: every colour on a light ramp step moves to the mirrored dark
  step, and greys invert by lightness. A preview, not a decision — it never
  enters the brief.
- **Changes** — everything queued for the agent, wherever it came from: token
  definitions, scale changes, element edits with undo, redo and per-change
  revert, and your notes. A note says what it is about — an element, a set of
  them, a region in page coordinates, or a quoted run of text — and carries a
  numbered pin on the page. Hold **View original** to see the page without any of it. The
  actions to copy, send or download the brief live at the bottom.
- **Assets** — every SVG on the page (inline, `<img>`, CSS backgrounds, sprite
  `<use>`, favicons), previewed with copy, per-file download and ZIP export.
- **Export** — `brand.md` for agent context, `tokens.json` in W3C DTCG format,
  and for the edited system `tokens.css`, a `SKILL.md` with its
  `DESIGN_SYSTEM.md` reference, a standalone style-guide page, or all of it as
  a ZIP.

While the panel is open on a site, a bar sits across the top of the page,
the same height as the panel's tab strip and wearing the panel's palette, so
the two read as one tool. It pushes the page down rather than floating over
it (a header the page itself fixes to the top of the viewport still sits
under the bar). On it: the Codename mark, the host, the viewport named by the
preset it matches — "Tablet · 768 × 1024", or "Custom" — with the device
presets behind it, a **Reset** button in the centre whenever there is
anything to take back (every override — variables, colours, scale and
element edits — goes, and so do the dark preview and the viewport preset;
notes stay), a
**Light / Dark** switch, and the modes.
Picking a preset
resizes the window; when the display is too small for that beside the panel,
the page is zoomed out until its CSS viewport is the preset width and the
label says so ("Laptop · 1280 × 800 · 86%"), so breakpoints read true.
**Reset** puts the window and zoom back. **Select** hovers for font, colour
and contrast and clicks to pick an element. **Comment** marks something up:
click an element, drag a box over anything including empty space, shift-click
several, or select a run of text, then type the note in a composer that opens
where it lands. Each mode says what it does as you enter it. Click the mark to
fold the bar to a pill. The mark in the panel's footer opens the menu: theme
(dark by default, light, or follow the system), site access, and the agent
bridge.

Reading the page is automatic wherever Chrome already lets the extension in:
the tab you clicked the icon on, or a site you allowed before. A site it
cannot reach asks for one click; **Always allow localhost** in the menu
makes every dev server open without asking.

## Hand to agent

Anything you change — a seed, the type scale, the grid, an element, a note —
collects into one brief.
It is written at token level: `--mark: #BE3A22 → #1C7F5C (34 usages)` tells an
agent to edit one definition, where a rendered stylesheet would invite it to
stamp a hex across forty components. Element edits are one line per selector
and property, before and after. Notes name the element they are about.

Colour edits reach the page through its own variables, or by rewriting the
rules that hold a literal. Type and spacing edits move variables where a
variable holds the value, and otherwise rewrite the rules whose property
names what the length is — `font-size` is a type size, `padding` is spacing —
failing closed on anything ambiguous: a shorthand moves only when every
length in it is a step, and `calc()`, `var()`, percentages and `em` are left
alone. Either way the change travels as a **scale change** in the brief,
which is an instruction the agent can act on in source.

**Copy** it, download it as JSON, or **send** it, all from the Changes tab.

### Connect your agent

Three steps, which the Changes tab walks you through until you are paired
(**Connect agent** in the footer takes you there):

1. Register the bridge with your agent, once:

   ```sh
   claude mcp add codename -- npx codename-bridge
   ```

   or, for Cursor, in `mcp.json`:

   ```json
   { "mcpServers": { "codename": { "command": "npx", "args": ["codename-bridge"] } } }
   ```

2. Start your agent. It launches the bridge, which prints a six-character
   pairing code — to the agent, not to you. Ask the agent for it (it has a
   `pairing_code` tool), or read it yourself:

   ```sh
   npx codename-bridge code
   ```

3. Enter the code in the panel.

The bridge runs on your machine only: an MCP server on standard input and
output for your agent, a WebSocket on `127.0.0.1` for the panel.

The agent then has `pairing_code`, `get_changes`, a blocking `watch` it can loop on,
`critique` (what a designer would flag on the page — contrast, off-grid
spacing, near-duplicate colours, type strays — as facts with numbers),
`get_selection`, `get_comments` with `set_status` and `reply`,
`get_screenshot`, and — once you tick *Agent may change this page* —
`apply_css` to paint a preview on the tab. Nothing is written to source
through the bridge; that stays the agent's job in your repository, under
your review. See `PRIVACY.md`.

## The rule the extraction obeys

Everything in a scanned system comes from the page, or from neutral engine
defaults — never from a preset brand. Ramps are named after the site's own CSS
variables where it has them (`--brand-primary` → "Brand Primary"); the type
scale is built from what the page renders, with "body" being the size it uses
most; radius, spacing and elevation are observed. Voice is left empty, because a
scan cannot see a brand's tone. The export says all of this in its own header:
the values are observations, not decisions anyone made.

Where the page gives no usable answer, a neutral default is used and the fact is
visible — a wrong answer dressed up as an observation is worse than no answer.

The same rule holds for persistence: the decisions you make against a site
(which seeds you moved) are stored as deltas and laid back over each fresh
scan, so a rescan improves the reading without undoing the decision.

## Development

Requires Node 20+.

```sh
npm install
npm run dev        # hot reload, into dist/chrome-mv3
npm run build      # production build → dist/chrome-mv3
npm run compile    # type check
npx vitest run     # engine, extraction, panel and bridge tests
npm run zip        # store-ready zip
npm run build -w codename-bridge   # the companion, → packages/bridge/dist/cli.js
```

To load in Chrome/Brave: `chrome://extensions` (or `brave://extensions`) →
enable Developer mode → **Load unpacked** → select `dist/chrome-mv3`.

`npm run dev` writes to that same folder, so the extension you loaded once is
always the current one. There is no second build to load and nothing to switch
between. It does not launch its own browser either, so your tabs, granted site
permissions and bridge pairing survive a restart of the dev server.

Panel code is served from the dev server and swaps live with no reload at all;
a content-script change rebuilds and reloads the extension by itself. The one
time you still press reload is after `npm run build`, which overwrites the dev
output with a production one.

Click the Codename icon on a tab and the page is read; on a site Chrome has
not let the extension into yet, allow it when asked. Access is per site, and
nothing is read on a site without it.

### Looking at the panel without installing it

`.harness/` mounts the real side panel in a normal page with a stubbed
`chrome.*` API and a captured scan, so layout work doesn't need an
install-and-reload loop:

```sh
node node_modules/vite/bin/vite.js --config .harness/vite.config.ts
```

Add `?theme=light` or `?theme=dark` to pick a palette. To try the bridge from
the harness, start it with `CODENAME_DEV_ORIGINS=http://localhost:5320`, or
run `packages/bridge/scripts/e2e.mjs`, which spawns the bridge as an agent
would and drives every tool once a panel pairs.

## Architecture

- **WXT + React + TypeScript + Tailwind v4**, Manifest V3. Side panel only —
  there is no options page and no full-tab UI, because the live site is the
  canvas.
- `entrypoints/sidepanel/` — the panel. Its own design tokens live in
  `style.css` (dark default, light override, exposed to Tailwind through
  `@theme inline`); `theme.test.ts` runs the engine's APCA audit against them.
  `lib/session.ts` holds everything about the current tab outside any one
  tab's component tree; `lib/inspect.ts` is the Layers tab's controller;
  `lib/bridge.ts` owns the WebSocket to the companion.
- `entrypoints/scanner.content.ts`, `inspector.content.ts`,
  `reskin.content.ts` — runtime registered, injected via `chrome.scripting` on
  demand. The scanner does one element walk. The inspector is a persistent
  overlay in a closed shadow root: selection, hover, measurements, pins. The
  re-skin script owns three managed sheets: token overrides, element edits,
  and the agent's preview.
- `studio/engine/` — pure functions, no DOM, no React: OKLCH scale generation,
  the semantic layer solved by measuring APCA against real fills, and
  `resolveTokens()`. `studio/export/` turns that one serialization into
  `tokens.css`, DTCG JSON, a style guide page and an agent skill.
- `studio/seedFromScan.ts` — the bridge from a `ScanResult` to a `BrandConfig`.
  `studio/reskin.ts` decides what a seed change does to the page;
  `studio/commit.ts` describes a change for an agent; `studio/changes.ts`,
  `selector.ts`, `measure.ts`, `tokenMatch.ts` and `edits.ts` are the pure
  halves of element editing and persistence.
- `packages/bridge/` — `codename-bridge`, the companion process.
  `shared/protocol.ts` is the one contract between it and the panel.
- Permissions stay minimal: `activeTab`, `tabs`, `scripting`, `sidePanel`,
  `storage`. Broad host access is optional and requested per-site at the moment
  it is needed.

## Status

Working: extraction, the four-tab panel on its own dark design system, live
re-skin, element selection and editing with a changes list, notes, the
hand-off brief, the local bridge with its MCP tools, and the exports. See
`PLAN.md` for what is next and what was deliberately left out.

## License

MIT.

Geist and Geist Mono are bundled under the SIL Open Font License; see
`public/fonts/LICENSE-Geist-OFL.txt`.

The panel's palette, type sizes and spacing rhythm are taken from
[Ship Studio](https://github.com/ship-studio/ship-studio), used under its MIT
licence (Copyright © 2026 Julian Galluzzo and Ship Studio contributors). Token
names and the blue accent are Codename's own; the neutrals, sizes and rhythm
are theirs. `entrypoints/sidepanel/style.css`
carries the notice and says what the choice costs in contrast.
