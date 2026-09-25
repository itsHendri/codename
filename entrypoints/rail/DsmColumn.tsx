import { useEffect, useState } from 'react';
import type { DsmOutline } from '@/shared/types';
import { SPECIMEN_FOR, SPECIMEN_TAG } from '@/shared/inpage';

/** Tell the panel something only it can do. */
const tell = (msg: unknown) => {
  try {
    void chrome.runtime.sendMessage(msg);
  } catch {
    /* panel closed */
  }
};

/**
 * The rail's column while the Design System Manager is open: an outline of
 * the styles page drawn over the page, one row a section with its count,
 * each a jump to that section; the page's own components counted off the
 * page; Generate and Export, which the panel carries out; and the way back.
 * The editing itself is in the panel on the right, which shows System
 * while this is open and Style the moment a sample is picked.
 */
export function DsmColumn({ outline }: { outline: DsmOutline }) {
  // The components are cloned by the page, so only the page can count them —
  // a moment after the specimen has drawn.
  const [components, setComponents] = useState(0);
  useEffect(() => {
    const count = () => setComponents(document.querySelectorAll(`${SPECIMEN_TAG} [data-codename-section="components"] [${SPECIMEN_FOR}]`).length);
    count();
    const t = window.setTimeout(count, 400);
    return () => window.clearTimeout(t);
  }, [outline]);

  const jump = (key: string) => {
    document.querySelector(`${SPECIMEN_TAG} [data-codename-section="${key}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const rows = [...outline.sections, ...(components ? [{ key: 'components', title: 'Components', count: `${components} ${components === 1 ? 'pattern' : 'patterns'}` }] : [])];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <p className="text-2xs text-ink-muted">
        The page's own styles page, drawn from its rules over the page. Edit the system in the panel; click a sample to edit that one.
      </p>
      <ul aria-label="Sections" className="m-0 -mx-1 flex list-none flex-col p-0">
        {rows.map((r) => (
          <li key={r.key}>
            <button
              onClick={() => jump(r.key)}
              className="flex h-6 w-full items-center gap-2 rounded-[5px] px-1.5 text-left text-xs text-ink-secondary hover:bg-surface-field hover:text-ink"
              title={`Scroll to ${r.title}`}
            >
              <span className="min-w-0 flex-1 truncate">{r.title}</span>
              <span className="shrink-0 text-2xs tabular-nums text-ink-muted">{r.count}</span>
            </button>
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
