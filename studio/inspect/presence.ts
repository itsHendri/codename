/**
 * Which of the Style column's optional properties an element has (W54).
 *
 * Nudge folds a property the element does not use to its title and a +:
 * Padding, Margin, Background, Border, Box shadow. Codename does the same,
 * and adds Effects and Motion. The page decides what is open: a section
 * folds only when the computed value is the property's "nothing" and this
 * panel's own log has written nothing to it, so a fold never hides a value
 * the page or the person has set. A value this cannot read as "nothing"
 * counts as something, which opens the section rather than hiding it.
 */

import type { ElementProps } from '@/shared/types';

export type Optional = 'padding' | 'margin' | 'background' | 'border' | 'shadow' | 'effects' | 'motion';

export const OPTIONALS: readonly Optional[] = ['padding', 'margin', 'background', 'border', 'shadow', 'effects', 'motion'];

/** The properties each one writes: what the log is checked for, and what − takes away. */
const WRITES: Record<Optional, RegExp> = {
  padding: /^padding(-|$)/,
  margin: /^margin(-|$)/,
  background: /^background(-color)?$/,
  border: /^border-(width|style|color)$|^border$/,
  shadow: /^box-shadow$/,
  effects: /^(filter|backdrop-filter|transform)$/,
  motion: /^(transition|animation|animation-timeline)$/,
};

const zero = (v: string) => /^-?0(\.0+)?(px|rem|em|%)?$/.test(v.trim());
const none = (v: string | undefined) => v === undefined || v.trim() === '' || v.trim() === 'none';

/** `rgba(0, 0, 0, 0)`, `transparent`, an eight-digit hex ending 00: paints nothing. */
export function isTransparent(colour: string): boolean {
  const v = colour.trim().toLowerCase();
  if (v === 'transparent') return true;
  if (/^#[0-9a-f]{6}00$/.test(v)) return true;
  const m = v.match(/^rgba?\(.*[,/]\s*([\d.]+)(%?)\s*\)$/);
  return !!m && parseFloat(m[1]!) === 0;
}

/** A transition that moves nothing: none, or every part's duration 0 (`all 0s ease 0s` is the computed default). */
function stillTransition(v: string): boolean {
  if (none(v)) return true;
  // The first time in each comma-separated part is its duration.
  return v.split(',').every((part) => {
    const t = part.match(/(-?[\d.]+)(m?s)\b/);
    return !!t && parseFloat(t[1]!) === 0;
  });
}

function has(el: ElementProps, kind: Optional): boolean {
  const { box, border, color } = el;
  switch (kind) {
    case 'padding':
      return ![box.paddingTop, box.paddingRight, box.paddingBottom, box.paddingLeft].every(zero);
    case 'margin':
      return ![box.marginTop, box.marginRight, box.marginBottom, box.marginLeft].every(zero);
    case 'background':
      // An older inspector did not say; then the section stays open.
      return color.fill === undefined || !isTransparent(color.fill);
    case 'border':
      return border.style !== 'none' && border.style !== 'hidden' && !zero(border.width);
    case 'shadow':
      return !none(el.shadow);
    case 'effects':
      return !none(el.filter) || !none(el.backdropFilter) || !none(el.transform);
    case 'motion':
      return !stillTransition(el.transition) || !/^none(\s|$)/.test(el.animation.trim());
  }
}

/** For each optional property: is it there, on the page or in this panel's log? */
export function presence(el: ElementProps, written: Record<string, string> = {}): Record<Optional, boolean> {
  const wrote = (kind: Optional) => Object.keys(written).some((p) => WRITES[kind].test(p));
  return Object.fromEntries(OPTIONALS.map((k) => [k, has(el, k) || wrote(k)])) as Record<Optional, boolean>;
}

/**
 * What + puts on the element: the one visible start Nudge and Figma give a
 * border, a fill or a shadow. Padding, margin, effects and motion have no
 * sensible start, so + only opens their fields.
 */
export const STARTS: Partial<Record<Optional, [string, string][]>> = {
  background: [['background-color', '#FFFFFF']],
  border: [
    ['border-width', '1px'],
    ['border-style', 'solid'],
  ],
  shadow: [['box-shadow', '0px 4px 12px 0px #0000001A']],
};

/** What − writes: each property back to its "nothing", only where it is set now. */
export function removals(el: ElementProps, kind: Optional): [string, string][] {
  const { box } = el;
  switch (kind) {
    case 'padding':
      return (['top', 'right', 'bottom', 'left'] as const)
        .filter((s) => !zero(box[`padding${s[0]!.toUpperCase()}${s.slice(1)}` as 'paddingTop']))
        .map((s) => [`padding-${s}`, '0px']);
    case 'margin':
      return (['top', 'right', 'bottom', 'left'] as const)
        .filter((s) => !zero(box[`margin${s[0]!.toUpperCase()}${s.slice(1)}` as 'marginTop']))
        .map((s) => [`margin-${s}`, '0px']);
    case 'background':
      return [['background-color', 'transparent']];
    case 'border':
      return [['border-style', 'none']];
    case 'shadow':
      return [['box-shadow', 'none']];
    case 'effects':
      return (
        [
          ['filter', el.filter],
          ['backdrop-filter', el.backdropFilter],
          ['transform', el.transform],
        ] as const
      )
        .filter(([, v]) => !none(v))
        .map(([p]) => [p, 'none']);
    case 'motion': {
      const out: [string, string][] = [];
      if (!stillTransition(el.transition)) out.push(['transition', 'none']);
      if (!/^none(\s|$)/.test(el.animation.trim())) out.push(['animation', 'none']);
      return out;
    }
  }
}
