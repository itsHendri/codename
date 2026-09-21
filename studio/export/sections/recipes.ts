/** The component recipes: what each part of the interface is made of, shown right and wrong. Part of DESIGN_SYSTEM.md; see ../designSystemMd.ts. */

import { apca, CHART_MIN_DELTA_E, COLLISION_DELTA_E, composite, deltaE, LC_THRESHOLD, SYNTAX_MIN_DELTA_E } from "../../engine/contrast"
import { spaceName } from "../../engine/defaults"
import { SCALE_ROLES, type ResolvedTokens, type SemanticGroup } from "../../engine/types"
import { chartPlanFor, scaleInkFor } from "../../engine/semantics"
import { primaryFamily } from "../css"
import { table, deviations, cellValue, tokenTable, labelPairsFor, SHADCN_NAMES, GROUP_TITLES, GROUP_ORDER } from "../mdHelpers"

export function componentRecipes(resolved: ResolvedTokens): string {
    const labelPairs = labelPairsFor(resolved)
    const r = resolved.radius
    const cardInner = Math.max(0, r.lg - 24)
    return `Component tokens deliberately do not exist. Compose these instead — the values below are
exact, not indicative.

**Applying a type role.** \`--text-body\` is a bare length, so the \`font\` shorthand will not take
it — \`font: var(--text-body)\` is invalid CSS and is dropped silently, leaving an unstyled element
and no console error. A role is **five** properties — the family is part of it, not a
separate decision — so set them individually:

\`\`\`css
.button {
    font-family: var(--font-sans); /* the role's family, from the table below */
    font-size: var(--text-label);
    line-height: var(--text-label--line-height);
    font-weight: var(--text-label--font-weight);
    letter-spacing: var(--text-label--letter-spacing);
}
\`\`\`

**Button (primary)** — \`background: var(--primary)\`, \`color: var(--primary-foreground)\`,
\`border-radius: var(--radius-md)\` (${r.md}px), height 40px, padding \`0 var(--space-4)\`, type role
\`label\`. Hover swaps the background to \`--primary-hover\`, active to \`--primary-active\`.
**Focus is the double ring** —
\`box-shadow: 0 0 0 2px var(--ring-inset), 0 0 0 4px var(--ring)\` — and not a single outline in
either token. A filled button is the one control where neither ring works alone, because the two
halves of the problem point opposite ways: \`--ring\` is the brand colour, so a ring drawn *on* a
\`--primary\` fill is the fill; and \`--ring-inverse\` is the neutral extreme for the mode, which
on this brand is the same value as \`--surface\` in light and as \`--background\` in dark — so a
ring drawn at \`outline-offset: 2px\`, i.e. **outside** the button on the page, is the page.
Measured on this brand, \`--ring-inverse\` against the page is Lc ${Math.abs(
        apca(
            resolved.semantics.find((t) => t.name === "ring-inverse")?.values.light!.hex ?? "#000000",
            resolved.semantics.find((t) => t.name === "background")?.values.light!.hex ?? "#ffffff",
        ),
    ).toFixed(0)} in light and Lc ${Math.abs(
        apca(
            resolved.semantics.find((t) => t.name === "ring-inverse")?.values.dark!.hex ?? "#000000",
            resolved.semantics.find((t) => t.name === "background")?.values.dark!.hex ?? "#ffffff",
        ),
    ).toFixed(0)} in dark. The double ring puts one of each concentrically, so whichever half matches
the ground, the other one is visible — which is what SKILL.md rule 9 says and what this recipe used
to contradict. \`--ring-inverse\` on its own is right only when it is drawn *inside* a coloured
fill (\`outline-offset: -2px\`) or on an \`--inverse\` band. Everything with a neutral fill —
secondary, outline, ghost, inputs — keeps plain \`--ring\` with a positive offset. The 40px height is the dense-desktop minimum; on touch, raise it to 44px or
extend the hit area with a pseudo-element.

**Button (secondary)** — identical, with \`--secondary\` / \`--secondary-foreground\`.

**Button (outline)** — \`background: transparent\`, \`color: var(--foreground)\`,
\`border: 1px solid var(--input)\`. Transparent, not \`--surface\`: an outline button sits inside
cards as often as on the page, and a fixed fill makes it vanish against whichever one it didn't
expect. Hover fills with \`--state-hover\`. **This recipe assumes a neutral ground** — see below for
what to do on a brand field.

**Anything on a brand field.** A full-bleed \`--primary\` band, a solid status banner, a filled card:
inside one, the neutral text tokens are wrong. \`--foreground\` is dark ink, and dark ink on a dark
brand colour is unreadable. The rule is that **a control or a piece of text sitting on a fill takes
that fill's own \`-foreground\` — for its text and its border both**:

\`\`\`css
.brand-band { background: var(--primary); color: var(--primary-foreground); }

/* ✅ a button on that band */
.brand-band .button {
    background: transparent;
    color: var(--primary-foreground);
    border: 1px solid var(--primary-foreground);
}

/* ❌ the outline recipe, unchanged — dark ink on dark indigo */
.brand-band .button { color: var(--foreground); border-color: var(--input); }
\`\`\`

The same holds for \`--danger\`, \`--success\` and the rest. And do not fade the result with
\`opacity\` to soften it: that pair was contrast-checked at full strength, and dimming it is how a
validated colour quietly stops being valid.

**The focus ring is part of this, and it has its own token.** \`--ring\` is the brand colour, so on a
\`--primary\` field it is invisible — the outline and the background are literally the same value.
Use \`--ring-inverse\`, which is the neutral extreme for the mode and is measured against exactly
this case:

\`\`\`css
/* ✅ on a brand field */
.brand-band .button:focus-visible {
    outline: 2px solid var(--ring-inverse);
    outline-offset: 2px;
}

/* ✅ when the control can land on either kind of ground, draw both rings —
   whichever half matches the ground, the other stays visible */
.button:focus-visible {
    box-shadow: 0 0 0 2px var(--ring-inset), 0 0 0 4px var(--ring);
}

/* ❌ the default ring, on the one background it cannot be seen against */
.brand-band .button:focus-visible { outline: 2px solid var(--ring); }
\`\`\`

**Set copy on a brand field at \`body-lg\` or larger.** Every \`-foreground\` is validated as a
label colour (Lc ${LC_THRESHOLD.ui}), not as body text (Lc ${LC_THRESHOLD.body}), and how much
headroom each has varies per fill. Measured on this brand in light mode, tightest first: ${labelPairs
        .map((p) => `\`--${p.role}\` Lc ${p.lc.toFixed(0)}`)
        .join(", ")}. The floor is \`--${labelPairs[0]?.role}\` at Lc ${labelPairs[0]?.lc.toFixed(0)}${
        (labelPairs[0]?.lc ?? 0) < LC_THRESHOLD.ui ? " — **which is under the label bar; that pair is reported in the contrast section**" : ""
    }. Set small print on the tighter ones and it will not be readable.
Small print on a brand band has no compliant colour in this system, so don't put any there.

**Card** — \`background: var(--surface)\`, \`border: 1px solid var(--border)\`,
\`border-radius: var(--radius-lg)\` (${r.lg}px), \`padding: var(--space-6)\`. **No shadow**: the
border is already doing the structural job, and \`--shadow-sm\` carries its own hairline layer, so
using both doubles the edge — visibly so in dark mode, where the shadow *is* a ring. Save
\`--shadow-overlay\` for things that genuinely float (popovers, dialogs) and give those no border.
Anything rounded inside a card takes ${cardInner}px — that's the concentric rule applied to this
card's ${r.lg}px radius and 24px padding, not a token.

**Input** — height 40px, \`padding: 0 var(--space-3)\`, \`background: transparent\`,
\`border: 1px solid var(--input)\`, \`border-radius: var(--radius-md)\` on the page (0 inside a padded
card — see the concentric rule), \`color: var(--foreground)\`. Transparent for the same reason the
outline button is: a field sits inside cards as often as on the page, and \`--surface\` is the card's
own colour, so a fixed fill leaves it with no edge but its border. Placeholder uses
\`--foreground-tertiary\`. Focus: \`outline: 2px solid var(--ring); outline-offset: 2px\`.

**Badge** — subtle by default: \`background: var(--{role}-subtle)\`,
\`color: var(--{role}-subtle-foreground)\`, \`border-radius: var(--radius-sm)\` (${r.sm}px),
\`padding: var(--space-1) var(--space-2)\`, type role \`label\`. \`{role}\` is \`primary\` or any
status. A badge is a label, and a page full of solid fills reads as a page full of buttons — so the
solid \`--{role}\` belongs on things that are *doing* something (buttons, chart series, status dots),
not on things that are *naming* something. Use a solid badge only when a single one must dominate.

For a **neutral badge** — "Off", "None", "Default", the state that isn't a status — use
\`background: var(--muted)\` with \`color: var(--muted-foreground)\`. Do not reach for
\`--secondary-subtle\`: it is a near-invisible wash against \`--surface\` and reads as a rendering
artefact rather than a chip.

**Interactive state fills** — \`--state-hover\`, \`--state-active\`, \`--state-selected\` and
\`--state-disabled\` are washes laid over an existing surface, so they carry no \`-foreground\` of
their own: text keeps whatever colour it already had, normally \`--foreground\`. The exception is
\`--state-disabled\`, which pairs with \`--foreground-tertiary\`.

**Alert** — \`background: var(--{status}-subtle)\`, \`color: var(--{status}-subtle-foreground)\`,
\`border: 1px solid var(--{status}-border)\`, \`border-radius: var(--radius-md)\`,
\`padding: var(--space-4)\`, where \`{status}\` is \`success\` | \`warning\` | \`danger\` | \`info\`.

**Table** — header row \`background: var(--muted)\` with \`color: var(--muted-foreground)\`;
row separators \`1px solid var(--border)\` — **not \`--border-subtle\`**, which is defined as
below the visible threshold and is forbidden from being the only thing dividing two regions. A row
is a region, and a row rule is the only thing dividing it from the next one. (On this brand
\`--border-subtle\` against \`--surface\` measures Lc ${Math.abs(
        apca(
            resolved.semantics.find((t) => t.name === "border-subtle")?.values.dark!.hex ?? "#000",
            resolved.semantics.find((t) => t.name === "surface")?.values.dark!.hex ?? "#fff",
        ),
    ).toFixed(0)} in dark — which is APCA clamping below its noise floor, not the line vanishing: it
is visible and it is below the threshold at which this system will vouch for it. Fine for a grid line
*inside* a plot frame, wrong for the only thing dividing two rows.) Use \`--border-subtle\` between things that are
*not* the structure — a label and its value inside one cell, a group of options inside one field; hovered row \`--state-hover\`; selected row
\`--state-selected\`. Columns of numbers that are compared or that change get
\`font-variant-numeric: tabular-nums\` — but not columns of identifiers that merely contain digits,
like version strings or reference numbers.

A table is the most common thing to break a narrow screen. Wrap it in an element with
\`overflow-x: auto\` and give that element \`tabindex="0"\` so it can be scrolled by keyboard; let the
table scroll inside the page rather than making the page scroll. The table itself takes
\`min-width: var(--shell-table-min)\`, which is the width it refuses to squeeze below. That wrapper
is focusable, so it needs a visible focus ring like anything else:
\`outline: 2px solid var(--ring); outline-offset: 2px\`.

**A *page*-sticky header row and that scroll wrapper are mutually exclusive — but a *panel*-sticky
one is not, and that is usually what you want.** An element with \`overflow-x: auto\` is a scroll
container, so a \`position: sticky\` \`<thead>\` inside it sticks to *the wrapper* and can never
reach the page. The obvious \`top: var(--shell-header)\` then pushes the header row down *over* the
first data row and hides it.

Give the wrapper a \`max-height\` and \`overflow: auto\` and the problem dissolves: the header
sticks to the top of the panel while the table still scrolls in both directions, at every width.

\`\`\`css
/* ✅ the header sticks to the panel, and the table scrolls both ways inside it */
.table-scroll { overflow: auto; max-height: 26rem; }
.table-scroll thead th {
    position: sticky;
    top: 0;                     /* the wrapper's top, not the page's */
    z-index: var(--z-sticky);
    background-color: var(--surface);
    background-image: linear-gradient(var(--muted), var(--muted));  /* opaque — see below */
}

/* ❌ a page-sticky header inside a scroll container: sticks to the wrapper anyway,
   and the offset hides the first row */
.table-scroll thead th { position: sticky; top: var(--shell-header); }
\`\`\`

A genuinely *page*-sticky header still needs no wrapper, and still means narrow screens get a
different layout for that table.

**Layering a translucent token.** \`--muted\` and the four \`--state-*\` tokens are washes, not
fills: they have no colour until something is behind them. Nesting one inside a surface usually
needs nothing — put \`background: var(--state-hover)\` on the row and it composites over the card it
sits in. But one element cannot take two \`background-color\`s, so when a wash needs to sit on a
*specific* surface rather than whatever it inherits — an opaque sticky table header being the case
that forces it, since rows would otherwise scroll visibly through it — stack them:

\`\`\`css
/* ✅ an opaque muted header: a surface underneath, the wash painted on top */
.table thead {
    background-color: var(--surface);
    background-image: linear-gradient(var(--muted), var(--muted));
}

/* ❌ the wash alone — transparent, so rows scroll through it */
.table thead { background: var(--muted); }
\`\`\`

**Asymmetric hover timing.** "Exits are faster than entrances" needs two declarations in CSS — the
base rule times the exit, the \`:hover\` rule times the entrance. One \`transition\` cannot do it:

\`\`\`css
.button {
    transition: background-color var(--duration-fast) var(--ease-out);
}
.button:hover {
    transition: background-color var(--duration-base) var(--ease-out);
}
\`\`\``
}

