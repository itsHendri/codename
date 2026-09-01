/**
 * SKILL.md — the procedural half of the export.
 *
 * DESIGN_SYSTEM.md tells an agent what exists; this tells it what to do, in the
 * imperative, with exact values and no room to interpret. It is deliberately
 * short: precision beats volume, and the reference file is one hop away when
 * detail is actually needed.
 */

import { LC_THRESHOLD } from "../engine/contrast"
import { POLISH_RULES } from "../engine/defaults"
import type { ResolvedTokens } from "../engine/types"

export function toSkillMd(resolved: ResolvedTokens): string {
    const { config } = resolved
    const { meta } = config
    const enabled = POLISH_RULES.filter((rule) => config.rules.polish[rule.id])

    const statusNames = ["success", "warning", "danger", "info"]

    return `---
name: ${meta.slug}-brand
description: Build UI in the ${meta.name} design system. Use whenever writing or reviewing components, pages, styles or markup for ${meta.domain ?? meta.name} — including colour, type, spacing, radius, elevation and motion decisions.
---

# ${meta.name} — build in this system

You are writing UI for ${meta.name}${meta.domain ? ` (${meta.domain})` : ""}. Its tokens are already
defined. Your job is to compose them, never to invent values.

Full token tables, component recipes and wrong/right pairs live in
\`references/DESIGN_SYSTEM.md\`. Read it before writing anything non-trivial.

## Before you write a line

1. Check that \`tokens.css\` is imported${
        (config.typography.fontFiles ?? []).length > 0
            ? ` and that \`assets/\` sits beside it — the \`@font-face\` \`src\` URLs are relative, and moving one without the other silently drops the page to a fallback stack`
            : ""
    }. Dark mode is \`data-theme="dark"\` on \`<html>\`; light is either \`data-theme="light"\` or no
   attribute at all — both are defined, so a toggle can write either value or remove it.${
       config.meta.logoSvg
           ? `\n   The brand mark is inline SVG in \`brand.json\`. Its wordmark path takes \`currentColor\` so it follows the surrounding ink and inverts in dark mode — but check whether the mark has an accent path before you rewrite every fill, because flattening a two-tone mark to one colour is a visible defect. An accent path takes \`var(--logo-accent)\`, which is the one token in this system that deliberately does *not* change between light and dark, because a logo does not. It is for the mark only. See Logo in the reference.`
           : config.meta.logoFile
             ? `\n   The brand mark is \`assets/${config.meta.logoFile}\`. It cannot be recoloured — check it against whatever surface you put it on.`
             : ""
   }
2. Work out which semantic tokens the thing you're building needs. If you cannot name them, you do
   not understand the component yet.
3. If no semantic token fits, **say so and stop**. Do not reach for a primitive or invent a hex.

## Hard rules

