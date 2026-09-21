# Codename — where this is going

Living plan. Updated September 2026 after a review of five adjacent tools.

## The idea in one line

Open the panel on your dev server, see the design system it's actually
running, select or edit anything, watch the real page repaint — and your agent
already knows, because it is connected.

## What settled the shape

Five tools solve adjacent problems:

| | Form | Edits | Reaches the agent via |
|---|---|---|---|
| **Design Mode** (designmode.app) | MV3 extension, any live page | Per-element: layout, spacing, type, colour, effects, motion, text, DOM order. Tokens panel: declared / detected / defined | 8 MCP tools via cloud relay or local Node; copy-prompt; CSS/Tailwind/SCSS/JSX |
| **Ship Studio** (ship.studio) | Tauri desktop, your dev server in an iframe | Tailwind class swaps or CSS rule edits written to source, fail-closed | Claude Code terminal in the same window; loopback MCP with `preview_*` tools; numbered canvas comments |
| **Stacki** (stacki.build) | Electron desktop, Astro only | Component props, drag components, design variables | ⇧⌘C copies file:line pointers |
| **Impeccable** | Skills + CLI + hooks, no UI | 23 agent commands, 61 deterministic design-defect rules | Runs inside the agent |
| **Agentation** | React dev overlay on your own app | Annotations only | HTTP+SSE; MCP with a blocking `watch` tool and a resolve lifecycle |
| **Webflow** (Conf, Sept 2026) | Hosted designer; Source puts code and martech on one surface | Everything, in its own model; breakpoint canvas; style props | MCP 2.1 (GSAP interactions, CMS queries, Cloud logs); generated Agent Instructions; Agent Presence on the canvas |
| **Framer 3** (June 2026) | Hosted designer | Everything, in its own model; agents on the canvas | In-app agent that reads styles, components and CMS; Branching |
| **Nordcraft** (2.0, April 2026) | Hosted editor; Apache-2.0 runtime, closed editor | Everything, in its own model (pages, components, formulas, actions, workflows); style *variants* as a reorderable condition list; typed theme variables | In-editor agent that writes into the model, not into code; no MCP |

They agree on three things, and Codename keeps all three:

1. **The live page is the canvas.** None builds a synthetic preview. This is
   why Codename has no full-tab UI.
2. **Tokens get their own top-level panel**, separate from the element
   inspector — the system is a different surface from the selection.
3. **The agent reads state; you do not paste it.** Every one of them that has
   an agent link exposes it as MCP.

Also kept from them: drag-scrub over typing, showing consequence before you
commit (contrast, "×N uses"), and failing closed — marking something read-only
rather than guessing at it.

Where Codename is ahead of all five: it extracts an honest design system from
the page (named OKLCH ramps, measured type, observed spacing, an APCA audit),
re-skins pages that expose no CSS variables at all, and hands off at token
level with usage counts. Where it is behind: no agent connection, no
per-element editing or changes list, no undo, no comments, no keyboard model,
and a light-only panel with no design tokens of its own.

## Extension, not an app

Asked in September 2026, after a survey of what the adjacent tools had
become. Answered: **the extension stays the canvas and the companion grows**.

Everything built for people who own a repo had converged on a local app that
owns a Chromium and a terminal — Cursor's built-in browser with its visual
editor and Design Mode, stagewise's Electron "developer browser", Ship
Studio's Tauri window — while everything built for people who do not want a
local environment converged on a web app over a cloud container. Onlook moved
from Electron to the web and said plainly why: the download and the "debug
their machine" support burden, not a limit of Electron.

A desktop app would buy this project a filesystem, a terminal in the same
window, a multi-viewport canvas and no store review. Three of those are
already answered — the companion is the filesystem, the agent already has its
own terminal, and the breakpoint canvas is declined by the live-page rule with
the viewport presets and the sweep serving its purpose. What it would cost is
the thing none of those tools have: **the user's own browser**, with their
profile, their session, their staging and production sites. Cursor's browser
cannot even load an extension.

So the shape is the one thing nobody had built end to end: an extension for
the canvas, and a local companion for everything an extension cannot do. W16
is that companion growing up.

## Done

- **The four workstreams below, September 2026.** Panel design system with
  dark mode (`style.css`, `theme.test.ts`); the local bridge
  (`packages/bridge`, `shared/protocol.ts`, `lib/bridge.ts`); element
  selection and editing with a changes list, undo and token preference
  (`inspector.content.ts`, `lib/inspect.ts`, `studio/changes.ts`,
  `studio/selector.ts`, `studio/measure.ts`, `studio/tokenMatch.ts`); notes
  pinned to elements; per-site persistence of decisions (`studio/edits.ts`);
  the export bundle wired into the Export tab; `PRIVACY.md`. 366 tests.
  Verified in the harness and against a live bridge driven over stdio MCP;
  the in-page inspector and screenshots still want a pass in a real Chrome
  with the extension loaded.
- **Honest extraction.** `seedFromScan` builds a `BrandConfig` from the page:
  ramp names from the site's own CSS variables, type scale from observed usage,
  radius/spacing/elevation from a scanner pass, fonts that actually load,
  voice left empty. Verified against a live stripe.com scan — its purple, its
  `sohne-var` at weight 300, its 4px grid, zero preset leakage.
- **Four-tab panel.** Inspect · Design · Assets · Export, with Resize demoted to
  a header control and the full-tab Studio deleted.
- **Live re-skin** (both mechanisms, below) and the **hand-off brief**
  (`studio/commit.ts`), delivered by copy or JSON.
- `.harness/` renders the panel outside the extension; `?theme=` picks the
  palette and `chrome.__emit` fakes a content-script message.
