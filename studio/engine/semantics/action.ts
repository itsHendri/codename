/** The action tokens: primary and its hover, pressed and disabled. Split out of semantics.ts. */

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

export function actionTokens(
    role: Extract<ScaleRole, "primary" | "secondary">,
    anchor: Step,
    ramps: Ramps,
    subtle: Record<Mode, Step>,
): SemanticTokenDef[] {
    const ramp = ramps[role]
    const neutral = ramps.neutral
    const fill: Record<Mode, Step> = {
        // `primary` keeps the verbatim promise — your seed IS your button — and
        // the audit reports it when that costs contrast, because the identity
        // colour is worth defending. `secondary` does not get that: it is an
        // accent, its token is defined as a solid fill, and a fill that cannot
        // carry its own label is not a fill. The exact seed still sits at its
        // anchor step in the ramp either way.
        light: role === "primary" ? anchor : pickFill(ramp.light, neutral.light, anchor),
        dark: pickFill(ramp.dark, neutral.dark, shift(anchor, -DARK_LIFT)),
    }
    const foreground: Record<Mode, { scale: ScaleRole; step: Step }> = {
        light: onFill(neutral.light, ramp.light[fill.light]!),
        dark: onFill(neutral.dark, ramp.dark[fill.dark]!),
    }
    const direction: Record<Mode, 1 | -1> = {
        light: interactionDirection(neutral.light, foreground.light.step, ramp.light[fill.light]!),
        dark: interactionDirection(neutral.dark, foreground.dark.step, ramp.dark[fill.dark]!),
    }
    return [
        {
            name: role,
            group: "brand",
            light: { scale: role, step: fill.light },
            dark: { scale: role, step: fill.dark },
            description: `Solid ${role} fill — ${role === "primary" ? "primary buttons, active nav, key accents" : "secondary buttons and supporting accents"}.`,
        },
        {
            name: `${role}-foreground`,
            group: "brand",
            light: foreground.light,
            dark: foreground.dark,
            description: `Text and icons on a solid \`${role}\` fill. Never use it on a page background.`,
        },
        {
            name: `${role}-hover`,
            group: "state",
            light: { scale: role, step: shift(fill.light, direction.light) },
            dark: { scale: role, step: shift(fill.dark, direction.dark) },
            description: `Hover state of a solid \`${role}\` fill.`,
        },
        {
            name: `${role}-active`,
            group: "state",
            light: { scale: role, step: shift(fill.light, direction.light * 2) },
            dark: { scale: role, step: shift(fill.dark, direction.dark * 2) },
            description: `Pressed/active state of a solid \`${role}\` fill.`,
        },
        {
            name: `${role}-subtle`,
            group: "brand",
            light: { scale: role, step: subtle.light },
            dark: { scale: role, step: subtle.dark },
            description: `Tinted ${role} wash — quiet badges, selected rows, callouts. Not a text colour, and not a lightness shift: it can measure Lc 0 against the surface it sits on, so it reads in colour and vanishes in greyscale. Never the only thing saying what something is — a badge needs its label to say it too.`,
        },
        {
            name: `${role}-subtle-foreground`,
            group: "brand",
            light: { scale: role, step: pickAgainst(ramp.light, ramp.light[subtle.light]!, INK_CANDIDATES, LC_THRESHOLD.body) },
            dark: { scale: role, step: pickAgainst(ramp.dark, ramp.dark[subtle.dark]!, PAPER_CANDIDATES, LC_THRESHOLD.body) },
            description: `Text on \`${role}-subtle\`.`,
        },
    ]
}

