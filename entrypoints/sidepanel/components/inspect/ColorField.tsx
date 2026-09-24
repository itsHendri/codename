import { useEffect, useState } from 'react';
import type { AuthoredDecl, CustomPropInfo } from '@/shared/types';
import type { TokenSuggestion } from '@/studio/tokenMatch';
import { asReference } from '@/studio/tokenMatch';
import { TokenChips } from './TokenChips';
import { TokenPill } from './TokenPill';

const HEX6 = /^#[0-9a-f]{6}$/i;

export function ColorField({
  value,
  onChange,
  suggestions,
  ariaLabel,
  authored,
  tokens,
  rootFontSize,
  onEditGlobally,
}: {
  value: string;
  /** `token` names a chosen variable; `detached` names the one the element was taken off on purpose. */
  onChange: (next: string, token?: string, opts?: { detached?: string }) => void;
  suggestions?: TokenSuggestion[];
  ariaLabel: string;
  /** The declaration that paints this, when the inspector read it: with a certain token, the pill replaces the chips. */
  authored?: AuthoredDecl;
  /** The page's variables, for the picker behind the pill. */
  tokens?: CustomPropInfo[];
  rootFontSize?: number;
  /** Edit the variable itself, for every place that uses it. */
  onEditGlobally?: (token: CustomPropInfo) => void;
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
            className="h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-[3px] border-0 bg-transparent p-0 swatch [&::-webkit-color-swatch]:rounded-[3px] [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
          />
        ) : (
          // A var() reference cannot resolve inside the panel; the checkerboard says so.
          <span
            className="checkerboard h-4 w-4 shrink-0 rounded-[3px] swatch"
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
      {authored?.token && authored.certain && tokens?.some((p) => p.name === authored.token) ? (
        <TokenPill
          authored={authored as AuthoredDecl & { token: string }}
          tokens={tokens}
          kind="color"
          literal={value}
          rootFontSize={rootFontSize}
          onSwap={(p) => onChange(`var(${p.name})`, p.name)}
          onEditGlobally={onEditGlobally}
          onDetach={(literal, from) => onChange(literal, undefined, { detached: from })}
        />
      ) : (
        <TokenChips suggestions={suggestions} current={value} onPick={(s) => onChange(asReference(s), s.name)} />
      )}
    </div>
  );
}
