import { useEffect, useRef, useState } from 'react';
import type { DsmOutline } from '@/shared/types';
import { callInspector, SELECTED_EVENT, SPECIMEN_FOR, SPECIMEN_TAG } from '@/shared/inpage';

/** Tell the panel something only it can do. */
const tell = (msg: unknown) => {
  try {
    void chrome.runtime.sendMessage(msg);
  } catch {
    /* panel closed */
  }
};

/** Whether a selection (what the sample stands for, or something inside it) is this item. */
export const isOn = (selected: string | null, key: string): boolean => selected !== null && (selected === key || selected.startsWith(`${key} `));

/**
 * The rail's column while the Design System Manager is open: an outline of
 * the styles page drawn over the page. One row a section with its count,
 * a jump to it; under Type and Components the samples themselves, each a
 * pick — the same selection a click on the sample makes — and the picked
 * one lit, so the outline and the page point at each other. Generate and
 * Export, which the panel carries out; and the way back. The editing is
 * in the panel on the right: System while this is open, Style the moment
 * a sample is picked.
 */
export function DsmColumn({ outline }: { outline: DsmOutline }) {
  // The components are cloned by the page, so only the page can list them —
  // a moment after the specimen has drawn.
  const [components, setComponents] = useState<{ key: string; label: string; hint?: string }[]>([]);
  useEffect(() => {
    const read = () =>
      setComponents(
        Array.from(document.querySelectorAll(`${SPECIMEN_TAG} [data-codename-section="components"] > * > [${SPECIMEN_FOR}]`), (el) => {
          const key = el.getAttribute(SPECIMEN_FOR) ?? '';
          const n = el.getAttribute('data-codename-matches');
          return { key, label: key, ...(n && n !== '1' ? { hint: `×${n}` } : {}) };
        }),
      );
    read();
    const t = window.setTimeout(read, 400);
    return () => window.clearTimeout(t);
  }, [outline]);

  // What is picked on the page, as the inspector says it: a sample reads
  // as the rule it stands for, which is what the items are keyed by.
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const onSelected = (e: Event) => setSelected(((e as CustomEvent).detail as string | null) ?? null);
    document.addEventListener(SELECTED_EVENT, onSelected);
    return () => document.removeEventListener(SELECTED_EVENT, onSelected);
  }, []);
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const specimen = outline.view === 'specimen';
  const jump = (key: string) => {
    if (specimen) document.querySelector(`${SPECIMEN_TAG} [data-codename-section="${key}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else tell({ type: 'dsm-jump', key });
  };
  const pick = (key: string) => {
    void callInspector({ cmd: 'select', selector: `${SPECIMEN_TAG} [${SPECIMEN_FOR}="${key.replace(/"/g, '\\"')}"]` });
  };

  const rows = [
    ...outline.sections,
    ...(specimen && components.length ? [{ key: 'components', title: 'Components', count: `${components.length} ${components.length === 1 ? 'pattern' : 'patterns'}`, items: components }] : []),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div role="radiogroup" aria-label="View" className="flex h-control gap-0.5 rounded-control bg-surface-field p-0.5">
        {(['tokens', 'specimen'] as const).map((v) => (
          <button
            key={v}
            role="radio"
            aria-checked={outline.view === v}
            onClick={() => tell({ type: 'dsm-view', view: v })}
            className={`flex-1 rounded-[4px] px-1.5 text-xs ${outline.view === v ? 'bg-surface-thumb text-ink shadow-[0_1px_2px_rgb(0_0_0/0.2)]' : 'text-ink-muted hover:text-ink'}`}
            title={v === 'tokens' ? 'The system as tables over the canvas: colour, type, space, tokens' : "The page's own styles page, drawn over the page from its rules"}
          >
            {v === 'tokens' ? 'Tokens' : 'Specimen'}
          </button>
        ))}
      </div>
      <p className="text-2xs text-ink-muted">
        {specimen
          ? "The page's own styles page, drawn from its rules over the page. Pick a sample to edit that one in Style."
          : 'The system this page runs on, as tables over the canvas. Every edit repaints the page and queues for the project.'}
      </p>
      <ul ref={list} aria-label="Sections" className="m-0 -mx-1 flex min-h-0 list-none flex-col overflow-y-auto p-0">
        {rows.map((r) => (
          <li key={r.key} className="flex flex-col">
            <button
              onClick={() => jump(r.key)}
              className="flex h-6 w-full items-center gap-2 rounded-[5px] px-1.5 text-left text-xs font-medium text-ink hover:bg-surface-field"
              title={`Scroll to ${r.title}`}
            >
              <span className="min-w-0 flex-1 truncate">{r.title}</span>
              <span className="shrink-0 text-2xs font-normal tabular-nums text-ink-muted">{r.count}</span>
            </button>
            {r.items?.length ? (
              <ul aria-label={`${r.title} samples`} className="m-0 mb-1 flex list-none flex-col p-0">
                {r.items.map((it) => {
                  const on = isOn(selected, it.key);
                  return (
                    <li key={it.key}>
                      <button
                        onClick={() => pick(it.key)}
                        aria-current={on ? 'true' : undefined}
                        className={`flex h-6 w-full items-center gap-2 rounded-[5px] py-0 pr-1.5 pl-4 text-left text-xs ${
                          on ? 'bg-accent-soft text-ink' : 'text-ink-secondary hover:bg-surface-field hover:text-ink'
                        }`}
                        title={`Select the ${it.label} sample`}
                      >
                        <span className="min-w-0 flex-1 truncate">{it.label}</span>
                        <span className="max-w-[45%] shrink-0 truncate font-mono text-2xs text-ink-muted">{it.hint ?? (it.key !== it.label ? it.key : '')}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </li>
        ))}
        {rows.length === 0 && <li className="px-1.5 text-2xs text-ink-muted">Nothing to draw yet: read the page first.</li>}
      </ul>
      <div className="flex flex-col gap-1.5">
        <button onClick={() => tell({ type: 'dsm-action', action: 'generate' })} className="btn btn-secondary" title="Generate a system for this page from seeds, a ratio and a grid, in the panel">
          Generate a system
        </button>
        <button onClick={() => tell({ type: 'dsm-action', action: 'export' })} className="btn btn-secondary" title="DESIGN.md, tokens.css, tokens.json and this page as a file, in the panel">
          Export
        </button>
      </div>
      <button onClick={() => tell({ type: 'dsm-toggled', on: false })} className="btn btn-ghost mt-auto self-start" title="Close the Design System Manager and show the page again">
        Back to the page
      </button>
    </div>
  );
}
