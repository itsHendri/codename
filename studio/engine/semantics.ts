/**
 * The semantic layer — the ONLY layer components and AI agents consume.
 *
 * Primitives (neutral-200, primary-600…) are where a human edits colour.
 * Semantics (background, foreground, border, primary-hover…) are how everything
 * else refers to colour. The vocabulary is deliberately Hendri's — surfaces,
 * foregrounds, states, borders — with shadcn-compatible names kept wherever they
 * fit, because that vocabulary is the one already in every model's training data.
 *
 * defaultSemanticMapping() produces a COMPLETE working system from the seeds
 * alone, and it picks every text colour by measuring real contrast against the
 * real fill rather than guessing from a step number. Seeds in, a system that
 * passes its own audit out.
 */

import { apca, channelShift, CHART_MIN_DELTA_E, composite, deltaE, LC_THRESHOLD } from "./contrast"
import { generateScale, oklchToHex } from "./scale"
import {
    STEPS,
    type Mode,
    type ScaleConfig,
    type ScaleRole,
    type SemanticOverride,
    type SemanticTokenDef,
    type Step,
} from "./types"

/** Index into STEPS: 0 = 50 (lightest) … 10 = 950 (darkest). */
const idx = (step: Step): number => STEPS.indexOf(step)
const at = (i: number): Step => STEPS[Math.max(0, Math.min(STEPS.length - 1, i))]!

/** Move n positions darker (positive) or lighter (negative). */
const shift = (step: Step, n: number): Step => at(idx(step) + n)

/** In dark mode a brand fill moves two steps lighter; the dark ramp already cut its chroma. */
const DARK_LIFT = 2

type Ramps = Record<ScaleRole, Record<Mode, Record<Step, string>>>

/** Generate every ramp as hex, so the mapping can measure contrast while it decides. */
function buildRamps(scales: ScaleConfig[]): Ramps {
    const ramps = {} as Ramps
    for (const scale of scales) {
        const modes = {} as Record<Mode, Record<Step, string>>
        for (const mode of ["light", "dark"] as Mode[]) {
            const generated = generateScale(scale.seed, mode, scale.tuning?.[mode] ?? {})
            const steps = {} as Record<Step, string>
            for (const step of STEPS) steps[step] = oklchToHex(generated.steps[step]!)
            modes[mode] = steps
        }
        ramps[scale.role] = modes
    }
    return ramps
}

export function anchorsFor(scales: ScaleConfig[]): Record<ScaleRole, Step> {
    const anchors = {} as Record<ScaleRole, Step>
    for (const scale of scales) {
        anchors[scale.role] = generateScale(scale.seed, "light", scale.tuning?.light ?? {}).anchorStep
    }
    return anchors
}

/**
 * Choose the step that clears `required` against `backgroundHex` with the
 * smallest jump — the quietest colour that is still readable. Falls back to the
 * highest-contrast candidate when nothing clears the bar, so the system degrades
 * to "as legible as this ramp allows" rather than to an arbitrary step.
 */
function pickAgainst(
    ramp: Record<Step, string>,
    backgroundHex: string,
    candidates: readonly Step[],
    required: number,
    prefer: "quietest" | "strongest" = "quietest",
    /**
     * Steps another text level has already claimed. A hierarchy the docs promise
     * and the values don't make is worse than no hierarchy, so a level that
     * would duplicate one above it takes the next passing step instead of
     * silently becoming its twin. Ignored if nothing else passes.
     */
    exclude: readonly Step[] = [],
): Step {
    let best: { step: Step; lc: number } | undefined
    let fallback: { step: Step; lc: number } | undefined
    let strongest: { step: Step; lc: number } | undefined

    for (const step of candidates) {
        const lc = Math.abs(apca(ramp[step]!, backgroundHex))
        if (!strongest || lc > strongest.lc) strongest = { step, lc }
        if (lc < required) continue
        if (!fallback || lc < fallback.lc) fallback = { step, lc }
        if (exclude.includes(step)) continue
        if (!best || lc < best.lc) best = { step, lc }
    }
    if (prefer === "strongest") return strongest!.step
    return (best ?? fallback ?? strongest!).step
}

const INK_CANDIDATES = [950, 900, 800, 700, 600] as const
const PAPER_CANDIDATES = [50, 100, 200, 300] as const

/**
 * Text on a solid fill is drawn from the NEUTRAL ramp, not the fill's own.
 * A brand ramp's lightest step is a tint, not white — on a mid-lightness fill
 * neither end of it clears the bar, while real systems just put white or
 * near-black on the button. Which of the two wins is decided by measurement,
 * so an amber fill gets dark text and an indigo one gets light text without
 * anybody hand-picking either.
 */
function onFill(neutralRamp: Record<Step, string>, fillHex: string): { scale: ScaleRole; step: Step } {
    return {
        scale: "neutral",
        // Strongest, not quietest: a button label wants to be crisp. The
        // "smallest passing jump" rule is right for text on a page, where a
        // quieter colour reads as hierarchy, and wrong on a solid fill, where
        // it just looks washed out.
        step: pickAgainst(
            neutralRamp,
            fillHex,
            [...PAPER_CANDIDATES, ...INK_CANDIDATES],
            LC_THRESHOLD.ui,
            "strongest",
        ),
    }
}

/**
 * Pick a solid fill that can actually carry a label.
 *
 * Starting at `startStep` and walking darker, take the first step where some
 * neutral clears the UI-text bar. A colour in the middle of its ramp carries
 * neither light nor dark text well — mid-lightness amber is the classic case —
 * so "the seed, verbatim" is not always a usable button.
 *
 * Brand fills don't go through this in light mode: the promise that your typed
 * colour IS your primary button outranks a marginal contrast miss, and the
 * contrast pass reports it instead. Status colours have no such promise — the
 * seed is a hint about meaning, so legibility wins.
 */
function pickFill(
    ramp: Record<Step, string>,
    neutralRamp: Record<Step, string>,
    startStep: Step,
): Step {
    let strongest: { step: Step; lc: number } | undefined
    for (let i = idx(startStep); i < STEPS.length; i++) {
        const step = at(i)
        const fill = ramp[step]!
        const best = Math.max(
            ...[...PAPER_CANDIDATES, ...INK_CANDIDATES].map((candidate) =>
                Math.abs(apca(neutralRamp[candidate]!, fill)),
            ),
        )
        if (best >= LC_THRESHOLD.ui) return step
        if (!strongest || best > strongest.lc) strongest = { step, lc: best }
    }
    return strongest!.step
}

/** Strongest first: the search wants the most visible wash that still reads. */
const WASH_ALPHAS: readonly number[] = [0.28, 0.24, 0.2, 0.18, 0.16, 0.14, 0.12, 0.1, 0.08, 0.06]

/**
 * One notch gentler than `--state-active`, whenever the two would tie.
 *
 * `--muted` is a resting fill and `--state-active` is a pressed one, so a table
 * header that is byte-identical to a pressed row means pressing the row paints
 * it the header's colour — the interaction does nothing visible. In dark mode
 * the two solves met exactly: the region wants more wash than the palette can
 * carry, `active` takes the most it can carry, and both clamped onto the same
 * ceiling. Each was right on its own terms, which is why nothing caught it.
 *
 * The cost is real and is the right way round: a quiet region loses a little of
 * its region-ness so that a press stays a press.
 */
function belowActive(alpha: number, activeAlpha: number): number {
    if (alpha < activeAlpha) return alpha
    const next = WASH_ALPHAS[WASH_ALPHAS.indexOf(activeAlpha) + 1]
    return next ?? alpha
}

