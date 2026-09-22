/**
 * The transition on an element: what moves, how long it takes, on what curve.
 *
 * States said what an element becomes. This says how it gets there, which is
 * the half of motion the panel had nowhere to put — and the reason to build
 * it here rather than hand it to the agent is that a duration is a thing you
 * judge by watching, not by reading.
 *
 * Fields appear only for a value they can rebuild exactly; anything else
 * keeps the text field, the same bargain the shadow fields make.
 */

import { useEffect, useState } from 'react';
import {
  easingToCss,
  matchEasing,
  parseTransition,
  transitionRoundTrips,
  transitionToCss,
  type NamedEasing,
  type TransitionEntry,
} from '@/studio/motion';
import { NumberField } from './NumberField';
import { CloseIcon, PlayIcon, PlusIcon } from '../icons';

/** The properties worth offering by name; anything else is typed in. */
const COMMON = ['all', 'opacity', 'transform', 'color', 'background-color', 'border-color', 'box-shadow', 'filter'];

export function MotionFields({
  value,
  easings,
  onChange,
  onPlay,
  playable,
}: {
  value: string;
  easings: NamedEasing[];
  onChange: (next: string) => void;
  /** Runs the transition where there is a state to run it into. */
  onPlay?: () => void;
  playable: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const entries = transitionRoundTrips(value) ? (parseTransition(value) ?? []) : null;
  const write = (next: TransitionEntry[]) => onChange(transitionToCss(next));
  const edit = (i: number, patch: Partial<TransitionEntry>) =>
    write((entries ?? []).map((e, n) => (n === i ? { ...e, ...patch } : e)));

  if (entries === null) {
    // Something this cannot take apart — a `var()`, or a shape it would lose
    // pieces of. The text is the honest editor for it.
    return (
      <div className="flex flex-col gap-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft !== value && onChange(draft)}
          onKeyDown={(e) => e.key === 'Enter' && draft !== value && onChange(draft)}
          aria-label="Transition"
          spellCheck={false}
          className="field w-full px-2 font-mono"
        />
        <span className="text-2xs text-ink-muted">This page writes it in a form the fields would not give back exactly.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {entries.map((entry, i) => {
        const chosen = matchEasing(entry.easing, easings);
        return (
          <div key={i} className="flex flex-col gap-1.5 rounded-card border border-line-subtle p-1.5">
            <div className="flex items-center gap-1.5">
              <input
                list="codename-transition-props"
                value={entry.property}
                onChange={(e) => edit(i, { property: e.target.value })}
                aria-label="Property that moves"
                spellCheck={false}
                className="field min-w-0 flex-1 px-2 font-mono"
              />
              <button
                onClick={() => write(entries.filter((_, n) => n !== i))}
                aria-label={`Remove the transition on ${entry.property}`}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] text-ink-muted hover:bg-surface-field hover:text-warn-ink"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <label className="flex items-center gap-1 text-2xs text-ink-muted">
                for
                <NumberField
                  value={`${entry.durationMs}`}
                  ariaLabel="Duration in milliseconds"
                  step={10}
                  className="w-14"
                  onChange={(v) => Number.isFinite(parseFloat(v)) && edit(i, { durationMs: Math.max(0, parseFloat(v)) })}
                />
                ms
              </label>
              <label className="flex items-center gap-1 text-2xs text-ink-muted">
                after
                <NumberField
                  value={`${entry.delayMs}`}
                  ariaLabel="Delay in milliseconds"
                  step={10}
                  className="w-14"
                  onChange={(v) => Number.isFinite(parseFloat(v)) && edit(i, { delayMs: Math.max(0, parseFloat(v)) })}
                />
                ms
              </label>
            </div>
            <select
              value={chosen?.name ?? ''}
              onChange={(e) => {
                const picked = easings.find((x) => x.name === e.target.value);
                edit(i, { easing: picked ? easingToCss(picked) : '' });
              }}
              aria-label="Easing"
              className="field field-select"
            >
              {/* A curve the page wrote by hand is shown as it is, rather than
                  silently becoming the nearest name. */}
              {!chosen && <option value="">{entry.easing || 'no easing'}</option>}
              {easings.map((e) => (
                <option key={e.name} value={e.name}>
                  {e.name}
                  {e.fromPage ? " · this page's" : ''}
                </option>
              ))}
            </select>
          </div>
        );
      })}

      <datalist id="codename-transition-props">
        {COMMON.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      <div className="flex items-center gap-2">
        <button
          onClick={() => write([...entries, { property: 'all', durationMs: 200, delayMs: 0, easing: easings[0] ? easingToCss(easings[0]) : 'ease-out' }])}
          className="btn btn-sm btn-ghost -ml-2"
        >
          <PlusIcon />
          Add
        </button>
        {onPlay && (
          <button
            onClick={onPlay}
            disabled={!playable}
            title={
              playable
                ? 'Take the element out of the state and put it back, so the transition runs'
                : 'Pick hover, focus or active first — a transition needs somewhere to go'
            }
            className="btn btn-sm btn-ghost"
          >
            <PlayIcon className="h-2.5 w-2.5" />
            Play
          </button>
        )}
        {!entries.length && <span className="text-2xs text-ink-muted">Nothing moves.</span>}
      </div>
      {playable && (
        <span className="text-2xs text-ink-muted">
          A transition belongs to the element, not to the state you are holding, so this is filed without it.
        </span>
      )}
    </div>
  );
}
