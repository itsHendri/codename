import { Popover } from '@base-ui/react/popover';
import { IconUnlink } from '@tabler/icons-react';
import { useState } from 'react';
import type { AuthoredDecl, CustomPropInfo } from '@/shared/types';
import type { MatchKind } from '@/studio/tokenMatch';
import { TokenPicker } from './TokenPicker';
import { usePopupLayer } from './popupLayer';

/** The mark of a variable in the field: Figma's square, Design Mode's diamond. */
export function TokenGlyph({ className = 'h-2 w-2' }: { className?: string }) {
  return (
    <svg viewBox="0 0 8 8" className={`${className} shrink-0`} aria-hidden>
      <path d="M4 0 8 4 4 8 0 4z" fill="currentColor" />
    </svg>
  );
}

/**
 * The variable a property is on, drawn as the value itself (Nudge's token
 * chip): a white chip inside the well, bleeding to its right edge, naming
 * the token. It says "is" only because the inspector read the declaration
 * that paints this and it names the variable; a value that only agrees with
 * one is a "matches" chip under the field, never this.
 *
 * Press it and a popup holds what to do about it: **swap** this element onto
 * another of the page's variables, **edit globally** (the variable itself,
 * for every place that leans on it), or **detach** (keep the value the
 * element has now as its own). Detach is also the unlink mark that shows on
 * hover, as Nudge's does.
 */
export function TokenChip({
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
  const layer = usePopupLayer();
  const [open, setOpen] = useState(false);
  const token = tokens.find((p) => p.name === authored.token);
  const uses = token?.uses;
  const where = authored.inherited ? ` (inherited from ${authored.rule.selector})` : ` (${authored.rule.selector})`;
  const detach = () => {
    onDetach(literal, authored.token);
    setOpen(false);
  };
  return (
    <div className="group/chip relative -mr-2 flex min-w-0 flex-1 self-stretch rounded-segment bg-surface-thumb shadow-[var(--shadow-control)]">
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          aria-label={`Token ${authored.token}`}
          title={`is ${authored.token}${where}${uses != null ? ` · ${uses} uses` : ''}`}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-segment px-2 text-left text-xs text-ink outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--accent)]"
        >
          <TokenGlyph className="h-1.5 w-1.5 text-ink-muted" />
          <span className="sr-only">is </span>
          <span className="min-w-0 flex-1 truncate">{authored.token}</span>
          {uses != null && <span className="shrink-0 text-2xs text-ink-muted group-hover/chip:invisible">×{uses}</span>}
        </Popover.Trigger>
        <Popover.Portal container={layer}>
          <Popover.Positioner sideOffset={6} align="start" className="z-50">
            <Popover.Popup className="popup flex w-[min(300px,var(--available-width))] flex-col gap-1.5 p-1.5 outline-none">
              <div className="flex items-center gap-1">
                {token && onEditGlobally && (
                  <button
                    onClick={() => onEditGlobally(token)}
                    className="btn btn-sm btn-secondary"
                    title={`Change ${token.name} itself, for every place that uses it`}
                  >
                    Edit globally{uses != null ? ` ×${uses}` : ''}
                  </button>
                )}
                <button onClick={detach} className="btn btn-sm btn-ghost" title={`Keep ${literal} as this element's own value, off ${authored.token}`}>
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
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      <button
        onClick={detach}
        aria-label={`Detach from ${authored.token}`}
        title={`Replace with ${literal}`}
        className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-[4px] bg-surface-thumb text-ink-muted opacity-0 hover:text-ink focus-visible:opacity-100 group-hover/chip:opacity-100"
      >
        <IconUnlink className="h-4 w-4" stroke={1.5} />
      </button>
    </div>
  );
}
