/** What collides and what is not defined: the section that says where the system is thin. Part of DESIGN_SYSTEM.md; see ../designSystemMd.ts. */

import { apca, CHART_MIN_DELTA_E, COLLISION_DELTA_E, composite, deltaE, LC_THRESHOLD, SYNTAX_MIN_DELTA_E } from "../../engine/contrast"
import { spaceName } from "../../engine/defaults"
import { SCALE_ROLES, type ResolvedTokens, type SemanticGroup } from "../../engine/types"
import { chartPlanFor, scaleInkFor } from "../../engine/semantics"
import { primaryFamily } from "../css"
import { table, deviations, cellValue, tokenTable, labelPairsFor, SHADCN_NAMES, GROUP_TITLES, GROUP_ORDER } from "../mdHelpers"

export function collisions(resolved: ResolvedTokens): string {
    const rows: string[] = []
    for (const mode of ["light", "dark"] as const) {
        // Grouped by perceptual distance, not by string equality. Acceptance run
        // 9 found `--secondary-subtle` and `--warning-subtle` one channel value
        // apart — the same colour to any reader, and invisible to a table keyed
        // on the hex. A near-collision is exactly as misleading as an exact one,
        // and the exact ones were the only kind being reported.
        const groups: Array<{
            key: string
            hex: string
            alpha: number | undefined
            names: string[]
            exact: boolean
        }> = []
        for (const token of resolved.semantics) {
            // Alpha is part of the identity, so a translucent token is never
            // reported as "the same colour as" the opaque one it derives from —
            // `--scrim` and `--foreground` share a hex and look nothing alike.
            const { alpha } = token[mode]
            const hex = token.values[mode]!.hex
            const match = groups.find(
                (group) =>
                    group.alpha === alpha && deltaE(group.hex, hex) < COLLISION_DELTA_E,
            )
            if (match) {
                match.names.push(token.name)
                if (match.hex !== hex) match.exact = false
                continue
            }
            groups.push({
                key: alpha === undefined ? hex : `${hex} at ${Math.round(alpha * 100)}%`,
                hex,
                alpha,
                names: [token.name],
                exact: true,
            })
        }
        for (const group of groups) {
            if (group.names.length < 2) continue
            rows.push(
                `| ${mode} | \`${group.key}\` | ${group.exact ? "identical" : "indistinguishable"} | ${group.names.map((name) => `\`--${name}\``).join(", ")} |`,
            )
        }
    }
    if (rows.length === 0) return "Every semantic token currently resolves to a distinct colour."
    return `These tokens share a value right now. They are still separate tokens with separate jobs —
use the one that describes your intent, because the values diverge the moment the ramp is re-tuned.

| Mode | Value | How close | Tokens |
| --- | --- | --- | --- |
${rows.join("\n")}

**"Indistinguishable" is not a rounding note.** Those rows differ by less than ΔE ${COLLISION_DELTA_E}
in OKLab, which no reader will see. Treat them exactly as you would treat identical ones.`
}

/**
 * What this system does NOT define. Say it, or every implementer invents it
 * silently.
 *
 * A function rather than a constant since acceptance run 8: the one sentence in
 * this list that admitted a gap and told the reader to verify was itself a
 * hand-written measurement, and wrong in light mode. DECISIONS #31 applies here
 * as much as anywhere — more, because this is the section a reader trusts.
 */
export function notDefined(resolved: ResolvedTokens): string {
    const measure = (a: string, b: string, mode: "light" | "dark") =>
        Math.abs(
            apca(
                resolved.semantics.find((t) => t.name === a)?.values[mode]!.hex ?? "#000000",
                resolved.semantics.find((t) => t.name === b)?.values[mode]!.hex ?? "#ffffff",
            ),
        ).toFixed(0)
    const LIGHT_PRIMARY_ON_SURFACE = measure("primary", "surface", "light")
    const DARK_PRIMARY_ON_SURFACE = measure("primary", "surface", "dark")

    return `The system stops here on purpose. These have **no tokens**, so if you need one,
pick a value, keep it consistent within the file you're writing, and flag it — do not present it as
part of the system:

- **Icon box size.** The icon *stroke* is specified (see the craft rules); the box is not. The
  stroke rule also covers weight 400 and 600 only, and every button uses \`label\` at weight 500.
- **The inside of the app frame.** \`--shell-*\` gives the sidebar, header, aside and table
  minimum; \`--z-*\` gives the stacking order. What they do *not* give is the furniture's own
  padding: nav item height, sidebar inset, table cell padding, dialog width. Those are still yours.
- **Emphasis on a card.** No token or recipe for marking one of several cards as recommended or
  selected. \`--primary\` as a border is the obvious move; measured on this brand it is Lc
  ${LIGHT_PRIMARY_ON_SURFACE} against \`--surface\` in light and Lc ${DARK_PRIMARY_ON_SURFACE} in
  dark, against a visible-boundary bar of ${LC_THRESHOLD["non-text"]} — so it works in one mode and
  is marginal in the other, which is exactly the kind of thing to verify per brand rather than
  inherit. There is still no token and no recipe: colour alone should not be the only marker of a
  recommended plan anyway.
- **A wordmark treatment.** Even with a mark defined, nothing says which type role, weight or
  colour the brand name takes when it is set in type.
- **Font weights as standalone tokens.** Weight arrives with a type role and nothing else.
- **The loading sweep's duration.** The colours exist and the gradient is buildable from them —
  \`--skeleton\` → \`--skeleton-surface\` → \`--skeleton\` as a \`linear-gradient\` at 200%
  width, animated on \`background-position\` (never on \`opacity\`, which throws away the contrast
  the audit measured). What is missing is the duration: the slowest token is \`--duration-slow\`,
  which is a UI transition, not a loop. Pick a loop duration — 1.5s is conventional — and say so.
- **Overlay geometry.** Dialog width and radius, tooltip placement and offset, dropdown width — all
  yours. The tokens say what colour and which layer, never how big or where.
- **Which narrow-screen pattern the sidebar uses.** The widths are defined and the breakpoints are
  defined; whether the sidebar collapses to the icon rail or slides in as a drawer is not, and the
  two need different z-layers and different dismiss behaviour.
- **Neither opacity token has a documented consumer.** \`--opacity-disabled\` sounds like it belongs
  on a disabled control and does not: that recipe is a translucent *fill* (\`--state-disabled\`) plus
  \`--foreground-tertiary\`, both already calibrated, and fading them further would undo the
  calibration. \`--opacity-loading\` has the same problem in reverse — skeletons are explicitly
  forbidden from using opacity. Both exist, both are blessed values if you need one for something the
  system does not model (a dimmed backdrop behind a spinner, a ghosted drag preview), and neither is
  guidance. Do not fade text with either.
- **Concentric radius when the parent has no radius.** The formula gives 0 for every child of an
  unrounded padded container — a sidebar, a page shell — which squares every nav item inside one.
  That follows from the rule; whether you want it is a judgement the rule does not make for you.
- **Blur.** Not modelled. (Opacity is — \`--opacity-disabled\` and \`--opacity-loading\` — but only
  those two, and neither is for live text.)
- **Theme persistence.** The attribute is defined; storing the choice, seeding it from the OS
  preference, and avoiding a flash on first paint are all yours.
- **Touch-target switching.** The craft rules ask for 44px on touch, but the breakpoint set is
  width-based and CSS cannot detect touch from it. Pick a rule and state it.`
}

/**
 * The mark and the typeface files. Neither was documented at all, which meant an
 * agent handed the export could not tell that a logo existed.
 */