1. **Never write a colour literal.** No hex, \`rgb()\`, \`hsl()\` or \`oklch()\` in component code.
   Every colour is \`var(--<semantic>)\`.
2. **Never reference a primitive** (\`--primary-600\`, \`--neutral-200\`). Primitives are for tuning
   the ramp, not for building. Semantics only.
3. **Never write a dark-mode colour override.** Tokens re-point themselves under
   \`[data-theme="dark"]\`. A \`dark:\` colour variant means you used the wrong token.
4. **Surfaces are a ladder, and each level owns its shadow.** From the bottom:
   \`--surface-sunken\` (a well — a kanban column, an inset panel), \`--background\` (the page),
   \`--surface\` (a card), \`--surface-raised\` (a card that lifts — pair with \`--shadow-raised\`),
   \`--surface-overlay\` (modals, dropdowns, popovers — pair with \`--shadow-overlay\`). Never mix a
   surface with another level's shadow. There is no \`--card\` or \`--popover\`.
   Two levels coincide, in one mode each, and both are deliberate: in **light** mode raised and
   overlay are the same fill as \`--surface\`, because nothing is whiter than white and the shadow
   carries the elevation; in **dark** mode \`--surface-sunken\` is the same fill as \`--background\`,
   because nothing on the ramp is darker. Use the named token anyway — it is correct in the other
   mode, and hard-coding the one it collapses to breaks when the theme flips.
   \`--muted\` is a translucent quiet fill (table headers, inactive tabs, neutral badges, inline
   \`code\`, image placeholders), not a level: layer it over whichever surface it sits on. A
   **fenced code block is \`--surface-sunken\`**, not \`--muted\` — see rule 13.
5. **Text:** \`--foreground\` for body and headings, \`--foreground-secondary\` for supporting copy,
   \`--muted-foreground\` for captions and metadata. \`--foreground-tertiary\` is below the reading
   threshold — placeholders and watermarks only.
6. **On a solid fill, use its paired \`-foreground\`.** \`--primary\` takes
   \`--primary-foreground\`; \`--danger\` takes \`--danger-foreground\`. The polarity differs between
   fills on purpose — some are light, some dark. Do not unify them.
   **This extends to everything inside that fill**, not just the label: a button on a \`--primary\`
   band takes \`--primary-foreground\` for its text *and* its border, because \`--foreground\` is
   dark ink and unreadable there. Never soften the result with \`opacity\` — the pair was
   contrast-checked at full strength.
7. **Status is ${statusNames.join(", ")}** — not \`destructive\`. A banner is
   \`--<status>-subtle\` + \`--<status>-subtle-foreground\` + \`--<status>-border\`, and so is a
   badge. The solid \`--<status>\` is for things that act — buttons, status dots — never for text on
   a page background, and **never for a chart series**: series have their own tokens (rule 14).
8. **Interaction:** every solid fill has its own hover and pressed token —
   \`--primary-hover\`/\`--primary-active\`, \`--secondary-*\`, and one per status
   (\`--danger-hover\` for a destructive button). Neutral surfaces use \`--state-hover\` /
   \`--state-active\`, and the current item is \`--state-selected\`. Never compute a hover colour
   with \`filter: brightness()\` or an opacity overlay.
   **The four \`--state-*\` tokens are translucent washes, not fills.** Layer one over the surface
   the element already has — \`background: var(--surface)\` then \`background: var(--state-hover)\`
   on \`:hover\` works because the wash composites over whatever is behind it. That is why one token
   covers every level of the surface ladder instead of needing one per level:
   it is a mid grey, so it darkens every light surface and lightens every dark one. Do not put one
   on a coloured fill — they are calibrated against the neutral surfaces only, and a brand fill has
   its own \`-hover\` and \`-active\`. They have no \`-foreground\` of their own either: text keeps
   the colour it had.
9. **Focus is never removed, and there are three rings.** \`outline: 2px solid var(--ring);
   outline-offset: 2px\` on \`:focus-visible\` for anything with a neutral fill — buttons that are
   outline or ghost, inputs, links, scroll containers. \`--ring-inverse\` is for a ring drawn
   **inside** a coloured fill (\`outline-offset: -2px\`) or on an \`--inverse\` band; it is the
   neutral extreme for the mode, so on the page it is the page and disappears.
   **A filled button — \`--primary\`, \`--danger\`, any solid status — takes the double ring:**
   \`box-shadow: 0 0 0 2px var(--ring-inset), 0 0 0 4px var(--ring)\`. Neither single ring works
   there, and they fail in opposite directions: \`--ring\` drawn on the fill is the fill, and
   \`--ring-inverse\` offset outside the fill is the page. Concentric, one of the two always
   contrasts. Use it for anything else that can land on either kind of ground.
10. **Links in body copy are \`--link\`, underlined.** Not \`--primary\` — that is a fill colour and does not survive as text on a page. Hover is \`--link-hover\`, which gains contrast
    rather than losing it. **The underline is required, not stylistic** — colour alone must never be
    the only marker of a link (WCAG 1.4.1), and on some palettes \`--link\` is separated from
    \`--foreground\` by hue alone, which disappears in greyscale. The reference gives the measured
    figures for this brand. Inside an inverse region use \`--link-inverse\`.
11. **An inverse region is opposite to the mode, not fixed dark.** \`--inverse\` is a tooltip, a
    dark chip, a footer band — dark on a light page and *light* on a dark one. Everything inside it
    takes \`--inverse-foreground\`, \`--inverse-border\`, \`--link-inverse\`, \`--ring-inverse\`.
    The page-measured tokens are unreadable in there.
12. **Overlays and loading.** A modal backdrop is \`--scrim\`. Do not substitute a hex for it: like
    the state washes and \`--muted\` it is translucent, and the hex in the token table is the colour
    *before* its alpha is applied. A loading placeholder is \`--skeleton\` blocks on a
    \`--skeleton-surface\` container; animate it with a background-position sweep, never with
    \`opacity\`. The only blessed opacities are \`--opacity-disabled\` and \`--opacity-loading\`,
    and neither is for live text — fading text defeats the contrast audit, because the result
    depends on a ground the system cannot see.
13. **Code samples have their own colours, and a fenced block is a well.** \`pre\` takes
    \`--surface-sunken\` — *not* \`--muted\`, which is a mid grey that flattens every syntax colour
    onto one value — plus a \`1px solid var(--border)\`, because in dark mode sunken is the same fill
    as the page. Inside it: \`--code-keyword\`, \`--code-string\`, \`--code-number\`,
    \`--code-comment\`, and \`--code-added\` / \`--code-removed\` for a diff. Identifiers, function
    names and punctuation keep \`--foreground\`; there is no token for them. Inline
    \`code\` is the other case — it stays \`--muted\` and is not highlighted. Never colour a code
    sample with \`--success\`, \`--danger\` or any solid \`--<status>\`: those are fills and are
    not validated as text.
14. **Chart series are \`--chart-1\` … \`--chart-${resolved.semantics.filter((t) => t.group === "chart" && t.light.alpha === undefined).length}\`, used in order.** Start at
    \`--chart-1\` and take the next one each time; skipping breaks the separation the numbering
    guarantees. There are exactly ${resolved.semantics.filter((t) => t.group === "chart" && t.light.alpha === undefined).length} of
    them because that is how many this brand's seeds can keep apart — for one more category, change
    the encoding (dashes, hatching, direct labelling, small multiples), never the colour. A series
    carries no status meaning: do not reorder them so that a bad number comes out red. Axis labels
    are \`--muted-foreground\`, grid lines \`--border-subtle\`, the axis line \`--border\`. There
    is no translucent variant for area fills and no sequential or diverging scale — see the
    reference. An area or range band is \`--chart-N-subtle\` — one shared strength for every series,
    translucent so bands compose — but a band never identifies a series on its own: **always draw the
    line above it** in the solid token.
    **\`--scale-1\` … \`--scale-${resolved.semantics.filter((t) => t.group === "scale").length}\` are a different thing entirely: a *magnitude* scale**, for a heatmap
    cell or an intensity column. \`scale-1\` sits nearest the page and the last furthest from it in
    both modes. Never use it for categories and never use \`--chart-*\` for magnitude. **Most of its
    stops cannot hold text** — the reference says which can — so put the number beside the cell, not
    in it, and give the cells a border because the lowest stop is close to the page by design.
15. **Stacking order is a closed set:**
    ${config.layout.zLayers.map((l) => `\`--z-${l.name}\` ${l.value}`).join(", ")}. Never write a raw
    \`z-index\`, and never invent a number between two of them without saying why. The pairing that
    matters: \`--z-modal\` is ten above \`--z-scrim\`, not a hundred, because a dialog belongs
    immediately on top of its own backdrop. \`--z-toast\` outranks \`--z-modal\` on purpose — a
    confirmation rendered behind the dialog that triggered it is invisible when it matters most.
16. **The app frame has fixed dimensions too:**
    ${config.layout.shell.map((d) => `\`--shell-${d.name}\` ${d.rem}rem`).join(", ")}. \`--container-*\`
    bounds the page; these bound its furniture. A sidebar, a header height or a table's minimum width
    invented per-screen is how two pages in the same app stop lining up.
17. **Spacing comes from the blessed subset only:**
    ${config.spacing.blessed.map((px) => `${px}px`).join(", ")}. Nothing between them.
18. **Breakpoints are mobile-first and closed:**
    ${config.layout.breakpoints.map((b) => `${b.minPx}px (\`${b.name}\`)`).join(", ")}. Write base
    styles for the narrowest case and add \`min-width\` queries on top. Never a \`max-width\`
    breakpoint, never a number outside this set, and never \`var(--breakpoint-*)\` inside a media
    query — custom properties do not resolve there and the rule is dropped in silence.
19. **No content spans the viewport.** Every region's content sits in a container, centred with
    \`margin-inline: auto\`: ${config.layout.containers.map((c) => `\`--container-${c.name}\` (${c.maxRem}rem)`).join(", ")}.
    Running text takes \`--container-prose\` even inside a wider frame — a full-bleed paragraph is a
    bug, not a stylistic choice. Backgrounds and borders may span the window; a sticky bar is a
    full-bleed background with contained content inside it.
20. **Radius:** \`--radius-sm\` ${resolved.radius.sm}px, \`--radius-md\` ${resolved.radius.md}px,
    \`--radius-lg\` ${resolved.radius.lg}px, \`--radius-xl\` ${resolved.radius.xl}px. A rounded box
    inside another uses \`inner = outer − padding\`, floored at 0.
21. **Type is role-named.** Use \`--text-body\`, \`--text-heading\`, \`--text-label\` and friends.
    Heading *level* is about document outline; heading *size* is about the role token. Never size
    text with an arbitrary rem value.${
        config.typography.roles.some((role) => role.minSizeRem !== undefined)
            ? `\n    ${config.typography.roles
                  .filter((role) => role.minSizeRem !== undefined)
                  .map((role) => `\`--text-${role.role}\``)
                  .join(" and ")} are **fluid** — they already scale with the viewport. Never pin
    them to a fixed size or wrap them in a media query; both throw the scaling away.`
            : ""
    }${
        config.typography.families.display
            ? `\n    \`--font-display\` is a separate typeface for the \`display\` role only — not a
    heavier weight of the body font, and not for headings or UI.`
            : ""
    }
