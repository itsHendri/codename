import { useEffect, useState } from 'react';
import { IDENTITY, parseTransform, transformRoundTrips, transformToCss, type Transform2D } from '@/studio/transform';
import { NumberField } from './NumberField';

/**
 * Move, turn, skew and scale, as Figma's and Framer's fields. The computed
 * matrix is taken apart into these exactly, and written back as the
 * functions a stylesheet would carry; a matrix the fields cannot rebuild —
 * a 3D one — keeps its text.
 */
export function TransformFields({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const t = transformRoundTrips(value) ? (parseTransform(value) ?? IDENTITY) : null;

  if (t === null) {
    return (
      <div className="flex flex-col gap-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft !== value && onChange(draft)}
          onKeyDown={(e) => e.key === 'Enter' && draft !== value && onChange(draft)}
          aria-label="Transform"
          spellCheck={false}
          className="field w-full px-2 font-mono"
        />
        <span className="text-2xs text-ink-muted">A 3D transform, which the fields would not give back exactly.</span>
      </div>
    );
  }

  const write = (patch: Partial<Transform2D>) => onChange(transformToCss({ ...t, ...patch }));
  const num = (v: string, fallback: number) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : fallback);
  const field = (label: string, aria: string, value: number, step: number, set: (n: number) => void) => (
    <NumberField value={String(value)} label={label} ariaLabel={aria} step={step} onChange={(v) => set(num(v, value))} />
  );

  return (
    <div className="grid grid-cols-3 gap-1">
      {field('X', 'Translate X', t.x, 1, (x) => write({ x }))}
      {field('Y', 'Translate Y', t.y, 1, (y) => write({ y }))}
      {field('↻', 'Rotate', t.rotate, 1, (rotate) => write({ rotate }))}
      {field('⤢', 'Scale X', t.scaleX, 0.1, (scaleX) => write({ scaleX, ...(t.scaleX === t.scaleY ? { scaleY: scaleX } : {}) }))}
      {field('⤡', 'Scale Y', t.scaleY, 0.1, (scaleY) => write({ scaleY }))}
      {field('⧸', 'Skew X', t.skewX, 1, (skewX) => write({ skewX }))}
    </div>
  );
}
