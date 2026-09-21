/** Assets and layout: icons, images, spacing and the grid. Part of DESIGN_SYSTEM.md; see ../designSystemMd.ts. */

import { apca, CHART_MIN_DELTA_E, COLLISION_DELTA_E, composite, deltaE, LC_THRESHOLD, SYNTAX_MIN_DELTA_E } from "../../engine/contrast"
import { spaceName } from "../../engine/defaults"
import { SCALE_ROLES, type ResolvedTokens, type SemanticGroup } from "../../engine/types"
import { chartPlanFor, scaleInkFor } from "../../engine/semantics"
import { primaryFamily } from "../css"
import { table, deviations, cellValue, tokenTable, labelPairsFor, SHADCN_NAMES, GROUP_TITLES, GROUP_ORDER } from "../mdHelpers"

export function assetsSection(resolved: ResolvedTokens): string {
    const { meta, typography } = resolved.config
    const fonts = typography.fontFiles ?? []
    const parts: string[] = []

    if (meta.logoSvg) {
        parts.push(`### Logo

The mark ships as **inline SVG inside \`brand.json\`** rather than as a file, and that is a
functional choice, not a packaging one: inline means a path can be set to \`currentColor\`, so the
mark follows whatever text colour surrounds it and inverts in dark mode without a second asset.

**This mark is two-tone, so "set every fill to \`currentColor\`" is wrong for it.** Count the paths
before you place it. The wordmark path takes \`currentColor\` and follows the surrounding ink. The
accent path carries the brand's accent and is *meant* to stay that colour — flattening it to
\`currentColor\` turns the flourish into an ink blob sitting on the letters, which is a visible defect
rather than a subtle one.

\`\`\`html
<!-- OK: the wordmark follows the ink, the accent stays the brand colour -->
<span style="color: var(--foreground)">
    <svg viewBox="…">
        <path fill="currentColor" d="…"/>
        <path fill="var(--logo-accent, ${resolved.scales.secondary?.steps.light[resolved.scales.secondary.anchorStep]!.hex ?? "#000000"})" d="…"/>
    </svg>
</span>
\`\`\`

**\`--logo-accent\` is the one token in this system that does not re-point in dark mode**, and that
is the whole reason it exists. The obvious spelling reached into the \`--secondary-*\` primitive layer — and the primitive ramps *do*
re-declare under \`[data-theme="dark"]\`, so the mark
rendered as two different oranges in the two modes without anything saying so. A logo does not change
colour with the theme. \`--secondary\` is also the wrong answer: it resolves to a darkened step chosen
to carry a label, not to the drawn colour.

The literal after the comma is a fallback for contexts where \`tokens.css\` is not loaded — a
favicon pipeline, a build step that inlines the mark. **It does not save you in email**: Outlook on
Windows renders through the Word engine, which does not understand \`var()\` *at the parser level*,
so the whole declaration is discarded and the fallback with it. There, write the literal and put the
token name in a comment beside it. See "Outside a browser" below. **\`--logo-accent\` is for the mark and nothing else**; it is not
validated against any surface, so if you put it on a coloured field, check it by eye. Do not reach
for it as a UI colour — that is what \`--secondary\` is for.

On a \`--primary\` or otherwise coloured field, set the wrapper's \`color\` to that fill's
\`-foreground\` so the wordmark stays legible. The accent is not in the validated set, and on this
brand it measures **Lc ${(() => {
        const accent = resolved.scales.secondary
        const primary = resolved.semantics.find((t) => t.name === "primary")
        if (!accent || !primary) return "—"
        return Math.abs(
            apca(accent.steps.light[accent.anchorStep]!.hex, primary.values.light!.hex),
        ).toFixed(0)
    })()} against \`--primary\`** in light, under the Lc ${LC_THRESHOLD["non-text"]} boundary bar —
so on a brand field the flourish reads as a shape rather than a separate colour. That is usually
fine for a mark and is worth knowing before you scale it down.`)
    } else if (meta.logoFile) {
        parts.push(`### Logo

The mark is a raster file, \`assets/${meta.logoFile}\`, and ships in the export beside the
stylesheet. It **cannot be recoloured**, so check it against \`--background\` in both modes before
placing it on a dark surface, and never place it on a \`--primary\` field without checking.`)
    } else {
        parts.push(`### Logo

**No mark is defined.** Set the brand name in type rather than inventing a logo, and say that you
did.`)
    }

    if (fonts.length > 0) {
        const families = [...new Set(fonts.map((font) => font.family))]
        parts.push(`### Typefaces

The font files ship in \`assets/\` and \`tokens.css\` already declares them — importing the
stylesheet is all that is required, there is no separate \`<link>\` to add.

${table(
            ["File", "Family", "Weight", "Style"],
            fonts.map((font) => [
                `\`assets/${font.fileName}\``,
                `\`--font-${font.family}\``,
                String(font.weight),
                font.style,
            ]),
        )}

