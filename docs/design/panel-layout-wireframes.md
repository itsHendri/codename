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
| **Rail** | Pages (the site's pages as this page links to them) · Layers (components strip, filter, tree with an icon per row) · Assets (SVG grid) | In the page on the left, under the bar, 240px by default (180–420, drag the edge), pushes the page right |
| **Panel** | Style · Variables · Export · Changes | In the page on the right, under the bar (W33), 360px by default (320–520, drag the edge), pushes the page left; Chrome's side panel only on restricted pages |
| **Selection** | 2px outline, W×H label under the box; a right-click menu | On the page |

The tree has one home, the rail. The panel keeps no tree; its Style tab
offers **Show layers** when the rail is folded, and with nothing picked it
shows what the page is made of — colours with the variables that name
them, fonts at the sizes used, radii and spacing — each a way into
Variables, as Figma's design panel does with no selection.

## Per-surface rules

### The page (Select by default; Preview and Comment beside it)

**W35:** Select is where the bar starts and where Preview and Comment come
back to (their button again, or Esc). Clicking the selection again lets go.
Pressing on the selection and dragging moves it among its siblings — a 2px
accent line where it will land, across for flex rows and grids, down
otherwise — filed as the rail's `move` and applied as a real DOM move.
**Preview** is the page left alone, to be used as a visitor would: nothing
outlined, nothing picked, links and buttons working. Alt+P switches it.
Moving into another container is deferred: it is a bigger promise than a
reorder.

- Pointer over an element: a **1px outline**, nothing else. No tag, no
  readout — the click is the readout.
- Click: a 2px outline and the size label under the box (above it when the
  box runs off the bottom). Nothing opens over the page: the panel holds the
  properties. Escape lets go, one level at a time.
- **Right-click (W30)**, while Select is on: picks what is under the pointer
  and opens a menu at the pointer — Select parent · Select child · Edit all N
  matching · Hide · Add a note… · Copy selector · Show in panel · Deselect.
  Every item is something the rail, the bar or the panel already does, so
  the menu adds no capability, only reach. Alt+right-click keeps the
  browser's menu. The **edit card is gone**: Figma and Framer open nothing
  over the canvas on a selection, and the card repeated the panel beside it.
- A row hovered in the rail peeks the same 1px outline on the page.
- The hover card (font · text · fill · contrast · box) is gone: the edit
  card and the panel said the same things again.

### The rail

- Docked left, under the bar, above the page's own fixed elements. **The bar
  spans the whole tab and the rail starts under it (W29)**, as Framer's top bar
  frames both of its side columns; W27's one row, with the rail beside the
  bar, left the bar squeezed into the width beside the rail. The Chrome side
  panel was Chrome's, not the page's, so the bar could not reach over it —
  **W33 moved the panel into the page too**, as an iframe of the extension's
  own panel page, so the bar now frames both columns. The
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

**Since W54, Nudge's order and look** (github.com/charlessmart/nudge-ui,
MIT). Sections are divided by a hairline, labels sit above their fields two
to a row, and nothing is sticky but the selection strip:

