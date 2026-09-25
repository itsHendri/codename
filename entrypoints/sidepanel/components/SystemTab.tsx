import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ScanResult } from '@/shared/types';
import type { BrandConfig, Mode, ScaleRole, Step } from '@/studio/engine/types';
import type { ColourLink } from '@/studio/systemMap';
import { regrid } from '@/studio/edits';
import { critique } from '@/studio/critique';
import { driftReport } from '@/studio/tokenFile';
import type { DesignModel } from '../lib/designModel';
import type { ReskinResult } from '../lib/messaging';
import type { InspectController } from '../lib/inspect';
import { active as activeChanges } from '@/studio/changes';
import { setStyleLock, useSession } from '../lib/session';
import { Section } from './system/Section';
import { TokensSection } from './system/TokensSection';
import { TokenFileSection } from './system/TokenFileSection';
import { SpaceSection } from './system/SpaceSection';
import { CritiqueSection } from './system/CritiqueSection';
import { TypeStyles } from './system/TypeStyles';
import { ExportSheet } from './system/ExportSheet';
import { ColourSection, rampsOnPage } from './system/ColourSection';
import { GenerateCard } from './system/GenerateCard';
import { isThin } from '@/studio/generate';

type SectionKey = 'colour' | 'type' | 'space' | 'tokens' | 'critique' | 'tokenFile';

/**
 * The system this page runs on, as one surface: its type styles and the
 * scale behind them, its spacing, radius and elevation, and its tokens by
 * scope — everything the page really defines, under the names it gave
 * them, editable and live. Export is an action here rather than a tab,
 * since the files are this same system written out.
 *
 * Only what the page holds appears. The engine's own vocabulary — ramps,
 * ninety semantic tokens — stays out of the panel until it is linked to a
 * page variable or generated for a page that has none.
 *
 * The edit lives in the session store, not here: leaving this tab must
 * not discard it or un-paint the page.
 */
