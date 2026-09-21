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
      {/* Framer's colour row: the swatch inside the field, the value beside it. */}
      <div className={`field flex items-center gap-1.5 pl-1 ${valid ? '' : 'field-invalid'}`}>
        {HEX6.test(draft) ? (
          <input
            type="color"
            value={draft}
            onChange={(e) => commitIfValid(e.target.value)}
            aria-label={`${ariaLabel} picker`}
            className="h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-[3px] border-0 bg-transparent p-0 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.15)] [&::-webkit-color-swatch]:rounded-[3px] [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
          />
        ) : (
          // A var() reference cannot resolve inside the panel; the checkerboard says so.
          <span
            className="checkerboard h-4 w-4 shrink-0 rounded-[3px] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.15)]"
            style={valid && !draft.startsWith('var(') ? { background: draft } : undefined}
            aria-hidden
          />
        )}
        <input
          value={draft}
          onChange={(e) => commitIfValid(e.target.value)}
          spellCheck={false}
          aria-label={ariaLabel}
          className="h-6 w-full min-w-0 bg-transparent pr-1.5 font-mono text-xs focus-visible:outline-none"
        />
      </div>
      <TokenChips suggestions={suggestions} current={value} onPick={(s) => onChange(asReference(s), s.name)} />
    </div>
  );
}