/**
 * How much wash this palette can carry before text stops being readable on it.
 *
 * A translucent state has to work on every surface it is allowed on, and the
 * binding constraint is whichever surface has least headroom — in dark mode
 * that is `surface-raised`, which is already the lightest ground, so a
 * lightening wash pushes it toward the near-white foreground. Solving for the
 * largest passing alpha rather than picking one by hand means a brand with a
 * tighter ramp automatically gets a gentler wash instead of an unreadable row.
 *
 * Returns the weakest candidate if nothing passes, so the system degrades to
 * "as subtle as this palette demands" and the audit reports the rest.
 */
function maxWashAlpha(
    washHex: string,
    groundHexes: string[],
    textHex: string,
    required: number,
): number {
    for (const alpha of WASH_ALPHAS) {
        const readable = groundHexes.every(
            (ground) => Math.abs(apca(textHex, composite(washHex, alpha, ground))) >= required,
        )
        if (readable) return alpha
    }
    return WASH_ALPHAS[WASH_ALPHAS.length - 1]!
}

/**
 * A wash nobody can see is not a subtle wash, it is a bug — which is exactly
 * what the old opaque `--state-hover` was on `--muted`. So hover is not "half of
 * pressed"; it is the *gentlest* wash that still visibly moves every surface.
 *
 * The binding ground here is the opposite one from `maxWashAlpha`: the wash is a
 * mid grey, so it shifts the surface nearest it least — dark `surface-raised`,
 * which sits closest to the wash on the ramp.
 */
export const MIN_WASH_SHIFT = 6
/** A quiet *region* has to read as a region, not as a passing highlight. */
export const MIN_REGION_SHIFT = 11

function minVisibleAlpha(washHex: string, groundHexes: string[], minShift = MIN_WASH_SHIFT): number {
    for (const alpha of [...WASH_ALPHAS].reverse()) {
        const visible = groundHexes.every(
            (ground) => channelShift(composite(washHex, alpha, ground), ground) >= minShift,
        )
        if (visible) return alpha
    }
    return WASH_ALPHAS[0]!
}

/**
 * The quietest tint that still reads as a region on every ground it can land on.
 *
 * A `-subtle` fill is opaque, so unlike a wash it *replaces* the surface rather
 * than moving it — but the question is the same one APCA cannot answer: can you
 * see that anything is there? Step 100 is the conventional answer and it is
 * wrong on a tinted page: on the shipped brand `--primary-subtle` measured Lc
 * 2.2 against `--background`, invisible, and worse than the `--secondary-subtle`
 * the docs went out of their way to warn about. The Badge recipe names
 * `primary` first, so the sanctioned default was the invisible one.
 *
 * Grounds are `background` and `surface` — where a badge, a callout or a
 * selected row actually sits. Falling back to the last candidate keeps the
 * degradation legible: the strongest tint the ramp offers, and the audit says so.
 */
function pickSubtle(
    ramp: Record<Step, string>,
    groundHexes: string[],
    candidates: readonly Step[],
): Step {
    for (const step of candidates) {
        if (groundHexes.every((ground) => channelShift(ramp[step]!, ground) >= MIN_REGION_SHIFT)) {
            return step
        }
    }
    return candidates[candidates.length - 1]!
}

/**
 * Which way interaction moves a fill.
 *
 * Always AWAY from its label: a fill wearing light text darkens on hover, a fill
 * wearing dark text lightens. Contrast therefore improves as you interact with a
 * control instead of collapsing — which is what happens if hover has a fixed
 * direction and the label polarity flips underneath it.
 */
function interactionDirection(neutralRamp: Record<Step, string>, foregroundStep: Step, fillHex: string): 1 | -1 {
    const labelIsLight = apca(neutralRamp[foregroundStep]!, fillHex) < 0
    return labelIsLight ? 1 : -1
}

/** The steps a `-border` may take: away from the `-subtle` fill it outlines. */
const borderCandidates = (subtle: Step, mode: Mode): Step[] =>
    mode === "light"
        ? STEPS.slice(idx(subtle) + 1, idx(subtle) + 5)
        : STEPS.slice(Math.max(0, idx(subtle) - 4), idx(subtle)).reverse()

function actionTokens(
    role: Extract<ScaleRole, "primary" | "secondary">,
    anchor: Step,
    ramps: Ramps,
    subtle: Record<Mode, Step>,
): SemanticTokenDef[] {
    const ramp = ramps[role]
    const neutral = ramps.neutral
    const fill: Record<Mode, Step> = {
        // `primary` keeps the verbatim promise — your seed IS your button — and
        // the audit reports it when that costs contrast, because the identity
        // colour is worth defending. `secondary` does not get that: it is an
        // accent, its token is defined as a solid fill, and a fill that cannot
        // carry its own label is not a fill. The exact seed still sits at its
        // anchor step in the ramp either way.
        light: role === "primary" ? anchor : pickFill(ramp.light, neutral.light, anchor),
        dark: pickFill(ramp.dark, neutral.dark, shift(anchor, -DARK_LIFT)),
    }
    const foreground: Record<Mode, { scale: ScaleRole; step: Step }> = {
        light: onFill(neutral.light, ramp.light[fill.light]!),
        dark: onFill(neutral.dark, ramp.dark[fill.dark]!),
    }
    const direction: Record<Mode, 1 | -1> = {
        light: interactionDirection(neutral.light, foreground.light.step, ramp.light[fill.light]!),
        dark: interactionDirection(neutral.dark, foreground.dark.step, ramp.dark[fill.dark]!),
    }
    return [
        {
            name: role,
            group: "brand",
            light: { scale: role, step: fill.light },
            dark: { scale: role, step: fill.dark },
            description: `Solid ${role} fill — ${role === "primary" ? "primary buttons, active nav, key accents" : "secondary buttons and supporting accents"}.`,
        },
        {
            name: `${role}-foreground`,
            group: "brand",
            light: foreground.light,
            dark: foreground.dark,
            description: `Text and icons on a solid \`${role}\` fill. Never use it on a page background.`,
        },
        {
            name: `${role}-hover`,
            group: "state",
            light: { scale: role, step: shift(fill.light, direction.light) },
            dark: { scale: role, step: shift(fill.dark, direction.dark) },
            description: `Hover state of a solid \`${role}\` fill.`,
        },
        {
            name: `${role}-active`,
            group: "state",
            light: { scale: role, step: shift(fill.light, direction.light * 2) },
            dark: { scale: role, step: shift(fill.dark, direction.dark * 2) },
            description: `Pressed/active state of a solid \`${role}\` fill.`,
        },
        {
            name: `${role}-subtle`,
            group: "brand",
            light: { scale: role, step: subtle.light },
            dark: { scale: role, step: subtle.dark },
            description: `Tinted ${role} wash — quiet badges, selected rows, callouts. Not a text colour, and not a lightness shift: it can measure Lc 0 against the surface it sits on, so it reads in colour and vanishes in greyscale. Never the only thing saying what something is — a badge needs its label to say it too.`,
        },
        {
            name: `${role}-subtle-foreground`,
            group: "brand",
            light: { scale: role, step: pickAgainst(ramp.light, ramp.light[subtle.light]!, INK_CANDIDATES, LC_THRESHOLD.body) },
            dark: { scale: role, step: pickAgainst(ramp.dark, ramp.dark[subtle.dark]!, PAPER_CANDIDATES, LC_THRESHOLD.body) },
            description: `Text on \`${role}-subtle\`.`,
        },
    ]
}

