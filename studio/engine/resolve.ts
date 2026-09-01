/**
 * The one pipeline: BrandConfig → ResolvedTokens.
 *
 * Everything downstream — the live preview, tokens.css, tokens.json,
 * DESIGN_SYSTEM.md, SKILL.md — reads `declarations`. There is exactly one
 * serialization of the system, so the preview and the export cannot disagree.
 */

import { validateContrast, validateSyntaxDistinctness } from "./contrast"
import { DARK_SHADOWS, deriveRadius, fluidSize, spaceName } from "./defaults"
import { generateScale, oklchToCss, oklchToHex, parseSeed } from "./scale"
import { semanticDefs } from "./semantics"
import {
    SCALE_ROLES,
    STEPS,
    type BrandConfig,
    type Declaration,
    type Mode,
    type ResolvedScale,
    type ResolvedSemantic,
    type ResolvedSwatch,
    type ResolvedTokens,
    type ScaleRole,
    type Step,
    type Warning,
} from "./types"

const MODES: Mode[] = ["light", "dark"]

function resolveScales(config: BrandConfig): {
    scales: Record<ScaleRole, ResolvedScale>
    warnings: Warning[]
} {
    const scales = {} as Record<ScaleRole, ResolvedScale>
    const warnings: Warning[] = []

    for (const scaleConfig of config.color.scales) {
        const steps = { light: {}, dark: {} } as Record<Mode, Record<Step, ResolvedSwatch>>
        let anchorStep: Step = 500

        for (const mode of MODES) {
            const generated = generateScale(
                scaleConfig.seed,
                mode,
                scaleConfig.tuning?.[mode] ?? {},
            )
            if (mode === "light") {
                anchorStep = generated.anchorStep
                if (generated.seedClamped) {
                    warnings.push({
                        level: "warn",
                        kind: "scale",
                        message: `${scaleConfig.name}: seed ${scaleConfig.seed} sits between two steps, so the ramp carries a near-match rather than the exact colour. Nudge its lightness to land it verbatim.`,
                    })
                }
            }

            const overrides = scaleConfig.overrides?.[mode] ?? {}
            for (const step of STEPS) {
                const override = overrides[step]
                const parsed = override ? parseSeed(override) : null
                const oklch = parsed ?? generated.steps[step]
                steps[mode][step] = {
                    oklch,
                    css: oklchToCss(oklch),
                    hex: oklchToHex(oklch),
                    overridden: Boolean(parsed),
                }
            }
        }

        scales[scaleConfig.role] = {
            role: scaleConfig.role,
            name: scaleConfig.name,
            seed: scaleConfig.seed,
            anchorStep,
            steps,
        }
    }

    for (const role of SCALE_ROLES) {
        if (!scales[role]) {
            warnings.push({
                level: "fail",
                kind: "config",
                message: `No seed for the "${role}" scale — semantic tokens pointing at it cannot resolve.`,
            })
        }
    }

    return { scales, warnings }
}

function resolveSemantics(
    config: BrandConfig,
    scales: Record<ScaleRole, ResolvedScale>,
): { semantics: ResolvedSemantic[]; warnings: Warning[] } {
    const warnings: Warning[] = []
    const semantics: ResolvedSemantic[] = []

    // Derived here, never read off the config: the stored set is the deltas only.
    const { defs, orphaned } = semanticDefs(config.color.scales, config.color.semanticOverrides)
    for (const name of orphaned) {
        warnings.push({
            level: "warn",
            kind: "config",
            message: `This brand overrides \`${name}\`, which the system no longer generates. The edit is being ignored — remove it, or restore the token.`,
            tokens: [name],
        })
    }

    for (const def of defs) {
        const values = {} as Record<Mode, ResolvedSwatch>
        let ok = true
        for (const mode of MODES) {
            const ref = def[mode]
            const swatch = scales[ref.scale]?.steps[mode][ref.step]
            if (!swatch) {
                ok = false
                warnings.push({
                    level: "fail",
                    kind: "config",
                    message: `\`${def.name}\` points at ${ref.scale}-${ref.step} (${mode}), which does not exist.`,
                    tokens: [def.name],
                    mode,
                })
                continue
            }
            values[mode] = swatch
        }
        if (ok) semantics.push({ ...def, values })

    }

    return { semantics, warnings }
}

/** `--primary-600` etc. Primitives keep the Tailwind numbering everyone already knows. */
export const primitiveVar = (role: ScaleRole, step: Step): string => `--${role}-${step}`

