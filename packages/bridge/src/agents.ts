/**
 * The coding agents the bridge can run on the person's behalf.
 *
 * Codename makes the change; the agent is the hands. Each entry says how to
 * find the agent's command-line tool, how to start it headless in the
 * project folder with a brief, how to read its progress, and — in words the
 * panel shows before the first run — what that tool can and cannot be held
 * to. Every agent signs in with its own account; the bridge holds no keys.
 *
 * Nothing here runs anything. `run.ts` does, with what this returns.
 */

import { spawnSync } from 'node:child_process';
import { accessSync, constants, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

export type AgentId = 'claude' | 'gemini' | 'cursor' | 'codex' | 'custom';

/** What a line of the agent's output meant, when it meant anything. */
export type AgentLine =
  | { kind: 'step'; text: string; file?: string }
  | { kind: 'done'; summary?: string }
  | { kind: 'failed'; error: string };

export interface Invocation {
  cmd: string;
  args: string[];
  /** Written to the agent's stdin and closed; absent means the prompt is in `args`. */
  stdin?: string;
}

/** How to sign a tool in: a sentence, and the command to run in a terminal. */
export interface SignIn {
  text: string;
  command: string;
}

/** Runs a command and gives back what it printed; injectable for tests. */
export type SyncExec = (cmd: string, args: string[]) => { status: number | null; stdout: string };

export const realSyncExec: SyncExec = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 8000 });
  return { status: r.status, stdout: r.stdout ?? '' };
};

/** A path a person can paste into a terminal: quoted when it has a space in it. */
export const shellPath = (bin: string): string => (/\s/.test(bin) ? `"${bin}"` : bin);

export interface Agent {
  id: AgentId;
  name: string;
  /** What this tool can be held to, said plainly, for the consent row. */
  can: string;
  /** How to put it right when its tool says it is not signed in, for the copy that was found. */
  signIn(bin: string): SignIn;
  /** Whether its output says which files it edited. */
  reportsFiles: boolean;
  /** Whether that copy is signed in: null when the tool cannot say without a run. */
  signedIn?(bin: string, exec: SyncExec): boolean | null;
  invocation(bin: string, prompt: string): Invocation;
  /** One line of output, already split. Null for lines that say nothing worth showing. */
  parse(line: string): AgentLine | null;
  /**
   * The same brief in the person's own terminal session: a command to paste
   * that starts the tool interactively on the brief, on whatever plan and
   * permissions that session has. Absent for a tool with no interactive mode.
   */
  terminal?(bin: string, briefFile: string, cwd: string): string;
}

/** A path inside single quotes, for a command a person pastes into a POSIX shell. */
export const shellQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

/** `cd` into the project, then the tool with the brief read from its file. */
const inTerminal = (bin: string, briefFile: string, cwd: string, args: string[] = []): string =>
  `cd ${shellQuote(cwd)} && ${shellQuote(bin)}${args.length ? ` ${args.join(' ')}` : ''} "$(cat ${shellQuote(briefFile)})"`;

/** Where a path lands relative to the project, for a line a person reads. */
export function relativeTo(cwd: string, path: string): string {
  const root = cwd.endsWith('/') ? cwd : `${cwd}/`;
  return path.startsWith(root) ? path.slice(root.length) : path;
}