- **W20, 21 September 2026 — layers left, styles right.** Framer, Figma and
  Webflow keep the tree on the left of the canvas and the styles on the
  right; the panel had five tabs in one column with the tree stacked above
  the selection. A Chrome side panel cannot be two columns (a 320px floor,
  no width API, a dragged width forgotten across restarts), so the tree
  moved into the page: a **rail** on the left (`entrypoints/rail.content.tsx`,
  React in a closed shadow root, the panel's own `LayersTree` and `SvgsTab`,
  the page pushed right with a root margin through `studio/pushRoot.ts`),
  folded by Layers on the bar or Alt+L. It talks to the inspector in the
  same page through `window.__codenameInspector.handle` (`shared/inpage.ts`)
  and to the panel only for what belongs in the log (`rail-move`,
  `rail-hide`, `rail-scope`). The panel is **Style · Variables · Export ·
  Changes**; the split and the Layers tab are gone. **Select is the only
  mode**: the hover card and tag were saying what the edit card and the
  panel say again, so hover is a 1px outline and the selection carries its
  size under the box. The Style column took the order the three tools agree
  on — Position · Size · Layout · Spacing · Colour · Type · Border ·
  Effects · Motion · Text, all open, heads sticky — and the controls the
  comparison found missing: position and insets, **size modes** (Fixed ·
  Fill · Fit · Rel, `studio/sizeMode.ts`, which fail closed because a
  computed width never says what the author wrote), min/max, overflow, the
  3×3 align grid (`studio/alignGrid.ts`), row/column gap, the flex-child
  fields, and a box diagram that is typed into, with a link for how far an
  edit reaches. A device frame fits the room the rail leaves. The decision
  record and mocks are in `docs/design/panel-layout-wireframes.{md,html}`.
- **W21, 21 September 2026 — a second pass against the references.** From
  the rail's first run on forfontsake and another look at the three
  screenshots: computed lengths round to two decimals on read (`roundPx`);
  a rail row keeps its name (eye under the pointer only, indent capped); a
  **Pages** tab in the rail, the site's pages as this page links to them
  (`studio/pages.ts`); an icon per row for what kind of thing a layer is
  (`LayerIcon.tsx`), leading the selection header too; the Type group offers
  the fonts the page loads and names the weights, saying which are not
  loaded; min/max behind + Add; a scope of all N says so; opacity gets a
  slider; and with nothing picked the Style tab shows what the page is made
  of, as Figma's design panel does. Undo and Escape work from the rail; a
  page nobody is looking at is not re-read; Fill on a main axis is one
  declaration.
