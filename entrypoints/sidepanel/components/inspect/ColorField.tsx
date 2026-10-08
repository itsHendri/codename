import { useEffect, useState } from 'react';
import type { AuthoredDecl, CustomPropInfo } from '@/shared/types';
import type { TokenSuggestion } from '@/studio/tokenMatch';
import { asReference } from '@/studio/tokenMatch';
import { alphaPercent, withAlpha } from '@/studio/inspect/colour';
import { TokenChips } from './TokenChips';
import { TokenChip } from './TokenChip';

const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;

/**
 * A colour, Nudge's way: one 32px well holding a 16px swatch (the native
 * picker sits over it, invisible, so the swatch is what is pressed), then
 * the value, or the token chip when the declaration names a variable, then
 * the opacity as a percentage at the right end. A value that only agrees
 * with one of the page's variables keeps its "matches" chips under the well.
 */
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
  /** The declaration that paints this, when the inspector read it: with a certain token, the chip replaces the value. */
  authored?: AuthoredDecl;
  /** The page's variables, for the picker behind the chip. */
  tokens?: CustomPropInfo[];
  rootFontSize?: number;
  /** Edit the variable itself, for every place that uses it. */
  onEditGlobally?: (token: CustomPropInfo) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const alpha = alphaPercent(value);
  const [alphaDraft, setAlphaDraft] = useState(alpha === null ? '' : `${alpha}%`);
  useEffect(() => setAlphaDraft(alpha === null ? '' : `${alpha}%`), [alpha]);

  const valid = CSS.supports('color', draft);
  const commitIfValid = (v: string) => {
    setDraft(v);
    if (CSS.supports('color', v) && v !== value) onChange(v);
  };
  const commitAlpha = (text: string) => {
    const n = parseFloat(text);
    const next = Number.isFinite(n) ? withAlpha(value, n) : null;
    if (next && next !== value) onChange(next);
    else setAlphaDraft(alpha === null ? '' : `${alpha}%`);
  };

  const chip =
    authored?.token && authored.certain && tokens?.some((p) => p.name === authored.token) ? (
      <TokenChip
        authored={authored as AuthoredDecl & { token: string }}
        tokens={tokens}
        kind="color"
        literal={value}
        rootFontSize={rootFontSize}
        onSwap={(p) => onChange(`var(${p.name})`, p.name)}
        onEditGlobally={onEditGlobally}
        onDetach={(literal, from) => onChange(literal, undefined, { detached: from })}
      />
    ) : null;
  const hex = HEX.test(draft) ? draft.slice(0, 7) : null;

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className={`field flex min-w-0 items-stretch pr-2 ${valid ? '' : 'field-invalid'}`}>
        <label className="relative flex shrink-0 cursor-pointer items-center px-2">
          <span
            className={`h-4 w-4 rounded-[4px] swatch ${hex || (valid && !draft.startsWith('var(')) ? '' : 'checkerboard'}`}
            style={valid && !draft.startsWith('var(') ? { background: draft } : undefined}
            aria-hidden
          />
          {hex && (
            <input
              type="color"
              value={hex}
              onChange={(e) => commitIfValid(alpha !== null && alpha < 100 ? (withAlpha(e.target.value, alpha) ?? e.target.value) : e.target.value)}
              aria-label={`${ariaLabel} picker`}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          )}
        </label>
        {chip ?? (
          <input
            value={draft}
            onChange={(e) => commitIfValid(e.target.value)}
            spellCheck={false}
            aria-label={ariaLabel}
            className="min-h-control w-full min-w-0 bg-transparent text-xs text-ink focus-visible:outline-none"
          />
        )}
        {!chip && alpha !== null && (
          <input
            value={alphaDraft}
            onChange={(e) => setAlphaDraft(e.target.value)}
            onBlur={(e) => commitAlpha(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitAlpha(e.currentTarget.value);
              if (e.key === 'Escape') {
                setAlphaDraft(`${alpha}%`);
                e.currentTarget.blur();
              }
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                const next = withAlpha(value, alpha + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1));
                if (next) onChange(next);
              }
            }}
            spellCheck={false}
            aria-label={`${ariaLabel} opacity`}
            className="w-11 shrink-0 bg-transparent pl-2 text-right text-xs text-ink-muted focus:text-ink focus-visible:outline-none"
          />
        )}
      </div>
      {!chip && <TokenChips suggestions={suggestions} current={value} onPick={(s) => onChange(asReference(s), s.name)} />}
    </div>
  );
}