1. **Layout** — W and H, each with **Fixed · Fill · Fit · Rel** beside it;
   a ⛶ toggle in the head for min and max; Display and Position as
   listboxes; insets and z-index once positioned; Overflow. For a stack or
   grid: the 3×3 align grid (Nudge's dots and bars), direction as arrows,
   wrap, Distribute (Keep grouped · Spread between · around · evenly), gaps.
   For a flex child: grow, shrink, basis, align-self, order.
2. **Spacing** — Padding and Margin, each as two paired fields (across,
   down) with a toggle to four sides. The box diagram is gone; the handles
   on the page are the visual way in.
3. **Appearance** — Opacity (as %) and Corner radius, with a toggle to each
   corner in the head.
4. **Text** — type style, family (a well with the page's fonts behind the
   chevron), weight, size · line height · tracking, align as icons.
5. **Colour** — the text colour.
6. **Background · 7. Border · 8. Box shadow · 9. Effects · 10. Motion** —
   each folds to its title and a **+** when the element has none of it.
11. **Content** — the element's own text.

**+ and − (W54, reversing W28's "all open").** A section folds only when
the computed value is that property's "nothing" *and* this log has written
nothing to it (`studio/inspect/presence.ts`), so the page decides what is
open and a fold never hides a set value. **+** on Background, Border or Box
shadow puts on a visible start (white; 1px solid; 0 4 12 at 10% black) as
one ordinary edit; on Padding, Margin, Effects and Motion it only opens the
fields. **−** writes each set property back to its "nothing" (`padding: 0`,
`border-style: none`, `transition: none`…), an edit like any other in the
brief.

**Size modes fail closed.** A computed width is always a pixel count and
says nothing about what the author wrote, so a mode lights only when the
evidence is unambiguous: this log wrote it, or the element is a flex child
that grows along the parent's main axis. Otherwise nothing is lit and the
raw value stands. Writing is exact: Fixed pins the rendered px, Fill is
`flex: 1 1 0%` on a main axis (`align-self: stretch` across it, `auto` /
`100%` in block flow), Fit is `fit-content`, Rel is the rendered share of
the parent's content box in %. Fill along a main axis is one declaration
(`flex: 1 1 0%`), so the brief carries one line.

## The visual system (W54, Nudge's)

W54 replaced W28's Framer rows with Nudge UI's measurements, after Hendri
compared the two and asked to clone Nudge. Values are in `shared/theme.css`
and `shared/tokens.css`; the notice is in `THIRD_PARTY_NOTICES.md`.

- **One palette.** Light is Nudge's (panel `#f5f5f4`, a 5% black well flattened
  to `#e9e9e8`, ink `#242424`, accent `#0096ff`); dark mirrors it. The bar and
  the overlays read the same values through `OVERLAY`, pinned by
  `theme.test.ts`, which also records the contrast (primary text clears Lc 75
  on both sides).
- **Inter at 12px** for every control, label and title; 10px for small
  print. Bundled as `Codename Inter` and added to the page's font set for the
  rail and the bar (`shared/inpageFont.ts`).
- **One height.** `h-control` 32px for a field, a button or a segmented
  group; `h-control-sm` 24px for a chip or an action in a row; `btn-lg` 40px.
- **Fields are wells.** No border, a deeper well on hover, an inset 2px accent
  ring on focus. A field leads with an icon (Tabler, 16px at 1.5) that is its
  scrub handle; the drag locks the pointer, one step per 16px.
- **A token is the value.** When the declaration names a variable, a white
  chip inside the well replaces the value (`TokenChip`); "matches" stays a
  chip under the field.
- **Popups, not native selects.** `Listbox` (Base UI Select) and the token
  picker open a white card under the field: 34px rows, a tick on the chosen
  one, a search row when the list is long.
- **Buttons.** Primary is a raised white button; the one accent fill on a
  screen is `btn-accent-fill` (Make changes).
- **Accent is spent sparingly.** "On" in a segmented group is the raised
  white thumb. Accent marks the selection, focus, a held state and the one
  accent-filled action.
- **Sections.** `section` / `section-title`: 12px semibold titles, 8px
  rhythm, a hairline under each, a + / − or toggle on the right. Labels
  (`field-label`) sit above their fields. Gutters are 20px.
- **Tabs** are a filled rectangle for the active one, no underline (W29).
- **Tags, callouts, empty states, icons** as W28 had them, at the new sizes.

## Cross-cutting rules

- Every number field: type, Enter commits, Escape puts the draft back,
  arrows nudge by 1, ⇧ by 8 (rem by ⅛ and 1), drag the leading icon to scrub
  (pointer locked, one step per 16px, ⇧ one step of 8 per 8px) — Nudge's rules, W54.
- Nothing is derived from a stylesheet URL; no authored value is guessed.
- The bar, the rail and the panel wear one palette (`shared/tokens.css`)
  and one utility set (`shared/theme.css`).

## Accepted limits

- A page header fixed to the viewport sits under the rail, as it sits
  under the bar. Scripts reading `innerWidth` still see the window.
- **The room between the columns (W34).** Chrome's side panel narrowed the
  tab, so media queries saw the width the page really had; the panel drawn in
  the page does not. With no device frame chosen, the page is shown in a
  *fill* frame the size of that room — zoom 1, no outline, nothing dimmed —
  so its media queries answer to it and "Window" on the bar reads the room's
  width. It re-fits as a column is shown, hidden or dragged. The frame's
  limits apply: `vw`, `innerWidth` and a script's `matchMedia` still see the
  window.
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
- Menu items that would be new capabilities: duplicate, delete, wrap in a
  container, copy and paste styles. Each writes structure or copies values
  the brief has no line for yet.
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
