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

- **Honest extraction.** `seedFromScan` builds a `BrandConfig` from the page:
  ramp names from the site's own CSS variables, type scale from observed usage,
  radius/spacing/elevation from a scanner pass, fonts that actually load,
  voice left empty. Verified against a live stripe.com scan — its purple, its
  `sohne-var` at weight 300, its 4px grid, zero preset leakage.
- **Four-tab panel.** Inspect · Design · Assets · Export, with Resize demoted to
  a header control and the full-tab Studio deleted.
- **Live re-skin** (both mechanisms, below) and the **hand-off brief**
  (`studio/commit.ts`), delivered by copy or JSON.
- 277 tests. `.harness/` renders the panel outside the extension.

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

Four workstreams, in dependency order. Sizes are rough.

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

### Deferred
Editable Type and Space seeds; APCA one-click fix; layers tree, effects and
motion editors (Design Mode parity); Ship Studio's breakpoint canvas (needs
an iframe canvas, which the rule above excludes); an Impeccable-style
`critique` tool; in-panel chat; Firefox build; store listing.

## Known limits and open questions

- Framer projects define no custom properties — Framer owns the CSS, so the
  commit flow can't apply. Export only.
- Gradients have no home in `BrandConfig` — the one genuine engine gap.
- Two distinctness warnings ship unresolved in the default brand; documented in
  the engine as unfixable by tuning.
