import { useMemo, useState } from 'react';
import { componentsOf, type LayerComponent, type LayerNode } from '@/studio/layers';

/** How many chips show before the rest fold behind "+N more". */
const FIRST = 6;

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
  // A page with forty repeating classes would push the tree off the rail,
  // so the strip shows a handful and says how many more there are.
  const [all, setAll] = useState(false);
  if (!components.length) return null;
  const shown = all ? components : components.slice(0, FIRST);
  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="shrink-0 text-xs font-medium text-ink">Components</span>
        <span className="truncate text-2xs text-ink-muted">selectors that repeat · pick one to edit all of them</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {shown.map((c) => (
          <button
            key={c.selector}
            onClick={() => onPick(c)}
            title={`${c.count} elements match ${c.selector}`}
            className="flex h-control-sm max-w-full items-center gap-1 rounded-control bg-surface-field px-1.5 font-mono text-2xs text-ink-secondary hover:bg-surface-field-hover hover:text-ink"
          >
            <span className="text-ink-muted">×{c.count}</span>
            <span className="truncate">{c.selector}</span>
          </button>
        ))}
        {components.length > FIRST && (
          <button
            onClick={() => setAll((v) => !v)}
            className="h-control-sm rounded-control px-1.5 text-2xs text-ink-muted hover:bg-surface-field hover:text-ink"
          >
            {all ? 'Fewer' : `+${components.length - FIRST} more`}
          </button>
        )}
      </div>
    </div>
  );
}
