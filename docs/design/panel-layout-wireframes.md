# Panel layout — the rail, Select-only, and the Style column

A living contract for how Codename is laid out from W20 (21 September 2026)
on. A build that contradicts it stops and re-checks here first. The mocks
are in `panel-layout-wireframes.html` beside this file; both are updated in
place, never forked.

## The reframe

Every traditional design tool — Framer, Figma, Webflow — keeps the layers
tree on the **left** of the canvas, the selected element's styles on the
**right**, and an action bar across the top. Codename had five tabs in one
~360px column on the right of the browser, with the tree stacked above the
selection inside one of them, so nothing was where a designer's hands
expected it.

A Chrome side panel cannot become two columns: Chrome floors it at ~320px,
gives an extension no width API, and forgets a dragged width across
restarts. So the tree could not move left *inside* the panel. It moved left
*in the page* — the live page is the canvas, and Codename already draws its
bar and its device frames there.

## Information architecture

| Surface | Holds | Where |
| --- | --- | --- |
| **Bar** | Layers · Select · Comment · host · device frame · Reset · agent chip · Light · Auto · Dark | Across the top of the page, 40px, pushes the page down |
| **Rail** | Pages (the site's pages as this page links to them) · Layers (components strip, filter, tree with an icon per row) · Assets (SVG grid) | In the page on the left, 240px by default (180–420, drag the edge), pushes the page right |
| **Panel** | Style · Variables · Export · Changes | The Chrome side panel on the right |
| **Selection** | 2px outline, W×H label under the box, the edit card | On the page |

The tree has one home, the rail. The panel keeps no tree; its Style tab
offers **Show layers** when the rail is folded, and with nothing picked it
shows what the page is made of — colours with the variables that name
them, fonts at the sizes used, radii and spacing — each a way into
Variables, as Figma's design panel does with no selection.

## Per-surface rules

### The page (Select is the only mode)

- Pointer over an element: a **1px outline**, nothing else. No tag, no
  readout — the click is the readout.
- Click: a 2px outline, the size label under the box (above it when the
  box runs off the bottom), the edit card beside it. Escape lets go, one
  level at a time.
- A row hovered in the rail peeks the same 1px outline on the page.
- The hover card (font · text · fill · contrast · box) is gone: the edit
  card and the panel said the same things again.

### The rail

- Docked left, under the bar, above the page's own fixed elements. The
  page is pushed right with `html { margin-left }` `!important`, saved and
  restored exactly (`studio/pushRoot.ts`), as the bar pushes it down.
- Shown wherever the bar is; folded by **Layers** on the bar, **Alt+L**, or
  the panel; remembered per session (`session.rail`). Width remembered in
  `chrome.storage.local`.
- Talks to the inspector in the same page through `window.__codenameInspector.handle`
  (`shared/inpage.ts`); learns the selection from the `codename:selected`
  event the inspector dispatches. Talks to the panel only for what belongs
  in the change log: a drag is `rail-move`, the eye is `rail-hide`, a
  component pick is `rail-scope`.
- Reads the tree again 600ms after the page stops changing, and only while
  Layers is the tab showing and the document is visible.
- Its keyboard is its own: the inspector's window listeners ignore events
  that pass through the rail's host. Undo, redo and Escape still work from
  it: the rail forwards ⌘Z to the panel and asks the inspector to deselect.
- Pages is `document.links`, same origin, deduped by path, the current
  page first (`studio/pages.ts`). Clicking one navigates the tab.
- A device frame fits the room the rail leaves (`availableWidth` in
  `studio/frame.ts`).

### The Style column

Groups in the order the three tools agree on, all open, heads sticky:

1. **Position** — static / relative / absolute / fixed / sticky; insets and
   z-index once positioned.
2. **Size** — W and H, each with **Fixed · Fill · Fit · Rel**; min/max
   behind **+ Add** until one is set; overflow.
3. **Layout** — Block · Stack · Grid · Inline; direction and wrap; the 3×3
   align grid plus a Distribute select; row and column gap; and, for a
   flex child, grow / shrink / order, basis and align-self.
4. **Spacing** — the box diagram, every number a field; a link control
   (each / pairs / all) says how far an edit reaches.
5. Colour · 6. **Type** — the family field offers the fonts the page loads,
   the weight is a named list that says which weights are not loaded for
   that family · 7. Border · 8. Effects, with a slider beside opacity ·
   9. Motion · 10. Text.

**Size modes fail closed.** A computed width is always a pixel count and
says nothing about what the author wrote, so a mode lights only when the
evidence is unambiguous: this log wrote it, or the element is a flex child
that grows along the parent's main axis. Otherwise nothing is lit and the
raw value stands. Writing is exact: Fixed pins the rendered px, Fill is
`flex: 1 1 0%` on a main axis (`align-self: stretch` across it, `auto` /
`100%` in block flow), Fit is `fit-content`, Rel is the rendered share of
the parent's content box in %. Fill along a main axis is one declaration
(`flex: 1 1 0%`), so the brief carries one line.

## The visual system (W28)

Chosen from five directions drawn from Framer, Figma, Webflow, Rive and
Jitter on Mobbin: **A · Framer rows**. Section 8 of the HTML is the mock.

- **One palette.** The bar, the rail and the panel read `shared/tokens.css`;
  the bar and the overlays read the same values through `OVERLAY`
  (`shared/theme.ts`), which `theme.test.ts` pins token by token. The bar
  sits on `surface-app` with a `line` edge, as the rail's strip does. The
  selection, its size label and the marks follow the panel's theme.
- **One height.** `h-control` 24px for a field, a button or a segmented
  group; `h-control-sm` 20px for a chip or an action inside a row;
  `btn-lg` 32px for the one thing a screen is for.
- **Fields are fills.** `field`, `field-select`, `field-invalid` in
  `shared/theme.css`: no border, a lighter fill on hover, a 1px accent edge
  on focus, a warn fill when a value will not take. A number field's letter
  sits inside it and is the scrub handle.
- **Accent is spent sparingly.** "On" in a segmented group is a neutral
  raised pill (`surface-thumb`). Accent marks the selection (outline, rail
  row, its icon), focus, a held state (hover, dark, a width), and the one
  primary button on a screen.
- **Labels.** One 56px column, sentence case, 11px ink-muted. Group and
  section heads: 11px medium ink, 30px, full-width hairline, a chevron on
  the right. Subheads: `subhead`, 10px medium ink-muted, never capitals.
- **Sticky.** The strip holding the selection and its state sticks at the
  top of the Style column; the group heads stick under it (`--style-top`).
- **Tags** are 16px fills with a 4px radius, not outlined pills. **Callouts**
  are fills. **Empty states** are `Empty` (`components/States.tsx`) at two
  sizes. **Icons** are SVG; no text glyph stands in for one.
- **Type scale** stays 10 · 11 · 12 · 13 · 15px, now with a job each: 10 for
  tags, captions and subheads; 11 for every control and label; 12 for a
  card's title and a large button; 13 the body default; 15 unused in the
  chrome.

## Cross-cutting rules

- Every number field: type, Enter commits, Escape puts the draft back,
  arrows nudge, ⇧ ×10, ⌥ ×0.1, drag the grip to scrub.
- Nothing is derived from a stylesheet URL; no authored value is guessed.
- The bar, the rail and the panel wear one palette (`shared/tokens.css`)
  and one utility set (`shared/theme.css`).

## Accepted limits

- A page header fixed to the viewport sits under the rail, as it sits
  under the bar. Scripts reading `innerWidth` still see the window.
- The rail cannot load Geist without exposing the extension's files to the
  page; it falls back to the system sans.
- The rail is React in a shadow root inside the page: 345 KB injected on
  first use.

## Explicitly deferred

- **Shortcuts** (next round): Tab / Shift-Tab between fields; maths in a
  number (`+20`, `*2`, `/2`); ⌘F to find a layer; Enter / Shift-Enter for
  child / parent in the tree; hold ⌥ to measure to the hovered element;
  ⌥1 / ⌥2 to focus the rail and the panel; a shortcuts sheet in the menu.
- **A label coloured when this log set its value** (Webflow's orange and
  blue). It would be honest, since it reads only the log, but it gives
  colour a new meaning, so it is a feature for its own round.
- **Folding a group with nothing set to a "+" head** (Framer). W20's "all
  open" stands.
- A two-column panel for people who drag the side panel wide. Considered
  and set aside for the rail; nothing prevents it later.
- Grid template editing, background images and gradients. (`transform` and
  `animation` arrived in W25, in Effects and Motion.)

## Phasing (as built)

1. Select-only on the page — hover card and tag removed, size label added.
2. The rail — new content script, panel to four tabs, the split deleted.
3. The Style column — new reads, size modes, align grid, editable spacing.
4. Shortcuts — deferred.
5. The visual system (W28) — tokens, the Style column, the rail, the bar
   and edit card, the other tabs; one PR each (#11–#15), docs in #16, a self-review pass in #17.
