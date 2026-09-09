import { useMemo, useState } from 'react';
import { isEmpty, toJson, toPrompt } from '@/studio/commit';
import { active as activeChanges } from '@/studio/changes';
import type { ChangeSet } from '@/studio/commit';
import { hexOf } from '@/studio/reskin';
import { download } from '@/studio/download';
import type { InspectController } from '../lib/inspect';
import { sendToAgent, useBridge } from '../lib/bridge';
import { useSession } from '../lib/session';
import { ChangesList } from './inspect/ChangesList';
import { ConnectAgentCard } from './ConnectAgentCard';
import { CommentList } from './inspect/Comments';

/**
 * Everything waiting to go to the agent, in one place.
 *
 * This used to be an overlay you opened from a button, which meant the review
 * and the editing were different screens and neither showed the whole picture.
 * A change is a change whether it came from a seed, an element or a note, so
 * they queue together and leave together.
 */
export function ChangesTab({ set, ctl }: { set: ChangeSet; ctl: InspectController }) {
  const [copied, setCopied] = useState<string | null>(null);
  const { status } = useBridge();
  const { handoff, log, comments } = useSession();
  const connected = status === 'connected';

  const prompt = useMemo(() => toPrompt(set), [set]);
  const empty = isEmpty(set);
  // A reorder shifts what `li:nth-of-type(2)` points at, so an edit made on
  // a positional selector may now be on a different element than it was.
  const shifted = useMemo(() => {
    const live = activeChanges(log);
    return live.some((e) => e.property === 'move') && live.some((e) => e.property !== 'move' && !e.stable);
  }, [log]);

  const flash = (what: string) => {
    setCopied(what);
    setTimeout(() => setCopied(null), 1600);
  };

  if (empty && log.entries.length === 0 && comments.length === 0) {
    return (
      <div className="flex flex-col">
        <div className="flex flex-col items-center gap-2 px-8 py-10 text-center">
          <div className="text-base text-ink-secondary">Nothing to hand over yet</div>
          <p className="max-w-60 text-sm text-ink-muted">
            Change a variable in Variables, edit a layer, or turn on Comment on the bar and mark
            something on the page. Whatever you do collects here as one brief for your agent.
          </p>
        </div>
        {status === 'off' && (
          <div className="px-3 pb-3">
            <ConnectAgentCard />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-4 p-3">
        {set.tokens.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <SectionHead title="Token definitions" count={set.tokens.length} />
            <p className="text-2xs text-ink-muted">
              The agent edits these definitions — not the places that use them.
            </p>
            {set.tokens.map((t) => (
              <div key={t.name} className="rounded-control border border-line-subtle px-2 py-1.5">
                <div className="flex items-center gap-1.5">
                  <code className="min-w-0 flex-1 truncate text-xs">{t.name}</code>
                  {/* A spacing or type token has no colour to show. */}
                  {hexOf(t.from) && hexOf(t.to) && (
                    <>
                      <Swatch color={t.from} />
                      <span className="text-2xs text-ink-muted">→</span>
                      <Swatch color={t.to} />
                    </>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-2xs text-ink-muted">
                  <span className="tabular-nums">
                    {t.from} → {t.to}
                  </span>
                  {t.uses != null && <span className="ml-auto">{t.uses} uses</span>}
                </div>
              </div>
            ))}
          </section>
        )}

        {set.colors.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <SectionHead title="Hardcoded colours" count={set.colors.length} />
            <p className="text-2xs text-ink-muted">
              {set.tokens.length
                ? 'Literals with no token behind them.'
                : 'This page defines no colour tokens, so the brief suggests introducing some.'}
            </p>
            {set.colors.map((c) => (
              <div
                key={c.from}
                className="flex items-center gap-1.5 rounded-control border border-line-subtle px-2 py-1.5"
              >
                <Swatch color={c.from} />
                <span className="text-2xs tabular-nums text-ink-muted">{c.from}</span>
                <span className="text-2xs text-ink-muted">→</span>
                <Swatch color={c.to} />
                <span className="text-2xs tabular-nums">{c.to}</span>
                <span className="ml-auto text-2xs text-ink-muted">{c.uses}×</span>
              </div>
            ))}
          </section>
        )}

        {set.system.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <SectionHead title="Scale changes" count={set.system.length} />
            <p className="text-2xs text-ink-muted">
              Decisions about the system. Any the page holds in a variable are in the list above; the
              rest are written somewhere in source.
            </p>
            {set.system.map((c) => (
              <div
                key={`${c.area} ${c.label}`}
                className="flex items-center gap-1.5 rounded-control border border-line-subtle px-2 py-1.5"
              >
                <span className="text-2xs text-ink-muted">{c.area}</span>
                <span className="min-w-0 flex-1 truncate text-xs">{c.label}</span>
                <span className="shrink-0 font-mono text-2xs tabular-nums text-ink-secondary">
                  {c.from} → {c.to}
                </span>
              </div>
            ))}
          </section>
        )}

        {log.entries.length > 0 && (
          <ChangesList
            log={log}
            onUndo={ctl.undo}
            onRedo={ctl.redo}
            onRevert={ctl.revert}
            onViewOriginal={ctl.viewOriginal}
          />
        )}

        <CommentList
          comments={comments}
          focusId={ctl.focusedComment}
          onSelect={ctl.selectComment}
          onStatus={ctl.setCommentStatus}
          onRemove={ctl.removeComment}
        />

        {shifted && (
          <p className="rounded-control border border-warn bg-warn-soft px-2 py-1.5 text-2xs text-warn-ink">
            A reorder and an edit on a positional selector are both in force, so the edit may have
            moved to a different element. Check the selection on the page before sending.
          </p>
        )}

        {set.unreadable.length > 0 && (
          <p className="rounded-control border border-warn bg-warn-soft px-2 py-1.5 text-2xs text-warn-ink">
            {set.unreadable.length} stylesheet(s) couldn&apos;t be read, so there may be occurrences not
            counted here.
          </p>
        )}

        {!set.local && !empty && (
          <p className="rounded-control border border-warn bg-warn-soft px-2 py-1.5 text-2xs text-warn-ink">
            Edited against a deployed site rather than a local dev server — check the mapping to source
            before applying.
          </p>
        )}
      </div>

      <div className="sticky bottom-0 flex flex-col gap-1.5 border-t border-line bg-surface-app px-3 py-2">
        {status === 'off' ? (
          <ConnectAgentCard />
        ) : (
          <p className="text-2xs text-ink-muted">
            {connected
              ? 'Nothing is written until your agent runs — review its diff as usual.'
              : 'Looking for the bridge — start your agent, or copy the brief meanwhile.'}
          </p>
        )}
        <button
          onClick={() => (sendToAgent() ? flash('sent') : null)}
          disabled={empty || !connected}
          title={connected ? 'Hand this to the connected agent' : 'Connect your agent first'}
          className="rounded-control border border-accent bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink hover:bg-accent-hover disabled:opacity-40"
        >
          {copied === 'sent' ? 'Sent — your agent will pick it up' : handoff ? 'Sent · send again' : 'Send to agent'}
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => navigator.clipboard.writeText(prompt).then(() => flash('prompt'))}
            disabled={empty}
            className="flex-1 rounded-control border border-line px-3 py-1 text-xs hover:bg-surface-control disabled:opacity-40"
          >
            {copied === 'prompt' ? 'Copied ✓' : 'Copy brief'}
          </button>
          <button
            onClick={() => download('codename-changes.json', toJson(set), 'application/json')}
            disabled={empty}
            className="rounded-control border border-line px-3 py-1 text-xs hover:bg-surface-control disabled:opacity-40"
          >
            JSON
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionHead({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-2xs tracking-wide text-ink-muted uppercase">{title}</span>
      <span className="ml-auto font-mono text-2xs text-ink-muted">{count}</span>
    </div>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <span className="h-3 w-3 shrink-0 rounded-sm border border-line" style={{ background: color }} />
  );
}
