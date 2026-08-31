import { useMemo, useState } from 'react';
import { zipSync, strToU8 } from 'fflate';
import type { ScanResult, SvgAsset } from '@/shared/types';
import { download } from '../lib/exporters';
import { CopyIcon, DownloadIcon } from './icons';

function svgDataUri(markup: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(markup)}`;
}

async function fetchViaBackground(url: string): Promise<string | null> {
  const res = (await chrome.runtime.sendMessage({ type: 'fetch-text', url })) as
    | { ok: boolean; text?: string }
    | undefined;
  return res?.ok && res.text ? res.text : null;
}

export function SvgsTab({ scan }: { scan: ScanResult }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'inline' | 'external'>('all');
  const [zipping, setZipping] = useState(false);
  const [zipNote, setZipNote] = useState<string | null>(null);

  const assets = useMemo(() => {
    if (filter === 'inline') return scan.svgs.filter((s) => s.markup);
    if (filter === 'external') return scan.svgs.filter((s) => !s.markup);
    return scan.svgs;
  }, [scan.svgs, filter]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const chosen = selected.size ? scan.svgs.filter((s) => selected.has(s.id)) : scan.svgs;

  const downloadZip = async () => {
    setZipping(true);
    setZipNote(null);

    // Request any needed host permissions FIRST, while the click gesture is live.
    const externalOrigins = [
      ...new Set(
        chosen
          .filter((a) => !a.markup && a.url)
          .map((a) => {
            try {
              return new URL(a.url!).origin + '/*';
            } catch {
              return null;
            }
          })
          .filter((o): o is string => o !== null),
      ),
    ];
    let granted = externalOrigins.length === 0;
    if (externalOrigins.length) {
      try {
        granted = await chrome.permissions.request({ origins: externalOrigins });
      } catch {
        granted = false;
      }
    }

    const files: Record<string, Uint8Array> = {};
    let skipped = 0;
    let index = 1;
    for (const asset of chosen) {
      let markup = asset.markup ?? null;
      if (!markup && asset.url && granted) {
        markup = await fetchViaBackground(asset.url);
      }
      if (markup) files[`codename-svg-${index++}.svg`] = strToU8(markup);
      else skipped++;
    }
    if (Object.keys(files).length) {
      const zipped = zipSync(files);
      download('codename-svgs.zip', zipped, 'application/zip');
    }
    setZipNote(
      skipped
        ? `${skipped} external file(s) skipped (couldn't fetch — permission denied or network error).`
        : null,
    );
    setZipping(false);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3.5">
        <div className="flex items-center gap-2">
          <span className="font-medium">{scan.svgs.length} SVGs found</span>
          <div className="ml-auto flex gap-1.5 text-[11px]">
            {(['all', 'inline', 'external'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full border px-2.5 py-0.5 capitalize ${
                  filter === f ? 'border-blue-600 text-blue-600' : 'border-gray-400 text-gray-500'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          {assets.map((asset) => (
            <SvgTile key={asset.id} asset={asset} selected={selected.has(asset.id)} onToggle={() => toggle(asset.id)} />
          ))}
        </div>
        {assets.length === 0 && <p className="text-center text-xs text-gray-400">No SVGs in this filter.</p>}
        <p className="text-[11px] text-gray-400">Sources: inline · img · css background · sprite &lt;use&gt; · favicon</p>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-gray-200 px-3.5 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="text-xs text-gray-500">
            {selected.size ? (
              <>
                {selected.size} selected ·{' '}
                <button className="text-blue-600 hover:underline" onClick={() => setSelected(new Set())}>
                  clear
                </button>
              </>
            ) : (
              'none selected = all'
            )}
          </span>
          <button
            onClick={downloadZip}
            disabled={zipping || scan.svgs.length === 0}
            className="ml-auto flex flex-1 items-center justify-center gap-2 rounded-lg border border-blue-600 bg-blue-50 py-2 font-medium text-blue-600 hover:bg-blue-100 disabled:opacity-50"
          >
            <DownloadIcon />
            {zipping ? 'Zipping…' : `Download ${selected.size || scan.svgs.length} · ZIP`}
          </button>
        </div>
        {zipNote && <p className="text-[11px] text-amber-700">{zipNote}</p>}
      </div>
    </div>
  );
}

function SvgTile({ asset, selected, onToggle }: { asset: SvgAsset; selected: boolean; onToggle: () => void }) {
  const preview = asset.markup ? svgDataUri(asset.markup) : asset.url;
  return (
    <div
      className={`relative flex h-[88px] cursor-pointer items-center justify-center rounded-lg border p-2 checkerboard ${
        selected ? 'border-blue-600 ring-1 ring-blue-600' : 'border-gray-300 hover:border-gray-500'
      }`}
      onClick={onToggle}
      title={asset.url ?? `${asset.source} SVG`}
    >
      <span
        className={`absolute left-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded border text-[10px] ${
          selected ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-400 bg-white'
        }`}
      >
        {selected ? '✓' : ''}
      </span>
      {asset.markup && (
        <button
          className="absolute right-1 top-1 rounded bg-white/80 p-0.5 text-gray-500 hover:text-blue-600"
          title="Copy markup"
          onClick={(e) => {
            e.stopPropagation();
            void navigator.clipboard.writeText(asset.markup!);
          }}
        >
          <CopyIcon />
        </button>
      )}
      {preview ? (
        <img src={preview} alt="" className="max-h-full max-w-full" loading="lazy" />
      ) : (
        <span className="text-[10px] text-gray-400">{asset.source}</span>
      )}
      {asset.bytes != null && (
        <span className="absolute bottom-0.5 right-1 rounded bg-white/80 px-0.5 text-[9px] text-gray-500">
          {asset.bytes < 1024 ? `${asset.bytes} B` : `${(asset.bytes / 1024).toFixed(1)} KB`}
        </span>
      )}
    </div>
  );
}
