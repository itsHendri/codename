/**
 * DESIGN_SYSTEM.md — the declarative reference an agent reads before it writes.
 *
 * Written deviation-first. A model arrives with strong priors (shadcn's token
 * names, Tailwind's spacing, `h1`-style type roles); the highest-value content
 * is therefore where THIS system contradicts those priors, not where it agrees.
 * Everything is a copy-pasteable value, and every rule that can be shown wrong
 * as well as right is.
 */

import { apca, CHART_MIN_DELTA_E, COLLISION_DELTA_E, composite, deltaE, LC_THRESHOLD, SYNTAX_MIN_DELTA_E } from "../engine/contrast"
import { spaceName } from "../engine/defaults"
import { SCALE_ROLES, type ResolvedTokens, type SemanticGroup } from "../engine/types"
import { chartPlanFor, scaleInkFor } from "../engine/semantics"
import { primaryFamily } from "./css"

/** shadcn's vocabulary, which is what a model reaches for unprompted. */
const SHADCN_NAMES = [
    "background",
    "foreground",
    "card",
    "card-foreground",
    "popover",
    "popover-foreground",
    "primary",
    "primary-foreground",
    "secondary",
    "secondary-foreground",
    "muted",
    "muted-foreground",
    "accent",
    "accent-foreground",
    "destructive",
    "destructive-foreground",
    "border",
    "input",
    "ring",
]

const GROUP_TITLES: Record<SemanticGroup, string> = {
    surface: "Surfaces",
    text: "Text",
    link: "Links",
    state: "Interactive states",
    border: "Borders and focus",
    brand: "Brand",
    status: "Status",
    inverse: "Inverse regions",
    code: "Code and syntax",
    chart: "Chart series",
    scale: "Sequential scale",
}

const GROUP_ORDER: SemanticGroup[] = ["surface", "text", "link", "state", "border", "brand", "status", "inverse", "code", "chart", "scale"]

function table(headers: string[], rows: string[][]): string {
    const head = `| ${headers.join(" | ")} |`
    const rule = `| ${headers.map(() => "---").join(" | ")} |`
    const body = rows.map((row) => `| ${row.join(" | ")} |`).join("\n")
    return [head, rule, body].join("\n")
}

/**
 * Where this system contradicts a default assumption — and *only* the parts that
 * need the brand to be known.
 *
 * This list used to restate seven of `SKILL.md`'s hard rules verbatim, values
 * and all. That is not free: `SKILL.md` always loads and this file is read after
 * it, so the second copy taught an agent nothing it had not already been told,
 * and it was seven more places for a rule to drift out of step with the file
 * that stated it first. Drift between two statements of the same rule is the
 * defect class every acceptance run finds; see DECISIONS #30.
 *
 * What stays: the shadcn name mapping (computed from which names this brand
 * actually lacks), the on-brand trap (placed here deliberately after an earlier
 * run, and pinned by a test), the label-polarity note (only claimed in the modes
 * where it is true), and the brand's own hand-written deviations. Everything
 * else is a rule, and rules live in SKILL.md.
 */
function deviations(resolved: ResolvedTokens): string[] {
    const { config } = resolved
    const names = new Set(resolved.semantics.map((token) => token.name))
    const out: string[] = []

    const missing = SHADCN_NAMES.filter((name) => !names.has(name))
    if (missing.length > 0) {
        const replacements: Record<string, string> = {
            card: "surface",
            "card-foreground": "foreground",
            popover: "surface-raised",
            "popover-foreground": "foreground",
            accent: "state-hover",
            "accent-foreground": "foreground",
            destructive: "danger",
            "destructive-foreground": "danger-foreground",
        }
        const mapped = missing
            .map((name) => (replacements[name] ? `\`${name}\` → \`${replacements[name]}\`` : `\`${name}\``))
            .join(", ")
        out.push(
            `**This is not shadcn's token set.** These common names do not exist here: ${mapped}. Using one produces an unstyled element, silently.`,
        )
    }



    out.push(
        `**On a coloured fill, the neutral text tokens are wrong.** Inside a \`--primary\` band or a solid status banner, text and controls take that fill's own \`-foreground\` — for text *and* border. \`--foreground\` is dark ink and is unreadable there. Full-bleed call-to-action sections are where this bites.`,
    )






    const onFills = resolved.semantics.filter(
        (token) => token.name.endsWith("-foreground") && token.light.scale === "neutral",
    )
    if (onFills.length > 0) {
        // Only claim the polarity actually splits in a mode where it does.
        const split = (["light", "dark"] as const).filter((mode) => {
            const lightnesses = onFills.map((token) => token.values[mode]!.oklch.l)
            return Math.max(...lightnesses) - Math.min(...lightnesses) > 0.3
        })
        const where =
            split.length === 2
                ? "in both modes"
                : split.length === 1
                  ? `in ${split[0]} mode (they are all the same colour in ${split[0] === "dark" ? "light" : "dark"})`
                  : "should a fill ever need it"
        out.push(
            `**Labels on solid fills come from the neutral ramp**, not from the fill's own scale, and their polarity is chosen by measuring contrast against each fill. That means they do not all match — ${where}. \`--warning-foreground\` can be dark while \`--primary-foreground\` is light. Do not "correct" this to a single colour.`,
        )
    }

    return [...out, ...config.meta.deviations.map((note) => `${note}`)]
}

/**
 * A hex is a lie for a translucent token: `--scrim` resolves to a colour at 60%
 * and printing `#1f262d` invites somebody to build an opaque backdrop out of it.
 * Alpha tokens therefore print what actually ships.
 */
function cellValue(token: ResolvedTokens["semantics"][number], mode: "light" | "dark"): string {
    const { alpha } = token[mode]
    if (alpha === undefined) return `\`${token.values[mode]!.hex}\``
    return `\`${token.values[mode]!.hex}\` at ${Math.round(alpha * 100)}%`
}

function tokenTable(resolved: ResolvedTokens, group: SemanticGroup): string {
    const rows = resolved.semantics
        .filter((token) => token.group === group)
        .map((token) => [
            `\`--${token.name}\``,
            cellValue(token, "light"),
            cellValue(token, "dark"),
            token.description,
        ])
    return table(["Token", "Light", "Dark", "Use it for"], rows)
}

/**
 * The six solid role fills and their labels, measured, worst first — so the docs
 * cite the real floor instead of whichever pair somebody happened to measure.
 *
 * Restricted to the role fills on purpose: `--muted`, `--inverse` and the
 * `-subtle` washes all have a `-foreground` too, and sweeping them in produced a
 * fourteen-item list in which the genuine label floor was buried.
 */
function labelPairsFor(resolved: ResolvedTokens): Array<{ role: string; lc: number }> {
    const by = new Map(resolved.semantics.map((token) => [token.name, token]))
    return SCALE_ROLES.filter((role) => role !== "neutral")
        .flatMap((role) => {
            const fill = by.get(role)
            const label = by.get(`${role}-foreground`)
            if (!fill || !label) return []
            return [{ role, lc: Math.abs(apca(label.values.light!.hex, fill.values.light!.hex)) }]
        })
        .sort((a, b) => a.lc - b.lc)
}

function componentRecipes(resolved: ResolvedTokens): string {
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

function wrongRight(resolved: ResolvedTokens): string {
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
function codeSection(resolved: ResolvedTokens): string {
    const by = new Map(resolved.semantics.map((token) => [token.name, token]))
    const sunken = by.get("surface-sunken")
    const syntax = resolved.semantics.filter((token) => token.group === "code")

    const measured = (mode: "light" | "dark"): string => {
        if (!sunken) return ""
        const ground = sunken.values[mode]!.hex
        return [...syntax, by.get("foreground")!]
            .map(
                (token) =>
                    `\`--${token.name}\` Lc ${Math.abs(apca(token.values[mode]!.hex, ground)).toFixed(0)}`,
            )
            .join(", ")
    }

    return `A code block is **\`--surface-sunken\`**, not \`--muted\`. That is not a style preference:
\`--muted\` is a mid-grey wash, and on it the body bar admits exactly one step of each ramp, so every
syntax colour collapses onto the same near-black (or near-white) value and the block comes out
monochrome. A well is also what every real code block does — it moves *away* from the page rather
than toward the middle of the ramp.

\`\`\`css
pre {
    background: var(--surface-sunken);
    border: 1px solid var(--border);   /* required: in dark mode sunken IS the page colour */
    border-radius: var(--radius-md);
    padding: var(--space-4);
    overflow-x: auto;                  /* with tabindex="0", so it scrolls by keyboard */
    color: var(--foreground);          /* identifiers, punctuation, plain text */
}
pre:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }

/* ✅ if you wrap the block to hang a copy button on it, the wrapper clips —
   so the ring has to be drawn INSIDE, or it is invisible and nothing errors */
.code-frame { position: relative; overflow: hidden; border-radius: var(--radius-md); }
.code-frame pre:focus-visible { outline-offset: -2px; }
\`\`\`

**That clipping case is the one to remember.** \`outline-offset: 2px\` draws the ring *outside* the
element, and any ancestor with \`overflow: hidden\` — which is what a rounded frame around a toolbar
needs — cuts it off entirely. The block is still focusable, because this recipe gives it
\`tabindex="0"\`, so the result is a keyboard-only, focus-only, silent failure. A negative offset
puts the ring inside the block where nothing can clip it.

${table(
        ["Token", "What it colours"],
        syntax.map((token) => [`\`--${token.name}\``, token.description.split(".")[0] + "."]),
    )}

