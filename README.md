# Codename

A designer's toolkit drawn on the page itself: read the design system a page
is actually running, edit it, watch the real page repaint, and press **Make
changes** to have your own coding agent write it into source — no chat to open,
nothing to paste.

Click the toolbar button and Codename frames the tab the way a design tool
frames its canvas: a **bar** across the top, a **rail** on the left, the
**panel** on the right, all drawn in the page and pushing it inward. Click it
again to put the page back. On pages Chrome keeps extensions out of, the
button opens Chrome's side panel instead, to say so.

## The rail, and the four tabs

Layers and Assets stand in the page, in a **rail** on its left, where a
design tool keeps its tree; the panel on the right is Style · Variables ·
Export · Changes. Both are drawn in the page under the bar, each pushing the
page in by its own width (drag the rail's edge, 180 to 420px; the panel's,
320 to 520px). **Layers** on the bar, or **Alt+L**, folds the rail. The
panel is the extension's own page in a frame, so it has everything the side
panel had; a navigation redraws it once the new page loads, where the site
has been allowed.

- **Pages** (in the rail) — the site's pages as this page links to them,
  read off the page and deduped by path; click one to go there.
- **Layers** (in the rail) — the page as a tree you can pick from, an icon
  on each row for what kind of thing it is. Above the tree, **Components**: the class selectors that repeat on
  the page with something inside them (`.card` ×12), read off the page rather
  than a framework; pick one and the edit scope is all of them. The tree
  lists every element with its own text beside it, searches
  by name or content, folds, hides a layer with one click, and lights a row up
  on the page as you run down it, walks from the keyboard (up and down move
  the selection, left and right fold and unfold, Enter picks), and can leave
  out the layers the page is not painting. Drag a row before or after any
  other, or onto one to put it inside as the last child, and the page moves
  the element — a preview, since a framework that owns the DOM may put it
  back on its next render — and the brief carries the move as a sentence
  about the markup: where it was, where to put it. Undoable like any edit. It is the
  answer to selecting something with
  no distinctive selector, which is most of a real page. Below it, the
  selection, and what you can change about it. Where the page is a dev build
  that still knows, the header names the component that rendered the element.
  A content script cannot see this — a framework's bookkeeping lives on the
  page's own objects, which an isolated world does not share — so the panel
  asks the page itself and reads back a name: React's dev-only record of
  which component rendered what, Vue's owning instance and the file its
  compiler stamped on it, Angular's dev-mode global, or the attribute a Vite
  inspector plugin wrote. A production build has none of that and says
  nothing, which is right: its names are minified, and a minified name
  presented as a fact is worse than silence. The brief carries whatever came
  back, so the agent knows which file to open. Colour and
  type are open at the top, because that is what you came for; spacing,
  layout (display, flex direction, justify, align, wrap), size, radius,
  border, effects and text collapse behind a one-line summary. **Effects** is
  the shadow taken apart — inset, offset, blur, spread and colour, one row
  per layer — plus a blur radius for the element and for what sits behind it.
  **Motion** is the transition: what moves, how long it takes, how long it
  waits, and on what curve, the curve picked by name and written back as the
  page's own `var(--ease-out)` where it has one. **Play** runs it, by taking
  the element out of the state it is held in and putting it back. A value the
  fields cannot give back exactly — a `var()` for the whole shadow, a filter
  that is a pipeline — keeps its text field and says why. A
  selection stays put: walk the tree with the arrow keys, measure it against
  whatever the cursor is over, and pin a note to it for the agent. When a
  value matches one of the page's own variables the panel offers `var(--x)`
  instead of a literal. Select mode lives on the bar across the page.
