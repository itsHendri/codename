/** Chart series and the sequential scale. Split out of semantics.ts. */

import { apca, channelShift, CHART_MIN_DELTA_E, composite, deltaE, LC_THRESHOLD } from "../contrast"
import { generateScale, oklchToHex } from "../scale"
import {
    STEPS,
    type Mode,
    type ScaleConfig,
    type ScaleRole,
    type SemanticOverride,
    type SemanticTokenDef,
    type Step,
} from "../types"

import { idx, at, shift, DARK_LIFT, type Ramps, buildRamps, anchorsFor, pickAgainst, INK_CANDIDATES, PAPER_CANDIDATES, onFill, pickFill, WASH_ALPHAS, belowActive, maxWashAlpha, MIN_WASH_SHIFT, MIN_REGION_SHIFT, minVisibleAlpha, pickSubtle, interactionDirection, borderCandidates } from "./pick"
import { actionTokens } from "./action"
import { statusTokens } from "./status"

export function chartTokens(
    ramps: Ramps,
    anchorStep: Step,
    grounds: Record<Mode, string[]>,
): SemanticTokenDef[] {
    return chartPlan(ramps, anchorStep, grounds).tokens
}

/**
 * The series, and the candidate that stopped the run.
 *
 * One implementation, two callers: the tokens come from here and so does the
 * docs' sentence explaining the ceiling. Computing that sentence separately is
 * how you end up naming the first *unused* ramp rather than the one the
 * ordering actually rejected — which is DECISIONS #34's "a computed figure
 * quoted the wrong token", and is what happened on the first attempt.
 */
export interface ChartPlan {
    tokens: SemanticTokenDef[]
    step: Record<Mode, Step>
    rejected?: { role: ScaleRole; gap: Record<Mode, number> }
}

export function chartPlan(
    ramps: Ramps,
    anchorStep: Step,
    grounds: Record<Mode, string[]>,
): ChartPlan {
    const roles: ScaleRole[] = ["primary", "secondary", "success", "warning", "danger", "info"]

    // The walk is mode-aware, and getting that wrong is silent: in dark mode
    // "keep going until it clears the bar" has to move toward the *light* end,
    // because the ground is nearly black. Walking darker took the first attempt
    // to step 950 — three near-black series at Lc 0 on a black page, which the
    // contrast pass would have reported but the eye finds instantly.
    const stepFor = (mode: Mode, start: Step): Step => {
        const direction = mode === "light" ? 1 : -1
        for (let i = idx(start); i >= 0 && i < STEPS.length; i += direction) {
            const step = at(i)
            const visible = roles.every((role) =>
                grounds[mode].every(
                    (ground) => Math.abs(apca(ramps[role][mode][step]!, ground)) >= LC_THRESHOLD["non-text"],
                ),
            )
            if (visible) return step
        }
        return at(mode === "light" ? STEPS.length - 1 : 0)
    }
    const step: Record<Mode, Step> = {
        light: stepFor("light", anchorStep),
        dark: stepFor("dark", shift(anchorStep, -DARK_LIFT)),
    }

    const lightHex = (role: ScaleRole) => ramps[role].light[step.light]!
    const ordered: ScaleRole[] = ["primary"]
    while (ordered.length < roles.length) {
        let best: { role: ScaleRole; distance: number } | undefined
        for (const role of roles) {
            if (ordered.includes(role)) continue
            const distance = Math.min(...ordered.map((chosen) => deltaE(lightHex(role), lightHex(chosen))))
            if (!best || distance > best.distance) best = { role, distance }
        }
        ordered.push(best!.role)
    }

    const series: ScaleRole[] = []
    let rejected: ChartPlan["rejected"]
    for (const role of ordered) {
        const gap = (mode: Mode) =>
            Math.min(
                ...series.map((chosen) =>
                    deltaE(ramps[role][mode][step[mode]]!, ramps[chosen][mode][step[mode]]!),
                ),
            )
        if (series.length > 0) {
            const distance = { light: gap("light"), dark: gap("dark") }
            if (distance.light < CHART_MIN_DELTA_E || distance.dark < CHART_MIN_DELTA_E) {
                rejected = { role, gap: distance }
                break
            }
        }
        series.push(role)
    }

    /**
     * One alpha for every series' area fill, solved the way `--muted` is.
     *
     * Shared rather than per-series on purpose: an area chart's fills are read
     * as a set, and three different strengths would make one band look like more
     * data than another — the same argument that puts every series on one step.
     *
     * Two ends, both measured. It has to read as a region over the plot's own
     * ground, and body text has to survive on it, because an axis label or a
     * value annotation lands on top of an area far more often than it lands on a
     * line. Where those conflict the readable one wins and the audit says so.
     */
    const areaAlpha: Record<Mode, number> = {
        light: Math.min(
            minVisibleAlpha(ramps[series[0]!].light[step.light]!, grounds.light, MIN_REGION_SHIFT),
            ...series.map((role) =>
                maxWashAlpha(
                    ramps[role].light[step.light]!,
                    grounds.light,
                    ramps.neutral.light[950]!,
                    LC_THRESHOLD.body,
                ),
            ),
        ),
        dark: Math.min(
            minVisibleAlpha(ramps[series[0]!].dark[step.dark]!, grounds.dark, MIN_REGION_SHIFT),
            ...series.map((role) =>
                maxWashAlpha(
                    ramps[role].dark[step.dark]!,
                    grounds.dark,
                    ramps.neutral.dark[50]!,
                    LC_THRESHOLD.body,
                ),
            ),
        ),
    }

    const tokens: SemanticTokenDef[] = series.map((role, index) => ({
        name: `chart-${index + 1}`,
        group: "chart" as const,
        light: { scale: role, step: step.light },
        dark: { scale: role, step: step.dark },
        description:
            index === 0
                ? `First series, and the brand colour verbatim in light. Use the numbered tokens **in order**: the ordering is what guarantees the separation. There are ${series.length}, which is a measured ceiling — see Charts and data.`
                : `Series ${index + 1}. Drawn from the \`${role}\` ramp, which carries **no status meaning here** — a chart series is a category. Whatever colour this happens to be on a given brand, it does not make its series good or bad, and you must not reorder the series so that a failing metric comes out red. Pair it with a second encoding — a dash pattern, a marker shape, a hatch — because every series sits at the same lightness and colour alone disappears in greyscale.`,
    }))

    return {
        tokens: [
            ...tokens,
            ...series.map((role, index) => ({
                name: `chart-${index + 1}-subtle`,
                group: "chart" as const,
                light: { scale: role, step: step.light, alpha: areaAlpha.light },
                dark: { scale: role, step: step.dark, alpha: areaAlpha.dark },
                description:
                    index === 0
                        ? `The band under series ${index + 1} — an area fill, a range band, a highlighted region. Translucent, so overlapping bands compose. **A band never identifies a series on its own** — see Charts and data.`
                        : `The band under series ${index + 1}. Same strength as \`--chart-1-subtle\`; only the hue differs.`,
            })),
        ],
        step,
        rejected,
    }
}

