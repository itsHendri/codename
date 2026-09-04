import { describe, expect, it } from "vitest"
import { apca, composite, LC_THRESHOLD, SYNTAX_MIN_DELTA_E } from "../engine/contrast"
import { resolveTokens, semanticByName } from "../engine/resolve"
import { hendriPreset } from "../presets/hendri"
import { SCALE_ROLES } from "../engine/types"
import { buildExport, exportAsMap, exportBudget, referencedAssets } from "./bundle"
import { previewCss } from "./css"
import { toSkillMd } from "./skillMd"

const resolved = resolveTokens(hendriPreset)
const files = buildExport(resolved)
const fileAt = (suffix: string) => files.find((f) => f.path.endsWith(suffix))!.content
const fileAt2 = (tokens: typeof resolved, suffix: string) =>
    buildExport(tokens).find((f) => f.path.endsWith(suffix))!.content

describe("the export bundle", () => {
    it("writes the skill folder, the stylesheet, the tokens, the style guide and the source", () => {
        expect(files.map((f) => f.path)).toEqual([
            "skill/SKILL.md",
            "skill/references/DESIGN_SYSTEM.md",
            "tokens.css",
            "tokens.json",
            "preview.html",
            "brand.json",
        ])
    })

    it("keeps the agent-facing docs inside a single-load budget", () => {
        const budget = exportBudget(files)
        expect(budget.overBudget).toBe(false)
        expect(budget.tokens).toBeGreaterThan(1000) // it should actually say something
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
        // A toggle that writes data-theme="light" used to work only by falling
        // through to :root. Accidents stop working.
        expect(css).toContain('[data-theme="light"] {')
    })

    it("does not ship a media query while the docs promise an attribute", () => {
        // Both together means a dark-preference OS renders dark with no attribute
        // set, and a toggle that only removes the attribute can never reach light.
        expect(css).not.toContain("prefers-color-scheme")
    })

    it("forwards tokens into a Tailwind v4 theme block", () => {
        expect(css).toContain("@theme inline {")
        expect(css).toContain("--color-background: var(--background);")
        expect(css).toContain("--radius-md:")
        // Tailwind's own namespaces, so `md:` variants and `max-w-page` work
        // without a config file.
        expect(css).toContain("--container-prose: var(--container-prose);")
    })

    it("gives Tailwind literal breakpoints, because var() dies in a media query", () => {
        // `@theme inline { --breakpoint-lg: var(--breakpoint-lg) }` compiles to
        // `@media (width >= var(--breakpoint-lg))`, which is invalid CSS — every
        // `lg:` utility silently stops applying. Verified against a real build.
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

    it("shares its serialization with the live preview — no second code path", () => {
        // Every declaration the preview injects must appear in the export verbatim.
        const preview = previewCss(resolved)
        for (const [name, value] of resolved.declarations.light) {
            expect(preview).toContain(`${name}: ${value};`)
            expect(css).toContain(`${name}: ${value};`)
        }
    })

    it("scopes the preview so brand colour cannot leak into the app chrome", () => {
        expect(previewCss(resolved)).toContain("#preview-root {")
        expect(previewCss(resolved)).not.toContain(":root {")
    })
})

describe("assets", () => {
    const withFonts = structuredClone(hendriPreset)
    withFonts.typography.fontFiles = [
        { fileName: "Geist-Regular.woff2", family: "sans", weight: 400, style: "normal" },
        { fileName: "Geist-Italic.woff2", family: "sans", weight: 400, style: "italic" },
        { fileName: "GeistMono.woff2", family: "mono", weight: 400, style: "normal" },
    ]
    withFonts.meta.logoFile = "mark.png"
    const resolvedWithFonts = resolveTokens(withFonts)
    const css = fileAt2(resolvedWithFonts, "tokens.css")

    it("names the @font-face after the first family in the stack, not the stack", () => {
        // `font-family: "Geist", ui-sans-serif, …` only picks up a face called
        // exactly `Geist`; naming the rule after the whole stack loads nothing.
        expect(css).toContain('font-family: "Space Grotesk";')
        // The full stack still belongs in the --font-sans token; it just must
        // not leak into the @font-face rule.
        const faces = css.slice(0, css.indexOf(":root"))
        expect(faces).not.toContain("ui-sans-serif")
    })

    it("emits one rule per weight and style", () => {
        expect(css.match(/@font-face/g)).toHaveLength(3)
        expect(css).toContain("font-style: italic;")
        expect(css).toContain('format("woff2")')
        expect(css).toContain("font-display: swap;")
    })

    it("points at assets sitting beside the stylesheet", () => {
        expect(css).toContain('url("./assets/Geist-Regular.woff2")')
    })

    it("lists every referenced asset so the export can carry them", () => {
        expect(referencedAssets(resolvedWithFonts).sort()).toEqual([
            "Geist-Italic.woff2",
            "Geist-Regular.woff2",
            "GeistMono.woff2",
            "mark.png",
        ])
    })

    it("does not count an inline SVG logo as a file to copy", () => {
        const withSvg = structuredClone(hendriPreset)
        withSvg.meta.logoSvg = "<svg/>"
        withSvg.meta.logoFile = undefined
        withSvg.typography.fontFiles = []
        expect(referencedAssets(resolveTokens(withSvg))).toEqual([])
    })

    it("emits no @font-face block when a brand has no font files", () => {
        const bare = structuredClone(hendriPreset)
        bare.typography.fontFiles = []
        expect(fileAt2(resolveTokens(bare), "tokens.css")).not.toContain("@font-face")
    })

    it("bundles no font the user did not upload", () => {
        // The tool may ship any asset a user adds and must never acquire one on
        // their behalf — a licensed face was pulled from the live site and wired
        // in before anyone was asked, which is the wrong order.
        expect(hendriPreset.typography.fontFiles ?? []).toEqual([])
        expect(referencedAssets(resolved)).not.toContain("AlphaLyrae-Medium.woff2")
        expect(fileAt("tokens.css")).not.toContain("Alpha Lyrae")
    })

    it("marks binary entries so the writer knows they are bytes", () => {
        const map = exportAsMap([
            { path: "assets/x.woff2", content: "AAAA", note: "", encoding: "base64" },
            { path: "tokens.css", content: ":root{}", note: "" },
        ])
        expect(Object.keys(map)).toEqual(["base64:assets/x.woff2", "tokens.css"])
    })
})

describe("assets in the docs", () => {
    const branded = structuredClone(hendriPreset)
    branded.meta.logoSvg = '<svg viewBox="0 0 10 10"><path fill="#574cff" d="M0 0h10v10H0z"/></svg>'
    branded.typography.fontFiles = [
        { fileName: "Geist-Regular.woff2", family: "sans", weight: 400, style: "normal" },
    ]
    const md = fileAt2(resolveTokens(branded), "DESIGN_SYSTEM.md")
    const skill = fileAt2(resolveTokens(branded), "SKILL.md")

    it("tells an agent the mark exists and how to colour it", () => {
        expect(md).toContain("### Logo")
        expect(md).toContain("currentColor")
        expect(skill).toContain("brand mark is inline SVG")
    })

    it("lists the font files and warns about moving them", () => {
        expect(md).toContain("`assets/Geist-Regular.woff2`")
        expect(md).toContain("first family in each stack")
        expect(skill).toContain("`assets/` sits beside it")
    })

    it("says something useful when a brand has no assets at all", () => {
        // The empty branch has to give an instruction, not go silent. The shipped
        // preset now has a mark, so this needs a brand stripped of one.
        const bare = structuredClone(hendriPreset)
        bare.meta.logoSvg = undefined
        bare.meta.logoFile = undefined
        bare.typography.fontLinks = []
        bare.typography.fontFiles = []
        const md = fileAt2(resolveTokens(bare), "DESIGN_SYSTEM.md")
        expect(md).toContain("**No mark is defined.**")
        expect(md).toContain("**No font files and no hosted links.**")
    })

    it("does not tell an agent to add a <link> when the fonts already ship", () => {
        expect(md).toContain("there is no separate `<link>` to add")
    })
})

describe("findings from acceptance run 4", () => {
    const md = fileAt("DESIGN_SYSTEM.md")
    const skill = fileAt("SKILL.md")
    const css = fileAt("tokens.css")

    it("emits letter-spacing for every role, so the four-property pattern is safe to copy", () => {
        // Four of nine roles used to skip it, so copying the documented pattern
        // gave `letter-spacing: var(--undefined)` — invalid, dropped in silence,
        // the exact failure the instruction exists to prevent.
        for (const role of hendriPreset.typography.roles) {
            expect(css, role.role).toContain(`--text-${role.role}--letter-spacing:`)
        }
    })

    it("says the focus ring is invisible on a brand fill and what to use instead", () => {
        // --ring IS --primary, so the mandated focus treatment was Lc 0 on
        // exactly the section the docs single out as dangerous. The answer used
        // to be a rule — borrow the fill's `-foreground` — and is now a token.
        expect(md).toContain("outline: 2px solid var(--ring-inverse)")
        expect(md).toContain("The focus ring is part of this")
        expect(skill).toContain("--ring-inverse")
        // The pair, for a control that can land on either polarity of ground.
        expect(md).toContain("var(--ring-inset)")
    })

    it("does not claim tokens defined as invisible are validated", () => {
        const contrast = md.slice(md.indexOf("## Contrast"))
        expect(contrast).toContain("deliberately exempt")
        expect(contrast).toContain("--border-subtle")
    })

    it("defines what large text means, since two thresholds depend on it", () => {
        expect(md).toMatch(/\*\*"Large text" means/)
    })

    it("adjudicates the full-width button against the concentric rule", () => {
        expect(md).toContain("A full-width control is flush and does follow the formula")
        expect(skill).toContain("full-width field, banner or button follows the formula")
    })

    it("warns that --color-* only exists inside the theme block", () => {
        expect(css).toContain("resolves to nothing")
    })
})

describe("the on-brand rule", () => {
    const md = fileAt("DESIGN_SYSTEM.md")
    const skill = fileAt("SKILL.md")

    it("appears in the deviations, because it is a trap rather than a gap", () => {
        const deviations = md.slice(md.indexOf("🚨"), md.indexOf("## How the layers work"))
        expect(deviations).toContain("On a coloured fill, the neutral text tokens are wrong")
    })

    it("gives the composition rule for text AND border", () => {
        expect(md).toContain("for its text and its border both")
        expect(md).toContain("border: 1px solid var(--primary-foreground)")
    })

    it("marks the outline recipe as assuming a neutral ground", () => {
        expect(md).toContain("This recipe assumes a neutral ground")
    })

    it("forbids dimming a contrast-checked pair with opacity", () => {
        expect(md).toContain("do not fade the result with")
        expect(skill).toContain("Never soften the result with `opacity`")
    })
})

describe("DESIGN_SYSTEM.md", () => {
    const md = fileAt("DESIGN_SYSTEM.md")
    const skill = fileAt("SKILL.md")

    it("leads with the deviations, before any token table", () => {
        expect(md.indexOf("🚨")).toBeLessThan(md.indexOf("| Token |"))
    })

    it("names the shadcn tokens this system does NOT have", () => {
        expect(md).toContain("`card` → `surface`")
        expect(md).toContain("`destructive` → `danger`")
    })

    it("documents every semantic token with a real hex in both modes", () => {
        for (const token of resolved.semantics) {
            expect(md).toContain(`\`--${token.name}\``)
            expect(md).toContain(token.values.light!.hex)
        }
    })

    it("gives exact component recipes rather than principles", () => {
        expect(md).toContain("background: var(--primary)")
        expect(md).toContain(`\`--radius-lg\` (${resolved.radius.lg}px)`)
    })

    describe("layout", () => {
        it("states the breakpoints as a closed, mobile-first set", () => {
            for (const breakpoint of hendriPreset.layout.breakpoints) {
                expect(md).toContain(`\`--breakpoint-${breakpoint.name}\``)
                expect(md).toContain(`${breakpoint.minPx}px`)
                expect(md).toContain(breakpoint.note)
            }
            expect(md).toContain("mobile-first")
            expect(md).toContain("no `max-width` breakpoints")
        })

        it("warns that var() does not resolve inside a media query", () => {
            // The trap: the rule is dropped silently, so nothing looks broken
            // until someone checks the layout at that width.
            expect(md).toContain("@media (min-width: var(--breakpoint-sm))")
            expect(md).toMatch(/silently ignored|does not work inside a media query/)
        })

        it("documents every container with the job it does", () => {
            for (const container of hendriPreset.layout.containers) {
                expect(md).toContain(`\`--container-${container.name}\``)
                expect(md).toContain(container.note)
            }
            expect(md).toContain("--container-prose")
        })

        it("no longer lists layout among the things the system doesn't define", () => {
            const section = md.slice(md.indexOf("## What this system does not define"))
            expect(section).not.toMatch(/\*\*Breakpoints\.\*\*/)
            expect(section).not.toMatch(/\*\*Container widths/)
        })
    })

    describe("claims the docs make about themselves", () => {
        it("does not claim every pair clears the body threshold", () => {
            // It doesn't: `-foreground` labels and `foreground-secondary` are held
            // to the Lc 60 bar and land in the 65-75 range. Saying "all of them
            // clear" next to "body targets Lc 75" reads as a stronger promise
            // than the validator actually makes.
            expect(md).not.toContain("were generated against those thresholds and all of them clear")
            expect(md).toContain("its own")
        })

        it("scopes the concentric rule so it doesn't forbid the radius scale", () => {
            // A card is --radius-lg with --space-6 padding, so `outer - padding`
            // is 0 for every child. Unscoped, the rule bans small radii outright.
            expect(md).toContain("flush against the parent's inner edge")
            expect(md).not.toContain("Only applies while padding ≤ 24px")
        })

        it("agrees with SKILL.md about badges", () => {
            const skillText = fileAt("SKILL.md")
            expect(md).toContain("**Badge** — subtle by default")
            expect(skillText).not.toContain("for fills and badges")
        })
    })

    it("shows wrong alongside right", () => {
        expect(md).toContain("❌")
        expect(md).toContain("✅")
    })

    it("never tells anyone to put a bare length in the `font` shorthand", () => {
        // `font: var(--text-label)` is invalid CSS and is dropped SILENTLY —
        // a copied recipe would produce an unstyled element and no error.
        // The doc is allowed to quote the pattern while warning against it.
        const offending = md
            .split("\n")
            .filter((line) => /font:\s*var\(--text-/.test(line) && !line.includes("invalid"))
        expect(offending).toEqual([])
        expect(md).toContain("--text-label--line-height")
    })

    it("names the companion type properties, not just their values", () => {
        for (const role of resolved.config.typography.roles) {
            expect(md).toContain(`--text-${role.role}--line-height`)
            expect(md).toContain(`--text-${role.role}--font-weight`)
        }
    })

    it("surfaces tokens that currently share a value instead of hiding them", () => {
        expect(md).toContain("## Tokens that currently share a value")
    })

    it("says what the system deliberately does not define", () => {
        expect(md).toContain("no tokens")
    })

    it("states the rules once, in SKILL.md, and does not restate them here", () => {
        // The 🚨 section used to repeat seven of SKILL.md's hard rules verbatim,
        // values and all — read second, teaching nothing, and seven more places
        // for a rule to drift from the file that stated it first. What belongs
        // here is only what a rule cannot say without knowing the brand.
        const deviations = md.slice(md.indexOf("🚨"), md.indexOf("## How the layers work"))
        for (const restated of [
            "Dark mode is an attribute",
            "Never use a primitive",
            "Breakpoints are a closed set",
            "No content spans the viewport",
            "Spacing is a blessed subset",
            "Type roles are named for their job",
        ]) {
            expect(deviations, `"${restated}" is a SKILL.md rule and should not be repeated`).not.toContain(
                restated,
            )
            expect(skill, `"${restated}" must still be stated somewhere`).toBeTruthy()
        }
        // …and the rules themselves are all still in SKILL.md.
        expect(skill).toContain("Breakpoints are mobile-first and closed")
        expect(skill).toContain("Spacing comes from the blessed subset only")
        expect(skill).toContain("Never reference a primitive")
        // The reference still documents them where they belong: in the tables.
        expect(md).toContain("--breakpoint-lg")
        expect(md).toContain("--space-6")
    })
})

describe("SKILL.md", () => {
    const skill = fileAt("SKILL.md")

    it("carries frontmatter an agent can match on", () => {
        expect(skill.startsWith("---\n")).toBe(true)
        expect(skill).toContain("name: hendri-brand")
        expect(skill).toContain("description:")
    })

    it("carries the layout rules, including the media-query trap", () => {
        expect(skill).toContain("Breakpoints are mobile-first and closed")
        expect(skill).toContain("640px (`sm`)")
        expect(skill).toContain("No content spans the viewport")
        expect(skill).toContain("--container-prose")
    })

    it("numbers its hard rules without repeating or skipping", () => {
        const numbers = [...skill.matchAll(/^(\d+)\. \*\*/gm)].map((match) => Number(match[1]))
        const hardRules = numbers.slice(0, numbers.indexOf(1, 1) === -1 ? numbers.length : numbers.indexOf(1, 1))
        expect(hardRules).toEqual(hardRules.map((_, i) => i + 1))
    })

    it("points at its own reference file", () => {
        expect(skill).toContain("references/DESIGN_SYSTEM.md")
    })

    it("ships only the craft rules that are switched on", () => {
        // The Rules panel is not decoration: toggling a rule off has to remove it
        // from the skill, or the panel is lying about what the agent will be told.
        expect(skill).toContain("Concentric radius")

        const withoutConcentric = structuredClone(hendriPreset)
        withoutConcentric.rules.polish["concentric-radius"] = false
        const trimmed = toSkillMd(resolveTokens(withoutConcentric))
        expect(trimmed).not.toContain("**Concentric radius.**")
        expect(trimmed).toContain("Tabular numbers") // the others survive
    })

    it("states the rules that stop a model reaching past the semantic layer", () => {
        expect(skill).toContain("Never write a colour literal")
        expect(skill).toContain("Never reference a primitive")
        expect(skill).toContain("Never write a dark-mode colour override")
    })
})

describe("tokens.json (DTCG)", () => {
    const json = JSON.parse(fileAt("tokens.json"))

    it("aliases semantics at primitives rather than duplicating values", () => {
        expect(json.color.light.semantic.background.$value).toMatch(
            /^\{color\.light\.primitive\.\w+\.\d+\}$/,
        )
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

/**
 * Findings from acceptance run 5 (multi-column app shell). Every number the run
 * reported was verified independently and every one was exact; all five defects
 * below were in the prose. Four of them were introduced by the token work of the
 * same session, which is the argument for running this after a change rather
 * than before a release.
 */
describe("findings from acceptance run 5", () => {
    const md = fileAt("DESIGN_SYSTEM.md")
    const css = fileAt("tokens.css")

    it("does not list app-shell dimensions as undefined, now that they are defined", () => {
        // The single most dangerous error the run found: the "what this system
        // does not define" list still claimed there was no sidebar width, header
        // height, z-index scale or table minimum — forty lines above the tables
        // that define all four. That list is exactly where a reader goes to
        // decide what to invent.
        const gaps = md.slice(md.indexOf("does not define"))
        expect(gaps).not.toContain("no header height")
        expect(gaps).not.toContain("no z-index scale")
        expect(md).toContain("--shell-sidebar")
        expect(md).toContain("--z-modal")
    })

    it("does not claim dark mode replaces every shadow with a ring", () => {
        // Only `--shadow-sm` is ring-only; raised and overlay keep a real drop
        // shadow and gain a ring. The flat claim changes how someone reasons
        // about depth in dark mode.
        expect(md).not.toContain("these become a hairline ring rather than a drop shadow")
        const darkShadows = resolved.declarations.dark.filter(([name]) => name.startsWith("--shadow-"))
        expect(darkShadows.filter(([, value]) => value.includes("oklch(0 0 0")).length).toBeGreaterThan(0)
    })

    it("gives a filled button a focus ring that is visible on both of its grounds", () => {
        // Run 4 found `--ring` on a primary button is the button's own fill, and
        // the fix sent it to `--ring-inverse`. Run 8 found the fix: with the
        // documented `outline-offset: 2px` the ring lands OUTSIDE the button, on
        // the page — and `--ring-inverse` is the neutral extreme, which is the
        // page. Lc 0.0 in all four mode × ground combinations. A ring that was
        // invisible for one reason became invisible for the opposite one.
        //
        // The double ring is the only answer that survives both, and SKILL.md's
        // rule 9 already said so while the recipe contradicted it.
        const button = md.slice(md.indexOf("**Button (primary)**"), md.indexOf("**Button (secondary)**"))
        expect(button).toContain("--ring-inset")
        expect(button).toContain("--ring")
        expect(button).not.toMatch(/outline: 2px solid var\(--ring-inverse\); outline-offset: 2px/)
        // The measured reason, generated — both halves of it.
        const ringInverse = semanticByName(resolved, "ring-inverse")!
        const background = semanticByName(resolved, "background")!
        for (const mode of ["light", "dark"] as const) {
            const measured = Math.abs(apca(ringInverse.values[mode]!.hex, background.values[mode]!.hex))
            expect(button, `${mode} ring-inverse vs page`).toContain(`Lc ${measured.toFixed(0)}`)
        }
    })

    it("gives the sticky-header answer instead of only the warning", () => {
        // Run 5 found that a sticky `thead` inside an `overflow-x` wrapper can
        // never reach the page, and the fix was a warning: "pick one". Run 10
        // pointed out that is a false dichotomy — give the wrapper a
        // `max-height` and the header sticks to the panel while the table still
        // scrolls both ways. The warning was right and the advice was withheld.
        expect(md).toContain("mutually exclusive")
        expect(md).toContain("max-height: 26rem")
        expect(md).toContain("the wrapper's top, not the page's")
    })

    it("shows how to layer a translucent token, not just that you should", () => {
        // "Layer it over the surface it sits on" was stated three times for the
        // washes and never once demonstrated — and one element cannot take two
        // background-colors.
        expect(md).toContain("background-image: linear-gradient(var(--muted), var(--muted))")
    })

    it("says which token groups the @theme block does not forward", () => {
        // A Tailwind user gets no `z-modal` or `duration-fast` utility, silently.
        // Slice from the block, not from the header comment that mentions it.
        const theme = css.slice(css.indexOf("@theme inline"))
        for (const prefix of ["--z-", "--shell-", "--duration-", "--opacity-"]) {
            expect(theme.includes(`\n    ${prefix}`), `${prefix} should not be in @theme`).toBe(false)
        }
        expect(md).toContain("Not everything in `tokens.css` is in that `@theme` block")
    })

    it("describes the mark it actually ships, which is two-tone", () => {
        // "Replace every explicit fill with currentColor" flattened a deliberate
        // two-tone wordmark into an ink blob.
        expect(md).not.toContain("Replace every explicit `fill` with `currentColor`")
        expect(md).toContain("two-tone")
    })

    it("does not send dialog supporting text to a colour that fails on an overlay", () => {
        // `foreground-secondary` was documented as "the only supporting text
        // colour verified against surface-raised, so use it inside dialogs" —
        // but dialogs are `surface-overlay`, a lighter fill, where it measures
        // Lc 60.9 against a body bar of 75.
        expect(md).not.toContain("so use it inside dialogs and popovers")
        expect(md).toContain("Neither is verified on `surface-overlay`")
    })
})

/**
 * Findings from acceptance run 6 (long-form content site).
 *
 * The run exposed a class rather than a list: **hand-written measurements baked
 * into a generated document.** Six separate claims were true of the palette they
 * were written against and false of the next one — including one added while
 * fixing run 5, which is how fast it happens.
 */
describe("findings from acceptance run 6", () => {
    const md = fileAt("DESIGN_SYSTEM.md")
    const skill = fileAt("SKILL.md")

    it("computes the label-on-fill figures rather than quoting one measured once", () => {
        // "`--primary-foreground` on `--primary` measures Lc 77.3 in light" was
        // hardcoded. True for one brand; for the next it was Lc 50.6 and FAILING,
        // and the sentence held it up as the example of a pair that clears.
        expect(md).not.toContain("Lc 77.3")
        expect(md).toContain("Measured on this brand in light mode, tightest first")
        // The stated floor must be the real one.
        const pairs = SCALE_ROLES.filter((r) => r !== "neutral").map((role) => ({
            role,
            lc: Math.abs(
                apca(
                    semanticByName(resolved, `${role}-foreground`)!.values.light!.hex,
                    semanticByName(resolved, role)!.values.light!.hex,
                ),
            ),
        }))
        const floor = pairs.sort((a, b) => a.lc - b.lc)[0]!
        expect(md).toContain(`The floor is \`--${floor.role}\` at Lc ${floor.lc.toFixed(0)}`)
    })

    it("does not assert which mode --link fails in — it measures", () => {
        // "unreadable as text in dark mode" was stated flat. On a different
        // palette the failing mode was light, so anyone reading carefully and
        // concluding "fine in light" ships the worst version.
        expect(md).not.toContain("is unreadable as text in dark mode")
        expect(skill).not.toContain("is unreadable as text in dark mode")
        expect(md).toContain("Against body text it")
    })

    it("does not claim a character count it cannot measure", () => {
        // `--container-prose` claimed "~70 characters at body size". Measured
        // against the brand's actual face it was 80–85. Character count depends
        // on the font, which this tool never sees.
        expect(md).not.toContain("~70 characters")
    })

    it("states the wash ratio it actually solved, not 'roughly twice'", () => {
        const ratio = (mode: "light" | "dark") =>
            semanticByName(resolved, "state-active")![mode].alpha! /
            semanticByName(resolved, "state-hover")![mode].alpha!
        expect(md).toContain(`${ratio("light").toFixed(1)}× as strong in light`)
        expect(md).not.toContain("roughly twice as strong")
    })

    it("lists failing contrast pairs inline, since nothing else in the bundle carries them", () => {
        // The docs said "see the brand's warnings" and no warnings file ships.
        expect(md).not.toContain("see the brand's warnings")
    })
})

describe("what run 7 left open — the syntax palette and the gaps around it", () => {
    const md = fileAt("DESIGN_SYSTEM.md")
    const skill = fileAt("SKILL.md")

    it("documents a code block as a well, in both files, with no contradiction left behind", () => {
        // The docs said a fenced block takes `--muted`. That is where the
        // monochrome came from, so the old sentence has to be gone, not merely
        // outnumbered — a contradiction an agent can cite is the defect class
        // every acceptance run finds.
        expect(md).toContain("## Code samples")
        expect(md).toContain("A code block is **`--surface-sunken`**, not `--muted`")
        expect(md).not.toContain("A fenced block takes `--muted`")
        expect(skill).toContain("**Code samples have their own colours")
        expect(skill).toContain("fenced code block is `--surface-sunken`")
    })

    it("names every syntax token it ships, and ships every one it names", () => {
        const shipped = resolved.semantics.filter((token) => token.group === "code").map((t) => t.name)
        expect(shipped.length).toBeGreaterThan(0)
        for (const name of shipped) {
            expect(md, `${name} in the reference`).toContain(`--${name}`)
        }
        // The inverse direction is the one that bit run 7: `--container-intro`
        // was documented, justified, and absent from the stylesheet.
        const css = fileAt("tokens.css")
        for (const name of shipped) expect(css, `${name} in tokens.css`).toContain(`--${name}:`)
        // …and nothing invented in prose that the engine does not generate.
        for (const invented of ["--code-punctuation", "--code-function", "--code-variable"]) {
            expect(md, `${invented} is not a token`).not.toContain(invented)
        }
    })

    it("prints measured contrast for the syntax palette rather than asserting it", () => {
        // DECISIONS #31: if a sentence contains a number about this brand, it is
        // generated or it goes. A syntax palette's whole claim is legibility.
        const sunken = semanticByName(resolved, "surface-sunken")!
        const keyword = semanticByName(resolved, "code-keyword")!
        const lc = Math.abs(apca(keyword.values.light!.hex, sunken.values.light!.hex)).toFixed(0)
        expect(md).toContain(`\`--code-keyword\` Lc ${lc}`)
    })

    it("answers the layout questions run 7 had to invent", () => {
        expect(md).toContain("scroll-padding-top")
        expect(md).toContain("**Section breaks.**")
        expect(md).toContain("**Footer.**")
        expect(md).toContain("**Media geometry**")
        expect(md).toContain("**A marketing header uses `--shell-header`.**")
    })

    it("gives the mark an accent that does not move between modes", () => {
        expect(md).toContain("--logo-accent")
        expect(md).not.toContain("var(--secondary-500")
        expect(fileAt("tokens.css")).toContain("--logo-accent:")
        expect(skill).toContain("--logo-accent")
    })
})

describe("what runs 8 and 9 found", () => {
    const md = fileAt("DESIGN_SYSTEM.md")
    const skill = fileAt("SKILL.md")
    const json = JSON.parse(fileAt("tokens.json"))

    it("audits the syntax palette for distinctness, not only for contrast", () => {
        // Run 9's finding, and the one that mattered most: every syntax token
        // cleared the body bar and all of them landed on one lightness step.
        expect(md).toContain("Legible is not the same as distinguishable")
        expect(md).toContain(`ΔE\n${SYNTAX_MIN_DELTA_E}`)
    })

    it("does not tell a filled button to draw an invisible ring", () => {
        // Run 8: `--ring-inverse` at a +2px offset lands on the page, and it IS
        // the page — Lc 0.0 in all four mode × ground combinations.
        expect(skill).toContain("takes the double ring")
        expect(md).toContain("**Focus is the double ring**")
    })

    it("stops the Table recipe prescribing a divider the Contrast section forbids", () => {
        const table = md.slice(md.indexOf("**Table** —"), md.indexOf("A table is the most common"))
        expect(table).toContain("not `--border-subtle`")
    })

    it("ships the groups tokens.json used to drop in silence", () => {
        for (const group of ["shadow", "z", "shell", "opacity", "font", "brand"]) {
            expect(Object.keys(json), group).toContain(group)
        }
        // Every type role carries all five properties, including the fifth.
        for (const role of resolved.config.typography.roles) {
            expect(json.type[role.role].$value.letterSpacing, `${role.role} letterSpacing`).toBeDefined()
        }
    })

    it("does not flatten a fluid role to its desktop size, which is its own ❌ example", () => {
        for (const role of resolved.config.typography.roles.filter((r) => r.minSizeRem !== undefined)) {
            const node = json.type[role.role]
            expect(node.$description, `${role.role} says it is fluid`).toContain("Fluid:")
            const fluid = node.$extensions["design.hendri.brandforge"].fluid
            expect(fluid.minSizeRem).toBe(role.minSizeRem)
            expect(fluid.css).toContain("clamp(")
        }
    })

    it("gives one answer for a footer link, not two a bullet apart", () => {
        const footer = md.slice(md.indexOf("**Footer.**"), md.indexOf("## Code samples"))
        expect(footer).toContain("--link-inverse")
        expect(footer).not.toContain("in `--inverse-foreground`.")
    })

    it("keeps the craft rules inside the blessed spacing set", () => {
        // `pl-14 pr-16` was the only raw pixel padding a rule could produce.
        expect(skill).not.toContain("pl-14")
        expect(skill).toContain("optical correction")
    })
})

describe("what the honesty mechanisms could not see", () => {
    const md = fileAt("DESIGN_SYSTEM.md")

    it("reports near-collisions, not only byte-identical ones", () => {
        // `--secondary-subtle` and `--warning-subtle` were one channel value
        // apart — the same colour to any reader, invisible to a table keyed on
        // the hex string, and therefore absent from the one section whose whole
        // job is admitting when two tokens do not differ.
        expect(md).toContain("| indistinguishable |")
        expect(md).toContain("is not a rounding note")
    })

    it("names the third exempt class, instead of claiming there are two", () => {
        // The washes and the subtle tints are visibility-tested by channel
        // shift, not APCA, and several measure Lc 0.0 against their own ground.
        // The Contrast section listed exactly two exemptions and they were not
        // among them.
        const contrast = md.slice(md.indexOf("## Contrast"))
        expect(contrast).toContain("Every fill in this system is exempt from APCA")
        expect(contrast).toContain("colour must never be the\n  only marker")
    })
})

describe("charts", () => {
    const md = fileAt("DESIGN_SYSTEM.md")
    const skill = fileAt("SKILL.md")
    const series = resolved.semantics.filter(
        (token) => token.group === "chart" && token.light.alpha === undefined,
    )

    it("documents the ceiling as a measured number, not a round one", () => {
        expect(md).toContain("## Charts and data")
        expect(md).toContain(`defines ${series.length} chart series`)
        expect(skill).toContain(`\`--chart-1\` … \`--chart-${series.length}\``)
    })

    it("stops telling people to plot with a status colour", () => {
        // Rule 7 offered `--<status>` for "chart series" for four sessions, and
        // it was the only hint anywhere — a category encoded as an error state.
        expect(skill).not.toContain("status dots, chart\n   series")
        expect(skill).toContain("never for a chart series")
    })

    it("declares what a chart still needs and does not have", () => {
        const section = md.slice(md.indexOf("## Charts and data"), md.indexOf("## Stacking order"))
        expect(section).toContain("A diverging scale")
        expect(section).toContain("A band does not identify a series")
    })

    it("ships every series it names, and names every series it ships", () => {
        const css = fileAt("tokens.css")
        for (const token of series) {
            expect(css, `${token.name} in tokens.css`).toContain(`--${token.name}:`)
            expect(md, `${token.name} in the reference`).toContain(`--${token.name}`)
        }
        expect(md, "no phantom series").not.toContain(`--chart-${series.length + 1}`)
        expect(css).not.toContain(`--chart-${series.length + 1}:`)
    })
})

describe("what run 10 found in the chart section", () => {
    const md = fileAt("DESIGN_SYSTEM.md")
    const section = md.slice(md.indexOf("## Charts and data"), md.indexOf("## Stacking order"))

    it("does not hand out a CSS snippet that renders black", () => {
        // SVG's initial `fill` is black and its initial `stroke` is `none`, so
        // `.series-1 { color: var(--chart-1) }` is a black blob with no line —
        // and the comment claiming "stroke and fill both take currentColor" was
        // the load-bearing false statement that stops you checking.
        expect(section).toContain("stroke: var(--chart-1)")
        expect(section).toContain("fill: var(--muted-foreground)")
        expect(section).not.toContain("stroke and fill both take currentColor")
    })

    it("says colour is not the only encoding, in the one place that is true", () => {
        expect(section).toContain("second encoding, always")
        expect(section).toContain("no greyscale channel here at all")
    })

    it("gives a swatch a ground it can survive", () => {
        expect(section).toContain("A series swatch needs a hairline")
    })

    it("prints the distinctness pairs it promises to print", () => {
        // "any pair under it is listed in the Contrast section below" — and the
        // Contrast section listed none, because it filtered on `kind:contrast`.
        const distinct = resolved.warnings.filter((w) => w.kind === "distinctness")
        const contrast = md.slice(md.indexOf("## Contrast"))
        for (const warning of distinct) {
            expect(contrast, warning.message).toContain(warning.tokens!.join("` and `"))
        }
    })
})

describe("chart areas and geometry", () => {
    const md = fileAt("DESIGN_SYSTEM.md")
    const section = md.slice(md.indexOf("## Charts and data"), md.indexOf("## Stacking order"))

    it("says a band is not what identifies a series, and measures it", () => {
        expect(section).toContain("A band does not identify a series")
        expect(section).toContain("always draw the line")
    })

    it("states the geometry two charts in one product would otherwise invent", () => {
        expect(section).toContain("### Plot geometry")
        expect(section).toContain("stroke 2px")
        expect(section).toContain("A hatch, for the shapes a dash cannot help")
    })

    it("no longer lists the area fill as a gap it has since closed", () => {
        expect(section).not.toContain("There is no `--chart-1-subtle`")
        expect(section).toContain("--chart-1-subtle")
    })

    it("ships the sequential scale and says per stop whether it can hold a label", () => {
        // The middle of any evenly-spaced scale has no compliant ink in either
        // mode — a mid-lightness fill has neither a near-black nor a near-white
        // partner clearing the bar. Run 10 found it building a heatmap; the docs
        // now print it per stop rather than implying every cell can hold text.
        expect(section).toContain("### The sequential scale")
        expect(section).toContain("Can it hold a label?")
        expect(section).toContain("**no** — in either mode")
        expect(section).toContain("cannot carry text, and that is arithmetic")
        // And the consequence for a consumer, since scale-1 is near the page.
        expect(section).toContain("Give the cells a border or a gap")
    })

    it("keeps magnitude and category from being confused for each other", () => {
        expect(section).toContain("Never use it for categories")
        expect(fileAt("SKILL.md")).toContain("never use `--chart-*` for magnitude")
    })
})

describe("the smaller things runs 8 to 10 named", () => {
    const md = fileAt("DESIGN_SYSTEM.md")

    it("gives a code block a width between the reading measure and the page", () => {
        expect(md).toContain("A fenced block may break out of the reading measure")
    })

    it("warns that a clipped wrapper eats the focus ring it just mandated", () => {
        // The `pre` recipe hands out `tabindex="0"`, so wrapping it in a rounded
        // frame for a copy button produces a keyboard-only, focus-only, silent
        // failure — `outline-offset: 2px` draws outside, `overflow: hidden` cuts.
        expect(md).toContain("outline-offset: -2px")
        expect(md).toContain("keyboard-only, focus-only, silent failure")
    })

    it("stops claiming only one opacity token lacks a consumer", () => {
        expect(md).toContain("Neither opacity token has a documented consumer")
        expect(md).not.toContain("`--opacity-loading` has no documented consumer")
    })

    it("says a type role is not a size inside a scaled viewBox", () => {
        expect(md).toContain("does not survive a scaled")
    })
})

describe("the last hand-written numbers", () => {
    const md = fileAt("DESIGN_SYSTEM.md")

    it("interpolates its own thresholds instead of typing them", () => {
        // "Lc 75 for body text" was typed in four places. It is right today and
        // it is a sentence that goes wrong silently the moment a threshold moves
        // — the same class as a palette measurement, one level up.
        for (const [usage, value] of Object.entries(LC_THRESHOLD)) {
            expect(md, `${usage} bar`).toContain(`Lc ${value}`)
        }
    })

    it("generates the hue-only measurement it uses to justify a rule", () => {
        // "several of them sit at Lc 0.0 against the surface they land on" was
        // typed in from run 8's measurement — a claim about one palette, used to
        // defend a rule. DECISIONS #31 applies to the defence as much as to the
        // table it defends.
        const selected = semanticByName(resolved, "state-selected")!
        const surface = semanticByName(resolved, "surface")!
        const over = composite(
            selected.values.dark!.hex,
            selected.dark.alpha!,
            surface.values.dark!.hex,
        )
        const lc = Math.abs(apca(over, surface.values.dark!.hex)).toFixed(1)
        expect(md).toContain(`\`--state-selected\` on \`--surface\` is Lc ${lc}`)
    })
})

describe("what run 11 found by leaving the browser", () => {
    const md = fileAt("DESIGN_SYSTEM.md")
    const json = JSON.parse(fileAt("tokens.json"))
    const resolvedMap = json.$extensions["design.hendri.brandforge"].resolved

    it("ships every semantic as a literal, per mode", () => {
        // `tokens.css` contains zero hex values by design and the DTCG bodies are
        // alias strings for the same reason. Both are right for a browser and
        // useless everywhere else — run 11 had to write the alias resolver
        // itself to send an email, which is a second implementation of the one
        // mapping this system exists to keep single.
        for (const mode of ["light", "dark"] as const) {
            for (const token of resolved.semantics) {
                const entry = resolvedMap[mode][token.name]
                expect(entry, `${token.name} (${mode})`).toBeDefined()
                if (token[mode].alpha === undefined) {
                    expect(entry).toBe(token.values[mode]!.hex)
                } else {
                    expect(entry.alpha).toBe(token[mode].alpha)
                    // A wash has no colour until it is over something, so the
                    // literal that is actually usable is the composited one.
                    expect(entry.composited.surface).toBe(
                        composite(
                            token.values[mode]!.hex,
                            token[mode].alpha!,
                            semanticByName(resolved, "surface")!.values[mode]!.hex,
                        ),
                    )
                }
            }
        }
    })

    it("stops claiming a var() fallback saves you in email", () => {
        // Outlook renders through the Word engine, which fails to parse `var()`
        // at all — the whole declaration goes, fallback included. The docs named
        // email as the case that pattern was for.
        expect(md).toContain("It does not save you in email")
        expect(md).toContain("## Outside a browser")
    })

    it("gives the footer one answer for a column heading, and the right one", () => {
        // `--inverse-muted-foreground` is held to the large-text bar; `label` is
        // 0.8125rem at weight 500, which is neither `body-lg` nor `body` at 600.
        // The recipe was shipping a heading the same document forbids.
        const footer = md.slice(md.indexOf("**Footer.**"), md.indexOf("## Code samples"))
        expect(footer).toContain("**A column heading is `label` in `--inverse-foreground`**")
    })

    it("measures the logo accent on a brand field instead of saying 'check by eye'", () => {
        expect(md).not.toContain("check the accent against the fill by eye")
        expect(md).toContain("against `--primary`** in light")
    })

    it("names the metric behind the greyscale claim", () => {
        expect(md).toContain("OKLab lightness alone, chroma zeroed")
    })
})

describe("what run 12 found by reviewing instead of building", () => {
    const skill = fileAt("SKILL.md")
    const section = skill.slice(skill.indexOf("## Reviewing existing code"))

    it("has a severity tier for the failure its own docs call the worst one", () => {
        // `font: var(--text-body)` is the defect run 1 found and the reference
        // warns about by name — and under the old rubric it was neither a
        // hardcoded value, nor missing focus, nor unreadable, so it graded as
        // *should-fix*. Eleven runs never noticed, because none of them reviewed.
        expect(section).toContain("it does not do what the code says")
        expect(section).toContain("font: var(--text-body)")
    })

    it("tells the reviewer to render it, in both modes", () => {
        // Three of run 12's four worst findings were invisible in source: a
        // dropped declaration, a `.dark` selector matching nothing, and a
        // hardcoded ink that only disagrees with its surface once the theme
        // flips. Nothing had ever said to open the page.
        expect(section).toContain("Render it first, in both modes")
    })

    it("says how to decide 'unreadable', and admits the pairs are not in the tables", () => {
        // The Contrast section validates the pairs the system sanctions; a
        // reviewer meets exactly the ones it does not.
        for (const bar of [LC_THRESHOLD.body, LC_THRESHOLD.large, LC_THRESHOLD["non-text"]]) {
            expect(section).toContain(`${bar}`)
        }
        expect(section).toContain("Compute APCA yourself")
    })

    it("lets one rule broken in eleven places be one finding", () => {
        expect(section).toContain("Location may be a list")
        expect(section).toContain("may be `absent`")
    })

    it("stops 'and nothing else' from suppressing what it cannot classify", () => {
        // The old shape forbade saying what you measured, and forbade naming a
        // real defect the system has no basis to object to — markup semantics,
        // element choice, copy. Silence there reads as a pass.
        expect(section).not.toContain("and nothing else")
        expect(section).toContain("An out-of-scope list")
        expect(section).toContain("outside its scope rather than passing them in silence")
    })
})

describe("the style guide page", () => {
    const page = fileAt("preview.html")

    it("is a whole document, not a fragment", () => {
        expect(page.startsWith("<!doctype html>")).toBe(true)
        expect(page).toContain("</html>")
    })

    it("carries the token declarations inline, so it opens with no build and no network", () => {
        // Same serialization as every other artifact — the point of the rule.
        for (const [name, value] of resolved.declarations.light.slice(0, 12)) {
            expect(page).toContain(`${name}: ${value}`)
        }
        expect(page).not.toMatch(/<link[^>]+stylesheet/)
        expect(page).not.toMatch(/<script[^>]+src=/)
    })

    it("ships both modes, so the toggle has something to switch to", () => {
        expect(page).toContain('[data-theme="dark"]')
        expect(page).toContain('data-theme="light"')
    })

    it("names every semantic token and its description", () => {
        for (const token of resolved.semantics.slice(0, 20)) {
            expect(page).toContain(`--${token.name}`)
        }
    })

    it("marks where each seed landed on its ramp", () => {
        // The anchor is the one step a reader needs to find: it is the colour
        // that was typed, and the rest of the ramp is derived from it.
        expect(page.match(/class="chip anchor"/g)?.length).toBe(SCALE_ROLES.length)
    })

    it("reports the audit rather than quietly shipping a clean-looking page", () => {
        const warned = resolveTokens(hendriPreset).warnings
        if (warned.length) expect(page).toMatch(/Fails|Review/)
        else expect(page).toContain("clears its bar")
    })

    it("escapes brand text instead of pasting it into markup", () => {
        const spicy = structuredClone(hendriPreset)
        spicy.meta.name = 'Acme <script>alert("x")</script>'
        const hostile = fileAt2(resolveTokens(spicy), "preview.html")
        expect(hostile).not.toContain("<script>alert")
        expect(hostile).toContain("&lt;script&gt;")
    })
})