- **Variables** — what this page runs on, editable, and live on the page as
  you type.
  - **Page variables** — the custom properties the page's own stylesheets
    define, under the names it gave them (`--ink`, `--paper`, `--mark`),
    grouped by what they hold, with how many declarations use each. A
    variable the page defines again under a width media query wears a chip
    (`≤700`) with that value; the edit leaves it alone and the brief says so,
    so the agent decides whether the breakpoint should follow. Type a
    value and the page repaints; the brief gets one line: the name, what it
    was, what it should be. **Lock** a variable and nothing moves it — no
    seed, no scale, no hand value — the brief ends with "Keep as is" naming
    it, and an agent preview that redefines it is called out rather than
    blocked.
  - **Colours on the page** — every colour it paints with, named or not, with
    where it is used and how often. On a page with no variables this is the
    handle: setting one rewrites the rules that hold the literal.
  - **Type** — the families the page really renders and the size/weight/
    line-height ladder it renders them at. Drag any number and the rules that
    set that size follow — `font-size: 15px` says what it is, where a variable
    holding `15px` cannot — and a weight or line-height moves inside rules
    whose size names the role.
  - **Space & shape** — the spacing grid, corner radius and elevation, taken
    from the page, with off-grid strays named rather than rounded in. Moving
    the grid rescales the steps the page uses rather than inventing a ladder,
    and rewrites the paddings, margins and gaps that sit on those steps.
  - **Critique** — what a designer would flag on the page, from what the
    scan measured: contrast under AA with element counts, off-grid spacing,
    near-duplicate colours, type strays; and what a screen reader or a
    keyboard would meet: images with no alt attribute, heading levels that
    skip, controls under 24×24px (inline text links exempt), rules that
    remove the focus outline. Counts with their totals, never a fix. The
    same list the agent gets.
  - **Token file** — hold the page up against a design token file: W3C DTCG
    JSON as Penpot, Figma and Tokens Studio export it, or a plain map of
    custom properties. Three kinds of fact come back — variables whose value
    has drifted from the token of the same name, colours the page paints that
    no token holds, and tokens nothing on this page reaches. The file is not
    automatically right, so nothing here offers to make the page match it.
    Your agent asks for the same comparison with `check_tokens`.
  The **Light / Dark** switch on the bar shows the page's own dark mode where
  it has one — its `prefers-color-scheme: dark` rules are re-emitted without
  the media query and the theme hook its stylesheet uses (`html.dark`,
  `[data-theme="dark"]`) is set, no browser permission needed — and the hint
  says so. Where the page has no dark mode, Dark previews the other side of
  its system instead: every colour on a light ramp step moves to the mirrored
  dark step, and greys invert by lightness. Either way it is a preview, not a
  decision — it never enters the brief.
- **Changes** — everything queued for the agent, wherever it came from: token
  definitions, scale changes, element edits with undo, redo and per-change
  revert, and your notes. A note says what it is about — an element, a set of
  them, a region in page coordinates, or a quoted run of text — and carries a
  numbered pin on the page. Hold **View original** to see the page without any of it. The
  actions to copy, send or download the brief live at the bottom.
- **Light / Dark** on the bar forces one side of the page's own theme —
  its scheme media rules hoisted, its theme hook set or taken off — whatever
  the system prefers; the lit side again is the system's choice.
- **Motion** — a transition editor with Play, and an animation editor with
  Framer's Appear, Loop and Scroll triggers over the page's own keyframes or
  a few named presets; a transform editor in Effects that takes the computed
  matrix apart into move, turn, skew and scale.
- **Assets** (in the rail) — every SVG on the page (inline, `<img>`, CSS
  backgrounds, sprite `<use>`, favicons), previewed with copy, per-file
  download and ZIP export.
- **Export** — `brand.md` for agent context, `tokens.json` in W3C DTCG format,
  and for the edited system `tokens.css`, a `SKILL.md` with its
  `DESIGN_SYSTEM.md` reference, a standalone style-guide page, or all of it as
  a ZIP.

While the panel is open on a site, a bar sits across the top of the page,
the same height as the panel's tab strip and wearing the panel's palette, so
the two read as one tool. It pushes the page down rather than floating over
it (a header the page itself fixes to the top of the viewport still sits
under the bar). On it: the Codename mark, the host, the **device picker**, a
**Reset** button in the centre whenever there is anything to take back (every
override — variables, colours, scale and element edits — goes, and so do the
dark preview and the frame; notes stay), a **Light / Dark** switch, and the
modes.