export function wrongRight(resolved: ResolvedTokens): string {
    const primary = resolved.semantics.find((t) => t.name === "primary")
    const hex = primary?.values.light!.hex ?? "#000000"
    return `\`\`\`css
/* ❌ a raw value — invisible to theming, wrong in dark mode */
.button { background: ${hex}; color: white; }

/* ❌ a primitive — skips the layer that carries the meaning */
.button { background: var(--primary-700); }

/* ✅ */
.button { background: var(--primary); color: var(--primary-foreground); }
\`\`\`

\`\`\`css
/* ❌ dark-mode variants on top of tokens that already changed */
.card { background: var(--surface); }
.dark .card { background: #1f262d; }

/* ✅ nothing to do — --surface re-points itself under [data-theme="dark"] */
.card { background: var(--surface); }
\`\`\`

\`\`\`css
/* ❌ the same radius inside and out — the curves fight */
.card { border-radius: ${resolved.radius.lg}px; padding: 16px; }
.card > img { border-radius: ${resolved.radius.lg}px; }

/* ✅ concentric: inner = outer − padding */
.card > img { border-radius: ${Math.max(0, resolved.radius.lg - 16)}px; }
\`\`\`

\`\`\`css
/* ❌ faint text used for reading */
.caption { color: var(--foreground-tertiary); }

/* ✅ tertiary is for placeholders and watermarks; captions are muted */
.caption { color: var(--muted-foreground); }
\`\`\``
}

/**
 * Code samples — the one thing the system could not do at all until now.
 *
 * The measurements are generated, per DECISIONS #31: a syntax palette's whole
 * claim is that it is readable, and a hand-typed Lc figure about one brand is
 * the defect class every acceptance run keeps finding.
 */
