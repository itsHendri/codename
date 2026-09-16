import { describe, expect, it, vi } from 'vitest';
import { devCommand, firstLocalUrl, openCommand, packageManager, runOpen } from './open';

describe('firstLocalUrl', () => {
  it.each([
    ['  ➜  Local:   http://localhost:5173/', 'http://localhost:5173/'],
    ['ready - started server on 0.0.0.0:3000, url: http://localhost:3000', 'http://localhost:3000'],
    ['Listening on http://127.0.0.1:8080', 'http://127.0.0.1:8080'],
    ['Server running at http://0.0.0.0:4321/', 'http://localhost:4321/'],
  ])('reads %s', (line, expected) => {
    expect(firstLocalUrl(line)).toBe(expected);
  });

  it('ignores a URL that is not on this machine', () => {
    expect(firstLocalUrl('deployed to https://example.com')).toBe(null);
  });

  it('drops punctuation the line put after it', () => {
    expect(firstLocalUrl('open (http://localhost:3000).')).toBe('http://localhost:3000');
  });

  it('says nothing about a line with no URL', () => {
    expect(firstLocalUrl('watching for file changes...')).toBe(null);
  });
});

describe('packageManager', () => {
  it.each([
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lockb', 'bun'],
    ['package-lock.json', 'npm'],
  ])('reads %s as %s', (lockfile, expected) => {
    expect(packageManager('/repo', (p) => String(p).endsWith(lockfile))).toBe(expected);
  });

  it('assumes npm when there is no lockfile', () => {
    expect(packageManager('/repo', () => false)).toBe('npm');
  });
});

describe('devCommand', () => {
  const reading = (json: string) => (() => json) as unknown as typeof import('node:fs').readFileSync;

  it('prefers dev, and spells it the way the package manager wants', () => {
    const scripts = reading(JSON.stringify({ scripts: { build: 'x', dev: 'vite', start: 'node .' } }));
    expect(devCommand('/repo', scripts, () => false)).toMatchObject({ cmd: 'npm', args: ['run', 'dev'] });
    expect(devCommand('/repo', scripts, (p) => String(p).endsWith('pnpm-lock.yaml'))).toMatchObject({
      cmd: 'pnpm',
      args: ['dev'],
    });
  });

  it('falls back to start, then serve', () => {
    expect(devCommand('/repo', reading(JSON.stringify({ scripts: { start: 'node .' } })), () => false)?.script).toBe('start');
    expect(devCommand('/repo', reading(JSON.stringify({ scripts: { serve: 'x' } })), () => false)?.script).toBe('serve');
  });

  it('gives back nothing when there is no script to run', () => {
    expect(devCommand('/repo', reading(JSON.stringify({ scripts: { build: 'x' } })), () => false)).toBe(null);
    expect(devCommand('/repo', reading('not json'), () => false)).toBe(null);
  });
});

describe('openCommand', () => {
  it('uses each platform\'s own opener', () => {
    expect(openCommand('http://localhost:3000', 'darwin')).toMatchObject({ cmd: 'open', args: ['http://localhost:3000'] });
    expect(openCommand('http://localhost:3000', 'darwin', 'Google Chrome')).toMatchObject({
      args: ['-a', 'Google Chrome', 'http://localhost:3000'],
    });
    expect(openCommand('http://localhost:3000', 'linux').cmd).toBe('xdg-open');
    expect(openCommand('http://localhost:3000', 'win32').cmd).toBe('cmd');
  });
});

describe('runOpen', () => {
  /** A dev server that prints one line and stays up. */
  const fakeSpawn = (line: string) => {
    const handlers: Record<string, ((chunk: Buffer) => void)[]> = {};
    const stdout = { on: (_e: string, fn: (c: Buffer) => void) => (handlers.data ??= []).push(fn) };
    const child = {
      stdout,
      stderr: { on: () => {} },
      on: () => {},
      kill: () => {},
      unref: () => {},
    };
    return {
      spawn: vi.fn(() => child) as unknown as typeof import('node:child_process').spawn,
      emit: () => handlers.data?.forEach((fn) => fn(Buffer.from(line))),
    };
  };

  it('opens the first URL the dev server prints', async () => {
    const server = fakeSpawn('  ➜  Local:   http://localhost:5173/\n');
    const opened: string[] = [];
    const result = runOpen({
      dir: '/repo',
      cmd: 'vite',
      log: () => {},
      spawnProcess: server.spawn,
      running: () => ({ token: 'K7M4XQ', port: 9612 }),
      out: { write: () => {} },
      onOpen: (c) => opened.push(c.args.join(' ')),
    });
    server.emit();
    await expect(result.opened).resolves.toBe('http://localhost:5173/');
    expect(opened).toHaveLength(1);
  });

  it('opens a URL given by hand without waiting for output', async () => {
    const server = fakeSpawn('nothing useful\n');
    const result = runOpen({
      dir: '/repo',
      cmd: 'vite',
      url: 'http://localhost:4321',
      log: () => {},
      spawnProcess: server.spawn,
      running: () => null,
      onOpen: () => {},
    });
    await expect(result.opened).resolves.toBe('http://localhost:4321');
  });

  it('says what to do when the project has no dev script and no url', async () => {
    const lines: string[] = [];
    const result = runOpen({
      dir: '/tmp/codename-not-a-project-9f3a',
      log: (l) => lines.push(l),
      running: () => null,
      onOpen: () => {},
    });
    expect(result.child).toBe(null);
    await expect(result.opened).resolves.toBe(null);
    expect(lines.join(' ')).toMatch(/--cmd/);
  });

  it('says a bridge is not running here, and carries on anyway', async () => {
    const server = fakeSpawn('http://localhost:3000\n');
    const lines: string[] = [];
    runOpen({
      dir: '/repo',
      cmd: 'vite',
      log: (l) => lines.push(l),
      spawnProcess: server.spawn,
      running: () => null,
      onOpen: () => {},
    });
    expect(lines.join(' ')).toMatch(/No agent is running in this folder/);
  });
});
