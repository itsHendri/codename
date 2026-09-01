/**
 * Craft defaults that hold for any brand — the universal layer beneath the
 * brand-specific values. Brand config overrides these; they are never silent.
 */

import type { BrandConfig, Breakpoint, Container, RadiusStep, ShellDimension, TypeRole, ZLayer } from "./types"

/**
 * Mobile-first min-widths. The values are the industry-standard set — the ones
 * Tailwind ships and every developer and model already has in their head — so
 * they cost nothing to learn and interoperate for free.
 *
 * There is no `xs`: the narrowest case is the base styles, not a breakpoint.
 */
export const DEFAULT_BREAKPOINTS: Breakpoint[] = [
    { name: "sm", minPx: 640, note: "Large phones in portrait. Rarely a layout change on its own." },
    { name: "md", minPx: 768, note: "Tablet. Side-by-side content becomes possible; nav can unfold." },
    { name: "lg", minPx: 1024, note: "Laptop. Multi-column layouts and persistent sidebars." },
    { name: "xl", minPx: 1280, note: "Desktop. Wider gutters, more columns — rarely bigger type." },
]

/**
 * Max-widths, named for the job. `prose` is the one people skip and shouldn't:
 * a paragraph running the full width of a laptop is unreadable no matter how
 * good the type is.
 */
export const DEFAULT_CONTAINERS: Container[] = [
    { name: "prose", maxRem: 42, note: "Running text. Sized for a readable measure at body size — check the line length against your own face, since character count depends on it." },
    { name: "narrow", maxRem: 30, note: "Forms, dialogs, sign-in — anything with one column of controls." },
    { name: "intro", maxRem: 52, note: "Large type that needs more room than the reading measure — a hero headline, a section intro, a pull quote. At `prose` a display headline wraps to five lines; at `page` it is unreadable." },
    { name: "page", maxRem: 72, note: "The default page frame. Most layouts live here." },
    { name: "wide", maxRem: 90, note: "Dashboards and tables that genuinely need the room." },
]

/**
 * The stacking order, as a closed set.
 *
 * Values are spaced by 100 so a one-off can slot between two of them without a
 * renumber, and the gaps are the point: `modal` sits ten above `scrim` rather
 * than a hundred, because a dialog belongs immediately on top of its own
 * backdrop and nothing is ever meant to land between them. That pairing is the
 * one people get wrong — a modal at 300 under a nav at 400 is the classic bug.
 *
 * `toast` deliberately outranks `modal`: a save confirmation that renders behind
 * the dialog that triggered it is invisible exactly when it matters.
 */
export const DEFAULT_Z_LAYERS: ZLayer[] = [
    { name: "sticky", value: 100, note: "Sticky table headers and section headers. Below the nav, so it scrolls under it." },
    { name: "nav", value: 200, note: "The app header and side nav — persistent chrome." },
    { name: "dropdown", value: 300, note: "Menus, comboboxes, popovers. Above the nav they belong to." },
    { name: "scrim", value: 400, note: "The modal backdrop. Pair with `--scrim`." },
    { name: "modal", value: 410, note: "Dialogs and drawers — ten above their own scrim, never a hundred." },
    { name: "toast", value: 500, note: "Flags and notifications. Above a modal on purpose: a confirmation behind the dialog that caused it is useless." },
    { name: "tooltip", value: 600, note: "Always last. A tooltip is never covered by anything." },
]

/**
 * The app frame's furniture. `--container-*` bounds the page; these bound what
 * lives around it, which is the set every acceptance run has had to invent.
 */
export const DEFAULT_SHELL: ShellDimension[] = [
    { name: "header", rem: 3.5, note: "App header / top bar height. 56px — two 44px touch targets do not fit, one does with room." },
    { name: "sidebar", rem: 16, note: "Primary side navigation. 256px holds a label plus an icon without truncating." },
    { name: "sidebar-collapsed", rem: 3.5, note: "The icon rail. Matches the header height, so the logo cell is square." },
    { name: "aside", rem: 20, note: "Secondary panel — filters, details, activity. 320px is a readable narrow column." },
    { name: "table-min", rem: 40, note: "Minimum table width before it scrolls horizontally instead of crushing columns." },
]

