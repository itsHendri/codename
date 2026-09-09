import { useState } from 'react';
import type { ColorInfo } from '@/shared/types';
import type { Mode } from '@/studio/engine/types';
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
            <div key={key} className={`flex flex-col gap-1 px-2 py-1.5 ${manual ? 'bg-surface-selected/40' : ''}`}>
              <div className="flex items-center gap-1.5 text-2xs">
                <span className="h-3.5 w-3.5 shrink-0 rounded-sm border border-line" style={{ background: key }} />
                <code className="text-xs">{key}</code>
                <span className="text-ink-muted">{c.usage.join(' · ')}</span>
                {c.varNames.length > 0 && (
                  <code className="min-w-0 truncate text-ink-muted" title={c.varNames.join(', ')}>
                    {c.varNames[0]}
                  </code>
                )}
                <span className="ml-auto shrink-0 font-mono text-ink-muted">×{c.count}</span>
                {manual ? (
                  <button
                    onClick={() => onColor(key, null)}
                    className="shrink-0 rounded-full border border-accent px-1.5 text-accent hover:bg-accent-soft"
                    title="Set by hand. Click to take it back."
                  >
                    by hand ↺
                  </button>
                ) : engine[key] ? (
                  <span
                    className="shrink-0 rounded-full border border-line-subtle px-1.5 text-ink-muted"
                    title={mode === 'dark' ? 'Moved by the dark preview' : 'Moved by a seed'}
                  >
                    {mode === 'dark' ? 'dark' : 'seed'}
                  </span>
                ) : null}
              </div>
              <ColorField value={value} ariaLabel={`${key} becomes`} onChange={(v) => onColor(key, v)} />
            </div>
          );
        })}
      </div>
      {colors.length > FOLD && (
        <button onClick={() => setShowAll((v) => !v)} className="self-start text-xs text-accent hover:underline">
          {showAll ? 'show fewer' : `show all ${colors.length}`}
        </button>
      )}
    </div>
  );
}