const json = (line: string): Record<string, unknown> | null => {
  const t = line.trim();
  if (!t.startsWith('{')) return null;
  try {
    const v = JSON.parse(t) as unknown;
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/** A sign-in problem, in whatever words the tool happens to use for it. */
export const SIGNED_OUT = /not (?:logged|signed) in|please (?:run )?\/?login|invalid api key|authenticat|unauthori[sz]ed|401\b/i;

const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);
const READ_TOOLS = new Set(['Read', 'Glob', 'Grep', 'LS']);

/**
 * Claude Code, headless.
 *
 * Held to reading and editing: edits are accepted without asking, and the
 * shell and the web are refused outright. `--strict-mcp-config` with no
 * servers keeps it from starting a second copy of this bridge from the
 * person's MCP registration — everything it needs is in the prompt.
 */
const claude: Agent = {
  id: 'claude',
  name: 'Claude Code',
  reportsFiles: true,
  can: 'It can read and edit files in this folder. It cannot run commands or use the internet.',
  // The Claude desktop app signs its own sessions in and leaves its copy of
  // Claude Code signed out for anything else, so that copy has to be signed
  // in once by name — `claude` is usually not on the PATH at all.
  signIn: (bin) => ({
    text: bin.includes('/Application Support/Claude/')
      ? 'Claude Code needs signing in once for Codename; the Claude app signs in its own copy separately. Run this in a terminal, then try again:'
      : 'Claude Code is not signed in. Run this in a terminal, then try again:',
    command: `${shellPath(bin)} auth login`,
  }),
  signedIn(bin, exec) {
    const r = exec(bin, ['auth', 'status']);
    try {
      const v = JSON.parse(r.stdout) as { loggedIn?: unknown };
      return typeof v.loggedIn === 'boolean' ? v.loggedIn : null;
    } catch {
      return null;
    }
  },
  invocation: (bin, prompt) => ({
    cmd: bin,
    args: [
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--permission-mode',
      'acceptEdits',
      '--allowedTools',
      'Read,Edit,MultiEdit,Write,Glob,Grep,LS',
      '--disallowedTools',
      'Bash,WebFetch,WebSearch,Task',
      '--strict-mcp-config',
      '--mcp-config',
      '{"mcpServers":{}}',
    ],
    // On stdin rather than in argv: the tool lists above are variadic, and a
    // brief is long.
    stdin: prompt,
  }),
  terminal: (bin, briefFile, cwd) => inTerminal(bin, briefFile, cwd),
  parse(line) {
    const m = json(line);
    if (!m) return null;
    if (m.type === 'assistant') {
      const content = (m.message as { content?: unknown[] } | undefined)?.content ?? [];
      for (const c of content as Record<string, unknown>[]) {
        if (c.type !== 'tool_use') continue;
        const name = str(c.name) ?? '';
        const input = (c.input ?? {}) as Record<string, unknown>;
        const path = str(input.file_path) ?? str(input.notebook_path) ?? str(input.path);
        if (EDIT_TOOLS.has(name) && path) return { kind: 'step', text: `Editing ${path}`, file: path };
        if (READ_TOOLS.has(name)) return { kind: 'step', text: path ? `Reading ${path}` : `Searching for ${str(input.pattern) ?? 'files'}` };
      }
      return null;
    }
    if (m.type === 'result') {
      const text = str(m.result);
      if (m.is_error === true || (typeof m.subtype === 'string' && m.subtype.startsWith('error'))) {
        return { kind: 'failed', error: text ?? String(m.subtype ?? 'Claude Code stopped with an error') };
      }
      return { kind: 'done', summary: text };
    }
    return null;
  },
};

/**
 * Gemini CLI, headless.
 *
 * The brief goes on stdin, which is what makes it headless (a piped stdin is
 * not a TTY), and `stream-json` gives one event a line. `auto_edit` approves
 * edits and nothing else: a command it wants to run is refused rather than
 * asked about, since nobody is there to answer. Its events name the tool
 * (`write_file`, `replace`, `read_file`, …) and its parameters; the field
 * names have moved between releases, so each is read under every spelling.
 */
const GEMINI_EDIT = new Set(['write_file', 'replace', 'edit', 'edit_file', 'create_file']);
const GEMINI_READ = new Set(['read_file', 'read_many_files', 'list_directory', 'glob', 'grep_search', 'search_file_content', 'ls']);
const gemini: Agent = {
  id: 'gemini',
  name: 'Gemini CLI',
  reportsFiles: true,
  can: 'It can read and edit files in this folder. A command it wants to run is refused.',
  // Gemini CLI signs in through its own interactive flow (Google account or a key), so the fix is to open it once.
  signIn: (bin) => ({ text: 'Gemini CLI is not signed in. Open it once in a terminal and sign in, then try again:', command: shellPath(bin) }),
  invocation: (bin, prompt) => ({ cmd: bin, args: ['--output-format', 'stream-json', '--approval-mode', 'auto_edit'], stdin: prompt }),
  terminal: (bin, briefFile, cwd) => inTerminal(bin, briefFile, cwd, ['-i']),
  parse(line) {
    const m = json(line);
    if (!m) return null;
    if (m.type === 'tool_use') {
      const name = str(m.tool_name) ?? str(m.name) ?? '';
      const params = ((m.parameters ?? m.args ?? m.input ?? {}) as Record<string, unknown>) ?? {};
      const path = str(params.file_path) ?? str(params.absolute_path) ?? str(params.path) ?? str(params.dir_path);
      if (GEMINI_EDIT.has(name) && path) return { kind: 'step', text: `Editing ${path}`, file: path };
      if (GEMINI_READ.has(name)) return { kind: 'step', text: path ? `Reading ${path}` : `Searching for ${str(params.pattern) ?? str(params.query) ?? 'files'}` };
      if (name === 'run_shell_command') return { kind: 'step', text: `Asked to run ${str(params.command) ?? 'a command'}` };
      return null;
    }
    if (m.type === 'message' && m.role === 'assistant') {
      // The last thing it says is its summary; chunks are joined by the run.
      const text = str(m.content) ?? str((m.message as { content?: unknown } | undefined)?.content);
      return text ? { kind: 'done', summary: text } : null;
    }
    if (m.type === 'result') {
      const status = str(m.status);
      const err = (m.error ?? {}) as { message?: string };
      if (status && status !== 'success') return { kind: 'failed', error: str(err.message) ?? str(m.message) ?? `Gemini CLI stopped: ${status}` };
      return { kind: 'done', summary: str(m.response) };
    }
    if (m.type === 'error' && (m.severity === undefined || m.severity === 'error' || m.severity === 'fatal')) {
      return { kind: 'failed', error: str(m.message) ?? 'Gemini CLI stopped with an error' };
    }
    return null;
  },
};

/**
 * Cursor's agent CLI, in print mode.
 *
 * `--force` is how its print mode applies edits rather than proposing them,
 * and it also lets commands run. Cursor keeps narrower permissions in its own
 * config file, which is the person's to write, not the bridge's; the consent
 * row says what this can do instead.
 */
const cursor: Agent = {
  id: 'cursor',
  name: 'Cursor',
  reportsFiles: true,
  can: 'It can read and edit files in this folder, and it can run commands here.',
  signIn: (bin) => ({ text: 'Cursor is not signed in. Run this in a terminal, then try again:', command: `${shellPath(bin)} login` }),
  invocation: (bin, prompt) => ({ cmd: bin, args: ['-p', '--output-format', 'stream-json', '--force', prompt] }),
  terminal: (bin, briefFile, cwd) => inTerminal(bin, briefFile, cwd),
  parse(line) {
    const m = json(line);
    if (!m) return null;
    if (m.type === 'tool_call' && m.subtype === 'started') {
      const call = (m.tool_call ?? {}) as Record<string, { args?: Record<string, unknown> }>;
      const [kind, body] = Object.entries(call)[0] ?? [];
      const path = str(body?.args?.path);
      if (!kind) return null;
      if (/edit|write|delete/i.test(kind) && path) return { kind: 'step', text: `Editing ${path}`, file: path };
      if (/read|ls|glob|grep/i.test(kind)) return { kind: 'step', text: path ? `Reading ${path}` : 'Searching the project' };
      if (/shell/i.test(kind)) return { kind: 'step', text: `Running ${str(body?.args?.command) ?? 'a command'}` };
      return null;
    }
    if (m.type === 'result') {
      const text = str(m.result);
      if (m.is_error === true) return { kind: 'failed', error: text ?? 'Cursor stopped with an error' };
      return { kind: 'done', summary: text };
    }
    return null;
  },
};

/**
 * Codex, non-interactive.
 *
 * `workspace-write` confines its writes to this folder and takes away the
 * network. It still runs commands inside that sandbox, and there is no flag
 * that turns commands off, so the consent row says so.
 */
const codex: Agent = {
  id: 'codex',
  name: 'Codex',
  reportsFiles: true,
  can: 'It can edit files in this folder and run commands in a sandbox with no internet.',
  signIn: (bin) => ({ text: 'Codex is not signed in. Run this in a terminal, then try again:', command: `${shellPath(bin)} login` }),
  invocation: (bin, prompt) => ({
    cmd: bin,
    args: ['exec', '--json', '--sandbox', 'workspace-write', '--skip-git-repo-check', '-'],
    stdin: prompt,
  }),
  terminal: (bin, briefFile, cwd) => inTerminal(bin, briefFile, cwd),
  parse(line) {
    const m = json(line);
    if (!m) return null;
    const item = (m.item ?? {}) as Record<string, unknown>;
    if (m.type === 'item.completed' && item.type === 'file_change') {
      const changes = (item.changes as { path?: string }[] | undefined) ?? [];
      const path = str(changes[0]?.path);
      return path ? { kind: 'step', text: `Editing ${path}`, file: path } : null;
    }
    if (m.type === 'item.started' && item.type === 'command_execution') {
      return { kind: 'step', text: `Running ${str(item.command) ?? 'a command'}` };
    }
    if (m.type === 'item.completed' && item.type === 'agent_message') {
      return { kind: 'done', summary: str(item.text) };
    }
    if (m.type === 'turn.failed' || m.type === 'error') {
      const err = (m.error ?? {}) as { message?: string };
      return { kind: 'failed', error: str(err.message) ?? str(m.message) ?? 'Codex stopped with an error' };
    }
    return null;
  },
};

/**
 * Anything else, from `CODENAME_AGENT_CMD`: a command with `{prompt}` where
 * the brief goes, split on spaces and run without a shell. Its output is
 * shown as it comes, one line a step; the files it touched are not known.
 */
export function customAgent(template: string, name = template.trim().split(/\s+/)[0] ?? 'Custom agent'): Agent {
  return {
    id: 'custom',
    name,
    reportsFiles: false,
    can: `It runs \`${template}\` in this folder. Codename cannot say what that command is allowed to do.`,
    signIn: () => ({ text: `${name} is not signed in. Sign it in from a terminal, then try again.`, command: '' }),
    invocation: (bin, prompt) => {
      const [, ...rest] = template.trim().split(/\s+/);
      const hasSlot = rest.includes('{prompt}');
      return hasSlot
        ? { cmd: bin, args: rest.map((a) => (a === '{prompt}' ? prompt : a)) }
        : { cmd: bin, args: rest, stdin: prompt };
    },
    parse(line) {
      const t = line.trim();
      return t ? { kind: 'step', text: t.length > 140 ? `${t.slice(0, 137)}…` : t } : null;
    },
  };
}

export const AGENTS: Record<Exclude<AgentId, 'custom'>, Agent> = { claude, gemini, cursor, codex };

/* ---------------- finding the tools ---------------- */

export interface LocateEnv {
  home: string;
  path: string;
  platform: NodeJS.Platform;
  /** Whether a file is there and may be run. */
  executable(file: string): boolean;
  /** Folder names, for the versioned copies an app keeps. */
  list(dir: string): string[];
}

export const realLocateEnv = (): LocateEnv => ({
  home: homedir(),
  path: process.env.PATH ?? '',
  platform: process.platform,
  executable(file) {
    try {
      accessSync(file, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  },
  list(dir) {
    try {
      return readdirSync(dir);
    } catch {
      return [];
    }
  },
});

/** Newest first, by the numbers in a version folder's name. */
function byVersionDesc(a: string, b: string): number {
  const pa = a.split(/[^\d]+/).filter(Boolean).map(Number);
  const pb = b.split(/[^\d]+/).filter(Boolean).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/**
 * Where each tool may be, in the order to look. A bridge started by a desktop
 * app gets that app's PATH, which is often not the person's shell's, so the
 * usual install folders are looked in by name as well.
 */
export function candidates(id: Exclude<AgentId, 'custom'>, env: LocateEnv): string[] {
  const names = { claude: ['claude'], gemini: ['gemini'], cursor: ['cursor-agent'], codex: ['codex'] }[id];
  const dirs = [
    ...env.path.split(delimiter).filter(Boolean),
    join(env.home, '.local', 'bin'),
    join(env.home, '.npm-global', 'bin'),
    join(env.home, '.bun', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ];
  if (id === 'claude') dirs.push(join(env.home, '.claude', 'local'));
  const out: string[] = [];
  for (const dir of dirs) for (const n of names) out.push(join(dir, n));
  // The Claude desktop app carries its own Claude Code, one folder a version,
  // and on a machine without the CLI it is the only copy there is.
  if (id === 'claude' && env.platform === 'darwin') {
    const root = join(env.home, 'Library', 'Application Support', 'Claude', 'claude-code');
    for (const v of env.list(root).sort(byVersionDesc)) out.push(join(root, v, 'claude.app', 'Contents', 'MacOS', 'claude'));
  }
  return [...new Set(out)];
}

export function locate(id: Exclude<AgentId, 'custom'>, env: LocateEnv): string | null {
  return candidates(id, env).find((f) => env.executable(f)) ?? null;
}

/** An agent this bridge can run, with where its tool is. */
export interface Found {
  agent: Agent;
  bin: string;
}

/**
 * Every agent the panel may offer, found once at startup. A custom command
 * comes first when one is set: someone who set it meant it.
 */
export function findAgents(env: LocateEnv = realLocateEnv(), custom = process.env.CODENAME_AGENT_CMD): Found[] {
  const found: Found[] = [];
  if (custom?.trim()) {
    const agent = customAgent(custom, process.env.CODENAME_AGENT_NAME || undefined);
    const bin = custom.trim().split(/\s+/)[0]!;
    found.push({ agent, bin });
  }
  for (const agent of Object.values(AGENTS)) {
    const bin = locate(agent.id as Exclude<AgentId, 'custom'>, env);
    if (bin) found.push({ agent, bin });
  }
  return found;
}
