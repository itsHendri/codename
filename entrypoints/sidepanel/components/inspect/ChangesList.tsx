import type { ChangeLog, ElementChange } from '@/studio/changes';
import { active, canRedo, canUndo, grouped } from '@/studio/changes';
import { IconArrowBackUp } from '@tabler/icons-react';
import { RedoIcon, UndoIcon } from '../icons';
import { describe as describeCondition, describeLong } from '@/studio/conditions';

export function ChangesList({
  log,
  onUndo,
  onRedo,
  onRevert,
  onViewOriginal,
}: {
  log: ChangeLog;
  onUndo: () => void;
  onRedo: () => void;
  onRevert: (id: string) => void;
  onViewOriginal: (hold: boolean) => void;
}) {
  const live = active(log).length;
  const undone = new Set(log.entries.slice(log.cursor).map((e) => e.id));

  return (
    <div className="flex flex-col">
      <div className="flex min-h-control items-center gap-2">
        <span className="text-xs font-semibold text-ink">Changes</span>
        <span className="rounded-full bg-surface-field px-2 py-0.5 text-2xs font-medium text-ink-secondary">{live}</span>
        <div className="ml-auto flex items-center gap-1">
          <HeaderButton onClick={onUndo} disabled={!canUndo(log)} label="Undo">
            <UndoIcon />
          </HeaderButton>
          <HeaderButton onClick={onRedo} disabled={!canRedo(log)} label="Redo">
            <RedoIcon />
          </HeaderButton>
          <button
            onPointerDown={() => onViewOriginal(true)}
            onPointerUp={() => onViewOriginal(false)}
            onPointerLeave={() => onViewOriginal(false)}
            onPointerCancel={() => onViewOriginal(false)}
            disabled={live === 0}
            title="Hold to see the page without your edits (or hold \ on the page)"
            className="btn btn-sm btn-secondary select-none"
          >
            View original
          </button>
        </div>
      </div>

      {/* Nudge's list: one block per element, its target in semibold, a row per
          change with the new value in accent, and a revert mark on each. */}
      {grouped(log).map((g) => {
        const first = g.changes[0]!;
        return (
          <div key={g.selector} className="flex flex-col border-b border-line py-2 last:border-b-0">
            <div className="flex min-h-6 items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink" title={g.selector}>
                {g.selector}
              </span>
              {first.matches > 1 && (
                <span className="h-5 rounded-segment bg-surface-field px-1.5 text-2xs leading-5 text-ink-secondary">×{first.matches}</span>
              )}
              {!first.stable && (
                <span className="h-5 rounded-segment bg-warn-soft px-1.5 text-2xs leading-5 text-warn-ink" title="Uses :nth-of-type — a reorder breaks it">
                  positional
                </span>
              )}
            </div>
            {g.changes.map((c) => (
              <ChangeRow key={c.id} change={c} undone={undone.has(c.id)} onRevert={onRevert} />
            ))}
          </div>
        );
      })}

      <p className="pt-2 text-2xs text-ink-muted">
        Previews use !important; your agent applies the same intent at the page's own specificity.
      </p>
    </div>
  );
}

function ChangeRow({ change: c, undone, onRevert }: { change: ElementChange; undone: boolean; onRevert: (id: string) => void }) {
  const reverted = c.status === 'reverted';
  return (
    <div className={`flex min-h-6 items-center gap-1.5 text-xs ${undone ? 'opacity-50' : ''}`}>
      {c.condition && (
        <span
          className="h-5 shrink-0 rounded-segment bg-surface-field px-1.5 text-2xs leading-5 text-ink-secondary"
          title={`This edit is about ${describeLong(c.condition)}`}
        >
          {describeCondition(c.condition)}
        </span>
      )}
      <span className={`min-w-0 flex-1 truncate ${reverted ? 'text-ink-faint line-through' : ''}`} title={`${c.property}: ${c.from} → ${c.to}`}>
        <span className="text-ink-secondary">{c.property}</span>{' '}
        <span className="text-ink-muted">{c.from}</span> <span className="text-ink-faint">→</span>{' '}
        <span className={reverted ? '' : 'text-accent'}>{c.token ?? c.to}</span>
      </span>
      {undone ? (
        <span className="shrink-0 text-2xs text-ink-faint">undone</span>
      ) : (
        !reverted && (
          <button
            onClick={() => onRevert(c.id)}
            aria-label={`Revert ${c.property}`}
            title="Revert"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] text-ink-muted hover:bg-surface-field hover:text-ink"
          >
            <IconArrowBackUp className="h-4 w-4" stroke={1.5} />
          </button>
        )
      )}
    </div>
  );
}

function HeaderButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="btn btn-sm btn-ghost w-control-sm px-0"
    >
      {children}
    </button>
  );
}