/**
 * Radius derives from ONE knob. Set base to 0 and the whole system goes sharp;
 * set it to 16 and everything softens together. Proportional (not shadcn's
 * base±4px) so base 0 stays genuinely square instead of going negative.
 */
export function deriveRadius(
    basePx: number,
    overrides: Partial<Record<RadiusStep, number>> = {},
): Record<RadiusStep, number> {
    const derived: Record<RadiusStep, number> = {
        sm: Math.round(basePx * 0.5),
        md: basePx,
        lg: Math.round(basePx * 1.5),
        xl: Math.round(basePx * 2),
        full: 9999,
    }
    return { ...derived, ...overrides }
}

/**
 * Concentric radius: a rounded box inside another rounded box must use
 * `outer − padding`, or the two curves fight. Square off at ≤ 0.
 * Only meaningful for padding ≤ 24px; beyond that treat the surfaces separately.
 */
export function concentricInner(outerPx: number, paddingPx: number): number {
    return Math.max(0, outerPx - paddingPx)
}

/** Base phone to widest desktop. A fluid role scales across exactly this span. */
export const DEFAULT_FLUID_RANGE = { minPx: 390, maxPx: 1280 }

/**
 * A fluid size as `clamp(min, intercept + slope·vw, max)`.
 *
 * The middle term deliberately keeps a `rem` component rather than being pure
 * `vw`. Pure viewport units ignore the user's font-size preference, so a
 * `vw`-only heading refuses to grow when someone zooms — an accessibility
 * failure that looks fine on every device you own.
 */
export function fluidSize(
    minRem: number,
    maxRem: number,
    range = DEFAULT_FLUID_RANGE,
): string {
    const minVwRem = range.minPx / 16
    const maxVwRem = range.maxPx / 16
    const slope = (maxRem - minRem) / (maxVwRem - minVwRem)
    const intercept = minRem - slope * minVwRem
    const round = (n: number) => Math.round(n * 10000) / 10000
    return `clamp(${round(minRem)}rem, ${round(intercept)}rem + ${round(slope * 100)}vw, ${round(maxRem)}rem)`
}

/** 4px grid. The blessed subset — not every multiple, just the ones we actually use. */
export const DEFAULT_SPACING = { basePx: 4, blessed: [4, 8, 12, 16, 24, 32, 48, 64, 96] }

/** Names follow Tailwind's px/4 numbering so `--space-6` is 24px, as expected. */
export const spaceName = (px: number, basePx = 4): string => String(px / basePx)

/**
 * Two opacities, both for *non-text* or already-unreadable states.
 *
 * `disabled` is for controls whose label is `--foreground-tertiary` anyway, so
 * fading it further costs nothing that was being read. `loading` dims content
 * behind a spinner, which nobody is reading either. Neither is a licence to
 * fade live text: opacity defeats the contrast audit, because the resulting
 * colour depends on a ground the system cannot see.
 */
export const DEFAULT_OPACITY: BrandConfig["opacity"] = { disabled: 0.4, loading: 0.6 }

export const DEFAULT_MOTION: BrandConfig["motion"] = {
    durations: { instant: 100, fast: 150, base: 200, slow: 320 },
    easings: {
        out: "cubic-bezier(0.2, 0, 0, 1)",
        in: "cubic-bezier(0.4, 0, 1, 1)",
        "in-out": "cubic-bezier(0.4, 0, 0.2, 1)",
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
    },
}

/**
 * Elevation. Light mode uses layered shadows; dark mode gets a hairline ring
 * instead, because shadows are invisible on a dark ground — depth there comes
 * from surface lightness, which the neutral ramp already provides.
 */
