import { useEffect, useRef, useState } from 'react';
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

const stepFor = (e: { shiftKey: boolean; altKey: boolean }, step: number) =>
  step * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1);

/**
 * A length that can be typed, nudged or scrubbed. The grip on the left is the
 * scrub handle: horizontal drag changes the number by 1 per px, unit kept.
 */
export function NumberField({
  value,
  onChange,
  label,
  ariaLabel,
  className = '',
  step = 1,
  bare = false,
}: {
  value: string;
  onChange: (next: string) => void;
  label?: string;
  ariaLabel: string;
  className?: string;
  /** How much one px of drag, or one arrow press, is worth. */
  step?: number;
  /** No grip and no frame: a number sitting in a diagram, typed and nudged in place. */
  bare?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const drag = useRef<{ x: number; start: string } | null>(null);

  const valid = isValid(draft);
  const base = valid ? draft : value;

  const commit = () => {
    if (!valid) return;
    if (draft !== value) onChange(draft);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (!NUMBER.test(base)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, start: base };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    if (dx === 0) return;
    onChange(stepValue(drag.current.start, dx * stepFor(e, step)));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLSpanElement>) => {
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  if (bare) {
    return (
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(value);
            e.currentTarget.blur();
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            onChange(stepValue(base, e.key === 'ArrowUp' ? stepFor(e, step) : -stepFor(e, step)));
          }
        }}
        spellCheck={false}
        aria-label={ariaLabel}
        size={Math.max(3, draft.length)}
        className={`h-5 min-w-0 rounded-[4px] bg-transparent px-0.5 text-center font-mono text-2xs tabular-nums hover:bg-surface-field-hover focus:bg-surface-field focus:text-ink focus-visible:outline-1 ${
          valid ? 'text-ink-secondary' : 'field-invalid'
        } ${className}`}
      />
    );
  }

  // One filled field, the letter inside it as the scrub handle, as Figma and
  // Framer draw theirs; the whole field takes focus, so it shows one edge.
  return (
    <div className={`field flex min-w-0 items-center ${valid ? '' : 'field-invalid'} ${className}`}>
      <span
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        title="Drag to change · Shift ×10 · Alt ×0.1"
        className="flex h-6 min-w-5 shrink-0 cursor-ew-resize select-none items-center justify-center pl-1.5 pr-1 text-2xs text-ink-muted touch-none hover:text-ink"
      >
        {label ?? <GripIcon />}
      </span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(value);
            e.currentTarget.blur();
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            onChange(stepValue(base, e.key === 'ArrowUp' ? stepFor(e, step) : -stepFor(e, step)));
          }
        }}
        spellCheck={false}
        aria-label={ariaLabel}
        className="h-6 w-full min-w-0 bg-transparent pr-1.5 font-mono text-xs tabular-nums focus-visible:outline-none"
      />
    </div>
  );
}
