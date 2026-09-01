/**
 * Loading a saved brand.
 *
 * `brands/*.json` are real files with a life of their own — written by autosave,
 * edited by hand, committed, and read back weeks later. Adding a field to
 * `BrandConfig` therefore breaks every file written before it existed, and the
 * failure is a hard crash on first render rather than anything diagnosable.
 *
 * So a loaded config is never trusted as-is: it is merged over a complete
 * default, block by block. A file missing `layout` gains the default layout; a
 * file that has one keeps every word of it.
 */

import { DEFAULT_SHADOWS } from "./defaults"
import { defaultSemanticMapping } from "./semantics"
import type { BrandConfig, ScaleConfig, SemanticOverride, SemanticRef, SemanticTokenDef } from "./types"

/** Blocks that are replaced wholesale when present, and defaulted when absent. */
const BLOCKS = [
    "meta",
    "color",
    "typography",
    "layout",
    "spacing",
    "opacity",
    "radius",
    "shadows",
    "motion",
    "rules",
] as const

export interface MigrationResult {
    config: BrandConfig
    /** Blocks that were missing and filled from defaults — surfaced, never silent. */
    filled: string[]
    /**
     * Tokens converted from the old stored-semantics format into overrides.
     * Empty for any file written after the format changed.
     */
    inferredOverrides: string[]
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}

const sameRef = (a: SemanticRef | undefined, b: SemanticRef | undefined): boolean =>
    a?.scale === b?.scale && a?.step === b?.step

/**
 * Convert a pre-override file, which stored the whole resolved semantic set.
 *
 * A stored token that still matches what the generator produces was never
 * touched, so it becomes nothing. A stored token that differs becomes an
 * override, which preserves genuine hand edits across the format change.
 *
 * The honest caveat: this cannot tell a hand edit from a *stale default* — a
 * token that differs because the generator improved since the file was written
 * looks identical to one a human moved, and gets frozen as an override. That is
 * survivable only because it was checked before shipping: at the time of the
 * change the one real brand file had drifted in exactly zero of its 57 tokens,
 * so this path provably converted nothing. It is here for files written
 * elsewhere, and it is why the conversion is reported rather than performed
 * quietly. See DECISIONS #22.
 */
function inferOverrides(stored: unknown, scales: ScaleConfig[]): SemanticOverride[] {
    if (!Array.isArray(stored)) return []
    const generated = new Map(defaultSemanticMapping(scales).map((def) => [def.name, def]))
    const overrides: SemanticOverride[] = []

    for (const token of stored as SemanticTokenDef[]) {
        const def = generated.get(token?.name)
        if (!def) continue
        const override: SemanticOverride = { name: token.name }
        if (!sameRef(token.light, def.light)) override.light = token.light
        if (!sameRef(token.dark, def.dark)) override.dark = token.dark
        if (override.light || override.dark) overrides.push(override)
    }
    return overrides
}

