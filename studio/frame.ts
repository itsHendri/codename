/**
 * Showing a page at a device's size inside the tab it is already in.
 *
 * Chrome's own device emulation (through `chrome.debugger`) drew the frame in
 * the corner of the tab and came with a debugging bar that ended the frame
 * when it was closed. This does it in the page instead: the page is narrowed to the frame and centred, and
 * every width, height and orientation media query is re-evaluated against the
 * frame rather than the window — so the page lays out the way it would at
 * that size, and nothing Chrome shows can take it away.
 *
 * What this cannot reach is anything measured against the window by other
 * means: `vw` and `vh` units, a script that reads `innerWidth` or calls
 * `matchMedia`, an element fixed to the viewport. Those still see the window,
 * and the README says so.
 *
 * The query rewrite is the part that has to be right, so it is here, as a
 * string function, where it can be tested.
 */

export interface FrameSize {
  width: number;
  height: number;
  /**
   * The room between the rail and the panel rather than a device: it fills
   * that room exactly, at zoom 1, with no outline and nothing dimmed around
   * it. Only the media queries are answered.
   */
  fill?: boolean;
}

/** A condition that always holds, written as a query the browser already evaluates. */
export const ALWAYS = '(min-width: 0px)';
/** One that never does: no viewport is zero pixels wide. */
export const NEVER = '(max-width: 0px)';

/**
 * Pixels in a media query length. `em` and `rem` in a media query are the
 * initial font size — the browser's default, 16px unless the person changed
 * it — whatever the page's root says, so the caller measures that once
 * rather than this reading the page's font size.
 */
function lengthPx(value: string, emPx: number): number | null {
  const m = /^(-?\d*\.?\d+)(px|em|rem)?$/i.exec(value.trim());
  if (!m) return null;
  const n = parseFloat(m[1]!);
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] ?? 'px').toLowerCase();
  if (unit === 'px') return n;
  return n * emPx;
}

/** A ratio like `16/9` or `1.5`. */
function ratio(value: string): number | null {
  const m = /^(\d*\.?\d+)\s*(?:\/\s*(\d*\.?\d+))?$/.exec(value.trim());
  if (!m) return null;
  const a = parseFloat(m[1]!);
  const b = m[2] ? parseFloat(m[2]) : 1;
  return b > 0 && Number.isFinite(a) ? a / b : null;
}

type Dimension = 'width' | 'height' | 'aspect-ratio';

/** The frame's value for a feature name, or null when this does not know the feature. */
function measure(name: string, frame: FrameSize): { value: number; dim: Dimension } | null {
  const bare = name.replace(/^(min|max)-/, '').replace(/^device-/, '');
  if (bare === 'width') return { value: frame.width, dim: 'width' };
  if (bare === 'height') return { value: frame.height, dim: 'height' };
  if (bare === 'aspect-ratio') return { value: frame.width / frame.height, dim: 'aspect-ratio' };
  return null;
}

const parseValue = (dim: Dimension, value: string, emPx: number) => (dim === 'aspect-ratio' ? ratio(value) : lengthPx(value, emPx));

const compare = (a: number, op: string, b: number): boolean => {
  switch (op) {
    case '<':
      return a < b;
    case '<=':
      return a <= b;
    case '>':
      return a > b;
    case '>=':
      return a >= b;
    case '=':
      return a === b;
    default:
      return false;
  }
};

/** The comparison read from the other side: `700px > width` is `width < 700px`. */
const flip = (op: string): string => ({ '<': '>', '<=': '>=', '>': '<', '>=': '<=', '=': '=' })[op] ?? op;

/**
 * Whether one parenthesised feature holds for the frame: true, false, or null
 * when it is not a size feature this can answer for (a colour scheme, hover,
 * a unit it cannot convert), in which case the browser keeps answering it.
 */
export function evaluateFeature(feature: string, frame: FrameSize, emPx = 16): boolean | null {
  const inner = feature.trim().replace(/^\(|\)$/g, '').trim();

  // `orientation: portrait` — the frame is portrait when it is at least as tall as it is wide.
  const orientation = /^orientation\s*:\s*(portrait|landscape)$/i.exec(inner);
  if (orientation) {
    const portrait = frame.height >= frame.width;
    return orientation[1]!.toLowerCase() === 'portrait' ? portrait : !portrait;
  }

  // `min-width: 700px`, `max-height: 40em`, `width: 768px`.
  const plain = /^((?:min-|max-)?(?:device-)?(?:width|height|aspect-ratio))\s*:\s*(.+)$/i.exec(inner);
  if (plain) {
    const name = plain[1]!.toLowerCase();
    const got = measure(name, frame);
    if (!got) return null;
    const want = parseValue(got.dim, plain[2]!, emPx);
    if (want === null) return null;
    if (name.startsWith('min-')) return got.value >= want;
    if (name.startsWith('max-')) return got.value <= want;
    return got.value === want;
  }

  // Range syntax: `width <= 700px`, `700px > width`, `400px <= width <= 900px`.
  const tokens = inner.split(/\s*(<=|>=|<|>|=)\s*/).filter((t) => t !== '');
  if (tokens.length === 3 || tokens.length === 5) {
    const nameAt = tokens.findIndex((t, i) => i % 2 === 0 && measure(t.toLowerCase(), frame) !== null);
    if (nameAt === -1) return null;
    const got = measure(tokens[nameAt]!.toLowerCase(), frame)!;
    const checks: boolean[] = [];
    // The operator either side of the name, each read as "name op value".
    if (nameAt > 0) {
      const value = parseValue(got.dim, tokens[nameAt - 2]!, emPx);
      if (value === null) return null;
      checks.push(compare(got.value, flip(tokens[nameAt - 1]!), value));
    }
    if (nameAt < tokens.length - 1) {
      const value = parseValue(got.dim, tokens[nameAt + 2]!, emPx);
      if (value === null) return null;
      checks.push(compare(got.value, tokens[nameAt + 1]!, value));
    }
    return checks.length > 0 && checks.every(Boolean);
  }
  return null;
}

