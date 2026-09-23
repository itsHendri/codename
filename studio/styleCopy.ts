/**
 * Copy style and paste style, as Figma's ⌘⌥C and ⌘⌥V: what an element looks
 * like, lifted off one and laid on another.
 *
 * "Looks like" is the paint and the type — colours, fills, borders, corners,
 * shadows, filters, opacity, padding and the text settings — and not where
 * it sits or how big it is: Figma's copy leaves position and size alone, and
 * so does this. The values are read off the rendered page, so what lands is
 * one ordinary edit per property that differs, in the log and the brief like
 * any other.
 */

export const STYLE_PROPS = [
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'text-align',
  'color',
  'background-color',
  'border-color',
  'border-width',
  'border-style',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-right-radius',
  'border-bottom-left-radius',
  'box-shadow',
  'opacity',
  'filter',
  'backdrop-filter',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
] as const;

export type StyleValues = Partial<Record<(typeof STYLE_PROPS)[number], string>>;

/** A value worth carrying: read, and not the empty answer of a property the element does not have. */
const has = (v: string | undefined): v is string => typeof v === 'string' && v.trim() !== '';

/** The edits that make `target` look like `source`: one per property that differs, in the list's order. */
export function pasteEdits(source: StyleValues, target: StyleValues): { property: string; from: string; to: string }[] {
  const out: { property: string; from: string; to: string }[] = [];
  for (const property of STYLE_PROPS) {
    const to = source[property];
    const from = target[property];
    if (!has(to) || !has(from)) continue;
    if (to.trim() === from.trim()) continue;
    out.push({ property, from, to });
  }
  return out;
}