function statusTokens(
    role: Extract<ScaleRole, "success" | "warning" | "danger" | "info">,
    anchor: Step,
    ramps: Ramps,
    subtle: Record<Mode, Step>,
): SemanticTokenDef[] {
    const ramp = ramps[role]
    const neutral = ramps.neutral
    const lightFill = pickFill(ramp.light, neutral.light, anchor)
    const darkFill = pickFill(ramp.dark, neutral.dark, shift(anchor, -DARK_LIFT))
    const label = role === "danger" ? "destructive" : role

    // Status fills get hover/active for the same reason brand fills do: the
    // system tells you to build a destructive button, and without these its
    // hover state is inexpressible — `--state-hover` is a neutral wash, and
    // computing one with filter/opacity is banned by name.
    const foreground = {
        light: onFill(neutral.light, ramp.light[lightFill]!),
        dark: onFill(neutral.dark, ramp.dark[darkFill]!),
    }
    const direction = {
        light: interactionDirection(neutral.light, foreground.light.step, ramp.light[lightFill]!),
        dark: interactionDirection(neutral.dark, foreground.dark.step, ramp.dark[darkFill]!),
    }

    return [
        {
            name: role,
            group: "status",
            light: { scale: role, step: lightFill },
            dark: { scale: role, step: darkFill },
            description: `Solid ${label} fill — ${label} buttons, filled badges, chart series.`,
        },
        {
            name: `${role}-foreground`,
            group: "status",
            light: foreground.light,
            dark: foreground.dark,
            description: `Text and icons on a solid \`${role}\` fill.`,
        },
        {
            name: `${role}-hover`,
            group: "state",
            light: { scale: role, step: shift(lightFill, direction.light) },
            dark: { scale: role, step: shift(darkFill, direction.dark) },
            description: `Hover state of a solid \`${role}\` fill — a ${label} button.`,
        },
        {
            name: `${role}-active`,
            group: "state",
            light: { scale: role, step: shift(lightFill, direction.light * 2) },
            dark: { scale: role, step: shift(darkFill, direction.dark * 2) },
            description: `Pressed state of a solid \`${role}\` fill.`,
        },
        {
            name: `${role}-subtle`,
            group: "status",
            light: { scale: role, step: subtle.light },
            dark: { scale: role, step: subtle.dark },
            description: `Background of a ${label} banner, alert or inline message.`,
        },
        {
            name: `${role}-subtle-foreground`,
            group: "status",
            light: { scale: role, step: pickAgainst(ramp.light, ramp.light[subtle.light]!, INK_CANDIDATES, LC_THRESHOLD.body) },
            dark: { scale: role, step: pickAgainst(ramp.dark, ramp.dark[subtle.dark]!, PAPER_CANDIDATES, LC_THRESHOLD.body) },
            description: `Text on \`${role}-subtle\`. This is the ${label} text colour — not \`${role}\`.`,
        },
        {
            name: `${role}-border`,
            group: "status",
            // Measured against the fill it outlines, and drawn from the steps
            // beyond it. Adjacent steps produce a border at Lc 0 — a boundary
            // nobody can see, which is the same as no boundary while costing a
            // token.
            light: {
                scale: role,
                step: pickAgainst(ramp.light, ramp.light[subtle.light]!, borderCandidates(subtle.light, "light"), LC_THRESHOLD["non-text"]),
            },
            dark: {
                scale: role,
                step: pickAgainst(ramp.dark, ramp.dark[subtle.dark]!, borderCandidates(subtle.dark, "dark"), LC_THRESHOLD["non-text"]),
            },
            description: `Border of a ${label} banner or field.`,
        },
    ]
}

/**
 * Categorical chart series — as many as this brand's seeds can actually keep
 * apart, which is not the same as how many ramps it has.
 *
 * Three rules, and the count falls out of them rather than being chosen:
 *
 * **One step for every series, and it is the primary's anchor.** A categorical
 * palette needs equal visual weight across series — one line must not read as
 * more important than another — so every series sits at the same step rather
 * than at its own ramp's anchor. Using `anchors.primary` means `--chart-1` is
 * the brand colour verbatim in light, which is the same promise `--primary` and
 * `--ring` make (DECISIONS #4), and the dark lift is the one the rest of the
 * system already uses. If that step cannot clear the visible-boundary bar
 * against both grounds, the search walks toward the ink end until it does.
 *
 * **The order is fixed once, from the light ramp, and applies to both modes.** A
 * series that is orange in light and red in dark is a legend that lies the
 * moment somebody flips the theme. Light is the canonical identity (#5).
 * Greedy: start at the brand, then repeatedly take whichever remaining ramp is
 * furthest from everything already chosen.
 *
 * **The run stops at the first series that is too close to one already in it.**
 * Not "emit six and warn" — a token that exists is a token somebody will use,
 * and the sixth series of a five-series palette is a bug you shipped rather than
 * a warning they read. On seeds whose hues cluster, this returns three.
 */