export const DEFAULT_SHADOWS: BrandConfig["shadows"] = {
    levels: [
        {
            // Not an elevation level and, until run 6 asked, not usable anywhere:
            // every documented context either owns a shadow or forbids one. Its
            // job is sticky chrome — the hairline that appears under a header
            // once content has scrolled beneath it.
            name: "sm",
            layers: ["0 1px 2px -1px oklch(0 0 0 / 0.08)", "0 0 0 1px oklch(0 0 0 / 0.04)"],
        },
        {
            name: "raised",
            layers: [
                "0 0 0 1px oklch(0 0 0 / 0.05)",
                "0 4px 8px -2px oklch(0 0 0 / 0.08)",
                "0 12px 24px -4px oklch(0 0 0 / 0.06)",
            ],
        },
        {
            name: "overlay",
            layers: [
                "0 0 0 1px oklch(0 0 0 / 0.06)",
                "0 12px 32px -8px oklch(0 0 0 / 0.16)",
                "0 24px 64px -12px oklch(0 0 0 / 0.12)",
            ],
        },
    ],
}

/** Dark-mode elevation: a ring, not a shadow. */
export const DARK_SHADOWS: Record<string, string> = {
    sm: "0 0 0 1px oklch(1 0 0 / 0.06)",
    raised: "0 0 0 1px oklch(1 0 0 / 0.10), 0 8px 24px -8px oklch(0 0 0 / 0.6)",
    overlay: "0 0 0 1px oklch(1 0 0 / 0.12), 0 24px 64px -12px oklch(0 0 0 / 0.7)",
}

/** A 1.2 minor third off a 1rem body, rounded onto the 4px grid by eye. */
export const DEFAULT_TYPE_ROLES: TypeRole[] = [
    // The two roles that hurt on a phone at a desktop size, and the only two
    // worth making fluid — everything below heading level should hold still.
    { role: "display", family: "display", sizeRem: 3.5, minSizeRem: 2.5, lineHeight: 1.05, weight: 600, tracking: "-0.03em" },
    { role: "heading-lg", family: "sans", sizeRem: 2.25, minSizeRem: 1.75, lineHeight: 1.15, weight: 600, tracking: "-0.02em" },
    { role: "heading", family: "sans", sizeRem: 1.5, lineHeight: 1.25, weight: 600, tracking: "-0.01em" },
    { role: "heading-sm", family: "sans", sizeRem: 1.125, lineHeight: 1.4, weight: 600 },
    { role: "body-lg", family: "sans", sizeRem: 1.125, lineHeight: 1.6, weight: 400 },
    { role: "body", family: "sans", sizeRem: 1, lineHeight: 1.6, weight: 400 },
    { role: "body-sm", family: "sans", sizeRem: 0.875, lineHeight: 1.55, weight: 400 },
    { role: "label", family: "sans", sizeRem: 0.8125, lineHeight: 1.3, weight: 500, tracking: "0.01em" },
    { role: "code", family: "mono", sizeRem: 0.875, lineHeight: 1.5, weight: 400 },
]

/**
 * Universal polish rules (after Jakub Krehel's "make interfaces feel better").
 * Toggles here become hard rules in the exported SKILL.md, with this brand's
 * actual values substituted in.
 */
