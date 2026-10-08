import { useEffect, useMemo, useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { IconCheck, IconChevronDown, IconTypography } from '@tabler/icons-react';
import { usePopupLayer } from './popupLayer';

/**
 * The font family, Nudge's way: a well led by the type icon, the stack typed
 * as text, and a chevron that opens the page's own families to pick from,
 * searchable once there are more than a few. Picking one writes that family
 * alone; a typed stack is committed as typed, on Enter or blur.
 */
export function FontFamilyField({
  value,
  families,
  onCommit,
}: {
  value: string;
  /** The families this page loads, first as the page uses them most. */
  families: string[];
  onCommit: (v: string) => void;
}) {
  const layer = usePopupLayer();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ok = CSS.supports('font-family', draft);
  const commit = (v: string) => {
    if (CSS.supports('font-family', v) && v !== value) onCommit(v);
  };
  const first = (value.split(',')[0] ?? '').replace(/["']/g, '').trim().toLowerCase();
  const shown = useMemo(
    () => families.filter((f) => f.toLowerCase().includes(query.trim().toLowerCase())),
    [families, query],
  );
  const quote = (f: string) => (/^[\w-]+$/.test(f) ? f : `"${f}"`);

  return (
    <div className={`field flex min-w-0 items-center gap-2 pl-2 ${ok ? '' : 'field-invalid'}`}>
      <IconTypography className="h-4 w-4 shrink-0 text-ink-muted" stroke={1.5} aria-hidden />
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(draft);
          if (e.key === 'Escape') {
            setDraft(value);
            e.currentTarget.blur();
          }
        }}
        spellCheck={false}
        aria-label="Font family"
        className="min-h-control w-full min-w-0 bg-transparent text-xs text-ink focus-visible:outline-none"
      />
      {families.length > 0 && (
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger
            aria-label="The page's fonts"
            className="flex h-control w-7 shrink-0 items-center justify-center text-ink-muted hover:text-ink"
          >
            <IconChevronDown className="h-3.5 w-3.5" stroke={1.5} />
          </Popover.Trigger>
          <Popover.Portal container={layer}>
            <Popover.Positioner sideOffset={4} align="end" className="z-50">
              <Popover.Popup className="popup flex w-[min(260px,var(--available-width))] flex-col gap-1 p-1 outline-none">
                {families.length > 8 && (
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search fonts…"
                    aria-label="Search fonts"
                    className="field w-full px-2 text-xs"
                  />
                )}
                <ul role="listbox" aria-label="The page's fonts" className="m-0 flex max-h-[280px] list-none flex-col overflow-y-auto p-0">
                  {shown.map((f) => {
                    const on = f.toLowerCase() === first;
                    return (
                      <li key={f}>
                        <button
                          role="option"
                          aria-selected={on}
                          onClick={() => {
                            commit(quote(f));
                            setOpen(false);
                          }}
                          className="flex min-h-[34px] w-full items-center gap-2 rounded-[4px] px-2 text-left text-xs text-ink hover:bg-surface-field"
                          style={{ fontFamily: quote(f) }}
                        >
                          <span className="min-w-0 flex-1 truncate">{f}</span>
                          {on && <IconCheck className="h-4 w-4 shrink-0" stroke={1.5} aria-hidden />}
                        </button>
                      </li>
                    );
                  })}
                  {shown.length === 0 && <li className="px-2 py-1.5 text-2xs text-ink-muted">No font of this page matches.</li>}
                </ul>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      )}
    </div>
  );
}