**There is no token for identifiers, variables or punctuation** — they take \`--foreground\`, which
is measured on this surface like everything else. Colouring a fifth thing does not make a block
easier to scan; it makes it harder.

Every one of these clears the **Lc ${LC_THRESHOLD.body} body bar** on \`--surface-sunken\`. Measured on this brand —
light: ${measured("light")}. Dark: ${measured("dark")}.

The consequence is worth expecting rather than being surprised by: at that bar a **light-mode syntax
palette is dark and a dark-mode one is pale**, because the only steps of a ramp that clear the bar
on a light ground are its darkest, and on a dark ground its lightest. That is what a code sample
somebody actually reads costs. The exact colours are in the token table above; do not substitute
brighter ones from another theme.

**\`--code-comment\` is the one exception, and it is held to the Lc ${LC_THRESHOLD.large} large-text
bar instead.** Two reasons, and the second is the load-bearing one. A comment is an aside, and one
that reads as loudly as the code stops the code being scannable. And every ramp in this system shares
its lightness targets across hues, so a comment held to the same threshold as the keywords lands on
the *same step* as them — identical lightness, separated by chroma alone, which on a dark ramp comes
to almost nothing. One step of recession is what makes a comment a different colour at all.

**Legible is not the same as distinguishable, and both are measured.** Contrast asks whether you can
read a colour against its ground; it says nothing about whether two colours are different from each
other. This palette is therefore also audited pairwise in OKLab, at a floor of ΔE
${SYNTAX_MIN_DELTA_E}, and any pair under it is listed in the Contrast section below rather than
left for you to discover. ${(() => {
        const flagged = resolved.warnings.filter((w) => w.kind === "distinctness")
        if (flagged.length === 0) {
            return "Every pair on this brand clears it."
        }
        return `**${flagged.length} pair${flagged.length === 1 ? " does" : "s do"} not clear it on this brand.** Where two code colours are flagged, do not rely on the difference between them — a reader will not see it, and no arrangement of these seeds fixes it.`
    })()}

**A diff.** The text colours are \`--code-added\` and \`--code-removed\`; the line tints are
\`--success-subtle\` and \`--danger-subtle\`, which are fills and are measured as fills. Do not use
\`--success\` or \`--danger\` for either job — those are solid fills and are not validated as text on
a page.

\`\`\`css
.diff-line.added   { background: var(--success-subtle); color: var(--code-added); }
.diff-line.removed { background: var(--danger-subtle);  color: var(--code-removed); }
\`\`\`

**You may keep syntax highlighting inside a tinted line.** The whole palette is validated against
both diff tints as well as against \`--surface-sunken\`, so a keyword on an added line is a checked
combination rather than one you are composing at your own risk.

**A fenced block may break out of the reading measure, and should.** \`--container-prose\` is sized
for running text and truncates an ordinary function signature. A code block inside a prose column
takes \`--container-intro\` (${
        resolved.config.layout.containers.find((c) => c.name === "intro")?.maxRem ?? 52
    }rem) — that is the width between the reading measure and the page frame, and it is what the token
is for even though its note talks about large type. Wider than that and the block stops belonging to
the paragraph above it. It still gets \`overflow-x: auto\`, because a code sample will always find a
line you did not plan for.

**Inline \`code\` is different from a block** and keeps \`--muted\`: it sits inside a sentence, so it
needs to read as a change of texture rather than as a hole in the paragraph. Size it relatively
(\`0.9em\`) rather than with \`--text-code\`, because a fixed ${
        resolved.config.typography.roles.find((role) => role.role === "code")?.sizeRem ?? 0.875
    }rem next to \`--text-body\` sits visibly small mid-sentence. Inline code is not syntax-highlighted
— it takes \`--foreground\`.`
}

/**
 * Chart series — and the ceiling, which is the part worth reading.
 *
 * The count is generated, so a brand with better-spread seeds gets more series
 * and this section says a different number without anybody editing it.
 */
function chartSection(resolved: ResolvedTokens): string {
    const chart = resolved.semantics.filter((token) => token.group === "chart")
    const series = chart.filter((token) => token.light.alpha === undefined)
    const bands = chart.filter((token) => token.light.alpha !== undefined)
    if (series.length === 0) return "This brand's seeds produce no usable chart series."
    const by = new Map(resolved.semantics.map((token) => [token.name, token]))
    const scaleStops = resolved.semantics.filter((token) => token.group === "scale")
    const SCALE_COUNT = scaleStops.length
    const scaleInkLight = scaleInkFor(resolved, "light")
    const scaleInkDark = scaleInkFor(resolved, "dark")
    /** Two bands over the same ground, composited — what a reader actually sees. */
    const bandGap = (mode: "light" | "dark") => {
        const ground = by.get("surface")!.values[mode]!.hex
        let worst = Infinity
        for (let i = 0; i < bands.length; i++) {
            for (let j = i + 1; j < bands.length; j++) {
                worst = Math.min(
                    worst,
                    deltaE(
                        composite(bands[i]!.values[mode]!.hex, bands[i]![mode].alpha!, ground),
                        composite(bands[j]!.values[mode]!.hex, bands[j]![mode].alpha!, ground),
                    ),
                )
            }
        }
        return worst
    }
    const ground = (mode: "light" | "dark") => by.get("surface")!.values[mode]!.hex
    const measured = (mode: "light" | "dark") =>
        series
            .map((token) => `\`--${token.name}\` Lc ${Math.abs(apca(token.values[mode]!.hex, ground(mode))).toFixed(0)}`)
            .join(", ")
    const greyscale = (mode: "light" | "dark") => {
        let worst = Infinity
        for (let i = 0; i < series.length; i++) {
            for (let j = i + 1; j < series.length; j++) {
                worst = Math.min(
                    worst,
                    Math.abs(series[i]!.values[mode]!.oklch.l - series[j]!.values[mode]!.oklch.l) * 100,
                )
            }
        }
        return worst.toFixed(1)
    }
    const GREYSCALE_LIGHT = `ΔE ${greyscale("light")}`
    const GREYSCALE_DARK = `ΔE ${greyscale("dark")}`

    /**
     * The candidate that stopped the run, measured per mode — because it does not
     * necessarily fail in both, and saying "it lands within the floor" full stop
     * was wrong in light mode on this very brand.
     */
    const REJECTED = (() => {
        // Read from the same plan that produced the tokens, so it names the ramp
        // the ordering actually rejected rather than the first one not used.
        const { rejected } = chartPlanFor(resolved.config.color.scales)
        if (!rejected) return "Every ramp is already in the chart."
        const { light, dark } = rejected.gap
        const both = light < CHART_MIN_DELTA_E && dark < CHART_MIN_DELTA_E
        return `A ${series.length + 1}th series would come from the \`${rejected.role}\` ramp, and it measures ΔE ${light.toFixed(
            1,
        )} against its nearest neighbour in light and ${dark.toFixed(1)} in dark, against a floor of ${CHART_MIN_DELTA_E} — ${
            both
                ? "under it in both modes"
                : `so it ${light >= CHART_MIN_DELTA_E ? "clears the floor in light and misses it in dark" : "clears the floor in dark and misses it in light"}, and a series has to work in both`
        }.`
    })()

    const closest = (mode: "light" | "dark") => {
        let worst = Infinity
        for (let i = 0; i < series.length; i++) {
            for (let j = i + 1; j < series.length; j++) {
                worst = Math.min(worst, deltaE(series[i]!.values[mode]!.hex, series[j]!.values[mode]!.hex))
            }
        }
        return worst
    }

    return `**This system defines ${series.length} chart series and that is a measured ceiling, not a
round number.** \`--chart-1\` … \`--chart-${series.length}\`, used **in order** — a two-series
chart takes \`chart-1\` and \`chart-2\`, never \`chart-1\` and \`chart-3\`, because the ordering
is what guarantees the separation.

${table(
        ["Token", "Light", "Dark", "Band (light / dark)", "From"],
        series.map((token, index) => {
            const band = bands[index]
            return [
                `\`--${token.name}\``,
                `\`${token.values.light!.hex}\``,
                `\`${token.values.dark!.hex}\``,
                band
                    ? `\`--${band.name}\` at ${Math.round(band.light.alpha! * 100)}% / ${Math.round(band.dark.alpha! * 100)}%`
                    : "—",
                `the \`${token.light.scale}\` ramp`,
            ]
        }),
    )}