export const POLISH_RULES: Array<{ id: string; title: string; rule: string; default: boolean }> = [
    {
        id: "concentric-radius",
        title: "Concentric radius",
        rule: "A rounded box flush against its parent's inner edge uses `inner = outer − padding`, squared off at 0. Flush means touching the padding on both sides: a full-width field, banner or button follows the formula even though it is a control. Elements that float inside the padding with space around them — badges, chips, inline code, an auto-width button — are not concentric with anything and keep their own radius. When in doubt, ask whether the element's edge and the parent's edge are parallel and one padding apart; if they are, it is flush.",
        default: true,
    },
    {
        id: "underline-links",
        title: "Links in body copy are underlined",
        rule: "A link inside running text carries an underline, not just `--link`. Colour alone is never sufficient (WCAG 1.4.1). Depending on the palette `--link` can also sit at nearly the same lightness as `--foreground` and be separated by hue alone, which disappears in greyscale and for anyone with a colour vision deficiency — the reference gives the measured figures for this brand. Underline by default and remove it only where the link is already unmistakable as a control — nav items, buttons, cards. Use `text-underline-offset` rather than a border, so descenders stay legible.",
        default: true,
    },
    {
        id: "optical-alignment",
        title: "Optical alignment",
        rule: "On a button with a leading icon, pull the icon 2px toward its edge with a negative margin — `margin-left: -2px` on the icon, not a 14px padding step. The 2px is an optical correction, not a spacing decision, and the blessed spacing set has no 14: changing the padding to reach it is how a rule that exists to make one button look right puts an off-scale number in every button. Fix lopsided glyphs in the SVG viewBox, not with margins.",
        default: true,
    },
    {
        id: "shadow-vs-border",
        title: "Shadows elevate, borders structure",
        rule: "Use `--shadow-*` for things that float above the page and `--border` for things that divide it. Never both for the same job. In dark mode elevation is a hairline ring plus a lighter surface, not a drop shadow.",
        default: true,
    },
    {
        id: "interruptible-motion",
        title: "Interruptible animation",
        rule: "State changes use CSS transitions so they can be interrupted mid-flight. Keyframes are only for one-shot sequences.",
        default: true,
    },
    {
        id: "enter-exit-asymmetry",
        title: "Exits are faster than entrances",
        rule: "Enter: `--duration-base`, opacity 0→1 with a 12px rise. Exit: `--duration-fast`, opacity→0 with a 12px fall. Leaving should never take as long as arriving.",
        default: true,
    },
    {
        id: "press-feedback",
        title: "Press feedback",
        rule: "Active state scales to 0.96 over `--duration-fast`. Never below 0.95.",
        default: true,
    },
    {
        id: "no-transition-all",
        title: "Never `transition: all`",
        rule: "Name the properties you are animating. `transition: all` animates layout properties by accident and stutters.",
        default: true,
    },
    {
        id: "tabular-numbers",
        title: "Tabular numbers",
        rule: "`font-variant-numeric: tabular-nums` for numbers that change in place (counters, timers) or that are compared down a column (amounts, counts, durations). Not for identifiers that merely contain digits — version strings, phone numbers, order references — even when they sit in a table.",
        default: true,
    },
    {
        id: "text-wrap",
        title: "Text wrapping",
        rule: "`text-wrap: balance` on headings up to ~6 lines; `text-wrap: pretty` on body copy.",
        default: true,
    },
    {
        id: "hit-areas",
        title: "Hit areas",
        rule: "44×44px minimum on touch, 40×40px in dense desktop UI. Extend with a pseudo-element rather than padding that breaks the layout. Hit areas must not overlap.",
        default: true,
    },
    {
        id: "icon-stroke",
        title: "Icon stroke matches text weight",
        rule: "1.5px stroke next to 400-weight text, 2px next to 600. One stroke weight per icon set. Recolour with `currentColor`.",
        default: true,
    },
    {
        id: "focus-visible",
        title: "Focus is always visible",
        rule: "Keyboard focus draws a 2px `--ring` outline with a 2px offset. Never `outline: none` without a replacement.",
        default: true,
    },
    {
        id: "reduced-motion",
        title: "Honour reduced motion",
        rule: "Under `prefers-reduced-motion: reduce`, drop transforms and cut durations to near zero. Motion is never the only signal that something changed — pair it with colour, icon or label.",
        default: true,
    },
]

export const DEFAULT_POLISH: Record<string, boolean> = Object.fromEntries(
    POLISH_RULES.map((r) => [r.id, r.default]),
)
