/**
 * What every section of DESIGN_SYSTEM.md is written with: the table
 * builder, the deviations from a model's priors, the token tables, and the
 * names and order of the groups. Split out of designSystemMd.ts so each
 * section can be read on its own.
 */

import { apca, CHART_MIN_DELTA_E, COLLISION_DELTA_E, composite, deltaE, LC_THRESHOLD, SYNTAX_MIN_DELTA_E } from "../engine/contrast"
import { spaceName } from "../engine/defaults"
import { SCALE_ROLES, type ResolvedTokens, type SemanticGroup } from "../engine/types"
import { chartPlanFor, scaleInkFor } from "../engine/semantics"
import { primaryFamily } from "./css"


/** shadcn's vocabulary, which is what a model reaches for unprompted. */
export const SHADCN_NAMES = [
    "background",
    "foreground",
    "card",
    "card-foreground",
    "popover",
    "popover-foreground",
    "primary",
    "primary-foreground",
    "secondary",
    "secondary-foreground",
    "muted",
    "muted-foreground",
    "accent",
    "accent-foreground",
    "destructive",
    "destructive-foreground",
    "border",
    "input",
    "ring",
]

export const GROUP_TITLES: Record<SemanticGroup, string> = {
    surface: "Surfaces",
    text: "Text",
    link: "Links",
    state: "Interactive states",
    border: "Borders and focus",
    brand: "Brand",
    status: "Status",
    inverse: "Inverse regions",
    code: "Code and syntax",
    chart: "Chart series",
    scale: "Sequential scale",
}

export const GROUP_ORDER: SemanticGroup[] = ["surface", "text", "link", "state", "border", "brand", "status", "inverse", "code", "chart", "scale"]

export function table(headers: string[], rows: string[][]): string {
    const head = `| ${headers.join(" | ")} |`
    const rule = `| ${headers.map(() => "---").join(" | ")} |`
    const body = rows.map((row) => `| ${row.join(" | ")} |`).join("\n")
    return [head, rule, body].join("\n")
}

/**
 * Where this system contradicts a default assumption — and *only* the parts that
 * need the brand to be known.
 *
 * This list used to restate seven of `SKILL.md`'s hard rules verbatim, values
 * and all. That is not free: `SKILL.md` always loads and this file is read after
 * it, so the second copy taught an agent nothing it had not already been told,
 * and it was seven more places for a rule to drift out of step with the file
 * that stated it first. Drift between two statements of the same rule is the
 * defect class every acceptance run finds; see DECISIONS #30.
 *
 * What stays: the shadcn name mapping (computed from which names this brand
 * actually lacks), the on-brand trap (placed here deliberately after an earlier
 * run, and pinned by a test), the label-polarity note (only claimed in the modes
 * where it is true), and the brand's own hand-written deviations. Everything
 * else is a rule, and rules live in SKILL.md.
 */
export function deviations(resolved: ResolvedTokens): string[] {
    const { config } = resolved
    const names = new Set(resolved.semantics.map((token) => token.name))
    const out: string[] = []

    const missing = SHADCN_NAMES.filter((name) => !names.has(name))
    if (missing.length > 0) {
        const replacements: Record<string, string> = {
            card: "surface",
            "card-foreground": "foreground",
            popover: "surface-raised",
            "popover-foreground": "foreground",
            accent: "state-hover",
            "accent-foreground": "foreground",
            destructive: "danger",
            "destructive-foreground": "danger-foreground",
        }
        const mapped = missing
            .map((name) => (replacements[name] ? `\`${name}\` → \`${replacements[name]}\`` : `\`${name}\``))
            .join(", ")
        out.push(
            `**This is not shadcn's token set.** These common names do not exist here: ${mapped}. Using one produces an unstyled element, silently.`,
        )
    }



    out.push(
        `**On a coloured fill, the neutral text tokens are wrong.** Inside a \`--primary\` band or a solid status banner, text and controls take that fill's own \`-foreground\` — for text *and* border. \`--foreground\` is dark ink and is unreadable there. Full-bleed call-to-action sections are where this bites.`,
    )






    const onFills = resolved.semantics.filter(
        (token) => token.name.endsWith("-foreground") && token.light.scale === "neutral",
    )
    if (onFills.length > 0) {
        // Only claim the polarity actually splits in a mode where it does.
        const split = (["light", "dark"] as const).filter((mode) => {
            const lightnesses = onFills.map((token) => token.values[mode]!.oklch.l)
            return Math.max(...lightnesses) - Math.min(...lightnesses) > 0.3
        })
        const where =
            split.length === 2
                ? "in both modes"
                : split.length === 1
                  ? `in ${split[0]} mode (they are all the same colour in ${split[0] === "dark" ? "light" : "dark"})`
                  : "should a fill ever need it"
        out.push(
            `**Labels on solid fills come from the neutral ramp**, not from the fill's own scale, and their polarity is chosen by measuring contrast against each fill. That means they do not all match — ${where}. \`--warning-foreground\` can be dark while \`--primary-foreground\` is light. Do not "correct" this to a single colour.`,
        )
    }

    return [...out, ...config.meta.deviations.map((note) => `${note}`)]
}

/**
 * A hex is a lie for a translucent token: `--scrim` resolves to a colour at 60%
 * and printing `#1f262d` invites somebody to build an opaque backdrop out of it.
 * Alpha tokens therefore print what actually ships.
 */
export function cellValue(token: ResolvedTokens["semantics"][number], mode: "light" | "dark"): string {
    const { alpha } = token[mode]
    if (alpha === undefined) return `\`${token.values[mode]!.hex}\``
    return `\`${token.values[mode]!.hex}\` at ${Math.round(alpha * 100)}%`
}

export function tokenTable(resolved: ResolvedTokens, group: SemanticGroup): string {
    const rows = resolved.semantics
        .filter((token) => token.group === group)
        .map((token) => [
            `\`--${token.name}\``,
            cellValue(token, "light"),
            cellValue(token, "dark"),
            token.description,
        ])
    return table(["Token", "Light", "Dark", "Use it for"], rows)
}

/**
 * The six solid role fills and their labels, measured, worst first — so the docs
 * cite the real floor instead of whichever pair somebody happened to measure.
 *
 * Restricted to the role fills on purpose: `--muted`, `--inverse` and the
 * `-subtle` washes all have a `-foreground` too, and sweeping them in produced a
 * fourteen-item list in which the genuine label floor was buried.
 */
export function labelPairsFor(resolved: ResolvedTokens): Array<{ role: string; lc: number }> {
    const by = new Map(resolved.semantics.map((token) => [token.name, token]))
    return SCALE_ROLES.filter((role) => role !== "neutral")
        .flatMap((role) => {
            const fill = by.get(role)
            const label = by.get(`${role}-foreground`)
            if (!fill || !label) return []
            return [{ role, lc: Math.abs(apca(label.values.light!.hex, fill.values.light!.hex)) }]
        })
        .sort((a, b) => a.lc - b.lc)
}