**A series has no status meaning**, whatever colour it happens to be: do not reorder the series so
that a "bad" metric comes out red. If a chart genuinely encodes good and bad, say so with a label —
colour is doing category work here and cannot do both. **Numbering restarts per chart**: four
sparklines are four charts, each starting at \`--chart-1\`, not one running sequence across a page.

**A series swatch needs a hairline.** \`--border\` at 1px around any legend key, tooltip swatch or
dot. This is not decoration: the series colours are measured against \`--surface\` and the page, and
both grounds the docs offer for a tooltip fail somewhere. Measured on this brand — on \`--inverse\`
(the one-line tooltip) the three series are Lc ${series
        .map((t) => Math.abs(apca(t.values.light!.hex, by.get("inverse")!.values.light!.hex)).toFixed(0))
        .join("/")} in light, and on \`--surface-overlay\` (the popover) Lc ${series
        .map((t) =>
            Math.abs(apca(t.values.dark!.hex, by.get("surface-overlay")!.values.dark!.hex)).toFixed(0),
        )
        .join("/")} in dark, against a boundary bar of ${LC_THRESHOLD["non-text"]}. The border is
what makes a swatch legible on a ground the series colour cannot carry alone.

Two measurements, both generated. Against \`--surface\`: ${measured("light")} in light, and
${measured("dark")} in dark, against a visible-boundary bar of ${LC_THRESHOLD["non-text"]}. And
against **each other**, which is the harder constraint: the closest pair is ΔE
${closest("light").toFixed(0)} in light and ${closest("dark").toFixed(0)} in dark, against a floor of
${CHART_MIN_DELTA_E}. That floor is higher than the one the syntax palette uses, because matching a
line to a legend swatch several inches away is a harder task than telling one word from the next.

**Colour is the only encoding a chart has, so it must not be the only one you use.** Every series
sits at the same step of its ramp — that is what keeps one line from reading as more important than
another — and the consequence is that they are the same *lightness*. Reduced to greyscale — OKLab lightness alone, chroma zeroed — they are
${GREYSCALE_LIGHT} apart in light and ${GREYSCALE_DARK} in dark, against a floor of
${CHART_MIN_DELTA_E}: **there is no greyscale channel here at all**, and red-green pairs collapse for
the commonest colour vision deficiency for the same reason. This system enforces "colour is never the
only marker" for links, badges and selected rows; a chart is the place it matters most.

**So every series carries a second encoding, always.** A dash pattern on the line
(\`stroke-dasharray\`), a marker shape at each point, a hatch on a filled area or segment, or direct
labelling at the end of the line. Name it in the legend key alongside the swatch, not just the
colour. One series needs nothing; two or more need this.

**Why there are only ${series.length}.** This brand's six chromatic ramps are not six
distinguishable hues. ${REJECTED} So it is not emitted at all rather than emitted with a warning: a
token that exists is a token somebody uses. **For a ${series.length + 1}th category, change the
encoding rather than adding a colour** — small multiples instead of one busy chart, or direct
labelling. For a *stacked* bar or a donut, where a dashed line means nothing, the answer is a hatch
or a texture on the segment: pick an angle and a period, use the series colour for the hatch on its
own fill so the category still reads, and state what you chose. At that density those are better
than a fourth hue anyway.

\`\`\`css
/* ✅ SVG paints with \`fill\` and \`stroke\`, never with \`color\` */
.series-1 { fill: none; stroke: var(--chart-1); stroke-width: 2; }
.series-1-dot { fill: var(--chart-1); }
.axis-label, .tick-label { fill: var(--muted-foreground); }   /* SVG text takes \`fill\` */
.grid-line { stroke: var(--border-subtle); }   /* inside the plot's own frame */
.axis-line { stroke: var(--border); }          /* the frame itself */

/* ❌ silent, and the worst kind: an SVG shape's initial \`fill\` is BLACK and its
   initial \`stroke\` is \`none\`, so this is a solid black blob with no line —
   and black axis labels on a dark card. Nothing errors. */
.series-1 { color: var(--chart-1); }
\`\`\`

Setting \`color\` alone only works where you have also written
\`fill="currentColor"\` or \`stroke="currentColor"\` on the element, which is a
reasonable pattern — but then the token is on the wrapper and the \`currentColor\` is
load-bearing, so write both or neither.

### Areas, and what a band is not

\`--chart-N-subtle\` is the band under series N — an area chart's fill, a range band, a highlighted
region behind a line. Translucent, so overlapping bands compose instead of hiding each other and so
it reads on whichever surface the plot sits on. Every series shares one strength: three different
alphas would make one band look like more data than another.

**A band does not identify a series — the line above it does.** Composited over \`--surface\`, two
bands sit ΔE ${bandGap("light").toFixed(1)} apart in light and ${bandGap("dark").toFixed(
        1,
    )} in dark, against the ΔE ${CHART_MIN_DELTA_E} the solid series clear. That is arithmetic, not a
defect: a wash at ${Math.round((bands[0]?.light.alpha ?? 0.12) * 100)}% is a shrunk version of the
distance between its parents. So **always draw the line**, in the solid token with its dash pattern,
and never ship an area chart whose bands are the only encoding.

\`\`\`css
.area-1 { fill: var(--chart-1-subtle); }
.area-1-line { fill: none; stroke: var(--chart-1); stroke-width: 2; }
\`\`\`

### The sequential scale

\`--scale-1\` … \`--scale-${SCALE_COUNT}\` encode **magnitude**, not category — a heatmap cell, a
choropleth region, an intensity column. \`--scale-1\` sits nearest the page and
\`--scale-${SCALE_COUNT}\` furthest from it **in both modes**, so "more" always means "further from
the background": darker on a light page, lighter on a dark one. Never use it for categories, and
never use \`--chart-*\` for magnitude — a categorical palette has no order, which is the whole
difference.

${table(
        ["Token", "Light", "Dark", "Can it hold a label?"],
        scaleStops.map((token, index) => [
            `\`--${token.name}\``,
            `\`${token.values.light!.hex}\``,
            `\`${token.values.dark!.hex}\``,
            (() => {
                const light = scaleInkLight[index]
                const dark = scaleInkDark[index]
                if (!light?.ink && !dark?.ink) return "**no** — in either mode"
                if (light?.ink && dark?.ink) {
                    return light.ink === dark.ink
                        ? `yes — \`--${light.ink}\``
                        : `yes — \`--${light.ink}\` light, \`--${dark.ink}\` dark`
                }
                const only = light?.ink ? "light" : "dark"
                const ink = light?.ink ?? dark?.ink
                return `**${only} only** — \`--${ink}\``
            })(),
        ]),
    )}

**The middle of a sequential scale cannot carry text, and that is arithmetic rather than a fault in
this palette.** A mid-lightness fill has no near-black or near-white ink that clears the label bar —
the same physics that makes a mid-lightness amber unable to hold a button label. Every evenly-spaced
five-stop scale crosses that band. So: **tint the cell and put the number beside it, above it, or in
a tooltip.** A heatmap without numbers in its cells is a normal heatmap; one with unreadable numbers
in half its cells is a broken one.