function buildDeclarations(
    config: BrandConfig,
    scales: Record<ScaleRole, ResolvedScale>,
    semantics: ResolvedSemantic[],
    radius: Record<string, number>,
): Record<Mode, Declaration[]> {
    const colorFor = (mode: Mode): Declaration[] => {
        const out: Declaration[] = []
        for (const role of SCALE_ROLES) {
            const scale = scales[role]
            if (!scale) continue
            for (const step of STEPS) {
                out.push([primitiveVar(role, step), scale.steps[mode][step]!.css])
            }
        }
        // Semantics alias their primitive rather than restating the value, so the
        // exported CSS shows the mapping and a colour appears in exactly one place.
        // A translucent ref is the exception and has to restate it: a `var()`
        // holding `oklch(L C H)` has no alpha channel to bend. See DECISIONS #24.
        for (const token of semantics) {
            const ref = token[mode]
            out.push([
                `--${token.name}`,
                ref.alpha === undefined
                    ? `var(${primitiveVar(ref.scale, ref.step)})`
                    : oklchToCss(token.values[mode]!.oklch, ref.alpha),
            ])
        }
        return out
    }

    const light = colorFor("light")
    const dark = colorFor("dark")

    // Light carries the mode-invariant tokens too; the dark block only overrides
    // what actually changes (colour + elevation).
    /**
     * The brand's accent as a fixed colour — the one token in the system that
     * does NOT re-point in dark mode, which is why it lives here with the
     * mode-invariant declarations rather than in `colorFor`.
     *
     * A mark is not component code. The docs sanction reaching into the
     * `--secondary-*` primitive for a two-tone logo's accent path, and that is
     * the one place the primitive layer's mode-switching bites: the ramps
     * re-declare under `[data-theme="dark"]`, so the accent silently rendered as
     * two different colours in the two modes. A logo does not change colour with
     * the theme, so this does not either.
     */
    const secondary = scales.secondary
    if (secondary) {
        light.push(["--logo-accent", secondary.steps.light[secondary.anchorStep]!.css])
    }

    light.push(["--font-sans", config.typography.families.sans])
    light.push(["--font-mono", config.typography.families.mono])
    if (config.typography.families.serif) {
        light.push(["--font-serif", config.typography.families.serif])
    }
    if (config.typography.families.display) {
        light.push(["--font-display", config.typography.families.display])
    }

    for (const role of config.typography.roles) {
        light.push([
            `--text-${role.role}`,
            role.minSizeRem === undefined
                ? `${role.sizeRem}rem`
                : fluidSize(role.minSizeRem, role.sizeRem, config.typography.fluidRange),
        ])
        light.push([`--text-${role.role}--line-height`, String(role.lineHeight)])
        light.push([`--text-${role.role}--font-weight`, String(role.weight)])
        // Always emitted, `normal` when unset. The docs tell people to set four
        // properties per role; when a role skipped this one, copying that pattern
        // produced `letter-spacing: var(--undefined)` — invalid, dropped in
        // silence, which is the exact failure the instruction exists to prevent.
        light.push([`--text-${role.role}--letter-spacing`, role.tracking ?? "normal"])
    }

    for (const px of config.spacing.blessed) {
        light.push([`--space-${spaceName(px, config.spacing.basePx)}`, `${px / 16}rem`])
    }

    light.push(["--opacity-disabled", String(config.opacity.disabled)])
    light.push(["--opacity-loading", String(config.opacity.loading)])

    // Breakpoints ship as tokens even though CSS can't use a var() inside a
    // media query. They exist so the set is stated once, and so Tailwind's
    // `--breakpoint-*` namespace picks them up and generates the variants.
    for (const breakpoint of config.layout.breakpoints) {
        light.push([`--breakpoint-${breakpoint.name}`, `${breakpoint.minPx}px`])
    }

    for (const container of config.layout.containers) {
        light.push([`--container-${container.name}`, `${container.maxRem}rem`])
    }

    // The app frame's interior, and the stacking order it lives in. Both are
    // mode-invariant, so they go in the light block like every other structure.
    for (const dimension of config.layout.shell) {
        light.push([`--shell-${dimension.name}`, `${dimension.rem}rem`])
    }

    for (const layer of config.layout.zLayers) {
        light.push([`--z-${layer.name}`, String(layer.value)])
    }

    for (const [step, px] of Object.entries(radius)) {
        light.push([`--radius-${step}`, step === "full" ? "9999px" : `${px}px`])
    }

    for (const level of config.shadows.levels) {
        light.push([`--shadow-${level.name}`, level.layers.join(", ")])
        const darkShadow = DARK_SHADOWS[level.name]
        if (darkShadow) dark.push([`--shadow-${level.name}`, darkShadow])
    }

    for (const [name, ms] of Object.entries(config.motion.durations)) {
        light.push([`--duration-${name}`, `${ms}ms`])
    }
    for (const [name, curve] of Object.entries(config.motion.easings)) {
        light.push([`--ease-${name}`, curve])
    }

    return { light, dark }
}

export function resolveTokens(config: BrandConfig): ResolvedTokens {
    const { scales, warnings: scaleWarnings } = resolveScales(config)
    const { semantics, warnings: semanticWarnings } = resolveSemantics(config, scales)
    const radius = deriveRadius(config.radius.basePx, config.radius.steps)
    const declarations = buildDeclarations(config, scales, semantics, radius)

    const resolved: ResolvedTokens = {
        config,
        scales,
        semantics,
        radius,
        declarations,
        warnings: [...scaleWarnings, ...semanticWarnings],
    }

    // Contrast runs last: it reads resolved values, so it needs the finished
    // object. Distinctness runs beside it and asks the other half of the
    // question — a colour can be perfectly legible and still be the same colour
    // as the one next to it. See DECISIONS #39.
    resolved.warnings = [
        ...resolved.warnings,
        ...validateContrast(resolved),
        ...validateSyntaxDistinctness(resolved),
    ]
    return resolved
}

/** Look up a resolved semantic by name — used by the contrast pass and the docs. */
export function semanticByName(
    resolved: ResolvedTokens,
    name: string,
): ResolvedSemantic | undefined {
    return resolved.semantics.find((token) => token.name === name)
}
