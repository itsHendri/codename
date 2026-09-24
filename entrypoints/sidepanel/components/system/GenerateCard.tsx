import { useEffect, useState } from 'react';
import type { EntryStylesheet } from '@/shared/protocol';
import type { ScanResult } from '@/shared/types';
import type { BrandConfig } from '@/studio/engine/types';
import { adoptionPlan, generateConfig, inputsFromScan, proposalCss, tokensPathFor, type GenerateInputs } from '@/studio/generate';
import { download } from '@/studio/download';
import { NAMED_RATIOS, ratioName } from '@/studio/typeScale';
import type { DesignModel } from '../../lib/designModel';
import { createTokensFile, entryStylesheet, useBridge } from '../../lib/bridge';
import { allow, setProposal, updateSession, useSession } from '../../lib/session';
import { ColorField } from '../inspect/ColorField';
import { NumberField } from '../inspect/NumberField';

/**
 * A system for a page that has none, generated from what the page suggests
 * and previewed on it. The one place the engine's own vocabulary enters the
 * panel: seeds, a ratio, a grid. Every input starts as an observation of
 * the page — its brand red, its body size, the ratio its sizes are nearest
 * — never as a preset. The proposal paints the live page through the
 * ordinary re-skin plus a sheet that defines the new names; writing it in
 * is one new file and one import line, which the bridge does with its own
 * consent; turning the page's literals into the tokens is the agent's,
 * from the brief, because each one is a judgement.
 */
