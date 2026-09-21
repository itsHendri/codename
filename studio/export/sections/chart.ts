/** Chart series and the sequential scale, with the distances that keep them apart. Part of DESIGN_SYSTEM.md; see ../designSystemMd.ts. */

import { apca, CHART_MIN_DELTA_E, COLLISION_DELTA_E, composite, deltaE, LC_THRESHOLD, SYNTAX_MIN_DELTA_E } from "../../engine/contrast"
import { spaceName } from "../../engine/defaults"
import { SCALE_ROLES, type ResolvedTokens, type SemanticGroup } from "../../engine/types"
import { chartPlanFor, scaleInkFor } from "../../engine/semantics"
import { primaryFamily } from "../css"
import { table, deviations, cellValue, tokenTable, labelPairsFor, SHADCN_NAMES, GROUP_TITLES, GROUP_ORDER } from "../mdHelpers"

export function chartSection(resolved: ResolvedTokens): string {
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
