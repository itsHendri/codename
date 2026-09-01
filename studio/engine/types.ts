/**
 * The contract everything else compiles against.
 *
 * BrandConfig is the source of truth (small, hand-editable, versioned).
 * ResolvedTokens is derived — never persisted — and carries `declarations`,
 * the single serialization consumed by BOTH the live preview and every export.
 */

export type Mode = "light" | "dark"

export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const
export type Step = (typeof STEPS)[number]

export const SCALE_ROLES = [
    "primary",
    "secondary",
    "neutral",
    "success",
    "warning",
    "danger",
    "info",
] as const
export type ScaleRole = (typeof SCALE_ROLES)[number]

export interface Oklch {
    l: number // 0..1
    c: number // 0..~0.4
    h: number // 0..360
}

/** Per-scale generation knobs. Exposed so dark aesthetics stay tunable (see DECISIONS #3). */
export interface ScaleTuning {
    /** Max chroma allowed at any step. Neutrals cap low so they read as neutral. */
    maxChroma?: number
    /** Degrees of hue rotation across the ramp: +shift at step 50 → -shift at 950. */
    hueShift?: number
    /** Multiply the whole chroma curve (0 = greyscale, 1 = as-seeded). */
    chromaScale?: number
}

export interface ScaleConfig {
    role: ScaleRole
    /** Display name, e.g. "Ink", "Signal". Cosmetic only — CSS vars use `role`. */
    name: string
    /** Any CSS colour string. Warped onto its nearest step so it appears verbatim. */
    seed: string
    /** Manual per-step colour overrides, per mode. */
    overrides?: Partial<Record<Mode, Partial<Record<Step, string>>>>
    tuning?: Partial<Record<Mode, ScaleTuning>>
}

/** An alias from a semantic token into a primitive step. */
export interface SemanticRef {
    scale: ScaleRole
    step: Step
    /**
     * 0..1. Present only where the token is genuinely translucent — a scrim, a
     * wash that has to work on a surface the system doesn't know in advance.
     *
     * A ref with an alpha cannot alias its primitive (`var(--neutral-950)` has
     * no opacity to bend), so it emits a literal `oklch(… / a)` instead. That is
     * the one documented exception to DECISIONS #6, and the reason it is opt-in
     * per ref rather than a separate token type. See DECISIONS #24.
     */
    alpha?: number
}

/**
 * A human re-pointing one semantic token, in one mode.
 *
 * This is the ONLY part of the semantic layer that is persisted. Everything else
 * — the name, the group, the description, and every ref nobody touched — is
 * regenerated from the seeds on load, so improving `defaultSemanticMapping`
 * reaches brands that already exist instead of stopping at the ones not yet
 * written. Storing the resolved set was the bug; storing the deltas is the fix.
 */
export interface SemanticOverride {
    /** Matches `SemanticTokenDef.name`. An override for an unknown name is dropped, loudly. */
    name: string
    light?: SemanticRef
    dark?: SemanticRef
}

export type SemanticGroup =
    | "surface"
    | "text"
    | "link"
    | "brand"
    | "state"
    | "border"
    | "status"
    | "inverse"
    | "code"
    | "chart"
    | "scale"

export interface SemanticTokenDef {
    /** CSS var name without the `--`, e.g. "primary-foreground". */
    name: string
    group: SemanticGroup
    light: SemanticRef
    dark: SemanticRef
    /** Flows into DTCG `$description` and the generated docs. Say WHEN to use it. */
    description: string
}

export type TypeRoleName =
    | "display"
    | "heading-lg"
    | "heading"
    | "heading-sm"
    | "body-lg"
    | "body"
    | "body-sm"
    | "label"
    | "code"

export interface TypeRole {
    role: TypeRoleName
    family: FontFamilyName
    /** The size at the top of the fluid range, and the fixed size without one. */
    sizeRem: number
    /**
     * Set this and the role becomes fluid: it emits a `clamp()` that grows from
     * `minSizeRem` at the base viewport to `sizeRem` at the top of the range.
     * Only worth it for large roles — body text should not move.
     */
    minSizeRem?: number
    lineHeight: number
    weight: number
    tracking?: string
    transform?: "none" | "uppercase"
}

export interface ShadowLevel {
    /**
     * Named for the surface it pairs with, not for its size. `raised` goes with
     * `--surface-raised` and `overlay` with `--surface-overlay`, so the pairing
     * cannot be got wrong; `sm` is the odd one out and is deliberately not an
     * elevation level — it is a hairline lift for a control.
     */
    name: "sm" | "raised" | "overlay"
    /** Layered box-shadow parts, joined with ", ". Colours may be `oklch(...)`. */
    layers: string[]
}

/**
 * A min-width where the layout is allowed to change. Mobile-first: the base
 * styles are the narrowest case and every breakpoint is an upgrade, which is why
 * there is no `max` — a system with both directions has two sources of truth.
 */
export interface Breakpoint {
    name: string
    minPx: number
    /** What actually changes here. A breakpoint without a reason is a guess. */
    note: string
}

/**
 * A stacking layer. A closed, named set for the same reason breakpoints are one:
 * the alternative is every component inventing a number, and the loser of that
 * argument is whoever ships last.
 */
