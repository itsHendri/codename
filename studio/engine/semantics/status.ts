/** The status tokens: success, warning, danger, info, each on its wash. Split out of semantics.ts. */

import { apca, channelShift, CHART_MIN_DELTA_E, composite, deltaE, LC_THRESHOLD } from "../contrast"
import { generateScale, oklchToHex } from "../scale"
import {
    STEPS,
    type Mode,
    type ScaleConfig,
    type ScaleRole,
    type SemanticOverride,
    type SemanticTokenDef,
    type Step,
} from "../types"

import { idx, at, shift, DARK_LIFT, type Ramps, buildRamps, anchorsFor, pickAgainst, INK_CANDIDATES, PAPER_CANDIDATES, onFill, pickFill, WASH_ALPHAS, belowActive, maxWashAlpha, MIN_WASH_SHIFT, MIN_REGION_SHIFT, minVisibleAlpha, pickSubtle, interactionDirection, borderCandidates } from "./pick"
import { actionTokens } from "./action"

export function statusTokens(
    role: Extract<ScaleRole, "success" | "warning" | "danger" | "info">,
    anchor: Step,
    ramps: Ramps,
    subtle: Record<Mode, Step>,
): SemanticTokenDef[] {
    const ramp = ramps[role]
    const neutral = ramps.neutral
    const lightFill = pickFill(ramp.light, neutral.light, anchor)
    const darkFill = pickFill(ramp.dark, neutral.dark, shift(anchor, -DARK_LIFT))
    const label = role === "danger" ? "destructive" : role

    // Status fills get hover/active for the same reason brand fills do: the
    // system tells you to build a destructive button, and without these its
    // hover state is inexpressible — `--state-hover` is a neutral wash, and
    // computing one with filter/opacity is banned by name.
    const foreground = {
        light: onFill(neutral.light, ramp.light[lightFill]!),
        dark: onFill(neutral.dark, ramp.dark[darkFill]!),
    }
    const direction = {
        light: interactionDirection(neutral.light, foreground.light.step, ramp.light[lightFill]!),
        dark: interactionDirection(neutral.dark, foreground.dark.step, ramp.dark[darkFill]!),
    }

    return [
        {
            name: role,
            group: "status",
            light: { scale: role, step: lightFill },
            dark: { scale: role, step: darkFill },
            description: `Solid ${label} fill — ${label} buttons, filled badges, chart series.`,
        },
        {
            name: `${role}-foreground`,
            group: "status",
            light: foreground.light,
            dark: foreground.dark,
            description: `Text and icons on a solid \`${role}\` fill.`,
        },
        {
            name: `${role}-hover`,
            group: "state",
            light: { scale: role, step: shift(lightFill, direction.light) },
            dark: { scale: role, step: shift(darkFill, direction.dark) },
            description: `Hover state of a solid \`${role}\` fill — a ${label} button.`,
        },
        {
            name: `${role}-active`,
            group: "state",
            light: { scale: role, step: shift(lightFill, direction.light * 2) },
            dark: { scale: role, step: shift(darkFill, direction.dark * 2) },
            description: `Pressed state of a solid \`${role}\` fill.`,
        },
        {
            name: `${role}-subtle`,
            group: "status",
            light: { scale: role, step: subtle.light },
            dark: { scale: role, step: subtle.dark },
            description: `Background of a ${label} banner, alert or inline message.`,
        },
        {
            name: `${role}-subtle-foreground`,
            group: "status",
            light: { scale: role, step: pickAgainst(ramp.light, ramp.light[subtle.light]!, INK_CANDIDATES, LC_THRESHOLD.body) },
            dark: { scale: role, step: pickAgainst(ramp.dark, ramp.dark[subtle.dark]!, PAPER_CANDIDATES, LC_THRESHOLD.body) },
            description: `Text on \`${role}-subtle\`. This is the ${label} text colour — not \`${role}\`.`,
        },
        {
            name: `${role}-border`,
            group: "status",
            // Measured against the fill it outlines, and drawn from the steps
            // beyond it. Adjacent steps produce a border at Lc 0 — a boundary
            // nobody can see, which is the same as no boundary while costing a
            // token.
            light: {
                scale: role,
                step: pickAgainst(ramp.light, ramp.light[subtle.light]!, borderCandidates(subtle.light, "light"), LC_THRESHOLD["non-text"]),
            },
            dark: {
                scale: role,
                step: pickAgainst(ramp.dark, ramp.dark[subtle.dark]!, borderCandidates(subtle.dark, "dark"), LC_THRESHOLD["non-text"]),
            },
            description: `Border of a ${label} banner or field.`,
        },
    ]
}

/**
 * Categorical chart series — as many as this brand's seeds can actually keep
 * apart, which is not the same as how many ramps it has.
 *
 * Three rules, and the count falls out of them rather than being chosen:
 *
 * **One step for every series, and it is the primary's anchor.** A categorical
 * palette needs equal visual weight across series — one line must not read as
 * more important than another — so every series sits at the same step rather
 * than at its own ramp's anchor. Using `anchors.primary` means `--chart-1` is
 * the brand colour verbatim in light, which is the same promise `--primary` and
 * `--ring` make (DECISIONS #4), and the dark lift is the one the rest of the
 * system already uses. If that step cannot clear the visible-boundary bar
 * against both grounds, the search walks toward the ink end until it does.
 *
 * **The order is fixed once, from the light ramp, and applies to both modes.** A
 * series that is orange in light and red in dark is a legend that lies the
 * moment somebody flips the theme. Light is the canonical identity (#5).
 * Greedy: start at the brand, then repeatedly take whichever remaining ramp is
 * furthest from everything already chosen.
 *
 * **The run stops at the first series that is too close to one already in it.**
 * Not "emit six and warn" — a token that exists is a token somebody will use,
 * and the sixth series of a five-series palette is a bug you shipped rather than
 * a warning they read. On seeds whose hues cluster, this returns three.
 */
