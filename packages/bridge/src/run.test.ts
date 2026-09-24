import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import type { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import type { Envelope, RunSnapshot } from '../../../shared/protocol';
import { AGENTS, type Found } from './agents';
import { Runs } from './host';
import { buildRunPrompt, startRun } from './run';
import { Sessions } from './sessions';
import { makeState } from './test-helpers';

/** A child process that says what the test tells it to. */
class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdin = new PassThrough();
  pid = 4242;
  killed: string | null = null;
  written = '';
  constructor() {
    super();
    this.stdin.on('data', (d: Buffer) => (this.written += d.toString()));
  }
  kill(signal: string) {
    this.killed = signal;
    this.finish(null);
    return true;
  }
  say(...lines: unknown[]) {
    for (const l of lines) this.stdout.write(`${typeof l === 'string' ? l : JSON.stringify(l)}\n`);
  }
  finish(code: number | null) {
    this.stdout.end();
    this.stderr.end();
    // After the streams, as a real child's `close` is.
    setImmediate(() => this.emit('close', code));
  }
}

const fakeSpawn = () => {
  const calls: { cmd: string; args: string[]; opts: Record<string, unknown> }[] = [];
  let child!: FakeChild;
  const fn = ((cmd: string, args: string[], opts: Record<string, unknown>) => {
    calls.push({ cmd, args, opts });
    child = new FakeChild();
    return child;
  }) as unknown as typeof spawn;
  return { fn, calls, child: () => child };
};

const claude: Found = { agent: AGENTS.claude, bin: '/bin/claude' };
const tick = () => new Promise((r) => setImmediate(r));

const edit = (path: string) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: path } }] } });
const read = (path: string) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: path } }] } });

// A real `process.kill(-pid)` would hit whatever holds that pid; the fake
// child is killed through its own method instead.
const noGroup = <T>(f: () => T): T => {
  const real = process.kill;
  (process as unknown as { kill: unknown }).kill = () => {
    throw new Error('no such process group');
  };
  try {
    return f();
  } finally {
    (process as unknown as { kill: unknown }).kill = real;
  }
};

describe('buildRunPrompt', () => {
  it('wraps the brief in how to behave, with the standing rules and the locks', () => {
    const p = buildRunPrompt('Apply a design change I made against localhost:5173.\n\n- move x', ['--ink']);
    expect(p).toMatch(/not watching this run/);
    expect(p).toMatch(/Do not run commands/);
    expect(p).toMatch(/Edit the definition of each token named/);
    expect(p).toMatch(/Keep these tokens exactly as they are.*`--ink`/);
    expect(p.trim().endsWith('- move x')).toBe(true);
  });
});

