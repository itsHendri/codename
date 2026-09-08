import { useMemo, useState } from 'react';
import type { ScanResult } from '@/shared/types';
import type { Override } from '@/studio/reskin';
import { buildChangeSet, isEmpty, toJson, toPrompt } from '@/studio/commit';
import { download } from '../../lib/exporters';

/**
 * The review step before a change leaves the panel.
 *
 * Deliberately a confirmation and not a running log: you see exactly what will
 * be asked for, grouped by the thing that will be edited, and nothing goes
 * anywhere until you press a button. The page is already showing you the
 * result — this screen is about what happens to the source.
 */
export function HandOff({
  scan,
  overrides,
  colorMap,
  onClose,
}: {
  scan: ScanResult;
  overrides: Override[];
  colorMap: Record<string, string>;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const set = useMemo(
    () => buildChangeSet(scan, overrides, colorMap),
    [scan, overrides, colorMap],
  );
  const prompt = useMemo(() => toPrompt(set), [set]);

  const flash = (what: string) => {
    setCopied(what);
    setTimeout(() => setCopied(null), 1600);
  };

  const host = (() => {
    try {
      return new URL(set.site).host;
    } catch {
      return set.site;
    }
  })();

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-white">
      <header className="flex items-center gap-2 border-b border-gray-300 px-3.5 py-2.5">
        <div className="min-w-0">
          <div className="truncate font-medium">Hand to your agent</div>
          <div className="truncate text-[11px] text-gray-500">
            {host}
            {set.local && ' · local dev server'}
          </div>
        </div>
        <button
          onClick={onClose}
          className="ml-auto shrink-0 text-gray-400 hover:text-gray-700"
          aria-label="Back to the system"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-3.5 py-3">
        {isEmpty(set) ? (
          <p className="text-xs text-gray-500">
            Nothing to hand over yet — change a seed and the edits will appear here.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {set.tokens.length > 0 && (
              <section className="flex flex-col gap-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px]">Token definitions</span>
                  <span className="ml-auto text-[10px] text-gray-400">{set.tokens.length}</span>
                </div>
                <p className="text-[10px] text-gray-500">
                  The agent edits these definitions — not the places that use them.
                </p>
                {set.tokens.map((t) => (
                  <div key={t.name} className="rounded-md border border-gray-200 px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <code className="min-w-0 flex-1 truncate text-[11px]">{t.name}</code>
                      <span
                        className="h-3 w-3 shrink-0 rounded-sm border border-gray-300"
                        style={{ background: t.from }}
                      />
                      <span className="text-[10px] text-gray-400">→</span>
                      <span
                        className="h-3 w-3 shrink-0 rounded-sm border border-gray-300"
                        style={{ background: t.to }}
                      />
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-gray-400">
                      <span className="tabular-nums">
                        {t.from} → {t.to}
                      </span>
                      {t.uses != null && <span className="ml-auto">{t.uses} uses</span>}
                    </div>
                    {t.source && (
                      <div className="truncate text-[10px] text-gray-400" title={t.source}>
                        {t.source.replace(/^https?:\/\/[^/]+/, '')}
                      </div>
                    )}
                  </div>
                ))}
              </section>
            )}

            {set.colors.length > 0 && (
              <section className="flex flex-col gap-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px]">Hardcoded colours</span>
                  <span className="ml-auto text-[10px] text-gray-400">{set.colors.length}</span>
                </div>
                <p className="text-[10px] text-gray-500">
                  {set.tokens.length
                    ? 'Literals with no token behind them.'
                    : 'This page defines no colour tokens, so there is no definition to edit — the prompt suggests introducing some.'}
                </p>
                {set.colors.map((c) => (
                  <div
                    key={c.from}
                    className="flex items-center gap-1.5 rounded-md border border-gray-200 px-2 py-1.5"
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-sm border border-gray-300"
                      style={{ background: c.from }}
                    />
                    <span className="text-[10px] tabular-nums text-gray-500">{c.from}</span>
                    <span className="text-[10px] text-gray-400">→</span>
                    <span
                      className="h-3 w-3 shrink-0 rounded-sm border border-gray-300"
                      style={{ background: c.to }}
                    />
                    <span className="text-[10px] tabular-nums">{c.to}</span>
                    <span className="ml-auto text-[10px] text-gray-400">{c.uses}×</span>
                  </div>
                ))}
              </section>
            )}

            {set.unreadable.length > 0 && (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[10px] text-amber-800">
                {set.unreadable.length} stylesheet(s) couldn&apos;t be read, so there may be
                occurrences not counted here.
              </p>
            )}

            {!set.local && (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[10px] text-amber-800">
                Edited against a deployed site rather than a local dev server — check the mapping to
                source before applying.
              </p>
            )}
          </div>
        )}
      </div>

      <footer className="flex flex-col gap-1.5 border-t border-gray-300 px-3.5 py-2.5">
        <p className="text-[10px] text-gray-500">
          Nothing is written until your agent runs — review its diff as usual.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => download(`codename-changes.json`, toJson(set), 'application/json')}
            disabled={isEmpty(set)}
            className="rounded-md border border-gray-400 px-2.5 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-40"
          >
            JSON
          </button>
          <button
            onClick={() => navigator.clipboard.writeText(prompt).then(() => flash('prompt'))}
            disabled={isEmpty(set)}
            className="flex-1 rounded-md border border-blue-600 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {copied === 'prompt' ? 'Copied — paste it to your agent' : 'Copy for your agent'}
          </button>
        </div>
      </footer>
    </div>
  );
}
