import { useMemo } from 'react';
import { componentsOf, type LayerComponent, type LayerNode } from '@/studio/layers';

/**
 * The class selectors that repeat on this page, as chips above the tree.
 *
 * A first cut of components: not detected from a framework, just read off
 * the page — `.card` twelve times over is a component in all but name.
 * Picking one selects its first instance with the scope set to all of them,
 * so an edit lands on every card at once.
 */
export function ComponentsStrip({ nodes, onPick }: { nodes: LayerNode[]; onPick: (c: LayerComponent) => void }) {
  const components = useMemo(() => componentsOf(nodes), [nodes]);
  if (!components.length) return null;
  return (
    <div className="flex shrink-0 flex-col gap-1">
      <div className="flex items-baseline gap-2 text-2xs tracking-wide text-ink-muted">
        <span className="uppercase">Components</span>
        <span className="normal-case">selectors that repeat · pick one to edit all of them</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {components.map((c) => (
          <button
            key={c.selector}
            onClick={() => onPick(c)}
            title={`${c.count} elements match ${c.selector}`}
            className="flex items-center gap-1 rounded-full border border-line bg-surface-control px-2 py-0.5 font-mono text-2xs text-ink-secondary hover:border-line-strong hover:text-ink"
          >
            <span className="text-ink-muted">×{c.count}</span>
            {c.selector}
          </button>
        ))}
      </div>
    </div>
  );
}