The device picker is four icons — desktop, laptop, tablet, phone — a **Frame**
menu of the presets, and **W** and **H** fields you can type any size into.
Picking one shows the page at that size *without moving your window*: the page
is narrowed to the frame and centred in the tab, and every width, height and
orientation media query in its stylesheets is answered for the frame instead
of the window, so it lays out the way it would on that device. A frame wider
than the tab is scaled down to fit and the bar says by how much. The frame
comes back after a reload and goes when the panel closes. Click the lit icon
again, or pick **Window**, to go back to the window's own size.

It is the page's CSS that sees the frame, not the browser, so a few things
still see the window: `vw` and `vh` units (anything wider than the frame is
clipped at its edge), a script reading `innerWidth` or calling `matchMedia`,
an element fixed to the viewport or positioned against it, styles inside a
component's shadow root, iframes, the `media` and `sizes` of responsive
images, and a stylesheet from another origin the page cannot read (the bar
says how many). The viewport meta tag plays no part;
a page is laid out at the frame's width whether or not it has one. The bar
itself keeps the tab's full width. Selecting is where Codename starts, and
it has no button of its own: it outlines the element under the pointer and
picks it on a click; clicking the selection again lets go. The selection carries its size under the box,
and nothing else is read out on hover — what an element is made of is in
the panel once it is picked, and nothing opens over the page. **Drag** the
selection and it lifts and follows the pointer: over the edge of a box it
goes beside that box, over the middle of one that can take it it goes
inside, and the box it would join is outlined with a line where in it it
lands. The move is a change in the log like the rail's drag, undone the same
way. **Preview** leaves the page alone so links, buttons and scrolling work
as they do for a visitor; Preview again, or Esc, goes back to selecting.
**Right-click** while selecting picks what is under the pointer and
offers what can be done to it: select its parent or first child, edit all
the elements that share its class, hide it, add a note, copy its selector,
show it in the panel, or let go. Alt+right-click keeps the browser's own
menu. **Comment** marks something up:
click an element, drag a box over anything including empty space, shift-click
several, or select a run of text, then type the note in a composer that opens
where it lands. **P** and **C** switch Preview and Comment on and off while
the bar is up; **Alt+P**, **Alt+C** and **Alt+L** (the rail) work from
anywhere in the tab and can be rebound at `chrome://extensions/shortcuts`.

The selection answers to what design tools taught everyone:

- **Handles** near the selection: padding bars inside the edges, margin bars
  outside (Alt pulls every side), a gap bar between the first two children,
  and size on the right edge, bottom edge and corner. A drag snaps to the
  page's spacing scale and lands as `var(--space-4)` where a variable holds
  the step.
- **Shift-click** adds to the selection; an edit in the panel reaches all
  of it.
- **⌘⌥C / ⌘⌥V** copy and paste style: paint, type and padding, not position
  or size.
- **Shift+A** wraps the selection in a stack running the way it already
  runs, with the gap it already has; the brief says to make the element.
- **Enter**, **Shift+Enter** and **Tab** walk into, out of and along the
  tree; **hold Alt** to measure to whatever is under the pointer.
- **⌘K** finds any command or layer by name; **Shift+?** lists every key.
- **Selection colours** in the Style tab list every colour inside the
  selection; change one and every place it is painted follows.

The bar is laid out as Framer's: the
tools on the left, the page and its frame in the middle, the switches on
the right. The mark in the panel's footer opens the menu: theme
(dark by default, light, or follow the system), site access, and the agent
bridge.

Reading the page is automatic wherever Chrome already lets the extension in:
the tab you clicked the icon on, or a site you allowed before. A site it
cannot reach asks for one click; **Always allow localhost** in the menu
makes every dev server open without asking.

## Make changes

Anything you change — a seed, the type scale, the grid, an element, a note —
collects into one brief.
It is written at token level: `--mark: #BE3A22 → #1C7F5C (34 usages)` tells an
agent to edit one definition, where a rendered stylesheet would invite it to
stamp a hex across forty components. Element edits are one line per selector
and property, before and after, grouped by the state they are about — `hover`
means `:hover`, `dark` means the page's own dark mode, a width means that
media query. Notes name the element they are about.

