import { useCallback, useState } from 'react';
import type { ScanResult } from '@/shared/types';
import type { BrandConfig, Mode, ScaleRole } from '@/studio/engine/types';
import type { DesignModel } from '../lib/designModel';
import type { ReskinResult } from '../lib/messaging';
import { Section } from './design/Section';
import { ColourSection } from './design/ColourSection';
import { TypeSection } from './design/TypeSection';
import { SpaceSection } from './design/SpaceSection';
import { HandOff } from './design/HandOff';

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
  const [open, setOpen] = useState<Set<SectionKey>>(new Set<SectionKey>(['colour']));
  const [handingOff, setHandingOff] = useState(false);
  const { brand, resolved, edited, overrides, colorMap } = model;
  const result = reskin;

  const toggle = (key: SectionKey) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

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
                ? "this page's colours can't be reached"
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
        {edited && (
          <button
            onClick={() => setHandingOff(true)}
            className="ml-auto shrink-0 rounded-control border border-accent bg-surface-panel px-2 py-0.5 text-2xs font-medium text-accent hover:bg-accent-soft"
          >
            Hand to agent →
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
        <ColourSection config={brand} resolved={resolved} mode={mode} onSeedChange={setSeed} />
      </Section>

      <Section
        title="Type"
        summary={`${scan.fontUsage[0]?.family ?? 'none'} · ${brand.typography.roles.length} steps`}
        open={open.has('type')}
        onToggle={() => toggle('type')}
      >
        <TypeSection scan={scan} config={brand} />
      </Section>

      <Section
        title="Space & shape"
        summary={`${brand.spacing.basePx}px grid · r${brand.radius.basePx} · ${brand.shadows.levels.length} shadows`}
        open={open.has('space')}
        onToggle={() => toggle('space')}
      >
        <SpaceSection scan={scan} config={brand} resolved={resolved} />
      </Section>

      {handingOff && (
        <HandOff
          scan={scan}
          overrides={overrides}
          colorMap={colorMap}
          onClose={() => setHandingOff(false)}
        />
      )}
    </div>
  );
}
