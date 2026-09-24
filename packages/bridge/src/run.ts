/**
 * One run of a coding agent, started from the panel's Make changes.
 *
 * The bridge is already in the project folder, so it starts the agent there,
 * hands it the brief, and reports what it does as it does it. The report is
 * a whole snapshot every time rather than a stream of deltas: the panel may
 * close and come back mid-run, and a snapshot needs no history to be read.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { RunSnapshot } from '../../../shared/protocol';
import { standingRules } from '../../../studio/commit';
import { relativeTo, SIGNED_OUT, type Found } from './agents';

/** Enough to see where it went; the panel shows the last few. */
const MAX_STEPS = 60;
/** A run that has not finished in this long is not going to. */
export const RUN_LIMIT_MS = 15 * 60_000;

/** What the agent is told, around the brief the panel wrote. */
export function buildRunPrompt(brief: string, locks: string[] = []): string {
  return [
    'You are applying a design change a person made on their live page in Codename. They pressed "Make changes" and are not watching this run, so do not ask questions: do the work, then stop.',
    '',
    '- Edit source files in this folder only. Do not run commands, install anything, or use git.',
    "- Codename's own tools are not available in this run. Where the brief does not already say where something is defined, search the repository yourself.",
    '- When you are done, say in one or two sentences what you changed, file by file. If you changed nothing, say why.',
    '',
    standingRules(locks),
    '',
    '---',
    '',
    brief.trim(),
  ].join('\n');
}

export interface RunOptions {
  runId: string;
  cwd: string;
  found: Found;
  prompt: string;
  onUpdate(snapshot: RunSnapshot): void;
  spawnProcess?: typeof spawn;
  now?: () => Date;
  limitMs?: number;
}

export interface Run {
  snapshot(): RunSnapshot;
  cancel(): void;
  /** Resolves with the final snapshot, whatever the ending. */
  finished: Promise<RunSnapshot>;
}

export function startRun(opts: RunOptions): Run {
  const { cwd, found, prompt, onUpdate } = opts;
  const { agent, bin } = found;
  const spawnProcess = opts.spawnProcess ?? spawn;
  const now = opts.now ?? (() => new Date());

  const snap: RunSnapshot = {
    runId: opts.runId,
    agent: agent.id,
    agentName: agent.name,
    status: 'running',
    steps: [],
    files: [],
    filesKnown: agent.reportsFiles,
    startedAt: now().toISOString(),
  };
  const copy = (): RunSnapshot => ({ ...snap, steps: [...snap.steps], files: [...snap.files] });
  const publish = () => onUpdate(copy());

  let cancelled = false;
  let timedOut = false;
  let failedWith: string | null = null;
  let summary: string | undefined;
  let stderrTail = '';

  const step = (text: string) => {
    if (snap.steps.at(-1)?.text === text) return;
    snap.steps = [...snap.steps, { at: now().toISOString(), text }].slice(-MAX_STEPS);
  };

  let resolveFinished!: (s: RunSnapshot) => void;
  const finished = new Promise<RunSnapshot>((r) => (resolveFinished = r));
  let ended = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const end = (status: RunSnapshot['status'], error?: string) => {
    if (ended) return;
    ended = true;
    clearTimeout(timer);
    snap.status = status;
    snap.endedAt = now().toISOString();
    if (summary) snap.summary = summary;
    if (error && SIGNED_OUT.test(error)) {
      const fix = agent.signIn(bin);
      snap.error = fix.text;
      if (fix.command) snap.fix = fix.command;
    } else if (error) snap.error = error;
    publish();
    resolveFinished(copy());
  };

  const inv = agent.invocation(bin, prompt);
  let child: ChildProcess;
  try {
    child = spawnProcess(inv.cmd, inv.args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      // Its own process group, so Cancel stops whatever it started too.
      detached: process.platform !== 'win32',
    });
  } catch (err) {
    snap.status = 'failed';
    snap.error = `${agent.name} could not be started: ${err instanceof Error ? err.message : String(err)}`;
    snap.endedAt = now().toISOString();
    publish();
    return { snapshot: copy, cancel: () => {}, finished: Promise.resolve(copy()) };
  }

  timer = setTimeout(() => {
    timedOut = true;
    kill();
  }, opts.limitMs ?? RUN_LIMIT_MS);

  const kill = () => {
    try {
      if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM');
      else child.kill('SIGTERM');
    } catch {
      child.kill?.('SIGTERM');
    }
  };

  publish();

  child.on('error', (err: NodeJS.ErrnoException) => {
    end('failed', err.code === 'ENOENT' ? `${agent.name} was not found at ${bin}` : `${agent.name} could not be started: ${err.message}`);
  });

  if (child.stdout) {
    createInterface({ input: child.stdout }).on('line', (line) => {
      const parsed = agent.parse(line);
      if (!parsed) return;
      if (parsed.kind === 'step') {
        // Any path in the line is shown from the project, not from the disk root.
        const root = cwd.endsWith('/') ? cwd : `${cwd}/`;
        step(parsed.text.split(root).join(''));
        if (parsed.file) {
          const rel = relativeTo(cwd, parsed.file);
          if (!snap.files.includes(rel)) snap.files = [...snap.files, rel];
        }
        publish();
      } else if (parsed.kind === 'done') {
        // A tool that streams its last message in chunks: the chunks join.
        if (parsed.summary) summary = agent.id === 'gemini' && summary && !parsed.summary.startsWith(summary) ? summary + parsed.summary : parsed.summary;
      } else {
        failedWith = parsed.error;
      }
    });
  }
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-2000);
  });

  if (child.stdin) {
    child.stdin.on('error', () => {});
    if (inv.stdin !== undefined) child.stdin.end(inv.stdin);
    else child.stdin.end();
  }

  child.on('close', (code: number | null) => {
    if (cancelled) return end('cancelled');
    if (timedOut) return end('failed', `${agent.name} was stopped after ${Math.round((opts.limitMs ?? RUN_LIMIT_MS) / 60_000)} minutes without finishing.`);
    if (failedWith) return end('failed', failedWith);
    if (code === 0) return end('done');
    const tail = stderrTail.trim().split('\n').filter(Boolean).at(-1);
    end('failed', tail || `${agent.name} exited with code ${code ?? 'unknown'}.`);
  });

  return {
    snapshot: copy,
    cancel() {
      if (ended) return;
      cancelled = true;
      kill();
    },
    finished,
  };
}
