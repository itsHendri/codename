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
          <div className="ml-auto flex gap-1.5 text-xs">
            {(['all', 'inline', 'external'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full border px-2.5 py-0.5 capitalize ${
                  filter === f ? 'border-accent text-accent' : 'border-line text-ink-muted'
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
        {assets.length === 0 && <p className="text-center text-sm text-ink-muted">No SVGs in this filter.</p>}
        <p className="text-xs text-ink-muted">Sources: inline · img · css background · sprite &lt;use&gt; · favicon</p>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-line-subtle px-3.5 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="text-sm text-ink-muted">
            {selected.size ? (
              <>
                {selected.size} selected ·{' '}
                <button className="text-accent hover:underline" onClick={() => setSelected(new Set())}>
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
            className="ml-auto flex flex-1 items-center justify-center gap-2 rounded-card border border-accent bg-accent-soft py-2 font-medium text-accent hover:bg-accent-soft disabled:opacity-50"
          >
            <DownloadIcon />
            {zipping ? 'Zipping…' : `Download ${selected.size || scan.svgs.length} · ZIP`}
          </button>
        </div>
        {zipNote && <p className="text-xs text-warn-ink">{zipNote}</p>}
      </div>
    </div>
  );
}

/** One file, straight to disk: inline markup as-is, a URL through the worker. */
async function downloadOne(asset: SvgAsset) {
  const markup = asset.markup ?? (asset.url ? await fetchViaBackground(asset.url) : null);
  if (!markup) return;
  const name = asset.url?.split('/').pop()?.split('?')[0] || `${asset.id}.svg`;
  download(name.endsWith('.svg') ? name : `${name}.svg`, markup, 'image/svg+xml');
}

function SvgTile({ asset, selected, onToggle }: { asset: SvgAsset; selected: boolean; onToggle: () => void }) {
  const preview = asset.markup ? svgDataUri(asset.markup) : asset.url;
  return (
    <div
      className={`relative flex h-22 cursor-pointer items-center justify-center rounded-card border p-2 checkerboard ${
        selected ? 'border-accent ring-1 ring-accent' : 'border-line hover:border-line-strong'
      }`}
      onClick={onToggle}
      title={asset.url ?? `${asset.source} SVG`}
    >
      <span
        className={`absolute left-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded border text-2xs ${
          selected ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface-panel'
        }`}
      >
        {selected ? '✓' : ''}
      </span>
      <span className="absolute right-1 top-1 flex gap-0.5">
        {asset.markup && (
          <button
            className="rounded bg-surface-panel/80 p-0.5 text-ink-muted hover:text-accent"
            title="Copy markup"
            aria-label="Copy markup"
            onClick={(e) => {
              e.stopPropagation();
              void navigator.clipboard.writeText(asset.markup!);
            }}
          >
            <CopyIcon />
          </button>
        )}
        <button
          className="rounded bg-surface-panel/80 px-1 text-2xs text-ink-muted hover:text-accent"
          title="Download this SVG"
          aria-label="Download this SVG"
          onClick={(e) => {
            e.stopPropagation();
            void downloadOne(asset);
          }}
        >
          ↓
        </button>
      </span>
      {preview ? (
        <img src={preview} alt="" className="max-h-full max-w-full" loading="lazy" />
      ) : (
        <span className="text-2xs text-ink-muted">{asset.source}</span>
      )}
      {asset.bytes != null && (
        <span className="absolute bottom-0.5 right-1 rounded bg-surface-panel/80 px-0.5 text-2xs text-ink-muted">
          {asset.bytes < 1024 ? `${asset.bytes} B` : `${(asset.bytes / 1024).toFixed(1)} KB`}
        </span>
      )}
    </div>
  );
}
