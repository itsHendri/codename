import { useEffect, useRef, useState } from 'react';

const NUMBER = /^(-?\d*\.?\d+)(.*)$/;

/** '12px' + 1 → '13px'. Values that are not numbers ('auto', 'normal') pass through. */
export function stepValue(value: string, delta: number): string {
  const m = NUMBER.exec(value.trim());
  if (!m) return value;
  const next = Number((parseFloat(m[1]!) + delta).toFixed(2));
  return `${next}${m[2]}`;
}

const isValid = (v: string) =>
  CSS.supports('width', v) || /^-?\d*\.?\d+$/.test(v) || /^(normal|auto|none|inherit|initial|unset)$/.test(v);

const stepFor = (e: { shiftKey: boolean; altKey: boolean }) => (e.shiftKey ? 10 : e.altKey ? 0.1 : 1);

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
}: {
  value: string;
  onChange: (next: string) => void;
  label?: string;
  ariaLabel: string;
  className?: string;
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
    onChange(stepValue(drag.current.start, dx * stepFor(e)));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLSpanElement>) => {
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div className={`flex min-w-0 items-center gap-0.5 ${className}`}>
      <span
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        title="Drag to change · Shift ×10 · Alt ×0.1"
        className="w-3.5 shrink-0 cursor-ew-resize select-none text-center text-2xs text-ink-muted touch-none"
      >
        {label ?? '⋮'}
      </span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            onChange(stepValue(base, e.key === 'ArrowUp' ? stepFor(e) : -stepFor(e)));
          }
        }}
        spellCheck={false}
        aria-label={ariaLabel}
        className={`w-full min-w-0 rounded-control border bg-surface-recessed px-1 py-0.5 text-right font-mono text-xs tabular-nums ${
          valid ? 'border-line' : 'border-warn bg-warn-soft'
        }`}
      />
    </div>
  );
}
