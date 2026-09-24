import { useState } from 'react';
import type { ColorInfo } from '@/shared/types';
import type { Mode } from '@/studio/engine/types';
import { UndoIcon } from '../icons';
import { ColorField } from '../inspect/ColorField';

const FOLD = 12;

/**
 * The colours the page actually paints with, whether or not it names them.
 *
 * On a page with no variables this is the only handle there is: setting one
 * rewrites every rule that holds the literal, and the brief lists the literal
 * with how often it appears. Where a variable holds the colour, its name sits
 * beside the swatch and is the better thing to edit.
 */
export function ObservedColoursSection({
  colors,
  engine,
  mode,
  colorEdits,
  onColor,
}: {
  colors: ColorInfo[];
  /** old hex → new hex, as the engine would paint it. */
  engine: Record<string, string>;
  /** In dark, the engine's moves are the preview, and the chip says so. */
  mode: Mode;
  colorEdits: Record<string, string>;
  onColor: (hex: string, value: string | null) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? colors : colors.slice(0, FOLD);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="divide-y divide-line-subtle overflow-hidden rounded-control border border-line-subtle">
        {shown.map((c) => {
          const key = c.hex.toUpperCase();
          const manual = colorEdits[key];
          const value = manual ?? engine[key] ?? key;
          return (
            // One row: where the colour is used on the left, what it becomes
            // on the right. The field holds the value, so the hex is said
            // again on the left only once it has moved.
            <div
              key={key}
              className={`grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-x-2 px-2 py-1 ${manual ? 'bg-accent-soft/40' : ''}`}
            >
              <div className="flex min-w-0 flex-col text-2xs" title={`${key} · ${c.usage.join(' · ')}`}>
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="min-w-0 truncate text-xs text-ink">
                    {c.varNames.length > 0 ? <code title={c.varNames.join(', ')}>{c.varNames[0]}</code> : c.usage.join(' · ')}
                  </span>
                  <span className="shrink-0 font-mono text-ink-faint">×{c.count}</span>
                </div>
                <div className="flex min-w-0 items-center gap-1.5 text-ink-muted">
                  {c.varNames.length > 0 && <span className="truncate">{c.usage.join(' · ')}</span>}
                  {value !== key && <code className="shrink-0">from {key}</code>}
                  {manual ? (
                    <button
                      onClick={() => onColor(key, null)}
                      className="flex h-4 shrink-0 items-center gap-1 rounded-[4px] bg-accent-soft px-1.5 leading-4 text-accent hover:bg-accent-soft/70"
                      title="Set by hand. Click to take it back."
                    >
                      by hand <UndoIcon className="h-2.5 w-2.5" />
                    </button>
                  ) : engine[key] ? (
                    <span
                      className="h-4 shrink-0 rounded-[4px] bg-surface-field px-1.5 leading-4 text-ink-muted"
                      title={mode === 'dark' ? 'Moved by the dark preview' : 'Moved by a seed'}
                    >
                      {mode === 'dark' ? 'dark' : 'seed'}
                    </span>
                  ) : null}
                </div>
              </div>
              <ColorField value={value} ariaLabel={`${key} becomes`} onChange={(v) => onColor(key, v)} />
            </div>
          );
        })}
      </div>
      {colors.length > FOLD && (
        <button onClick={() => setShowAll((v) => !v)} className="btn btn-sm btn-ghost -ml-2 self-start">
          {showAll ? 'Show fewer' : `Show all ${colors.length}`}
        </button>
      )}
    </div>
  );
}