export function migrateConfig(raw: unknown, defaults: BrandConfig): MigrationResult {
    if (!isObject(raw)) return { config: defaults, filled: ["everything"], inferredOverrides: [] }

    const config = { ...defaults } as unknown as Record<string, unknown>
    const filled: string[] = []

    for (const block of BLOCKS) {
        const value = raw[block]
        if (!isObject(value)) {
            filled.push(block)
            continue
        }
        /**
         * Merged key-by-key over the default rather than swapped in wholesale.
         *
         * A block that gains a field after a file is written used to hand back
         * `undefined` for it, and the failure was a crash at first render with
         * no clue attached. That is the bug DECISIONS #12 was written about, and
         * it recurred twice more — once when `shadows` changed shape, once when
         * `layout` gained `zLayers` and `shell` — because the fix then was
         * per-block and this is per-key. Missing keys are reported, not filled
         * in silence.
         */
        const defaultBlock = (defaults as unknown as Record<string, unknown>)[block]
        if (isObject(defaultBlock)) {
            const missing = Object.keys(defaultBlock).filter((key) => !(key in value))
            if (missing.length > 0) filled.push(`${block}.{${missing.join(", ")}}`)
            config[block] = { ...defaultBlock, ...value }
        } else {
            config[block] = value
        }
    }

    // The colour block needs more than a wholesale swap: it changed shape when
    // the semantic set stopped being persisted.
    // Read from `raw`, not from the merged block: the key-merge above fills in
    // the default `semanticOverrides: []`, and trusting that would make a
    // pre-override file look like a current one and skip the conversion —
    // silently discarding every hand edit it carried.
    const rawColor = (isObject(raw.color) ? raw.color : {}) as {
        scales?: ScaleConfig[]
        semanticOverrides?: unknown
        semantics?: unknown
    }
    const color = config.color as { scales?: ScaleConfig[] }
    const scales = Array.isArray(color?.scales) ? color.scales : defaults.color.scales
    let inferredOverrides: string[] = []

    if (Array.isArray(rawColor.semanticOverrides)) {
        config.color = { scales, semanticOverrides: rawColor.semanticOverrides as SemanticOverride[] }
    } else {
        const overrides = inferOverrides(rawColor.semantics, scales)
        inferredOverrides = overrides.map((override) => override.name)
        config.color = { scales, semanticOverrides: overrides }
    }

    /**
     * Named collections are merged item by item, not replaced wholesale.
     *
     * This is the fourth and deepest instance of one bug: a default that a saved
     * brand's block silently overrides. #12 was a missing block; then `shadows`
     * changed shape; then `layout` gained keys; and then `layout.containers`
     * gained an *item* — `--container-intro` — which never reached the export at
     * all, because the brand's four-item array replaced the five-item default.
     * The docs described a token that did not exist, and `var(--container-intro)`
     * resolves to nothing, so a headline meant to be capped ran full-bleed.
     *
     * Every one of these arrays is a keyed set — the system's vocabulary, named
     * for the job. So the brand's item wins where it has one and the default is
     * appended where it does not. Deleting a default is not supported, which is
     * the right trade: these are closed sets by design, and silently missing one
     * is how a documented token turns out not to exist.
     */
    const COLLECTIONS: Array<[block: string, key: string]> = [
        ["layout", "breakpoints"],
        ["layout", "containers"],
        ["layout", "zLayers"],
        ["layout", "shell"],
        ["typography", "roles"],
    ]
    for (const [block, key] of COLLECTIONS) {
        const target = config[block] as Record<string, unknown> | undefined
        const fallback = (defaults as unknown as Record<string, Record<string, unknown>>)[block]?.[key]
        if (!Array.isArray(target?.[key]) || !Array.isArray(fallback)) continue
        const idOf = (item: unknown) => (item as { name?: string; role?: string }).name ?? (item as { role?: string }).role
        const present = new Set((target[key] as unknown[]).map(idOf))
        const missing = (fallback as unknown[]).filter((item) => !present.has(idOf(item)))
        if (missing.length > 0) {
            target[key] = [...(target[key] as unknown[]), ...missing]
            filled.push(`${block}.${key}[${missing.map(idOf).join(", ")}]`)
        }
    }

    /**
     * Shadow levels are keyed by name, and the names changed when elevation
     * stopped being a size scale (`sm`/`md`/`lg`) and became a pairing with the
     * surfaces (`sm`/`raised`/`overlay`). A file carrying the old names kept
     * them silently — and worse, lost its dark-mode override, because
     * `DARK_SHADOWS` is looked up by name and no longer had an entry. So unknown
     * levels are dropped and missing ones are restored from defaults.
     */
    const shadows = config.shadows as BrandConfig["shadows"] | undefined
    const known = new Set(DEFAULT_SHADOWS.levels.map((level) => level.name))
    const kept = (shadows?.levels ?? []).filter((level) => known.has(level.name))
    const dropped = (shadows?.levels ?? []).filter((level) => !known.has(level.name))
    if (dropped.length > 0 || kept.length !== DEFAULT_SHADOWS.levels.length) {
        config.shadows = {
            levels: DEFAULT_SHADOWS.levels.map(
                (fallback) => kept.find((level) => level.name === fallback.name) ?? fallback,
            ),
        }
        if (dropped.length > 0) filled.push(`shadows (dropped ${dropped.map((l) => l.name).join(", ")})`)
    }

    // Version is informational today; when a real migration is needed this is
    // where it branches.
    config.$schemaVersion = defaults.$schemaVersion

    return { config: config as unknown as BrandConfig, filled, inferredOverrides }
}