function chartTokens(
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

function chartPlan(
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
const SCALE_STEPS: Step[] = [100, 300, 500, 700, 900]

function scaleTokens(): SemanticTokenDef[] {
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
export interface SemanticDef extends SemanticTokenDef {
    overridden: Record<Mode, boolean>
}

/**
 * The full semantic set for a brand: generated from the seeds, then overridden.
 *
 * This is the function to call — `defaultSemanticMapping` on its own is the
 * generator, and using it directly is how a brand's hand edits get dropped.
 *
 * An override naming a token that no longer exists is reported rather than
 * ignored: it means a token was renamed or removed under a brand that had
 * customised it, and silently discarding the edit is how someone loses work
 * without ever being told.
 */
export function semanticDefs(
    scales: ScaleConfig[],
    overrides: SemanticOverride[] = [],
): { defs: SemanticDef[]; orphaned: string[] } {
    const byName = new Map(overrides.map((override) => [override.name, override]))
    const defs = defaultSemanticMapping(scales).map((def): SemanticDef => {
        const override = byName.get(def.name)
        byName.delete(def.name)
        if (!override) return { ...def, overridden: { light: false, dark: false } }
        return {
            ...def,
            light: override.light ?? def.light,
            dark: override.dark ?? def.dark,
            overridden: { light: Boolean(override.light), dark: Boolean(override.dark) },
        }
    })
    return { defs, orphaned: [...byName.keys()] }
}

export function defaultSemanticMapping(scales: ScaleConfig[]): SemanticTokenDef[] {
    const ramps = buildRamps(scales)
    const anchors = anchorsFor(scales)
    const neutral = ramps.neutral

    const n = (light: Step, dark: Step) => ({
        light: { scale: "neutral" as const, step: light },
        dark: { scale: "neutral" as const, step: dark },
    })

    // Surfaces come first because every text colour is chosen against them.
    /**
     * The elevation ladder, named for purpose rather than numbered (DECISIONS #21).
     *
     * Both modes run out of ramp, at opposite ends, and the measurements say
     * exactly where. Light tops out at `neutral-50` — there is nothing whiter
     * than white — so `surface`, `raised` and `overlay` share a fill there and
     * the shadows carry the separation. That is not a compromise; it is what
     * Atlassian's light theme does too.
     *
     * Dark bottoms out at `neutral-950`, so `sunken` shares with `background`.
     * It also has a hard ceiling: `neutral-700` puts body text at Lc 79, four
     * points off the bar, and `neutral-600` fails outright at 68. So the dark
     * ladder is 950/900/800/700 and there is no fifth level to be had.
     */
    const surfaces = {
        sunken: n(200, 950),
        background: n(100, 950),
        surface: n(50, 900),
        raised: n(50, 800),
        overlay: n(50, 700),
    }
    /** Every opaque surface a wash or a text colour can land on, darkest-first. */
    const ladder = [surfaces.sunken, surfaces.background, surfaces.surface, surfaces.raised, surfaces.overlay]
    const ladderHex: Record<Mode, string[]> = {
        light: ladder.map((surface) => neutral.light[surface.light.step]!),
        dark: ladder.map((surface) => neutral.dark[surface.dark.step]!),
    }


    const bodyInk: Record<Mode, string> = { light: neutral.light[950]!, dark: neutral.dark[50]! }

    /**
     * `--muted` is a wash too, and it has to be: the dark ladder consumes every
     * usable step (950/900/800/700), so there is no opaque value left for a
     * quiet fill that does not collide with a surface. Atlassian documents
     * exactly this trade — an opaque token darkens in both modes, a transparent
     * one adapts to whatever elevation it lands on — and in dark mode, where the
     * surfaces move, adapting is the behaviour you want anyway.
     *
     * The same mid grey as the state washes, at its own strength. A step further
     * out was tried first, to keep a quiet region and a pressed row from ever
     * resolving alike; in dark mode it lightened the surfaces so much that only
     * the two lightest neutrals still cleared body contrast on them, which left
     * no distinct step for `--muted-foreground`. A mid grey is gentler per unit
     * of alpha, and the strengths differ anyway.
     *
     * Solved as the *gentlest* wash that still reads as a region, not the
     * strongest the palette allows. Solving it for maximum made it the most
     * extreme ground in the system, which then dragged `--muted-foreground` and
     * `--link` toward the ends of the ramp to stay readable on it. A quiet fill
     * that forces every caption darker is not quiet.
     */
    const mutedHex: Record<Mode, string> = { light: neutral.light[500]!, dark: neutral.dark[500]! }
    /**
     * The strongest wash this palette can carry with body text still on it.
     * Computed here rather than beside the other states because `--muted` is
     * defined relative to it — see `belowActive`.
     */
    const activeAlpha: Record<Mode, number> = {
        light: maxWashAlpha(mutedHex.light, ladderHex.light, bodyInk.light, LC_THRESHOLD.body),
        dark: maxWashAlpha(mutedHex.dark, ladderHex.dark, bodyInk.dark, LC_THRESHOLD.body),
    }
    const mutedAlpha: Record<Mode, number> = {
        light: belowActive(
            minVisibleAlpha(mutedHex.light, ladderHex.light, MIN_REGION_SHIFT),
            activeAlpha.light,
        ),
        dark: belowActive(
            minVisibleAlpha(mutedHex.dark, ladderHex.dark, MIN_REGION_SHIFT),
            activeAlpha.dark,
        ),
    }

    /** A muted region on each surface — a real ground that text has to survive. */
    const mutedOver: Record<Mode, string[]> = {
        light: ladderHex.light.map((ground) => composite(mutedHex.light, mutedAlpha.light, ground)),
        dark: ladderHex.dark.map((ground) => composite(mutedHex.dark, mutedAlpha.dark, ground)),
    }

    /**
     * The two grounds a `-subtle` tint has to read against: the page and a card.
     * A badge, a callout and a selected row all sit on one of those.
     */
    const subtleGrounds: Record<Mode, string[]> = {
        light: [ladderHex.light[1]!, ladderHex.light[2]!],
        dark: [ladderHex.dark[1]!, ladderHex.dark[2]!],
    }
    const subtleFor = (role: ScaleRole): Record<Mode, Step> => ({
        light: pickSubtle(ramps[role].light, subtleGrounds.light, [100, 200, 300]),
        dark: pickSubtle(ramps[role].dark, subtleGrounds.dark, [900, 800, 700]),
    })

    const borderOnPage = {
        light: {
            scale: "neutral" as const,
            step: pickAgainst(
                neutral.light,
                neutral.light[surfaces.background.light.step]!,
                [200, 300, 400, 500],
                LC_THRESHOLD["non-text"],
            ),
        },
        dark: {
            scale: "neutral" as const,
            step: pickAgainst(
                neutral.dark,
                neutral.dark[surfaces.background.dark.step]!,
                [800, 700, 600, 500],
                LC_THRESHOLD["non-text"],
            ),
        },
    }

    /**
     * The surface a text colour has the least room against — not the page.
     * Ink struggles on the darkest surface; paper struggles on the lightest.
     * Measuring against `background` alone passes, then fails on a dialog:
     * in dark mode `surface-raised` is four steps lighter than the page.
     */
    const hardestGround: Record<Mode, string> = {
        // Ink struggles on the darkest ground, paper on the lightest.
        // The bare ladder only. A muted region *inside* an overlay is the
        // lightest ground the system can produce, and holding supporting text to
        // it pushed every level to the end of the ramp — `foreground-secondary`
        // and `muted-foreground` both landed on `neutral-100`, one step from the
        // body ink, and the three-level hierarchy stopped existing. Bare raised
        // and overlay are in, because a subtitle in a dialog is ordinary.
        light: ladderHex.light.reduce((a, b) => (apca(bodyInk.light, a) < apca(bodyInk.light, b) ? a : b)),
        dark: ladderHex.dark.reduce((a, b) =>
            Math.abs(apca(bodyInk.dark, a)) < Math.abs(apca(bodyInk.dark, b)) ? a : b,
        ),
    }

    /**
     * The flat surfaces — sunken, page, card. `raised` and `overlay` are excluded
     * on purpose: in dark mode they are the lightest grounds in the system, and
     * holding a caption colour to them drags `muted-foreground` all the way to
     * near-white, where it stops being distinguishable from `foreground`. A
     * caption inside a popover is rare; a caption on a card is everywhere.
     */
    const flatGround: Record<Mode, string> = {
        // Sunken, page and card, plus a muted region on the page and on a card —
        // a caption in a table header is as common as one on a card, and the
        // wash makes that ground harder than the bare surface.
        //
        // Muted-over-*sunken* is deliberately excluded, and so are raised and
        // overlay. Including it drove `muted-foreground` in light mode all the
        // way to `neutral-950`, where it was byte-identical to `--foreground`
        // and the text hierarchy the docs promise stopped existing. A caption
        // inside a muted region inside a well is not worth that.
        light: [ladderHex.light[0]!, ladderHex.light[1]!, ladderHex.light[2]!, mutedOver.light[1]!, mutedOver.light[2]!].reduce(
            (a, b) => (apca(bodyInk.light, a) < apca(bodyInk.light, b) ? a : b),
        ),
        dark: [ladderHex.dark[0]!, ladderHex.dark[1]!, ladderHex.dark[2]!, mutedOver.dark[1]!, mutedOver.dark[2]!].reduce(
            (a, b) => (Math.abs(apca(bodyInk.dark, a)) < Math.abs(apca(bodyInk.dark, b)) ? a : b),
        ),
    }

    /**
     * An inverted neutral region — a tooltip, a dark chip, a footer band.
     * Carbon's `$background-inverse` family; Atlassian's `inverse` colour role.
     *
     * "Inverse" means opposite to the current mode, not a fixed dark: on a dark
     * page an inverted chip is *light*. Anything sitting on it therefore has to
     * be measured against it rather than against the page, which is the whole
     * reason these are tokens and not a note telling people to use `--surface`.
     */
    const inverseSurface: Record<Mode, Step> = { light: 900, dark: 100 }
    const inverseHex: Record<Mode, string> = {
        light: neutral.light[inverseSurface.light]!,
        dark: neutral.dark[inverseSurface.dark]!,
    }
    // Light mode inverts to a dark ground, so its text comes off the paper end.
    const onInverse = (
        ramp: Record<Mode, Record<Step, string>>,
        required: number,
        prefer: "quietest" | "strongest" = "quietest",
    ) => ({
        light: {
            scale: "neutral" as const,
            step: pickAgainst(ramp.light, inverseHex.light, PAPER_CANDIDATES, required, prefer),
        },
        dark: {
            scale: "neutral" as const,
            step: pickAgainst(ramp.dark, inverseHex.dark, INK_CANDIDATES, required, prefer),
        },
    })

    /**
     * The focus ring is `--primary`, which is invisible the moment the thing
     * being focused is itself `--primary` — a brand button, a brand field. That
     * shipped, and acceptance run 4 found it. Carbon's answer is two more
     * tokens, and both are neutral extremes chosen by measurement.
     */
    const ringFill: Record<Mode, string> = {
        light: ramps.primary.light[anchors.primary]!,
        dark: ramps.primary.dark[shift(anchors.primary, -DARK_LIFT)]!,
    }
    const strongestNeutralAgainst = (hex: Record<Mode, string>) => ({
        light: {
            scale: "neutral" as const,
            step: pickAgainst(
                neutral.light,
                hex.light,
                [...PAPER_CANDIDATES, ...INK_CANDIDATES],
                LC_THRESHOLD["non-text"],
                "strongest",
            ),
        },
        dark: {
            scale: "neutral" as const,
            step: pickAgainst(
                neutral.dark,
                hex.dark,
                [...PAPER_CANDIDATES, ...INK_CANDIDATES],
                LC_THRESHOLD["non-text"],
                "strongest",
            ),
        },
    })

    /**
     * Every surface a neutral wash is allowed to land on. `surface-raised` is in
     * here deliberately: a hovered menu item inside a popover is the single most
     * common place a hover state appears, so excluding the hard case would be
     * excluding the real one.
     */
    const washGrounds: Record<Mode, string[]> = ladderHex
    // Two ends, both solved: `active` takes the strongest wash the palette can
    // carry with body text still on it (solved above, because `--muted` is
    // pinned below it), `hover` the gentlest one that is still visible
    // everywhere. On a tight ramp those converge, which is the palette telling
    // you the truth rather than the tokens hiding it.
    const washHex: Record<Mode, string> = mutedHex
    const selectedHex: Record<Mode, string> = { light: ramps.primary.light[500]!, dark: ramps.primary.dark[500]! }
    const selectedAlpha: Record<Mode, number> = {
        light: maxWashAlpha(selectedHex.light, washGrounds.light, bodyInk.light, LC_THRESHOLD.body),
        dark: maxWashAlpha(selectedHex.dark, washGrounds.dark, bodyInk.dark, LC_THRESHOLD.body),
    }
    /**
     * Disabled sits between hover and pressed: more present than a transient
     * hover, because it is permanent, and never as strong as a press, which
     * would read as the control being held down rather than switched off.
     *
     * It is not solved against its own label the way the others are. That label
     * is `--foreground-tertiary`, which this system documents as exempt from
     * contrast and which WCAG 1.4.3 also exempts for inactive controls — so
     * there is no threshold to solve against without contradicting the docs.
     */
    const hoverAlpha: Record<Mode, number> = {
        light: Math.min(minVisibleAlpha(washHex.light, washGrounds.light), activeAlpha.light),
        dark: Math.min(minVisibleAlpha(washHex.dark, washGrounds.dark), activeAlpha.dark),
    }
    const disabledAlpha: Record<Mode, number> = {
        light: Math.round((hoverAlpha.light + activeAlpha.light) * 50) / 100,
        dark: Math.round((hoverAlpha.dark + activeAlpha.dark) * 50) / 100,
    }


    /**
     * `foreground-secondary` and `muted-foreground` are meant to be different
     * weights of quiet: the first is for large supporting copy and is verified
     * on every surface, the second is for small text and therefore carries MORE
     * contrast. Their thresholds and grounds differ, so usually they land apart
     * on their own — but they are free to collide, and in dark mode with the
     * four-level ladder they did, both resolving to `neutral-200`. A hierarchy
     * the docs promise and the values do not make is worse than no hierarchy,
     * so the tie is broken explicitly rather than left to arithmetic.
     */
    const inkStep: Record<Mode, Step> = { light: 950, dark: 50 }

    // The step `--primary` actually resolves to in dark — `pickFill` walks darker
    // from the lifted anchor, so the anchor is where the search *starts*, not
    // where it lands. Quoting the start put a figure in the docs that belonged to
    // `--ring`, one ramp step away.
    const primaryFillDark = pickFill(
        ramps.primary.dark,
        neutral.dark,
        shift(anchors.primary, -DARK_LIFT),
    )

    const linkStep: Record<Mode, Step> = {
        light: pickAgainst(ramps.primary.light, flatGround.light, INK_CANDIDATES, LC_THRESHOLD.body),
        dark: pickAgainst(ramps.primary.dark, flatGround.dark, PAPER_CANDIDATES, LC_THRESHOLD.body),
    }
    /**
     * Whether the link is distinguishable from body text with the colour alone —
     * measured, not asserted.
     *
     * This used to claim "sits at the same lightness as `foreground`, in both
     * modes" as a flat fact. That was true of the palette it was written against
     * and false of the next one, which is what every hand-written measurement in
     * a generated document eventually becomes. The underline requirement does
     * not depend on the answer; only the justification does, so the answer is
     * computed and the requirement stands either way.
     */
    const linkVsForeground = (() => {
        const gap = (mode: Mode) =>
            Math.abs(apca(ramps.primary[mode][linkStep[mode]]!, neutral[mode][inkStep[mode]]!))
        const light = gap("light")
        const dark = gap("dark")
        const flat = (lc: number) => lc < LC_THRESHOLD["non-text"]
        if (flat(light) && flat(dark)) {
            return "Against body text it falls below APCA's noise floor in both modes — it is separated from \`foreground\` by hue alone, so in greyscale there is no link at all."
        }
        if (flat(light) || flat(dark)) {
            const bad = flat(light) ? "light" : "dark"
            return `Against body text it measures Lc ${light.toFixed(0)} in light and Lc ${dark.toFixed(0)} in dark, so in **${bad}** mode it is separated from \`foreground\` by hue alone and disappears in greyscale.`
        }
        return `Against body text it measures Lc ${light.toFixed(0)} in light and Lc ${dark.toFixed(0)} in dark, so it is visibly distinct from \`foreground\` — but colour alone still must not be the only marker (WCAG 1.4.1).`
    })()
    const secondaryRef = {
        light: {
            scale: "neutral" as const,
            step: pickAgainst(neutral.light, hardestGround.light, INK_CANDIDATES, LC_THRESHOLD.large, "quietest", [inkStep.light]),
        },
        dark: {
            scale: "neutral" as const,
            step: pickAgainst(neutral.dark, hardestGround.dark, PAPER_CANDIDATES, LC_THRESHOLD.large, "quietest", [inkStep.dark]),
        },
    }
    const mutedForegroundRef = {
        light: {
            scale: "neutral" as const,
            step: pickAgainst(neutral.light, flatGround.light, INK_CANDIDATES, LC_THRESHOLD.body, "quietest", [inkStep.light, secondaryRef.light.step]),
        },
        dark: {
            scale: "neutral" as const,
            step: pickAgainst(neutral.dark, flatGround.dark, PAPER_CANDIDATES, LC_THRESHOLD.body, "quietest", [inkStep.dark, secondaryRef.dark.step]),
        },
    }

    /**
     * A fenced code block is `--surface-sunken`, and that choice is what makes a
     * syntax palette possible at all.
     *
     * The obvious ground was `--muted`, which is where the docs had been putting
     * code blocks. It does not work: `--muted` is a mid-grey wash, so on it the
     * body bar admits exactly one step per ramp — `950` in light, `100` in dark
     * — and six ramps all collapse onto their extremes. That is the monochrome
     * code block this set exists to fix, arrived at by a different route.
     *
     * A well is the right answer for the design reason too. Every real code
     * block moves *away* from the page rather than toward the middle of the
     * ramp, and `--surface-sunken`'s own description already named "a code
     * block's gutter". This takes one of `--muted`'s five jobs off it.
     */
    const codeGround: Record<Mode, string> = {
        light: neutral.light[surfaces.sunken.light.step]!,
        dark: neutral.dark[surfaces.sunken.dark.step]!,
    }

    /**
     * A syntax colour is body text on that ground, so it is held to the body
     * bar and takes the *quietest* step that clears it — the step that keeps the
     * most hue. Reaching for the strongest instead would give a technically
     * readable palette in which every colour is nearly black (or nearly white),
     * which is what the wrong ground produced.
     *
     * The hues are the brand's own ramps, because the system has seven seeds and
     * no licence to invent an eighth. Nothing here is a new colour; it is a job
     * given to a colour that already exists.
     *
     * The consequence is worth stating plainly rather than apologising for: at
     * Lc 75 a light-mode syntax palette is *dark* and a dark-mode one is *pale*.
     * That is the same trade GitHub's light theme makes, and it is what a code
     * sample somebody has to read actually costs.
     */
    const CODE_INK = [500, 600, 700, 800, 900, 950] as const
    const CODE_PAPER = [500, 400, 300, 200, 100, 50] as const
    const syntaxRef = (
        role: ScaleRole,
        exclude: Partial<Record<Mode, Step[]>> = {},
        required = LC_THRESHOLD.body,
    ) => ({
        light: {
            scale: role,
            step: pickAgainst(
                ramps[role].light,
                codeGround.light,
                CODE_INK,
                required,
                "quietest",
                exclude.light ?? [],
            ),
        },
        dark: {
            scale: role,
            step: pickAgainst(
                ramps[role].dark,
                codeGround.dark,
                CODE_PAPER,
                required,
                "quietest",
                exclude.dark ?? [],
            ),
        },
    })

    /**
     * The one colour in a code block allowed to recede, and the only one held to
     * the **large** bar rather than the body bar.
     *
     * That is a decision, not a slip. Every ramp here shares its lightness
     * targets, so holding the comment to the same threshold as the hues puts it
     * on the same *step* as them — identical lightness, separated from a keyword
     * by chroma alone, which on a chroma-trimmed dark ramp came to ΔE 4.7. The
     * comment was legible and indistinguishable, which is the failure acceptance
     * run 9 found. One step of recession buys real separation (ΔE 7.5 dark, 12.7
     * light) and costs contrast the large bar still covers comfortably.
     *
     * It is also what a comment *is*: an aside. A comment that reads as loudly
     * as the code stops the code being scannable. Every syntax theme in
     * existence makes this trade; this one measures it.
     *
     * It is the only quiet neutral, which is why there is no `code-punctuation`:
     * punctuation and identifiers take `--foreground`, and greying three
     * different things in one block stops it being scannable.
     */
    const codeComment = syntaxRef(
        "neutral",
        { light: [inkStep.light], dark: [inkStep.dark] },
        LC_THRESHOLD.large,
    )
    // A string and an added diff line are both "green, measured on the code
    // ground", so left alone they resolve to the same step. They appear in the
    // same view — a diff of a file containing strings — so the tie is broken
    // rather than reported: `added` takes the next step out.
    const codeString = syntaxRef("success")
    const codeAdded = syntaxRef("success", {
        light: [codeString.light.step],
        dark: [codeString.dark.step],
    })

    return [
        // ── Surfaces ────────────────────────────────────────────────────────
        {
            name: "background",
            group: "surface",
            ...surfaces.background,
            description: "The page. Every screen starts here.",
        },
        {
            name: "surface",
            group: "surface",
            ...surfaces.surface,
            description: "Cards, panels and anything sitting one level above the page.",
        },
        {
            name: "surface-raised",
            group: "surface",
            ...surfaces.raised,
            description:
                "A card that lifts off the page — draggable cards, or one card singled out for emphasis. **Always pair it with `--shadow-raised`.** In light mode this is the same fill as `surface`, because there is nothing whiter than white; the shadow is what carries the elevation there. In dark mode the surface itself lightens, because a shadow on a dark ground is nearly invisible.",
        },
        {
            name: "surface-overlay",
            group: "surface",
            ...surfaces.overlay,
            description:
                "UI floating over other UI — modals, dropdowns, popovers, and any tooltip big enough to hold a paragraph. The top of the ladder. A one-line tooltip is an `inverse` chip instead, not a surface: the rule of thumb is that anything you would put a heading or a control inside is a surface, and anything that is a single sentence of explanation is `inverse`. **Always pair it with `--shadow-overlay`.** Like `surface-raised` this equals `surface` in light mode and lightens in dark.",
        },
        {
            name: "surface-sunken",
            group: "surface",
            ...surfaces.sunken,
            description:
                "A well the content sits down into — a kanban column, an inset panel, and **every fenced code block**. Only ever on `surface` or `background`; never inside a raised or overlay surface, which reads as a hole in a floating card. In dark mode this is the same fill as `background`, so a code block on the page is carried by its border rather than its fill — give it one. The syntax palette is measured against this surface and no other.",
        },

        {
            name: "muted",
            group: "surface",
            light: { scale: "neutral", step: 500, alpha: mutedAlpha.light },
            dark: { scale: "neutral", step: 500, alpha: mutedAlpha.dark },
            description:
                "Quiet neutral fill — table headers, inactive tabs, neutral badges, inline `code`, an image placeholder. Translucent, so it reads correctly on whichever surface it lands on rather than being tuned for one of them. It is not an elevation level: for a recessed well — including a **fenced code block** — use `surface-sunken`. It is the same grey as `state-hover`, `state-active` and `state-disabled` — one wash at four strengths — so a quiet fill, a pressed row and a disabled control land close together by construction. Never let the difference between them be the only thing carrying meaning: a disabled control also takes `foreground-tertiary` and `aria-disabled`, and a pressed one is a transient response to a press you just made.",
        },

        // ── Text ────────────────────────────────────────────────────────────
        {
            name: "foreground",
            group: "text",
            ...n(950, 50),
            description: "Primary text and icons. The default ink for body copy and headings.",
        },
        {
            name: "foreground-secondary",
            group: "text",
            // Held to the large-text bar, not the body bar, which is what makes
            // it a genuinely distinct step rather than a duplicate of
            // `--foreground` or `--muted-foreground`. It reads lighter than
            // `--muted-foreground` on purpose: this is for larger supporting
            // copy, and smaller text needs MORE contrast, not less.
            // Measured against every surface including `surface-raised`, so it
            // is the supporting-text colour that works inside a dialog too.
            ...secondaryRef,
            description:
                "Supporting copy set at `body-lg` or larger — subtitles, section intros, lead paragraphs. It is verified against `surface-raised`, so it holds up on a lifted card. For anything at `body-sm` or below on a flat surface use `muted-foreground`, which carries more contrast because small text needs it. **Neither is verified on `surface-overlay`** — the top of the ladder is the lightest ground in dark mode, and both supporting colours fall under the body bar there. Inside a modal or a dropdown, set body copy in plain `foreground` and keep supporting text to `body-lg` or larger.",
        },
        {
            name: "muted-foreground",
            group: "text",
            ...mutedForegroundRef,
            description:
                "Small supporting text — captions, helper text, metadata — on `background`, `surface` or `muted`. Verified against those three only; on `surface-raised` use `foreground-secondary`.",
        },
        {
            name: "foreground-tertiary",
            group: "text",
            ...n(500, 500),
            description:
                "Deliberately faint text: placeholders, disabled labels, watermarks. NEVER body copy — it does not meet contrast for reading.",
        },

        // ── Neutral interactive states ──────────────────────────────────────
        /**
         * The four states are translucent, and all four are the *same* mid step
         * at different strengths.
         *
         * An opaque wash is only ever calibrated for one surface. The previous
         * `--state-hover` was `neutral-200`, which is a three-step grey slab on
         * `--surface` and — since `--muted` is also `neutral-200` — literally
         * invisible on a muted row. A clickable card was not buildable from this
         * system, and nothing caught it because each token measured fine against
         * the one ground it was chosen for.
         *
         * A mid-grey at low alpha solves it without a token per surface: it is
         * darker than every light surface and lighter than every dark one, so it
         * always moves *away* from whatever it lands on. That is why Carbon's
         * `$background-hover` is Gray 50 at 12% rather than a solid step.
         *
         * The cost is that these have no colour of their own, so the audit has
         * to composite them over each ground — see `composite()` in contrast.ts.
         */
        {
            name: "state-hover",
            group: "state",
            light: { scale: "neutral", step: 500, alpha: hoverAlpha.light },
            dark: { scale: "neutral", step: 500, alpha: hoverAlpha.dark },
            description:
                "Hover wash for a neutral interactive surface — menu items, table rows, ghost buttons, a clickable card. Translucent, so it works on `background`, `surface`, `surface-raised` and `muted` alike rather than being calibrated for one of them. Layer it over the surface; do not replace the surface with it.",
        },
        {
            name: "state-active",
            group: "state",
            light: { scale: "neutral", step: 500, alpha: activeAlpha.light },
            dark: { scale: "neutral", step: 500, alpha: activeAlpha.dark },
            description: `Pressed state of a neutral interactive surface. The same wash as \`state-hover\`, ${(activeAlpha.light / hoverAlpha.light).toFixed(1)}× as strong in light and ${(activeAlpha.dark / hoverAlpha.dark).toFixed(1)}× in dark — the two are solved separately against each mode's surfaces, so the ratio is not the same in both.`,
        },
        {
            name: "state-selected",
            group: "state",
            // Brand-tinted on purpose: selection should read as intent, not as a
            // stronger hover. Translucent for the same reason as the others.
            light: { scale: "primary", step: 500, alpha: selectedAlpha.light },
            dark: { scale: "primary", step: 500, alpha: selectedAlpha.dark },
            description:
                "Selected or current state — brand-tinted so selection reads as intent rather than as a heavier hover. Translucent, so a selected row keeps whatever surface it is on. **It is a hue shift, not a lightness shift** — on some palettes it measures Lc 0 against the surface, meaning it is invisible in greyscale and to a reader with a colour vision deficiency. Never let it be the only marker: pair it with a check, a leading border or `aria-selected`.",
        },
        {
            name: "state-disabled",
            group: "state",
            light: { scale: "neutral", step: 500, alpha: disabledAlpha.light },
            dark: { scale: "neutral", step: 500, alpha: disabledAlpha.dark },
            description:
                "Fill of a disabled control. Pair with `foreground-tertiary`. Translucent like the other states — an opaque disabled fill vanishes on any surface that happens to match it, which is what the old one did on `muted`.",
        },

        // ── Borders ─────────────────────────────────────────────────────────
        {
            name: "border",
            group: "border",
            // Measured against `background`, which is the harder of the two
            // grounds it sits on — it is nearer the border than `surface` is.
            // A hairline someone has to see is held to the non-text bar; if that
            // lands darker than fashion likes, override the step by hand.
            ...borderOnPage,
            description: "Default hairline between regions — card edges, dividers, table rules.",
        },
        {
            name: "border-subtle",
            group: "border",
            // Deliberately below the visibility bar: this one is allowed to be
            // barely there, because it separates things already inside a boundary.
            ...n(200, 800),
            description:
                "Barely-there separator inside an already-bounded area. Deliberately below the visible-boundary threshold — never use it as the only thing dividing two regions.",
        },
        {
            name: "border-strong",
            group: "border",
            light: { scale: "neutral", step: shift(borderOnPage.light.step, 1) },
            dark: { scale: "neutral", step: shift(borderOnPage.dark.step, -1) },
            description: "Emphasised border — hovered fields, pulled-out quotes.",
        },
        {
            name: "input",
            group: "border",
            ...borderOnPage,
            description: "Border of a form control at rest.",
        },
        {
            name: "ring",
            group: "border",
            light: { scale: "primary", step: anchors.primary },
            dark: { scale: "primary", step: shift(anchors.primary, -DARK_LIFT) },
            description:
                "Focus ring on a neutral ground — a page, a card, an input. On a `primary` or otherwise coloured fill it disappears into its own background: use `ring-inverse` there.",
        },
        {
            name: "ring-inverse",
            group: "border",
            // Measured against `inverse`, not against the brand fill. Those are
            // the same polarity in each mode — a bold fill and an inverted
            // region are both "the opposite of the page" — so one token serves
            // both, and measuring against the fill instead put this at Lc 0 on
            // `inverse` in dark mode, which the audit caught.
            ...onInverse(neutral, LC_THRESHOLD["non-text"], "strongest"),
            description:
                "Focus ring for a control sitting on a coloured or inverted ground — a button already filled with `primary`, anything on `inverse`. The neutral extreme for the mode, so it reads against a brand colour rather than blending into it.",
        },
        {
            name: "ring-inset",
            group: "border",
            // The companion, not an alternative: it has to contrast with `ring`
            // itself, because the two are drawn as concentric hairlines.
            ...strongestNeutralAgainst(ringFill),
            description:
                "Drawn immediately inside `ring` as a second hairline, so a focus indicator survives on a ground the system cannot predict — one of the two always contrasts. Not a substitute for `ring`.",
        },

        // ── Links ───────────────────────────────────────────────────────────
        /**
         * A link is body text, so it is held to the body bar against the
         * hardest flat surface — not to `--primary`, which is a *fill* colour
         * and measured only as a background. Pointing a link at `--primary` is
         * the single most tempting substitution in this system and it fails:
         * on Hendri's palette it lands at Lc −28.7 in dark mode, which is
         * unreadable. That trap was documented for two sessions; this is the
         * token that removes it.
         */
        {
            name: "link",
            group: "link",
            light: {
                scale: "primary",
                step: pickAgainst(ramps.primary.light, flatGround.light, INK_CANDIDATES, LC_THRESHOLD.body),
            },
            dark: {
                scale: "primary",
                step: pickAgainst(ramps.primary.dark, flatGround.dark, PAPER_CANDIDATES, LC_THRESHOLD.body),
            },
            description:
                `Links in running text, on \`background\`, \`surface\` or \`muted\` — and **not verified on \`surface-overlay\`**, where in dark mode it falls under the body bar exactly as the two supporting text colours do. A link inside a modal is an ordinary thing to want and this system has no compliant colour for it: set it at \`body-lg\` or larger, or put the link outside the dialog. **Underline them** — see the polish rules. ${linkVsForeground} Never use \`primary\` for a link: it is a fill colour, and on this palette it measures Lc ${Math.abs(apca(ramps.primary.light[anchors.primary]!, neutral.light[surfaces.background.light.step]!)).toFixed(0)} as text on the page in light and Lc ${Math.abs(apca(ramps.primary.dark[primaryFillDark]!, neutral.dark[surfaces.background.dark.step]!)).toFixed(0)} in dark, against a body bar of ${LC_THRESHOLD.body}.`,
        },
        {
            name: "link-hover",
            group: "link",
            // Toward the ink/paper end: a hovered link gains contrast rather
            // than losing it, the same rule the fills follow.
            light: {
                scale: "primary",
                step: shift(linkStep.light, 1),
            },
            dark: {
                scale: "primary",
                step: shift(linkStep.dark, -1),
            },
            description: "Hover state of a link in running text.",
        },
        {
            name: "link-inverse",
            group: "link",
            light: {
                scale: "primary",
                step: pickAgainst(ramps.primary.light, inverseHex.light, PAPER_CANDIDATES, LC_THRESHOLD.body),
            },
            dark: {
                scale: "primary",
                step: pickAgainst(ramps.primary.dark, inverseHex.dark, INK_CANDIDATES, LC_THRESHOLD.body),
            },
            description:
                "A link inside an `inverse` region. `link` is measured against the page and goes unreadable there, which is why this exists as its own token.",
        },

        // ── Inverse region ──────────────────────────────────────────────────
        {
            name: "inverse",
            group: "inverse",
            light: { scale: "neutral", step: inverseSurface.light },
            dark: { scale: "neutral", step: inverseSurface.dark },
            description:
                "A region deliberately inverted against the current mode — tooltips, dark chips, a footer band. On a light page this is dark; on a dark page it is light. Everything placed on it takes an `inverse-*` or `-inverse` token.",
        },
        {
            name: "inverse-foreground",
            group: "inverse",
            ...onInverse(neutral, LC_THRESHOLD.body),
            description: "Text and icons on `inverse`.",
        },
        {
            name: "inverse-muted-foreground",
            group: "inverse",
            // Held to the large bar and forbidden from taking `inverse-foreground`'s
            // step, so a footer has two genuinely different levels rather than one
            // colour used twice. A footer is a sanctioned `inverse` region and had
            // a single text colour for headings, links, blurb and fine print.
            light: {
                scale: "neutral",
                step: pickAgainst(neutral.light, inverseHex.light, PAPER_CANDIDATES, LC_THRESHOLD.large, "quietest", [
                    onInverse(neutral, LC_THRESHOLD.body).light.step,
                ]),
            },
            dark: {
                scale: "neutral",
                step: pickAgainst(neutral.dark, inverseHex.dark, INK_CANDIDATES, LC_THRESHOLD.large, "quietest", [
                    onInverse(neutral, LC_THRESHOLD.body).dark.step,
                ]),
            },
            description:
                "Supporting text inside an `inverse` region — a footer's blurb, the label above a link column. Held to the **large-text bar**, so keep it at `body-lg` or larger. It cannot carry fine print: small print on an inverse band takes `inverse-foreground`, which clears the body bar, and accepts that fine print there is not quiet.",
        },
        {
            name: "inverse-border",
            group: "inverse",
            ...onInverse(neutral, LC_THRESHOLD["non-text"]),
            description: "Hairline or divider inside an `inverse` region.",
        },

        // ── Scrim and skeleton ──────────────────────────────────────────────
        {
            name: "scrim",
            group: "surface",
            // Cannot alias a primitive — `var(--neutral-950)` carries no
            // opacity — so it emits a literal. See DECISIONS #24.
            light: { scale: "neutral", step: 950, alpha: 0.6 },
            dark: { scale: "neutral", step: 950, alpha: 0.7 },
            description:
                "The backdrop behind a modal or drawer. Translucent on purpose, so the page stays legible underneath. Dark mode carries more of it, because a dim scrim over an already-dark page does not read as a layer.",
        },
        {
            name: "skeleton-surface",
            group: "surface",
            ...n(200, 800),
            description: "The container of a loading placeholder — the card shape that holds the blocks.",
        },
        {
            name: "skeleton",
            group: "surface",
            // Measured against `skeleton-surface`, not the page: a skeleton
            // block sits inside its own container, and picking against the page
            // is how the blocks end up invisible in the only place they appear.
            light: {
                scale: "neutral",
                step: pickAgainst(neutral.light, neutral.light[200]!, [300, 400, 500], LC_THRESHOLD["non-text"]),
            },
            dark: {
                scale: "neutral",
                step: pickAgainst(neutral.dark, neutral.dark[800]!, [700, 600, 500], LC_THRESHOLD["non-text"]),
            },
            description:
                "The blocks standing in for text and UI while content loads. Put them on `skeleton-surface`. Never animate them with `opacity` — use a background-position sweep, so the contrast the audit measured is the contrast that ships.",
        },

        // ── Code and syntax ─────────────────────────────────────────────────
        /**
         * A design system whose own documentation is a code-heavy site could not
         * colour a code sample. There was nothing for keywords, strings or
         * comments, and the obvious workaround was closed off by design: the
         * solid `--<status>` tokens are forbidden as text on a page background,
         * so `--success` could not stand in for a string literal.
         *
         * Eight tokens, one job each, every one measured against the ground a
         * fenced block actually presents. Deliberately not Carbon's ~90
         * `$syntax-*`: this is the set a Markdown-driven site needs, and a
         * grammar-complete palette would be a second vocabulary to maintain.
         */
        {
            name: "code-keyword",
            group: "code",
            ...syntaxRef("primary"),
            description:
                "Keywords and operators in a code sample — `const`, `return`, `=>`, `@media`. Brand-hued on purpose: the keyword is the most frequent coloured token in a block, so it is the one that makes the sample look like it belongs to this system. **Function and class names are not coloured** — they take `--foreground` with every other identifier. A fifth hue was tried and withdrawn: this system's ramps share their lightness targets, so a fifth colour is separated from the other four by chroma alone, and in dark mode that came to nothing.",
        },
        {
            name: "code-string",
            group: "code",
            ...codeString,
            description: "String and character literals, and the quoted value of an HTML attribute.",
        },
        {
            name: "code-number",
            group: "code",
            ...syntaxRef("secondary"),
            description:
                "Numeric literals, plus the language's other bare constants — `true`, `null`, a CSS length. Anything a reader scans for a *value* rather than a name.",
        },
        {
            name: "code-comment",
            group: "code",
            ...codeComment,
            description:
                "Comments — the one colour in a code block held to the **large-text bar**, so it recedes. Never `--foreground-tertiary`. Punctuation and identifiers keep `--foreground`; there is no `code-punctuation`.",
        },
        {
            name: "code-added",
            group: "code",
            ...codeAdded,
            description:
                "An added line in a diff, and its `+` marker. Where the ramp has room it takes a step beyond `code-string`, so a green literal inside a green line stays distinguishable; where it does not, the two share a value and the collision table below says so. It is a **text** colour — a line tint is `--success-subtle`, which is measured as a fill.",
        },
        {
            name: "code-removed",
            group: "code",
            ...syntaxRef("danger"),
            description:
                "A removed line in a diff, and its `-` marker. Pair with `--danger-subtle` if the line needs a tint as well. Never use `--danger` itself — it is a fill colour and is not measured as text.",
        },

        // ── Chart series ────────────────────────────────────────────────────
        ...chartTokens(ramps, anchors.primary, {
            light: [ladderHex.light[1]!, ladderHex.light[2]!],
            dark: [ladderHex.dark[1]!, ladderHex.dark[2]!],
        }),

        ...scaleTokens(),

        // ── Brand + status ──────────────────────────────────────────────────
        ...actionTokens("primary", anchors.primary, ramps, subtleFor("primary")),
        ...actionTokens("secondary", anchors.secondary, ramps, subtleFor("secondary")),
        ...statusTokens("success", anchors.success, ramps, subtleFor("success")),
        ...statusTokens("warning", anchors.warning, ramps, subtleFor("warning")),
        ...statusTokens("danger", anchors.danger, ramps, subtleFor("danger")),
        ...statusTokens("info", anchors.info, ramps, subtleFor("info")),
    ]
}
