import { useEffect, useState } from 'react';
import type { TokenSuggestion } from '@/studio/tokenMatch';
import { asReference } from '@/studio/tokenMatch';
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
