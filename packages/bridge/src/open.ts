/**
 * `codename-bridge open`: start the project's dev server and put a browser in
 * front of it.
 *
 * The extension cannot start a server and the agent should not have to be
 * asked to. This is the part of a desktop app that was actually worth having
 * — one command between a folder and a page with the panel on it — without
 * shipping a browser to get it.
 *
 * It does not run the MCP server: the agent starts that. Two terminals, and
 * the README says so.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The first URL on the local machine that a dev server prints. */
export function firstLocalUrl(text: string): string | null {
  const match = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:\/\S*)?/i.exec(text);
  if (!match) return null;
  // 0.0.0.0 means "every interface"; a browser wants a real one.
  return match[0].replace('0.0.0.0', 'localhost').replace(/[.,)\]]+$/, '');
}

const LOCKFILES: [string, string][] = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['bun.lock', 'bun'],
  ['package-lock.json', 'npm'],
];

/** Which package manager this project is using, by the lockfile it keeps. */
export function packageManager(dir: string, exists = existsSync): string {
  for (const [file, manager] of LOCKFILES) if (exists(join(dir, file))) return manager;
  return 'npm';
}

export interface Command {
  cmd: string;
  args: string[];
  /** The script name, for the line printed before it runs. */
  script?: string;
}

/** The command that starts this project, or null when its package.json has none. */
export function devCommand(dir: string, read = readFileSync, exists = existsSync): Command | null {
  let scripts: Record<string, unknown> = {};
  try {
    const raw = JSON.parse(String(read(join(dir, 'package.json'), 'utf8'))) as { scripts?: Record<string, unknown> };
    scripts = raw.scripts ?? {};
  } catch {
    return null;
  }
  const name = ['dev', 'start', 'serve'].find((s) => typeof scripts[s] === 'string');
  if (!name) return null;
  const manager = packageManager(dir, exists);
  return { cmd: manager, args: manager === 'npm' ? ['run', name] : [name], script: name };
}

/** How this platform opens a URL in the person's own browser. */
export function openCommand(url: string, platform = process.platform, browser?: string): Command {
  if (platform === 'darwin') return { cmd: 'open', args: browser ? ['-a', browser, url] : [url] };
  if (platform === 'win32') return { cmd: 'cmd', args: ['/c', 'start', '', url] };
  return { cmd: 'xdg-open', args: [url] };
}

export interface OpenOptions {
  dir: string;
  /** A command to run instead of the project's dev script. */
  cmd?: string;
  /** A URL to open instead of waiting for the server to print one. */
  url?: string;
  browser?: string;
  /** How long to wait for a URL before giving up on finding one. */
  waitMs?: number;
  log: (line: string) => void;
  spawnProcess?: typeof spawn;
  /** Whether a bridge is already running here, and what it is waiting for. */
  running?: () => { token: string; port: number } | null;
  onOpen?: (command: Command) => void;
  /** Where the dev server's own output is echoed; its terminal, normally. */
  out?: { write(text: string): unknown };
  err?: { write(text: string): unknown };
}

export interface OpenResult {
  child: ChildProcess | null;
  /** Resolves with the URL that was opened, or null when none was found. */
  opened: Promise<string | null>;
}

export function runOpen(opts: OpenOptions): OpenResult {
  const { dir, log, waitMs = 60_000 } = opts;
  const spawnProcess = opts.spawnProcess ?? spawn;

  const bridge = opts.running?.() ?? null;
  // The bridge prints its code to an stderr the agent swallows, so this is
  // where a person actually gets to read it.
  if (bridge) log(`Pairing code: ${bridge.token}  (enter it in the panel, on the Changes tab)`);
  else log('No agent is running in this folder yet. Start Claude Code or Cursor here; it launches the bridge.');

  const command: Command | null = opts.cmd
    ? { cmd: process.platform === 'win32' ? 'cmd' : 'sh', args: process.platform === 'win32' ? ['/c', opts.cmd] : ['-c', opts.cmd] }
    : devCommand(dir);

  if (!command && !opts.url) {
    log(`No dev, start or serve script in ${dir}. Pass --cmd "…" to say how to start it, or --url to open one that is already running.`);
    return { child: null, opened: Promise.resolve(null) };
  }

  let child: ChildProcess | null = null;
  if (command) {
    log(`> ${command.cmd} ${command.args.join(' ')}`);
    child = spawnProcess(command.cmd, command.args, { cwd: dir, stdio: ['inherit', 'pipe', 'pipe'] });
  }

  const opened = new Promise<string | null>((resolve) => {
    let done = false;
    const finish = (url: string | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (!url) {
        log('Could not tell what URL the server is on. Open it yourself and click the Codename icon.');
        resolve(null);
        return;
      }
      const open = openCommand(url, process.platform, opts.browser);
      opts.onOpen?.(open);
      if (!opts.onOpen) spawnProcess(open.cmd, open.args, { stdio: 'ignore', detached: true }).unref?.();
      log(`Opened ${url}. Click the Codename icon to put the panel on it.`);
      log(bridge ? '  Then enter the pairing code above.' : '  Start your agent in this folder, then pair the panel with its code.');
      resolve(url);
    };

    const timer = setTimeout(() => finish(opts.url ?? null), waitMs);

    if (opts.url) {
      // A URL given by hand needs no waiting.
      finish(opts.url);
      return;
    }

    // The server's own output is the only reliable word on which port it got.
    const watch = (stream: NodeJS.ReadableStream | null, to: { write(text: string): unknown }) => {
      stream?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        to.write(text);
        if (!done) {
          const url = firstLocalUrl(text);
          if (url) finish(url);
        }
      });
    };
    watch(child?.stdout ?? null, opts.out ?? process.stdout);
    watch(child?.stderr ?? null, opts.err ?? process.stderr);
    child?.on('exit', (code) => {
      if (!done) finish(null);
      log(`dev server exited with ${code ?? 0}`);
    });
  });

  return { child, opened };
}
