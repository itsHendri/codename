/** How a colour is picked against another: the measuring helpers the semantic mapping decides with. Split out of semantics.ts. */

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


export const idx = (step: Step): number => STEPS.indexOf(step)
export const at = (i: number): Step => STEPS[Math.max(0, Math.min(STEPS.length - 1, i))]!

/** Move n positions darker (positive) or lighter (negative). */
export const shift = (step: Step, n: number): Step => at(idx(step) + n)

/** In dark mode a brand fill moves two steps lighter; the dark ramp already cut its chroma. */
export const DARK_LIFT = 2

export type Ramps = Record<ScaleRole, Record<Mode, Record<Step, string>>>

/** Generate every ramp as hex, so the mapping can measure contrast while it decides. */
export function buildRamps(scales: ScaleConfig[]): Ramps {
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
export function pickAgainst(
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

export const INK_CANDIDATES = [950, 900, 800, 700, 600] as const
export const PAPER_CANDIDATES = [50, 100, 200, 300] as const

/**
 * Text on a solid fill is drawn from the NEUTRAL ramp, not the fill's own.
 * A brand ramp's lightest step is a tint, not white — on a mid-lightness fill
 * neither end of it clears the bar, while real systems just put white or
 * near-black on the button. Which of the two wins is decided by measurement,
 * so an amber fill gets dark text and an indigo one gets light text without
 * anybody hand-picking either.
 */
export function onFill(neutralRamp: Record<Step, string>, fillHex: string): { scale: ScaleRole; step: Step } {
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
export function pickFill(
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
export const WASH_ALPHAS: readonly number[] = [0.28, 0.24, 0.2, 0.18, 0.16, 0.14, 0.12, 0.1, 0.08, 0.06]

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
export function belowActive(alpha: number, activeAlpha: number): number {
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
export function maxWashAlpha(
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

export function minVisibleAlpha(washHex: string, groundHexes: string[], minShift = MIN_WASH_SHIFT): number {
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
export function pickSubtle(
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
export function interactionDirection(neutralRamp: Record<Step, string>, foregroundStep: Step, fillHex: string): 1 | -1 {
    const labelIsLight = apca(neutralRamp[foregroundStep]!, fillHex) < 0
    return labelIsLight ? 1 : -1
}

/** The steps a `-border` may take: away from the `-subtle` fill it outlines. */
export const borderCandidates = (subtle: Step, mode: Mode): Step[] =>
    mode === "light"
        ? STEPS.slice(idx(subtle) + 1, idx(subtle) + 5)
        : STEPS.slice(Math.max(0, idx(subtle) - 4), idx(subtle)).reverse()

