/**
 * Build a CSS selector that identifies one element on a page — pure DOM,
 * no React, no chrome.*. Preference order: unique id, stable classes,
 * structural ancestors, and only then positional (:nth-of-type) pseudo-classes.
 */

export interface SelectorResult {
  /** A selector that matches exactly this element within `root` (when `stable` is true it contains no positional pseudo-classes). */
  selector: string;
  /** How many elements `selector` matches in `root` — 1 unless the fallback ran out. */
  matches: number;
  /** false when :nth-of-type was needed, i.e. the selector will break on any DOM reorder. */
  stable: boolean;
  /** The class-level selector a designer *means* ("all buttons like this one") and how many it matches. */
  intent: { selector: string; matches: number };
}

/** How many ancestor segments we are willing to prepend before falling back to a positional path. */
const MAX_DEPTH = 6;

/**
 * Class names that are generated (hashed) rather than authored, and so mean
 * nothing to a designer and change on every build:
 *  - styled-components / emotion / styled-jsx prefixes (`sc-bdVaJa`, `css-1x2y3z`)
 *  - anything ending in a 5+ char hex hash (`btn-primary-3f9a1c`)
 *  - CSS modules (`Button_root__x3F9a`) — the spec's `[a-z]+_…` shape, case-insensitive so
 *    PascalCase component names count too, and allowing the double underscore
 *  - Tailwind variant / arbitrary classes (`md:flex`, `w-[32px]`, `bg-white/50`)
 */
const UNSTABLE_CLASS = [/^(css|sc|jsx|emotion)-/i, /-[0-9a-f]{5,}$/i, /^[a-z]+_[a-z0-9_]{5,}$/i];

export function isStableClass(name: string): boolean {
  if (!name || /[:/[\]]/.test(name)) return false;
  return !UNSTABLE_CLASS.some((re) => re.test(name));
}

/** CSS.escape when available, else a safe fallback that backslash-escapes anything outside [A-Za-z0-9_-] and non-ASCII up to U+FFFD (never U+FFFF: Chrome will not inject a file containing a noncharacter), plus a leading digit. */
export function escapeIdent(s: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(s);
  return s.replace(/^(\d)/, (d) => `\\3${d} `).replace(/[^\w\u00a0-\ufffd-]/g, (c) => `\\${c}`);
}

/** `tag#id` or null when the element has no id, the id contains whitespace, or it is not unique in root. */
function idSegment(el: Element, root: ParentNode): string | null {
  const id = el.getAttribute('id');
  if (!id || /\s/.test(id)) return null;
  const sel = `${el.localName}#${escapeIdent(id)}`;
  return count(root, sel) === 1 ? sel : null;
}

/** `tag.c1.c2` from the first two stable classes, or bare `tag` — the "all elements like this one" selector. */
function classSegment(el: Element): string {
  const classes = Array.from(el.classList).filter(isStableClass).slice(0, 2);
  return el.localName + classes.map((c) => `.${escapeIdent(c)}`).join('');
}

function count(root: ParentNode, selector: string): number {
  try {
    return root.querySelectorAll(selector).length;
  } catch {
    return 0;
  }
}

/** 1-based index among siblings that share this element's tag — what :nth-of-type counts. */
function nthOfType(el: Element): number {
  let n = 1;
  for (let sib = el.previousElementSibling; sib; sib = sib.previousElementSibling) {
    if (sib.localName === el.localName) n++;
  }
  return n;
}

function isShadowRoot(node: Node): node is ShadowRoot {
  return node.nodeType === Node.DOCUMENT_FRAGMENT_NODE && 'host' in node;
}

export function buildSelector(el: Element, root: ParentNode = el.ownerDocument): SelectorResult {
  // Elements inside a shadow tree are only reachable from their own root.
  const rootNode = el.getRootNode();
  if (isShadowRoot(rootNode)) root = rootNode;

  const doc = el.ownerDocument;
  if (el === doc.documentElement || el === doc.body) {
    const tag = el.localName;
    return { selector: tag, matches: 1, stable: true, intent: { selector: tag, matches: 1 } };
  }

  const intentSel = classSegment(el);
  const intent = { selector: intentSel, matches: count(root, intentSel) };
  const done = (selector: string, stable: boolean): SelectorResult => ({
    selector,
    matches: count(root, selector),
    stable,
    intent,
  });

  // (1) unique id
  const own = idSegment(el, root);
  if (own) return done(own, true);

  // (2) stable classes alone
  if (intent.matches === 1) return done(intentSel, true);

  // Collect the ancestor chain, top → bottom, stopping at a uniquely-id'd
  // ancestor (which anchors the path) or at `root` / MAX_DEPTH.
  const chain: { el: Element; seg: string }[] = [{ el, seg: intentSel }];
  for (let a = el.parentElement, depth = 0; a && a !== root && depth < MAX_DEPTH; a = a.parentElement, depth++) {
    const anchor = idSegment(a, root);
    chain.unshift({ el: a, seg: anchor ?? classSegment(a) });
    if (anchor) break;
  }
  const join = (segs: string[]) => segs.join(' > ');

  // (3) structural: grow the chain upward until unique
  for (let k = 2; k <= chain.length; k++) {
    const sel = join(chain.slice(-k).map((c) => c.seg));
    if (count(root, sel) === 1) return done(sel, true);
  }

  // (4) positional: for each chain length, add :nth-of-type to the deepest
  // segment first and work upward, so the shortest positional selector wins.
  for (let k = 1; k <= chain.length; k++) {
    const segs = chain.slice(-k).map((c) => c.seg);
    const els = chain.slice(-k).map((c) => c.el);
    for (let i = segs.length - 1; i >= 0; i--) {
      segs[i] = `${segs[i]}:nth-of-type(${nthOfType(els[i]!)})`;
      const sel = join(segs);
      if (count(root, sel) === 1) return done(sel, false);
    }
  }

  // (5) last resort: a full positional path from body (or the shadow root's top).
  const path: string[] = [];
  for (let n: Element | null = el; n && n !== root; n = n.parentElement) {
    if (n === doc.body) {
      path.unshift('body');
      break;
    }
    path.unshift(`${n.localName}:nth-of-type(${nthOfType(n)})`);
  }
  return done(join(path), false);
}