**Give the cells a border or a gap.** \`--scale-1\` is deliberately close to the page — that is what
"least" looks like — so a low cell and an empty cell are the same colour without one.
\`1px solid var(--border-subtle)\`, or a 2px gap showing the surface through.

### Plot geometry

Not tokens — there is no \`--chart-stroke\` — but stated once so two charts in the same product
match, which is the whole reason \`--shell-*\` exists:

- **Line stroke 2px**, and the dash patterns \`7 4\` (dashed) and \`2 4\` (dotted) for series 2 and
  3. A 1px line disappears against a grid line; 3px starts hiding the data at a crossing.
- **Dot radius 4px** at a series' last point or at a hovered point, with a 1px \`--border\` hairline
  so it survives on the tooltip grounds above. Not on every point — a dot per datum is noise past
  about a dozen.
- **Bar gap: 1 part gap to 4 parts bar** within a group, and one full bar width between groups.
- **Axis padding \`var(--space-4)\`** between the plot area and its labels; \`var(--space-6)\`
  between the chart and whatever is under it.
- **A type role does not survive a scaled \`viewBox\`.** SVG text scales with the coordinate system,
  so \`--text-label\` inside a 720-wide \`viewBox\` rendered at 330px is not 13px, it is about 6px.
  Either render the chart at its intrinsic width — give the SVG a \`min-width\` and let a wrapper
  scroll, the same pattern the Table recipe uses — or put the labels in HTML beside the SVG rather
  than inside it. Do not compensate by picking a bigger number: that is the arbitrary size the type
  rules exist to prevent.
- **A hatch, for the shapes a dash cannot help.** A donut slice and a stacked segment have no line to
  dash, so the second encoding is a pattern fill: **45°, 8px period, 3px stroke, drawn in the series'
  own solid token over its own \`-subtle\` band.** Drawing it in a neutral would make the segment a
  different category; drawing it in the series colour keeps the category and adds the texture.

**What this does not give you**, and each of these is a real gap rather than an oversight:

- **A diverging scale.** A red-to-green delta needs two ramps meeting at a neutral midpoint, and this
  system has one sequential scale and a categorical set. Building one from \`--danger\` and
  \`--success\` is the obvious move; measure the midpoint before trusting it.
- **Plot geometry.** Stroke width, dot radius, bar gap, axis padding.
- **A colour for "no data" or "other".** Use \`--muted-foreground\` for the mark and label it; do
  not spend a series colour on the absence of a series.`
}

/**
 * Tokens that currently resolve to the same colour. Silence here is worse than
 * the collision: a distinction the docs promise but the values don't make is
 * unfalsifiable, and picking the wrong token looks correct until the ramp moves.
 */
function collisions(resolved: ResolvedTokens): string {
    const rows: string[] = []
    for (const mode of ["light", "dark"] as const) {
        // Grouped by perceptual distance, not by string equality. Acceptance run
        // 9 found `--secondary-subtle` and `--warning-subtle` one channel value
        // apart — the same colour to any reader, and invisible to a table keyed
        // on the hex. A near-collision is exactly as misleading as an exact one,
        // and the exact ones were the only kind being reported.
        const groups: Array<{
            key: string
            hex: string
            alpha: number | undefined
            names: string[]
            exact: boolean
        }> = []
        for (const token of resolved.semantics) {
            // Alpha is part of the identity, so a translucent token is never
            // reported as "the same colour as" the opaque one it derives from —
            // `--scrim` and `--foreground` share a hex and look nothing alike.
            const { alpha } = token[mode]
            const hex = token.values[mode]!.hex
            const match = groups.find(
                (group) =>
                    group.alpha === alpha && deltaE(group.hex, hex) < COLLISION_DELTA_E,
            )
            if (match) {
                match.names.push(token.name)
                if (match.hex !== hex) match.exact = false
                continue
            }
            groups.push({
                key: alpha === undefined ? hex : `${hex} at ${Math.round(alpha * 100)}%`,
                hex,
                alpha,
                names: [token.name],
                exact: true,
            })
        }
        for (const group of groups) {
            if (group.names.length < 2) continue
            rows.push(
                `| ${mode} | \`${group.key}\` | ${group.exact ? "identical" : "indistinguishable"} | ${group.names.map((name) => `\`--${name}\``).join(", ")} |`,
            )
        }
    }
    if (rows.length === 0) return "Every semantic token currently resolves to a distinct colour."
    return `These tokens share a value right now. They are still separate tokens with separate jobs —
use the one that describes your intent, because the values diverge the moment the ramp is re-tuned.

| Mode | Value | How close | Tokens |
| --- | --- | --- | --- |
${rows.join("\n")}

**"Indistinguishable" is not a rounding note.** Those rows differ by less than ΔE ${COLLISION_DELTA_E}
in OKLab, which no reader will see. Treat them exactly as you would treat identical ones.`
}

/**
 * What this system does NOT define. Say it, or every implementer invents it
 * silently.
 *
 * A function rather than a constant since acceptance run 8: the one sentence in
 * this list that admitted a gap and told the reader to verify was itself a
 * hand-written measurement, and wrong in light mode. DECISIONS #31 applies here
 * as much as anywhere — more, because this is the section a reader trusts.
 */
function notDefined(resolved: ResolvedTokens): string {
    const measure = (a: string, b: string, mode: "light" | "dark") =>
        Math.abs(
            apca(
                resolved.semantics.find((t) => t.name === a)?.values[mode]!.hex ?? "#000000",
                resolved.semantics.find((t) => t.name === b)?.values[mode]!.hex ?? "#ffffff",
            ),
        ).toFixed(0)
    const LIGHT_PRIMARY_ON_SURFACE = measure("primary", "surface", "light")
    const DARK_PRIMARY_ON_SURFACE = measure("primary", "surface", "dark")

    return `The system stops here on purpose. These have **no tokens**, so if you need one,
pick a value, keep it consistent within the file you're writing, and flag it — do not present it as
part of the system:

- **Icon box size.** The icon *stroke* is specified (see the craft rules); the box is not. The
  stroke rule also covers weight 400 and 600 only, and every button uses \`label\` at weight 500.
- **The inside of the app frame.** \`--shell-*\` gives the sidebar, header, aside and table
  minimum; \`--z-*\` gives the stacking order. What they do *not* give is the furniture's own
  padding: nav item height, sidebar inset, table cell padding, dialog width. Those are still yours.
- **Emphasis on a card.** No token or recipe for marking one of several cards as recommended or
  selected. \`--primary\` as a border is the obvious move; measured on this brand it is Lc
  ${LIGHT_PRIMARY_ON_SURFACE} against \`--surface\` in light and Lc ${DARK_PRIMARY_ON_SURFACE} in
  dark, against a visible-boundary bar of ${LC_THRESHOLD["non-text"]} — so it works in one mode and
  is marginal in the other, which is exactly the kind of thing to verify per brand rather than
  inherit. There is still no token and no recipe: colour alone should not be the only marker of a
  recommended plan anyway.
- **A wordmark treatment.** Even with a mark defined, nothing says which type role, weight or
  colour the brand name takes when it is set in type.
- **Font weights as standalone tokens.** Weight arrives with a type role and nothing else.
- **The loading sweep's duration.** The colours exist and the gradient is buildable from them —
  \`--skeleton\` → \`--skeleton-surface\` → \`--skeleton\` as a \`linear-gradient\` at 200%
  width, animated on \`background-position\` (never on \`opacity\`, which throws away the contrast
  the audit measured). What is missing is the duration: the slowest token is \`--duration-slow\`,
  which is a UI transition, not a loop. Pick a loop duration — 1.5s is conventional — and say so.
- **Overlay geometry.** Dialog width and radius, tooltip placement and offset, dropdown width — all
  yours. The tokens say what colour and which layer, never how big or where.
- **Which narrow-screen pattern the sidebar uses.** The widths are defined and the breakpoints are
  defined; whether the sidebar collapses to the icon rail or slides in as a drawer is not, and the
  two need different z-layers and different dismiss behaviour.
- **Neither opacity token has a documented consumer.** \`--opacity-disabled\` sounds like it belongs
  on a disabled control and does not: that recipe is a translucent *fill* (\`--state-disabled\`) plus
  \`--foreground-tertiary\`, both already calibrated, and fading them further would undo the
  calibration. \`--opacity-loading\` has the same problem in reverse — skeletons are explicitly
  forbidden from using opacity. Both exist, both are blessed values if you need one for something the
  system does not model (a dimmed backdrop behind a spinner, a ghosted drag preview), and neither is
  guidance. Do not fade text with either.
- **Concentric radius when the parent has no radius.** The formula gives 0 for every child of an
  unrounded padded container — a sidebar, a page shell — which squares every nav item inside one.
  That follows from the rule; whether you want it is a judgement the rule does not make for you.
- **Blur.** Not modelled. (Opacity is — \`--opacity-disabled\` and \`--opacity-loading\` — but only
  those two, and neither is for live text.)
- **Theme persistence.** The attribute is defined; storing the choice, seeding it from the OS
  preference, and avoiding a flash on first paint are all yours.
- **Touch-target switching.** The craft rules ask for 44px on touch, but the breakpoint set is
  width-based and CSS cannot detect touch from it. Pick a rule and state it.`
}

/**
 * The mark and the typeface files. Neither was documented at all, which meant an
 * agent handed the export could not tell that a logo existed.
 */
function assetsSection(resolved: ResolvedTokens): string {
    const { meta, typography } = resolved.config
    const fonts = typography.fontFiles ?? []
    const parts: string[] = []

    if (meta.logoSvg) {
        parts.push(`### Logo

The mark ships as **inline SVG inside \`brand.json\`** rather than as a file, and that is a
functional choice, not a packaging one: inline means a path can be set to \`currentColor\`, so the
mark follows whatever text colour surrounds it and inverts in dark mode without a second asset.

**This mark is two-tone, so "set every fill to \`currentColor\`" is wrong for it.** Count the paths
before you place it. The wordmark path takes \`currentColor\` and follows the surrounding ink. The
accent path carries the brand's accent and is *meant* to stay that colour — flattening it to
\`currentColor\` turns the flourish into an ink blob sitting on the letters, which is a visible defect
rather than a subtle one.

\`\`\`html
<!-- OK: the wordmark follows the ink, the accent stays the brand colour -->
<span style="color: var(--foreground)">
    <svg viewBox="…">
        <path fill="currentColor" d="…"/>
        <path fill="var(--logo-accent, ${resolved.scales.secondary?.steps.light[resolved.scales.secondary.anchorStep]!.hex ?? "#000000"})" d="…"/>
    </svg>
</span>
\`\`\`

**\`--logo-accent\` is the one token in this system that does not re-point in dark mode**, and that
is the whole reason it exists. The obvious spelling reached into the \`--secondary-*\` primitive layer — and the primitive ramps *do*
re-declare under \`[data-theme="dark"]\`, so the mark
rendered as two different oranges in the two modes without anything saying so. A logo does not change
colour with the theme. \`--secondary\` is also the wrong answer: it resolves to a darkened step chosen
to carry a label, not to the drawn colour.

The literal after the comma is a fallback for contexts where \`tokens.css\` is not loaded — a
favicon pipeline, a build step that inlines the mark. **It does not save you in email**: Outlook on
Windows renders through the Word engine, which does not understand \`var()\` *at the parser level*,
so the whole declaration is discarded and the fallback with it. There, write the literal and put the
token name in a comment beside it. See "Outside a browser" below. **\`--logo-accent\` is for the mark and nothing else**; it is not
validated against any surface, so if you put it on a coloured field, check it by eye. Do not reach
for it as a UI colour — that is what \`--secondary\` is for.

On a \`--primary\` or otherwise coloured field, set the wrapper's \`color\` to that fill's
\`-foreground\` so the wordmark stays legible. The accent is not in the validated set, and on this
brand it measures **Lc ${(() => {
        const accent = resolved.scales.secondary
        const primary = resolved.semantics.find((t) => t.name === "primary")
        if (!accent || !primary) return "—"
        return Math.abs(
            apca(accent.steps.light[accent.anchorStep]!.hex, primary.values.light!.hex),
        ).toFixed(0)
    })()} against \`--primary\`** in light, under the Lc ${LC_THRESHOLD["non-text"]} boundary bar —
so on a brand field the flourish reads as a shape rather than a separate colour. That is usually
fine for a mark and is worth knowing before you scale it down.`)
    } else if (meta.logoFile) {
        parts.push(`### Logo

The mark is a raster file, \`assets/${meta.logoFile}\`, and ships in the export beside the
stylesheet. It **cannot be recoloured**, so check it against \`--background\` in both modes before
placing it on a dark surface, and never place it on a \`--primary\` field without checking.`)
    } else {
        parts.push(`### Logo

**No mark is defined.** Set the brand name in type rather than inventing a logo, and say that you
did.`)
    }

    if (fonts.length > 0) {
        const families = [...new Set(fonts.map((font) => font.family))]
        parts.push(`### Typefaces

The font files ship in \`assets/\` and \`tokens.css\` already declares them — importing the
stylesheet is all that is required, there is no separate \`<link>\` to add.

${table(
            ["File", "Family", "Weight", "Style"],
            fonts.map((font) => [
                `\`assets/${font.fileName}\``,
                `\`--font-${font.family}\``,
                String(font.weight),
                font.style,
            ]),
        )}

