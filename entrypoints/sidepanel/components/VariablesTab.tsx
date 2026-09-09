import { useCallback, useMemo, useState } from 'react';
import type { ScanResult } from '@/shared/types';
import type { BrandConfig, Mode, ScaleRole, TypeRole, TypeRoleName } from '@/studio/engine/types';
import { regrid } from '@/studio/edits';
import { critique } from '@/studio/critique';
import type { DesignModel } from '../lib/designModel';
import type { ReskinResult } from '../lib/messaging';
import { Section } from './design/Section';
import { PageVariablesSection } from './design/PageVariablesSection';
import { ObservedColoursSection } from './design/ObservedColoursSection';
import { ColourSection } from './design/ColourSection';
import { TypeSection } from './design/TypeSection';
import { SpaceSection } from './design/SpaceSection';
import { CritiqueSection } from './design/CritiqueSection';

type SectionKey = 'vars' | 'colours' | 'palette' | 'type' | 'space' | 'critique';

/**
 * The variables this page runs on, editable.
 *
 * It leads with the page's own: the custom properties its stylesheets define,
 * under the names it gave them, and the colours it paints with whether it
 * named them or not. Below them, the system the panel derived — three seeds
 * and their ramps, the type ladder, the grid — which is the lever for moving
 * many of those at once. Everything here repaints the page as you type, when
 * the switch at the top is on.
 *
 * The edit itself lives in the session store, not here: leaving this tab must
 * not discard it or un-paint the page.
 */
