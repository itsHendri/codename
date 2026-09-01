import { describe, expect, it } from "vitest"
import { hendriPreset } from "../presets/hendri"
import { resolveTokens } from "./resolve"
import { migrateConfig } from "./schema"
import { defaultSemanticMapping, semanticDefs } from "./semantics"
import type { SemanticTokenDef } from "./types"

describe("migrateConfig", () => {
    it("fills a block the saved file predates, instead of crashing on it", () => {
        // The exact failure that adding `layout` caused: every brand written
        // before it existed threw on first render reading config.layout.breakpoints.
        const old = structuredClone(hendriPreset) as Partial<typeof hendriPreset>
        delete old.layout

        const { config, filled } = migrateConfig(old, hendriPreset)
        expect(filled).toEqual(["layout"])
        expect(config.layout.breakpoints.length).toBeGreaterThan(0)
        expect(() => resolveTokens(config)).not.toThrow()
    })

    it("does not touch a block the file already has", () => {
        const saved = structuredClone(hendriPreset)
        saved.radius.basePx = 0
        saved.meta.name = "Client"

        const { config, filled } = migrateConfig(saved, hendriPreset)
        expect(filled).toEqual([])
        expect(config.radius.basePx).toBe(0)
        expect(config.meta.name).toBe("Client")
    })

    it("falls back completely when the file is not an object", () => {
        expect(migrateConfig(null, hendriPreset).config).toEqual(hendriPreset)
        expect(migrateConfig("nonsense", hendriPreset).filled).toEqual(["everything"])
    })

    it("survives a file missing everything but one block", () => {
        const { config, filled } = migrateConfig({ meta: hendriPreset.meta }, hendriPreset)
        expect(filled).not.toContain("meta")
        expect(filled.length).toBeGreaterThan(5)
        expect(() => resolveTokens(config)).not.toThrow()
    })

    it("fills a KEY a block gained, not just a whole missing block", () => {
        // Three times now: `layout` arriving absent, `shadows` changing shape,
        // and `layout` gaining `zLayers`/`shell`. Each time the block was
        // present so it was taken wholesale, the new field came back undefined,
        // and the failure was a crash at first render with nothing pointing at
        // the cause.
        const old = structuredClone(hendriPreset) as { layout: Partial<typeof hendriPreset.layout> }
        delete old.layout.zLayers
        delete old.layout.shell

        const { config, filled } = migrateConfig(old, hendriPreset)
        expect(config.layout.zLayers.length).toBeGreaterThan(0)
        expect(config.layout.shell.length).toBeGreaterThan(0)
        // And it says so rather than filling in silence.
        expect(filled.some((entry) => entry.includes("zLayers"))).toBe(true)
        expect(() => resolveTokens(config)).not.toThrow()
    })

    it("keeps the file's own version of a named item and appends the ones it lacks", () => {
        // The fourth instance of the same bug, and the deepest: `layout.containers`
        // gained an item — `intro` — and every existing brand's four-item array
        // replaced the five-item default, so a token the docs described did not
        // exist and `var(--container-intro)` silently resolved to nothing.
        const saved = structuredClone(hendriPreset)
        saved.layout.containers = [{ name: "prose", maxRem: 10, note: "mine" }]

        const { config, filled } = migrateConfig(saved, hendriPreset)
        // The hand-edited one survives, untouched…
        expect(config.layout.containers.find((c) => c.name === "prose")).toEqual({
            name: "prose",
            maxRem: 10,
            note: "mine",
        })
        // …and every default the file lacked is back.
        for (const fallback of hendriPreset.layout.containers) {
            expect(
                config.layout.containers.some((c) => c.name === fallback.name),
                `--container-${fallback.name} went missing`,
            ).toBe(true)
        }
        expect(filled.some((entry) => entry.includes("containers"))).toBe(true)
    })

    it("restores a missing item in every named collection, not just containers", () => {
        const saved = structuredClone(hendriPreset)
        saved.layout.breakpoints = saved.layout.breakpoints.slice(0, 1)
        saved.layout.zLayers = []
        saved.typography.roles = saved.typography.roles.slice(0, 2)

        const { config } = migrateConfig(saved, hendriPreset)
        expect(config.layout.breakpoints.length).toBe(hendriPreset.layout.breakpoints.length)
        expect(config.layout.zLayers.length).toBe(hendriPreset.layout.zLayers.length)
        expect(config.typography.roles.length).toBe(hendriPreset.typography.roles.length)
    })

    it("drops a shadow level whose name the system no longer knows", () => {
        // A renamed level kept its old name AND lost its dark-mode override,
        // because DARK_SHADOWS is keyed by name and had no entry for it.
        const saved = structuredClone(hendriPreset)
        saved.shadows = { levels: [{ name: "lg" as never, layers: ["0 0 0 1px red"] }] }

        const { config } = migrateConfig(saved, hendriPreset)
        expect(config.shadows.levels.map((level) => level.name)).toEqual(["sm", "raised", "overlay"])
        const resolved = resolveTokens(config)
        const shadowNames = (mode: "light" | "dark") =>
            resolved.declarations[mode].filter(([n]) => n.startsWith("--shadow-")).map(([n]) => n).sort()
        expect(shadowNames("dark")).toEqual(shadowNames("light"))
    })

    // ── The pre-override format ─────────────────────────────────────────────
    // Files written before the semantic set stopped being persisted still store
    // all 57 resolved tokens. They have to keep working, and a hand edit inside
    // one has to survive the conversion.

    const asOldFormat = (semantics: SemanticTokenDef[]) => ({
        ...structuredClone(hendriPreset),
        color: { scales: hendriPreset.color.scales, semantics },
    })

    it("converts an untouched pre-override file into no overrides at all", () => {
        const stored = defaultSemanticMapping(hendriPreset.color.scales)

        const { config, inferredOverrides } = migrateConfig(asOldFormat(stored), hendriPreset)
        expect(inferredOverrides).toEqual([])
        expect(config.color.semanticOverrides).toEqual([])
    })

    it("keeps a hand edit found inside a pre-override file", () => {
        const stored = defaultSemanticMapping(hendriPreset.color.scales)
        const ring = stored.find((token) => token.name === "ring")!
        ring.light = { scale: "danger", step: 600 }

        const { config, inferredOverrides } = migrateConfig(asOldFormat(stored), hendriPreset)
        expect(inferredOverrides).toEqual(["ring"])
        expect(config.color.semanticOverrides).toEqual([
            { name: "ring", light: { scale: "danger", step: 600 } },
        ])
        // …and only that mode. Dark still tracks the generator.
        expect(config.color.semanticOverrides[0]!.dark).toBeUndefined()
    })
})

