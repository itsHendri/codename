import { useEffect, useState } from 'react';
import type { BrandConfig, Mode, ResolvedTokens, ScaleRole } from '@/studio/engine/types';
import { STEPS } from '@/studio/engine/types';
import { contrastBadge } from '../../lib/color';

/**
 * Seeds → ramp → semantics, at 360px.
 *
 * The ramp splits 6 + 5 rather than 11 across: eleven swatches in a 332px
 * column gives 26px each, which is too small to judge a colour by. The
 * semantics table becomes a list for the same reason — four columns need ~534px
 * to hold `secondary.950 @100%` twice, so the roomy version is the exported
 * style guide and this one carries name, both modes, and the audit.
 */
export function ColourSection({
  config,
  resolved,
  mode,
  onSeedChange,
  onFixWarning,
}: {
  config: BrandConfig;
  resolved: ResolvedTokens;
  mode: Mode;
  onSeedChange: (role: ScaleRole, seed: string) => void;
  onFixWarning: (fix: NonNullable<ResolvedTokens['warnings'][number]['fix']>) => void;
}) {
  const [openRamp, setOpenRamp] = useState<ScaleRole>('primary');
  const [showAllTokens, setShowAllTokens] = useState(false);

  const scale = resolved.scales[openRamp];
  const half = Math.ceil(STEPS.length / 2);

  const warningFor = new Map<string, ResolvedTokens['warnings'][number]>();
  for (const w of resolved.warnings) {
    const target = w.fix?.token ?? w.tokens?.[0];
    if (target && !warningFor.has(target)) warningFor.set(target, w);
  }
  const shown = showAllTokens ? resolved.semantics : resolved.semantics.slice(0, 8);
  const toFix = resolved.warnings.filter((w) => w.level === 'fail').length;

  return (
    <div className="flex flex-col gap-3.5">
      {/* Seeds */}
      <div className="flex flex-col gap-1.5">
        <div className="text-2xs tracking-wide text-ink-muted">
          SEEDS — the only place you edit colour
        </div>
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
        <div className="text-2xs text-ink-muted">
          + {config.color.scales.length - 3} status ramps — taken from the page where it has them
        </div>
      </div>

      {/* Ramp for the selected seed */}
      <div className="flex flex-col gap-1.5 border-t border-dashed border-line-subtle pt-3">
        <div className="flex items-baseline gap-2">
          <span className="text-base">{scale.name} ramp</span>
          <span className="text-2xs text-ink-muted">seed sits at {scale.anchorStep}</span>
        </div>
        {[STEPS.slice(0, half), STEPS.slice(half)].map((row, i) => (
          <div key={i} className="grid grid-cols-6 gap-1">
            {row.map((step) => {
              const swatch = scale.steps[mode][step];
              const anchor = step === scale.anchorStep;
              return (
                <button
                  key={step}
                  title={`${scale.name}-${step} · ${swatch.hex}`}
                  onClick={() => navigator.clipboard.writeText(swatch.hex)}
                  className="flex flex-col gap-0.5"
                >
                  <span
                    className={`h-7 w-full rounded ${
                      anchor ? 'ring-2 ring-accent ring-offset-1' : 'border border-line-subtle'
                    }`}
                    style={{ background: swatch.hex }}
                  />
                  <span className={`text-2xs ${anchor ? 'text-accent' : 'text-ink-muted'}`}>
                    {step}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Semantics as a list */}
      <div className="flex flex-col gap-1 border-t border-dashed border-line-subtle pt-3">
        <div className="flex items-baseline gap-2">
          <span className="text-base">Semantics</span>
          <span className="ml-auto text-2xs text-ink-muted">light / dark · contrast</span>
        </div>
        {shown.map((token) => {
          const warning = warningFor.get(token.name);
          const failing = warning?.level === 'fail';
          const badge = warning?.apcaLc != null ? contrastBadge(Math.abs(warning.apcaLc) / 10) : null;
          return (
            <div
              key={token.name}
              title={token.description}
              className={`flex items-center gap-2 border-b border-dotted border-line-subtle py-1 ${
                failing ? 'bg-warn-soft' : ''
              }`}
            >
              <code className="min-w-0 flex-1 truncate text-xs">--{token.name}</code>
              <span className="flex shrink-0 gap-0.5">
                <span
                  className="h-3.5 w-3.5 rounded-sm border border-line"
                  style={{ background: token.values.light.css }}
                />
                <span
                  className="h-3.5 w-3.5 rounded-sm border border-line"
                  style={{ background: token.values.dark.css }}
                />
              </span>
              <span className="w-9 shrink-0 text-right text-2xs">
                {warning?.apcaLc != null ? (
                  <span className={failing ? 'text-warn-ink' : 'text-ink-muted'}>
                    {Math.round(Math.abs(warning.apcaLc))}
                  </span>
                ) : (
                  <span className="text-ink-muted">—</span>
                )}
              </span>
              {/* The engine already worked out which step would clear the
                  threshold; this is the button it never had. */}
              {failing && warning?.fix && (
                <button
                  onClick={() => onFixWarning(warning.fix!)}
                  title={`Re-point --${warning.fix.token} at ${warning.fix.ref.scale} ${warning.fix.ref.step} in ${warning.fix.mode}`}
                  className="shrink-0 rounded-full border border-warn px-1.5 text-2xs text-warn-ink hover:bg-warn hover:text-surface-app"
                >
                  fix
                </button>
              )}
            </div>
          );
        })}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => setShowAllTokens((v) => !v)}
            className="text-xs text-accent hover:underline"
          >
            {showAllTokens ? 'show fewer' : `show all ${resolved.semantics.length}`}
          </button>
          <span className="ml-auto text-2xs text-ink-muted">
            {toFix > 0 ? `${toFix} to fix` : 'contrast clear'}
          </span>
        </div>
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
      className={`flex cursor-pointer flex-col gap-0.5 rounded-card border px-2 py-1.5 ${
        selected ? 'border-accent bg-accent-soft/60' : 'border-line hover:border-line'
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