- **W26, 21 September 2026 — one chrome.** From Hendri's review of the
  rail in Chrome: the rail and the panel wear the same tab strip
  (`TabStrip.tsx`, icon over label, the bar's height); assets sit on a light
  checker in either theme, as a design tool draws thumbnails, so a dark icon
  is not a dark square; the rail has an edge (a stronger line and a shadow)
  so it does not run into a light page; and the bar is laid out as Framer's
  top bar — tools on the left (Layers, Select, Comment), the page and its
  frame in the middle, the switches on the right — with the mark, the title
  and the fold gone, since none of them was an action.

## Live re-skin

Change a seed → the real page repaints. On by default, session-scoped, cleared
when you leave the tab or toggle it off.

Proven end to end against forfontsake: dragging its brand seed to `#1C7F5C`
produces exactly one override (`--mark`), the painted link colour goes
`rgb(190,58,34)` → `rgb(28,127,92)`, and clearing restores it with no residue on
the root element.

Two mechanisms, and **the clean one is not always available**:

1. **The page defines CSS variables** — set them inline on the root
   (`documentElement.style.setProperty`). Inline beats author `:root` rules, so
   it wins without `!important`, repaints through the cascade, and reverts with
   `removeProperty`. `colors[].varNames` is the mapping key.
2. **The page hardcodes values** — walk `document.styleSheets`, find
   declarations matching an extracted value, and emit an override sheet reusing
   *their* selectors so `:hover` and `:focus` keep working.

Both are built (`studio/reskin.ts` + `entrypoints/reskin.content.ts`), and
path 2 is what makes this work beyond your own projects: stripe.com exposes zero
readable custom properties while forfontsake has 26.

How a variable is matched, and nothing else is touched:

- **exact** — its value is a step on a ramp; it moves to that step after the
  edit. Compared step-to-step across the edit, never variable-to-step.
- **family** — it shares a hue with a seed that moved; the hue rotation and
  chroma ratio are applied while keeping its own lightness, so a wash stays a
  wash. The chroma floor (0.025) sits in the measured gap between forfontsake's
  brand wash (0.033) and its neutrals (≤0.016).

### Known limits
- The base value of a variable is its first definition in document order. A
  redefinition under the page's dark mode lands in `dark`, one under a width
  media query in `atWidth`, and a variable defined *only* inside width
  queries carries `onlyAt`; the width passes read `max-width`/`min-width`
  and the range syntax, not `orientation` or container queries.
- The presence outlines are a stylesheet (`codename-agent-marks`) with
  `outline … !important` on the agent's own selectors, so while a preview is
  up those elements show the dashed mark instead of their focus ring; a rule
  that sets its own outline is left unmarked so the proposal shows. Reach is
  what applies at the moment of `apply_css`: a rule under a media query the
  window does not meet counts as a rule but reaches nothing, and the marks
  do not follow a later resize. A rule on `:root` or `body` outlines the
  whole page, which is honest if loud.
- Component provenance is only as good as the build: a production bundle
  names nothing, React 19 dropped file and line from its fibers so the name
  travels without a position, and Svelte exposes no reliable hook at all.
  The probe needs `world: 'MAIN'` injection, so a page whose main world
  refuses the script says nothing; that path is the one part of this that
  the harness cannot prove and a real Chrome must.
- The token file is matched by name and by value. A variable and a token
  that share neither cannot be paired, and a name that two tokens could
  answer to is left unpaired rather than guessed.
- The element crop assumes the capture's scale is its width over the
  viewport's; a page-fixed bar or a scrollbar changes neither, but a
  capture during a zoom animation could. The heading-skip count is over
  document order, not the accessibility tree, and the target-size count
  treats any block-level link as a control. The focus count reads
  stylesheet text: `:focus:not(:focus-visible)` is exempt, but a ring
  rebuilt with `box-shadow` after `outline: none` still counts as removed,
  which the message allows for.
- The sweep's `set-viewport` answers when the frame is on, then waits
  a fixed 400ms before the capture; a page that lays out slowly at a new
  width may be caught mid-way. `captureVisibleTab` still needs the icon to
  have been clicked on the tab.
- An inline root override outranks every author rule for that element — but a
  page whose theme is scoped to a descendant (`.theme-dark .card`) will not
  fully follow.
- Cross-origin stylesheets are fetched through the background with the site
  access already granted, for the scan, the re-skin and the site's dark mode
  alike; only a sheet that cannot be fetched either lands in `unreadableSheets`.
- Colours written inline on an element are not rewritten — only rules are.

## The hand-off

`studio/commit.ts` + the **Hand to agent** screen. Edit a seed, review exactly
what will be asked for, and copy a brief for your agent (or take it as JSON).

**Token-level, never a rendered stylesheet.** `--mark: #BE3A22 → #1C7F5C
(34 usages; loaded from …/src/index.css)` lets an agent edit one definition.
Handing over resolved CSS invites it to stamp a hex across forty components,
which is the thing a token system exists to prevent. A test pins that the prompt
never contains a rule body.

**No file positions, on purpose.** The extension sees the rendered page, so a
line number would be a guess. The agent has the repo and can find a definition
properly; what it gets is the stylesheet URL the browser loaded, labelled as a
hint.

## Roadmap

The four workstreams below shipped in September 2026 (see Done). They are
kept here as the record of what was decided and why; the Deferred list is
what is next.

**0. Foundations (S+M).** vitest config (today tests pass only because every
`@/` import in `studio/` is type-only); a per-tab session store so a Design
edit survives switching tabs (today the tab unmounts and clears the re-skin).

**W1. Panel design system + dark mode (M).** The panel that audits design
systems has none of its own: ~15 files of literal `gray-*`/`blue-600` classes.
Rebuild on semantic tokens (`--surface-*`, `--ink-*`, `--line-*`, `--accent`)
exposed through Tailwind's `@theme inline`; dark by default, light as an
override, follows the system, manual choice persisted; Geist Sans + Mono
bundled; a 5-step type scale; focus-visible styles; real ARIA tabs. A test
runs the panel's own APCA audit against its own tokens.

**W2. Local companion + live agent link (L).** `npx codename-bridge`: stdio
MCP to Claude Code/Cursor, WebSocket on `127.0.0.1:9612` to the extension,
paired with a code, nothing leaves the machine. Tools: `get_changes` (the
existing `ChangeSet`), a blocking `watch` so the agent loops hands-free,
`get_screenshot`, consented `apply_css` for preview, `clear`,
`list_sessions`; then `get_selection`, `get_comments`, `set_status`, `reply`
once comments exist. The panel shows connection state and gains "Send to
agent" beside "Copy". The payload is already the artifact; only the transport
is new.

**W3. Selected-element editing (L).** The inspector becomes a persistent
selection with keyboard traversal, a breadcrumb, measurements, and a unique
selector with a `×N` badge. A property panel for spacing, size, type, colour,
radius, border, shadow and inline text, live through a managed override
sheet; a changes list with per-change revert and undo/redo, persisted per
URL; and token preference — when a value matches an existing token, the panel
offers `var(--x)` instead of the literal. `ChangeSet` gains `elements`.

**W2b. Pinned comments (M).** Numbered pins on elements, a composer in the
panel, a pending → acknowledged → resolved lifecycle the agent drives.

**W4. Housekeeping (M).** Persist the edited system per site (migrating
against the fresh scan, never a preset); wire the tested-but-unwired exports
(`tokens.css`, style guide, `SKILL.md`); fix the inert spacing/shadows export
flags; per-file SVG download; README and `PRIVACY.md`.

**W5. The panel's shape (M).** Done. The bar across the page carries the
host, the viewport and the Select switch, so the panel's own header went.
Five tabs, since renamed and reordered: Layers · Variables · Assets · Export ·
Changes. The Layers tab
leads with colour and type, open, and collapses the rest behind a summary —
before this, the colour of a heading sat 1012px down a 1751px scroll, which
reads as "you cannot change this". Changes and notes moved out of the
selection and into their own tab, which is also the hand-off review, so the
overlay went too.

**W6. The Design tab earns its name (M).** Done. The type ladder is editable
per role (size, weight, line-height) and the spacing grid and base radius are
too, all with the same drag-scrub the element panel uses. A failing contrast
token carries a **fix** button that applies the re-pointing the engine had
already worked out and never offered.

Length edits reach the page the way colour does, through the page's own
variables, matched by value with the variable's name as a tiebreak. They stop
there on purpose: a hex is unambiguous, a bare `16px` is not, and rewriting
every one in a stylesheet would break layouts to fix a grid. Where a page
holds none of its scale in variables — forfontsake holds none at all — the
decision travels as a `system` entry in the `ChangeSet` instead, so the agent
still hears about it.

**W7. Annotations (M).** Done. A note's target is a shape rather than a
selector: one element, a set of them, a region in page coordinates, or a
quoted run of text. Note mode on the bar is how you say which — click, drag a
box over anything including empty space, shift-click to build a set, or
select text and click it. (Freeze, which held animations still, went with
Pause in W10.)

The quote, not an offset, is what a text note carries: an offset goes stale
the moment a word changes, and the quote is the thing an agent can search
for. Note mode swallows the click it rides on, so marking a button up does
not also press it.

**W8. Layers (M).** Done. The page arrives as a flat list with depths, built
in one walk and read on demand rather than mirrored live. Rows search by name
and by their own text, keeping the ancestors of a match so a hit still says
where it lives; folding skips a subtree by its descendant count. Picking a row
selects it, hovering lights it up, and the eye hides it — as an ordinary
element edit, so hiding undoes, reverts and reaches the agent through the same
list as everything else.

Two decisions worth keeping. An `<svg>` is one layer and its paths are not:
on an illustrated page the drawing outnumbers the structure several to one,
and 734 rows became 535. And the positional badge does not appear per row —
431 of those 535 have no distinctive selector, so a flag on each is noise
rather than signal; the selection header still says it once, where it matters.

Drag-to-reorder arrived later (W12), and the caution above shaped how: a
row can move among its siblings only, the page performs a real DOM move as
a preview — restored and re-applied from the log as one state, like the
rules, so undo needs no special case — and the brief carries the move as a
sentence about the markup's order, never as a style. A framework that owns
the DOM may put the element back on its next render; the README says so.

**W10. Ship Studio's palette, adopted (S).** Done. Rather than approximate it,
the panel now uses Ship Studio's own values under its MIT licence, with the
notice in `style.css` and in the README. Token names stay ours so utilities
keep reading `text-ink-muted`; the numbers are theirs, including the green
accent. Pause is gone from the bar and the content script, along with its
command and message.

The audit changed rather than the palette. This palette does not meet the APCA
thresholds Codename holds scanned sites to — primary text lands at Lc 65 where
body copy wants 75, muted at 29 where the old floor was 45 — so `theme.test.ts`
stopped asserting a standard it does not reach and now pins the measured
numbers, keeps the ink ladder monotonic, and still requires text on a coloured
fill to be readable. The trade is written down in both files rather than left
for someone to discover.

**W9. The panel's own density (M).** Done, measured against Ship Studio's
token files rather than against a memory of them.

Their body text is `#bcbcbc` where ours was `#edebe7`: every ink level sat one
to two steps brighter, which is most of why the panel read loud. Ink came down
as far as the panel's own APCA audit allows and stopped there — `ink-muted`
and `ink-faint` were already at their floor, and Ship Studio's equivalents sit
below it. That is a real disagreement, not an oversight: their small text does
not clear the bar this panel holds sites to, and the audit wins.

Line heights tightened across the scale, the gutter came in from 14px to 12px,
focus moved inside the control, and `--surface-selected` arrived so a selected
row is a lifted surface rather than a block of accent. Outlined cards became
grouped lists with hairlines where the content is a list. The eyedropper
stopped being styled as the loudest thing on the tab.

**W12. Closing the reference gaps (M).** Done, September 2026, from a pass
over the five reference tools. Impeccable's `critique` is an MCP tool and a
section of Variables (`studio/critique.ts`: contrast under AA with counts,
off-grid spacing, near-duplicate colours, type strays, family and radius
counts, unreadable sheets — facts, never a fix button). Design Mode's
per-element layout and effects editing arrived as a Layout group (display,
justify, align, direction, wrap) and an Effects group (opacity, shadow).
The keyboard model the comparison called missing is Alt+S / Alt+C for the
two modes on the bar through Chrome's commands API, rebindable at
chrome://extensions/shortcuts, beside the arrows, Escape and ⌘Z the page
already had. Reset on the bar takes back every override, the dark
preview, the viewport, the split and the selection at once.

Then the smaller obvious ones: a Components strip above the Layers tree
(class selectors that repeat with something inside them, read off the page;
pick one and the scope is all of them); a filter box for page variables
once there are more than a dozen; the panel remembers its tab; the tree
walks from the keyboard; the hover readout and the edit card name the
page's own variable beside a colour, and the card writes `var(--ink)` on a
click, which is the edit a token system wants. Each corner's radius is its
own field once they differ, and `brand.md` ends with the critique, so the
context an agent is handed already says what to be careful of.

A further pass closed the depth items: a layer can be dragged anywhere in
the tree, including into another element as its last child; the scanner
reads each variable's value under the page's own dark mode; cross-origin
stylesheets are fetched through the background for the scan, the re-skin
and the site's dark mode alike; the edit card edits words; the model no
longer re-derives the seed on every keystroke and the push to the page is
debounced; and the panel is mounted in a test suite against a repo-side
chrome stub (`entrypoints/sidepanel/test/chromeStub.ts`), so what the
harness checked by hand is pinned.

The naming scheme a project should use to be read natively — three layers,
states on every colour that acts, one inactive set, a hierarchy with the
primary level as the bare name — lives as the `design-system` skill in
Hendri's skills repo (`~/Development/skills/skills/design-system`), not
here: the skill is the single source of truth for the scheme, and the
plugin reads whatever a page defines.

**W11. The panel as a tool, not a report (L).** Done, September 2026, from
a walk through the panel on forfontsake. Element became Layers and Design
became Variables, with Changes last, where the hand-off is. The bar across
the page is the same 40px as the panel's tab strip, wears the panel's
palette, pushes the page down rather than covering it, names the viewport
by the preset it matches, and carries the Light/Dark switch; a preset the
display cannot fit beside the panel zooms the page until its CSS viewport is
the preset width, and says so. Select lives on the bar only; the eyedropper
went.

Variables leads with the page's own custom properties and the colours it
paints with, each editable and live, because the generated semantic layer
— ninety tokens the page never references — could not be: re-pointing
`--background` repainted nothing. The semantics stay in Export. Type, grid
and radius edits now rewrite the rules that hold them, keyed by property
name (`font-size: 15px` says what it is where a variable holding `15px`
cannot), failing closed on half-matched shorthands and anything computed.
Dark on the bar previews the page on the dark side of its system by
mirroring ramp steps (100 ↔ 900) and inverting greys by lightness; a
preview, never a hand-off. Type and scale decisions persist per site like
seeds, and the re-skin is pushed again after a reload.

Layers fills the tab, opens four deep, stays above the selection in a draggable
split, and badges rows whose class selector repeats (×12) — the seed of a
component notion, deliberately no more than that yet. Selecting an element
puts an edit card beside it on the page — text, fill, size, weight, padding,
radius — writing into the same log as the panel. And an unpaired panel now
says how to pair: a Connect agent button, a three-step card on Changes, a
`pairing_code` MCP tool and a `codename-bridge code` subcommand, because the
code went to a stderr the agent swallows.

**W13. What Webflow Conf and Framer 3 taught (M).** Done, September 2026,
from a pass over the two keynotes and the Framer 3 launch. Three of their
announcements were validation: Campaigns' "paste a URL and an agent pulls
your colours, fonts and UI elements" is `seedFromScan`; generated Agent
Instructions are `brand.md` and the skill bundle; Framer's "point the agent
at a layer" and "audit inconsistent styling" are the selection tools and
`critique`. Three named gaps that the code confirmed, and each is closed:

- **Agent Presence.** An `apply_css` used to leave one trace: the Reset
  count going from 0 to 1, indistinguishable from a seed drag. Now the
  reskin script reads the agent's sheet back through a detached
  `CSSStyleSheet`, counts its rules and the elements they reach (a selector
  the page cannot query is counted, not guessed), and paints a dashed
  outline on each; the bar wears an "Agent preview · N rules · M elements"
  chip with its own ✕; Changes shows the same row above the queue, never in
  it (a preview is not a decision, the dark rule again); the tool's reply
  says what it reached; and a read-only `point` tool lets the agent scroll
  to an element, light it up and show a note, the way a teammate points at
  a screen. None of it bumps `revision`.
- **Agent Instructions generation.** The agent could not fetch the system
  the panel had extracted. `get_design_system` returns `brand.md`,
  `tokens.css`, `tokens.json`, `SKILL.md` and `DESIGN_SYSTEM.md` — the same
  files Export produces — with `scannedAt`, so an agent writes its own
  `.claude/skills/<host>/` and refreshes it after a rescan.
- **The breakpoint canvas's real point: missed overrides.** The variable
  pass was a regex over sheet text where the first definition wins, so a
  `--gap: 12px` inside `(max-width: 700px)` was dropped. A second pass over
  the object model, modelled on the dark one, records `atWidth` per
  condition where the value differs; Variables shows a `≤700` chip; the
  brief adds "also defined at (max-width: 700px) as `12px`; left alone —
  decide whether it should follow" under the token. A variable the page
  defines only under a query is marked `onlyAt` rather than passed off as a
  base value. The canvas itself stays declined: the live-page rule holds,
  and this is the need it served.

A second pass the same day closed the two items first recorded as
optional. **Breakpoint sweep:** `get_screenshot` takes a `viewport` — one of
the bar's presets, or `reset` — and a `set-viewport` inspector command that
answers once the background has moved the window and set the zoom, then a
short settle, then the capture; the agent reviews its change at every width
without a canvas. **Token locks:** a lock on a page variable (kept with the
per-site edits) takes it out of every override — seed, scale, hand value —
in the preview and the brief, which ends with "Keep as is" naming them; the
reskin script reports the custom properties an agent's sheet declares, so
`apply_css` answers "the sheet redefines `--mark`, which the user locked"
and the Changes row says "touches locked". Nothing is blocked: the preview
stays up, the agent is told. And the agent's sheet now survives a reload the
way the re-skin does, while the consent that let it on still holds.

**W14. The second look at Webflow and Framer (M).** Done, 11 September
2026, from their MCP and external-agent docs rather than the keynotes.
Webflow captures "visual snapshots of elements", so `get_screenshot` takes
a `selector`: a `locate` command scrolls the first match into view and
answers with its box after a frame, and the panel crops the capture to it
with a small margin. Webflow "provides a site's Agent Instructions to
connected agents automatically", so the standing rules
(`studio/commit.ts` `standingRules`) go out as the bridge's MCP
instructions, as the `codename://rules` resource carrying the current
page's locks, and the design files as `codename://design-system/{file}`;
`list_sessions` names the locks too. Framer's `npx @framer/agent setup`
installs skills locally and needs no server config, so `codename-bridge
setup` writes the `codename` skill into `~/.claude/skills` and runs
`claude mcp add`, or prints what to paste for Cursor; the Connect card's
first step is now that one line. Webflow "records the changes that agents
make in the site's activity log", so the panel keeps an agent activity
list — every bridge request in a few words, refusals included — under the
presence row on Changes; history, not changes. And Framer's agent audits
"accessibility issues", so the scanner counts, on the walk it already
makes, images with no alt attribute, heading levels that skip, controls
under 24×24px (inline text links exempt) and `:focus { outline: none }`
rules, and the critique states them with their totals. Declined on the
record: splitting tools further (fifteen small ones already), agent
branches (git), markdown-for-agents, the model picker, style props and
slot restrictions.

A review pass over W13 and W14 (eight angles, ten verified findings) then
closed what it found: locks now also take the variable's own hex out of the
colour map, so a locked token cannot be repainted by a hand colour edit or
a seed move; the tab id reaches React only after its session has loaded,
so one tab's agent preview is never re-pushed onto the next; `set-viewport`
answers honestly when the window could not move; `locate` and `point`
scroll instantly and read the box at once; a preview's reach is what applies
now and never marks over its own outline; the design-system resources are
listed only once a page has been read and refuse with a typed error before
that; and the standing rules have one home in `studio/commit.ts`, imported
by the bridge's instructions and by the installed skill. The bridge state
memo now depends on the fields it reads, so an activity entry no longer
re-renders the prompt and pushes an identical snapshot.

**W15. The low-code survey (M).** Done, 11 September 2026, from nine tools
rather than two keynotes. Chrome DevTools MCP is the finding that shapes the
rest: an official server gives any agent screenshots, DOM snapshots,
evaluation, emulation and Lighthouse for free, so generic browser control is
no longer worth building here and the bridge's tools stay design-semantic.

Three things were worth taking. **Component provenance** (stagewise's
element context, Onlook's instrumentation): the panel asks the page's own
world what rendered an element, through a probe injected with
`world: 'MAIN'` (`probeSource` in `studio/framework.ts`) — React's dev-only
`_debugOwner`, including the plain record a server component leaves there;
Vue's owning instance from `__vnode.ctx`, with the file its compiler
stamped on it; Angular's dev-mode global; and the attributes a Vite
inspector plugin writes, which are the one source an isolated world can
read for itself. The selection header names it, the brief carries it as
"rendered by X, as React's dev build names it", and `get_selection` hands
it over. The rule holds in the form that matters: nothing is inferred from
class names, and a production build — where the names are minified — says
nothing. **The token file** (Penpot's and Figma's native DTCG over MCP):
`studio/tokenFile.ts` reads a DTCG file or a flat map of custom properties
and reports drift as facts — variables that have drifted from their token,
colours in no token, tokens nothing reaches — in the Variables tab and
through a `check_tokens` MCP tool. Pairing looks both ways: a variable two
tokens answer to is left alone, and so is a token two variables answer to.

Builder Fusion's **Style Strict Mode** was built as a "tokens first" switch
that rewrote a literal into `var(--x)`, and then removed. A review found
four ways it silently wrote a wrong edit: a variable scoped to `.card` does
not resolve elsewhere, so the property fell back to its initial value; a
`16px` radius could take a font-size token's name, since every px-equal
variable matched and the tie-break was alphabetical; a value scrubbed back
to where it started no longer cancelled out; and the colour match used a
perceptual tolerance, so a token could render a different colour than the
one picked, or a stale one if the variable had since been edited. What
survives is the half that was always safe — the brief remarking that a
single variable already holds this exact value — which is advice to a
reader rather than a rewrite behind their back.

Declined on the record: writing to source from the panel (Onlook,
stagewise, Fusion all do; the rule keeps writes with the agent), a
developer browser (stagewise's Electron pivot), and generation from
prompts, sketches or screenshots (Stitch, Subframe, v0). Not yet built,
from the same survey: drag handles for spacing on the page (v0's Design
Mode, Webflow's on-canvas spacing), and offering `DESIGN_SYSTEM.md` under
the `DESIGN.md` name Stitch ships.

**W16. The bridge knows the project (L).** Done, 12 September 2026, from a
look at Nordcraft and a survey of the app-versus-plugin question (above).

Nordcraft is a cloud editor that owns its whole app model and cannot sit on
an existing repository, so it competes for a different user. What it argues
is the useful part: its post on Cursor's visual editor says a precise edit
should never be routed through a language model — "if we have to give the
machine precise unambiguous instructions on what to do, why do we need an
LLM?" That is this project's split already, and it is what made the apply
step below worth building rather than just the lookup.

- **It says which project it is in.** `readProject` reads the folder's name,
  its git branch and whether the tree is dirty, and the hello ack carries
  them. The Changes tab names them, the brief opens with them, and
  `editsKey` files a local page's decisions under the project instead of its
  origin — two apps take turns on `localhost:3000`, and one app answers to
  `:3000` today and `:5173` tomorrow. A deployed site stays keyed by origin,
  because the folder a terminal happens to sit in says nothing about it.
- **It searches that project.** `findDefinitions` walks the stylesheets and
  token files git knows about — `.gitignore` honoured, so build output and
  dependencies are skipped — and reports every definition with its file,
  line, value and what it sits inside: `root`, `dark`, `media` or `scoped`.
  The result is pushed to the panel whenever the names in a change set
  change, so the person and the agent read the same fact and the copied brief
  carries it. `find_definition` is the agent's door to the same search, and
  `check_tokens` now takes a path for the bridge to read rather than making
  the agent paste a file.

  This rewrites the "No file positions, on purpose" rule, and narrows it to
  what it was always about. The reason was that the extension sees a rendered
  page, so a line number would be a guess. The bridge read the file. So: a
  position appears when exactly one definition exists, a count with the
  candidates when several do, and nothing at all when there are none — and
  the closing note stops telling the agent to go and find what it has just
  been handed.
- **It writes exactly one thing.** A token change with a single root-level
  definition, alone on its line, in a stylesheet rather than a token file,
  still holding the value it was read with, carries an **Apply** button once
  the person ticks *Bridge may edit definitions* for that project. It
  replaces the value text and nothing else — indentation, spacing and
  `!important` are the file's business — through a temp file and a rename,
  and the token leaves the brief saying it is already in source.
  `apply_definition` is the same function under the same switch. Every other
  case is refused with the reason and stays in the brief.

  This is the one departure from "writes to source stay with the agent", and
  it is deliberate: `--mark: #BE3A22 → #1C7F5C` has nothing left to decide,
  and a round trip through a model can only lose. Everything with a judgement
  in it still goes to the agent.
- **`codename-bridge open`.** Starts the project's dev script with the
  package manager its lockfile names, watches the output for the first
  localhost URL, and opens it. The part of a desktop app worth having,
  without shipping a browser to get it.
- **Pairing.** The bridge remembers the first extension that pairs with it
  and refuses every other one after that. Auto-pairing was built on top of
  that pin — the panel asking a bridge that already knew it for the code —
  and then removed: an `Origin` header is only trustworthy coming from a real
  browser, and an extension id is a public constant, so it would have traded
  a six-character secret for something anyone on the machine could type. The
  convenience it was for is answered honestly instead: `codename-bridge open`
  prints the code in the terminal the person is already looking at, which is
  the thing that was actually missing.
- **The hardening the audit asked for**, in the same change because it is the
  same socket: any `chrome-extension://` origin used to be accepted; five
  wrong codes in a minute now close the door for five; and *Agent may change
  this page* no longer defaults on for localhost, which was a consent nobody
  gave. It is asked once and remembered — against the page for painting,
  against the folder for writing, because those are consents about different
  things.

A review over the whole change then found and closed thirteen things, most of
them in the write path, which is where they matter most. The two that could
have damaged a file: a declaration wrapped over several lines was found as one
statement but rewritten as one line, welding the continuation onto the new
value; and the new value was written verbatim, so `red; } body { display:
none` was a way to append arbitrary CSS. The scanner now carries the offsets
of the value it read and the write splices exactly those, after re-reading the
file; and a value carrying `;`, `{`, `}`, a newline, a comment, an unbalanced
bracket or an unclosed quote is refused. The rest: strings and brackets are
tracked, so `url(//cdn/x.png)`, `"}"` and `data:…;base64` no longer confuse
the walk; `:root` inside a `.vue` or `.astro` file reads as root rather than
scoped; the file keeps the permissions it had; a disconnecting bridge no
longer re-reads edits under the origin and wipes the page; consent for writing
is filed against the folder; an applied token stops claiming to be applied
once its value moves again; a taken-back decision is no longer resurrected by
the origin fallback; two packages in a monorepo no longer share one storage
record; and the definition cache is dropped when a session goes.

**W17. Conditions (M/L).** Done, 12 September 2026. Nordcraft's best idea, in
the form this project can take honestly. A condition bar under the selection
— default, hover, focus, active, dark, a width — records the edit against the
state (`ElementChange.condition`), writes it into the managed sheet under the
matching selector or media query, and groups the brief's lines by state with
a sentence saying what each means. Undo, revert and Reset needed no special
case.

A state is held by a class rather than by `chrome.debugger`, which was
rejected for its permanent infobar: `reskin.content.ts` reads the page's own
`:hover` rules out of the CSSOM, rewrites the pseudo into
`.codename-state-hover`, and the inspector puts that class on the selection.
Both the pseudo and the class are written into the managed rule, so the edit
shows while the panel holds the element *and* when a person hovers it for
real. A rule whose pseudo sits on an ancestor (`.card:hover .title`) cannot
be previewed by holding the descendant, so it is reported instead. Dark and
the widths reuse what exists — the bar's switch and its viewport presets —
so picking one turns the page rather than letting the panel claim a state
nobody can see.

**The order is fixed, and that is the deliberate departure.** Nordcraft's
list is reorderable, and honestly so: there, the list *is* the stylesheet.
Here the page's own rules sit underneath and ours go on top, so an order
someone chose in the panel would be a promise this cannot keep. It is stated
instead: default, width, dark, state.

The two hard parts live in `studio/conditionSheet.ts` as pure string
functions rather than inside the content script, which is the only reason the
selector cases are checked at all — a pseudo inside `:not()`, `:focus` that
is really `:focus-visible`, a list where one part carries the pseudo and the
rest do not, a rule nested in a layer inside a media query.

Out of scope on purpose, so that Effects and motion stays one item:
transitions and animations, pseudo-elements, `@starting-style`, compound
conditions (hover at 700px), and container queries.

Two reviews followed, one over W17 alone and one across both workstreams,
and closed eighteen things between them. The ones worth remembering: the
value an edit started from was read in the default state when the selection
changed while a state was held, which is the one fact this feature exists to
get right; the page stayed dark or stayed narrow after a deselect, so turning
the page now follows the condition rather than the click that set it; a held
state previewed the page's rules from before the re-skin; the "a variable
already holds this value" remark was computed from base values and so named
the wrong token under dark; two widths tied in the cascade, so which won
depended on the order the edits happened to be made in; and the panel trusted
a truthy reply to an element read, which a generic acknowledgement from
another build would have written into its state.

The widths on offer are the page's own. The scan keeps every width query its
stylesheets are written against (`ScanResult.breakpoints`, collected on the
walk that already looked for variables redefined under one), and the bar
offers those; `set-viewport` takes a bare width for them, since a breakpoint
is not a device and has no height. A page that declares none falls back to
the bar's device presets, which say in the control's title that they are a
guess rather than the page's own.

Both sides of a width are offered, because a page written mobile-first says
everything in `min-width` and offering it `max-width` would be offering a
vocabulary it does not use. The agent's `get_screenshot` takes the same
widths, since a brief naming `(max-width: 700px)` is no use if the only way
to look at it is the nearest phone.

**Known limits.** A state is previewed by class, so a rule whose pseudo sits
on an ancestor is named rather than shown, and a page that styles hover
through script rather than CSS shows nothing. A page with more than eight
breakpoints has the list cut at eight, narrowest first. A width query written
in `em`, or as a range, is not offered — only a plain pixel width is, because
that is the one the viewport can be set to without guessing at a root font
size — and nor is one outside 200–2560px, where no layout is a design anyone
ships.

## Still to build

In order.

1. **Effects and motion (L).** First half done, 16 September 2026.
   `box-shadow` comes apart into per-layer fields (inset, offset, blur,
   spread, colour); `filter` and `backdrop-filter` get a blur radius; and
   `transition` gets an editor for what moves, how long it takes, how long it
   waits, and on what curve — the curve picked by name, the page's own
   `--ease-*` first and written back as `var(--ease-out)`. **Play** takes the
   element out of the held state and puts it back a frame later so the
   transition runs, which is the one part of this an agent cannot do for you
   and the reason W17 had to come first.

   The two pure modules (`studio/effects.ts`, `studio/motion.ts`) fail closed
   by round trip rather than by vocabulary: a value they cannot rebuild
   exactly keeps its text field and says so. That covers a whole-value
   `var()`, a filter that is a pipeline, and anything with a shape they would
   lose pieces of.

   The brief gained the duty that comes with motion: a line asking for a
   transition, an animation or a filter also asks for
   `prefers-reduced-motion`.

   **The second half, 21 September 2026 (W25).** `transform` is an editor
   of its own (`studio/transform.ts`): the computed matrix comes apart into
   translate, rotate, skew and scale exactly one way and goes back to the
   same matrix, so the fields show what the page does and write the
   functions a stylesheet would carry; a 3D matrix keeps its text. The
   skew is `atan` of the exact ratio, not `atan2`, or a flipped scale turns
   a small skew into one past a right angle. `animation` is fields too
   (`studio/animation.ts`, fail closed by round trip like the transition
   editor, with `none` read as the name of no animation), and over it
   Framer's three triggers: **Appear** runs once and stays, **Loop** runs
   forever back and forth, **Scroll** runs along `animation-timeline:
   view()` — each one declaration, each reading back as itself. What they
   animate is a `@keyframes` block: the page's own, read off its sheets
   (`pageKeyframes`), or one of four named presets (fade in, rise, scale
   in, pulse) that the element sheet defines once ahead of the rules that
   name them and the brief spells out **in words**, since the brief carries
   no rule bodies. Still declined: **noise**, a generated texture rather
   than a value read off a computed style. Shadows and easings still have
   no home in `BrandConfig` beyond the levels and curves already there.
2. **Tests under the content scripts (M).** Started, 12 September 2026. The
   two passes that read a page's custom properties and the sheet that repaints
   a page with no variables moved into `studio/scan/` and have 38 tests
   between them, against real stylesheets where happy-dom can parse them and
   hand-built rules where it cannot (it turns `@layer` into nothing and does
   not support nested CSS at all — which is why the walk is structural rather
   than `instanceof`, and why it is more robust in a browser too).

   The two passes had duplicated their walk without sharing it, which is how a
   media query nested inside a style rule came to be visible to one and
   invisible to the other. There is one walker now, carrying the grouping
   rules open around each style rule, so a caller can read the widths or put a
   rewritten rule back where it came from.

   A review of the extraction caught three behaviour changes it had not
   intended, which is the argument for reviewing refactors rather than
   trusting them: CSS nesting became visible to the override builder and its
   `&` selectors were emitted as written, where `&` alone means `:root`;
   `@page` passed the duck-typed style-rule test because it has both a
   selector and a style; and an `@import` was followed without the media or
   layer it was pulled in under. All three are fixed and pinned.

   The inspector followed on 21 September 2026 (W22): what could be read
   without painting moved into `studio/inspect/` — the colour maths and the
   composite behind an element (`colour.ts`), the page as structure
   (`dom.ts`: own text, neighbours, the layers walk, selector lookups),
   reading an element (`readProps.ts`, with the rounding proxy), the
   chrome's placement as arithmetic (`geometry.ts`: edit card, size label,
   the region a drag drew) and the edit card's values (`editValues.ts`) —
   with 17 tests in happy-dom, one of which pins the shape `readProps`
   returns to the fixture the panel is tested against so the two cannot
   drift. `inspector.content.ts` is 1,633 lines and keeps only what is
   stateful: the overlay, the bar, the modes, the composer.

   The re-skin's three remaining walks followed the same day (W23), into
   `studio/siteDark.ts`: the site's dark rules hoisted out of their query
   (`hoistDark`, hooks collected on the way), the light-only blocks to switch
   off while that preview is up (`lightOnlyMedia` — finding is the pure
   half; the script does the switching, since it has to put them back), and
   what a proposed stylesheet reaches (`previewReach`, with the page's
   media, supports and query injected). Structural like every other walk,
   with `kindOf` saying what a rule is from what it has, so `@page` is not a
   style rule and a plain object in a test reads as a `CSSMediaRule` does.
   `reskin.content.ts` is 535 lines and keeps the sheets, the run tokens and
   the messages.

   What is left in the content scripts is DOM built by hand — the bar and
   the note composer in the inspector — and would want a different kind of
   test.
3. **Field and tree shortcuts (S).** What the W20 comparison found and set
   aside: Tab / Shift-Tab between fields; maths in a number field (`+20`,
   `*2`, `/2`); ⌘F to find a layer; Enter / Shift-Enter for child / parent
   in the tree; hold ⌥ to measure to the hovered element; ⌥1 / ⌥2 to focus
   the rail and the panel; a shortcuts sheet in the app menu. Escape already
   puts a field's draft back.
4. **A `critique` tool over the scan (S).** Done. Impeccable's contribution:
   the agent asks the panel what is wrong with the page and gets the contrast
   pairs under AA with element counts, the off-grid spacing, the
   near-duplicate colours, the type-ladder strays, the font-family and radius
   counts — `studio/critique.ts`, deterministic, numbers attached.

### Deferred, on purpose
Ship Studio's and Webflow's breakpoint canvas needs an iframe canvas, which
the live-page rule excludes; viewport presets on the bar are the answer
instead, and W13's `atWidth` reading covers the overrides it was for.
In-panel chat (and Framer's model picker with it) waits until the bridge
has earned it. Firefox build and store listing are packaging, not product.
Components stay as a strip of repeating selectors until a real grouping
earns a section.

From the W13 pass, recorded rather than built: **named explorations**
(Framer Branching, Webflow Releases) — saving override sets under a name per
site and switching before handing one off, which git already answers for
the primary use case.

## Known limits and open questions

- The content scripts — `inspector.content.ts`, `reskin.content.ts`,
  `scanner.content.ts`, `rail.content.tsx` and `background.ts` — are tested
  through what they are built from (`studio/scan/`, `studio/inspect/`,
  `studio/conditionSheet.ts`) rather than as scripts. What is left in them
  is browser-coupled and covered by the harness, not the suite. `studio/export/designSystemMd.ts` (W24: its sections are files under
  `studio/export/sections/`, the helpers in `mdHelpers.ts`; 537 lines left)
  and `studio/engine/semantics.ts` (W24: the picking helpers, the action,
  status and chart tokens are under `studio/engine/semantics/`; what is left
  is `defaultSemanticMapping` itself, 917 lines, one function that would
  want a real redesign rather than a cut).
- The definition search reads text, not a CSS parser: a definition written
  inside a string, or produced by a preprocessor that the source does not
  spell out, is not found. A file over 2MB, or a search past its budget, is
  skipped and the result says it was truncated — so absence never proves
  there is no definition, which is why nothing is written on absence.
- `apply_definition` writes through a temp file and a rename, and never
  touches git. A dev server with hot reload repaints from source within a
  moment; one without it wants a reload, and the row says so.

- The bar pushes the page with a root margin; a header the page fixes to the
  top of the viewport still sits under it. The rail does the same from the
  left: a fixed header runs under it, and a script reading `innerWidth` still
  sees the window. The rail cannot load Geist without exposing the
  extension's files to the page, so it wears the system sans; and it is
  React in a shadow root, 345 KB injected into the page on first use. Region notes store page
  coordinates, so one drawn with the bar shown lands 40px off when it hides.
- A device frame is drawn in the page (`studio/frame.ts`,
  `studio/pageFrame.ts`): the body is narrowed, centred and zoomed to fit,
  and each size media feature in the page's readable sheets is rewritten in
  place to a stand-in that is always or never true, from the source text it
  keeps. It replaced `chrome.debugger` emulation, which drew the frame in the
  tab's corner, needed an infobar, and lost the frame when the infobar was
  closed. What still sees the window: `vw`/`vh`, `innerWidth` and
  `matchMedia` in scripts, `position: fixed` and absolute positioning with no
  positioned ancestor, shadow-root styles, iframes, `<source media>` and
  `sizes`, cross-origin sheets the page cannot read, and the viewport meta
  tag (a page without one is not laid out at 980px). Readers of media text —
  breakpoints, the dark hoist, the scan's CSS text — go through
  `sourceMedia`/`withSourceMedia` so they see what the page wrote. Sheets
  and `media` attributes changed in the DOM are answered before the next paint;
  anything changed through the CSSOM within a second, by a full walk that
  writes only what changed.
- Dark shows the page's own dark mode by hoisting its dark media rules and
  setting its theme hook, and switches the page's light-only media blocks
  off in place (`not all`) for the duration; a theme driven purely by script
  with no CSS hook stays light, and a light-only block inside a fetched
  cross-origin sheet was never applied to begin with. The mirrored preview,
  used where the page has no dark mode, reads the page as light; chromatic
  colours on no ramp keep their place.
- The length rewrite, like the colour rewrite, never sees cross-origin
  sheets or inline styles.

- Framer projects define no custom properties — Framer owns the CSS, so the
  commit flow can't apply. Export only.
- Gradients have no home in `BrandConfig` — the one genuine engine gap.
- Two distinctness warnings ship unresolved in the default brand; documented in
  the engine as unfixable by tuning.
