import { describe, expect, it } from 'vitest';
import {
  ancestorsOf,
  canHold,
  dropTarget,
  childrenOf,
  componentsOf,
  isWithin,
  initialCollapsed,
  nextSiblingOf,
  parentOf,
  visibleRows,
  type LayerNode,
} from './layers';

/** body > (header > h1, main > (p, ul > li)) */
const node = (
  id: number,
  depth: number,
  label: string,
  descendants: number,
  text?: string,
): LayerNode => ({
  id,
  depth,
  label,
  descendants,
  tag: label.split(/[.#]/)[0]!,
  selector: label,
  stable: true,
  matches: 1,
  hidden: false,
  display: 'block',
  ...(text ? { text } : {}),
});

const tree: LayerNode[] = [
  node(0, 0, 'body', 5),
  node(1, 1, 'header', 1),
  node(2, 2, 'h1#title', 0, 'For Font Sake'),
  node(3, 1, 'main', 2),
  node(4, 2, 'p.note', 0, '1080 × 1350'),
  node(5, 2, 'ul.list', 0),
];

describe('visibleRows', () => {
  it('shows everything when nothing is collapsed', () => {
    expect(visibleRows(tree, new Set()).map((n) => n.id)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('skips a collapsed row’s whole subtree, not just its children', () => {
    expect(visibleRows(tree, new Set([1])).map((n) => n.id)).toEqual([0, 1, 3, 4, 5]);
    expect(visibleRows(tree, new Set([0])).map((n) => n.id)).toEqual([0]);
  });

  it('keeps the ancestors of a match, so a hit still says where it lives', () => {
    expect(visibleRows(tree, new Set(), 'note').map((n) => n.label)).toEqual(['body', 'main', 'p.note']);
  });

  it('searches text as well as the label', () => {
    expect(visibleRows(tree, new Set(), 'font sake').map((n) => n.label)).toEqual([
      'body',
      'header',
      'h1#title',
    ]);
  });

  it('ignores collapse while searching', () => {
    expect(visibleRows(tree, new Set([0, 1, 3]), 'note').map((n) => n.id)).toEqual([0, 3, 4]);
  });

  it('can leave out what the page is not painting, subtree and all', () => {
    const rows: LayerNode[] = [
      node(0, 0, 'body', 4),
      { ...node(1, 1, 'aside.legacy', 1), hidden: true },
      node(2, 2, 'p', 0),
      node(3, 1, 'main', 1),
      node(4, 2, 'h1', 0),
    ];
    expect(visibleRows(rows, new Set(), '', true).map((n) => n.id)).toEqual([0, 3, 4]);
    // Folding still works on the remaining tree.
    expect(visibleRows(rows, new Set([3]), '', true).map((n) => n.id)).toEqual([0, 3]);
  });

  it('finds nothing for a query that matches nothing', () => {
    expect(visibleRows(tree, new Set(), 'zzz')).toEqual([]);
  });
});

describe('ancestorsOf', () => {
  it('is the chain down to the row, excluding the row', () => {
    expect(ancestorsOf(tree, 4)).toEqual([0, 3]);
    expect(ancestorsOf(tree, 0)).toEqual([]);
    expect(ancestorsOf(tree, 99)).toEqual([]);
  });
});

describe('initialCollapsed', () => {
  it('collapses deep rows that have something in them', () => {
    // Only rows at the fold depth or deeper, with descendants; this tree has
    // none past depth 2, so the default folds nothing.
    expect(initialCollapsed(tree)).toEqual(new Set());
    expect(initialCollapsed(tree, 1)).toEqual(new Set([1, 3]));
  });

  it('opens four levels by default and folds what is under them', () => {
    // body > div > section > article > (p > span)
    const deep: LayerNode[] = [
      node(0, 0, 'body', 5),
      node(1, 1, 'div#root', 4),
      node(2, 2, 'section', 3),
      node(3, 3, 'article.card', 2),
      node(4, 4, 'p', 1),
      node(5, 5, 'span', 0),
    ];
    // The article at depth 3 stays open; the paragraph at depth 4 folds.
    expect(initialCollapsed(deep)).toEqual(new Set([4]));
  });
});

describe('componentsOf', () => {
  it('groups repeated class selectors with children, most common first', () => {
    const rows: LayerNode[] = [
      { ...node(0, 0, 'body', 6), intent: 'body', matches: 1 },
      { ...node(1, 1, 'div.card', 1), intent: 'div.card', matches: 3 },
      { ...node(2, 2, 'p', 0), intent: 'p', matches: 9 },
      { ...node(3, 1, 'div.card', 1), intent: 'div.card', matches: 3 },
      { ...node(4, 2, 'span.tag', 0), intent: 'span.tag', matches: 5 },
      { ...node(5, 1, 'li', 1), intent: 'li', matches: 12 },
      { ...node(6, 2, 'a.link', 0), intent: 'a.link', matches: 2 },
    ];
    const groups = componentsOf(rows);
    // A bare tag is structure, a leaf is not a component, so only .card remains.
    expect(groups.map((g) => [g.selector, g.count, g.nodes.length])).toEqual([['div.card', 3, 2]]);
  });
});

describe('dropping into', () => {
  it('refuses a row\'s own subtree and leaf elements', () => {
    expect(isWithin(tree, tree[3]!, 4)).toBe(true);
    expect(isWithin(tree, tree[3]!, 1)).toBe(false);
    expect(isWithin(tree, tree[4]!, 4)).toBe(false);
    expect(canHold(node(9, 1, 'div.card', 0))).toBe(true);
    expect(canHold(node(9, 1, 'img.hero', 0))).toBe(false);
    expect(canHold(node(9, 1, 'svg.brand-mark', 0))).toBe(false);
  });
});

describe('siblings', () => {
  it('knows who a row sits inside, who sits beside it, and who comes next', () => {
    expect(parentOf(tree, 4)!.id).toBe(3);
    expect(parentOf(tree, 0)).toBeNull();
    expect(childrenOf(tree, tree[0]!).map((n) => n.id)).toEqual([1, 3]);
    expect(childrenOf(tree, tree[3]!).map((n) => n.id)).toEqual([4, 5]);
    expect(nextSiblingOf(tree, 4)!.id).toBe(5);
    expect(nextSiblingOf(tree, 5)).toBeNull();
    expect(nextSiblingOf(tree, 1)!.id).toBe(3);
  });
});

describe('dropTarget', () => {
  // body > main > (h1, card > (p, img), footer)
  const tree = [
    node(0, 0, 'body', 6),
    node(1, 1, 'main.plate', 5),
    node(2, 2, 'h1#title', 0),
    node(3, 2, 'div.card', 2),
    node(4, 3, 'p.lede', 0),
    node(5, 3, 'img.hero', 0),
    node(6, 2, 'footer.foot', 0),
  ];
  const at = (id: number) => tree[id]!;

  it('reads the top half as before and the bottom half as after, at the row’s level', () => {
    expect(dropTarget(tree, at(6), at(2), 0.1, false)).toMatchObject({ where: 'before', parent: 1, before: 2, depth: 2 });
    expect(dropTarget(tree, at(2), at(6), 0.9, false)).toMatchObject({ where: 'after', parent: 1, before: null, depth: 2 });
  });

  it('reads the middle of a row that can hold children as into it, last', () => {
    expect(dropTarget(tree, at(2), at(3), 0.5, false)).toEqual({ target: 3, where: 'into', parent: 3, before: null, depth: 3 });
    // An image holds nothing: its middle is before or after.
    expect(dropTarget(tree, at(2), at(5), 0.45, false)).toMatchObject({ where: 'before', parent: 3, before: 5 });
  });

  it('puts a drop after an open row in as its first child, one level in', () => {
    expect(dropTarget(tree, at(6), at(3), 0.9, true)).toEqual({ target: 3, where: 'after', parent: 3, before: 4, depth: 3 });
    // Folded, the same spot is after it, beside it.
    expect(dropTarget(tree, at(2), at(3), 0.9, false)).toMatchObject({ where: 'after', parent: 1, before: 6, depth: 2 });
  });

  it('never lands a row in itself or inside itself, and never moves the root', () => {
    expect(dropTarget(tree, at(3), at(3), 0.5, false)).toBeNull();
    expect(dropTarget(tree, at(3), at(4), 0.1, false)).toBeNull();
    // The root has no level beside it; anywhere on it is into it.
    expect(dropTarget(tree, at(6), at(0), 0.1, false)).toMatchObject({ where: 'into', parent: 0 });
    expect(dropTarget(tree, at(2), at(0), 0.05, false)).toMatchObject({ where: 'into', parent: 0 });
  });

  it('draws nothing for a drop that would leave the row where it is', () => {
    // Just before its own next sibling, or just after its previous one.
    expect(dropTarget(tree, at(2), at(3), 0.1, false)).toBeNull();
    expect(dropTarget(tree, at(3), at(2), 0.9, false)).toBeNull();
    // Into the parent it is already last in.
    expect(dropTarget(tree, at(6), at(1), 0.5, false)).toBeNull();
  });
});