describe('startRun', () => {
  it('starts the agent in the folder, feeds it the brief, and reports each step', async () => {
    const s = fakeSpawn();
    const seen: RunSnapshot[] = [];
    const run = startRun({ runId: 'r1', cwd: '/p', found: claude, prompt: 'BRIEF', spawnProcess: s.fn, onUpdate: (x) => seen.push(x) });
    expect(s.calls[0]).toMatchObject({ cmd: '/bin/claude', opts: { cwd: '/p' } });
    expect(seen[0]).toMatchObject({ runId: 'r1', agent: 'claude', agentName: 'Claude Code', status: 'running', steps: [], filesKnown: true });

    s.child().say(read('/p/src/Glyphs.tsx'), 'not json', edit('/p/src/Glyphs.tsx'), edit('/p/src/Glyphs.tsx'), {
      type: 'result',
      is_error: false,
      result: 'Swapped the two glyph-set buttons in src/Glyphs.tsx.',
    });
    await tick();
    s.child().finish(0);
    const last = await run.finished;

    expect(s.child().written).toBe('BRIEF');
    expect(last.status).toBe('done');
    // Paths are shown from the project, and a repeated step is shown once.
    expect(last.steps.map((x) => x.text)).toEqual(['Reading src/Glyphs.tsx', 'Editing src/Glyphs.tsx']);
    expect(last.files).toEqual(['src/Glyphs.tsx']);
    expect(last.summary).toBe('Swapped the two glyph-set buttons in src/Glyphs.tsx.');
    expect(last.endedAt).toBeTruthy();
    expect(seen.at(-1)).toEqual(last);
  });

  it('fails with what the agent said when its result is an error', async () => {
    const s = fakeSpawn();
    const run = startRun({ runId: 'r', cwd: '/p', found: claude, prompt: 'B', spawnProcess: s.fn, onUpdate: () => {} });
    s.child().say({ type: 'result', is_error: true, result: 'Could not find the component' });
    await tick();
    s.child().finish(1);
    expect(await run.finished).toMatchObject({ status: 'failed', error: 'Could not find the component' });
  });

  it('turns a sign-in failure into what to do about it', async () => {
    const s = fakeSpawn();
    const run = startRun({ runId: 'r', cwd: '/p', found: claude, prompt: 'B', spawnProcess: s.fn, onUpdate: () => {} });
    s.child().stderr.write('Error: Not logged in · Please run /login\n');
    await tick();
    s.child().finish(1);
    const last = await run.finished;
    expect(last.error).toBe(AGENTS.claude.signIn('/bin/claude').text);
    expect(last.fix).toBe('/bin/claude auth login');
  });

  it('fails with the last line of stderr on a bare non-zero exit', async () => {
    const s = fakeSpawn();
    const run = startRun({ runId: 'r', cwd: '/p', found: claude, prompt: 'B', spawnProcess: s.fn, onUpdate: () => {} });
    s.child().stderr.write('warming\nsomething broke\n');
    await tick();
    s.child().finish(2);
    expect(await run.finished).toMatchObject({ status: 'failed', error: 'something broke' });
  });

  it('fails plainly when the tool is not there', async () => {
    const s = fakeSpawn();
    const run = startRun({ runId: 'r', cwd: '/p', found: claude, prompt: 'B', spawnProcess: s.fn, onUpdate: () => {} });
    s.child().emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }));
    expect(await run.finished).toMatchObject({ status: 'failed', error: 'Claude Code was not found at /bin/claude' });
  });

  it('is cancelled, not failed, when the person stops it', async () => {
    const s = fakeSpawn();
    const run = startRun({ runId: 'r', cwd: '/p', found: claude, prompt: 'B', spawnProcess: s.fn, onUpdate: () => {} });
    noGroup(() => run.cancel());
    expect(s.child().killed).toBe('SIGTERM');
    expect((await run.finished).status).toBe('cancelled');
  });

  it('stops a run that goes on too long', async () => {
    const s = fakeSpawn();
    const run = startRun({ runId: 'r', cwd: '/p', found: claude, prompt: 'B', spawnProcess: s.fn, onUpdate: () => {}, limitMs: 5 });
    const real = process.kill;
    (process as unknown as { kill: unknown }).kill = () => {
      throw new Error('no such process group');
    };
    try {
      const last = await run.finished;
      expect(last.status).toBe('failed');
      expect(last.error).toMatch(/stopped after/);
    } finally {
      (process as unknown as { kill: unknown }).kill = real;
    }
  });
});