export interface Rewritten {
  /** The media text to use while the frame is on. */
  text: string;
  /** Whether anything in it was a size feature this answered for. */
  changed: boolean;
}

/**
 * A media query list with every size feature answered for the frame.
 *
 * Each innermost parenthesised feature this can evaluate is replaced by a
 * condition the browser already knows the answer to — `(min-width: 0px)` for
 * true, `(max-width: 0px)` for false — and everything else is left exactly as
 * written. The `and`, `or`, `not` and commas around them keep their meaning,
 * so `screen and (max-width: 700px)` becomes `screen and (min-width: 0px)` at
 * a 375px frame and `not all and (max-width: 700px)` stays the opposite of it.
 *
 * Idempotent: the two stand-ins evaluate to themselves at any frame size.
 */
export function rewriteMedia(mediaText: string, frame: FrameSize, emPx = 16): Rewritten {
  let changed = false;
  // Innermost parentheses only: a feature never contains another one.
  const text = mediaText.replace(/\([^()]*\)/g, (group) => {
    const answer = evaluateFeature(group, frame, emPx);
    if (answer === null) return group;
    const stand = answer ? ALWAYS : NEVER;
    if (stand !== group.replace(/\s+/g, ' ').trim()) changed = true;
    return stand;
  });
  return { text, changed };
}

/** Below this the frame is scaled no further; a smaller one could not be read at all. */
export const MIN_ZOOM = 0.1;

/**
 * How far to scale the frame so it fits the room the tab has, 1 when it fits.
 *
 * Width only: a page scrolls, so a frame taller than the tab is not cut off,
 * only read by scrolling — the way the device itself would be.
 */
export function fitZoom(frameWidth: number, available: number, gutter = 24): number {
  const room = available - gutter * 2;
  if (room <= 0 || frameWidth <= 0) return 1;
  const z = Math.min(1, room / frameWidth);
  return Math.max(MIN_ZOOM, Math.floor(z * 100) / 100);
}

/**
 * The stylesheet that narrows the page to the frame and centres it.
 *
 * On `body`, because the bar and everything else Codename draws is a sibling
 * of it under `html` and must not be narrowed or scaled with the page. The
 * area outside the frame is dimmed with a shadow rather than repainted, since
 * the page's own background is what fills the canvas and belongs to the page.
 */
export function frameCss(frame: FrameSize, zoom: number): string {
  return [
    'body {',
    `  width: ${frame.width}px !important;`,
    `  min-width: ${frame.width}px !important;`,
    `  max-width: ${frame.width}px !important;`,
    // A short page still fills the device's height; the room is the page's own.
    frame.fill ? '' : `  min-height: ${frame.height}px !important;`,
    '  margin-left: auto !important;',
    '  margin-right: auto !important;',
    '  box-sizing: border-box !important;',
    zoom === 1 ? '' : `  zoom: ${zoom} !important;`,
    frame.fill ? '' : '  box-shadow: 0 0 0 1px rgba(127, 127, 127, 0.35), 0 0 0 100vmax rgba(0, 0, 0, 0.22) !important;',
    '}',
    // Something sized in `vw` would spill past the frame; a device clips it.
    // On the body this does nothing — a body's overflow is handed to the
    // viewport while the root's is visible — so the root takes it too.
    // `clip`, not `hidden`, so no scroll container breaks `position: sticky`.
    'html { overflow-x: hidden !important; }',
    'body { overflow-x: clip !important; }',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * The width the page has to itself: the viewport less whatever a margin on
 * the root's left has taken — the rail's column, while it is showing.
 * `clientWidth` alone still counts that column, and a frame fitted to it
 * would run under the rail.
 */
export function availableWidth(doc: Document): number {
  const root = doc.documentElement;
  const style = doc.defaultView?.getComputedStyle(root);
  // The rail on the left and the panel on the right both push the root.
  const left = parseFloat(style?.marginLeft ?? '') || 0;
  const right = parseFloat(style?.marginRight ?? '') || 0;
  return Math.max(0, root.clientWidth - Math.max(0, left) - Math.max(0, right));
}
