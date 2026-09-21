import { useMemo, useState, useSyncExternalStore } from 'react';
import type { LayerNode } from '@/studio/layers';
import { pagesOf } from '@/studio/pages';
import { callInspector } from '@/shared/inpage';
import { ComponentsStrip } from '@/entrypoints/sidepanel/components/inspect/ComponentsStrip';
import { LayersTree } from '@/entrypoints/sidepanel/components/inspect/LayersTree';
import { SvgsTab } from '@/entrypoints/sidepanel/components/SvgsTab';
import type { RailStore } from './store';
import { useRailLayers } from './useRailLayers';

type RailTab = 'pages' | 'layers' | 'assets';

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
 * The tree is the same component the panel drew; only where it stands has
 * changed. Picking a row asks the inspector in the same page; a drag or the
 * eye on a row is an element edit, so it goes to the panel and lands in the
 * log there, with undo and the brief, as an edit from the edit card does.
 */
export function Rail({ store, onResize }: { store: RailStore; onResize: (width: number) => void }) {
  const state = useSyncExternalStore(store.subscribe, store.get);
  const [tab, setTab] = useState<RailTab>('layers');
  // The tree is read while the rail shows Layers; Pages and Assets do not
  // need it walked.
  const tree = useRailLayers(state.on && tab === 'layers');
  // The site's pages, as this page links to them. Read whenever the tree
  // was, which is whenever the page settled.
  const pages = useMemo(
    () => pagesOf(Array.from(document.links, (a) => ({ href: a.href, text: a.textContent ?? '' })), location.href),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tree.layers, tab],
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
    } else if (e.key === 'Escape' && tree.selected) {
      e.preventDefault();
      void callInspector({ cmd: 'deselect' });
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

  const tabs: { key: RailTab; label: string }[] = [
    { key: 'pages', label: 'Pages' },
    { key: 'layers', label: 'Layers' },
    { key: 'assets', label: 'Assets' },
  ];

  return (
    <div className="rail relative flex h-full flex-col border-r border-line-subtle" onKeyDown={onKey}>
      {/* h-10 is BAR_HEIGHT: one strip with the bar above and the panel's tabs across. */}
      <nav role="tablist" aria-label="Rail" className="grid h-10 shrink-0 grid-cols-3 items-stretch border-b border-line-subtle">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            id={`rail-tab-${key}`}
            aria-selected={tab === key}
            tabIndex={tab === key ? 0 : -1}
            onClick={() => setTab(key)}
            className={`flex items-center justify-center text-xs ${
              tab === key
                ? 'border-b-2 border-accent font-medium text-accent'
                : 'border-b-2 border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            {label}
            {key === 'assets' && state.svgs.length > 0 && (
              <span className="ml-1.5 rounded-full bg-surface-control px-1 font-mono text-2xs text-ink-secondary">{state.svgs.length}</span>
            )}
          </button>
        ))}
      </nav>
      <div role="tabpanel" aria-labelledby={`rail-tab-${tab}`} className="flex min-h-0 flex-1 flex-col gap-2.5 p-2.5">
        {tab === 'pages' ? (
          pages.length ? (
            <div role="list" aria-label="Pages" className="min-h-0 flex-1 overflow-y-auto rounded-control border border-line-subtle">
              {pages.map((p) => (
                <a
                  key={p.path}
                  role="listitem"
                  href={p.href}
                  aria-current={p.current ? 'page' : undefined}
                  title={p.count > 1 ? `${p.href} · ${p.count} links here` : p.href}
                  className={`flex items-baseline gap-1.5 px-2 py-1 text-2xs no-underline ${
                    p.current ? 'bg-surface-selected text-ink' : 'text-ink-secondary hover:bg-surface-control'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{p.label}</span>
                  <span className="max-w-[45%] shrink-0 truncate font-mono text-ink-muted">{p.path}</span>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-xs text-ink-muted">This page links to no other page on its site.</p>
          )
        ) : tab === 'layers' ? (
          <>
            <ComponentsStrip
              nodes={tree.layers}
              onPick={(component) => {
                tree.select(component.nodes[0]!);
                tell({ type: 'rail-scope', scope: 'all' });
              }}
            />
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
          <SvgsTab svgs={state.svgs} />
        ) : (
          <p className="text-xs text-ink-muted">Read the page first — the panel's Scan button.</p>
        )}
      </div>
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
    </div>
  );
}
