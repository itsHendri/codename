/**
 * Seed colour → an 11-step (50…950) OKLCH ramp, per mode.
 *
 * Method (see DECISIONS #2):
 *  - Fixed lightness targets SHARED ACROSS ALL HUES, so every scale in the system
 *    feels like one family and cross-hue swaps keep their contrast behaviour.
 *  - A chroma bell peaking mid-scale, tapering at both ends so the extremes read as
 *    tinted paper / tinted ink rather than washed pastel or muddy sludge.
 *  - A small hue rotation across the ramp, centred on the anchor (0° drift there).
 *  - Gamut clamping per step.
 *  - "Seed warping": the ramp bends so the seed colour appears VERBATIM at its
 *    nearest step. You type #574cff, you get #574cff — not a near-miss.
 *
 * The dark ramp is generated from its own lightness/chroma targets, never by
 * inverting the light ramp (dark backgrounds amplify chroma; inversion goes neon).
 */

import { clampChroma, converter, formatHex, parse } from "culori"
import { STEPS, type Mode, type Oklch, type ScaleTuning, type Step } from "./types"

const toOklch = converter("oklch")

/** Lightness targets. Index-aligned with STEPS. */
const L_TARGETS: Record<Mode, number[]> = {
    // 50 stops short of pure white: a card has to read as a surface, not a hole.
    light: [0.98, 0.955, 0.912, 0.86, 0.788, 0.706, 0.617, 0.532, 0.451, 0.379, 0.276],
    // Dark floors at ~0.245 rather than near-black — pure black grounds cause
    // halation, and the darkest step still has to read as a surface, not a void.
    dark: [0.972, 0.938, 0.885, 0.822, 0.748, 0.668, 0.585, 0.499, 0.408, 0.325, 0.245],
}

/** Chroma bell, as a fraction of the scale's base chroma. Index-aligned with STEPS. */
const C_CURVE: Record<Mode, number[]> = {
    light: [0.09, 0.16, 0.32, 0.52, 0.76, 0.95, 1.0, 0.95, 0.78, 0.6, 0.4],
    dark: [0.1, 0.18, 0.34, 0.52, 0.72, 0.86, 0.92, 0.88, 0.74, 0.58, 0.4],
}

/**
 * Global chroma trim for the dark ramp. Identical chroma reads louder on a dark
 * ground, so the whole dark family sits a notch calmer than its light twin.
 */
const DARK_CHROMA_TRIM = 0.9

const DEFAULT_HUE_SHIFT = 3 // degrees at each end of the ramp

export interface GeneratedScale {
    steps: Record<Step, Oklch>
    anchorStep: Step
    /** True when the seed's lightness sat too far from any step target to land verbatim. */
    seedClamped: boolean
}

export function parseSeed(seed: string): Oklch | null {
    const parsed = parse(seed)
    if (!parsed) return null
    const c = toOklch(parsed)
    if (!c) return null
    return { l: c.l ?? 0, c: c.c ?? 0, h: c.h ?? 0 }
}

/** Index in STEPS whose lightness target is nearest the seed. */
function anchorIndex(seedL: number, targets: number[]): number {
    let best = 0
    let bestDist = Infinity
    targets.forEach((t, i) => {
        const d = Math.abs(t - seedL)
        if (d < bestDist) {
            bestDist = d
            best = i
        }
    })
    return best
}

/**
 * Bend the lightness curve so the anchor step lands exactly on the seed's L.
 * The correction decays to zero within `reach` steps so the ramp stays monotonic,
 * and is clamped to half the gap to the neighbouring target so ordering can't invert.
 */
function warpLightness(
    targets: number[],
    anchorIdx: number,
    seedL: number,
): { values: number[]; clamped: boolean } {
    const anchorL = targets[anchorIdx]!
    const prev = targets[anchorIdx - 1]
    const next = targets[anchorIdx + 1]
    // Targets descend, so the "up" neighbour is the previous index.
    const headroomUp = prev !== undefined ? (prev - anchorL) / 2 : 0.05
    const headroomDown = next !== undefined ? (anchorL - next) / 2 : 0.05

    const wanted = seedL - anchorL
    const delta = Math.max(-headroomDown, Math.min(headroomUp, wanted))
    const clamped = Math.abs(delta - wanted) > 1e-6

    const reach = 3
    const values = targets.map((t, i) => {
        const dist = Math.abs(i - anchorIdx)
        if (dist > reach) return t
        const falloff = 1 - dist / (reach + 1)
        return t + delta * falloff
    })
    return { values, clamped }
}

export function generateScale(seed: string, mode: Mode, tuning: ScaleTuning = {}): GeneratedScale {
    const parsed = parseSeed(seed)
    const seedColor: Oklch = parsed ?? { l: 0.5, c: 0, h: 0 }

    const lTargets = L_TARGETS[mode]
    const cCurve = C_CURVE[mode]

    // The anchor is always solved against the LIGHT targets: it is the seed's
    // identity in the system, and both ramps must agree on where that sits.
    // Solving it per-mode makes the dark ramp louder than the light one — the
    // exact opposite of what dark mode needs.
    const anchorIdx = anchorIndex(seedColor.l, L_TARGETS.light)

    // The light ramp carries the seed verbatim; the dark ramp is its own tuned
    // curve that only inherits hue + chroma identity.
    const { values: lightness, clamped } =
        mode === "light"
            ? warpLightness(lTargets, anchorIdx, seedColor.l)
            : { values: lTargets, clamped: false }

    // Solve base chroma against the light bell so the seed reproduces exactly there.
    const anchorCurve = C_CURVE.light[anchorIdx] || 1
    const trim = mode === "dark" ? DARK_CHROMA_TRIM : 1
    const baseChroma = (seedColor.c / anchorCurve) * (tuning.chromaScale ?? 1) * trim
    const maxChroma = tuning.maxChroma ?? 0.4
    const hueShift = tuning.hueShift ?? DEFAULT_HUE_SHIFT
    const lastIdx = STEPS.length - 1

    const steps = {} as Record<Step, Oklch>
    STEPS.forEach((step, i) => {
        const l = lightness[i]!
        const c = Math.min(baseChroma * cCurve[i]!, maxChroma)
        // Rotation centred on the anchor so the seed's hue is untouched there.
        const h = seedColor.h + (hueShift * 2 * (anchorIdx - i)) / lastIdx

        const clampedColor = clampChroma({ mode: "oklch", l, c, h: normalizeHue(h) }, "oklch", "rgb")
        steps[step] = {
            l: round(clampedColor.l ?? l, 4),
            c: round(clampedColor.c ?? c, 4),
            h: round(clampedColor.h ?? h, 2),
        }
    })

    return { steps, anchorStep: STEPS[anchorIdx]!, seedClamped: clamped }
}

export function normalizeHue(h: number): number {
    const x = h % 360
    return x < 0 ? x + 360 : x
}

function round(n: number, places: number): number {
    const f = 10 ** places
    return Math.round(n * f) / f
}

export function oklchToCss({ l, c, h }: Oklch, alpha?: number): string {
    const base = `${round(l * 100, 2)}% ${round(c, 4)} ${round(h, 2)}`
    return alpha === undefined ? `oklch(${base})` : `oklch(${base} / ${round(alpha, 3)})`
}

export function oklchToHex(color: Oklch): string {
    return formatHex({ mode: "oklch", ...color }) ?? "#000000"
}