describe("semanticDefs", () => {
    const { scales } = hendriPreset.color

    it("regenerates from the seeds when nothing is overridden", () => {
        const { defs, orphaned } = semanticDefs(scales, [])
        expect(orphaned).toEqual([])
        expect(defs.map((def) => def.name)).toEqual(defaultSemanticMapping(scales).map((def) => def.name))
        expect(defs.every((def) => !def.overridden.light && !def.overridden.dark)).toBe(true)
    })

    it("applies an override to one mode and leaves the other generated", () => {
        const generated = defaultSemanticMapping(scales).find((def) => def.name === "ring")!
        const { defs } = semanticDefs(scales, [{ name: "ring", light: { scale: "danger", step: 600 } }])
        const ring = defs.find((def) => def.name === "ring")!

        expect(ring.light).toEqual({ scale: "danger", step: 600 })
        expect(ring.dark).toEqual(generated.dark)
        expect(ring.overridden).toEqual({ light: true, dark: false })
    })

    it("keeps the generated description — an override moves a ref, not the docs", () => {
        const generated = defaultSemanticMapping(scales).find((def) => def.name === "primary")!
        const { defs } = semanticDefs(scales, [{ name: "primary", light: { scale: "neutral", step: 950 } }])
        const primary = defs.find((def) => def.name === "primary")!

        expect(primary.description).toBe(generated.description)
        expect(primary.group).toBe(generated.group)
    })

    it("reports an override for a token that no longer exists rather than dropping it", () => {
        const { defs, orphaned } = semanticDefs(scales, [
            { name: "token-that-was-renamed", light: { scale: "primary", step: 500 } },
        ])
        expect(orphaned).toEqual(["token-that-was-renamed"])
        expect(defs.find((def) => def.name === "token-that-was-renamed")).toBeUndefined()
    })

    it("is why an improved default reaches a brand that already exists", () => {
        // The bug this format change fixes, stated as a test: a brand carrying
        // one hand edit still tracks the generator for all 56 other tokens.
        const overrides = [{ name: "ring", light: { scale: "danger" as const, step: 600 as const } }]
        const { defs } = semanticDefs(scales, overrides)
        const generated = defaultSemanticMapping(scales)

        const tracking = defs.filter((def) => {
            const match = generated.find((g) => g.name === def.name)!
            return JSON.stringify(def.light) === JSON.stringify(match.light)
        })
        expect(tracking.length).toBe(generated.length - 1)
    })
})