Colour edits reach the page through its own variables, or by rewriting the
rules that hold a literal. Type and spacing edits move variables where a
variable holds the value, and otherwise rewrite the rules whose property
names what the length is — `font-size` is a type size, `padding` is spacing —
failing closed on anything ambiguous: a shorthand moves only when every
length in it is a step, and `calc()`, `var()`, percentages and `em` are left
alone. Either way the change travels as a **scale change** in the brief,
which is an instruction the agent can act on in source.

Press **Make changes** on the Changes tab and the bridge runs your coding
agent — Claude Code, Cursor or Codex, whichever is installed, signed in with
your own account — in the project folder on that brief. Its steps show on the
tab as it works: what it is reading, what it is editing. When it has changed
files, the panel lets go of its own overrides and reloads the page, so what
you see is what source now says; review the diff as usual. If it stops, your
edits stay put and it says why.

The first run of each agent in a project asks first, and says what that agent
can do: Claude Code is held to reading and editing files, with no shell and no
web; Cursor and Codex can also run commands (Codex inside a sandbox with no
network). With more than one installed, pick which beside the button.
`CODENAME_AGENT_CMD` runs any other tool — a command with `{prompt}` where the
brief goes.

You can still **Copy** the brief or download it as JSON.

### Applying one yourself

A token change that has exactly one definition, at the root of the cascade, in
a stylesheet — no media query, no scoped selector, no token file — carries an
**Apply** button once you have ticked *Bridge may edit definitions* for the
project. It writes that one value, keeping everything else on the line, and
the token leaves the brief with a note that it is already in source.

This is the only thing written to source without an agent, and it is narrow
on purpose. A change like `--mark: #BE3A22 → #1C7F5C` has nothing left to
decide, and sending it through a language model buys a round trip and a chance
to get it wrong. Everything with a judgement in it — several definitions,
usages, components, a value that has moved since it was read — is refused with
the reason and stays in the brief, for Make changes.

### Connect your project

One command, in the folder you are working in:

```sh
npx codename-bridge open .
```

It starts the bridge for that folder, starts the project's dev server (its
`dev`, `start` or `serve` script, with the package manager your lockfile
names), watches its output for the URL it came up on, opens that in your
browser, and prints a six-character pairing code. Enter the code on the
Changes tab the first time; the same code is kept for the next run, so the
panel pairs by itself after that. `--cmd "…"` says how to start a project the
scripts do not, `--url` opens one that is already running.

### From a chat, too

The bridge is an MCP server as well, so an agent you are chatting with can
see the page — screenshots, the selection, your notes, the critique. Register
it once:

```sh
npx codename-bridge setup
```

That installs the `codename` skill into `~/.claude/skills` and runs
`claude mcp add codename -- npx codename-bridge` (`--client cursor` prints the
`mcp.json` entry instead). An agent started in the project then runs the
bridge itself, and `codename-bridge open` uses that one rather than starting
another. Its code goes to the agent, not to you: ask the agent (it has a
`pairing_code` tool), or run `npx codename-bridge code`.

The bridge runs on your machine only: a WebSocket on `127.0.0.1` for the panel,
and an MCP server on standard input and output when an agent started it. It takes that
socket from the one extension it first paired with and tells every other copy
so — the panel says "paired with another copy of Codename" rather than
retrying in silence. Switching between a development build and the store one
changes the extension's id, so after doing that run:

```sh
npx codename-bridge unpin
```

and enter the code again; it reaches a bridge that is already running. Five
wrong codes in a minute close the door for five, and a panel holding the right
code comes back on its own once it opens. The bridge never gives the code out
over the socket, whoever asks: an extension id is public, and an `Origin`
header only means something coming from a real browser.

### It knows which project you are in

Because it is running in the folder, the bridge can say so: the Changes tab
names the repository and the branch, the brief opens with them, and the
decisions you make against a dev server are filed under the project rather
than under `localhost:3000` — which two projects share and one project
changes. A deployed site is still filed by its origin, since the folder your
terminal happens to be in says nothing about it.

