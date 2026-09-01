import { describe, expect, it } from "vitest"
import { hendriPreset } from "../presets/hendri"
import { apca, LC_THRESHOLD, wcag } from "./contrast"
import { resolveTokens } from "./resolve"

describe("apca", () => {
    it("is polarity-aware", () => {
        expect(apca("#000000", "#ffffff")).toBeGreaterThan(100) // dark on light
        expect(apca("#ffffff", "#000000")).toBeLessThan(-100) // light on dark
    })

    it("agrees with WCAG at the extremes", () => {
        expect(wcag("#000000", "#ffffff")).toBeCloseTo(21, 1)
        expect(wcag("#777777", "#777777")).toBeCloseTo(1, 1)
    })

    it("catches the dark-mode false pass WCAG 2 lets through", () => {
        // Mid grey on black: WCAG 2 calls this 6.9:1 — comfortably AA for body
        // text — while APCA puts it at Lc 45, nowhere near the 75 body needs.
        // APCA is right, and this is exactly the pairing a dark theme invites.
        const fg = "#949494"
        const bg = "#000000"
        expect(wcag(fg, bg)).toBeGreaterThan(4.5)
        expect(Math.abs(apca(fg, bg))).toBeLessThan(LC_THRESHOLD.body)
    })
})

describe("validateContrast on the shipped preset", () => {
    const resolved = resolveTokens(hendriPreset)
    const contrast = resolved.warnings.filter((w) => w.kind === "contrast")

    it("offers a concrete fix for every failure it reports", () => {
        for (const warning of contrast.filter((w) => w.level === "fail")) {
            expect(warning.fix, warning.message).toBeDefined()
            expect(warning.fix!.ref.step).toBeGreaterThan(0)
        }
    })

    it("reports both APCA and WCAG numbers", () => {
        for (const warning of contrast) {
            expect(warning.apcaLc).toBeTypeOf("number")
            expect(warning.wcagRatio).toBeTypeOf("number")
        }
    })

    it("holds body text on both surfaces in both modes", () => {
        const bodyFailures = contrast.filter(
            (w) => w.level === "fail" && w.tokens?.[0] === "foreground",
        )
        expect(bodyFailures).toEqual([])
    })
})