The \`@font-face\` rules are named after the **first family in each stack** — ${families
            .map((family) => `\`${primaryFamily(typography.families[family] ?? "")}\``)
            .join(", ")} — not after the stack itself. If you regenerate those rules by hand, keep
that: a face declared as \`"${primaryFamily(typography.families.sans)}", ui-sans-serif, …\` matches
nothing and loads nothing, silently.

Keep \`assets/\` next to \`tokens.css\`. The \`src\` URLs are relative, so moving one without the
other leaves the page rendering in a fallback stack — which looks like a design decision rather
than a missing file.`)
    } else if ((typography.fontLinks ?? []).length > 0) {
        parts.push(`### Typefaces

No font files ship with this system. The faces are hosted, and \`<head>\` needs:

\`\`\`html
${(typography.fontLinks ?? []).map((href) => `<link rel="stylesheet" href="${href}">`).join("\n")}
\`\`\`

Without them the named families only render where they happen to be installed already, and
everything else falls back to the system stack.`)
    } else {
        parts.push(`### Typefaces

**No font files and no hosted links.** The families named above only render where they are already
installed; everywhere else falls back to the system stack. Either load them yourself or treat the
fallback as the design.`)
    }

    return parts.join("\n\n")
}

export function layoutSection(resolved: ResolvedTokens): string {
    const { breakpoints, containers } = resolved.config.layout
    const smallest = breakpoints[0]
    const widest = [...containers].sort((a, b) => b.maxRem - a.maxRem)[0]

    return `The system is **mobile-first**. Base styles are the narrowest case, and every breakpoint is
an upgrade written as \`min-width\`. There are no \`max-width\` breakpoints: a system with both
directions has two sources of truth for the same layout, and they drift.

${table(
        ["Token", "Min width", "What changes here"],
        breakpoints.map((breakpoint) => [
            `\`--breakpoint-${breakpoint.name}\``,
            `${breakpoint.minPx}px`,
            breakpoint.note,
        ]),
    )}

CSS cannot read a custom property inside a media query, so **write the pixel value literally** and
treat the table above as the source of truth for which values are legitimate:

\`\`\`css
/* ✅ a breakpoint from the set */
@media (min-width: ${smallest?.minPx ?? 640}px) { … }

/* ❌ a number nobody agreed to */
@media (min-width: 900px) { … }

/* ❌ var() does not resolve here — the rule is silently ignored */
@media (min-width: var(--breakpoint-${smallest?.name ?? "sm"})) { … }
\`\`\`

If you use Tailwind, these are already its variants (\`md:\`, \`lg:\`) — the \`@theme\` block in
\`tokens.css\` defines them, so no config file is needed.

**Not everything in \`tokens.css\` is in that \`@theme\` block.** The **semantic** colours, radius,
spacing, containers, shadows, easings, fonts, type roles and breakpoints are forwarded and become
utilities. \`--z-*\`, \`--shell-*\`, \`--duration-*\`, \`--opacity-*\` and \`--logo-accent\` are
**not** — Tailwind has no theme namespace that turns the first four into utilities, and
\`--logo-accent\` is deliberately excluded so it cannot be reached for as a UI colour. They stay
plain custom properties. Use them as
\`z-index: var(--z-modal)\`, \`width: var(--shell-sidebar)\` and so on, in a stylesheet or an
arbitrary value like \`w-[var(--shell-sidebar)]\`. Reaching for \`duration-fast\` or \`z-modal\` as a
utility class gets you nothing, silently.

### Containers

Nothing spans the viewport. Every region sits in one of these, centred with \`margin-inline: auto\`.

${table(
        ["Token", "Max width", "Use it for"],
        containers.map((container) => [
            `\`--container-${container.name}\``,
            `${container.maxRem}rem (${container.maxRem * 16}px)`,
            container.note,
        ]),
    )}

**A table does not fit in \`--container-narrow\`.** It is ${
        resolved.config.layout.containers.find((c) => c.name === "narrow")?.maxRem ?? 30
    }rem and \`--shell-table-min\` is ${
        resolved.config.layout.shell.find((d) => d.name === "table-min")?.rem ?? 40
    }rem, so a table placed in the container named for forms is wider than its frame before it has
any content in it. Put a table in \`page\` or \`wide\`; \`narrow\` is for one column of controls,
which is what its note says and what its width is for.

**\`--container-prose\` is the one that gets skipped.** Running text set to the full width of a
laptop is unreadable regardless of how good the type is, so body copy takes \`prose\` even when it
sits inside a wider \`page\` frame. Nesting the two is normal:

\`\`\`css
.page { max-width: var(--container-page); margin-inline: auto; padding-inline: var(--space-6); }
.page > p { max-width: var(--container-prose); }
\`\`\`

Note that \`--container-${widest?.name ?? "wide"}\` (${widest?.maxRem ?? 90}rem) is wider than the
\`xl\` breakpoint, so it only has an effect on genuinely large displays.`
}