It also searches that folder. Every custom property in the brief is looked up
where it is really defined, and the line says what was found: `defined at
src/index.css:12` when there is exactly one, `3 definitions: …` when the
cascade decides between several, nothing at all when there are none. This is
the one place a file position is honest — the extension only sees a rendered
page, so it would be guessing; the bridge read the file. Your agent asks the
same question with `find_definition`.

An agent in a chat has `pairing_code`, `get_changes`, a blocking `watch` it can loop on,
`critique` (what a designer would flag on the page — contrast, off-grid
spacing, near-duplicate colours, type strays — as facts with numbers),
`get_design_system` (the extracted system as files — `brand.md`,
`tokens.css`, `tokens.json`, `SKILL.md`, `DESIGN_SYSTEM.md` — so it can write
its own design context into your repository and refresh it after a rescan),
`get_selection`, `get_comments` with `set_status` and `reply`,
`check_tokens` (the page against a token file, named by a path in your project
for the bridge to read, or passed as text),
`find_definition` (where a custom property is defined in the project, with the
file, line, value and whether it sits at the root of the cascade, under a
media query or in a scoped selector) and `apply_definition` (the same single
write the Apply button makes, under the same switch),
`get_screenshot` (with a `viewport` — one of the bar's presets, or `reset` —
the page is framed at that width first — the window does not move — so the agent can review a change at every width; with
a `selector`, the capture is cropped to that element),
`point` (it names an element and a few words; the page
scrolls there, lights it up for a moment and shows the note on the bar), and
— once you tick *Agent may change this page* — `apply_css` to paint a preview
on the tab. While that preview is up you can see it: the bar wears an **Agent
preview · N rules · M elements** chip with its own ✕, every element its rules
reach carries a dashed outline, and the Changes tab shows the same row above
the queue — never in it, since a preview is not a decision. Nothing is
written to source through the bridge; that stays the agent's job in your
repository, under your review — apart from the one definition you apply
yourself, described above. See `PRIVACY.md`.

When an element edit writes a literal and exactly one of the page's own
variables already holds that value, the brief says so and leaves the choice
with you. It stays a remark rather than a rewrite: a variable declared on
`.card` does not resolve on a `<section>`, and three variables holding `16px`
do not agree about what `16px` means, so the panel never swaps one in behind
your back.

The rules reach the agent before it asks: the bridge sends them as its MCP
instructions, serves them as the `codename://rules` resource (with the tokens
you locked on the current page), and serves the design files as
`codename://design-system/brand.md` and friends, so a client that loads
resources has the context without a tool call. Everything the agent does
through the bridge — previews, pointers, captures, comment moves — is listed
under **Agent activity** on the Changes tab; history, not changes, so Reset
leaves it alone.

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
npm test           # engine, extraction, panel and bridge tests (vitest)
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

`.harness/public/page.html` is a small page with the awkward shapes in it — a
dark media query, a theme hook, a layer, a breakpoint, hardcoded colours
beside variables — to try the content scripts against. They are served from
built copies, so refresh them before trusting what you see:

```sh
npm run harness:scripts
```

## Architecture

- **WXT + React + TypeScript + Tailwind v4**, Manifest V3. No options page
  and no full-tab UI, because the live site is the canvas. The panel app runs
  in the page as an iframe (`entrypoints/panel.content.ts`, `shared/embed.ts`)
  and in Chrome's side panel only on restricted pages. `sidepanel.html` is
  web-accessible for that, which lets a page tell Codename is installed.
- `entrypoints/sidepanel/` — the panel. Its design tokens live in
  `shared/tokens.css` (dark default, light override, on `:root` for the
  panel and `:host` for the rail) and the utilities in `shared/theme.css`;
  `theme.test.ts` runs the engine's APCA audit against them.
  `lib/session.ts` holds everything about the current tab outside any one
  tab's component tree; `lib/inspect.ts` is the Style tab's controller;
  `lib/bridge.ts` owns the WebSocket to the companion.
- `entrypoints/rail.content.tsx` — the rail: React in a closed shadow root
  in the page, reusing the panel's `LayersTree` and `SvgsTab`. It reaches
  the inspector through `window.__codenameInspector.handle` and the panel
  only for what belongs in the change log (`shared/inpage.ts`).
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
