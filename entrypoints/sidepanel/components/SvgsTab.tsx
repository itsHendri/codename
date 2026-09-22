import { useMemo, useState } from 'react';
import { zipSync, strToU8 } from 'fflate';
import type { SvgAsset } from '@/shared/types';
import { download } from '../lib/exporters';
import { CheckIcon, CopyIcon, DownloadIcon } from './icons';

function svgDataUri(markup: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(markup)}`;
}

async function fetchViaBackground(url: string): Promise<string | null> {
  const res = (await chrome.runtime.sendMessage({ type: 'fetch-text', url })) as
    | { ok: boolean; text?: string }
    | undefined;
  return res?.ok && res.text ? res.text : null;
}

export function SvgsTab({ svgs }: { svgs: SvgAsset[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'inline' | 'external'>('all');
  const [zipping, setZipping] = useState(false);
  const [zipNote, setZipNote] = useState<string | null>(null);

  const assets = useMemo(() => {
    if (filter === 'inline') return svgs.filter((s) => s.markup);
    if (filter === 'external') return svgs.filter((s) => !s.markup);
    return svgs;
  }, [svgs, filter]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const chosen = selected.size ? svgs.filter((s) => selected.has(s.id)) : svgs;

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
      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto">
        {/* Wraps: in the rail this has 240px, not the panel's 360. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="shrink-0 text-xs font-medium text-ink">{svgs.length} SVGs</span>
          <div role="radiogroup" aria-label="Filter" className="ml-auto flex h-control gap-0.5 rounded-control bg-surface-field p-0.5">
            {(['all', 'inline', 'external'] as const).map((f) => (
              <button
                key={f}
                role="radio"
                aria-checked={filter === f}
                onClick={() => setFilter(f)}
                className={`rounded-[4px] px-1.5 text-xs capitalize ${
                  filter === f ? 'bg-surface-thumb text-ink shadow-[0_1px_2px_rgb(0_0_0/0.2)]' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1.5">
          {assets.map((asset) => (
            <SvgTile key={asset.id} asset={asset} selected={selected.has(asset.id)} onToggle={() => toggle(asset.id)} />
          ))}
        </div>
        {assets.length === 0 && <p className="text-xs text-ink-muted">No SVGs in this filter.</p>}
        <p className="text-2xs text-ink-muted">Sources: inline · img · css background · sprite &lt;use&gt; · favicon</p>
      </div>

      <div className="-mx-2.5 -mb-2.5 flex flex-col gap-1.5 border-t border-line-subtle px-2.5 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-2xs text-ink-muted">
            {selected.size ? (
              <>
                {selected.size} selected ·{' '}
                <button className="text-accent hover:underline" onClick={() => setSelected(new Set())}>
                  Clear
                </button>
              </>
            ) : (
              'none selected = all'
            )}
          </span>
          <button
            onClick={downloadZip}
            disabled={zipping || svgs.length === 0}
            className="ml-auto flex h-control flex-1 items-center justify-center gap-1.5 rounded-control bg-accent text-xs font-medium text-accent-ink hover:bg-accent-hover disabled:opacity-40"
          >
            <DownloadIcon />
            {zipping ? 'Zipping…' : `Download ${selected.size || svgs.length} · ZIP`}
          </button>
        </div>
        {zipNote && <p className="text-2xs text-warn-ink">{zipNote}</p>}
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
      className={`group relative flex h-20 cursor-pointer items-center justify-center rounded-control p-2 checkerboard ${
        selected ? 'shadow-[0_0_0_2px_var(--accent)]' : 'shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)] hover:shadow-[0_0_0_1px_var(--line-strong)]'
      }`}
      onClick={onToggle}
      title={asset.url ?? `${asset.source} SVG`}
    >
      <span
        className={`absolute left-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-[3px] ${
          selected ? 'bg-accent text-accent-ink' : 'bg-white/90 opacity-0 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.2)] group-hover:opacity-100'
        }`}
      >
        {selected && <CheckIcon className="h-2.5 w-2.5" />}
      </span>
      <span className="absolute right-1 top-1 flex gap-0.5 opacity-0 group-hover:opacity-100">
        {asset.markup && (
          <button
            className="flex h-4 w-4 items-center justify-center rounded-[3px] bg-surface-panel/90 text-ink-muted hover:text-ink"
            title="Copy markup"
            aria-label="Copy markup"
            onClick={(e) => {
              e.stopPropagation();
              void navigator.clipboard.writeText(asset.markup!);
            }}
          >
            <CopyIcon className="h-2.5 w-2.5" />
          </button>
        )}
        <button
          className="flex h-4 w-4 items-center justify-center rounded-[3px] bg-surface-panel/90 text-ink-muted hover:text-ink"
          title="Download this SVG"
          aria-label="Download this SVG"
          onClick={(e) => {
            e.stopPropagation();
            void downloadOne(asset);
          }}
        >
          <DownloadIcon className="h-2.5 w-2.5" />
        </button>
      </span>
      {preview ? (
        <img src={preview} alt="" className="max-h-full max-w-full" loading="lazy" />
      ) : (
        <span className="text-2xs text-ink-muted">{asset.source}</span>
      )}
      {asset.bytes != null && (
        <span className="absolute bottom-1 right-1 rounded-[3px] bg-surface-panel/90 px-1 font-mono text-2xs text-ink-muted">
          {asset.bytes < 1024 ? `${asset.bytes} B` : `${(asset.bytes / 1024).toFixed(1)} KB`}
        </span>
      )}
    </div>
  );
}
