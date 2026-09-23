import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronIcon, EyeIcon, EyeOffIcon, RefreshIcon, SearchIcon } from '../icons';
import { LayerIcon } from './LayerIcon';
import {
  ancestorsOf,
  dropTarget,
  initialCollapsed,
  nextSiblingOf,
  parentOf,
  visibleRows,
  type LayerDrop,
  type LayerNode,
} from '@/studio/layers';

/** How far the pointer goes before a press on a row is a drag. */
const DRAG_START = 4;
/** How long a folded row is held over before it opens to take the drop. */
const OPEN_AFTER_MS = 500;
/** How close to the list's edge the pointer has to be for it to scroll. */
const EDGE = 28;
/** The indent of one level, and where level zero starts. */
const INDENT = 10;
const INDENT_BASE = 2;

/** A drag in progress: the row in hand, the tree it was picked from, where it would land. */
interface Carry {
  node: LayerNode;
  /** The snapshot at the moment it was picked up; the tree holds still until it is put down. */
  tree: LayerNode[];
  x: number;
  y: number;
  drop: LayerDrop | null;
}

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
  const [query, setQuery] = useState('');
  const [skipHidden, setSkipHidden] = useState(false);
  const [carry, setCarry] = useState<Carry | null>(null);
  const carryRef = useRef<Carry | null>(null);
  carryRef.current = carry;
  // While a row is in hand the tree is the one it was picked from: a page
  // that re-renders mid-drag (most do, all the time) must not swap the rows
  // out from under the pointer.
  const tree = carry?.tree ?? nodes;
  const hiddenCount = useMemo(() => tree.filter((n) => n.hidden).length, [tree]);
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<number, HTMLDivElement>());

  /**
   * What is folded, by selector rather than by row number: the tree is read
   * again whenever the page settles, and numbers only mean something within
   * one reading. A row seen for the first time folds or opens by the calm
   * default; a row seen before keeps what the person did to it.
   */
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const seen = useRef(new Set<string>());
  useEffect(() => {
    const fresh = nodes.filter((n) => !seen.current.has(n.selector));
    if (!fresh.length) return;
    const calm = initialCollapsed(nodes);
    setFolded((prev) => {
      const next = new Set(prev);
      for (const n of fresh) if (calm.has(n.id)) next.add(n.selector);
      return next;
    });
    for (const n of fresh) seen.current.add(n.selector);
  }, [nodes]);
  const collapsed = useMemo(() => new Set(tree.filter((n) => folded.has(n.selector)).map((n) => n.id)), [tree, folded]);

  const rows = useMemo(() => visibleRows(tree, collapsed, query, skipHidden), [tree, collapsed, query, skipHidden]);

  const selectedId = useMemo(
    () => (selectedSelector ? (tree.find((n) => n.selector === selectedSelector)?.id ?? null) : null),
    [tree, selectedSelector],
  );

  // Selecting on the page opens the tree to it and scrolls it into view.
  useEffect(() => {
    if (selectedId === null) return;
    setFolded((prev) => {
      const chain = ancestorsOf(tree, selectedId).map((id) => tree.find((n) => n.id === id)!.selector);
      if (!chain.some((sel) => prev.has(sel))) return prev;
      const next = new Set(prev);
      for (const sel of chain) next.delete(sel);
      return next;
    });
  }, [tree, selectedId]);

  useEffect(() => {
    if (selectedId === null) return;
    rowRefs.current.get(selectedId)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId, rows]);

  const toggle = (id: number) => {
    const sel = tree.find((n) => n.id === id)?.selector;
    if (!sel) return;
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(sel)) next.delete(sel);
      else next.add(sel);
      return next;
    });
  };

  /* ---------------- moving by drag ---------------- */

  /**
   * A row is carried the way Figma and Framer carry a layer: pressed and
   * pulled, it comes away with the pointer as a floating copy, its own row
   * dims, and a line with a dot at its start shows where it will land and at
   * which level. Held over a folded group, the group opens. Near the top or
   * bottom of the list, the list scrolls. Escape puts it back.
   *
   * Pointer events rather than the browser's drag and drop: those would not
   * start from the name (it is a button), draw no line of their own, and
   * are unreliable inside a page's closed shadow root, which is where the
   * rail lives.
   */
  const press = useRef<{ node: LayerNode; x: number; y: number; id: number } | null>(null);
  const moved = useRef(false);
  const openTimer = useRef<{ id: number; timer: number } | null>(null);
  const scrollRaf = useRef(0);

  /** The row under the pointer, and how far down it the pointer is. */
  const rowAt = useCallback(
    (y: number): { node: LayerNode; frac: number } | null => {
      for (const node of rows) {
        const el = rowRefs.current.get(node.id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (y >= r.top && y < r.bottom) return { node, frac: (y - r.top) / r.height };
      }
      // Past the last row: after the last row.
      const last = rows[rows.length - 1];
      const el = last ? rowRefs.current.get(last.id) : null;
      if (last && el && y >= el.getBoundingClientRect().bottom) return { node: last, frac: 0.99 };
      return null;
    },
    [rows],
  );

  const stopScroll = () => {
    cancelAnimationFrame(scrollRaf.current);
    scrollRaf.current = 0;
  };
  const stopOpen = () => {
    if (openTimer.current) window.clearTimeout(openTimer.current.timer);
    openTimer.current = null;
  };

  const place = useCallback(
    (x: number, y: number) => {
      const c = carryRef.current;
      if (!c) return;
      const hit = rowAt(y);
      const drop = hit ? dropTarget(c.tree, c.node, hit.node, hit.frac, !collapsed.has(hit.node.id)) : null;
      setCarry({ ...c, x, y, drop });
      // Held over a folded group, it opens.
      if (hit && drop?.where === 'into' && hit.node.descendants > 0 && collapsed.has(hit.node.id)) {
        if (openTimer.current?.id !== hit.node.id) {
          stopOpen();
          const id = hit.node.id;
          openTimer.current = { id, timer: window.setTimeout(() => toggle(id), OPEN_AFTER_MS) };
        }
      } else stopOpen();
      // Near an edge, the list scrolls, and keeps scrolling while held there.
      const list = listRef.current;
      if (!list) return;
      const box = list.getBoundingClientRect();
      const speed = y < box.top + EDGE ? -Math.ceil((box.top + EDGE - y) / 4) : y > box.bottom - EDGE ? Math.ceil((y - box.bottom + EDGE) / 4) : 0;
      stopScroll();
      if (speed) {
        const step = () => {
          list.scrollTop += speed;
          scrollRaf.current = requestAnimationFrame(step);
        };
        scrollRaf.current = requestAnimationFrame(step);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rowAt, collapsed],
  );

  const endCarry = () => {
    stopScroll();
    stopOpen();
    press.current = null;
    setCarry(null);
  };

  const putDown = () => {
    const c = carryRef.current;
    if (c?.drop) {
      const byId = (id: number | null) => (id === null ? null : c.tree.find((n) => n.id === id) ?? null);
      const parent = byId(c.drop.parent);
      const wasIn = parentOf(c.tree, c.node.id);
      if (parent && wasIn) onMove(c.node, parent, byId(c.drop.before), wasIn, nextSiblingOf(c.tree, c.node.id));
    }
    endCarry();
  };

  const onRowPointerDown = (node: LayerNode) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || query) return;
    // The fold chevron and the eye are buttons of their own.
    if ((e.target as HTMLElement).closest('[data-row-control]')) return;
    press.current = { node, x: e.clientX, y: e.clientY, id: e.pointerId };
    moved.current = false;
  };

  const onRowPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    if (!carryRef.current) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_START) return;
      // The root stays where it is.
      if (!parentOf(nodes, p.node.id)) {
        press.current = null;
        return;
      }
      moved.current = true;
      // Kept by this row while it is carried, so the pointer can leave the
      // list (to scroll it) and still be heard. A pointer the browser no
      // longer knows cannot be captured; the carry goes on regardless.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* not a live pointer */
      }
      onPeek(null);
      const c: Carry = { node: p.node, tree: nodes, x: e.clientX, y: e.clientY, drop: null };
      carryRef.current = c;
      setCarry(c);
    }
    place(e.clientX, e.clientY);
  };

  const onRowPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (press.current?.id !== e.pointerId) return;
    if (carryRef.current) putDown();
    else press.current = null;
  };

  // Escape puts it back, from wherever the focus is.
  useEffect(() => {
    if (!carry) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      endCarry();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(carry)]);

  useEffect(() => () => {
    stopScroll();
    stopOpen();
  }, []);

  /** Where the line goes, in the list's own coordinates, so it scrolls with the rows. */
  const line = useMemo(() => {
    const d = carry?.drop;
    if (!d || d.where === 'into') return null;
    const el = rowRefs.current.get(d.target);
    if (!el) return null;
    return { top: el.offsetTop + (d.where === 'after' ? el.offsetHeight : 0), left: INDENT_BASE + 14 + Math.min(d.depth, 12) * INDENT };
    // Rows are measured after they render; the carry moving is what changes it.
  }, [carry]);

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
        <label className="field flex min-w-0 flex-1 items-center gap-1.5 px-2 text-ink-muted">
          <SearchIcon />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a layer…"
            aria-label="Find a layer"
            spellCheck={false}
            className="h-6 min-w-0 flex-1 bg-transparent text-ink placeholder:text-ink-muted focus-visible:outline-none"
          />
        </label>
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
          className="group/tree relative -mx-1 min-h-0 flex-1 overflow-y-auto px-1 focus-visible:outline-none"
        >
          {/* Where the row in hand will land: a line at the level it joins, a dot where the line starts. */}
          {line && (
            <div aria-hidden className="pointer-events-none absolute right-1 z-10 h-0" style={{ top: line.top, left: line.left }}>
              <span className="absolute -left-[3px] -top-[3px] h-[7px] w-[7px] rounded-full border-[1.5px] border-accent bg-surface-app" />
              <span className="absolute left-1 right-0 -top-px h-0.5 rounded-full bg-accent" />
            </div>
          )}
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
                onMouseEnter={() => !carry && onPeek(node)}
                onPointerDown={onRowPointerDown(node)}
                onPointerMove={onRowPointerMove}
                onPointerUp={onRowPointerUp}
                onPointerCancel={endCarry}
                className={`group flex h-6 select-none items-center gap-1 rounded-[5px] pr-1 text-xs ${
                  isSelected
                    ? 'bg-accent-soft text-ink group-focus-visible/tree:shadow-[inset_0_0_0_1px_var(--accent)]'
                    : carry
                      ? 'text-ink-secondary'
                      : 'text-ink-secondary hover:bg-surface-field'
                } ${node.hidden ? 'opacity-50' : ''} ${carry?.node.id === node.id ? 'opacity-35' : ''} ${
                  carry?.drop?.where === 'into' && carry.drop.target === node.id ? 'bg-accent-soft shadow-[inset_0_0_0_1.5px_var(--accent)]' : ''
                } ${carry ? 'cursor-grabbing' : ''}`}
                style={{ paddingLeft: `${INDENT_BASE + Math.min(node.depth, 12) * INDENT}px` }}
              >
                <button
                  data-row-control
                  onClick={() => foldable && toggle(node.id)}
                  aria-label={foldable ? (collapsed.has(node.id) ? 'Expand' : 'Collapse') : undefined}
                  tabIndex={foldable ? 0 : -1}
                  className={`flex h-4 w-3 shrink-0 items-center justify-center text-ink-muted hover:text-ink ${foldable ? '' : 'invisible'}`}
                >
                  <ChevronIcon className={`h-2.5 w-2.5 transition-transform ${collapsed.has(node.id) ? '' : 'rotate-90'}`} />
                </button>
                <LayerIcon tag={node.tag} className={isSelected ? 'text-accent' : 'text-ink-muted'} />
                <button
                  onClick={() => {
                    // The press that became a drag is not also a pick.
                    if (moved.current) {
                      moved.current = false;
                      return;
                    }
                    onSelect(node);
                  }}
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
                  data-row-control
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

      {/* The row in hand, following the pointer. */}
      {carry && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[2147483647] flex h-6 max-w-[220px] items-center gap-1 rounded-[5px] bg-surface-raised px-1.5 text-xs text-ink shadow-[0_6px_16px_rgb(0_0_0/0.28),0_0_0_1px_var(--line)]"
          style={{ left: carry.x + 10, top: carry.y - 12 }}
        >
          <LayerIcon tag={carry.node.tag} className="text-accent" />
          <span className="truncate font-mono">{carry.node.label}</span>
        </div>
      )}
    </div>
  );
}
