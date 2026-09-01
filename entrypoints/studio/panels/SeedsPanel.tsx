import { useEffect, useState } from 'react';
import type { BrandConfig, Mode, ResolvedTokens, ScaleRole } from '@/studio/engine/types';
import { STEPS } from '@/studio/engine/types';

/**
 * Seed rows + the selected ramp. The seed field holds its own text while you
 * type — committing on every keystroke turns "#63" into a parse failure and
 * silently rewrites the ramp, which is how Brand Forge lost a brand colour once.
 */
export function SeedsPanel({
  config,
  resolved,
  mode,
  selectedRole,
  onSelectRole,
  onSeedChange,
}: {
  config: BrandConfig;
  resolved: ResolvedTokens;
  mode: Mode;
  selectedRole: ScaleRole;
  onSelectRole: (role: ScaleRole) => void;
  onSeedChange: (role: ScaleRole, seed: string) => void;
}) {
  const scale = resolved.scales[selectedRole];

  return (
    <div className="border-b border-dashed border-gray-200 p-4">
      <div className="mb-2.5 flex items-baseline gap-2">
        <h2 className="font-medium">Seed colours</h2>
        <span className="text-xs text-gray-400">primitives — the only place a human edits colour</span>
      </div>

      <div className="flex flex-col gap-2">
        {config.color.scales.map((seedScale) => (
          <SeedRow
            key={seedScale.role}
            role={seedScale.role}
            name={seedScale.name}
            seed={seedScale.seed}
            selected={seedScale.role === selectedRole}
            onSelect={() => onSelectRole(seedScale.role)}
            onChange={(value) => onSeedChange(seedScale.role, value)}
          />
        ))}
      </div>

      {/* Ramp for the selected seed */}
      <div className="mt-4">
        <div className="mb-2 flex items-baseline gap-2">
          <h3 className="text-sm font-medium">{scale.name} ramp</h3>
          <span className="text-xs text-gray-400">
            11 steps · shared lightness targets · seed sits at {scale.anchorStep}
          </span>
        </div>
        <div className="grid grid-cols-11 gap-1">
          {STEPS.map((step) => {
            const swatch = scale.steps[mode][step];
            const isAnchor = step === scale.anchorStep;
            return (
              <button
                key={step}
                title={`${scale.name}-${step} · ${swatch.hex}${swatch.overridden ? ' (overridden)' : ''}`}
                onClick={() => navigator.clipboard.writeText(swatch.hex)}
                className="flex flex-col gap-1"
              >
                <span
                  className={`h-9 w-full rounded ${
                    isAnchor ? 'ring-2 ring-blue-600 ring-offset-1' : 'border border-gray-300'
                  }`}
                  style={{ background: swatch.hex }}
                />
                <span className={`text-[9px] ${isAnchor ? 'text-blue-600' : 'text-gray-400'}`}>{step}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SeedRow({
  role,
  name,
  seed,
  selected,
  onSelect,
  onChange,
}: {
  role: ScaleRole;
  name: string;
  seed: string;
  selected: boolean;
  onSelect: () => void;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(seed);
  useEffect(() => setDraft(seed), [seed]);

  const commitIfValid = (value: string) => {
    setDraft(value);
    // Only push upstream once it parses — a half-typed hex is not a colour.
    if (CSS.supports('color', value)) onChange(value);
  };

  return (
    <div
      onClick={onSelect}
      className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 ${
        selected ? 'border-blue-600 bg-blue-50/50' : 'border-gray-300 hover:border-gray-400'
      }`}
    >
      <input
        type="color"
        value={CSS.supports('color', draft) ? toHexInput(draft) : '#000000'}
        onChange={(e) => commitIfValid(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        className="h-8 w-8 cursor-pointer rounded border border-gray-300 bg-transparent p-0"
        aria-label={`${name} seed colour`}
      />
      <div className="min-w-0">
        <div className="text-sm">{name}</div>
        <div className="text-[11px] text-gray-400">{role}</div>
      </div>
      <input
        value={draft}
        onChange={(e) => commitIfValid(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        spellCheck={false}
        className={`ml-auto w-28 rounded border px-2 py-0.5 font-mono text-xs ${
          CSS.supports('color', draft) ? 'border-gray-300' : 'border-amber-500 bg-amber-50'
        }`}
      />
    </div>
  );
}

/** <input type=color> only accepts #rrggbb, but a seed may be any CSS colour. */
function toHexInput(value: string): string {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) return '#000000';
  probe.fillStyle = '#000000';
  probe.fillStyle = value;
  const resolved = probe.fillStyle;
  return /^#[0-9a-f]{6}$/i.test(resolved) ? resolved : '#000000';
}
