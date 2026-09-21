/** Code and syntax: the tokens a code block is painted with. Part of DESIGN_SYSTEM.md; see ../designSystemMd.ts. */

import { apca, CHART_MIN_DELTA_E, COLLISION_DELTA_E, composite, deltaE, LC_THRESHOLD, SYNTAX_MIN_DELTA_E } from "../../engine/contrast"
import { spaceName } from "../../engine/defaults"
import { SCALE_ROLES, type ResolvedTokens, type SemanticGroup } from "../../engine/types"
import { chartPlanFor, scaleInkFor } from "../../engine/semantics"
import { primaryFamily } from "../css"
import { table, deviations, cellValue, tokenTable, labelPairsFor, SHADCN_NAMES, GROUP_TITLES, GROUP_ORDER } from "../mdHelpers"

export function codeSection(resolved: ResolvedTokens): string {
    const by = new Map(resolved.semantics.map((token) => [token.name, token]))
    const sunken = by.get("surface-sunken")
    const syntax = resolved.semantics.filter((token) => token.group === "code")

    const measured = (mode: "light" | "dark"): string => {
        if (!sunken) return ""
        const ground = sunken.values[mode]!.hex
        return [...syntax, by.get("foreground")!]
            .map(
                (token) =>
                    `\`--${token.name}\` Lc ${Math.abs(apca(token.values[mode]!.hex, ground)).toFixed(0)}`,
            )
            .join(", ")
    }

    return `A code block is **\`--surface-sunken\`**, not \`--muted\`. That is not a style preference:
\`--muted\` is a mid-grey wash, and on it the body bar admits exactly one step of each ramp, so every
syntax colour collapses onto the same near-black (or near-white) value and the block comes out
monochrome. A well is also what every real code block does — it moves *away* from the page rather
than toward the middle of the ramp.

\`\`\`css
pre {
    background: var(--surface-sunken);
    border: 1px solid var(--border);   /* required: in dark mode sunken IS the page colour */
    border-radius: var(--radius-md);
    padding: var(--space-4);
    overflow-x: auto;                  /* with tabindex="0", so it scrolls by keyboard */
    color: var(--foreground);          /* identifiers, punctuation, plain text */
}
pre:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }

/* ✅ if you wrap the block to hang a copy button on it, the wrapper clips —
   so the ring has to be drawn INSIDE, or it is invisible and nothing errors */
.code-frame { position: relative; overflow: hidden; border-radius: var(--radius-md); }
.code-frame pre:focus-visible { outline-offset: -2px; }
\`\`\`

**That clipping case is the one to remember.** \`outline-offset: 2px\` draws the ring *outside* the
element, and any ancestor with \`overflow: hidden\` — which is what a rounded frame around a toolbar
needs — cuts it off entirely. The block is still focusable, because this recipe gives it
\`tabindex="0"\`, so the result is a keyboard-only, focus-only, silent failure. A negative offset
puts the ring inside the block where nothing can clip it.

${table(
        ["Token", "What it colours"],
        syntax.map((token) => [`\`--${token.name}\``, token.description.split(".")[0] + "."]),
    )}

**There is no token for identifiers, variables or punctuation** — they take \`--foreground\`, which
is measured on this surface like everything else. Colouring a fifth thing does not make a block
easier to scan; it makes it harder.

Every one of these clears the **Lc ${LC_THRESHOLD.body} body bar** on \`--surface-sunken\`. Measured on this brand —
light: ${measured("light")}. Dark: ${measured("dark")}.

The consequence is worth expecting rather than being surprised by: at that bar a **light-mode syntax
palette is dark and a dark-mode one is pale**, because the only steps of a ramp that clear the bar
on a light ground are its darkest, and on a dark ground its lightest. That is what a code sample
somebody actually reads costs. The exact colours are in the token table above; do not substitute
brighter ones from another theme.

**\`--code-comment\` is the one exception, and it is held to the Lc ${LC_THRESHOLD.large} large-text
bar instead.** Two reasons, and the second is the load-bearing one. A comment is an aside, and one
that reads as loudly as the code stops the code being scannable. And every ramp in this system shares
its lightness targets across hues, so a comment held to the same threshold as the keywords lands on
the *same step* as them — identical lightness, separated by chroma alone, which on a dark ramp comes
to almost nothing. One step of recession is what makes a comment a different colour at all.

**Legible is not the same as distinguishable, and both are measured.** Contrast asks whether you can
read a colour against its ground; it says nothing about whether two colours are different from each
other. This palette is therefore also audited pairwise in OKLab, at a floor of ΔE
${SYNTAX_MIN_DELTA_E}, and any pair under it is listed in the Contrast section below rather than
left for you to discover. ${(() => {
        const flagged = resolved.warnings.filter((w) => w.kind === "distinctness")
        if (flagged.length === 0) {
            return "Every pair on this brand clears it."
        }
        return `**${flagged.length} pair${flagged.length === 1 ? " does" : "s do"} not clear it on this brand.** Where two code colours are flagged, do not rely on the difference between them — a reader will not see it, and no arrangement of these seeds fixes it.`
    })()}

**A diff.** The text colours are \`--code-added\` and \`--code-removed\`; the line tints are
\`--success-subtle\` and \`--danger-subtle\`, which are fills and are measured as fills. Do not use
\`--success\` or \`--danger\` for either job — those are solid fills and are not validated as text on
a page.

\`\`\`css
.diff-line.added   { background: var(--success-subtle); color: var(--code-added); }
.diff-line.removed { background: var(--danger-subtle);  color: var(--code-removed); }
\`\`\`

**You may keep syntax highlighting inside a tinted line.** The whole palette is validated against
both diff tints as well as against \`--surface-sunken\`, so a keyword on an added line is a checked
combination rather than one you are composing at your own risk.

**A fenced block may break out of the reading measure, and should.** \`--container-prose\` is sized
for running text and truncates an ordinary function signature. A code block inside a prose column
takes \`--container-intro\` (${
        resolved.config.layout.containers.find((c) => c.name === "intro")?.maxRem ?? 52
    }rem) — that is the width between the reading measure and the page frame, and it is what the token
is for even though its note talks about large type. Wider than that and the block stops belonging to
the paragraph above it. It still gets \`overflow-x: auto\`, because a code sample will always find a
line you did not plan for.

**Inline \`code\` is different from a block** and keeps \`--muted\`: it sits inside a sentence, so it
needs to read as a change of texture rather than as a hole in the paragraph. Size it relatively
(\`0.9em\`) rather than with \`--text-code\`, because a fixed ${
        resolved.config.typography.roles.find((role) => role.role === "code")?.sizeRem ?? 0.875
    }rem next to \`--text-body\` sits visibly small mid-sentence. Inline code is not syntax-highlighted
— it takes \`--foreground\`.`
}

/**
 * Chart series — and the ceiling, which is the part worth reading.
 *
 * The count is generated, so a brand with better-spread seeds gets more series
 * and this section says a different number without anybody editing it.
 */