The \`@font-face\` rules are named after the **first family in each stack** — ${families
            .map((family) => `\`${primaryFamily(typography.families[family] ?? "")}\``)
            .join(", ")} — not after the stack itself. If you regenerate those rules by hand, keep
that: a face declared as \`"${primaryFamily(typography.families.sans)}", ui-sans-serif, …\` matches
nothing and loads nothing, silently.

Keep \`assets/\` next to \`tokens.css\`. The \`src\` URLs are relative, so moving one without the
other leaves the page rendering in a fallback stack — which looks like a design decision rather
than a missing file.`)
    } else if ((typography.fontLinks ?? []).length > 0) {
        parts.push(`### Typefaces

No font files ship with this system. The faces are hosted, and \`<head>\` needs:

\`\`\`html
${(typography.fontLinks ?? []).map((href) => `<link rel="stylesheet" href="${href}">`).join("\n")}
\`\`\`

Without them the named families only render where they happen to be installed already, and
everything else falls back to the system stack.`)
    } else {
        parts.push(`### Typefaces

**No font files and no hosted links.** The families named above only render where they are already
installed; everywhere else falls back to the system stack. Either load them yourself or treat the
fallback as the design.`)
    }

    return parts.join("\n\n")
}

function layoutSection(resolved: ResolvedTokens): string {
    const { breakpoints, containers } = resolved.config.layout
    const smallest = breakpoints[0]
    const widest = [...containers].sort((a, b) => b.maxRem - a.maxRem)[0]

    return `The system is **mobile-first**. Base styles are the narrowest case, and every breakpoint is
an upgrade written as \`min-width\`. There are no \`max-width\` breakpoints: a system with both
directions has two sources of truth for the same layout, and they drift.

${table(
        ["Token", "Min width", "What changes here"],
        breakpoints.map((breakpoint) => [
            `\`--breakpoint-${breakpoint.name}\``,
            `${breakpoint.minPx}px`,
            breakpoint.note,
        ]),
    )}

CSS cannot read a custom property inside a media query, so **write the pixel value literally** and
treat the table above as the source of truth for which values are legitimate:

\`\`\`css
/* ✅ a breakpoint from the set */
@media (min-width: ${smallest?.minPx ?? 640}px) { … }

/* ❌ a number nobody agreed to */
@media (min-width: 900px) { … }

/* ❌ var() does not resolve here — the rule is silently ignored */
@media (min-width: var(--breakpoint-${smallest?.name ?? "sm"})) { … }
\`\`\`

If you use Tailwind, these are already its variants (\`md:\`, \`lg:\`) — the \`@theme\` block in
\`tokens.css\` defines them, so no config file is needed.

**Not everything in \`tokens.css\` is in that \`@theme\` block.** The **semantic** colours, radius,
spacing, containers, shadows, easings, fonts, type roles and breakpoints are forwarded and become
utilities. \`--z-*\`, \`--shell-*\`, \`--duration-*\`, \`--opacity-*\` and \`--logo-accent\` are
**not** — Tailwind has no theme namespace that turns the first four into utilities, and
\`--logo-accent\` is deliberately excluded so it cannot be reached for as a UI colour. They stay
plain custom properties. Use them as
\`z-index: var(--z-modal)\`, \`width: var(--shell-sidebar)\` and so on, in a stylesheet or an
arbitrary value like \`w-[var(--shell-sidebar)]\`. Reaching for \`duration-fast\` or \`z-modal\` as a
utility class gets you nothing, silently.

### Containers

Nothing spans the viewport. Every region sits in one of these, centred with \`margin-inline: auto\`.

${table(
        ["Token", "Max width", "Use it for"],
        containers.map((container) => [
            `\`--container-${container.name}\``,
            `${container.maxRem}rem (${container.maxRem * 16}px)`,
            container.note,
        ]),
    )}

**A table does not fit in \`--container-narrow\`.** It is ${
        resolved.config.layout.containers.find((c) => c.name === "narrow")?.maxRem ?? 30
    }rem and \`--shell-table-min\` is ${
        resolved.config.layout.shell.find((d) => d.name === "table-min")?.rem ?? 40
    }rem, so a table placed in the container named for forms is wider than its frame before it has
any content in it. Put a table in \`page\` or \`wide\`; \`narrow\` is for one column of controls,
which is what its note says and what its width is for.

**\`--container-prose\` is the one that gets skipped.** Running text set to the full width of a
laptop is unreadable regardless of how good the type is, so body copy takes \`prose\` even when it
sits inside a wider \`page\` frame. Nesting the two is normal:

\`\`\`css
.page { max-width: var(--container-page); margin-inline: auto; padding-inline: var(--space-6); }
.page > p { max-width: var(--container-prose); }
\`\`\`

Note that \`--container-${widest?.name ?? "wide"}\` (${widest?.maxRem ?? 90}rem) is wider than the
\`xl\` breakpoint, so it only has an effect on genuinely large displays.`
}

