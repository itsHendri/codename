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
): LayerNode[] {
  const needle = query.trim().toLowerCase();

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

/** Everything collapsed except the shallowest rows, so a big page opens calm. */
export function initialCollapsed(nodes: LayerNode[], openToDepth = 2): Set<number> {
  return new Set(nodes.filter((n) => n.depth >= openToDepth && n.descendants > 0).map((n) => n.id));
}
