import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { LayerNode } from '@/studio/layers';
import { pagesOf } from '@/studio/pages';
import { callInspector } from '@/shared/inpage';
import { LayersTree } from '@/entrypoints/sidepanel/components/inspect/LayersTree';
import { SvgsTab } from '@/entrypoints/sidepanel/components/SvgsTab';
import { ComponentsIcon, DesignIcon, ImageIcon, LayersIcon, PagesIcon, RefreshIcon } from '@/entrypoints/sidepanel/components/icons';
import { DsmColumn } from './DsmColumn';
import { ComponentsTab } from './ComponentsTab';
import { SideStrip } from './SideStrip';
import type { RailStore } from './store';
import { useRailLayers } from './useRailLayers';

type RailTab = 'pages' | 'layers' | 'components' | 'assets' | 'system';

/** Tell the panel something that belongs in its change log. */
const tell = (msg: unknown) => {
  try {
    void chrome.runtime.sendMessage(msg);
  } catch {
    /* panel closed */
  }
};

/**
 * The page as a tree and as a set of assets, docked to its left edge.
 *
 * A strip of sections on the far left, the way Figma and Weave lay out the
 * left of the canvas, and a column beside it showing the one chosen; the
 * same section again folds the column and leaves the strip. The tree is
 * the same component the panel drew; only where it stands has changed.
 * Picking a row asks the inspector in the same page; a drag or the eye on
 * a row is an element edit, so it goes to the panel and lands in the log
 * there, with undo and the brief, as an edit from the edit card does.
 */
