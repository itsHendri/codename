import { useState } from 'react';
import type { ScanResult } from '@/shared/types';

const SERVICE_LABELS: Record<string, string> = {
  google: 'Google Fonts',
  adobe: 'Adobe Fonts',
  monotype: 'Monotype',
  hoefler: 'Hoefler & Co',
  'self-hosted': 'self-hosted',
  system: 'system',
};

export function FontsTab({ scan }: { scan: ScanResult }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const heading = scan.fontUsage.find((f) => f.roles.includes('headings'));
  const body = scan.fontUsage.find((f) => f.roles.includes('body') && f !== heading) ?? scan.fontUsage.find((f) => f.roles.includes('body'));
  const code = scan.fontUsage.find((f) => f.roles.includes('code'));

  const scale = scan.fontUsage
    .flatMap((f) => f.variants.map((v) => ({ ...v, family: f.family })))
    .reduce((acc, v) => {
      const key = `${v.size}|${v.weight}|${v.lineHeight}`;
      const existing = acc.get(key);
      if (existing) existing.count += v.count;
      else acc.set(key, { ...v });
      return acc;
    }, new Map<string, { size: string; weight: string; lineHeight: string; count: number }>());
  const scaleRows = Array.from(scale.values())
    .sort((a, b) => parseFloat(b.size) - parseFloat(a.size))
    .slice(0, 8);

  return (
    <div className="flex flex-col gap-3 p-3.5">
      <div className="flex items-baseline gap-2">
        <span className="font-medium">
          {scan.fontUsage.length} {scan.fontUsage.length === 1 ? 'family' : 'families'} found
        </span>
        <span className="ml-auto text-xs text-gray-400">sorted by usage</span>
      </div>

      {(heading || body) && (
        <div className="rounded-lg border border-blue-600 bg-blue-50 p-3">
          <div className="text-[10px] font-semibold tracking-wide text-blue-600">THIS SITE&apos;S PAIRING</div>
          <div className="mt-1 text-xl font-bold" style={{ fontFamily: heading?.family ?? body?.family }}>
            {heading?.family ?? body?.family} headlines
          </div>
          {body && (
            <div className="mt-0.5 text-sm text-gray-600" style={{ fontFamily: body.family }}>
              over {body.family} body copy{code ? `, with ${code.family} for code` : ''}.
            </div>
          )}
        </div>
      )}

      {scan.fontUsage.map((font) => {
        const face = scan.fontFaces.find((f) => f.family === font.family);
        const service = SERVICE_LABELS[face?.service ?? 'system'];
        const isOpen = expanded === font.family;
        const weights = face?.weights.length ? face.weights : [...new Set(font.variants.map((v) => v.weight))];
        return (
          <div key={font.family} className="rounded-lg border border-gray-300 p-3">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl font-bold leading-none" style={{ fontFamily: font.family }}>
                Aa
              </span>
              <div className="min-w-0">
                <div className="truncate font-medium">{font.family}</div>
                <div className="text-[11px] text-gray-400">
                  {font.roles.join(' · ')} · {font.elementCount} elements
                </div>
              </div>
              <span
                className={`ml-auto shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${
                  face && face.service !== 'self-hosted' && face.service !== 'system'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-gray-400 bg-gray-50 text-gray-600'
                }`}
              >
                {service}
              </span>
            </div>
            <div
              className="mt-2 border-t border-dashed border-gray-200 pt-2 text-[17px]"
              style={{ fontFamily: font.family }}
            >
              The quick brown fox jumps over the lazy dog
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              {weights.slice(0, 6).map((w) => (
                <span
                  key={w}
                  className="rounded border border-gray-400 px-1.5 text-xs"
                  style={{ fontFamily: font.family, fontWeight: w }}
                >
                  {w}
                </span>
              ))}
              <button
                onClick={() => setExpanded(isOpen ? null : font.family)}
                className="ml-auto text-xs text-blue-600 hover:underline"
              >
                {isOpen ? 'less' : 'specimens →'}
              </button>
            </div>
            {isOpen && (
              <div className="mt-2 flex flex-col gap-1.5 border-t border-dashed border-gray-200 pt-2">
                {weights.map((w) => (
                  <div key={w} className="flex items-baseline gap-2">
                    <span className="w-8 shrink-0 text-[10px] text-gray-400">{w}</span>
                    <span className="truncate text-base" style={{ fontFamily: font.family, fontWeight: w }}>
                      The quick brown fox jumps
                    </span>
                  </div>
                ))}
                {face?.srcUrls[0] && (
                  <div className="truncate text-[10px] text-gray-400" title={face.srcUrls[0]}>
                    @font-face: {face.srcUrls[0]}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {scaleRows.length > 0 && (
        <div className="border-t border-dashed border-gray-200 pt-2.5">
          <div className="mb-1.5 text-xs text-gray-500">Type scale in use</div>
          <div className="flex flex-col gap-1">
            {scaleRows.map((row) => (
              <div key={`${row.size}-${row.weight}-${row.lineHeight}`} className="flex items-baseline gap-2.5 text-xs">
                <span className="w-11">{row.size}</span>
                <span className="text-gray-400">
                  {row.weight} · {row.lineHeight}
                </span>
                <span className="flex-1 border-b border-dotted border-gray-200" />
                <span className="text-gray-400">×{row.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
