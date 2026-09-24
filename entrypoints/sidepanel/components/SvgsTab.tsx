import { useMemo, useState } from 'react';
import { zipSync, strToU8 } from 'fflate';
import type { SvgAsset } from '@/shared/types';
import { download } from '@/studio/download';
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

/** Where an asset came from, in words. */
const SOURCE: Record<SvgAsset['source'], string> = {
  inline: 'Inline',
  img: 'Image',
  css: 'CSS background',
  sprite: 'Sprite',
  favicon: 'Favicon',
};
/** The order they are shown in: what is written into the page first. */
const ORDER: SvgAsset['source'][] = ['inline', 'sprite', 'img', 'css', 'favicon'];

/** A name to show under a tile: the file's own, or where it came from. */
function nameOf(asset: SvgAsset, index: number): string {
  const file = asset.url?.split('/').pop()?.split(/[?#]/)[0];
  return file ? decodeURIComponent(file) : `${SOURCE[asset.source]} ${index}`;
}

const sizeOf = (bytes?: number) => (bytes == null ? null : bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`);

/**
 * Every SVG on the page, as a media library shows files: one grid, a square
 * preview each, and under it the name, where it came from and its size.
 * No filter tabs — there are rarely enough assets to need them, and "where
 * it came from" reads better as a line under each than as a sub-nav.
 * Previews sit on a light or a dark ground, the person's choice: a black
 * icon disappears on dark and a white one on light, and a page has both.
 */
export function SvgsTab({ svgs }: { svgs: SvgAsset[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ground, setGround] = useState<'light' | 'dark'>('light');
  const [zipping, setZipping] = useState(false);
  const [zipNote, setZipNote] = useState<string | null>(null);

  const assets = useMemo(() => [...svgs].sort((a, b) => ORDER.indexOf(a.source) - ORDER.indexOf(b.source)), [svgs]);
  // Numbered within their source, so "Inline 3" means something.
  const names = useMemo(() => {
    const seen: Partial<Record<SvgAsset['source'], number>> = {};
    return new Map(assets.map((a) => [a.id, nameOf(a, (seen[a.source] = (seen[a.source] ?? 0) + 1))]));
  }, [assets]);

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
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        <div className="flex flex-wrap items-center gap-2">
          <span className="shrink-0 text-xs font-medium text-ink">
            {svgs.length} {svgs.length === 1 ? 'SVG' : 'SVGs'}
          </span>
          <div role="radiogroup" aria-label="Preview on" className="ml-auto flex h-control gap-0.5 rounded-control bg-surface-field p-0.5">
            {(['light', 'dark'] as const).map((g) => (
              <button
                key={g}
                role="radio"
                aria-checked={ground === g}
                onClick={() => setGround(g)}
                title={`Preview on ${g}`}
                className={`rounded-[4px] px-1.5 text-xs capitalize ${
                  ground === g ? 'bg-surface-thumb text-ink shadow-[0_1px_2px_rgb(0_0_0/0.2)]' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
          {assets.map((asset) => (
            <SvgTile
              key={asset.id}
              asset={asset}
              name={names.get(asset.id) ?? asset.id}
              ground={ground}
              selected={selected.has(asset.id)}
              onToggle={() => toggle(asset.id)}
            />
          ))}
        </div>
        {assets.length === 0 && <p className="text-xs text-ink-muted">No SVGs on this page.</p>}
      </div>

      <div className="-mx-2.5 -mb-2.5 flex flex-col gap-1.5 border-t border-line-subtle px-2.5 py-2">
        <span className="text-2xs text-ink-muted">
          {selected.size ? (
            <>
              {selected.size} picked ·{' '}
              <button className="text-accent hover:underline" onClick={() => setSelected(new Set())}>
                Clear
              </button>
            </>
          ) : (
            'Click previews to pick some, or download them all.'
          )}
        </span>
        <button
          onClick={downloadZip}
          disabled={zipping || svgs.length === 0}
          className="flex h-control w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-control bg-accent text-xs font-medium text-accent-ink hover:bg-accent-hover disabled:opacity-40"
        >
          <DownloadIcon />
          {zipping ? 'Zipping…' : selected.size ? `Download ${selected.size} as ZIP` : `Download all ${svgs.length} as ZIP`}
        </button>
        {zipNote && <p className="text-2xs text-warn-ink">{zipNote}</p>}
      </div>
    </div>
  );
}

/** One file, straight to disk: inline markup as-is, a URL through the worker. */
async function downloadOne(asset: SvgAsset, name: string) {
  const markup = asset.markup ?? (asset.url ? await fetchViaBackground(asset.url) : null);
  if (!markup) return;
  download(name.endsWith('.svg') ? name : `${name}.svg`, markup, 'image/svg+xml');
}

function SvgTile({
  asset,
  name,
  ground,
  selected,
  onToggle,
}: {
  asset: SvgAsset;
  name: string;
  ground: 'light' | 'dark';
  selected: boolean;
  onToggle: () => void;
}) {
  const preview = asset.markup ? svgDataUri(asset.markup) : asset.url;
  const [copied, setCopied] = useState(false);
  const size = sizeOf(asset.bytes);
  const action =
    'flex h-6 w-6 items-center justify-center rounded-[5px] bg-surface-raised text-ink-secondary shadow-[0_1px_3px_rgb(0_0_0/0.25)] hover:text-ink focus-visible:opacity-100';
  return (
    <div
      className={`group flex flex-col overflow-hidden rounded-control border ${
        selected ? 'border-accent shadow-[0_0_0_1px_var(--accent)]' : 'border-line-subtle hover:border-line'
      }`}
    >
      <div
        role="checkbox"
        aria-checked={selected}
        aria-label={`Pick ${name}`}
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            onToggle();
          }
        }}
        title={asset.url ?? `${SOURCE[asset.source]} SVG`}
        className={`relative flex aspect-square cursor-pointer items-center justify-center p-3 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
          ground === 'dark' ? 'checkerboard-dark' : 'checkerboard'
        }`}
      >
        <span
          className={`absolute left-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-[4px] ${
            selected ? 'bg-accent text-accent-ink' : 'bg-surface-raised opacity-0 shadow-[inset_0_0_0_1px_var(--line-strong)] group-hover:opacity-100'
          }`}
        >
          {selected && <CheckIcon className="h-3 w-3" />}
        </span>
        <span className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
          {asset.markup && (
            <button
              className={action}
              title={copied ? 'Copied' : 'Copy the markup'}
              aria-label="Copy the markup"
              onClick={(e) => {
                e.stopPropagation();
                void navigator.clipboard.writeText(asset.markup!).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                });
              }}
            >
              {copied ? <CheckIcon className="h-3.5 w-3.5 text-accent" /> : <CopyIcon className="h-3.5 w-3.5" />}
            </button>
          )}
          <button
            className={action}
            title="Download this SVG"
            aria-label="Download this SVG"
            onClick={(e) => {
              e.stopPropagation();
              void downloadOne(asset, name);
            }}
          >
            <DownloadIcon className="h-3.5 w-3.5" />
          </button>
        </span>
        {preview ? (
          <img src={preview} alt="" className="max-h-full max-w-full" loading="lazy" />
        ) : (
          <span className="text-2xs text-ink-muted">{SOURCE[asset.source]}</span>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-px border-t border-line-subtle bg-surface-panel px-1.5 py-1">
        <span className="truncate text-2xs text-ink" title={name}>
          {name}
        </span>
        <span className="flex gap-1 truncate text-2xs text-ink-muted">
          {SOURCE[asset.source]}
          {size && <span className="font-mono">· {size}</span>}
        </span>
      </div>
    </div>
  );
}
