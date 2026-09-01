import { useMemo, useState } from 'react';
import type { ScanResult } from '@/shared/types';
import { seedBrandFromScan } from '@/studio/seedFromScan';
import { saveBrand } from '@/studio/storage';
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

type PresetKey = 'ai' | 'style-dictionary' | 'full' | 'custom';

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'ai', label: 'AI agent · brand.md' },
  { key: 'style-dictionary', label: 'Style Dictionary' },
  { key: 'full', label: 'Full report' },
  { key: 'custom', label: 'Custom…' },
];

export function ExportTab({ scan, hostname }: { scan: ScanResult; hostname: string }) {
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

  const forge = async () => {
    const brand = seedBrandFromScan(scan);
    await saveBrand(brand);
    await chrome.tabs.create({
      url: chrome.runtime.getURL(`studio.html?brand=${encodeURIComponent(brand.meta.slug)}`),
    });
  };

  const brandMd = () => buildBrandMd(scan, effectiveSections);
  const tokensJson = () => {
    try {
      return buildTokensJson(scan);
    } catch (err) {
      return JSON.stringify({ error: `Token extraction failed: ${err}` }, null, 2);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3.5">
      <div className="rounded-lg border border-gray-300 p-3">
        <div className="font-medium">Design system found on {hostname}</div>
        <div className="mt-2 grid grid-cols-4 gap-1.5 text-center text-[11px] text-gray-500">
          {[
            [scan.colors.length, 'colors'],
            [scan.fontUsage.length, 'fonts'],
            [scan.gradients.length, 'gradients'],
            [scan.customProps.length, 'variables'],
          ].map(([n, label]) => (
            <div key={label} className="rounded-md border border-gray-200 py-1.5">
              <div className="text-lg text-gray-800">{n}</div>
              {label}
            </div>
          ))}
        </div>
        {scan.unreadableSheets.length > 0 && (
          <p className="mt-2 text-[11px] text-amber-700">
            {scan.unreadableSheets.length} cross-origin stylesheet(s) unreadable — results may be partial.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-xs text-gray-500">Preset</div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`rounded-full border px-3 py-0.5 text-xs ${
                preset === p.key
                  ? 'border-blue-600 bg-blue-50 text-blue-600'
                  : p.key === 'custom'
                    ? 'border-dashed border-gray-400 text-gray-500'
                    : 'border-gray-400 text-gray-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex flex-wrap gap-2.5 rounded-md border border-dashed border-gray-300 p-2 text-xs">
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

      {/* Forge: the scan becomes an actual system, not just a document about one. */}
      <div className="rounded-lg border border-blue-600 bg-blue-50 p-3">
        <div className="flex gap-2.5">
          <svg className="mt-0.5 h-6 w-6 shrink-0 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 2 L21 12 L12 22 L3 12 Z" />
            <path d="M12 7 L17 12 L12 17 L7 12 Z" fill="currentColor" stroke="none" />
          </svg>
          <div className="flex flex-col gap-1.5">
            <div className="font-medium text-blue-700">Forge a system from this scan</div>
            <p className="text-xs text-gray-600">
              Turn these colours into OKLCH ramps and semantic tokens in Studio, measured for contrast and
              previewed on real UI.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={forge}
                className="rounded-md border border-blue-600 bg-white px-3.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100"
              >
                Open Studio →
              </button>
              <span className="text-[11px] text-gray-500">opens in a new tab</span>
            </div>
          </div>
        </div>
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

      <div className="rounded-lg border border-gray-300 p-3">
        <div className="font-medium">Consistency report</div>
        <p className="mt-1 text-xs text-gray-500">
          {stats.colorCount} colors ({stats.grayCount} grays), {stats.fontFamilyCount} font families,{' '}
          {stats.fontSizeCount} font sizes, {stats.gradientCount} gradients on this page.
        </p>
        <button
          onClick={() => setShowReport(!showReport)}
          className="mt-2 rounded-md border border-gray-400 px-3 py-1 text-xs hover:bg-gray-50"
        >
          {showReport ? 'Hide details' : 'View report'}
        </button>
        {showReport && (
          <div className="mt-2 max-h-48 overflow-y-auto rounded bg-gray-50 p-2 text-[11px] text-gray-600">
            <div className="mb-1 font-medium text-gray-700">Custom properties ({scan.customProps.length})</div>
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
}: {
  title: string;
  description: string;
  accent?: boolean;
  onDownload: () => void;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? 'border-blue-600 bg-blue-50' : 'border-gray-300'}`}>
      <div className={`font-medium ${accent ? 'text-blue-700' : ''}`}>{title}</div>
      <p className="mt-0.5 text-xs text-gray-500">{description}</p>
      <div className="mt-2 flex gap-2">
        <button
          onClick={onDownload}
          className={`rounded-md border px-3.5 py-1 text-xs font-medium ${
            accent
              ? 'border-blue-600 bg-white text-blue-600 hover:bg-blue-100'
              : 'border-gray-800 bg-gray-100 hover:bg-gray-200'
          }`}
        >
          Download
        </button>
        <button
          onClick={onCopy}
          className={`rounded-md border px-3.5 py-1 text-xs ${
            accent ? 'border-blue-600 text-blue-600' : 'border-gray-400'
          }`}
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
