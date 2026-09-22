import type { ChangeLog, ElementChange } from '@/studio/changes';
import { active, canRedo, canUndo, grouped } from '@/studio/changes';
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
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <span className="subhead">
          Changes <span className="ml-0.5 font-mono">{live}</span>
        </span>
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
            title="Hold to see the page without your edits"
            className="btn btn-sm btn-secondary select-none"
          >
            View original
          </button>
        </div>
      </div>

      {grouped(log).map((g) => {
        const first = g.changes[0]!;
        return (
          <div key={g.selector} className="flex flex-col gap-1 rounded-control border border-line-subtle bg-surface-panel px-2 py-1.5">
            <div className="flex items-center gap-1.5">
              <code className="min-w-0 flex-1 truncate font-mono text-xs" title={g.selector}>
                {g.selector}
              </code>
              {first.matches > 1 && (
                <span className="h-4 rounded-[4px] bg-surface-field px-1.5 font-mono text-2xs leading-4 text-ink-secondary">
                  ×{first.matches}
                </span>
              )}
              {!first.stable && (
                <span className="h-4 rounded-[4px] bg-warn-soft px-1.5 text-2xs leading-4 text-warn-ink" title="Uses :nth-of-type — a reorder breaks it">
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

      <p className="text-2xs text-ink-muted">
        Previews use !important; your agent applies the same intent at the page's own specificity.
      </p>
    </div>
  );
}

function ChangeRow({ change: c, undone, onRevert }: { change: ElementChange; undone: boolean; onRevert: (id: string) => void }) {
  const reverted = c.status === 'reverted';
  return (
    <div className={`flex items-baseline gap-1 font-mono text-2xs ${undone ? 'opacity-50' : ''}`}>
      {c.condition && (
        <span
          className="h-4 shrink-0 rounded-[4px] bg-surface-field px-1 text-2xs leading-4 text-ink-secondary"
          title={`This edit is about ${describeLong(c.condition)}`}
        >
          {describeCondition(c.condition)}
        </span>
      )}
      <span className={`min-w-0 flex-1 truncate ${reverted ? 'text-ink-faint line-through' : 'text-ink-secondary'}`} title={`${c.from} → ${c.to}`}>
        <span className="text-ink-muted">{c.property}: </span>
        {c.from} <span className="text-ink-faint">→</span> {c.to}
        {c.token && <span className="text-accent"> {c.token}</span>}
      </span>
      {undone ? (
        <span className="shrink-0 font-sans text-ink-faint">undone</span>
      ) : (
        !reverted && (
          <button onClick={() => onRevert(c.id)} className="shrink-0 font-sans text-ink-muted hover:text-accent hover:underline">
            Revert
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
      className="btn btn-sm btn-ghost w-6 px-0"
    >
      {children}
    </button>
  );
}
