import { useEffect, useMemo, useRef, useState } from 'react';
import { ancestorsOf, initialCollapsed, nextSiblingOf, parentOf, visibleRows, type LayerNode } from '@/studio/layers';

/**
 * The page as a list you can pick from.
 *
 * This is the answer to the problem the positional-selector badge only ever
 * reported: an element with no distinctive selector is hard to hover onto and
 * impossible to describe, but it is easy to point at in a tree.
 */
export function LayersTree({
  nodes,
  selectedSelector,
  onSelect,
  onPeek,
  onToggleHidden,
  onMove,
  onRefresh,
  loading,
}: {
  nodes: LayerNode[];
  selectedSelector: string | null;
  onSelect: (node: LayerNode) => void;
  onPeek: (node: LayerNode | null) => void;
  onToggleHidden: (node: LayerNode) => void;
  /** Drop a row before another of its siblings, or last (`before` null). */
  onMove: (node: LayerNode, parent: LayerNode, before: LayerNode | null, wasBefore: LayerNode | null) => void;
  onRefresh: () => void;
  loading: boolean;
}) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState('');
  const [skipHidden, setSkipHidden] = useState(false);
  // A drag in progress: the row being carried, and where it would land.
  const [dragId, setDragId] = useState<number | null>(null);
  const [drop, setDrop] = useState<{ id: number; where: 'before' | 'after' } | null>(null);
  const hiddenCount = useMemo(() => nodes.filter((n) => n.hidden).length, [nodes]);
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<number, HTMLDivElement>());

  // A fresh snapshot starts calm: the top two levels open, the rest folded.
  useEffect(() => {
    setCollapsed(initialCollapsed(nodes));
  }, [nodes]);

  const rows = useMemo(() => visibleRows(nodes, collapsed, query, skipHidden), [nodes, collapsed, query, skipHidden]);

  const selectedId = useMemo(
    () => (selectedSelector ? (nodes.find((n) => n.selector === selectedSelector)?.id ?? null) : null),
    [nodes, selectedSelector],
  );

  // Selecting on the page opens the tree to it and scrolls it into view.
  useEffect(() => {
    if (selectedId === null) return;
    setCollapsed((prev) => {
      const chain = ancestorsOf(nodes, selectedId);
      if (!chain.some((id) => prev.has(id))) return prev;
      const next = new Set(prev);
      for (const id of chain) next.delete(id);
      return next;
    });
  }, [nodes, selectedId]);

  useEffect(() => {
    if (selectedId === null) return;
    rowRefs.current.get(selectedId)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId, rows]);

  const toggle = (id: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /**
   * Reordering by drag, among siblings only: a row can go before or after
   * another row inside the same parent. Moving into a different parent is
   * a bigger change than a reorder and is deliberately not offered.
   */
  const dropFor = (target: LayerNode, e: React.DragEvent): { id: number; where: 'before' | 'after' } | null => {
    if (dragId === null || dragId === target.id) return null;
    const a = parentOf(nodes, dragId);
    const b = parentOf(nodes, target.id);
    if (!a || !b || a.id !== b.id) return null;
    const box = e.currentTarget.getBoundingClientRect();
    return { id: target.id, where: e.clientY < box.top + box.height / 2 ? 'before' : 'after' };
  };

  const finishDrop = () => {
    if (dragId !== null && drop) {
      const node = nodes.find((n) => n.id === dragId)!;
      const target = nodes.find((n) => n.id === drop.id)!;
      const parent = parentOf(nodes, dragId)!;
      const before = drop.where === 'before' ? target : nextSiblingOf(nodes, target.id);
      onMove(node, parent, before, nextSiblingOf(nodes, node.id));
    }
    setDragId(null);
    setDrop(null);
  };

  /**
   * The tree from the keyboard, as a file browser works: up and down move the
   * selection through the rows you can see, left folds and right unfolds the
   * row you are on, and Enter picks it again (useful after the page moved).
   */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!rows.length) return;
    const at = selectedId === null ? -1 : rows.findIndex((r) => r.id === selectedId);
    const current = at >= 0 ? rows[at]! : null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = rows[Math.min(rows.length - 1, Math.max(0, at + (e.key === 'ArrowDown' ? 1 : -1)))]!;
      if (next !== current) onSelect(next);
    } else if (e.key === 'ArrowLeft' && current && current.descendants > 0 && !collapsed.has(current.id)) {
      e.preventDefault();
      toggle(current.id);
    } else if (e.key === 'ArrowRight' && current && current.descendants > 0 && collapsed.has(current.id)) {
      e.preventDefault();
      toggle(current.id);
    } else if (e.key === 'Enter' && current) {
      e.preventDefault();
      onSelect(current);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div className="flex shrink-0 items-center gap-1.5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a layer…"
          aria-label="Find a layer"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-control border border-line bg-surface-recessed px-2 py-0.5 text-xs"
        />
        {hiddenCount > 0 && (
          <button
            onClick={() => setSkipHidden((v) => !v)}
            aria-pressed={skipHidden}
            title={skipHidden ? `Showing hidden layers again (${hiddenCount})` : `Leave out the ${hiddenCount} hidden ${hiddenCount === 1 ? 'layer' : 'layers'}`}
            className={`shrink-0 rounded-control border px-1.5 py-0.5 text-2xs ${
              skipHidden ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-secondary hover:bg-surface-control'
            }`}
          >
            {skipHidden ? '◌' : '◉'} {hiddenCount}
          </button>
        )}
        <button
          onClick={onRefresh}
          disabled={loading}
          title="Read the page again"
          className="shrink-0 rounded-control border border-line px-2 py-0.5 text-2xs text-ink-secondary hover:bg-surface-control disabled:opacity-40"
        >
          {loading ? '…' : '↻'}
        </button>
      </div>

      {nodes.length === 0 ? (
        <p className="px-1 py-2 text-2xs text-ink-muted">
          {loading ? 'Reading the page…' : 'No layers read yet.'}
        </p>
      ) : (
        <div
          ref={listRef}
          role="tree"
          tabIndex={0}
          aria-label="Layers"
          onKeyDown={onKeyDown}
          onMouseLeave={() => onPeek(null)}
          className="min-h-0 flex-1 overflow-y-auto rounded-control border border-line-subtle focus-visible:border-accent"
        >
          {rows.map((node) => {
            const isSelected = node.id === selectedId;
            const foldable = node.descendants > 0 && !query;
            return (
              <div
                key={node.id}
                role="treeitem"
                aria-selected={isSelected}
                aria-expanded={foldable ? !collapsed.has(node.id) : undefined}
                ref={(el) => {
                  if (el) rowRefs.current.set(node.id, el);
                  else rowRefs.current.delete(node.id);
                }}
                onMouseEnter={() => onPeek(node)}
                draggable={!query}
                onDragStart={(e) => {
                  setDragId(node.id);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', node.selector);
                }}
                onDragOver={(e) => {
                  const d = dropFor(node, e);
                  if (!d) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (d.id !== drop?.id || d.where !== drop?.where) setDrop(d);
                }}
                onDragLeave={() => drop?.id === node.id && setDrop(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  finishDrop();
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDrop(null);
                }}
                className={`flex items-center gap-1 py-0.5 pr-1 text-2xs ${
                  isSelected
                    ? 'bg-surface-selected text-ink'
                    : 'text-ink-secondary hover:bg-surface-control'
                } ${node.hidden ? 'opacity-50' : ''} ${dragId === node.id ? 'opacity-40' : ''} ${
                  drop?.id === node.id
                    ? drop.where === 'before'
                      ? 'shadow-[inset_0_2px_0_0_var(--accent)]'
                      : 'shadow-[inset_0_-2px_0_0_var(--accent)]'
                    : ''
                }`}
                style={{ paddingLeft: `${4 + node.depth * 9}px` }}
              >
                <button
                  onClick={() => foldable && toggle(node.id)}
                  aria-label={foldable ? (collapsed.has(node.id) ? 'Expand' : 'Collapse') : undefined}
                  tabIndex={foldable ? 0 : -1}
                  className={`w-2.5 shrink-0 text-left text-ink-muted ${foldable ? '' : 'invisible'}`}
                >
                  {collapsed.has(node.id) ? '▸' : '▾'}
                </button>
                <button
                  onClick={() => onSelect(node)}
                  className="min-w-0 flex-1 truncate text-left font-mono"
                  title={node.selector}
                >
                  {node.label}
                  {node.text && (
                    <span className="ml-1.5 font-sans text-ink-muted">
                      {node.text}
                    </span>
                  )}
                </button>
                {node.matches > 1 && (
                  <span
                    className="shrink-0 rounded-full border border-line-strong bg-surface-control px-1 font-mono text-2xs text-ink-secondary"
                    title={`${node.matches} elements share this class selector`}
                  >
                    ×{node.matches}
                  </span>
                )}
                <button
                  onClick={() => onToggleHidden(node)}
                  aria-label={node.hidden ? 'Show' : 'Hide'}
                  title={node.hidden ? 'Show' : 'Hide'}
                  className="shrink-0 px-0.5 text-ink-faint hover:text-ink-secondary"
                >
                  {node.hidden ? '◌' : '◉'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