export function toDesignSystemMd(resolved: ResolvedTokens): string {
    const { config } = resolved
    const { meta } = config

    /**
     * The fills that differ from their own ground by hue alone — generated,
     * because "Lc 0.0" was typed in from one acceptance run's measurement and is
     * a claim about one palette. DECISIONS #31 applies to a sentence defending a
     * rule as much as to one quoting a token.
     */
    const byName = new Map(resolved.semantics.map((token) => [token.name, token]))
    const hueOnly = ([fill, ground]: [string, string]): string | undefined => {
        const token = byName.get(fill)
        const groundToken = byName.get(ground)
        if (!token || !groundToken) return undefined
        const groundHex = groundToken.values.dark!.hex
        const { alpha } = token.dark
        const hex =
            alpha === undefined
                ? token.values.dark!.hex
                : composite(token.values.dark!.hex, alpha, groundHex)
        return `\`--${fill}\` on \`--${ground}\` is Lc ${Math.abs(apca(hex, groundHex)).toFixed(1)}`
    }
    const HUE_ONLY = (
        [
            ["state-selected", "surface"],
            ["primary-subtle", "surface"],
            ["success-subtle", "surface-sunken"],
        ] as Array<[string, string]>
    )
        .map(hueOnly)
        .filter(Boolean)
        .join(", ")

    // Name the companion properties, not just their values: an agent that can't
    // see the token name will invent a number for line-height.
    const typeRows = config.typography.roles.map((role) => [
        `\`--text-${role.role}\``,
        // The family is part of applying a role, not a separate lookup. Omitting
        // this column is how a display face ends up rendered in the body font.
        `\`--font-${role.family}\``,
        role.minSizeRem === undefined
            ? `${role.sizeRem}rem`
            : `**fluid** ${role.minSizeRem}–${role.sizeRem}rem`,
        `\`--text-${role.role}--line-height\` · ${role.lineHeight}`,
        `\`--text-${role.role}--font-weight\` · ${role.weight}`,
        `\`--text-${role.role}--letter-spacing\` · ${role.tracking ?? "normal"}`,
    ])

    const motionRows = [
        ...Object.entries(config.motion.durations).map(([name, ms]) => [
            `\`--duration-${name}\``,
            `${ms}ms`,
        ]),
        ...Object.entries(config.motion.easings).map(([name, curve]) => [
            `\`--ease-${name}\``,
            `\`${curve}\``,
        ]),
    ]

    return `# ${meta.name} — design system

${meta.domain ? `For ${meta.domain}. ` : ""}Generated by Brand Forge from \`brands/${meta.slug}.json\`.
Do not edit this file by hand — edit the brand and re-export.
${meta.voice.length > 0 ? `\nThe voice is ${meta.voice.join(", ")}. Let that show in copy and restraint, not in decoration.\n` : ""}
## 🚨 Read this first — where this system contradicts the defaults

${deviations(resolved)
    .map((note) => `- ${note}`)
    .join("\n")}

## How the layers work

Two layers, and only one of them is yours to use.

**Primitives** — \`--primary-50\` … \`--primary-950\` across ${Object.keys(resolved.scales).length} ramps
(${Object.values(resolved.scales)
        .map((scale) => `\`${scale.role}\``)
        .join(", ")}), 11 steps each, generated in OKLCH. They exist so a human can tune colour.
**Do not reference them in code.**

**Semantics** — the ${resolved.semantics.length} tokens below. Every one aliases a primitive, and
re-points itself in dark mode. This is the whole API.

${GROUP_ORDER.map((group) => `### ${GROUP_TITLES[group]}\n\n${tokenTable(resolved, group)}`).join("\n\n")}

## Type

${table(["Token", "Family", "Size", "Line height", "Weight", "Tracking"], typeRows)}

Families: \`--font-sans\` is \`${config.typography.families.sans}\`, \`--font-mono\` is
\`${config.typography.families.mono}\`${
        config.typography.families.display
            ? `, and \`--font-display\` is \`${config.typography.families.display}\``
            : ""
    }.

${
        config.typography.families.display
            ? `**\`--font-display\` is a different typeface, not a bigger weight of the body font.** It is
drawn for size and belongs on the \`display\` role only. Do not set it on headings, buttons or body
copy${
                  (config.typography.fontFiles ?? []).some((file) => file.family === "display")
                      ? `, and note it ships in only ${[
                            ...new Set(
                                (config.typography.fontFiles ?? [])
                                    .filter((file) => file.family === "display")
                                    .map((file) => file.weight),
                            ),
                        ].join(", ")} — asking for a weight it doesn't have gets you a browser-synthesised fake bold, which looks wrong in a way people notice without being able to name`
                      : ""
              }.\n`
            : ""
    }${
        config.typography.roles.some((role) => role.minSizeRem !== undefined)
            ? `### Fluid roles

${config.typography.roles
                  .filter((role) => role.minSizeRem !== undefined)
                  .map(
                      (role) =>
                          `\`--text-${role.role}\` scales from **${role.minSizeRem}rem** to **${role.sizeRem}rem**`,
                  )
                  .join(", and ")} across the viewport range
${config.typography.fluidRange?.minPx ?? 390}px – ${config.typography.fluidRange?.maxPx ?? 1280}px.
Below and above that span they hold at the ends.

They emit a \`clamp()\`, so **there is nothing to do** — no media queries, no overrides. What you
must not do is replace one with a fixed size:

\`\`\`css
/* ✅ */
h1 { font-size: var(--text-display); }

/* ❌ pins the fluid role to its desktop size — a 56px heading on a phone */
h1 { font-size: 3.5rem; }
@media (min-width: 768px) { h1 { font-size: var(--text-display); } }
\`\`\`

The middle term of each \`clamp()\` deliberately mixes \`rem\` with \`vw\` rather than being pure
\`vw\`. Viewport units ignore the reader's font-size preference, so a \`vw\`-only heading refuses to
grow when someone zooms — a failure that is invisible on every device you own and obvious to
somebody who needs it.\n`
            : ""
    }

${
        config.typography.fontLinks && config.typography.fontLinks.length > 0
            ? `**The faces have to be loaded or the stack silently falls back to system fonts.** Put this in \`<head>\`:\n\n\`\`\`html\n${config.typography.fontLinks.map((href) => `<link rel="stylesheet" href="${href}">`).join("\n")}\n\`\`\``
            : `**No webfont source is declared**, so the named families only render where they are already installed. Everything else falls back to the system stack. Load them yourself, or say so.`
    }

## Brand assets

${assetsSection(resolved)}

## Layout — breakpoints and containers

${layoutSection(resolved)}

## Space, radius, elevation

Spacing runs on a ${config.spacing.basePx}px grid, blessed subset only:
${config.spacing.blessed.map((px) => `\`--space-${spaceName(px, config.spacing.basePx)}\` (${px}px)`).join(", ")}.

Radius derives from a single ${config.radius.basePx}px base:
${Object.entries(resolved.radius)
        .map(([step, px]) => `\`--radius-${step}\` ${step === "full" ? "9999px" : `${px}px`}`)
        .join(", ")}.