22. **Motion:** \`--duration-fast\` ${config.motion.durations.fast}ms,
    \`--duration-base\` ${config.motion.durations.base}ms, easing \`--ease-out\` for entrances.
    Exits are faster than entrances. Never \`transition: all\` — name the properties.

## Craft rules

${enabled.map((rule, i) => `${i + 1}. **${rule.title}.** ${rule.rule}`).join("\n")}

## Reviewing existing code

**Render it first, in both modes.** The worst defects in a page built loosely against this system
are invisible in the source: a declaration the browser silently drops, a dark-mode selector that
never matches, a hardcoded ink that stops agreeing with a tokenised surface once the theme flips.
Open the page, set \`data-theme\` both ways, and read computed styles. Say in your report that you
did, and say if you could not.

### Severity

Decided by **cause**, not by symptom, and the first rule that matches wins:

1. **blocking — it does not do what the code says.** A declaration the browser drops silently
   (\`font: var(--text-body)\` is the classic; so is any invalid shorthand), a selector that never
   matches, a token name that does not exist, a rule that only works in one mode. Nothing errors and
   nothing looks obviously wrong, which is what makes this the worst class.
2. **blocking — a person cannot read it, or cannot see where they are.** Text under its bar in the
   Contrast section — Lc ${LC_THRESHOLD.body} for body, ${LC_THRESHOLD.large} for large and UI,
   ${LC_THRESHOLD["non-text"]} for a boundary — or \`outline: none\` with no replacement, or focus
   that lands on a ground it cannot survive.
3. **blocking — a colour literal or a primitive in component code**, breaking hard rules 1 and 2. It
   is invisible to theming, so it is a dark-mode bug that has not happened yet.
4. **should-fix — a hard rule broken, with no silent failure and adequate contrast.** The wrong
   token, an off-scale spacing or radius, a raw \`z-index\`, a \`max-width\` breakpoint, a hover
   computed with \`filter\` or opacity, a container invented rather than chosen. Numerous and real,
   and none of it is on fire.
5. **polish — a craft rule.** The list above, and nothing that is also one of 1–4.

If two apply, take the lower number. If none applies, it is **out of scope** — see below.

### Verify before you claim

- Colour literals: \`grep -nE '#[0-9a-fA-F]{3,8}|rgb\\(|hsl\\(|oklch\\(' <files>\`.
- Primitives: \`grep -nE 'var\\(--(primary|secondary|neutral|success|warning|danger|info)-[0-9]' <files>\`.
- **Contrast: measure it.** The Contrast section validates the pairs this system *sanctions*, and a
  review meets exactly the ones it does not — \`--foreground\` on \`--warning\`, a link on a status
  fill. Those numbers are in no table because nobody blessed the pair. Compute APCA yourself against
  the bars, and say the figure. "Looks low" is not a finding; "Lc 30.6 against a body bar of 75" is.

### Report

The table, most severe first — plus two things it cannot hold:

| Severity | Location | Now | Should be | Why |
|---|---|---|---|---|

- **Location may be a list.** One rule broken in eleven declarations is one finding with eleven
  locations, not eleven findings. When it is, "Should be" states the policy rather than a value.
- **"Now" may be \`absent\`.** Some defects are a missing thing: no focus replacement, no scroll
  wrapper, no reduced-motion block, no webfont link.
- **A methods line above the table** — what you rendered, in which modes, and which figures you
  measured yourself rather than read.
- **An out-of-scope list below it**, and do not skip this one. This system covers colour, type,
  spacing, radius, elevation, motion and layout. It says **nothing** about markup semantics, which
  element a control is, or what the copy says — so a page can be perfectly tokenised and still ship
  a heading marked up as a \`<span>\`, a button that is an \`<a href="#">\`, or a table with no
  \`<th scope>\`. Those are real defects and this system gives you no basis to file them as
  violations. List them plainly as outside its scope rather than passing them in silence.

If you changed anything, say which rule each change served.
`
}
