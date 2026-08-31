import { useEffect, useState } from 'react';
import type { ScanResult } from '@/shared/types';
import { colorFormats, contrastBadge, nearestColorName } from '../lib/color';
import { EyeDropperIcon } from './icons';

declare global {
  interface Window {
    EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> };
  }
}

type Format = 'hex' | 'rgb' | 'hsl' | 'oklch';

function formatColor(hex: string, format: Format): string {
  return colorFormats(hex)[format];
}

function SwatchCard({ hex, varName, format }: { hex: string; varName?: string; format: Format }) {
  const value = formatColor(hex, format);
  const label = varName ?? nearestColorName(hex);
  return (
    <button
      onClick={() => navigator.clipboard.writeText(value)}
      className="group flex flex-col gap-0.5 text-left"
      title={varName ? `${varName} — copy ${value}` : `Copy ${value}`}
    >
      <span className="h-9 w-full rounded-md border border-gray-400" style={{ background: hex }} />
      <span className={`truncate text-[11px] ${varName ? 'font-medium text-blue-700' : ''}`}>{label}</span>
      <span className="truncate text-[10px] text-gray-400 group-hover:text-blue-600">
        {format === 'hex' ? hex : value}
      </span>
    </button>
  );
}

export function ColorsTab({ scan, onScan }: { scan: ScanResult | null; onScan: () => void }) {
  const [format, setFormat] = useState<Format>('hex');
  const [history, setHistory] = useState<string[]>([]);
  const [pickError, setPickError] = useState<string | null>(null);

  useEffect(() => {
    void chrome.storage.local.get('colorHistory').then((r) => setHistory((r.colorHistory as string[]) ?? []));
  }, []);

  const pick = async () => {
    setPickError(null);
    if (!window.EyeDropper) {
      setPickError('EyeDropper needs Chrome 95+.');
      return;
    }
    try {
      const { sRGBHex } = await new window.EyeDropper().open();
      const hex = sRGBHex.toUpperCase();
      await navigator.clipboard.writeText(formatColor(hex, format));
      const next = [hex, ...history.filter((h) => h !== hex)].slice(0, 12);
      setHistory(next);
      await chrome.storage.local.set({ colorHistory: next });
    } catch {
      // User cancelled the eyedropper.
    }
  };

  const groups = scan
    ? ([
        ['Text', scan.colors.filter((c) => c.usage.includes('text'))],
        ['Background', scan.colors.filter((c) => c.usage.includes('background') && !c.usage.includes('text'))],
        ['Border', scan.colors.filter((c) => c.usage.includes('border') && c.usage.length === 1)],
      ] as const)
    : [];

  return (
    <div className="flex flex-col gap-3 p-3.5">
      <div className="flex gap-2">
        <button
          onClick={pick}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-blue-600 bg-blue-50 py-2 font-medium text-blue-600 hover:bg-blue-100"
        >
          <EyeDropperIcon />
          Pick color
        </button>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as Format)}
          className="rounded-lg border border-gray-400 px-2 text-xs"
          aria-label="Color format"
        >
          <option value="hex">HEX</option>
          <option value="rgb">RGB</option>
          <option value="hsl">HSL</option>
          <option value="oklch">OKLCH</option>
        </select>
      </div>
      <p className="-mt-1.5 text-center text-[11px] text-gray-400">picks anywhere on screen · copies to clipboard</p>
      {pickError && <p className="text-center text-[11px] text-amber-700">{pickError}</p>}

      {history.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="w-[52px] text-xs text-gray-500">History</span>
          {history.slice(0, 9).map((hex) => (
            <button
              key={hex}
              title={`Copy ${formatColor(hex, format)}`}
              onClick={() => navigator.clipboard.writeText(formatColor(hex, format))}
              className="h-[18px] w-[18px] rounded-full border border-gray-500"
              style={{ background: hex }}
            />
          ))}
        </div>
      )}

      {!scan ? (
        <div className="flex flex-col items-center gap-2 border-t border-dashed border-gray-200 py-6">
          <p className="text-xs text-gray-500">Scan the page to extract its palette.</p>
          <button onClick={onScan} className="rounded-md border border-gray-800 px-4 py-1 text-xs hover:bg-gray-50">
            Scan this page
          </button>
        </div>
      ) : (
        <>
          <div className="border-t border-dashed border-gray-200 pt-2.5">
            <div className="flex items-baseline">
              <span className="font-medium">Page palette · {scan.colors.length}</span>
              <span className="ml-auto text-xs text-gray-400">grouped by usage · click to copy</span>
            </div>
          </div>

          {groups.map(([label, colors]) =>
            colors.length ? (
              <div key={label}>
                <div className="mb-1.5 text-xs text-gray-500">
                  {label} · computed in use
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {colors.slice(0, 6).map((c) => (
                    <SwatchCard key={c.hex} hex={c.hex} format={format} varName={c.varNames[0]} />
                  ))}
                  {colors.length > 6 && (
                    <div className="flex h-9 items-center justify-center rounded-md border border-dashed border-gray-400 text-xs text-gray-400">
                      +{colors.length - 6}
                    </div>
                  )}
                </div>
              </div>
            ) : null,
          )}

          {scan.gradients.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs text-gray-500">Gradients · {scan.gradients.length}</div>
              <div className="flex flex-col gap-1.5">
                {scan.gradients.slice(0, 3).map((g) => (
                  <button
                    key={g.css}
                    onClick={() => navigator.clipboard.writeText(g.css)}
                    title={`Copy ${g.css}`}
                    className="h-6 w-full rounded-md border border-gray-400"
                    style={{ backgroundImage: g.css }}
                  />
                ))}
              </div>
            </div>
          )}

          {scan.contrastPairs.length > 0 && (
            <div className="border-t border-dashed border-gray-200 pt-2.5">
              <div className="mb-1.5 font-medium">Contrast pairs — as they render</div>
              <div className="grid grid-cols-2 gap-2">
                {scan.contrastPairs.slice(0, 6).map((p) => {
                  const badge = contrastBadge(p.ratio);
                  return (
                    <div
                      key={`${p.fg}-${p.bg}`}
                      className={`flex flex-col gap-1 rounded-md border p-2 ${
                        badge.pass ? 'border-gray-300' : 'border-amber-600'
                      }`}
                      style={{ background: p.bg }}
                    >
                      <span className="text-[15px] leading-tight" style={{ color: p.fg }}>
                        Aa Body text
                      </span>
                      <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
                        <span className="rounded-sm bg-white/70 px-1">{p.ratio.toFixed(1)}:1</span>
                        <span
                          className={`rounded-full border px-1.5 ${
                            badge.pass ? 'border-gray-500 bg-white/70 text-gray-700' : 'border-amber-600 bg-white/70 text-amber-700'
                          }`}
                        >
                          {badge.label}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
