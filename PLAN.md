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
- Only the first definition of a variable is captured, so a value defined again
  under `.dark` or a media query is invisible. Scope-aware capture is not built.
- An inline root override outranks every author rule for that element — but a
  page whose theme is scoped to a descendant (`.theme-dark .card`) will not
  fully follow.
- Path 2 can only read same-origin stylesheets; `unreadableSheets` records which.
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

Drag-to-reorder is deliberately not here. A reorder is a DOM change rather
than a style one, and on the dev server this is built for it would be undone
by the next render and can confuse the framework's reconciliation. If it
comes, it comes as an instruction in the brief rather than as a live edit.

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
click, which is the edit a token system wants.

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

## Still to build

In order.

1. **Effects and motion (L).** Drop and inner shadow, blur, noise; then the
   trigger-first interaction editor (hover, press, focus, appear, loop,
   scroll) with a shared easing curve. The largest remaining chunk, and the
   one that needs the most new engine surface.
2. **A `critique` tool over the scan (S).** Done. Impeccable's contribution:
   the agent asks the panel what is wrong with the page and gets the contrast
   pairs under AA with element counts, the off-grid spacing, the
   near-duplicate colours, the type-ladder strays, the font-family and radius
   counts — `studio/critique.ts`, deterministic, numbers attached.

### Deferred, on purpose
Ship Studio's breakpoint canvas needs an iframe canvas, which the live-page
rule excludes; viewport presets on the bar are the answer instead. In-panel
chat waits until the bridge has earned it. Firefox build and store listing
are packaging, not product. Emulating a site's *own* dark mode needs the
`debugger` permission and its permanent infobar; the mirrored preview is
the answer for now. Components stay as ×N badges until a real grouping
earns a section.

## Known limits and open questions

- The bar pushes the page with a root margin; a header the page fixes to the
  top of the viewport still sits under it. Region notes store page
  coordinates, so one drawn with the bar shown lands 40px off when it hides.
- Zoom-to-fit matches width only, and Chrome resets a per-tab zoom on
  navigation, so a reload leaves the window resized at 100%; the label
  re-asks and says so.
- The dark preview reads the page as light; a site that is already dark is
  mostly left alone. Chromatic colours on no ramp keep their place.
- The length rewrite, like the colour rewrite, never sees cross-origin
  sheets or inline styles.

- Framer projects define no custom properties — Framer owns the CSS, so the
  commit flow can't apply. Export only.
- Gradients have no home in `BrandConfig` — the one genuine engine gap.
- Two distinctness warnings ship unresolved in the default brand; documented in
  the engine as unfixable by tuning.