export function GenerateCard({
  scan,
  model,
  local,
  onClose,
}: {
  scan: ScanResult;
  model: DesignModel;
  /** The page is served from this machine, so a write to the project is about it. */
  local: boolean;
  onClose: () => void;
}) {
  const { proposal, proposalFile, bridgeMayCreate } = useSession();
  const bridge = useBridge();
  const inputs = proposal ?? inputsFromScan(scan, model.seeded);
  const [entry, setEntry] = useState<EntryStylesheet | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const canWrite = !!bridge.project && local;

  useEffect(() => {
    if (!canWrite) return;
    let live = true;
    entryStylesheet()
      .then((e) => live && setEntry(e))
      .catch(() => live && setEntry(null));
    return () => {
      live = false;
    };
  }, [canWrite]);

  const apply = (next: GenerateInputs) => setProposal(next, generateConfig(model.seeded, next));
  const set = (patch: Partial<GenerateInputs>) => apply({ ...inputs, ...patch });
  const plan = proposal ? adoptionPlan(scan, model.resolved) : [];
  const path = tokensPathFor(entry?.file);

  const write = async () => {
    setError(null);
    try {
      const created = await createTokensFile(path, proposalCss(model.resolved), entry?.file);
      updateSession({ proposalFile: created });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const num = (label: string, key: 'baseSizePx' | 'spacingBasePx' | 'radiusBasePx', min: number, max: number) => (
    <label className="flex items-center gap-2">
      <span className="subhead w-16 shrink-0">{label}</span>
      <NumberField
        value={`${inputs[key]}px`}
        ariaLabel={label}
        className="w-16"
        onChange={(v) => {
          const px = parseFloat(v);
          if (Number.isFinite(px) && px >= min && px <= max) set({ [key]: px });
        }}
      />
    </label>
  );

  return (
    <div className="flex flex-col gap-3 border-b border-line-subtle bg-surface-field/40 px-3 py-3" data-testid="generate">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-ink">Generate a system</div>
          <p className="text-2xs text-ink-muted">
            {proposal
              ? `Previewing on the page: ramps from the seeds, roles on a ${ratioName(inputs.ratio) ?? inputs.ratio} scale, a ${inputs.spacingBasePx}px grid. Nothing is in the project until it is written.`
              : `This page defines ${scan.customProps.length} ${scan.customProps.length === 1 ? 'variable' : 'variables'} and ${scan.typeStyles?.length ?? 0} type ${scan.typeStyles?.length === 1 ? 'style' : 'styles'}. The inputs below are read from it; generate to preview a system on the live page.`}
          </p>
        </div>
        <button onClick={onClose} className="btn btn-sm btn-secondary shrink-0" aria-label="Close Generate">
          ×
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <label className="flex flex-col gap-1">
          <span className="subhead">Seed</span>
          <ColorField value={inputs.seed} ariaLabel="Seed colour" onChange={(v) => set({ seed: v })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="subhead">Neutral</span>
          <ColorField value={inputs.neutral} ariaLabel="Neutral colour" onChange={(v) => set({ neutral: v })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="subhead">Sans</span>
          <input value={inputs.sans} onChange={(e) => set({ sans: e.target.value })} aria-label="Sans family" className="field h-6 px-1.5 font-mono text-2xs" spellCheck={false} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="subhead">Mono</span>
          <input value={inputs.mono} onChange={(e) => set({ mono: e.target.value })} aria-label="Mono family" className="field h-6 px-1.5 font-mono text-2xs" spellCheck={false} />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {num('Body', 'baseSizePx', 10, 24)}
        <label className="flex items-center gap-2">
          <span className="subhead">Ratio</span>
          <select value={String(inputs.ratio)} onChange={(e) => set({ ratio: parseFloat(e.target.value) })} aria-label="Type ratio" className="field h-6 px-1 text-2xs">
            {!NAMED_RATIOS.some((r) => r.ratio === inputs.ratio) && <option value={String(inputs.ratio)}>{inputs.ratio} (from the page)</option>}
            {NAMED_RATIOS.map((r) => (
              <option key={r.ratio} value={String(r.ratio)}>
                {r.ratio} {r.name}
              </option>
            ))}
          </select>
        </label>
        {num('Grid', 'spacingBasePx', 1, 32)}
        {num('Radius', 'radiusBasePx', 0, 64)}
        <label className="flex items-center gap-2">
          <span className="subhead">Shadows</span>
          <select value={inputs.shadows} onChange={(e) => set({ shadows: e.target.value as GenerateInputs['shadows'] })} aria-label="Shadows" className="field h-6 px-1 text-2xs">
            <option value="soft">layered, soft</option>
            <option value="observed">as the page paints them</option>
          </select>
        </label>
      </div>

      {!proposal ? (
        <div>
          <button onClick={() => apply(inputs)} className="btn btn-sm btn-accent" title="Generate ramps, roles and a grid from these inputs and preview them on the page">
            Generate from this page
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {plan.length > 0 && (
            <div className="text-2xs text-ink-muted">
              <span className="text-ink-secondary">{plan.length} {plan.length === 1 ? 'literal' : 'literals'} to adopt</span> — in the brief for the agent:{' '}
              {plan
                .slice(0, 4)
                .map((a) => `${a.literal} → ${a.token.replace(/^var\(|\)$/g, '')}${a.exact ? '' : ' (near)'}`)
                .join(', ')}
              {plan.length > 4 ? ', …' : ''}
            </div>
          )}
          {proposalFile ? (
            <p className="text-2xs text-ink-secondary">
              Written to <code className="font-mono">{proposalFile.file}</code>
              {proposalFile.importedFrom ? (
                <>
                  , imported from <code className="font-mono">{proposalFile.importedFrom}</code>
                </>
              ) : null}
              . Reload the page to read it as its own.
            </p>
          ) : canWrite ? (
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-2xs text-ink-muted" title="One new file and one import line, nothing else. The literals are the agent's.">
                <input type="checkbox" checked={bridgeMayCreate} onChange={(e) => allow('bridgeMayCreate', e.target.checked)} />
                <span>
                  Bridge may add <code className="font-mono">{path}</code> to {bridge.project!.name}
                  {entry ? (
                    <>
                      {' '}
                      and import it from <code className="font-mono">{entry.file}</code>
                    </>
                  ) : entry === null ? (
                    ' (no entry stylesheet found; the import is yours to add)'
                  ) : null}
                </span>
              </label>
              <div className="flex items-center gap-2">
                <button onClick={() => void write()} disabled={!bridgeMayCreate} className="btn btn-sm btn-accent" title={bridgeMayCreate ? `Write ${path}` : 'Allow the bridge to add the file first'}>
                  Write {path}
                </button>
                <button onClick={() => download('tokens.css', proposalCss(model.resolved), 'text/css')} className="btn btn-sm btn-secondary">
                  Download tokens.css
                </button>
                <button onClick={() => setProposal(null, null)} className="btn btn-sm btn-secondary ml-auto">
                  Discard
                </button>
              </div>
              {error && <p className="text-2xs text-warn-ink">{error}</p>}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => download('tokens.css', proposalCss(model.resolved), 'text/css')} className="btn btn-sm btn-accent">
                Download tokens.css
              </button>
              <span className="text-2xs text-ink-muted">{bridge.project ? 'This page is not served from the project, so nothing is written to it.' : 'Pair a bridge on Changes to write it into the project.'}</span>
              <button onClick={() => setProposal(null, null)} className="btn btn-sm btn-secondary ml-auto">
                Discard
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export type { BrandConfig };
