import { useEffect, useMemo, useState } from 'react';
import type { PageComponent } from '@/studio/components';
import { componentsOf, type LayerComponent, type LayerNode } from '@/studio/layers';
import { callInspector } from '@/shared/inpage';
import { ChevronIcon, ComponentsIcon, RefreshIcon } from '@/entrypoints/sidepanel/components/icons';

/** Tell the panel something that belongs in its change log. */
const tell = (msg: unknown) => {
  try {
    void chrome.runtime.sendMessage(msg);
  } catch {
    /* panel closed */
  }
};

/** Scroll a copy into view and pick it, as clicking it on the page would. */
const pick = async (selector: string) => {
  await callInspector({ cmd: 'locate', selector });
  await callInspector({ cmd: 'select', selector });
};
const peek = (selector: string | null) => void callInspector(selector ? { cmd: 'peek', selector } : { cmd: 'unpeek' });

/**
 * The page's components, in a tab of their own.
 *
 * First what the page's framework says rendered it — `GlyphSetButton` ×3,
 * `TopBar` — read from a dev build in the page's own world, each with its
 * copies: pointing at one outlines it on the page, picking one scrolls to it
 * and selects it. Under that, the class selectors that repeat, which is all
 * a production build or a page without a framework can offer; picking one
 * selects its first copy with the scope set to all of them, so an edit lands
 * on every card at once.
 */
export function ComponentsTab({ layers }: { layers: LayerNode[] }) {
  const [found, setFound] = useState<PageComponent[] | null>(null);
  const [turn, setTurn] = useState(0);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setFound(null);
    chrome.runtime
      .sendMessage({ type: 'components-scan' })
      .then((r: { ok?: boolean; components?: PageComponent[] } | undefined) => {
        if (live) setFound(r?.ok && Array.isArray(r.components) ? r.components : []);
      })
      .catch(() => live && setFound([]));
    return () => {
      live = false;
    };
  }, [turn]);

  const patterns = useMemo(() => componentsOf(layers, 40), [layers]);
  const via = found?.[0]?.via;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" onMouseLeave={() => peek(null)}>
      <div className="flex shrink-0 items-center justify-between gap-2 text-2xs text-ink-muted">
        <span>
          {found === null
            ? 'Asking the page…'
            : found.length
              ? `${found.length} ${found.length === 1 ? 'component' : 'components'}, from ${via === 'vue' ? 'Vue' : 'React'}`
              : 'No framework dev build answered, so there are no named components here.'}
        </span>
        <button
          onClick={() => setTurn((t) => t + 1)}
          title="Ask the page again"
          aria-label="Ask the page again"
          className="flex h-control w-6 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-surface-field hover:text-ink"
        >
          <RefreshIcon />
        </button>
      </div>

      <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1">
        {found && found.length > 0 && (
          <ul aria-label="Components" className="m-0 flex list-none flex-col p-0">
            {found.map((c) => {
              const key = `${c.via}:${c.name}:${c.file ?? ''}`;
              const expanded = open === key;
              return (
                <li key={key}>
                  <div
                    className="group flex h-6 items-center gap-1 rounded-[5px] pr-1 text-xs text-ink-secondary hover:bg-surface-field"
                    onMouseEnter={() => peek(c.roots[0] ?? null)}
                  >
                    <button
                      onClick={() => setOpen(expanded ? null : key)}
                      aria-label={expanded ? `Hide the copies of ${c.name}` : `Show the copies of ${c.name}`}
                      aria-expanded={expanded}
                      disabled={c.roots.length < 2}
                      className="flex h-4 w-3 shrink-0 items-center justify-center text-ink-muted hover:text-ink disabled:invisible"
                    >
                      <ChevronIcon className={`h-2.5 w-2.5 transition-transform motion-reduce:transition-none ${expanded ? 'rotate-90' : ''}`} />
                    </button>
                    <ComponentsIcon className="h-3 w-3 shrink-0 text-accent" />
                    <button
                      onClick={() => c.roots[0] && void pick(c.roots[0])}
                      title={c.file ? `${c.name} — ${c.file}` : c.name}
                      className="min-w-0 flex-1 truncate text-left"
                    >
                      {c.name}
                    </button>
                    {c.count > 1 && <span className="shrink-0 font-mono text-2xs text-ink-muted">×{c.count}</span>}
                  </div>
                  {expanded && (
                    <ul className="m-0 flex list-none flex-col p-0">
                      {c.roots.map((root, i) => (
                        <li key={root}>
                          <button
                            onMouseEnter={() => peek(root)}
                            onClick={() => void pick(root)}
                            className="flex h-6 w-full items-center gap-1.5 rounded-[5px] pl-9 pr-1 text-left text-2xs text-ink-muted hover:bg-surface-field hover:text-ink"
                          >
                            Copy {i + 1}
                          </button>
                        </li>
                      ))}
                      {c.count > c.roots.length && (
                        <li className="pl-9 text-2xs text-ink-faint">and {c.count - c.roots.length} more</li>
                      )}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {patterns.length > 0 && (
          <section className="flex flex-col gap-1">
            <div className="flex flex-col">
              <span className="text-xs font-medium text-ink">Repeating styles</span>
              <span className="text-2xs text-ink-muted">Class selectors that repeat. Pick one to edit every copy.</span>
            </div>
            <ul aria-label="Repeating styles" className="m-0 flex list-none flex-col p-0">
              {patterns.map((p: LayerComponent) => (
                <li key={p.selector}>
                  <button
                    onMouseEnter={() => peek(p.nodes[0]?.selector ?? null)}
                    onClick={() => {
                      const first = p.nodes[0];
                      if (!first) return;
                      void pick(first.selector);
                      tell({ type: 'rail-scope', scope: 'all' });
                    }}
                    title={`${p.count} elements match ${p.selector}`}
                    className="flex h-6 w-full items-center gap-1.5 rounded-[5px] px-1 text-left text-xs text-ink-secondary hover:bg-surface-field hover:text-ink"
                  >
                    <span className="min-w-0 flex-1 truncate font-mono text-2xs">{p.selector}</span>
                    <span className="shrink-0 font-mono text-2xs text-ink-muted">×{p.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {found !== null && !found.length && !patterns.length && (
          <p className="text-xs text-ink-muted">Nothing on this page repeats yet.</p>
        )}
      </div>
    </div>
  );
}
