import { useEffect, useState } from 'react';
import type { ScanResult, SelectionColour } from '@/shared/types';
import type { Mode, ResolvedTokens } from '@/studio/engine/types';
import { suggestTokens } from '@/studio/tokenMatch';
import type { InspectController } from '../../lib/inspect';
import { ChevronIcon } from '../icons';
import { ColorField } from './ColorField';

/** How many swatches show before the rest fold away. */
const FIRST = 8;

/**
 * Figma's "Selection colours": every colour painted inside what is picked —
 * a card's fill, its heading, its button, its border — each with how many
 * places it is used. Change a swatch and every one of those places takes the
 * new colour, as one edit each, in the log and the brief like any other.
 * A variable from the page's own palette is offered first, so a swap lands
 * on a token rather than a loose hex.
 */
export function SelectionColours({
  ctl,
  scan,
  resolved,
  mode,
}: {
  ctl: InspectController;
  scan: Pick<ScanResult, 'customProps' | 'rootFontSize'> & Partial<ScanResult>;
  resolved: ResolvedTokens | null;
  mode: Mode;
}) {
  const [colours, setColours] = useState<SelectionColour[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const selector = ctl.element?.selector;

  // Read again when the selection changes, and after every edit: a swap
  // moves a colour from one swatch to another.
  useEffect(() => {
    let live = true;
    if (!selector) return;
    void ctl.readColours().then((list) => live && setColours(list));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selector, ctl.also.length, ctl.log]);

  // One colour is not a palette; the fields above already show it.
  if (!selector || colours.length < 2) return null;
  const shown = all ? colours : colours.slice(0, FIRST);

  const swap = (c: SelectionColour, to: string, token?: string) =>
    ctl.changeMany(
      c.uses.map((u) => ({
        target: { selector: u.selector, matches: u.matches, stable: u.stable },
        property: u.property,
        from: u.value,
        to,
        token,
      })),
    );

  return (
    <section className="flex flex-col gap-1.5 border-t border-line-subtle pt-3" aria-label="Selection colours">
      <div className="flex items-baseline gap-2">
        <span className="subhead">Selection colours</span>
        <span className="ml-auto font-mono text-2xs text-ink-muted">{colours.length}</span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {shown.map((c) => {
          const expanded = open === c.hex;
          return (
            <li key={c.hex} className="flex flex-col gap-1">
              <button
                onClick={() => setOpen(expanded ? null : c.hex)}
                aria-expanded={expanded}
                className="flex h-6 items-center gap-2 rounded-control px-1 text-left text-xs hover:bg-surface-field"
              >
                <span className="swatch h-3.5 w-3.5 shrink-0 rounded-[3px]" style={{ background: c.hex }} />
                <span className="font-mono text-2xs text-ink-secondary">{c.hex}</span>
                <span className="ml-auto text-2xs text-ink-muted">
                  {c.uses.length} {c.uses.length === 1 ? 'place' : 'places'}
                </span>
                <ChevronIcon className={`h-2.5 w-2.5 text-ink-muted transition-transform motion-reduce:transition-none ${expanded ? 'rotate-90' : ''}`} />
              </button>
              {expanded && (
                <div className="pb-1 pl-1">
                  <ColorField
                    value={c.hex}
                    ariaLabel={`Replace ${c.hex}`}
                    suggestions={suggestTokens('color', c.hex, scan, resolved ?? undefined, mode)}
                    onChange={(v, token) => swap(c, v, token)}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {colours.length > FIRST && (
        <button onClick={() => setAll((v) => !v)} className="btn btn-sm btn-ghost self-start">
          {all ? 'Fewer' : `All ${colours.length}`}
        </button>
      )}
    </section>
  );
}
