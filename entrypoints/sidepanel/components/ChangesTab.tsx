import { useMemo, useState } from 'react';
import { isEmpty, toJson, toPrompt } from '@/studio/commit';
import { active as activeChanges } from '@/studio/changes';
import type { ChangeSet, TokenChange } from '@/studio/commit';
import type { ProjectInfo } from '@/shared/protocol';
import { hexOf } from '@/studio/reskin';
import { download } from '@/studio/download';
import type { InspectController } from '../lib/inspect';
import type { Definition } from '@/shared/protocol';
import { targetsFor } from '@/studio/writeScope';
import { dropAgentPreview, refreshDefinitions, revertTokens, useBridge, writeAndVerify } from '../lib/bridge';
import { allow, clearAgentLog, forgetWritten, type WrittenEntry } from '../lib/session';
import { useSession } from '../lib/session';
import { ChangesList } from './inspect/ChangesList';
import { ConnectAgentCard } from './ConnectAgentCard';
import { MakeChanges, RunCard } from './MakeChanges';
import { CommentList } from './inspect/Comments';
import { Empty } from './States';
import { ChangesIcon } from './icons';

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
  const { status, project } = useBridge();
  const { log, comments, agentPreview, agentLog, locks, bridgeMayWrite, run, applied } = useSession();

  const prompt = useMemo(() => toPrompt(set), [set]);
  const empty = isEmpty(set);
  // The same names the bridge searches for on its own, so asking again
  // replaces the whole answer rather than half of it.
  const tokenNames = useMemo(() => {
    const names = new Set<string>(locks);
    for (const t of set.tokens) names.add(t.name);
    for (const e of set.elements) {
      if (e.token) names.add(e.token);
      if (e.couldBe) names.add(e.couldBe);
    }
    return [...names].filter((n) => n.startsWith('--')).sort();
  }, [set, locks]);
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

  const presence = (
    <>
      {project && <ProjectRow project={project} mayWrite={bridgeMayWrite} local={set.local} />}
      {agentPreview && <AgentPreviewRow {...agentPreview} touchesLocked={agentPreview.declares.filter((n) => locks.includes(n))} />}
      {agentLog.length > 0 && <AgentActivity entries={agentLog} />}
    </>
  );

  // What the bridge can write itself, and what stays for the agent. A token
  // already written is shown with what the page said about it, not queued.
  const queued = set.tokens.filter((t) => !t.applied);
  const writable = bridgeMayWrite && set.local ? queued.filter((t) => writeTargets(t) !== null) : [];
  const handedCount = queued.length + set.colors.length + set.system.length + set.elements.length + set.comments.length;

  if (empty && log.entries.length === 0 && comments.length === 0 && applied.length === 0) {
    return (
      <div className="flex flex-col">
        {presence}
        {/* A run that landed takes the queue with it; what it did stays in view. */}
        {run && (
          <div className="px-3 pt-3">
            <RunCard run={run} />
          </div>
        )}
        <Empty icon={<ChangesIcon className="h-6 w-6" />} title="No changes yet">
          Change a variable in Variables, edit a layer, or turn on Comment on the bar and mark
          something on the page. Whatever you do collects here, and Make changes writes it into
          your project.
        </Empty>
        {status !== 'connected' && status !== 'connecting' && (
          <div className="px-3 pb-3">
            <ConnectAgentCard />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {presence}
      <div className="flex flex-col gap-4 p-3">
        {applied.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <SectionHead title="Written" count={applied.length} />
            <p className="text-2xs text-ink-muted">Token values the bridge wrote into source, and what the page says about each.</p>
            {applied.map((w) => (
              <WrittenRow key={w.name} entry={w} names={tokenNames} />
            ))}
          </section>
        )}

        {handedCount > 0 && applied.length > 0 && <SectionHead title="Handed to the agent" count={handedCount} />}

        {queued.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <SectionHead title="Token definitions" count={queued.length} />
              {writable.length > 1 && <WriteAll tokens={writable} names={tokenNames} />}
            </div>
            <p className="text-2xs text-ink-muted">
              {writable.length
                ? 'The bridge writes a value into its definition; anything it cannot be sure of goes to the agent.'
                : 'The agent edits these definitions — not the places that use them.'}
            </p>
            {queued.map((t) => (
              <TokenRow key={t.name} token={t} mayWrite={bridgeMayWrite} local={set.local} names={tokenNames} />
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
          <p className="rounded-control bg-warn-soft px-2.5 py-2 text-2xs text-warn-ink">
            A reorder and an edit on a positional selector are both in force, so the edit may have
            moved to a different element. Check the selection on the page before sending.
          </p>
        )}

        {set.unreadable.length > 0 && (
          <p className="rounded-control bg-warn-soft px-2.5 py-2 text-2xs text-warn-ink">
            {set.unreadable.length} stylesheet(s) couldn&apos;t be read, so there may be occurrences not
            counted here.
          </p>
        )}

        {!set.local && !empty && (
          <p className="rounded-control bg-warn-soft px-2.5 py-2 text-2xs text-warn-ink">
            Edited against a deployed site rather than a local dev server — check the mapping to source
            before applying.
          </p>
        )}
      </div>

      <div className="sticky bottom-0 flex flex-col gap-1.5 border-t border-line bg-surface-app px-3 py-2">
        {/* Wherever a code is what is missing, the place to type one. */}
        {status === 'connected' || status === 'connecting' ? <MakeChanges empty={empty} local={set.local} /> : <ConnectAgentCard />}
        <div className="flex gap-2">
          <button
            onClick={() => navigator.clipboard.writeText(prompt).then(() => flash('prompt'))}
            disabled={empty}
            className="btn btn-secondary flex-1"
          >
            {copied === 'prompt' ? 'Copied' : 'Copy brief'}
          </button>
          <button
            onClick={() => download('codename-changes.json', toJson(set), 'application/json')}
            disabled={empty}
            className="btn btn-secondary"
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
      <span className="subhead">{title}</span>
      <span className="ml-auto font-mono text-2xs text-ink-muted">{count}</span>
    </div>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <span className="swatch h-3 w-3 shrink-0 rounded-[3px]" style={{ background: color }} />
  );
}

/**
 * What the agent is painting right now, with a way to take it off. It sits
 * above the queue and not in it: a preview is not a decision, so it never
 * enters the brief — the same rule as the dark preview.
 */
function AgentPreviewRow({ rules, matched, at, touchesLocked }: { rules: number; matched: number; at: string; touchesLocked: string[] }) {
  const when = new Date(at);
  const time = Number.isNaN(when.getTime()) ? '' : when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <div
      className="flex flex-col gap-0.5 border-b border-line-subtle px-3 py-2 text-xs"
      title="The agent's preview stylesheet is on the page. The dashed outlines are what it reaches. It is not part of the brief."
    >
      <div className="flex items-center gap-2">
        <i className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden />
        <span className="shrink-0 text-ink-secondary">Agent preview</span>
        <span className="min-w-0 truncate font-mono text-2xs text-ink-muted">
          {rules} {rules === 1 ? 'rule' : 'rules'} · {matched} {matched === 1 ? 'element' : 'elements'}
          {time ? ` · ${time}` : ''}
        </span>
        <button
          onClick={() => void dropAgentPreview()}
          className="btn btn-sm btn-secondary ml-auto shrink-0"
        >
          Clear
        </button>
      </div>
      {touchesLocked.length > 0 && (
        <div
          className="pl-4 font-mono text-2xs text-accent"
          title="The preview redefines a variable you locked. It stays a preview; the agent was told to keep the definition."
        >
          touches locked {touchesLocked.join(', ')}
        </div>
      )}
    </div>
  );
}

/**
 * What the agent did through the bridge, so "what did it just do" has an
 * answer without reading a terminal. History, not changes: nothing here is
 * in the brief, and Reset leaves it alone like the notes.
 */
function AgentActivity({ entries }: { entries: { at: string; what: string }[] }) {
  const [open, setOpen] = useState(false);
  const shown = [...entries].reverse().slice(0, open ? entries.length : 4);
  const time = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  return (
    <section className="flex flex-col gap-1 border-b border-line-subtle px-3 py-2">
      <div className="flex items-center gap-2 text-2xs text-ink-muted">
        <span className="font-medium">Agent activity</span>
        <span className="font-mono">{entries.length}</span>
        <button onClick={() => clearAgentLog()} aria-label="Clear agent activity" className="btn btn-sm btn-ghost ml-auto">
          Clear
        </button>
      </div>
      <ul className="flex flex-col gap-0.5">
        {shown.map((e, i) => (
          <li key={`${e.at}-${i}`} className="flex gap-2 text-2xs">
            <span className="shrink-0 font-mono text-ink-faint">{time(e.at)}</span>
            <span className="min-w-0 truncate text-ink-secondary" title={e.what}>
              {e.what}
            </span>
          </li>
        ))}
      </ul>
      {entries.length > 4 && (
        <button onClick={() => setOpen((v) => !v)} className="btn btn-sm btn-ghost -ml-2 self-start">
          {open ? 'Show fewer' : `Show all ${entries.length}`}
        </button>
      )}
    </section>
  );
}

/**
 * Which project the bridge is running in, and whether it may write to it.
 *
 * The switch is the whole consent for the one kind of write this tool makes.
 * Off until it is turned on, per project, and what it permits is narrow
 * enough to state on the row: token values, in their own definitions, in the
 * scope they were edited under — nothing inserted, nothing else touched.
 */
function ProjectRow({ project, mayWrite, local }: { project: ProjectInfo; mayWrite: boolean; local: boolean }) {
  return (
    <div className="flex flex-col gap-1 border-b border-line-subtle px-3 py-2">
      <div className="flex items-center gap-2 text-2xs">
        <span className="font-medium text-ink-muted">Project</span>
        <span className="min-w-0 truncate text-ink-secondary" title={project.path}>
          {project.name}
        </span>
        {project.branch && <span className="shrink-0 font-mono text-ink-muted">{project.branch}</span>}
        {project.dirty && (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink-faint" title="Uncommitted changes in this repository" />
        )}
      </div>
      {/* A page that is not this project's own is not evidence about it, so
          there is nothing here to say yes to. */}
      {local ? (
        <label
          className="flex items-center gap-2 text-2xs text-ink-muted"
          title="Token values only — CSS custom properties and Tailwind @theme values, each in the scope it was edited under. No new files, nothing inserted or reformatted."
        >
          <input type="checkbox" checked={mayWrite} onChange={(e) => allow('bridgeMayWrite', e.target.checked)} />
          <span>Bridge may edit definitions in {project.name}</span>
        </label>
      ) : (
        <span className="text-2xs text-ink-muted">This page is not served from {project.name}, so nothing here is applied to it.</span>
      )}
    </div>
  );
}

/**
 * The definitions a light edit of this token would be written into, or null
 * when the bridge would refuse: nothing found, a search that stopped early,
 * a definition in a token file, or definitions that disagree. The same rule
 * the bridge applies, asked here so Write is offered only where it lands.
 */
function writeTargets(t: TokenChange): Definition[] | null {
  if (t.applied || t.definedAtPartial) return null;
  const { targets, reason } = targetsFor(t.name, t.definedAt ?? [], 'light');
  if (reason || !targets.length) return null;
  if (targets.some((d) => d.kind !== 'css' && d.kind !== 'theme')) return null;
  return targets;
}

const where = (d: Definition) => `${d.file}${d.line ? `:${d.line}` : ''}`;

/**
 * One token in the queue, with where it lives when a bridge has found out.
 *
 * Write is offered only where there is nothing to decide: the definitions
 * the light side of the page reads, agreeing with each other, in a project
 * that has been allowed. A width override or a component scope is left as
 * it is and named. Everything else stays in the brief for the agent, which
 * is the normal path — this is the shortcut for the case where a language
 * model would add nothing but a round trip.
 */
function TokenRow({
  token: t,
  mayWrite,
  local,
  names,
}: {
  token: TokenChange;
  mayWrite: boolean;
  local: boolean;
  /** Every token in the queue, so a refresh replaces all their positions at once. */
  names: string[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const found = t.definedAt ?? [];
  const { targets, left, reason } = targetsFor(t.name, found, 'light');
  const writable = writeTargets(t);
  // A page that is not served from this machine is not the project's own, so
  // what it paints is not evidence about what the project's source should say.
  const canWrite = Boolean(writable && mayWrite && local);

  const write = async () => {
    if (!writable) return;
    setBusy(true);
    setError(null);
    try {
      const result = await writeAndVerify([{ name: t.name, from: t.from, to: t.to, mode: 'light' }]);
      const refused = result.refused.find((r) => r.name === t.name);
      if (refused) setError(refused.reason);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      // Either way the file may not say what the row says any more: a write
      // can move later lines, and a refusal is usually "it has moved". Ask
      // again so the position on screen is the one a second press would use.
      void refreshDefinitions(names).catch(() => {});
    }
  };

  const place = (() => {
    if (!found.length) return null;
    if (t.definedAtPartial) return `${found.length} found so far — the search did not cover the whole project`;
    if (reason) return reason.replace(`${t.name} `, '');
    return targets.map(where).join(' and ');
  })();
  const leftNote = left.length ? `${left.length} other ${left.length === 1 ? 'definition' : 'definitions'} left as ${left.length === 1 ? 'it is' : 'they are'}: ${left.map((d) => `${where(d)} (${d.context})`).join(', ')}` : '';

  return (
    <div className="rounded-control border border-line-subtle px-2 py-1.5">
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
      {place && (
        <div className="mt-1 flex items-center gap-2">
          <span
            className="min-w-0 flex-1 truncate font-mono text-2xs text-ink-muted"
            title={[found.map((d) => `${where(d)} (${d.context})`).join('\n'), leftNote].filter(Boolean).join('\n')}
          >
            {place}
          </span>
          {canWrite && (
            <button
              onClick={() => void write()}
              disabled={busy}
              className="btn btn-sm btn-secondary shrink-0"
              title={`Write ${t.to} into ${targets.map(where).join(' and ')}${leftNote ? `; ${leftNote}` : ''}`}
            >
              {busy ? 'Writing…' : 'Write'}
            </button>
          )}
        </div>
      )}
      {error && <div className="mt-1 text-2xs text-warn">{error}</div>}
    </div>
  );
}

/** Every writable token in one press: one request, one answer per name. */
function WriteAll({ tokens, names }: { tokens: TokenChange[]; names: string[] }) {
  const [busy, setBusy] = useState(false);
  const all = async () => {
    setBusy(true);
    try {
      await writeAndVerify(tokens.map((t) => ({ name: t.name, from: t.from, to: t.to, mode: 'light' as const })));
    } catch {
      // Each row reports its own refusal on the next press; nothing to say here.
    } finally {
      setBusy(false);
      void refreshDefinitions(names).catch(() => {});
    }
  };
  return (
    <button onClick={() => void all()} disabled={busy} className="btn btn-sm btn-secondary ml-auto shrink-0">
      {busy ? 'Writing…' : `Write all ${tokens.length}`}
    </button>
  );
}

/**
 * A value the bridge wrote, and what the page said about it. The override
 * is still on until the page is seen to paint the value on its own, so the
 * page looks the same throughout; what changes is the sentence under it.
 */
function WrittenRow({ entry: w, names }: { entry: WrittenEntry; names: string[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const at = `${w.file}:${w.line}`;
  const status = (() => {
    switch (w.verified) {
      case 'pending':
        return { text: `written to ${at} — asking the page`, tone: 'text-ink-muted' };
      case 'silent':
        return { text: `written to ${at} — the page has not picked it up; reload the page, or revert`, tone: 'text-warn' };
      case 'contradicted':
        return {
          text: `written to ${at} and put back: the page then painted ${w.seen ?? 'something else'}, so another definition wins the cascade`,
          tone: 'text-warn',
        };
      case 'unchecked':
        return { text: `written to ${at} — the page is showing its other side, so it could not be checked`, tone: 'text-ink-muted' };
      default:
        return { text: `written to ${at} — the page paints it`, tone: 'text-ok' };
    }
  })();
  const revert = async () => {
    if (w.from == null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await revertTokens([{ name: w.name, from: w.value, to: w.from, mode: w.scope === 'dark' ? 'dark' : 'light' }]);
      const refused = result.refused.find((r) => r.name === w.name);
      if (refused) setError(refused.reason);
      else forgetWritten(w.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      void refreshDefinitions(names).catch(() => {});
    }
  };
  return (
    <div className="rounded-control border border-line-subtle px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <code className="min-w-0 flex-1 truncate text-xs">{w.name}</code>
        {w.from && hexOf(w.from) && hexOf(w.value) && (
          <>
            <Swatch color={w.from} />
            <span className="text-2xs text-ink-muted">→</span>
            <Swatch color={w.value} />
          </>
        )}
        {w.verified === 'contradicted' ? (
          <button onClick={() => forgetWritten(w.name)} className="btn btn-sm btn-ghost shrink-0">
            Dismiss
          </button>
        ) : (
          w.from != null && (
            <button onClick={() => void revert()} disabled={busy} className="btn btn-sm btn-ghost shrink-0" title={`Write ${w.from} back into ${at}`}>
              {busy ? 'Reverting…' : 'Revert'}
            </button>
          )
        )}
      </div>
      <div className="mt-0.5 flex items-center gap-2 text-2xs text-ink-muted">
        <span className="tabular-nums">
          {w.from ?? '…'} → {w.value}
        </span>
        {w.scope && <span className="ml-auto">{w.scope}</span>}
      </div>
      <div className={`mt-1 font-mono text-2xs ${status.tone}`}>{status.text}</div>
      {error && <div className="mt-1 text-2xs text-warn">{error}</div>}
    </div>
  );
}
