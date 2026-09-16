import { useEffect, useState } from 'react';
import type { TokenSuggestion } from '@/studio/tokenMatch';
import { asReference } from '@/studio/tokenMatch';
import { emptyShadow, parseShadow, shadowRoundTrips, shadowToCss, type ShadowLayer } from '@/studio/effects';
import { NumberField } from './NumberField';
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
          <div key={i} className="flex flex-col gap-1 rounded-control border border-line-subtle px-1.5 py-1">
            <div className="flex items-center gap-1.5">
              <span
                className="h-5 w-8 shrink-0 rounded-control bg-surface-raised"
                style={{ boxShadow: shadowToCss([layer]) }}
                aria-hidden
              />
              <label className="flex items-center gap-1 text-2xs text-ink-muted">
                <input type="checkbox" checked={layer.inset} onChange={(e) => editLayer(i, { inset: e.target.checked })} />
                inset
              </label>
              <ColourText
                value={layer.color}
                label={`Shadow ${i + 1} colour`}
                onCommit={(colour) => editLayer(i, { color: colour })}
              />
              <button
                onClick={() => write(layers.filter((_, n) => n !== i))}
                aria-label={`Remove shadow ${i + 1}`}
                className="shrink-0 text-ink-muted hover:text-warn-ink"
              >
                ✕
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              {(['x', 'y', 'blur', 'spread'] as const).map((part) => (
                <label key={part} className="flex min-w-0 items-center gap-1 text-2xs text-ink-muted">
                  {part}
                  <NumberField
                    value={layer[part]}
                    ariaLabel={`Shadow ${i + 1} ${part}`}
                    className="w-12"
                    onChange={(v) => editLayer(i, { [part]: v } as Partial<ShadowLayer>)}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <button
            onClick={() => write([...layers, emptyShadow()])}
            className="rounded-control border border-line px-1.5 py-0.5 text-2xs text-ink-secondary hover:border-accent hover:text-accent"
          >
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
        <div className="flex h-9 w-14 shrink-0 items-center justify-center rounded-control bg-surface-recessed">
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
          className={`w-full min-w-0 resize-none rounded-control border bg-surface-recessed px-1 py-0.5 font-mono text-xs ${
            valid ? 'border-line' : 'border-warn bg-warn-soft'
          }`}
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
      className={`min-w-0 flex-1 rounded-control border bg-surface-recessed px-1 py-0.5 font-mono text-2xs ${
        valid ? 'border-line' : 'border-warn bg-warn-soft'
      }`}
    />
  );
}