**Concentric radius.** \`inner = outer − padding\`, floored at 0.
A card at \`--radius-lg\` (${resolved.radius.lg}px) with \`--space-4\` (16px) padding holds children at ${Math.max(0, resolved.radius.lg - 16)}px.

**A row of siblings is one flush block, not three separate cases.** Three cards side by side inside
a padded container give a left-flush child, a right-flush child, and a middle one touching neither —
which read as three different radii if you apply the rule per element. They are one row: compute the
formula once for the row and give every child in it the same value. The same holds for a two-up
field pair in a form.

**It governs boxes flush against the parent's inner edge — nothing else.** Flush means touching the
padding on both sides. An element that floats inside the padding with space around it — a badge, an
inline \`<code>\`, a chip, an auto-width button — is not concentric with anything and keeps its own
radius. **A full-width control is flush and does follow the formula**, even though it is a control:
a stretched button at the bottom of a card squares off, the same button sized to its label does not.

Everything full-width inside a padded card *is* flush, and that is most of a form: inputs, banners,
nested panels, tables. Inside this card (\`--radius-lg\` ${resolved.radius.lg}px, \`--space-6\` 24px
padding) the formula gives 0, so **those elements are square**, and the recipes below that specify
\`--radius-md\` for an Input or an Alert describe them standing on the page, not nested in a card.
When the two disagree, concentric wins — it is the more specific statement.

If square-edged fields inside rounded cards is not the look you want, that is a real tension and the
fix is a smaller card radius or a padding change, not an exception. Note the formula can also
produce values off the radius scale (a 15px panel with 8px padding gives 7px); that is expected —
use the computed number, don't snap it.

Elevation is \`--shadow-sm\` | \`--shadow-raised\` | \`--shadow-overlay\`, and the last two are named for the surface they pair with — \`--surface-raised\` and \`--surface-overlay\`. Never mix a surface with another level's shadow. In dark mode
\`--shadow-sm\` becomes a hairline ring and nothing else — but \`--shadow-raised\` and
\`--shadow-overlay\` keep a real drop shadow *and* gain a ring, because at those levels the surface
lift alone is not enough separation. Do not assume "dark mode has no shadows"; check the token.
Use shadow for things that float and \`--border\` for things that divide; never both for the same
job.

## Motion

${table(["Token", "Value"], motionRows)}

Enter with \`--duration-base\` and \`--ease-out\`; leave with \`--duration-fast\`. Exits are always
quicker than entrances. Name the properties you transition — never \`transition: all\`.

## Component recipes

${componentRecipes(resolved)}

## Wrong and right

${wrongRight(resolved)}

## Tokens that currently share a value

${collisions(resolved)}

## What this system does not define

${notDefined(resolved)}

## Editorial — running text, figures and code

The component recipes above are app-shaped: buttons, cards, tables, dialogs. A page that is mostly
*prose* needs different answers.

None of this is new tokens. It is the existing spacing scale and type roles composed for reading.

**Measure.** Running text takes \`--container-prose\`. Large type — a hero headline, a section
intro, a pull quote — takes \`--container-intro\` (${
        resolved.config.layout.containers.find((c) => c.name === "intro")?.maxRem ?? 52
    }rem), which exists because a display headline
wraps to five lines at the reading measure and is unreadable at page width. Both nest inside a
wider frame; neither ever spans the viewport.

**Vertical rhythm.** Space below a heading is always smaller than the space above it, so a heading
belongs to the text it introduces rather than floating between two blocks:

\`\`\`css
p                { margin-block: var(--space-6); }        /* 24px */
h2               { margin-block: var(--space-16) var(--space-4); }  /* 64px above, 16px below */
h3               { margin-block: var(--space-12) var(--space-3); }
figure, pre      { margin-block: var(--space-8); }
blockquote       { margin-block: var(--space-12); }
li               { margin-block: var(--space-2); }
\`\`\`

**Lists.** \`padding-left: var(--space-6)\`. Set the marker in \`--muted-foreground\`, not
\`--foreground-tertiary\` — tertiary is below the reading threshold and a marker is part of the
sentence.

**Blockquote.** A \`3px\` rule in \`--border-strong\` on the leading edge, \`padding-left:
var(--space-6)\`, set at \`body-lg\`. Attribution goes in \`body-sm\` / \`--muted-foreground\`. Do
not italicise the whole quote; long italic runs are slower to read.

**Figures and media.** Caption in \`body-sm\` / \`--muted-foreground\`, \`margin-top:
var(--space-3)\`. A full-width figure sits in \`--container-wide\`; a figure in the text column stays
in \`--container-prose\`.

**Media geometry**, because otherwise every page picks its own:

- **Aspect ratio is one of three.** \`16 / 9\` for anything video-shaped, \`3 / 2\` for photography,
  \`1 / 1\` for avatars, logos and thumbnails. Set \`aspect-ratio\` and \`object-fit: cover\` rather
  than a fixed height, so the box holds its shape at every width. Anything else is a one-off — say so.
- **A figure takes \`--radius-lg\`** when it sits inside the text column, and **no radius at all when
  it is full-bleed** — a rounded corner against the window edge reads as a mistake. Inside a padded
  card the concentric rule wins over both.
- **A caption aligns to the text column, never to the figure.** A full-bleed image with its caption
  centred under it at ${resolved.config.layout.containers.find((c) => c.name === "wide")?.maxRem ?? 90}rem
  is a caption nobody reads at the same measure as the prose around it. Set the caption to
  \`--container-prose\` and left-align it with the body text; only the image escapes the column.

**A placeholder standing in for an image must be \`--muted\`, not \`--surface-sunken\`.** Sunken is
opaque and collapses into \`--background\` in dark mode, so the placeholder disappears and only its
border survives. \`--muted\` is translucent and reads on any surface in both modes. (A code block is
the opposite case: it *is* \`--surface-sunken\`, and it carries a border for exactly this reason.)

**Section breaks.** An \`<hr>\` is \`border: 0\` plus \`border-top: 1px solid var(--border)\` and
\`margin-block: var(--space-16)\` — the same 64px that sits above an \`h2\`, because a rule and a
heading are both saying "new section" and two different gaps for one idea reads as an accident.
Never \`--border-subtle\`: that one is defined as below the visible threshold and is for separating
rows inside an already-bounded area, which is the opposite of dividing two regions.

**In-page anchors under sticky chrome.** A documentation page is mostly \`#anchor\` links, and a
fixed header hides the heading they land on. One rule fixes every anchor on the page:

\`\`\`css
html { scroll-padding-top: calc(var(--shell-header) + var(--space-4)); }
\`\`\`

Use \`scroll-padding-top\` on the scroll container, not \`scroll-margin-top\` on every heading — the
second is the same fix written once per element and drifts the moment somebody adds a heading. If the
page has no fixed header, the rule is harmless.

**Button sizes.** The Button recipe above is the default: 40px, \`label\`. A marketing call to action
at 13px is not a call to action. A large button is 52px tall, \`padding-inline: var(--space-8)\`, set
at \`body-lg\` with the \`label\` weight — same colours, same radius, same states. Those are the two
*designed* sizes; the 44px touch variant of the default is the same button with a bigger hit area,
not a third size.

**The mark has a floor.** Below about 24px of height the accent path stops reading as a flourish and
becomes a smudge against the wordmark. Above that it is fine. If you need the brand smaller than
that, use the wordmark path alone.

**Container gutter.** \`padding-inline: var(--space-6)\`, widening to \`var(--space-8)\` from the
\`md\` breakpoint. A container caps width; it does not give itself breathing room at the edge of a
phone.

**A marketing header uses \`--shell-header\`.** The token is described as app chrome, and the
question of whether a landing page may take it has a definite answer: yes, and it should. One header
height in the system is the point of having the token — a marketing site at 72px next to an app at
${(resolved.config.layout.shell.find((d) => d.name === "header")?.rem ?? 3.5) * 16}px is the drift
the token exists to prevent, and it is visible the moment somebody navigates from one to the other.
A taller marketing header is a deliberate deviation: state it, don't drift into it.

**Footer.** \`--inverse\` is documented as a footer band and four \`inverse-*\` tokens exist for what
goes on it; the layout does not, so here it is.

- **Three or four link columns plus a brand column**, in a \`grid\` with
  \`gap: var(--space-8)\`, collapsing to one column below \`md\` — not two, because a two-column
  footer on a phone puts two link lists at the same eye level with nothing separating them.
- **The brand column is wider**: \`grid-template-columns: 2fr 1fr 1fr 1fr\` at \`lg\` and above. It
  holds the mark, one line of blurb in \`--inverse-muted-foreground\` at \`body-lg\`, and nothing else.
- **A column heading is \`label\` in \`--inverse-foreground\`**, not
  \`--inverse-muted-foreground\`: that one is held to the large-text bar, and \`label\` is neither
  \`body-lg\` nor \`body\` at weight 600. \`--inverse-muted-foreground\` is for the brand
  column's blurb, which *is* set at \`body-lg\`${
        resolved.config.typography.roles.find((r) => r.role === "label")?.transform === "uppercase"
            ? ", uppercase, because this brand's `label` role is"
            : " — the `label` role on this brand is not uppercase, so do not make it so here"
    }.
- **The links under it are \`body-sm\` in \`--link-inverse\`, and are not underlined at rest.** They are a navigation
  list, not links in running text — the underline rule applies to prose. Underline on hover.
- **Fine print — copyright, legal — takes \`--inverse-foreground\`, not
  \`--inverse-muted-foreground\`.** The muted one is held to the large-text bar only, so it cannot
  carry small print. Fine print on an inverse band is not quiet in this system, and that is the
  honest trade rather than an oversight.
- The band is full-bleed; its contents sit in \`--container-page\` with the standard gutter, and it
  gets \`padding-block: var(--space-16)\`. Separate the fine-print row with \`--inverse-border\`.

## Code samples

${codeSection(resolved)}

## Charts and data

${chartSection(resolved)}

## Stacking order

Every layer that can overlap another has a number here. Writing a raw \`z-index\` is how two
components end up fighting and the loser is whoever shipped last.

${table(
        ["Token", "Value", "What lives here"],
        resolved.config.layout.zLayers.map((layer) => [`\`--z-${layer.name}\``, String(layer.value), layer.note]),
    )}

