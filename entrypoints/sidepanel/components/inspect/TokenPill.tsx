import { useState } from 'react';
import type { AuthoredDecl, CustomPropInfo } from '@/shared/types';
import type { MatchKind } from '@/studio/tokenMatch';
import { TokenPicker } from './TokenPicker';

/** The mark of a variable in the field: Figma's square, Design Mode's diamond. */
export function TokenGlyph({ className = 'h-2 w-2' }: { className?: string }) {
  return (
    <svg viewBox="0 0 8 8" className={`${className} shrink-0`} aria-hidden>
      <path d="M4 0 8 4 4 8 0 4z" fill="currentColor" />
    </svg>
  );
}

/**
 * What a property is on, and the three things to do about it.
 *
 * "is `--ink`": the inspector read the declaration that paints this and it
 * names the variable. Click it and the page's variables open, to **swap**
 * this element onto another one; above them, **Edit globally** changes the
 * variable itself, for every place that leans on it, and **Detach** keeps
 * the value the element has now as a literal of its own. Design Mode names
 * the same three; Figma keeps the first and the last on the field and the
 * middle in the variables panel. They are one row here because the
 * question they answer — what is this on, and should it be — is one
 * question.
 */
export function TokenPill({
  authored,
  tokens,
  kind,
  literal,
  rootFontSize,
  onSwap,
  onEditGlobally,
  onDetach,
}: {
  authored: AuthoredDecl & { token: string };
  tokens: CustomPropInfo[];
  kind: MatchKind;
  /** What the element paints right now, to keep as its own when detached. */
  literal: string;
  rootFontSize?: number;
  onSwap: (token: CustomPropInfo) => void;
  onEditGlobally?: (token: CustomPropInfo) => void;
  onDetach: (literal: string, from: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const token = tokens.find((p) => p.name === authored.token);
  const uses = token?.uses;
  const where = authored.inherited ? ` (inherited from ${authored.rule.selector})` : ` (${authored.rule.selector})`;
  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Token ${authored.token}`}
        title={`is ${authored.token}${where}${uses != null ? ` · ${uses} uses` : ''}`}
        className={`flex h-5 max-w-full items-center gap-1 self-start rounded-control px-1.5 font-mono text-2xs ${open ? 'bg-accent-soft text-accent' : 'bg-surface-field text-ink-secondary hover:bg-surface-field-hover hover:text-ink'}`}
      >
        <TokenGlyph className="h-1.5 w-1.5" />
        <span className="font-sans text-ink-muted">is </span>
        <span className="truncate">{authored.token}</span>
        {uses != null && <span className="font-sans text-ink-muted">×{uses}</span>}
      </button>
      {open && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1">
            {token && onEditGlobally && (
              <button onClick={() => onEditGlobally(token)} className="btn btn-sm btn-secondary" title={`Change ${token.name} itself, for every place that uses it`}>
                Edit globally{uses != null ? ` ×${uses}` : ''}
              </button>
            )}
            <button
              onClick={() => {
                onDetach(literal, authored.token);
                setOpen(false);
              }}
              className="btn btn-sm btn-ghost"
              title={`Keep ${literal} as this element's own value, off ${authored.token}`}
            >
              Detach
            </button>
          </div>
          <TokenPicker
            tokens={tokens}
            kind={kind}
            current={authored.token}
            rootFontSize={rootFontSize}
            onPick={(p) => {
              onSwap(p);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
