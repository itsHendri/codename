import { useEffect, useState } from 'react';
import {
  animationRoundTrips,
  animationToCss,
  parseAnimation,
  PRESETS,
  timelineFor,
  triggerEntry,
  triggerOf,
  TRIGGERS,
  type AnimationEntry,
  type Trigger,
} from '@/studio/animation';
import { easingToCss, matchEasing, type NamedEasing } from '@/studio/motion';
import { NumberField } from './NumberField';
import { Segmented, Select } from './fields';

const TRIGGER_TITLES: Record<Trigger, string> = {
  appear: 'Run once when the element appears, and stay',
  loop: 'Run forever, back and forth',
  scroll: 'Run along the scroll, as the element comes into view',
};

/**
 * Framer's Appear · Loop · Scroll over one `animation` declaration. The
 * keyframes are the page's own, read off its sheets, or one of a few named
 * presets the element sheet defines and the brief spells out.
 */
export function AnimationFields({
  value,
  timeline,
  keyframes,
  easings,
  onChange,
}: {
  value: string;
  /** The element's `animation-timeline`, which is what makes it a scroll trigger. */
  timeline: string;
  /** The `@keyframes` names this page defines. */
  keyframes: string[];
  easings: NamedEasing[];
  onChange: (property: string, value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const entries = animationRoundTrips(value) ? (parseAnimation(value) ?? []) : null;

  if (entries === null) {
    return (
      <div className="flex flex-col gap-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft !== value && onChange('animation', draft)}
          onKeyDown={(e) => e.key === 'Enter' && draft !== value && onChange('animation', draft)}
          aria-label="Animation"
          spellCheck={false}
          className="w-full rounded-control border border-line bg-surface-recessed px-1 py-0.5 font-mono text-xs"
        />
        <span className="text-2xs text-ink-muted">This page writes it in a form the fields would not give back exactly.</span>
      </div>
    );
  }

  const entry = entries[0];
  const trigger = triggerOf(entry, timeline);
  const names = [...keyframes.filter((k) => !PRESETS.some((p) => p.name === k)), ...PRESETS.map((p) => p.name)];
  const labels = Object.fromEntries(PRESETS.map((p) => [p.name, `${p.label} (preset)`])) as Record<string, string>;
  const write = (next: AnimationEntry | null) => onChange('animation', animationToCss(next ? [next, ...entries.slice(1)] : entries.slice(1)));
  const setTrigger = (t: Trigger | 'none') => {
    if (t === 'none') {
      write(null);
      if (timeline !== 'auto') onChange('animation-timeline', 'auto');
      return;
    }
    const name = entry?.name ?? PRESETS[0]!.name;
    write(triggerEntry(t, name, entry?.easing));
    const wanted = timelineFor(t);
    if ((timeline || 'auto') !== wanted) onChange('animation-timeline', wanted);
  };

  const chosen = entry ? matchEasing(entry.easing, easings) : null;
  return (
    <div className="flex flex-col gap-1.5">
      <Segmented
        value={trigger ?? 'none'}
        options={['none', ...TRIGGERS] as const}
        titles={{ none: 'No animation', ...TRIGGER_TITLES }}
        ariaLabel="Trigger"
        onChange={setTrigger}
      />
      {entry && (
        <div className="flex flex-col gap-1 rounded-control border border-line-subtle px-1.5 py-1">
          <Select
            value={entry.name}
            options={names}
            labels={labels}
            ariaLabel="Keyframes"
            onChange={(name) => write({ ...entry, name })}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="flex items-center gap-1 text-2xs text-ink-muted">
              for
              <NumberField
                value={`${entry.durationMs}`}
                ariaLabel="Animation duration in milliseconds"
                step={10}
                className="w-14"
                onChange={(v) => Number.isFinite(parseFloat(v)) && write({ ...entry, durationMs: Math.max(0, parseFloat(v)) })}
              />
              ms
            </label>
            <label className="flex items-center gap-1 text-2xs text-ink-muted">
              after
              <NumberField
                value={`${entry.delayMs}`}
                ariaLabel="Animation delay in milliseconds"
                step={10}
                className="w-14"
                onChange={(v) => Number.isFinite(parseFloat(v)) && write({ ...entry, delayMs: Math.max(0, parseFloat(v)) })}
              />
              ms
            </label>
            {trigger === 'loop' && (
              <label className="flex items-center gap-1 text-2xs text-ink-muted">
                <Select
                  value={entry.direction}
                  options={['alternate', 'normal', 'reverse', 'alternate-reverse'] as const}
                  ariaLabel="Animation direction"
                  onChange={(direction) => write({ ...entry, direction })}
                />
              </label>
            )}
          </div>
          <select
            value={chosen?.name ?? ''}
            onChange={(e) => {
              const picked = easings.find((x) => x.name === e.target.value);
              write({ ...entry, easing: picked ? easingToCss(picked) : entry.easing });
            }}
            aria-label="Animation easing"
            className="rounded-control border border-line bg-surface-recessed px-1 py-0.5 text-2xs"
          >
            {!chosen && <option value="">{entry.easing || 'no easing'}</option>}
            {easings.map((e) => (
              <option key={e.name} value={e.name}>
                {e.name}
                {e.fromPage ? " · this page's" : ''}
              </option>
            ))}
          </select>
          {trigger === 'scroll' && (
            <span className="text-2xs text-ink-muted">Runs on <code className="font-mono">animation-timeline: view()</code>; browsers without scroll-driven animations run it once instead.</span>
          )}
          {entries.length > 1 && <span className="text-2xs text-ink-muted">+{entries.length - 1} more, left as they are.</span>}
        </div>
      )}
    </div>
  );
}