export function Rail({ store, onResize, onColumn }: { store: RailStore; onResize: (width: number) => void; onColumn: (open: boolean) => void }) {
  const state = useSyncExternalStore(store.subscribe, store.get);
  const [tab, setTab] = useState<RailTab>('layers');
  const column = state.column;
  // System is the Design System Manager: the panel opens it (the styles page
  // over the page, System in the panel) and this column shows its outline.
  const dsmOn = state.dsm !== null;
  useEffect(() => {
    if (dsmOn) setTab('system');
    else setTab((t) => (t === 'system' ? 'layers' : t));
  }, [dsmOn]);
  const choose = (key: RailTab) => {
    if (key === 'system') {
      if (dsmOn && tab === 'system' && column) tell({ type: 'dsm-toggled', on: false });
      else {
        tell({ type: 'dsm-toggled', on: true });
        if (!column) onColumn(true);
      }
      return;
    }
    if (key === tab) onColumn(!column);
    else {
      setTab(key);
      if (!column) onColumn(true);
    }
  };
  // The tree is read while the rail shows Layers or Components (its
  // repeating styles come from it); Pages and Assets do not need it walked.
  const tree = useRailLayers(state.on && column && (tab === 'layers' || tab === 'components'));
  // The site's pages, as this page links to them: read when the tab opens
  // and on its refresh button, the way Framer's list is a thing you look at
  // rather than something that ticks.
  const [pagesTurn, setPagesTurn] = useState(0);
  // A page that links nowhere — an app with buttons for navigation — still
  // has a sitemap more often than not. Fetched once per site through the
  // background, with the access the person already granted.
  const [sitemap, setSitemap] = useState<{ href: string; text: string }[] | null>(null);
  const sitemapFor = useRef<string | null>(null);
  useEffect(() => {
    if (tab !== 'pages' || sitemapFor.current === location.origin) return;
    sitemapFor.current = location.origin;
    let live = true;
    (async () => {
      try {
        const res = (await chrome.runtime.sendMessage({ type: 'fetch-text', url: `${location.origin}/sitemap.xml` })) as
          | { ok: boolean; text?: string }
          | undefined;
        if (!live) return;
        const locs = res?.ok && res.text ? Array.from(res.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi), (m) => ({ href: m[1]!, text: '' })) : [];
        setSitemap(locs);
      } catch {
        if (live) setSitemap([]);
      }
    })();
    return () => {
      live = false;
    };
  }, [tab]);
  const pages = useMemo(
    () =>
      tab === 'pages'
        ? pagesOf([...Array.from(document.links, (a) => ({ href: a.href, text: a.textContent ?? '' })), ...(sitemap ?? [])], location.href)
        : [],
    [tab, pagesTurn, sitemap],
  );

  // Undo and Escape work from the rail as they do from the page: the panel
  // owns the log, the inspector owns the selection.
  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
    if (typing) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      tell({ type: 'inspector-shortcut', action: e.shiftKey ? 'redo' : 'undo' });
    } else if (e.key === 'Escape') {
      // The page's own ladder: Select off first, then the selection.
      e.preventDefault();
      void callInspector({ cmd: 'escape' });
    }
  };

  const onEdgeDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onEdgeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) onResize(e.clientX);
  };
  const onEdgeKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === 'ArrowLeft' ? -16 : e.key === 'ArrowRight' ? 16 : 0;
    if (!delta) return;
    e.preventDefault();
    onResize(state.width + delta);
  };

  const tabs = [
    { key: 'pages' as const, label: 'Pages', Icon: PagesIcon },
    { key: 'layers' as const, label: 'Layers', Icon: LayersIcon },
    { key: 'components' as const, label: 'Components', Icon: ComponentsIcon },
    { key: 'assets' as const, label: 'Assets', Icon: ImageIcon },
    { key: 'system' as const, label: 'System', title: 'Design System Manager', Icon: DesignIcon },
  ];

  const heading = tab === 'system' ? 'Design System Manager' : (tabs.find((t) => t.key === tab)?.label ?? '');

  return (
    <div className="rail relative flex h-full border-r border-r-[color:var(--ink-faint)]" onKeyDown={onKey}>
      <SideStrip items={tabs} active={tab} open={column} onSelect={choose} ariaLabel="Rail" idPrefix="rail-tab" />
      {column && (
        <div role="tabpanel" aria-labelledby={`rail-tab-${tab}`} className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5 p-2.5">
          {/* The section's name, the height of the bar, so the three pieces of chrome read as one. */}
          <div className="-mx-2.5 -mt-2.5 flex h-10 shrink-0 items-center border-b border-line px-3 text-xs font-medium text-ink">{heading}</div>
        {tab === 'system' ? (
          <DsmColumn outline={state.dsm ?? { sections: [] }} />
        ) : tab === 'pages' ? (
          <>
            <div className="flex shrink-0 items-center justify-between gap-2 text-2xs text-ink-muted">
              <span>
                {pages.length
                  ? `${pages.length} ${pages.length === 1 ? 'page' : 'pages'}${sitemap?.length ? ', from this page and the sitemap' : ' this page links to'}`
                  : sitemap === null
                    ? 'Reading the sitemap…'
                    : 'No other pages found: this page links to none on its site, and there is no sitemap. An app that changes screens without changing its address has none to list.'}
              </span>
              <button
                onClick={() => setPagesTurn((t) => t + 1)}
                title="Read the page's links again"
                aria-label="Read the page's links again"
                className="flex h-control w-6 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-surface-field hover:text-ink"
              >
                <RefreshIcon />
              </button>
            </div>
            {pages.length > 0 && (
              <ul aria-label="Pages" className="m-0 -mx-1 flex min-h-0 flex-1 list-none flex-col overflow-y-auto px-1 py-0">
                {pages.map((p) => (
                  <li key={p.path}>
                    <a
                      href={p.href}
                      aria-current={p.current ? 'page' : undefined}
                      title={p.count > 1 ? `${p.href} · ${p.count} links here` : p.href}
                      className={`flex h-6 items-center gap-1.5 rounded-[5px] px-1.5 text-xs no-underline ${
                        p.current ? 'bg-accent-soft text-ink' : 'text-ink-secondary hover:bg-surface-field'
                      }`}
                    >
                      <PagesIcon className={`h-3 w-3 shrink-0 ${p.current ? 'text-accent' : 'text-ink-muted'}`} />
                      <span className="min-w-0 flex-1 truncate">{p.label}</span>
                      <span className="max-w-[45%] shrink-0 truncate font-mono text-2xs text-ink-muted">{p.path}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : tab === 'components' ? (
          <ComponentsTab layers={tree.layers} />
        ) : tab === 'layers' ? (
          <>
            <LayersTree
              nodes={tree.layers}
              selectedSelector={tree.selected}
              onSelect={tree.select}
              onPeek={tree.peek}
              onToggleHidden={(node: LayerNode) => tell({ type: 'rail-hide', node })}
              onMove={(node, parent, before, wasIn, wasBefore) =>
                tell({ type: 'rail-move', node, parent, before, wasIn, wasBefore })
              }
              onRefresh={tree.refresh}
              loading={tree.loading}
            />
          </>
        ) : state.svgs.length || tree.layers.length ? (
          <SvgsTab svgs={state.svgs} scheme={state.scheme} ink={state.ink} />
        ) : (
          <p className="text-xs text-ink-muted">Read the page first — the panel's Scan button.</p>
        )}
        </div>
      )}
      {column && (
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the rail"
        aria-valuenow={state.width}
        tabIndex={0}
        onPointerDown={onEdgeDown}
        onPointerMove={onEdgeMove}
        onKeyDown={onEdgeKey}
        className="group absolute inset-y-0 -right-1 w-2 cursor-col-resize touch-none"
      >
        <span className="absolute inset-y-0 left-1 w-px bg-transparent group-hover:bg-accent group-focus-visible:bg-accent" />
      </div>
      )}
    </div>
  );
}
