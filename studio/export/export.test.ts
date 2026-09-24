import { describe, expect, it } from "vitest"
import { resolveTokens } from "../engine/resolve"
import { hendriPreset } from "../presets/hendri"
import { buildExport, exportAsMap, referencedAssets } from "./bundle"
import { DESIGN_MD_SECTIONS, toDesignMd } from "./designMd"

const resolved = resolveTokens(hendriPreset)
const files = buildExport(resolved)
const fileAt = (suffix: string) => files.find((f) => f.path.endsWith(suffix))!.content

describe("the export bundle", () => {
    it("is the agent file, the stylesheet and the token file, nothing else", () => {
        expect(files.map((f) => f.path)).toEqual(["DESIGN.md", "tokens.css", "tokens.json"])
        expect(Object.keys(exportAsMap(files))).toEqual(["DESIGN.md", "tokens.css", "tokens.json"])
    })

    it("names the assets the config references", () => {
        expect(Array.isArray(referencedAssets(resolved))).toBe(true)
    })
})

describe("tokens.css", () => {
    const css = fileAt("tokens.css")

    it("emits both modes and never leaks a raw colour into a semantic", () => {
        expect(css).toContain(":root,")
        expect(css).toContain('[data-theme="dark"] {')
        expect(css).toMatch(/--primary: var\(--primary-\d+\);/)
    })

    it("defines light explicitly, so getting back from dark isn't luck", () => {
        expect(css).toContain('[data-theme="light"] {')
    })

    it("does not ship a media query while the docs promise an attribute", () => {
        expect(css).not.toContain("prefers-color-scheme")
    })

    it("forwards tokens into a Tailwind v4 theme block", () => {
        expect(css).toContain("@theme inline {")
        expect(css).toContain("--color-background: var(--background);")
        expect(css).toContain("--radius-md:")
        expect(css).toContain("--container-prose: var(--container-prose);")
    })

    it("gives Tailwind literal breakpoints, because var() dies in a media query", () => {
        const theme = css.slice(css.indexOf("@theme inline"))
        expect(theme).toContain("--breakpoint-lg: 1024px;")
        expect(theme).not.toMatch(/--breakpoint-\w+: var\(/)
    })

    it("emits layout tokens once, in the mode-invariant block", () => {
        const light = resolved.declarations.light.map(([name]) => name)
        const dark = resolved.declarations.dark.map(([name]) => name)
        expect(light).toContain("--breakpoint-lg")
        expect(light).toContain("--container-page")
        expect(dark).not.toContain("--breakpoint-lg")
        expect(dark).not.toContain("--container-page")
    })

    it("prints every declaration the engine resolved, verbatim", () => {
        for (const [name, value] of resolved.declarations.light) expect(css).toContain(`${name}: ${value};`)
    })
})

describe("tokens.json (DTCG)", () => {
    const json = JSON.parse(fileAt("tokens.json"))

    it("aliases semantics at primitives rather than duplicating values", () => {
        expect(json.color.light.semantic.background.$value).toMatch(/^\{color\.light\.primitive\.\w+\.\d+\}$/)
    })

    it("stores colour in oklch with an sRGB fallback", () => {
        const swatch = json.color.light.primitive.primary["700"].$value
        expect(swatch.colorSpace).toBe("oklch")
        expect(swatch.components).toHaveLength(3)
        expect(swatch.hex).toMatch(/^#[0-9a-f]{6}$/)
    })

    it("records provenance so a re-import stays possible", () => {
        expect(json.$extensions["design.hendri.brandforge"].seeds.primary).toBe("#574cff")
    })

    it("resolves every alias it declares", () => {
        for (const mode of ["light", "dark"] as const) {
            for (const token of Object.values(json.color[mode].semantic)) {
                const value = (token as { $value?: string }).$value
                if (typeof value !== "string") continue
                const path = value.slice(1, -1).split(".")
                let node = json
                for (const key of path) node = node[key]
                expect(node, value).toBeDefined()
            }
        }
    })
})

describe("DESIGN.md", () => {
    const md = toDesignMd(resolved, {
        site: "http://localhost:5173/",
        scannedAt: Date.UTC(2026, 8, 24),
        typeStyles: [{ name: "h1", form: "tag", selectorOrUtility: "h1", tag: "h1", fields: { size: { literal: "28px" } } }],
        links: { "--mark": { role: "primary", step: 600 } },
        critique: { findings: [{ kind: "contrast", level: "fail", message: "3 text pairs under AA", detail: {} }], summary: "1 fail" },
    })
    const front = md.slice(4, md.indexOf("\n---\n", 4))

    it("opens with frontmatter naming the system and carrying the tokens", () => {
        expect(md.startsWith("---\nname: ")).toBe(true)
        expect(front).toMatch(/^colors:\n  background: "#[0-9A-Fa-f]{6}"/m)
        expect(front).toMatch(/^  primary-600: "#/m)
        expect(front).toMatch(/^typography:\n  display:\n    fontFamily: /m)
        expect(front).toMatch(/^    fontSize: "[\d.]+rem"/m)
        expect(front).toMatch(/^rounded:\n  sm: "\d+px"/m)
        expect(front).toMatch(/^spacing:\n  base: "\d+px"/m)
        expect(front).toContain('backgroundColor: "{colors.primary}"')
    })

    it("references only tokens the frontmatter defines", () => {
        const defined = new Set<string>()
        let group = ""
        for (const line of front.split("\n")) {
            const top = /^([a-z]+):/.exec(line)
            if (top) group = top[1]!
            const leaf = /^  ("?)([^":]+)\1:/.exec(line)
            if (leaf) defined.add(`${group}.${leaf[2]}`)
        }
        const refs = Array.from(md.matchAll(/\{([a-z]+\.[^}]+)\}/g), (m) => m[1]!)
        expect(refs.length).toBeGreaterThan(3)
        for (const ref of refs) expect(defined.has(ref), ref).toBe(true)
    })

    it("has the eight sections in the spec's order, written from the page", () => {
        const heads = Array.from(md.matchAll(/^## (.+)$/gm), (m) => m[1])
        expect(heads).toEqual([...DESIGN_MD_SECTIONS])
        expect(md).toContain("read it off the running page on 2026-09-24")
        expect(md).toContain("`--mark` is primary 600")
        expect(md).toContain("- **h1** — the `h1 {}` rule, `28px`")
        expect(md).toContain("- 3 text pairs under AA")
        expect(md).toContain("**Focus is always visible.**")
    })
})
