import { useEffect, useRef, useState, type ReactNode } from 'react';
import { canNudge, nudgeByDrag, nudgeByKey } from '@/studio/inspect/nudgeValue';
import { startDragLock } from './dragLock';
import { GripIcon } from '../icons';

const NUMBER = /^(-?\d*\.?\d+)(.*)$/;

/** '12px' + 1 → '13px'. Values that are not numbers ('auto', 'normal') pass through. */
export function stepValue(value: string, delta: number): string {
  const m = NUMBER.exec(value.trim());
  if (!m) return value;
  const next = Number((parseFloat(m[1]!) + delta).toFixed(2));
  return `${next}${m[2]}`;
}

// `margin-top` rather than `width`: negative lengths are legal for tracking
// and margins, and `width` rejects them, which flagged every letter-spacing.
const isValid = (v: string) =>
  CSS.supports('margin-top', v) ||
  /^-?\d*\.?\d+$/.test(v) ||
  /^(normal|auto|none|inherit|initial|unset)$/.test(v);

/** The arrow keys' and the drag's rules, Nudge's (studio/inspect/nudgeValue.ts). */
const keyStep = (property: string, value: string, up: boolean, large: boolean, step: number) =>
  nudgeByKey(property, value, up ? 1 : -1, large, step) ?? value;

/**
 * A number that can be typed, nudged or scrubbed, Nudge's way: one 32px
 * well, an icon (or a letter) leading it, and that icon is the handle. Drag
 * it sideways and the pointer locks, one step per 16px, one large step per
 * 8px with Shift; ↑/↓ step by 1 and Shift by 8 (rem by an eighth and 1). A
 * whole drag is one entry in the log, as the log merges a scrub run.
 * `property` names the CSS property so its rules apply (a weight moves by
 * 100, padding stops at 0); without one the field's own `step` is used.
 */
export function NumberField({
  value,
  onChange,
  label,
  icon,
  property = '',
  trailing,
  ariaLabel,
  className = '',
  step = 1,
  bare = false,
}: {
  value: string;
  onChange: (next: string) => void;
  /** A letter for the handle when there is no icon. */
  label?: string;
  icon?: ReactNode;
  property?: string;
  /** Something at the right end of the well: a unit menu, a token mark. */
  trailing?: ReactNode;
  ariaLabel: string;
  className?: string;
  /** One press, for a property the rules do not know (a duration, a factor). */
  step?: number;
  /** No handle and no frame: a number sitting in a diagram, typed and nudged in place. */
  bare?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const [dragging, setDragging] = useState(false);
  const stopDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => stopDrag.current?.(), []);

  const valid = isValid(draft);
  const base = valid ? draft : value;

  const commit = () => {
    if (!valid) return;
    if (draft !== value) onChange(draft);
  };

  const onMouseDown = (e: React.MouseEvent<HTMLSpanElement>) => {
    if (e.button !== 0 || !canNudge(base)) return;
    e.preventDefault();
    const start = base;
    let last = start;
    setDragging(true);
    stopDrag.current = startDragLock(
      e.currentTarget,
      e.clientX,
      (dx, ev) => {
        const next = nudgeByDrag(property, start, dx, ev.shiftKey, step) ?? start;
        if (next !== last) {
          last = next;
          onChange(next);
        }
      },
      () => {
        stopDrag.current = null;
        setDragging(false);
      },
    );
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commit();
      if (!bare) e.currentTarget.blur();
    }
    if (e.key === 'Escape') {
      setDraft(value);
      e.currentTarget.blur();
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = keyStep(property, base, e.key === 'ArrowUp', e.shiftKey, step);
      if (next !== base) onChange(next);
    }
  };

  if (bare) {
    return (
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={onKeyDown}
        spellCheck={false}
        aria-label={ariaLabel}
        size={Math.max(3, draft.length)}
        className={`h-6 min-w-0 rounded-segment bg-transparent px-1 text-center text-xs tabular-nums hover:bg-surface-field-hover focus:bg-surface-field focus:text-ink focus-visible:outline-1 ${
          valid ? 'text-ink-secondary' : 'field-invalid'
        } ${className}`}
      />
    );
  }

  return (
    <div className={`field flex min-w-0 items-center gap-2 px-2 ${valid ? '' : 'field-invalid'} ${className}`}>
      <span
        onMouseDown={onMouseDown}
        title="Drag to change · Shift for steps of 8"
        data-dragging={dragging || undefined}
        className="flex h-4 min-w-4 shrink-0 cursor-ew-resize select-none items-center justify-center text-xs text-ink-muted touch-none hover:text-ink data-[dragging]:text-ink [&>svg]:h-4 [&>svg]:w-4"
      >
        {icon ?? label ?? <GripIcon />}
      </span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        spellCheck={false}
        aria-label={ariaLabel}
        className="h-full min-h-control w-full min-w-0 bg-transparent text-xs tabular-nums text-ink focus-visible:outline-none"
      />
      {trailing}
    </div>
  );
}