describe('Runs', () => {
  const setup = (state = makeState('s', 1), loggedIn: boolean | 'garbled' = true) => {
    const sessions = new Sessions();
    const sent: Envelope[] = [];
    sessions.connect('s', { send: (e) => sent.push(e) });
    sessions.update('s', state);
    const s = fakeSpawn();
    const asked: string[][] = [];
    const exec = (_cmd: string, args: string[]) => {
      asked.push(args);
      return { status: 0, stdout: loggedIn === 'garbled' ? 'nope' : JSON.stringify({ loggedIn }) };
    };
    const runs = new Runs({ cwd: '/p', sessions, agents: [claude], log: () => {}, spawnProcess: s.fn, exec });
    return { runs, sent, s, asked };
  };
  const ask = { method: 'run_agent' as const, agent: 'claude', brief: 'Apply this.', locks: [], mayRun: true };

  it('names the agents it can run', () => {
    expect(setup().runs.info()).toEqual([{ id: 'claude', name: 'Claude Code', can: AGENTS.claude.can, terminal: true }]);
  });

  it('says before the first press when Claude Code is not signed in, with the command for the copy it found', () => {
    const { runs, asked } = setup(undefined, false);
    expect(runs.info()[0]?.signIn).toEqual({ text: AGENTS.claude.signIn('/bin/claude').text, command: '/bin/claude auth login' });
    // Asked of the tool itself, and not again on the next hello.
    runs.info();
    expect(asked).toEqual([['auth', 'status']]);
  });

  it('asks again when the panel says something may have changed', () => {
    const { runs, asked } = setup(undefined, false);
    runs.info();
    runs.refresh();
    expect(asked).toHaveLength(2);
  });

  it('says nothing about sign-in when the tool gives no clear answer', () => {
    expect(setup(undefined, 'garbled').runs.info()[0]?.signIn).toBeUndefined();
  });

  it('asks again at the press, and refuses a signed-out run before starting it', () => {
    const { runs, s, asked } = setup(undefined, false);
    runs.info();
    expect(() => runs.start('s', ask)).toThrow(/auth login/);
    expect(asked).toHaveLength(2);
    expect(s.calls).toHaveLength(0);
  });

  it.each([
    ['without the person’s consent', { mayRun: false }, undefined, /not been allowed/],
    ['with nothing to make', { brief: '  ' }, undefined, /no changes/],
    ['with an agent that is not here', { agent: 'codex' }, undefined, /codex was not found/],
    ['for a page that is not served from here', {}, makeState('s', 1, { tab: { id: 1, url: 'https://x.com', origin: 'https://x.com', title: '', local: false } }), /not served from this machine/],
  ])('refuses a run %s', (_why, patch, state, error) => {
    const { runs, s } = setup(state);
    expect(() => runs.start('s', { ...ask, ...patch })).toThrow(error);
    expect(s.calls).toHaveLength(0);
  });

  it('writes the brief to a file for a terminal and answers with the command, running nothing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codename-briefs-'));
    const sessions = new Sessions();
    const s = fakeSpawn();
    const runs = new Runs({ cwd: '/p', sessions, agents: [claude], log: () => {}, spawnProcess: s.fn, briefsDir: dir });
    const { command, file } = runs.terminal({ method: 'terminal_command', agent: 'claude', brief: 'Apply this.', locks: ['--mark'] });
    expect(file.startsWith(dir)).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe(buildRunPrompt('Apply this.', ['--mark']));
    expect(command).toBe(`cd '/p' && '/bin/claude' "$(cat '${file}')"`);
    expect(runs.info()[0]?.terminal).toBe(true);
    expect(s.calls).toHaveLength(0);
    expect(() => runs.terminal({ method: 'terminal_command', agent: 'codex', brief: 'x', locks: [] })).toThrow(/not found/);
    expect(() => runs.terminal({ method: 'terminal_command', agent: 'claude', brief: ' ', locks: [] })).toThrow(/no changes/);
    rmSync(dir, { recursive: true, force: true });
  });

  it('runs one at a time, sends each snapshot to the panel, and keeps the last', async () => {
    const { runs, sent, s } = setup();
    const { runId } = runs.start('s', ask);
    expect(() => runs.start('s', ask)).toThrow(/still working/);
    s.child().say(edit('/p/a.css'));
    await tick();
    s.child().finish(0);
    await tick();
    await tick();
    const frames = sent.filter((e) => e.type === 'run').map((e) => e.payload as RunSnapshot);
    expect(frames.every((f) => f.runId === runId)).toBe(true);
    expect(frames.at(-1)).toMatchObject({ status: 'done', files: ['a.css'] });
    expect(runs.latest()).toMatchObject({ status: 'done' });
    // Free again once it landed.
    expect(() => runs.start('s', ask)).not.toThrow();
  });

  it('stops a run that is going when the bridge shuts down', async () => {
    const { runs, s } = setup();
    runs.stop();
    runs.start('s', ask);
    noGroup(() => runs.stop());
    expect(s.child().killed).toBe('SIGTERM');
  });

  it('cancels the run that is going, and says so when there is none', async () => {
    const { runs, s } = setup();
    expect(() => runs.cancel()).toThrow(/nothing is running/);
    runs.start('s', ask);
    noGroup(() => runs.cancel());
    await tick();
    await tick();
    expect(s.child().killed).toBe('SIGTERM');
    expect(runs.latest()?.status).toBe('cancelled');
  });
});
