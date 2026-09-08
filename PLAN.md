# Codename — where this is going

Living plan. The wireframes are the visual half of this document:
<https://claude.ai/code/artifact/be094c1e-2385-4035-a3d5-31eb14dbb42e>
(the **Design tab (v2)** page).

## The idea in one line

Open the panel on a site, see the design system it's actually running, change
it, watch the real page repaint — and on a project you own, have your agent
apply that change to the repo.

## What settled the shape

Three tools solve the adjacent problem and agree on two things:
**Design Mode** (designmode.app), **Ship Studio** (ship.studio),
**Stacki** (stacki.build).

1. **The live page is the canvas.** None of them builds a synthetic preview.
   This is why Codename has no full-tab UI: an extension already has the site
   in front of it, and a separate tab walks you away from the thing your data
   describes.
2. **Tokens get their own top-level panel**, separate from the element
   inspector — the system is a different surface from the selection.

Also worth keeping from them: drag-scrub over typing, showing consequence before
you commit (contrast, "×N uses"), and failing closed — marking something
read-only rather than guessing at it.

## Done

- **Honest extraction.** `seedFromScan` builds a `BrandConfig` from the page:
  ramp names from the site's own CSS variables, type scale from observed usage,
  radius/spacing/elevation from a new scanner pass, fonts that actually load,
  voice left empty. Verified against a live stripe.com scan — its purple, its
  `sohne-var` at weight 300, its 4px grid, zero preset leakage.
- **Four-tab panel.** Inspect · Design · Assets · Export, with Resize demoted to
  a header control and the full-tab Studio deleted.
- 249 tests. `.harness/` renders the panel outside the extension.

## Live re-skin — variable path done

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

**Path 1 is built** (`studio/reskin.ts` + `entrypoints/reskin.content.ts`).
**Path 2 is not.** Measured reality: stripe.com exposes zero readable custom
properties while forfontsake has 26, so path 2 is not a nice-to-have fallback —
it is what makes this work anywhere but your own projects. Until it exists the
panel says "no variables to change here" rather than failing silently.

How a variable is matched, and nothing else is touched:

- **exact** — its value is a step on a ramp; it moves to that step after the
  edit. Compared step-to-step across the edit, never variable-to-step, or a
  variable sitting merely *near* a step gets snapped onto the ramp when nothing
  changed.
- **family** — it shares a hue with a seed that moved; the hue rotation and
  chroma ratio are applied while keeping its own lightness, so a wash stays a
  wash. The chroma floor (0.025) sits in the measured gap between forfontsake's
  brand wash (0.033) and its neutrals (≤0.016).

### Known limits
- Only the first definition of a variable is captured, so a value defined again
  under `.dark` or a media query is invisible. Overrides use the mode selected
  in the panel. Scope-aware capture is the fix, and is not built.
- An inline root override outranks every author rule for that element, which is
  what makes this work — but it also means a page whose theme is scoped to a
  descendant (`.theme-dark .card`) will not fully follow.

## After that: the agent link

The change list is a **commit, not a browsing surface**. You design, then tell
your agent to apply it to the repo; a confirmation screen shows what will be
written, and nothing is written until the agent runs.

- **Token-level changes only**: `--brand-primary: #533AFD → #1C7F5C, tokens.css
  L12, 34 uses`. The agent edits the *definition*, never resolved hexes stamped
  across components.
- Needs a mapping from Codename's tokens onto the project's own. This is the
  hard part of the whole idea, and it is only solvable because you own both
  sides.
- Transport undecided: MCP server, CLI, or a watched file. An extension cannot
  host an MCP server itself, so any of these needs a small companion process —
  Design Mode uses a local WebSocket bridged to stdio MCP.
- **Only where a project is linked.** On a site you don't own there is no repo
  to write to, so the flow isn't offered at all; export is the way out.

## Known limits and open questions

- Framer projects (`swissborg-brand-system`, `starter-kit`) define no custom
  properties — Framer owns the CSS, so the commit flow can't apply. Export only.
- Gradients have no home in `BrandConfig` — the one genuine engine gap.
- Two distinctness warnings ship unresolved in the default brand; documented in
  the engine as unfixable by tuning.
- Not started: Firefox build, store assets and listing, `PRIVACY.md`.
