import { useCallback, useState } from 'react';
import type { ScanResult } from '@/shared/types';
import type {
  BrandConfig,
  Mode,
  ResolvedTokens,
  ScaleRole,
  SemanticRef,
  TypeRole,
  TypeRoleName,
} from '@/studio/engine/types';
import type { DesignModel } from '../lib/designModel';
import type { ReskinResult } from '../lib/messaging';
import { Section } from './design/Section';
import { ColourSection } from './design/ColourSection';
import { TypeSection } from './design/TypeSection';
import { SpaceSection } from './design/SpaceSection';

type SectionKey = 'colour' | 'type' | 'space';

/**
 * The system this page is running, editable.
 *
 * Fonts and Colors used to be separate tabs, which meant holding the system in
 * your head across two of them; they are one thing seen from two angles, and
 * this is that thing. It also absorbs what the full-tab Studio did, minus the
 * synthetic preview — in an extension the live site is the preview.
 *
 * The edit itself lives in the session store, not here: leaving this tab must
 * not discard it or un-paint the page.
 */
export function DesignTab({
  scan,
  model,
  mode,
  live,
  reskin,
  onModeChange,
  onLiveChange,
  onConfigChange,
}: {
  scan: ScanResult;
  model: DesignModel;
  mode: Mode;
  live: boolean;
  reskin: ReskinResult | null;
  onModeChange: (mode: Mode) => void;
  onLiveChange: (live: boolean) => void;
  onConfigChange: (config: BrandConfig | null) => void;
}) {
  // All three open. A collapsed section with a summary reads as a fact rather
  // than a door, which is exactly how the editable type ladder went unnoticed.
  const [open, setOpen] = useState<Set<SectionKey>>(
    new Set<SectionKey>(['colour', 'type', 'space']),
  );
  const { brand, resolved, edited } = model;
  const result = reskin;

  const toggle = (key: SectionKey) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /** One place that writes a new config, so every editor reads the same brand. */
  const patch = useCallback(
    (next: Partial<BrandConfig>) => onConfigChange({ ...brand, ...next }),
    [brand, onConfigChange],
  );

  const setRole = useCallback(
    (role: TypeRoleName, changes: Partial<TypeRole>) =>
      patch({
        typography: {
          ...brand.typography,
          roles: brand.typography.roles.map((r) => (r.role === role ? { ...r, ...changes } : r)),
        },
      }),
    [brand, patch],
  );

  /**
   * Moving the grid rescales the steps the page uses, keeping their shape: a
   * page on 4px that uses 4, 8, 24 becomes 6, 12, 36 rather than a fresh ladder.
   */
  const setSpacingBase = useCallback(
    (basePx: number) => {
      const old = brand.spacing.basePx || 1;
      const blessed = [
        ...new Set(brand.spacing.blessed.map((v) => Math.max(basePx, Math.round(v / old) * basePx))),
      ].sort((a, b) => a - b);
      patch({ spacing: { basePx, blessed } });
    },
    [brand, patch],
  );

  const setRadiusBase = useCallback(
    (basePx: number) => patch({ radius: { ...brand.radius, basePx, concentric: basePx > 0 } }),
    [brand, patch],
  );

  /** Re-point one semantic token by hand, at whatever step you pick. */
  const repoint = useCallback(
    (token: string, forMode: Mode, ref: SemanticRef) => {
      const rest = brand.color.semanticOverrides.filter((o) => o.name !== token);
      const current = brand.color.semanticOverrides.find((o) => o.name === token);
      patch({
        color: {
          ...brand.color,
          semanticOverrides: [...rest, { ...current, name: token, [forMode]: ref }],
        },
      });
    },
    [brand, patch],
  );

  /** Re-point one semantic token at the step the engine says would pass. */
  const fixWarning = useCallback(
    (fix: NonNullable<ResolvedTokens['warnings'][number]['fix']>) => {
      const rest = brand.color.semanticOverrides.filter((o) => o.name !== fix.token);
      const current = brand.color.semanticOverrides.find((o) => o.name === fix.token);
      patch({
        color: {
          ...brand.color,
          semanticOverrides: [...rest, { ...current, name: fix.token, [fix.mode]: fix.ref }],
        },
      });
    },
    [brand, patch],
  );

  const setSeed = useCallback(
    (role: ScaleRole, seed: string) => {
      onConfigChange({
        ...brand,
        color: {
          ...brand.color,
          scales: brand.color.scales.map((s) => (s.role === role ? { ...s, seed } : s)),
        },
      });
    },
    [brand, onConfigChange],
  );

  const failing = resolved.warnings.filter((w) => w.level === 'fail').length;

  return (
    <div className="relative flex flex-col">
      {/* Where this came from, and the mode the swatches are showing. */}
      <div
        className={`flex items-center gap-2 border-b px-3.5 py-2 text-xs ${
          live && edited ? 'border-accent/40 bg-accent-soft' : 'border-line-subtle'
        }`}
      >
        <button
          onClick={() => onLiveChange(!live)}
          className={`flex h-4 w-7 shrink-0 items-center rounded-full border px-0.5 ${
            live ? 'justify-end border-accent bg-accent' : 'justify-start border-line bg-surface-control'
          }`}
          title={live ? 'Stop applying changes to the page' : 'Apply changes to the page'}
          aria-pressed={live}
        >
          <span className="h-3 w-3 rounded-full bg-surface-panel" />
        </button>
        <span className={live && edited ? 'text-accent' : 'text-ink-muted'}>
          {!edited
            ? 'read from this page'
            : !live
              ? 'edited · page untouched'
              : result === null
              ? 'edited'
              : result.vars + result.rules === 0
                ? "this page holds none of this in variables — export or hand it over instead"
                : result.vars > 0
                  ? `${result.vars} ${result.vars === 1 ? 'variable' : 'variables'} live on the page`
                  : `${result.rules} ${result.rules === 1 ? 'rule' : 'rules'} live on the page`}
        </span>
        {edited && (
          <button
            onClick={() => onConfigChange(null)}
            className="text-accent hover:underline"
            title="Go back to what the page actually uses"
          >
            revert
          </button>
        )}
        <span className="flex items-center gap-1 rounded-control border border-line p-0.5">
          {(['light', 'dark'] as const).map((m) => (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              className={`rounded px-2 py-0.5 text-2xs capitalize ${
                mode === m ? 'bg-ink text-surface-app' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {m}
            </button>
          ))}
        </span>
      </div>

      <Section
        title="Colour"
        summary={`${brand.color.scales.length} ramps · ${resolved.semantics.length} tokens${
          failing ? ` · ${failing} to fix` : ''
        }`}
        open={open.has('colour')}
        onToggle={() => toggle('colour')}
      >
        <ColourSection
          config={brand}
          resolved={resolved}
          mode={mode}
          onSeedChange={setSeed}
          onFixWarning={fixWarning}
          onRepoint={repoint}
        />
      </Section>

      <Section
        title="Type"
        summary={`${scan.fontUsage[0]?.family ?? 'none'} · ${brand.typography.roles.length} steps · editable`}
        open={open.has('type')}
        onToggle={() => toggle('type')}
      >
        <TypeSection scan={scan} config={brand} onRoleChange={setRole} />
      </Section>

      <Section
        title="Space & shape"
        summary={`${brand.spacing.basePx}px grid · r${brand.radius.basePx} · editable`}
        open={open.has('space')}
        onToggle={() => toggle('space')}
      >
        <SpaceSection
          scan={scan}
          config={brand}
          resolved={resolved}
          onSpacingBase={setSpacingBase}
          onRadiusBase={setRadiusBase}
        />
      </Section>

    </div>
  );
}
