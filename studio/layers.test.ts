import { describe, expect, it } from 'vitest';
import { ancestorsOf, componentsOf, initialCollapsed, visibleRows, type LayerNode } from './layers';

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
