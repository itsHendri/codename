/**
 * The page as a list you can pick from.
 *
 * Held flat, with a depth on each row, rather than as a nested tree: the panel
 * renders a window onto a few hundred rows and a flat array is what that wants.
 * `descendants` is what makes collapsing cheap — skip that many rows and you
 * are past the subtree.
 */

export interface LayerNode {
  /** Position in the flat list. Stable only within one snapshot. */
  id: number;
  tag: string;
  /** How the row reads: `div.card`, `h1#title`. */
  label: string;
  /** Matches exactly this element, so picking a row picks the right thing. */
  selector: string;
  /** false when the selector leans on :nth-of-type. */
  stable: boolean;
  /**
   * How many elements the class-level selector matches — `div.card` ×12.
   * The nearest thing the page has to a component, shown as a badge.
   */
  matches: number;
  /** The class-level selector those matches share, when there is one — `div.card`. */
  intent?: string;
  depth: number;
  /** How many rows after this one are inside it. */
  descendants: number;
  /** The first of its own text, when it has any. */
  text?: string;
  /** Whether the page is currently not painting it. */
  hidden: boolean;
  /** Its computed `display`, so hiding it can say what it was. */
  display: string;
}

const matches = (node: LayerNode, needle: string): boolean =>
  node.label.toLowerCase().includes(needle) || (node.text ?? '').toLowerCase().includes(needle);

/**
 * The rows to draw: everything not inside a collapsed row, and when there is
 * a query, only what matches plus the ancestors that lead to it.
 *
 * Ancestors of a match are kept because a bare list of matches loses where
 * they live, which is the one thing a tree is for.
 */
export function visibleRows(
  nodes: LayerNode[],
  collapsed: ReadonlySet<number>,
  query = '',
  /** Leave out rows the page is not painting, and everything inside them. */
  skipHidden = false,
): LayerNode[] {
  const needle = query.trim().toLowerCase();
  if (skipHidden) {
    const kept: LayerNode[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!;
      if (node.hidden) {
        i += node.descendants;
        continue;
      }
      kept.push(node);
    }
    // Descendant counts still describe the full tree; folding by count
    // would skip too far, so a hidden subtree is removed by rebuilding them.
    nodes = recount(kept);
  }

  if (needle) {
    const keep = new Set<number>();
    // A stack of the current ancestor chain, by index into `nodes`.
    const chain: LayerNode[] = [];
    for (const node of nodes) {
      chain.length = node.depth;
      chain[node.depth] = node;
      if (!matches(node, needle)) continue;
      for (let d = 0; d <= node.depth; d++) {
        const up = chain[d];
        if (up) keep.add(up.id);
      }
    }
    return nodes.filter((n) => keep.has(n.id));
  }

  const rows: LayerNode[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    rows.push(node);
    if (collapsed.has(node.id)) i += node.descendants;
  }
  return rows;
}

/** Descendant counts for a list some rows were removed from, by depth alone. */
function recount(rows: LayerNode[]): LayerNode[] {
  const out = rows.map((r) => ({ ...r, descendants: 0 }));
  for (let i = 0; i < out.length; i++) {
    let n = 0;
    for (let j = i + 1; j < out.length && out[j]!.depth > out[i]!.depth; j++) n++;
    out[i]!.descendants = n;
  }
  return out;
}

/** The chain from the root down to `id`, for expanding to a selection. */
export function ancestorsOf(nodes: LayerNode[], id: number): number[] {
  const target = nodes.find((n) => n.id === id);
  if (!target) return [];
  const out: number[] = [];
  const chain: LayerNode[] = [];
  for (const node of nodes) {
    chain.length = node.depth;
    chain[node.depth] = node;
    if (node.id !== id) continue;
    for (let d = 0; d < node.depth; d++) {
      const up = chain[d];
      if (up) out.push(up.id);
    }
    break;
  }
  return out;
}

/** A class selector that repeats across boxes with something inside them. */
export interface LayerComponent {
  selector: string;
  /** How many elements share it on the page. */
  count: number;
  /** The rows in this snapshot that carry it, in document order. */
  nodes: LayerNode[];
}

/**
 * The nearest thing a page has to components: class-level selectors that
 * match more than one element with children. A `.card` twelve times over is a
 * component in all but name; a `<li>` repeated is structure, not a pattern,
 * so bare tags are left out.
 */
export function componentsOf(nodes: LayerNode[], limit = 8): LayerComponent[] {
  const groups = new Map<string, LayerNode[]>();
  for (const n of nodes) {
    if (!n.intent || n.matches < 2 || n.descendants === 0 || !/[.#]/.test(n.intent)) continue;
    groups.set(n.intent, [...(groups.get(n.intent) ?? []), n]);
  }
  return Array.from(groups, ([selector, list]) => ({ selector, count: list[0]!.matches, nodes: list }))
    .sort((a, b) => b.count - a.count || a.selector.localeCompare(b.selector))
    .slice(0, limit);
}

/**
 * Everything collapsed except the shallowest rows, so a big page opens calm.
 * Four levels is body → root → section → the row you wanted, on most pages.
 */
export function initialCollapsed(nodes: LayerNode[], openToDepth = 4): Set<number> {
  return new Set(nodes.filter((n) => n.depth >= openToDepth && n.descendants > 0).map((n) => n.id));
}
