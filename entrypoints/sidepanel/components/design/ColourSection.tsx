import { useEffect, useState } from 'react';
import type { BrandConfig, Mode, ResolvedTokens, ScaleRole } from '@/studio/engine/types';
import { STEPS } from '@/studio/engine/types';

/**
 * Seeds → ramp, at 360px.
 *
 * A seed is one colour read off the page; the ramp under it is the eleven
 * steps the engine grows from that seed, and every page colour that sits on
 * one of those steps follows when the seed moves. The ramp splits 6 + 5
 * rather than 11 across: eleven swatches in a 332px column gives 26px each,
 * which is too small to judge a colour by.
 *
 * The generated semantic layer — `--background`, `--foreground` and the rest
 * — no longer shows here. The page never references it, so it cannot be
 * live; it belongs to the exports, and that is where it stays.
 */
export function ColourSection({
  config,
  resolved,
  mode,
  onSeedChange,
}: {
  config: BrandConfig;
  resolved: ResolvedTokens;
  mode: Mode;
  onSeedChange: (role: ScaleRole, seed: string) => void;
}) {
  const [openRamp, setOpenRamp] = useState<ScaleRole>('primary');
  const scale = resolved.scales[openRamp];
  const half = Math.ceil(STEPS.length / 2);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="text-2xs tracking-wide text-ink-muted">
          SEEDS — one colour each, read off the page. Move one and every page colour on its ramp follows.
        </div>
        <div className="divide-y divide-line-subtle overflow-hidden rounded-control border border-line-subtle">
          {config.color.scales.slice(0, 3).map((seed) => (
            <SeedRow
              key={seed.role}
              role={seed.role}
              name={seed.name}
              seed={seed.seed}
              oklch={resolved.scales[seed.role].steps[mode][resolved.scales[seed.role].anchorStep].oklch}
              selected={seed.role === openRamp}
              onSelect={() => setOpenRamp(seed.role)}
              onChange={(value) => onSeedChange(seed.role, value)}
            />
          ))}
        </div>
        <div className="text-2xs text-ink-muted">
          + {config.color.scales.length - 3} status ramps — taken from the page where it has them
        </div>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-dashed border-line-subtle pt-3">
        <div className="flex items-baseline gap-2">
          <span className="text-base">{scale.name} ramp</span>
          <span className="text-2xs text-ink-muted">
            11 steps grown from the seed, which sits at {scale.anchorStep} · {mode}
          </span>
        </div>
        {[STEPS.slice(0, half), STEPS.slice(half)].map((row, i) => (
          <div key={i} className="grid grid-cols-6 gap-1">
            {row.map((step) => {
              const swatch = scale.steps[mode][step];
              const anchor = step === scale.anchorStep;
              return (
                <button
                  key={step}
                  title={`${scale.name}-${step} · ${swatch.hex} — click to copy`}
                  onClick={() => navigator.clipboard.writeText(swatch.hex)}
                  className="flex flex-col gap-0.5"
                >
                  <span
                    className={`h-7 w-full rounded ${
                      anchor ? 'ring-2 ring-accent ring-offset-1' : 'border border-line-subtle'
                    }`}
                    style={{ background: swatch.hex }}
                  />
                  <span className={`text-2xs ${anchor ? 'text-accent' : 'text-ink-muted'}`}>{step}</span>
                </button>
              );
            })}
          </div>
        ))}
        <p className="text-2xs text-ink-muted">
          The semantic tokens built on these ramps are in Export, not here: this page never
          references them, so they cannot be live.
        </p>
      </div>
    </div>
  );
}

function SeedRow({
  role,
  name,
  seed,
  oklch,
  selected,
  onSelect,
  onChange,
}: {
  role: ScaleRole;
  name: string;
  seed: string;
  oklch: { l: number; c: number; h: number };
  selected: boolean;
  onSelect: () => void;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(seed);
  useEffect(() => setDraft(seed), [seed]);

  // Only push a value upstream once it parses: committing every keystroke turns
  // "#63" into a parse failure and silently rewrites the whole ramp.
  const commitIfValid = (value: string) => {
    setDraft(value);
    if (CSS.supports('color', value)) onChange(value);
  };

  return (
    <div
      onClick={onSelect}
      className={`flex cursor-pointer flex-col gap-0.5 px-2 py-1.5 ${
        selected ? 'bg-surface-selected' : 'hover:bg-surface-control'
      }`}
    >
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(draft) ? draft : '#000000'}
          onChange={(e) => commitIfValid(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          className="h-6 w-6 shrink-0 cursor-pointer rounded border border-line bg-transparent p-0"
          aria-label={`${name} seed colour`}
        />
        <span className="min-w-0 flex-1 truncate text-base">{name}</span>
        <input
          value={draft}
          onChange={(e) => commitIfValid(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          spellCheck={false}
          className={`w-18 shrink-0 rounded border px-1 py-0.5 text-right font-mono text-2xs ${
            CSS.supports('color', draft) ? 'border-line' : 'border-warn bg-warn-soft'
          }`}
        />
      </div>
      <div className="flex items-center gap-2.5 pl-8 text-2xs text-ink-muted">
        <span>{role}</span>
        <span>H {Math.round(oklch.h)}</span>
        <span>C {oklch.c.toFixed(2)}</span>
        <span>L {Math.round(oklch.l * 100)}%</span>
      </div>
    </div>
  );
}