export interface ZLayer {
    name: string
    value: number
    /** What lives here, and why it sits where it does relative to its neighbours. */
    note: string
}

/**
 * A fixed dimension inside the app frame — the things `--container-*` does not
 * bound, because containers describe the page and these describe its furniture.
 */
export interface ShellDimension {
    name: string
    rem: number
    note: string
}

/** A max-width. Named for the job it does, like everything else in the system. */
export interface Container {
    name: string
    maxRem: number
    note: string
}

/**
 * A font file living in `brands/assets/<slug>/`. One entry per weight and style,
 * because that is how `@font-face` works — a family is a set of files, not one.
 */
/**
 * `display` is a real slot, not a role that borrows the sans. A display face is
 * usually a different typeface entirely — drawn for size, often unusable below
 * a headline — so pretending it is a weight of the body font loses the thing
 * that makes it a display face.
 */
export type FontFamilyName = "sans" | "serif" | "mono" | "display"

export interface FontFile {
    fileName: string
    family: FontFamilyName
    weight: number
    style: "normal" | "italic"
}

export interface BrandMeta {
    id: string
    name: string
    /** Keys files and the exported skill name. kebab-case. */
    slug: string
    domain?: string
    /**
     * Stored inline rather than as a file, on purpose: an inline SVG can take
     * `fill="currentColor"` and follow the foreground token, so one logo works
     * in both modes. A raster logo goes in `logoFile` and cannot do that.
     */
    logoSvg?: string
    logoFile?: string
    /** Adjectives → the voice section of the generated docs. */
    voice: string[]
    /** Hand-authored 🚨 bullets, merged with computed deviations at export time. */
    deviations: string[]
}

export interface BrandConfig {
    $schemaVersion: 1
    meta: BrandMeta
    color: {
        scales: ScaleConfig[]
        /**
         * Sparse — only the tokens a human actually re-pointed. The full set is
         * derived by `semanticDefs()`, never stored. See `SemanticOverride`.
         */
        semanticOverrides: SemanticOverride[]
    }
    typography: {
        families: { sans: string; serif?: string; mono: string; display?: string }
        /**
         * The viewport range a fluid role scales across. Below `minPx` it sits at
         * its minimum, above `maxPx` at its maximum.
         */
        fluidRange?: { minPx: number; maxPx: number }
        /** Optional <link> hrefs for hosted webfonts. */
        fontLinks?: string[]
        /** Uploaded font files, turned into `@font-face` rules. */
        fontFiles?: FontFile[]
        roles: TypeRole[]
    }
    layout: {
        breakpoints: Breakpoint[]
        containers: Container[]
        zLayers: ZLayer[]
        shell: ShellDimension[]
    }
    spacing: { basePx: number; blessed: number[] }
    /**
     * The only two opacities the system blesses. Deliberately not a ramp:
     * Atlassian ships exactly these two, and an opacity scale invites people to
     * fade text — which is how contrast is lost silently, since no audit can
     * measure a colour whose ground it doesn't know.
     */
    opacity: { disabled: number; loading: number }
    radius: { basePx: number; concentric: boolean; steps?: Partial<Record<RadiusStep, number>> }
    shadows: { levels: ShadowLevel[] }
    motion: {
        durations: Record<"instant" | "fast" | "base" | "slow", number>
        easings: Record<"out" | "in" | "in-out" | "spring", string>
    }
    /** Universal polish rules (Krehel's set). Brand values override the rule's defaults. */
    rules: { polish: Record<string, boolean> }
}

export type RadiusStep = "sm" | "md" | "lg" | "xl" | "full"

// ── Resolved (derived, never persisted) ──────────────────────────────────────

export interface ResolvedSwatch {
    oklch: Oklch
    /** `oklch(L% C H)` — what ships in CSS. */
    css: string
    /** sRGB fallback + docs/table display. */
    hex: string
    overridden: boolean
}

export type ResolvedScale = {
    role: ScaleRole
    name: string
    seed: string
    /** The step the seed snapped to — the default anchor for `primary`/`secondary`. */
    anchorStep: Step
    steps: Record<Mode, Record<Step, ResolvedSwatch>>
}

export interface ResolvedSemantic extends SemanticTokenDef {
    values: Record<Mode, ResolvedSwatch>
    /** Per mode: did a human re-point this, or is it what the seeds generated? */
    overridden: Record<Mode, boolean>
}

export type Declaration = [cssVar: string, value: string]

export interface Warning {
    level: "fail" | "warn"
    kind: "contrast" | "distinctness" | "scale" | "config"
    message: string
    mode?: Mode
    /** Semantic token names involved, for jump-to-token in the UI. */
    tokens?: string[]
    apcaLc?: number
    wcagRatio?: number
    requiredLc?: number
    /** A suggested one-click fix: re-point `token` at `ref` in `mode`. */
    fix?: { token: string; mode: Mode; ref: SemanticRef }
}

export interface ResolvedTokens {
    config: BrandConfig
    scales: Record<ScaleRole, ResolvedScale>
    semantics: ResolvedSemantic[]
    radius: Record<RadiusStep, number>
    /**
     * THE shared serialization. Preview injects these; exporters print these.
     * Preview and export cannot drift because there is only one array.
     */
    declarations: Record<Mode, Declaration[]>
    warnings: Warning[]
}