/**
 * A sequential scale — the ramp a heatmap, a choropleth or an intensity column
 * needs, where the question is not "are these N apart" but "does more look like
 * more".
 *
 * Five stops off the primary ramp, evenly spaced so the steps read as even, and
 * **reversed in dark** so that "more" always moves away from the page: darker on
 * a light ground, lighter on a dark one. The brand shows through, which is the
 * trade — a generated hue-neutral ramp would be readable at more stops and would
 * stop looking like this system.
 *
 * The constraint that shapes it, and it is arithmetic rather than a defect in
 * this palette: **the middle of any sequential scale cannot carry text.** A
 * mid-lightness fill has no near-black or near-white ink that clears the body
 * bar — the same physics that makes `pickFill` walk past a mid-lightness amber
 * looking for a step that can hold a label. Acceptance run 10 found this
 * empirically while building a heatmap; measuring the whole ramp confirms there
 * is no five-stop arrangement that escapes it. So the tokens ship, and which
 * stops can hold a label ships with them, generated. See `scaleInkFor`.
 */
export const SCALE_STEPS: Step[] = [100, 300, 500, 700, 900]

export function scaleTokens(): SemanticTokenDef[] {
    return SCALE_STEPS.map((step, index) => ({
        name: `scale-${index + 1}`,
        group: "scale" as const,
        light: { scale: "primary" as const, step },
        dark: { scale: "primary" as const, step: SCALE_STEPS[SCALE_STEPS.length - 1 - index]! },
        description:
            index === 0
                ? `Lowest stop of the sequential scale — a heatmap cell, a choropleth region, an intensity column. Five stops, \`scale-1\` nearest the page and \`scale-${SCALE_STEPS.length}\` furthest from it in **both** modes, so "more" always means "further from the background". **Most stops cannot hold text**: see Charts and data for which can, on this brand. This is a *magnitude* scale — never use it for categories, which is what \`--chart-*\` is for.`
                : `Stop ${index + 1} of ${SCALE_STEPS.length} on the sequential scale.`,
    }))
}

/**
 * Which stops can carry a label, and in what — measured, because the answer is
 * a fact about the palette and changes with the seeds.
 *
 * The candidates are the inks this system already has for a coloured fill:
 * `--foreground`, each mode's `-foreground` for the brand, and
 * `--inverse-foreground`, which is the *dark* neutral in dark mode and is
 * therefore the only thing that can sit on a pale stop there.
 */
export function scaleInkFor(
    resolved: { semantics: Array<{ name: string; values: Record<Mode, { hex: string }> }> },
    mode: Mode,
): Array<{ token: string; ink?: string; lc: number }> {
    const by = new Map(resolved.semantics.map((token) => [token.name, token]))
    const candidates = ["foreground", "primary-foreground", "inverse-foreground"]
    return SCALE_STEPS.map((_, index) => {
        const fill = by.get(`scale-${index + 1}`)
        if (!fill) return { token: `scale-${index + 1}`, lc: 0 }
        const best = candidates
            .map((name) => {
                const ink = by.get(name)
                return {
                    token: `scale-${index + 1}`,
                    ink: name,
                    lc: ink ? Math.abs(apca(ink.values[mode].hex, fill.values[mode].hex)) : 0,
                }
            })
            .reduce((a, b) => (a.lc > b.lc ? a : b))
        return best.lc >= LC_THRESHOLD.ui ? best : { token: best.token, lc: best.lc }
    })
}

/** The chart plan for a brand — the docs read the ceiling's reason from here. */
export function chartPlanFor(scales: ScaleConfig[]): ChartPlan {
    const ramps = buildRamps(scales)
    const neutral = ramps.neutral
    // The same two grounds the tokens are solved against: the page and a card.
    const grounds: Record<Mode, string[]> = {
        light: [neutral.light[100]!, neutral.light[50]!],
        dark: [neutral.dark[950]!, neutral.dark[900]!],
    }
    return chartPlan(ramps, anchorsFor(scales).primary, grounds)
}

/** A semantic token plus which of its refs a human moved. */
