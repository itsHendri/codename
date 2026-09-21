import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronIcon, EyeIcon, EyeOffIcon, RefreshIcon } from '../icons';
import { LayerIcon } from './LayerIcon';
import {
  ancestorsOf,
  canHold,
  initialCollapsed,
  isWithin,
  nextSiblingOf,
  parentOf,
  visibleRows,
  type LayerNode,
} from '@/studio/layers';

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
  /** Drop a row into `parent`, before `before` or last (`before` null); `wasIn`/`wasBefore` say where it came from. */
  onMove: (node: LayerNode, parent: LayerNode, before: LayerNode | null, wasIn: LayerNode, wasBefore: LayerNode | null) => void;
  onRefresh: () => void;
  loading: boolean;
}) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState('');
  const [skipHidden, setSkipHidden] = useState(false);
  // A drag in progress: the row being carried, and where it would land.
  const [dragId, setDragId] = useState<number | null>(null);
  const [drop, setDrop] = useState<{ id: number; where: 'before' | 'after' | 'into' } | null>(null);
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
   * Moving by drag. The top and bottom quarters of a row mean before and
   * after it, wherever it is in the tree; the middle means into it, as its
   * last child, when it is something that can hold children. A row cannot be
   * dropped into itself or anything inside it, and the root stays put.
   */
  const dropFor = (target: LayerNode, e: React.DragEvent): { id: number; where: 'before' | 'after' | 'into' } | null => {
    if (dragId === null || dragId === target.id) return null;
    const dragged = nodes.find((n) => n.id === dragId);
    if (!dragged || isWithin(nodes, dragged, target.id)) return null;
    const box = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - box.top) / box.height;
    if (canHold(target) && y >= 0.3 && y <= 0.7) return { id: target.id, where: 'into' };
    if (!parentOf(nodes, target.id)) return null;
    return { id: target.id, where: y < 0.5 ? 'before' : 'after' };
  };

  const finishDrop = () => {
    if (dragId !== null && drop) {
      const node = nodes.find((n) => n.id === dragId)!;
      const target = nodes.find((n) => n.id === drop.id)!;
      const wasIn = parentOf(nodes, dragId)!;
      if (drop.where === 'into') onMove(node, target, null, wasIn, nextSiblingOf(nodes, node.id));
      else {
        const parent = parentOf(nodes, target.id)!;
        const before = drop.where === 'before' ? target : nextSiblingOf(nodes, target.id);
        onMove(node, parent, before, wasIn, nextSiblingOf(nodes, node.id));
      }
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
      <div className="flex shrink-0 items-center gap-1">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a layer…"
          aria-label="Find a layer"
          spellCheck={false}
          className="field min-w-0 flex-1 px-2 placeholder:text-ink-muted"
        />
        {hiddenCount > 0 && (
          <button
            onClick={() => setSkipHidden((v) => !v)}
            aria-pressed={skipHidden}
            title={skipHidden ? `Showing hidden layers again (${hiddenCount})` : `Leave out the ${hiddenCount} hidden ${hiddenCount === 1 ? 'layer' : 'layers'}`}
            className={`flex h-control shrink-0 items-center gap-1 rounded-control px-1.5 text-2xs ${
              skipHidden ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:bg-surface-field hover:text-ink'
            }`}
          >
            {skipHidden ? <EyeOffIcon /> : <EyeIcon />} {hiddenCount}
          </button>
        )}
        <button
          onClick={onRefresh}
          disabled={loading}
          title="Read the page again"
          aria-label="Read the page again"
          className="flex h-control w-6 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-surface-field hover:text-ink disabled:opacity-40"
        >
          <RefreshIcon className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {nodes.length === 0 ? (
        <p className="px-1 py-2 text-xs text-ink-muted">
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
          className="group/tree -mx-1 min-h-0 flex-1 overflow-y-auto px-1 focus-visible:outline-none"
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
                className={`group flex h-6 items-center gap-1 rounded-[5px] pr-1 text-xs ${
                  isSelected
                    ? 'bg-accent-soft text-ink group-focus-visible/tree:shadow-[inset_0_0_0_1px_var(--accent)]'
                    : 'text-ink-secondary hover:bg-surface-field'
                } ${node.hidden ? 'opacity-50' : ''} ${dragId === node.id ? 'opacity-40' : ''} ${
                  drop?.id === node.id
                    ? drop.where === 'before'
                      ? 'shadow-[inset_0_2px_0_0_var(--accent)]'
                      : drop.where === 'after'
                        ? 'shadow-[inset_0_-2px_0_0_var(--accent)]'
                        : 'shadow-[inset_0_0_0_2px_var(--accent)] bg-accent-soft'
                    : ''
                }`}
                style={{ paddingLeft: `${2 + Math.min(node.depth, 12) * 10}px` }}
              >
                <button
                  onClick={() => foldable && toggle(node.id)}
                  aria-label={foldable ? (collapsed.has(node.id) ? 'Expand' : 'Collapse') : undefined}
                  tabIndex={foldable ? 0 : -1}
                  className={`flex h-4 w-3 shrink-0 items-center justify-center text-ink-muted hover:text-ink ${foldable ? '' : 'invisible'}`}
                >
                  <ChevronIcon className={`h-2.5 w-2.5 transition-transform ${collapsed.has(node.id) ? '' : 'rotate-90'}`} />
                </button>
                <LayerIcon tag={node.tag} className={isSelected ? 'text-accent' : 'text-ink-muted'} />
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
                {/* The name is what a row is for, so it is the last thing to
                    give way: the badge is short, and the eye shows only under
                    the pointer, or when it is the reason the row is dim. */}
                {node.matches > 1 && (
                  <span
                    className="h-4 shrink-0 rounded-[4px] bg-surface-field px-1 font-mono text-2xs leading-4 text-ink-muted"
                    title={`${node.matches} elements share this class selector`}
                  >
                    ×{node.matches}
                  </span>
                )}
                <button
                  onClick={() => onToggleHidden(node)}
                  aria-label={node.hidden ? 'Show' : 'Hide'}
                  title={node.hidden ? 'Show' : 'Hide'}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] text-ink-muted hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 ${
                    node.hidden ? '' : 'opacity-0'
                  }`}
                >
                  {node.hidden ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
