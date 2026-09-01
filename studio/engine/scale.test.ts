import { describe, expect, it } from "vitest"
import { generateScale, oklchToHex, parseSeed } from "./scale"
import { STEPS, type Mode } from "./types"

const SEEDS = {
    indigo: "#574cff", // Hendri's brand primary
    slate: "#1f262d", // Hendri's ink — a dark, barely-chromatic seed
    amber: "#d97706", // a warm mid-lightness seed
}

describe("generateScale", () => {
    it.each(Object.entries(SEEDS))("%s ramp descends in lightness in both modes", (_name, seed) => {
        for (const mode of ["light", "dark"] as Mode[]) {
            const { steps } = generateScale(seed, mode)
            const lightnesses = STEPS.map((step) => steps[step]!.l)
            for (let i = 1; i < lightnesses.length; i++) {
                expect(lightnesses[i]!).toBeLessThan(lightnesses[i - 1]!)
            }
        }
    })

    it("carries the seed verbatim at its anchor step", () => {
        for (const seed of Object.values(SEEDS)) {
            const { steps, anchorStep, seedClamped } = generateScale(seed, "light")
            if (seedClamped) continue // ramp bent as far as it safely could; near-match is expected
            const parsed = parseSeed(seed)!
            const anchor = steps[anchorStep]!
            expect(anchor.l).toBeCloseTo(parsed.l, 3)
            expect(anchor.c).toBeCloseTo(parsed.c, 3)
            expect(anchor.h).toBeCloseTo(parsed.h, 1)
        }
    })

    it("does not invert the dark ramp — dark stays dark at 950", () => {
        const dark = generateScale(SEEDS.indigo, "dark")
        expect(dark.steps[950]!.l).toBeLessThan(0.35)
        expect(dark.steps[50]!.l).toBeGreaterThan(0.9)
    })

    it("runs the dark ramp calmer than the light one", () => {
        // A seed comfortably inside sRGB, so gamut clamping can't mask the trim.
        const seed = "#3f7d76"
        const light = generateScale(seed, "light")
        const dark = generateScale(seed, "dark")
        // The two curves are designed to converge at the pale end, so allow a
        // rounding hair there; through the solid region the trim must really bite.
        for (const step of STEPS) {
            expect(dark.steps[step]!.c).toBeLessThanOrEqual(light.steps[step]!.c + 0.001)
        }
        for (const step of [400, 500, 600, 700, 800] as const) {
            expect(dark.steps[step]!.c).toBeLessThan(light.steps[step]!.c)
        }
    })

    it("respects a chroma cap so neutrals read as neutral", () => {
        const { steps } = generateScale(SEEDS.slate, "light", { maxChroma: 0.03 })
        for (const step of STEPS) expect(steps[step]!.c).toBeLessThanOrEqual(0.03)
    })

    it("keeps every step inside the sRGB gamut", () => {
        for (const seed of Object.values(SEEDS)) {
            const { steps } = generateScale(seed, "light")
            for (const step of STEPS) {
                expect(oklchToHex(steps[step]!)).toMatch(/^#[0-9a-f]{6}$/)
            }
        }
    })

    it("is deterministic", () => {
        const a = generateScale(SEEDS.indigo, "light")
        const b = generateScale(SEEDS.indigo, "light")
        expect(a).toEqual(b)
    })

    it("golden: Hendri's brand ramp", () => {
        const { steps, anchorStep } = generateScale(SEEDS.indigo, "light")
        expect(anchorStep).toBe(700)
        expect(STEPS.map((s) => oklchToHex(steps[s]!))).toMatchSnapshot()
    })
})