export function SystemTab({
  scan,
  model,
  ctl,
  mode,
  live,
  reskin,
  darkVia,
  varOverrides,
  colorEdits,
  hostname,
  local,
  wide = false,
  open: openAction,
  onOpened,
  specimenHtml,
  onConfigChange,
  onResetAll,
  onVar,
  onDark,
  onColor,
  onLink,
  locks,
  onLock,
}: {
  scan: ScanResult;
  model: DesignModel;
  ctl: InspectController;
  mode: Mode;
  live: boolean;
  reskin: ReskinResult | null;
  darkVia: 'site' | 'mirror' | null;
  varOverrides: Record<string, string>;
  colorEdits: Record<string, string>;
  hostname: string;
  /** The page is served from this machine, so a write to the paired project is about it. */
  local: boolean;
  /** Over the canvas, in the Design System Manager: two columns, room for the tables. */
  wide?: boolean;
  /** An action asked for elsewhere (the rail's DSM column): open it, then say so. */
  open?: 'generate' | 'export' | null;
  onOpened?: () => void;
  /** The specimen as a page, read off the page while it is showing; for Export. */
  specimenHtml?: () => Promise<string | null>;
  onConfigChange: (config: BrandConfig | null) => void;
  /** Every override, including element edits, back to what the page reads. */
  onResetAll: () => void;
  onVar: (name: string, value: string | null) => void;
  /** A value set by hand on the page's dark side. */
  onDark: (name: string, value: string | null) => void;
  onColor: (hex: string, value: string | null) => void;
  /** Link a variable to a ramp step, unlink it (null), or forget the decision (undefined). */
  onLink: (name: string, link: ColourLink | null | undefined) => void;
  locks: string[];
  onLock: (name: string, locked: boolean) => void;
}) {
  // All open but the audits. A collapsed section with a summary reads as a
  // fact rather than a door, which is how the editable type ladder went unnoticed.
  const [open, setOpen] = useState<Set<SectionKey>>(new Set<SectionKey>(['colour', 'type', 'space', 'tokens']));
  const [exporting, setExporting] = useState(false);
  const { brand, resolved, dirty } = model;
  const { tokenFile, styleLocks, darkVarOverrides, proposal } = useSession();
  // Open on its own for a page with too little to show; a door otherwise.
  const [generating, setGenerating] = useState(() => isThin(scan));
  const showGenerate = generating || proposal !== null;
  useEffect(() => {
    if (!openAction) return;
    if (openAction === 'generate') setGenerating(true);
    else setExporting(true);
    onOpened?.();
  }, [openAction, onOpened]);
  const styles = scan.typeStyles ?? [];
  // Against the page as read, not as edited: the edit is your answer to it.
  const review = useMemo(() => critique(scan, model.seeded), [scan, model.seeded]);
  const wantDrift = tokenFile && open.has('tokenFile');
  const drift = useMemo(() => (wantDrift ? driftReport(scan, tokenFile.tokens, tokenFile.name) : null), [wantDrift, scan, tokenFile]);

  const toggle = (key: SectionKey) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const patch = useCallback((next: Partial<BrandConfig>) => onConfigChange({ ...brand, ...next }), [brand, onConfigChange]);
  const setSpacingBase = useCallback((basePx: number) => patch({ spacing: regrid(brand.spacing, basePx) }), [brand, patch]);
  const setRadiusBase = useCallback(
    (basePx: number) => patch({ radius: { ...brand.radius, basePx, concentric: basePx > 0 } }),
    [brand, patch],
  );
  const setSeed = useCallback(
    (role: ScaleRole, seed: string) =>
      patch({ color: { ...brand.color, scales: brand.color.scales.map((s) => (s.role === role ? { ...s, seed } : s)) } }),
    [brand, patch],
  );
  const setPin = useCallback(
    (role: ScaleRole, step: Step, hex: string | null) =>
      patch({
        color: {
          ...brand.color,
          scales: brand.color.scales.map((s) => {
            if (s.role !== role) return s;
            const light = { ...s.overrides?.light };
            if (hex) light[step] = hex;
            else delete light[step];
            return { ...s, overrides: { ...s.overrides, light } };
          }),
        },
      }),
    [brand, patch],
  );
  const ramps = rampsOnPage(brand, model.links, scan.customProps);
  const linked = Object.values(model.links).filter(Boolean).length;

  const manualVars = Object.keys(varOverrides).length;
  const manualColours = Object.keys(colorEdits).length;
  const painted = reskin ? reskin.vars + reskin.rules : 0;
  const rulesLive = (reskin?.rules ?? 0) > 0 && model.lengthMap !== null;
  const warnings = review.findings.filter((f) => f.level !== 'note').length;

  // A style edited from here on a literal is a rule edit, which lives in the
  // log with the element edits; it is a change all the same.
  const ruleEdits = activeChanges(ctl.log).length;
  const darkNote = darkVia === 'site' ? "previewing the page's own dark mode" : 'previewing dark — mirrored from the ramps';
  const status = !dirty
    ? ruleEdits
      ? `${ruleEdits} ${ruleEdits === 1 ? 'rule edited' : 'rules edited'} — in Changes`
      : mode === 'dark' && live
        ? `${darkNote} — nothing changed yet`
        : 'read from this page — nothing changed yet'
    : !live
      ? 'edited · page untouched'
      : reskin === null
        ? 'edited'
        : painted === 0
          ? 'this page holds none of this where it can be repainted — it goes in the brief'
          : `${reskin.vars} ${reskin.vars === 1 ? 'variable' : 'variables'} · ${reskin.rules} ${reskin.rules === 1 ? 'rule' : 'rules'} live on the page`;

  return (
    <div className={`relative flex flex-col ${wide ? 'mx-auto w-full max-w-[1200px]' : ''}`}>
      <div className={`flex items-center gap-2 border-b px-3 py-2 text-xs ${live && dirty ? 'border-accent/40 bg-accent-soft' : 'border-line-subtle'}`}>
        {/* Announced: an edit elsewhere changes this line, and a screen reader should hear it. */}
        <span role="status" className={`min-w-0 flex-1 truncate ${live && dirty ? 'text-accent' : 'text-ink-muted'}`} title={status}>
          {status}
        </span>
        {(dirty || mode === 'dark') && (
          <button
            onClick={onResetAll}
            className="btn btn-sm btn-accent shrink-0"
            title="Take back every override — variables, colours, scale, element edits — the dark preview and the viewport preset. Notes stay. Also on the bar."
          >
            Reset all
          </button>
        )}
        <button
          onClick={() => setGenerating((v) => !v)}
          aria-pressed={showGenerate}
          className={`btn btn-sm shrink-0 ${showGenerate ? 'btn-accent' : 'btn-secondary'}`}
          title="Generate a system for this page from seeds, a ratio and a grid, previewed on the page and written into the project"
        >
          Generate
        </button>
        <button
          onClick={() => setExporting((v) => !v)}
          aria-pressed={exporting}
          className={`btn btn-sm shrink-0 ${exporting ? 'btn-accent' : 'btn-secondary'}`}
          title="The system as files: tokens.css, tokens.json, a ZIP"
        >
          Export
        </button>
      </div>

      {showGenerate && <GenerateCard scan={scan} model={model} local={local} onClose={() => setGenerating(false)} />}

      {exporting && (
        <ExportSheet
          resolved={resolved}
          slug={resolved.config.meta.slug || hostname}
          page={{ site: scan.url, scannedAt: scan.scannedAt, typeStyles: styles, links: model.links, critique: review }}
          specimen={specimenHtml}
          onClose={() => setExporting(false)}
        />
      )}

      {wide ? (
        // Two columns: colour, space and the audits on the left; the long tables on the right.
        <div className="grid grid-cols-2 items-start gap-x-6">
          <div className="min-w-0">
      <Section
        id="dsm-colour"
        title="Colour"
        summary={`${ramps.length} ${ramps.length === 1 ? 'ramp' : 'ramps'} · ${linked} linked${model.ambiguous.length ? ` · ${model.ambiguous.length} to decide` : ''}`}
        open={open.has('colour')}
        onToggle={() => toggle('colour')}
      >
        <ColourSection brand={brand} resolved={resolved} mode={mode} links={model.links} props={scan.customProps} onSeed={setSeed} onPin={setPin} />
      </Section>

      <Section
        id="dsm-space"
        title="Space & shape"
        summary={`${brand.spacing.basePx}px grid · r${brand.radius.basePx}${rulesLive ? ' · live on page' : ''}`}
        open={open.has('space')}
        onToggle={() => toggle('space')}
      >
        <SpaceSection scan={scan} config={brand} resolved={resolved} onSpacingBase={setSpacingBase} onRadiusBase={setRadiusBase} />
      </Section>

      <Section
        id="dsm-critique"
        title="Critique"
        summary={warnings ? `${warnings} to look at` : review.summary}
        open={open.has('critique')}
        onToggle={() => toggle('critique')}
      >
        <CritiqueSection critique={review} />
      </Section>

      <Section
        id="dsm-tokenFile"
        title="Token file"
        summary={tokenFile ? `${tokenFile.name}${drift ? ` · ${drift.summary}` : ''}` : 'compare with a file'}
        open={open.has('tokenFile')}
        onToggle={() => toggle('tokenFile')}
      >
        <TokenFileSection report={drift} />
      </Section>
          </div>
          <div className="min-w-0 border-l border-line-subtle pl-6">
      <Section
        id="dsm-type"
        title="Type"
        summary={`${styles.length} ${styles.length === 1 ? 'style' : 'styles'} · ${scan.fontUsage[0]?.family ?? 'no font read'}`}
        open={open.has('type')}
        onToggle={() => toggle('type')}
      >
        <TypeStyles
          scan={scan}
          styles={styles}
          varOverrides={varOverrides}
          locks={locks}
          styleLocks={styleLocks}
          log={ctl.log}
          onVar={onVar}
          onStyleLock={setStyleLock}
          changeMany={ctl.changeMany}
        />
      </Section>

      <Section
        id="dsm-tokens"
        title="Tokens"
        summary={`${scan.customProps.length} on this page${manualVars ? ` · ${manualVars} set by hand` : ''}${manualColours ? ` · ${manualColours} literals by hand` : ''}`}
        open={open.has('tokens')}
        onToggle={() => toggle('tokens')}
      >
        <TokensSection
          scan={scan}
          engine={model.paint.overrides}
          colorMap={model.paint.colorMap}
          mode={mode}
          varOverrides={varOverrides}
          darkVarOverrides={darkVarOverrides}
          colorEdits={colorEdits}
          locks={locks}
          links={model.links}
          ambiguous={model.ambiguous}
          resolved={resolved}
          onVar={onVar}
          onDark={onDark}
          onColor={onColor}
          onLock={onLock}
          onLink={onLink}
        />
      </Section>

          </div>
        </div>
      ) : (
        <>
      <Section
        id="dsm-colour"
        title="Colour"
        summary={`${ramps.length} ${ramps.length === 1 ? 'ramp' : 'ramps'} · ${linked} linked${model.ambiguous.length ? ` · ${model.ambiguous.length} to decide` : ''}`}
        open={open.has('colour')}
        onToggle={() => toggle('colour')}
      >
        <ColourSection brand={brand} resolved={resolved} mode={mode} links={model.links} props={scan.customProps} onSeed={setSeed} onPin={setPin} />
      </Section>

      <Section
        id="dsm-type"
        title="Type"
        summary={`${styles.length} ${styles.length === 1 ? 'style' : 'styles'} · ${scan.fontUsage[0]?.family ?? 'no font read'}`}
        open={open.has('type')}
        onToggle={() => toggle('type')}
      >
        <TypeStyles
          scan={scan}
          styles={styles}
          varOverrides={varOverrides}
          locks={locks}
          styleLocks={styleLocks}
          log={ctl.log}
          onVar={onVar}
          onStyleLock={setStyleLock}
          changeMany={ctl.changeMany}
        />
      </Section>

      <Section
        id="dsm-space"
        title="Space & shape"
        summary={`${brand.spacing.basePx}px grid · r${brand.radius.basePx}${rulesLive ? ' · live on page' : ''}`}
        open={open.has('space')}
        onToggle={() => toggle('space')}
      >
        <SpaceSection scan={scan} config={brand} resolved={resolved} onSpacingBase={setSpacingBase} onRadiusBase={setRadiusBase} />
      </Section>

      <Section
        id="dsm-tokens"
        title="Tokens"
        summary={`${scan.customProps.length} on this page${manualVars ? ` · ${manualVars} set by hand` : ''}${manualColours ? ` · ${manualColours} literals by hand` : ''}`}
        open={open.has('tokens')}
        onToggle={() => toggle('tokens')}
      >
        <TokensSection
          scan={scan}
          engine={model.paint.overrides}
          colorMap={model.paint.colorMap}
          mode={mode}
          varOverrides={varOverrides}
          darkVarOverrides={darkVarOverrides}
          colorEdits={colorEdits}
          locks={locks}
          links={model.links}
          ambiguous={model.ambiguous}
          resolved={resolved}
          onVar={onVar}
          onDark={onDark}
          onColor={onColor}
          onLock={onLock}
          onLink={onLink}
        />
      </Section>

      <Section
        id="dsm-critique"
        title="Critique"
        summary={warnings ? `${warnings} to look at` : review.summary}
        open={open.has('critique')}
        onToggle={() => toggle('critique')}
      >
        <CritiqueSection critique={review} />
      </Section>

      <Section
        id="dsm-tokenFile"
        title="Token file"
        summary={tokenFile ? `${tokenFile.name}${drift ? ` · ${drift.summary}` : ''}` : 'compare with a file'}
        open={open.has('tokenFile')}
        onToggle={() => toggle('tokenFile')}
      >
        <TokenFileSection report={drift} />
      </Section>
        </>
      )}
    </div>
  );
}