Two of these are load-bearing and easy to get wrong. \`--z-modal\` sits **ten** above \`--z-scrim\`,
not a hundred: a dialog belongs immediately on top of its own backdrop and nothing should ever land
between them. And \`--z-toast\` deliberately outranks \`--z-modal\` — a confirmation that renders
behind the dialog that triggered it is invisible exactly when someone needs it.

## App frame

\`--container-*\` bounds the page. These bound its furniture — the numbers every implementation
otherwise invents, differently, on each screen.

${table(
        ["Token", "Value", "What it is"],
        resolved.config.layout.shell.map((dimension) => [
            `\`--shell-${dimension.name}\``,
            `${dimension.rem}rem (${dimension.rem * 16}px)`,
            dimension.note,
        ]),
    )}

## Outside a browser

Everything above assumes CSS custom properties, \`oklch()\`, \`rgba()\` and a \`data-theme\`
attribute you control. **An HTML email has none of those**, and neither does a favicon pipeline, a
native app, a PDF or a canvas render. The system still applies; the delivery does not.

**Take the literals from \`tokens.json\`, not from these tables.** Its root \`$extensions\` block
carries \`resolved.light\` and \`resolved.dark\`: every semantic token as a hex, and every
translucent one as \`{ hex, alpha, css, composited }\` where \`composited\` is what the wash
actually becomes over each surface it is allowed on, blended source-over in sRGB — which is what a
browser does and the only usable form where \`rgba()\` is not available. Reading it is one lookup;
resolving the aliases yourself is a second implementation of the mapping, and a second implementation
is what this whole system is arranged to avoid.

\`\`\`html
<!-- ✅ the literal, with the token name kept beside it so the intent survives -->
<td style="background:${
        resolved.semantics.find((t) => t.name === "primary")?.values.light!.hex ?? "#000000"
    };color:${
        resolved.semantics.find((t) => t.name === "primary-foreground")?.values.light!.hex ?? "#ffffff"
    }"><!-- --primary / --primary-foreground -->

<!-- ❌ var() with a fallback is a *browser* degradation pattern. Outlook on Windows
     renders through the Word engine, which fails to parse var() at all and drops
     the whole declaration — fallback included. You get no colour. -->
<td style="background:var(--primary, ${
        resolved.semantics.find((t) => t.name === "primary")?.values.light!.hex ?? "#000000"
    })">
\`\`\`

Four more things that change, all of them worth knowing before you start rather than after:

- **Dark mode.** \`tokens.css\` keys dark on \`[data-theme="dark"]\` only, deliberately — a
  \`prefers-color-scheme\` block alongside it would make "dark mode is an attribute" untrue and
  would trap anyone whose OS prefers dark and whose toggle only removes the attribute. In a medium
  where you cannot set the attribute, that leaves you writing a \`prefers-color-scheme\` layer by
  hand from \`resolved.dark\`. That is the one place overriding a colour is not a mistake, and it
  is the *only* one.
- **The mark.** Inline SVG is stripped by most mail clients, so it ships as a \`data:\` URI
  \`<img>\` — and inside one, \`currentColor\` resolves to black rather than the surrounding ink.
  Bake one image per ground you need (foreground and inverse, light and dark), and give it real
  \`alt\` text, because images are blocked by default in most clients and this system defines no
  wordmark-in-type fallback.
- **Fluid type has no \`clamp()\`.** Freeze the role at your fixed width and say which width. At
  600px, \`--text-display\` is ${(() => {
      const role = resolved.config.typography.roles.find((r) => r.role === "display")
      if (!role?.minSizeRem) return "—"
      const range = resolved.config.typography.fluidRange ?? { minPx: 390, maxPx: 1280 }
      const slope = (role.sizeRem - role.minSizeRem) / (range.maxPx / 16 - range.minPx / 16)
      const intercept = role.minSizeRem - slope * (range.minPx / 16)
      const at = Math.min(Math.max(role.minSizeRem, intercept + slope * (600 / 16)), role.sizeRem)
      return `${(at * 16).toFixed(0)}px`
  })()} and \`--text-heading-lg\` is ${(() => {
      const role = resolved.config.typography.roles.find((r) => r.role === "heading-lg")
      if (!role?.minSizeRem) return "—"
      const range = resolved.config.typography.fluidRange ?? { minPx: 390, maxPx: 1280 }
      const slope = (role.sizeRem - role.minSizeRem) / (range.maxPx / 16 - range.minPx / 16)
      const intercept = role.minSizeRem - slope * (range.minPx / 16)
      const at = Math.min(Math.max(role.minSizeRem, intercept + slope * (600 / 16)), role.sizeRem)
      return `${(at * 16).toFixed(0)}px`
  })()}.
- **The font stack does not degrade the way it does on the web.** Outlook takes the *first* family
  named and falls back to Times New Roman rather than walking the list, and no \`<link>\` survives
  to load a webfont — so \`${config.typography.families.sans}\` delivers a serif. Name a websafe
  family first in that medium (\`Arial, Helvetica, sans-serif\`) and accept that the brand face is
  not part of the design there.

**The container and shell tokens do not translate either.** A 600px email is narrower than every
container in the set and narrower than \`--shell-table-min\`, whose remedy — an \`overflow-x\`
wrapper — does nothing in mail. Use the spacing scale, the type roles and the colours; treat the
layout tokens as inapplicable and say so rather than picking the nearest one.

## Contrast

Text pairs are validated with APCA (Lc), which unlike WCAG 2 models dark-mode perception correctly.
**Each pair is held to the threshold for its own job, not to a single number:** Lc ${LC_THRESHOLD.body} for body text,
Lc ${LC_THRESHOLD.large} for UI labels and large text, Lc ${LC_THRESHOLD["non-text"]} for non-text boundaries.

${(() => {
        const distinct = resolved.warnings.filter((w) => w.kind === "distinctness")
        if (distinct.length === 0) return ""
        return `**${distinct.length} pair${distinct.length === 1 ? "" : "s"} of code or chart colours ${distinct.length === 1 ? "is" : "are"} legible and not distinguishable from each other**, which contrast cannot see and this system measures separately:

${distinct.map((warning) => `- ${warning.message}`).join("\n")}

Both colours in each pair are perfectly readable. What you cannot do is rely on the difference between them to carry meaning.

`
    })()}${(() => {
        const contrast = resolved.warnings.filter((w) => w.kind === "contrast")
        if (contrast.length > 0) {
            return `**${contrast.length} pair${contrast.length === 1 ? "" : "s"} in this brand currently miss${contrast.length === 1 ? "es" : ""} its threshold**, listed here because nothing else in this bundle carries them:

${contrast.map((warning) => `- ${warning.message}`).join("\n")}

Do not treat the affected values as validated until they are cleared.`
        }
        return `Every **validated** pair clears its own threshold, in both modes. Three things that
sentence does not mean:

- It is not "every pair clears 75". Labels on solid fills and \`--foreground-secondary\` are held to
  the Lc ${LC_THRESHOLD.large} bar and sit well below the body target — correct for their job, wrong for small body
  copy. Set supporting text below \`body-lg\` in \`--muted-foreground\`.
- \`--border-subtle\` and \`--foreground-tertiary\` are **deliberately exempt**. Both are defined as
  below the visible threshold, so they are not validated and never will be. Neither may be the only
  thing carrying meaning.
- **Every fill in this system is exempt from APCA, and that is a third class the list used to
  omit.** \`--muted\`, the four \`--state-*\` washes and the \`-subtle\` tints are checked for
  *visibility* — that something is there — with a channel-shift measure, because APCA clamps
  everything below its noise floor to 0 and a quiet fill lives entirely in that range. Several of
  them measure **at or near Lc 0 against the surface they land on, differing by hue alone**.
  Measured on this brand in dark: ${HUE_ONLY}. They are visible in colour and invisible in
  greyscale.
  **So the rule the polish rules state for links applies to all of them: colour must never be the
  only marker** (WCAG 1.4.1). A selected row needs a check, a left border or \`aria-selected\` as
  well as its tint; a diff line needs its \`+\`/\`-\`; a badge needs its label to say what it is.
- Pairs nobody declared are not checked. If you compose a combination the token descriptions don't
  sanction — \`--primary\` as body text, \`--muted-foreground\` on \`--surface-raised\` — you are
  outside the validated set and should measure it yourself.

**"Large text" means \`body-lg\` (1.125rem) and up at weight 400, or \`body\` and up at weight 600.**
Below that, the Lc ${LC_THRESHOLD.body} body bar applies.`
    })()}

\`--foreground-tertiary\` is deliberately below the reading threshold. It is for placeholders and
watermarks. If you find yourself wanting it for text a person must read, use \`--muted-foreground\`.
`
}

/** Rough LLM token count — a budget meter for the export dialog. */
export const estimateTokens = (text: string): number => Math.round(text.length / 3.6)