export function VariablesTab({
  scan,
  model,
  mode,
  live,
  reskin,
  darkVia,
  varOverrides,
  colorEdits,
  onLiveChange,
  onConfigChange,
  onResetAll,
  onVar,
  onColor,
}: {
  scan: ScanResult;
  model: DesignModel;
  mode: Mode;
  live: boolean;
  reskin: ReskinResult | null;
  darkVia: 'site' | 'mirror' | null;
  varOverrides: Record<string, string>;
  colorEdits: Record<string, string>;
  onLiveChange: (live: boolean) => void;
  onConfigChange: (config: BrandConfig | null) => void;
  /** Every override, including element edits, back to what the page reads. */
  onResetAll: () => void;
  onVar: (name: string, value: string | null) => void;
  onColor: (hex: string, value: string | null) => void;
}) {
  // All open. A collapsed section with a summary reads as a fact rather
  // than a door, which is exactly how the editable type ladder went unnoticed.
  const [open, setOpen] = useState<Set<SectionKey>>(
    new Set<SectionKey>(['vars', 'colours', 'palette', 'type', 'space']),
  );
  const { brand, resolved, edited, dirty } = model;
  // Against the page as read, not as edited: the edit is your answer to it.
  const review = useMemo(() => critique(scan, model.seeded), [scan, model.seeded]);

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

  const setSpacingBase = useCallback(
    (basePx: number) => patch({ spacing: regrid(brand.spacing, basePx) }),
    [brand, patch],
  );

  const setRadiusBase = useCallback(
    (basePx: number) => patch({ radius: { ...brand.radius, basePx, concentric: basePx > 0 } }),
    [brand, patch],
  );

  const setSeed = useCallback(
    (role: ScaleRole, seed: string) =>
      patch({
        color: {
          ...brand.color,
          scales: brand.color.scales.map((s) => (s.role === role ? { ...s, seed } : s)),
        },
      }),
    [brand, patch],
  );

  const manualVars = Object.keys(varOverrides).length;
  const manualColours = Object.keys(colorEdits).length;
  const painted = reskin ? reskin.vars + reskin.rules : 0;
  const rulesLive = (reskin?.rules ?? 0) > 0 && model.lengthMap !== null;

  const darkNote =
    darkVia === 'site' ? "previewing the page's own dark mode" : 'previewing dark — mirrored from the ramps';
  const status = !dirty
    ? mode === 'dark' && live
      ? `${darkNote} — nothing changed yet`
      : 'read from this page — nothing changed yet'
    : !live
      ? 'edited · page untouched'
      : reskin === null
        ? 'edited'
        : painted === 0
          ? 'this page holds none of this where it can be repainted — it goes in the brief'
          : `${reskin.vars} ${reskin.vars === 1 ? 'variable' : 'variables'} · ${reskin.rules} ${
              reskin.rules === 1 ? 'rule' : 'rules'
            } live on the page`;

  return (
    <div className="relative flex flex-col">
      <div
        className={`flex items-center gap-2 border-b px-3 py-2 text-xs ${
          live && dirty ? 'border-accent/40 bg-accent-soft' : 'border-line-subtle'
        }`}
      >
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5">
          <button
            role="switch"
            aria-checked={live}
            onClick={() => onLiveChange(!live)}
            className={`flex h-4 w-7 shrink-0 items-center rounded-full border px-0.5 ${
              live ? 'justify-end border-accent bg-accent' : 'justify-start border-line bg-surface-control'
            }`}
            title={live ? 'Stop repainting the page as you edit' : 'Repaint the page as you edit'}
          >
            <span className="h-3 w-3 rounded-full bg-surface-panel" />
          </button>
          <span className={live ? 'text-ink' : 'text-ink-muted'}>Preview on page</span>
        </label>
        <span className={`min-w-0 flex-1 truncate ${live && dirty ? 'text-accent' : 'text-ink-muted'}`} title={status}>
          {status}
        </span>
        {(dirty || mode === 'dark') && (
          <button
            onClick={onResetAll}
            className="shrink-0 rounded-control border border-accent px-2 py-0.5 text-2xs font-medium text-accent hover:bg-accent-soft"
            title="Take back every override — variables, colours, scale, element edits — the dark preview and the viewport preset. Notes stay. Also on the bar."
          >
            Reset all
          </button>
        )}
      </div>

      {scan.customProps.length > 0 && (
        <Section
          title="Page variables"
          summary={`${scan.customProps.length} on this page${manualVars ? ` · ${manualVars} set by hand` : ''}`}
          open={open.has('vars')}
          onToggle={() => toggle('vars')}
        >
          <PageVariablesSection
            scan={scan}
            engine={model.paint.overrides}
            mode={mode}
            varOverrides={varOverrides}
            onVar={onVar}
          />
        </Section>
      )}

      {scan.colors.length > 0 && (
        <Section
          title="Colours on the page"
          summary={`${scan.colors.length} seen${manualColours ? ` · ${manualColours} set by hand` : ''}`}
          open={open.has('colours')}
          onToggle={() => toggle('colours')}
        >
          <ObservedColoursSection
            colors={scan.colors}
            engine={model.paint.colorMap}
            mode={mode}
            colorEdits={colorEdits}
            onColor={onColor}
          />
        </Section>
      )}

      <Section
        title="Palette"
        summary={`3 seeds · ${brand.color.scales.length} ramps${edited ? ' · edited' : ''}`}
        open={open.has('palette')}
        onToggle={() => toggle('palette')}
      >
        <ColourSection config={brand} resolved={resolved} mode={mode} onSeedChange={setSeed} />
      </Section>

      <Section
        title="Type"
        summary={`${scan.fontUsage[0]?.family ?? 'none'} · ${brand.typography.roles.length} steps${
          rulesLive ? ' · live on page' : ''
        }`}
        open={open.has('type')}
        onToggle={() => toggle('type')}
      >
        <TypeSection scan={scan} config={brand} onRoleChange={setRole} />
      </Section>

      <Section
        title="Space & shape"
        summary={`${brand.spacing.basePx}px grid · r${brand.radius.basePx}${rulesLive ? ' · live on page' : ''}`}
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

      <Section
        title="Critique"
        summary={review.summary}
        open={open.has('critique')}
        onToggle={() => toggle('critique')}
      >
        <CritiqueSection critique={review} />
      </Section>
    </div>
  );
}
