import { useEffect, useState } from 'react';
import type { AgentInfo, ProjectInfo, RunSnapshot, TerminalCommand } from '@/shared/protocol';
import { cancelRun, makeChanges, refreshAgents, terminalCommand, useBridge } from '../lib/bridge';
import { allowRun, chooseAgent, updateSession, useSession } from '../lib/session';
import { CheckIcon, CopyIcon } from './icons';

/**
 * The one action on the Changes tab: make the change in source.
 *
 * The bridge runs the person's own coding agent in the project folder on the
 * brief, and its steps come back here as it works. The first run of an agent
 * in a project asks first, in one row that names the agent and what it can
 * and cannot do — Claude Code can be held to editing files; Cursor and Codex
 * can run commands too, and the row says so.
 */
export function MakeChanges({ empty, local }: { empty: boolean; local: boolean }) {
  const { status, project, agents: listed } = useBridge();
  // A bridge from before Make changes sends no list at all.
  const outdated = listed === null;
  const agents = listed ?? [];
  const { run, agentsMayRun, agentChoice } = useSession();
  const [consent, setConsent] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The same brief for the person's own terminal session, when they would rather.
  const [terminal, setTerminal] = useState<TerminalCommand | null>(null);

  const connected = status === 'connected';
  const agent = agents.find((a) => a.id === agentChoice) ?? agents[0] ?? null;
  const running = run?.status === 'running';

  const go = async (id: string) => {
    setError(null);
    setStarting(true);
    try {
      await makeChanges(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  };

  const press = () => {
    if (running) {
      void cancelRun().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
      return;
    }
    if (!agent) return;
    if (!agentsMayRun.includes(agent.id)) {
      setConsent(true);
      return;
    }
    void go(agent.id);
  };

  const allowAndGo = () => {
    if (!agent) return;
    setConsent(false);
    if (allowRun(agent.id)) void go(agent.id);
    else setError('The bridge has not said which project it is in yet; try again in a moment.');
  };

  // Why the button is off, when it is, in the words of what to do about it.
  const note = !connected
    ? 'Looking for the bridge — run npx codename-bridge open in your project.'
    : !local
      ? `This page is not served from ${project?.name ?? 'the bridge’s project'}, so there is nothing here to change in source.`
      : outdated
        ? 'The bridge running for this project is older than Make changes. Stop it — close the agent session that started it — and run npx codename-bridge open . in the project.'
        : !agent
        ? 'No coding agent found on this machine. Make changes runs Claude Code, Gemini CLI, Cursor (cursor-agent) or Codex; install one and sign in.'
        : agent.signIn
          ? agent.signIn.text
          : `${agent.name} edits the files in ${project?.name ?? 'your project'}. Review the diff as usual.`;
  // Shown with the note, when the one thing in the way is a command away.
  const fix = connected && local && agent?.signIn?.command ? agent.signIn.command : null;

  const disabled = running ? false : empty || !connected || !local || !agent || Boolean(agent?.signIn) || starting;
  // A terminal session is the person's, signed in or not as they find it; only the brief has to exist.
  const canTerminal = connected && local && !empty && !running && !!agent?.terminal;
  const inTerminal = async () => {
    if (!agent) return;
    setError(null);
    try {
      setTerminal(await terminalCommand(agent.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // Signing in happens in a terminal, so coming back to this window is the
  // moment to ask whether it worked.
  useEffect(() => {
    if (!fix) return;
    const again = () => void refreshAgents().catch(() => {});
    window.addEventListener('focus', again);
    return () => window.removeEventListener('focus', again);
  }, [fix]);

  return (
    <div className="flex flex-col gap-1.5">
      {run && <RunCard run={run} />}

      {consent && agent && project && (
        <ConsentRow agent={agent} project={project} onAllow={allowAndGo} onCancel={() => setConsent(false)} />
      )}

      {!run && !consent && <p className="text-2xs text-ink-muted">{note}</p>}
      {!run && fix && (
        <>
          <Command text={fix} />
          <button onClick={() => void refreshAgents().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))} className="btn btn-sm btn-secondary self-start">
            Check again
          </button>
        </>
      )}

      <div className="flex gap-1.5">
        <button
          onClick={press}
          disabled={disabled}
          title={running ? `Stop ${run?.agentName}` : agent ? `Run ${agent.name} on these changes in ${project?.name ?? 'the project'}` : note}
          className={`btn btn-lg flex-1 ${running ? 'btn-secondary' : 'btn-primary'}`}
        >
          {running ? 'Working… · Cancel' : starting ? 'Starting…' : 'Make changes'}
        </button>
        {agents.length > 1 && (
          <select
            value={agent?.id ?? ''}
            onChange={(e) => {
              chooseAgent(e.target.value);
              setConsent(false);
            }}
            disabled={running}
            aria-label="Agent that makes the changes"
            className="field field-select h-auto w-28 shrink-0"
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {canTerminal && !terminal && (
        <button onClick={() => void inTerminal()} className="btn btn-sm btn-ghost self-start" title={`Start ${agent?.name} on this brief in your own terminal instead — your session, your plan, your permissions`}>
          Or run it in a terminal
        </button>
      )}
      {terminal && (
        <div className="flex flex-col gap-1.5" data-testid="terminal-command">
          <p className="text-2xs text-ink-muted">
            Paste this in a terminal: it opens {agent?.name} on the brief in {project?.name ?? 'the project'}, in your own session. The panel does not see it work, so
            once the change is in, Reset on the bar lets go of these edits.
          </p>
          <Command text={terminal.command} />
          <button onClick={() => setTerminal(null)} className="btn btn-sm btn-ghost self-start">
            Done
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-2xs text-warn">
          {error}
        </p>
      )}
    </div>
  );
}

function ConsentRow({
  agent,
  project,
  onAllow,
  onCancel,
}: {
  agent: AgentInfo;
  project: ProjectInfo;
  onAllow: () => void;
  onCancel: () => void;
}) {
  return (
    <div role="group" aria-label={`Allow ${agent.name}`} className="flex flex-col gap-2 rounded-control border border-line bg-surface-panel p-2.5">
      <p className="text-xs text-ink">
        Let {agent.name} edit files in {project.name}?
      </p>
      <p className="text-2xs text-ink-muted">{agent.can} Codename asks once for each project.</p>
      <div className="flex gap-1.5">
        <button onClick={onAllow} className="btn btn-sm btn-primary">
          Allow and make changes
        </button>
        <button onClick={onCancel} className="btn btn-sm btn-secondary">
          Not now
        </button>
      </div>
    </div>
  );
}

/** A command to paste into a terminal, with a way to copy it. */
function Command({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  return (
    <div className="flex items-start gap-1.5">
      <code className="min-w-0 flex-1 rounded-control bg-surface-field px-2 py-1.5 font-mono text-2xs break-all whitespace-pre-wrap">{text}</code>
      <button
        onClick={() => void copy()}
        className="flex h-control w-6 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-surface-field hover:text-ink"
        aria-label="Copy command"
        title={copied ? 'Copied' : 'Copy'}
      >
        {copied ? <CheckIcon className="h-3 w-3 text-accent" /> : <CopyIcon className="h-3 w-3" />}
      </button>
    </div>
  );
}

/** How long ago, in the few words a glance needs. */
function took(run: RunSnapshot): string {
  const start = Date.parse(run.startedAt);
  const end = run.endedAt ? Date.parse(run.endedAt) : Date.now();
  const s = Math.max(0, Math.round((end - start) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

/**
 * What the agent is doing, or did. The last few steps while it works; what
 * it changed, or why it stopped, once it has. Dismissed by hand, so the
 * answer stays on screen until it has been read.
 */
export function RunCard({ run }: { run: RunSnapshot }) {
  const running = run.status === 'running';
  // The clock moves while it works, between steps as well as on them.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  const head =
    run.status === 'running'
      ? `${run.agentName} is working`
      : run.status === 'done'
        ? run.files.length
          ? `Done · ${run.files.length} ${run.files.length === 1 ? 'file' : 'files'} changed`
          : run.filesKnown === false
            ? `${run.agentName} finished`
            : `${run.agentName} changed nothing`
        : run.status === 'cancelled'
          ? 'Cancelled'
          : `${run.agentName} stopped`;
  const tone = run.status === 'failed' ? 'text-warn' : run.status === 'done' && run.files.length ? 'text-ok' : 'text-ink-secondary';
  const steps = run.steps.slice(-4);

  return (
    <section aria-label="Make changes" aria-live="polite" className="flex flex-col gap-1.5 rounded-control border border-line-subtle p-2.5">
      <div className="flex items-center gap-2 text-xs">
        {running && <i className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent motion-reduce:animate-none" aria-hidden />}
        <span className={`font-medium ${tone}`}>{head}</span>
        <span className="font-mono text-2xs text-ink-muted">{took(run)}</span>
        {!running && (
          <button onClick={() => updateSession({ run: null })} className="btn btn-sm btn-ghost ml-auto">
            Dismiss
          </button>
        )}
      </div>

      {running && (
        <ul className="flex flex-col gap-0.5">
          {steps.length === 0 && <li className="text-2xs text-ink-muted">Reading the brief…</li>}
          {steps.map((s, i) => (
            <li key={`${s.at}-${i}`} className={`truncate font-mono text-2xs ${i === steps.length - 1 ? 'text-ink-secondary' : 'text-ink-muted'}`} title={s.text}>
              {s.text}
            </li>
          ))}
        </ul>
      )}

      {!running && run.files.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {run.files.map((f) => (
            <li key={f} className="truncate font-mono text-2xs text-ink-secondary" title={f}>
              {f}
            </li>
          ))}
        </ul>
      )}

      {!running && run.error && <p className="text-2xs text-warn">{run.error}</p>}
      {!running && run.fix && <Command text={run.fix} />}
      {!running && run.summary && <p className="text-2xs text-ink-muted">{run.summary}</p>}
      {run.status === 'done' && run.files.length > 0 && (
        <p className="text-2xs text-ink-muted">Your edits are in source now, so the panel let go of them. Review the diff as usual.</p>
      )}
      {run.status === 'done' && run.filesKnown === false && (
        <p className="text-2xs text-ink-muted">
          {run.agentName} does not say which files it changed, so your edits are still here. Check the diff; once the change is
          in source, Reset on the bar lets go of them.
        </p>
      )}
      {(run.status === 'failed' || run.status === 'cancelled' || (run.status === 'done' && !run.files.length && run.filesKnown !== false)) && (
        <p className="text-2xs text-ink-muted">Your edits are still here; press Make changes to try again.</p>
      )}
    </section>
  );
}
