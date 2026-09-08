import { useEffect, useState } from 'react';
import type { TokenSuggestion } from '@/studio/tokenMatch';
import { asReference } from '@/studio/tokenMatch';
import { TokenChips } from './TokenChips';

const HEX6 = /^#[0-9a-f]{6}$/i;

export function ColorField({
  value,
  onChange,
  suggestions,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string, token?: string) => void;
  suggestions?: TokenSuggestion[];
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const valid = CSS.supports('color', draft);
  const commitIfValid = (v: string) => {
    setDraft(v);
    if (CSS.supports('color', v) && v !== value) onChange(v);
  };

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-1.5">
        {HEX6.test(draft) ? (
          <input
            type="color"
            value={draft}
            onChange={(e) => commitIfValid(e.target.value)}
            aria-label={`${ariaLabel} picker`}
            className="h-5 w-5 shrink-0 cursor-pointer rounded border border-line bg-transparent p-0"
          />
        ) : (
          // A var() reference cannot resolve inside the panel; the checkerboard says so.
          <span
            className="checkerboard h-5 w-5 shrink-0 rounded border border-line"
            style={valid && !draft.startsWith('var(') ? { background: draft } : undefined}
            aria-hidden
          />
        )}
        <input
          value={draft}
          onChange={(e) => commitIfValid(e.target.value)}
          spellCheck={false}
          aria-label={ariaLabel}
          className={`w-full min-w-0 rounded-control border bg-surface-recessed px-1 py-0.5 font-mono text-xs ${
            valid ? 'border-line' : 'border-warn bg-warn-soft'
          }`}
        />
      </div>
      <TokenChips suggestions={suggestions} current={value} onPick={(s) => onChange(asReference(s), s.name)} />
    </div>
  );
}
