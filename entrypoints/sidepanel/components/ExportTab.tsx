import { useMemo, useState } from 'react';
import type { ScanResult } from '@/shared/types';
import type { ResolvedTokens } from '@/studio/engine/types';
import { buildExport, exportBudget } from '@/studio/export/bundle';
import { downloadBundle } from '@/studio/download';
import {
  buildBrandMd,
  buildTokensJson,
  consistencyStats,
  download,
  type ExportSections,
} from '../lib/exporters';

const ALL_SECTIONS: ExportSections = {
  colors: true,
  typography: true,
  spacing: true,
  shadows: true,
  rawVars: true,
};

type PresetKey = 'ai' | 'style-dictionary' | 'system' | 'full' | 'custom';

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'ai', label: 'AI agent · brand.md' },
  { key: 'system', label: 'Design system' },
  { key: 'style-dictionary', label: 'Style Dictionary' },
  { key: 'full', label: 'Full report' },
  { key: 'custom', label: 'Custom…' },
];

export function ExportTab({
  scan,
  hostname,
  resolved,
}: {
  scan: ScanResult;
  hostname: string;
  /** The system as edited in the Design tab; the generated files come from it. */
  resolved: ResolvedTokens | null;
}) {
  const [preset, setPreset] = useState<PresetKey>('ai');
  const [sections, setSections] = useState<ExportSections>({ ...ALL_SECTIONS, rawVars: false });
  const [showReport, setShowReport] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const stats = useMemo(() => consistencyStats(scan), [scan]);
  const effectiveSections = preset === 'custom' ? sections : ALL_SECTIONS;

  const flash = (what: string) => {
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  };

  const brandMd = () => buildBrandMd(scan, effectiveSections);
  const files = useMemo(() => (resolved ? buildExport(resolved) : []), [resolved]);
  const file = (path: string) => files.find((f) => f.path === path)?.content ?? '';
  const budget = useMemo(() => (files.length ? exportBudget(files) : null), [files]);
  const slug = resolved?.config.meta.slug ?? hostname;
  const tokensJson = () => {
    try {
      return buildTokensJson(scan);
    } catch (err) {
      return JSON.stringify({ error: `Token extraction failed: ${err}` }, null, 2);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3.5">
      {scan.unreadableSheets.length > 0 && (
        <p className="rounded-control border border-warn bg-warn-soft px-2.5 py-1.5 text-xs text-warn-ink">
          {scan.unreadableSheets.length} cross-origin stylesheet(s) couldn&apos;t be read — this export may be
          partial.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <div className="text-sm text-ink-muted">Preset</div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`rounded-full border px-3 py-0.5 text-sm ${
                preset === p.key
                  ? 'border-accent bg-accent-soft text-accent'
                  : p.key === 'custom'
                    ? 'border-dashed border-line text-ink-muted'
                    : 'border-line text-ink-secondary'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex flex-wrap gap-2.5 rounded-control border border-dashed border-line p-2 text-sm">
            {(Object.keys(sections) as (keyof ExportSections)[]).map((key) => (
              <label key={key} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={sections[key]}
                  onChange={(e) => setSections({ ...sections, [key]: e.target.checked })}
                />
                {key === 'rawVars' ? 'raw CSS vars' : key}
              </label>
            ))}
          </div>
        )}
      </div>

      {(preset === 'ai' || preset === 'full' || preset === 'custom') && (
        <ExportCard
          title="brand.md"
          accent
          description="Readable style guide: palette, type roles, scale, naming. Made for pasting into Claude / Cursor as project context."
          onDownload={() => download('brand.md', brandMd(), 'text/markdown')}
          onCopy={() => navigator.clipboard.writeText(brandMd()).then(() => flash('brand.md'))}
          copied={copied === 'brand.md'}
        />
      )}

      {(preset === 'style-dictionary' || preset === 'full' || preset === 'custom') && (
        <ExportCard
          title="tokens.json"
          description="W3C design tokens — drops into Style Dictionary, Tokens Studio, Figma variables."
          onDownload={() => download('tokens.json', tokensJson(), 'application/json')}
          onCopy={() => navigator.clipboard.writeText(tokensJson()).then(() => flash('tokens.json'))}
          copied={copied === 'tokens.json'}
        />
      )}

      {(preset === 'system' || preset === 'full') && resolved && (
        <>
          <ExportCard
            title="tokens.css"
            description="The edited system as CSS custom properties, light and dark, with a Tailwind v4 @theme block."
            onDownload={() => download('tokens.css', file('tokens.css'), 'text/css')}
            onCopy={() => navigator.clipboard.writeText(file('tokens.css')).then(() => flash('tokens.css'))}
            copied={copied === 'tokens.css'}
          />
          <ExportCard
            title="SKILL.md"
            description={`An agent skill with the full DESIGN_SYSTEM.md reference behind it${
              budget ? ` · ~${(budget.tokens / 1000).toFixed(1)}k tokens${budget.overBudget ? ', over the doc budget' : ''}` : ''
            }.`}
            onDownload={() => download('SKILL.md', file('skill/SKILL.md'), 'text/markdown')}
            onCopy={() =>
              navigator.clipboard.writeText(file('skill/references/DESIGN_SYSTEM.md')).then(() => flash('system'))
            }
            copied={copied === 'system'}
            copyLabel="Copy DESIGN_SYSTEM.md"
          />
          <ExportCard
            title="preview.html"
            description="A standalone style guide page for the edited system. Open it, send it to anyone."
            onDownload={() => download('preview.html', file('preview.html'), 'text/html')}
            onCopy={() => navigator.clipboard.writeText(file('preview.html')).then(() => flash('preview'))}
            copied={copied === 'preview'}
          />
          <button
            onClick={() => downloadBundle(files, slug)}
            className="rounded-control border border-line-strong bg-surface-control px-3.5 py-1.5 text-sm font-medium hover:bg-surface-raised"
          >
            Download everything as a ZIP ({files.length} files)
          </button>
        </>
      )}

      <div className="rounded-card border border-line p-3">
        <div className="font-medium">Consistency report</div>
        <p className="mt-1 text-sm text-ink-muted">
          {stats.colorCount} colors ({stats.grayCount} grays), {stats.fontFamilyCount} font families,{' '}
          {stats.fontSizeCount} font sizes, {stats.gradientCount} gradients on this page.
        </p>
        <button
          onClick={() => setShowReport(!showReport)}
          className="mt-2 rounded-control border border-line px-3 py-1 text-sm hover:bg-surface-recessed"
        >
          {showReport ? 'Hide details' : 'View report'}
        </button>
        {showReport && (
          <div className="mt-2 max-h-48 overflow-y-auto rounded bg-surface-recessed p-2 text-xs text-ink-secondary">
            <div className="mb-1 font-medium text-ink-secondary">Custom properties ({scan.customProps.length})</div>
            {scan.customProps.slice(0, 40).map((p) => (
              <div key={p.name} className="truncate">
                <code>{p.name}</code>: {p.value}
              </div>
            ))}
            {scan.customProps.length > 40 && <div>… and {scan.customProps.length - 40} more</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function ExportCard({
  title,
  description,
  accent,
  onDownload,
  onCopy,
  copied,
  copyLabel = 'Copy',
}: {
  title: string;
  description: string;
  accent?: boolean;
  onDownload: () => void;
  onCopy: () => void;
  copied: boolean;
  copyLabel?: string;
}) {
  return (
    <div className={`rounded-card border p-3 ${accent ? 'border-accent bg-accent-soft' : 'border-line'}`}>
      <div className={`font-medium ${accent ? 'text-accent' : ''}`}>{title}</div>
      <p className="mt-0.5 text-sm text-ink-muted">{description}</p>
      <div className="mt-2 flex gap-2">
        <button
          onClick={onDownload}
          className={`rounded-control border px-3.5 py-1 text-sm font-medium ${
            accent
              ? 'border-accent bg-surface-panel text-accent hover:bg-accent-soft'
              : 'border-line-strong bg-surface-control hover:bg-surface-control'
          }`}
        >
          Download
        </button>
        <button
          onClick={onCopy}
          className={`rounded-control border px-3.5 py-1 text-sm ${
            accent ? 'border-accent text-accent' : 'border-line'
          }`}
        >
          {copied ? 'Copied ✓' : copyLabel}
        </button>
      </div>
    </div>
  );
}
