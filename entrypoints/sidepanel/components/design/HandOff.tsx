import { useMemo, useState } from 'react';
import type { ScanResult } from '@/shared/types';
import type { Override } from '@/studio/reskin';
import { buildChangeSet, isEmpty, toJson, toPrompt } from '@/studio/commit';
import { active } from '@/studio/changes';
import { download } from '../../lib/exporters';
import { sendToAgent, useBridge } from '../../lib/bridge';
import { useSession } from '../../lib/session';

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
  const { status } = useBridge();
  const { handoff, log } = useSession();
  const connected = status === 'connected';
  const set = useMemo(
    () => buildChangeSet(scan, overrides, colorMap, active(log)),
    [scan, overrides, colorMap, log],
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
    <div className="absolute inset-0 z-20 flex flex-col bg-surface-panel">
      <header className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
        <div className="min-w-0">
          <div className="truncate font-medium">Hand to your agent</div>
          <div className="truncate text-xs text-ink-muted">
            {host}
            {set.local && ' · local dev server'}
          </div>
        </div>
        <button
          onClick={onClose}
          className="ml-auto shrink-0 text-ink-muted hover:text-ink-secondary"
          aria-label="Back to the system"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-3.5 py-3">
        {isEmpty(set) ? (
          <p className="text-sm text-ink-muted">
            Nothing to hand over yet — change a seed, or edit an element in Inspect, and it will appear here.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {set.tokens.length > 0 && (
              <section className="flex flex-col gap-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-base">Token definitions</span>
                  <span className="ml-auto text-2xs text-ink-muted">{set.tokens.length}</span>
                </div>
                <p className="text-2xs text-ink-muted">
                  The agent edits these definitions — not the places that use them.
                </p>
                {set.tokens.map((t) => (
                  <div key={t.name} className="rounded-control border border-line-subtle px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <code className="min-w-0 flex-1 truncate text-xs">{t.name}</code>
                      <span
                        className="h-3 w-3 shrink-0 rounded-sm border border-line"
                        style={{ background: t.from }}
                      />
                      <span className="text-2xs text-ink-muted">→</span>
                      <span
                        className="h-3 w-3 shrink-0 rounded-sm border border-line"
                        style={{ background: t.to }}
                      />
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-2xs text-ink-muted">
                      <span className="tabular-nums">
                        {t.from} → {t.to}
                      </span>
                      {t.uses != null && <span className="ml-auto">{t.uses} uses</span>}
                    </div>
                    {t.source && (
                      <div className="truncate text-2xs text-ink-muted" title={t.source}>
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
                  <span className="text-base">Hardcoded colours</span>
                  <span className="ml-auto text-2xs text-ink-muted">{set.colors.length}</span>
                </div>
                <p className="text-2xs text-ink-muted">
                  {set.tokens.length
                    ? 'Literals with no token behind them.'
                    : 'This page defines no colour tokens, so there is no definition to edit — the prompt suggests introducing some.'}
                </p>
                {set.colors.map((c) => (
                  <div
                    key={c.from}
                    className="flex items-center gap-1.5 rounded-control border border-line-subtle px-2 py-1.5"
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-sm border border-line"
                      style={{ background: c.from }}
                    />
                    <span className="text-2xs tabular-nums text-ink-muted">{c.from}</span>
                    <span className="text-2xs text-ink-muted">→</span>
                    <span
                      className="h-3 w-3 shrink-0 rounded-sm border border-line"
                      style={{ background: c.to }}
                    />
                    <span className="text-2xs tabular-nums">{c.to}</span>
                    <span className="ml-auto text-2xs text-ink-muted">{c.uses}×</span>
                  </div>
                ))}
              </section>
            )}

            {set.elements.length > 0 && (
              <section className="flex flex-col gap-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-base">Element changes</span>
                  <span className="ml-auto text-2xs text-ink-muted">{set.elements.length}</span>
                </div>
                <p className="text-2xs text-ink-muted">
                  One property on one selector, before and after. The agent applies the intent in source.
                </p>
                {set.elements.map((e) => (
                  <div key={`${e.selector} ${e.property}`} className="rounded-control border border-line-subtle px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <code className="min-w-0 flex-1 truncate text-xs">{e.selector}</code>
                      {e.matches > 1 && <span className="text-2xs text-ink-muted">×{e.matches}</span>}
                      {!e.stable && <span className="text-2xs text-warn-ink">positional</span>}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-2xs text-ink-muted">
                      <code>{e.property}</code>
                      <span className="tabular-nums truncate">
                        {e.from} → {e.to}
                      </span>
                      {e.token && <span className="ml-auto text-accent">{e.token}</span>}
                    </div>
                  </div>
                ))}
              </section>
            )}

            {set.unreadable.length > 0 && (
              <p className="rounded-control border border-warn bg-warn-soft px-2 py-1.5 text-2xs text-warn-ink">
                {set.unreadable.length} stylesheet(s) couldn&apos;t be read, so there may be
                occurrences not counted here.
              </p>
            )}

            {!set.local && (
              <p className="rounded-control border border-warn bg-warn-soft px-2 py-1.5 text-2xs text-warn-ink">
                Edited against a deployed site rather than a local dev server — check the mapping to
                source before applying.
              </p>
            )}
          </div>
        )}
      </div>

      <footer className="flex flex-col gap-1.5 border-t border-line px-3.5 py-2.5">
        <p className="text-2xs text-ink-muted">
          {connected
            ? 'Nothing is written until your agent runs — review its diff as usual.'
            : 'Not connected: run `npx codename-bridge` and pair from the menu, or copy the brief.'}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => (sendToAgent() ? flash('sent') : null)}
            disabled={isEmpty(set) || !connected}
            title={connected ? 'Hand this to the connected agent' : 'Start `npx codename-bridge` and pair in the menu'}
            className="flex-1 rounded-control border border-accent bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink hover:bg-accent-hover disabled:opacity-40"
          >
            {copied === 'sent' ? 'Sent — your agent will pick it up' : handoff ? 'Sent · send again' : 'Send to agent'}
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => download(`codename-changes.json`, toJson(set), 'application/json')}
            disabled={isEmpty(set)}
            className="rounded-control border border-line px-2.5 py-1.5 text-sm hover:bg-surface-recessed disabled:opacity-40"
          >
            JSON
          </button>
          <button
            onClick={() => navigator.clipboard.writeText(prompt).then(() => flash('prompt'))}
            disabled={isEmpty(set)}
            className="flex-1 rounded-control border border-line px-3 py-1.5 text-sm hover:bg-surface-control disabled:opacity-40"
          >
            {copied === 'prompt' ? 'Copied — paste it to your agent' : 'Copy for your agent'}
          </button>
        </div>
      </footer>
    </div>
  );
}
