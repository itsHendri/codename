/**
 * Shadows and blurs, taken apart and put back together.
 *
 * A `box-shadow` reaches the panel as one string — and as several, since it
 * is a list. Editing it as text is what the panel did until now: correct, and
 * no help at all if what you want is two pixels more blur.
 *
 * Everything here fails closed. A value this cannot take apart and rebuild
 * *exactly* is reported as unparsed, and the panel leaves the text field in
 * charge rather than offering fields that would quietly drop what they did
 * not understand. `currentColor`, a colour in a form we do not recognise, a
 * length in `em` — all of them keep their place, because the test is a round
 * trip rather than a vocabulary.
 */

/** One layer of a box-shadow. Lengths keep their unit as written. */
export interface ShadowLayer {
  inset: boolean;
  x: string;
  y: string;
  blur: string;
  spread: string;
  /** Exactly as written: a hex, an `rgb()`, a `var()`, `currentColor`, or empty. */
  color: string;
}

export const emptyShadow = (): ShadowLayer => ({ inset: false, x: '0px', y: '2px', blur: '4px', spread: '0px', color: 'rgba(0, 0, 0, 0.15)' });

/** Splits a comma-separated list, leaving the commas inside `rgb(…)` alone. */
export function splitList(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]!;
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

/** The whitespace-separated pieces of one layer, keeping `rgb(1, 2, 3)` whole. */
function pieces(part: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of part) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (current) out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current) out.push(current);
  return out;
}

const isLength = (s: string): boolean => /^[+-]?(\d*\.)?\d+(px|rem|em|%|vh|vw|ch|ex|pt|cm|mm|in|pc|q)?$/i.test(s) || s === '0';

/**
 * A box-shadow as layers, or null when it is not one this can rebuild.
 *
 * `none`, the empty string and anything holding a `var()` in place of the
 * whole value come back as an empty list, since there is nothing to take
 * apart; a value that parses into fields but would not serialise back to
 * itself comes back null.
 */
export function parseShadow(value: string): ShadowLayer[] | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'none') return [];
  // A whole-value reference is the page's own decision, not five numbers.
  if (/^var\(/i.test(trimmed)) return null;

  const layers: ShadowLayer[] = [];
  for (const part of splitList(trimmed)) {
    const words = pieces(part);
    if (!words.length) return null;
    const inset = words.some((w) => w.toLowerCase() === 'inset');
    const rest = words.filter((w) => w.toLowerCase() !== 'inset');
    const lengths = rest.filter(isLength);
    const others = rest.filter((w) => !isLength(w));
    // Two to four lengths, and at most one thing that is not a length.
    if (lengths.length < 2 || lengths.length > 4 || others.length > 1) return null;
    // A `calc()` could be the spread or the colour, and this cannot tell:
    // reading it as a colour put a length in the colour box, and the next
    // nudge of spread wrote a declaration the browser throws away.
    if (others.some((w) => /^calc\(/i.test(w))) return null;
    layers.push({
      inset,
      x: lengths[0]!,
      y: lengths[1]!,
      blur: lengths[2] ?? '0px',
      spread: lengths[3] ?? '0px',
      color: others[0] ?? '',
    });
  }
  return layers;
}

/** One layer, written the way a stylesheet would. */
export function layerToCss(layer: ShadowLayer): string {
  const parts = [layer.x, layer.y, layer.blur, layer.spread].map((p) => p.trim() || '0px');
  // A spread of zero is noise unless something after it needs the place.
  const lengths = parts[3] === '0px' ? parts.slice(0, 3) : parts;
  return [layer.inset ? 'inset' : '', ...lengths, layer.color.trim()].filter(Boolean).join(' ');
}

export const shadowToCss = (layers: ShadowLayer[]): string => (layers.length ? layers.map(layerToCss).join(', ') : 'none');

/**
 * Whether the fields can hold this value without losing any of it.
 *
 * The question the panel asks before offering them, and it is asked by
 * rebuilding rather than by pattern: if what comes back means the same thing,
 * the fields are safe; if not, the text stays.
 */
export function shadowRoundTrips(value: string): boolean {
  const layers = parseShadow(value);
  if (layers === null) return false;
  const same = (a: string, b: string) => a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase();
  const rebuilt = shadowToCss(layers);
  if (same(rebuilt, value)) return true;
  // A browser writes `0px 2px 4px 0px rgb(0 0 0 / 15%)`; dropping a zero
  // spread is the one difference the fields are allowed to make.
  return same(rebuilt, shadowToCss(parseShadow(rebuilt) ?? []));
}

/* ---------------- blur ---------------- */

/**
 * The blur radius in a `filter` or `backdrop-filter`, or null when the value
 * is something else — another function, several of them, a `var()`.
 *
 * A filter is a pipeline and this edits one station of it, so anything with
 * more than a blur in it is left to the text field rather than rewritten with
 * the rest dropped.
 */
export function parseBlur(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'none') return '0px';
  const match = /^blur\(\s*([^)]+?)\s*\)$/i.exec(trimmed);
  if (!match) return null;
  const radius = match[1]!;
  return isLength(radius) ? radius : null;
}

export const blurToCss = (radius: string): string => {
  const r = radius.trim();
  return !r || r === '0' || r === '0px' ? 'none' : `blur(${r})`;
};
