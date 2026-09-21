/**
 * The inspector's reads of the page that are about structure: an element's
 * own text, its box, its neighbours, the page as a flat list of layers, and
 * a selector looked up without trusting it to parse.
 *
 * Pure in the sense that matters: given a document and an element, the same
 * answer every time, with nothing painted and nothing remembered. The
 * inspector keeps what is stateful — the selection, the overlay.
 */

import { buildSelector, isStableClass } from '@/studio/selector';
import type { LayerNode } from '@/studio/layers';
import type { Rect } from '@/studio/measure';
import type { RuleLike } from '@/studio/scan/customProps';
import { MANAGED_SHEET_IDS } from '@/shared/types';

/** Text is editable only when the element's own children are text. */
export function ownText(el: Element): string | null {
  const nodes = Array.from(el.childNodes);
  if (!nodes.length || nodes.some((n) => n.nodeType !== Node.TEXT_NODE)) return null;
  return el.textContent ?? '';
}

export function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

export type Direction = 'parent' | 'child' | 'next' | 'prev';

/**
 * Where the arrow keys go from an element: up to its parent, down to its
 * first child, across to a sibling. Never the root, and never anything
 * `skip` says is not the page's.
 */
export function neighbour(el: Element, dir: Direction, skip: (el: Element) => boolean = () => false): Element | null {
  const doc = el.ownerDocument;
  const parent = el.parentElement;
  const next =
    dir === 'parent'
      ? parent && parent !== doc.documentElement
        ? parent
        : null
      : dir === 'child'
        ? el.firstElementChild
        : dir === 'next'
          ? el.nextElementSibling
          : el.previousElementSibling;
  return next && !skip(next) ? next : null;
}

/** Structure only: script, style and metadata are not layers. */
export const SKIPPED = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'TITLE', 'NOSCRIPT', 'TEMPLATE', 'BR']);

/** A page bigger than this is not worth sending whole; the tree stops here. */
export const MAX_LAYERS = 1500;

/**
 * How a row reads: `input#family.name-field`. The id goes first because it is
 * the most identifying thing an element has, and a row that shows only classes
 * disagrees with the selector the header shows once you pick it.
 */
export function layerLabel(el: Element): string {
  const id = el.getAttribute('id');
  const idPart = id && /^[A-Za-z][\w-]*$/.test(id) ? `#${id}` : '';
  const classes = Array.from(el.classList)
    .filter(isStableClass)
    .slice(0, 2)
    .map((c) => `.${c}`)
    .join('');
  return el.tagName.toLowerCase() + idPart + classes;
}

/**
 * The page as a flat list with depths. Built in one walk; `descendants` is
 * filled in on the way back up so the panel can collapse a subtree by
 * skipping rows. `skip` leaves out what is not the page's — the overlay,
 * the rail — and `style` is how an element's display is read.
 */
export function buildLayers(
  root: Element | null,
  skip: (el: Element) => boolean = () => false,
  style: (el: Element) => CSSStyleDeclaration = (el) => getComputedStyle(el),
): LayerNode[] {
  const out: LayerNode[] = [];
  const walk = (el: Element, depth: number): number => {
    if (out.length >= MAX_LAYERS) return 0;
    const index = out.length;
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent ?? '')
      .join(' ')
      .trim();
    const cs = style(el);
    // One selector build per node: it walks ancestors and is the expensive part.
    const sel = buildSelector(el);
    out.push({
      id: index,
      tag: el.tagName.toLowerCase(),
      label: layerLabel(el),
      selector: sel.selector,
      stable: sel.stable,
      matches: sel.intent.matches,
      ...(sel.intent.matches > 1 ? { intent: sel.intent.selector } : {}),
      depth,
      descendants: 0,
      hidden: cs.display === 'none' || cs.visibility === 'hidden',
      display: cs.display,
      ...(own ? { text: own.slice(0, 60) } : {}),
    });
    let count = 0;
    // An icon is one layer. Its paths and polylines are drawing, not structure,
    // and on an illustrated page they outnumber everything else several to one.
    if (el.tagName.toLowerCase() !== 'svg') {
      for (const child of el.children) {
        if (SKIPPED.has(child.tagName) || skip(child)) continue;
        count += 1 + walk(child, depth + 1);
      }
    }
    out[index]!.descendants = count;
    return count;
  };
  if (root) walk(root, 0);
  return out;
}

/**
 * The `@keyframes` names the page's own sheets define, at the top level or
 * one group deep. Structural, like every other walk: a rule is what its
 * text says it is. Our own sheets are left out, so a preset this wrote does
 * not read as the page's.
 */
export function pageKeyframes(doc: Document, skipIds: ReadonlySet<string> = new Set(MANAGED_SHEET_IDS)): string[] {
  const names = new Set<string>();
  const visit = (rules: ArrayLike<RuleLike>, depth: number) => {
    for (const rule of Array.from(rules)) {
      const text = (rule.cssText ?? '').trimStart();
      const name = /^@keyframes\s+([^\s{]+)/i.exec(text)?.[1];
      if (name) names.add(name.replace(/^["']|["']$/g, ''));
      else if (depth < 2 && rule.cssRules && /^@(media|supports|layer)\b/i.test(text)) visit(rule.cssRules, depth + 1);
    }
  };
  for (const sheet of Array.from(doc.styleSheets)) {
    if (sheet.ownerNode instanceof Element && skipIds.has(sheet.ownerNode.id)) continue;
    try {
      visit(sheet.cssRules, 0);
    } catch {
      /* another origin */
    }
  }
  return Array.from(names).sort();
}

/** The first match and how many there are; a selector the page cannot parse is no match. */
export function findAll(selector: string | undefined, doc: ParentNode = document): { first: Element | null; matches: number } {
  if (!selector) return { first: null, matches: 0 };
  try {
    const all = doc.querySelectorAll(selector);
    return { first: all[0] ?? null, matches: all.length };
  } catch {
    return { first: null, matches: 0 };
  }
}

export function find(selector: string | undefined, doc: ParentNode = document): Element | null {
  if (!selector) return null;
  try {
    return doc.querySelector(selector);
  } catch {
    return null;
  }
}
