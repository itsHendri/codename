import { useEffect, useState } from 'react';
import type { TokenSuggestion } from '@/studio/tokenMatch';
import { asReference } from '@/studio/tokenMatch';
import { emptyShadow, parseShadow, shadowRoundTrips, shadowToCss, type ShadowLayer } from '@/studio/effects';
import { NumberField } from './NumberField';
import { CloseIcon, PlusIcon } from '../icons';
import { TokenChips } from './TokenChips';

export function ShadowField({
  value,
  onChange,
  suggestions,
}: {
  value: string;
  onChange: (next: string, token?: string) => void;
  suggestions?: TokenSuggestion[];
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const valid = CSS.supports('box-shadow', draft);
  const commit = () => {
    if (valid && draft !== value) onChange(draft);
  };

  // Fields only for a value they can give back exactly. A `var()`, or a shape
  // this would lose pieces of, keeps the text — editing it in parts would
  // mean writing back something the person did not ask for.
  const layers = shadowRoundTrips(value) ? (parseShadow(value) ?? []) : null;
  const write = (next: ShadowLayer[]) => onChange(shadowToCss(next));
  const editLayer = (i: number, patch: Partial<ShadowLayer>) =>
    write((layers ?? []).map((l, n) => (n === i ? { ...l, ...patch } : l)));

  if (layers !== null) {
    return (
      <div className="flex flex-col gap-1.5">
        {layers.map((layer, i) => (
          <div key={i} className="flex flex-col gap-1.5 rounded-card border border-line-subtle p-1.5">
            <div className="flex items-center gap-1.5">
              <span
                className="h-5 w-8 shrink-0 rounded-control bg-surface-raised"
                style={{ boxShadow: shadowToCss([layer]) }}
                aria-hidden
              />
              {/* A toggle drawn as one, not the browser's checkbox. */}
              <button
                role="switch"
                aria-checked={layer.inset}
                aria-label={`Shadow ${i + 1} inset`}
                onClick={() => editLayer(i, { inset: !layer.inset })}
                className={`h-control-sm shrink-0 rounded-[4px] px-1.5 text-2xs ${
                  layer.inset ? 'bg-surface-thumb text-ink' : 'text-ink-muted hover:bg-surface-field hover:text-ink'
                }`}
              >
                Inset
              </button>
              <ColourText
                value={layer.color}
                label={`Shadow ${i + 1} colour`}
                onCommit={(colour) => editLayer(i, { color: colour })}
              />
              <button
                onClick={() => write(layers.filter((_, n) => n !== i))}
                aria-label={`Remove shadow ${i + 1}`}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] text-ink-muted hover:bg-surface-field hover:text-warn-ink"
              >
                <CloseIcon />
              </button>
            </div>
            {/* Four across, the letter inside each field as Figma's shadow
                fields have it, so no number is cut to "0p". */}
            <div className="grid grid-cols-4 gap-1">
              {(
                [
                  ['x', 'X', 'Offset across'],
                  ['y', 'Y', 'Offset down'],
                  ['blur', 'B', 'Blur'],
                  ['spread', 'S', 'Spread'],
                ] as const
              ).map(([part, letter, title]) => (
                <div key={part} title={title} className="min-w-0">
                  <NumberField
                    value={layer[part]}
                    label={letter}
                    ariaLabel={`Shadow ${i + 1} ${part}`}
                    onChange={(v) => editLayer(i, { [part]: v } as Partial<ShadowLayer>)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <button
            onClick={() => write([...layers, emptyShadow()])}
            className="btn btn-sm btn-ghost -ml-2"
          >
            <PlusIcon />
            Add
          </button>
          {!layers.length && <span className="text-2xs text-ink-muted">No shadow.</span>}
        </div>
        <TokenChips suggestions={suggestions} current={value} onPick={(s) => onChange(asReference(s), s.name)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-14 shrink-0 items-center justify-center rounded-control bg-surface-field">
          <span
            className="h-5 w-8 rounded-control bg-surface-raised"
            style={{ boxShadow: valid && !draft.startsWith('var(') ? draft : undefined }}
            aria-hidden
          />
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
          rows={2}
          spellCheck={false}
          aria-label="Box shadow"
          className={`field w-full min-w-0 resize-none px-2 py-1 font-mono ${valid ? '' : 'field-invalid'}`}
        />
      </div>
      <TokenChips suggestions={suggestions} current={value} onPick={(s) => onChange(asReference(s), s.name)} />
    </div>
  );
}

/**
 * The colour of one shadow layer, committed when it is finished.
 *
 * Typed rather than picked, because a shadow colour is as often
 * `currentColor` or a `var()` as it is a hex. It waits for the field to be
 * left, and refuses what CSS would not take — without that, typing "blue"
 * pushed `b`, then `bl`, then `blu` onto the page.
 */
function ColourText({ value, label, onCommit }: { value: string; label: string; onCommit: (next: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const valid = !draft.trim() || CSS.supports('color', draft) || draft.trim().startsWith('var(');
  const commit = () => {
    if (valid && draft !== value) onCommit(draft);
    else if (!valid) setDraft(value);
  };
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setDraft(value);
      }}
      aria-label={label}
      spellCheck={false}
      className={`field min-w-0 flex-1 px-2 font-mono ${valid ? '' : 'field-invalid'}`}
    />
  );
}
