import { useMemo, useState } from 'react';
import type { ResolvedTokens } from '@/studio/engine/types';
import { buildExport } from '@/studio/export/bundle';
import { download, downloadBundle } from '@/studio/download';

/**
 * The system as files, from inside System rather than a tab of its own: the
 * stylesheet a project runs on (the same one the bridge writes), the W3C
 * DTCG token file a design tool reads, and both as a ZIP. DESIGN.md, the
 * agent-readable twin, and the specimen page join them in later rounds.
 */
export function ExportSheet({
  resolved,
  slug,
  specimen,
  onClose,
}: {
  resolved: ResolvedTokens;
  slug: string;
  /** The specimen as a page, when it is up on the page to be read. */
  specimen?: () => Promise<string | null>;
  onClose: () => void;
}) {
  const files = useMemo(() => buildExport(resolved), [resolved]);
  const [copied, setCopied] = useState<string | null>(null);
  const [specimenNote, setSpecimenNote] = useState<string | null>(null);
  const saveSpecimen = async () => {
    const html = await specimen?.();
    if (!html) {
      setSpecimenNote('Turn Styles on the bar on first: the specimen is read off the page while it is showing.');
      return;
    }
    download(`${slug}-specimen.html`, html, 'text/html');
  };
  const flash = (what: string) => {
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  };
  const mime = (path: string) => (path.endsWith('.json') ? 'application/json' : path.endsWith('.css') ? 'text/css' : 'text/plain');
  return (
    <section className="flex flex-col gap-2 border-b border-line-subtle px-3 py-2" aria-label="Export">
      <div className="flex items-center gap-2">
        <span className="subhead">Export</span>
        <span className="text-2xs text-ink-muted">the system as the panel shows it</span>
        <button onClick={onClose} className="btn btn-sm btn-ghost ml-auto" aria-label="Close export">
          Done
        </button>
      </div>
      {files.map((f) => (
        <div key={f.path} className="flex items-center gap-2 rounded-control bg-surface-field px-2 py-1.5">
          <div className="min-w-0 flex-1">
            <code className="text-xs text-ink">{f.path}</code>
            <p className="truncate text-2xs text-ink-muted" title={f.note}>
              {f.note}
            </p>
          </div>
          <button onClick={() => download(f.path, f.content, mime(f.path))} className="btn btn-sm btn-secondary">
            Download
          </button>
          <button onClick={() => navigator.clipboard.writeText(f.content).then(() => flash(f.path))} className="btn btn-sm btn-ghost">
            {copied === f.path ? 'Copied' : 'Copy'}
          </button>
        </div>
      ))}
      {specimen && (
        <div className="flex items-center gap-2 rounded-control bg-surface-field px-2 py-1.5">
          <div className="min-w-0 flex-1">
            <code className="text-xs text-ink">specimen.html</code>
            <p className="truncate text-2xs text-ink-muted" title="The styles page as it stands over the page, with the page's own stylesheets inlined.">
              The styles page, standalone, with the page's stylesheets inlined.
            </p>
            {specimenNote && <p className="text-2xs text-warn-ink">{specimenNote}</p>}
          </div>
          <button onClick={() => void saveSpecimen()} className="btn btn-sm btn-secondary">
            Save
          </button>
        </div>
      )}
      <button onClick={() => downloadBundle(files, slug)} className="btn btn-secondary">
        Download all as a ZIP ({files.length} files)
      </button>
    </section>
  );
}
