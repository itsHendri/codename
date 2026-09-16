/**
 * `codename-bridge`: stdio MCP on one side, a loopback WebSocket on the other.
 *
 * stdout belongs to the MCP transport, so everything a human should read goes
 * to stderr.
 */

import { resolve } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import pkg from '../package.json';
import { DEFAULT_PORT } from '../../../shared/protocol';
import type { AppliedDefinition, PanelRequest, SessionState } from '../../../shared/protocol';
import { applyDefinition, findDefinitions } from './definitions';
import { createMcpServer } from './mcp';
import { readProject } from './project';
import {
  bridgeFilePath,
  generateToken,
  readBridgeFile,
  readPairingCode,
  removeBridgeFile,
  TOKEN_RE,
  writeBridgeFile,
} from './pairing';
import { forget, pushDefinitions } from './push';
import { Sessions } from './sessions';
import { runOpen } from './open';
import { runSetup, type SetupClient } from './setup';
import { startServer } from './ws';

const log = (line: string) => process.stderr.write(`${line}\n`);

const HELP = `codename-bridge ${pkg.version}

Runs the local companion for the codename extension: an MCP server on stdio
for your agent and a WebSocket on 127.0.0.1 for the panel.

Usage: codename-bridge [--port N] [--keep-token]
       codename-bridge setup [--client claude|cursor|none] [--skills-dir DIR] [--print]
       codename-bridge open [DIR] [--cmd "…"] [--url URL] [--browser NAME]
       codename-bridge code
       codename-bridge unpin

  setup           Install the codename skill into your agent's skills folder
                  (~/.claude/skills/codename) and register the bridge with
                  Claude Code, or print what to paste for Cursor. Safe to rerun.
  open            Start this project's dev server and open it in your browser,
                  ready for the panel. Your agent runs the bridge itself, in
                  its own terminal; this one just gets you to the page.
  code            Print the pairing code of the bridge that is running, and exit.
                  Your agent starts the bridge and swallows what it prints, so
                  this is how you read the code — or ask the agent for it.
  unpin           Forget which copy of the extension this bridge paired with.
                  The bridge only answers the first one it pairs with; run this
                  after switching between a development build and the store
                  one, then pair again. Takes effect on a running bridge too.
                  ($CODENAME_EXTENSION_ID pins one by hand instead.)
  --port N        Port for the panel socket (default ${DEFAULT_PORT}, or $CODENAME_PORT)
  --keep-token    Reuse the pairing code from ~/.codename/bridge.json
  --version       Print the version
  --help          This text
`;

/**
 * `codename-bridge code`: for a person at a terminal, so it goes to stdout.
 * Everything else the bridge says goes to stderr because stdout is the MCP
 * transport — but this invocation is not a transport.
 */
function printCode(): never {
  const running = readPairingCode();
  if (!running) {
    log('no codename-bridge is running — start your agent (it launches the bridge), or run npx codename-bridge');
    process.exit(1);
  }
  process.stdout.write(`${running.token}\n`);
  process.exit(0);
}

/** `codename-bridge unpin`: for a person at a terminal, so it talks on stdout. */
function unpinCli(): never {
  const path = bridgeFilePath();
  const file = readBridgeFile(path);
  if (!file?.extensionId) {
    process.stdout.write('no extension is pinned; any copy of the extension can pair with its code\n');
    process.exit(0);
  }
  const { extensionId, ...rest } = file;
  writeBridgeFile(path, rest);
  process.stdout.write(`unpinned ${extensionId}; the next copy of the extension to pair with the code becomes the one\n`);
  process.exit(0);
}

/** `codename-bridge setup`: a person at a terminal, so it talks on stdout. */
function setupCli(argv: string[]): never {
  let client: SetupClient = 'claude';
  let skillsDir: string | undefined;
  let print = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '--client') client = (argv[++i] ?? '') as SetupClient;
    else if (arg.startsWith('--client=')) client = arg.slice('--client='.length) as SetupClient;
    else if (arg === '--skills-dir') skillsDir = argv[++i];
    else if (arg.startsWith('--skills-dir=')) skillsDir = arg.slice('--skills-dir='.length);
    else if (arg === '--print') print = true;
    else {
      log(`unknown argument: ${arg}\n`);
      process.stderr.write(HELP);
      process.exit(2);
    }
  }
  if (!['claude', 'cursor', 'none'].includes(client)) {
    log(`--client must be claude, cursor or none, not ${client}`);
    process.exit(2);
  }
  const r = runSetup({ client, skillsDir, print, log: (line) => process.stdout.write(`${line}\n`) });
  process.exit(r.registration === 'failed' ? 1 : 0);
}

/** `codename-bridge open`: a person at a terminal, so it talks on stdout. */
function openCli(argv: string[]): void {
  let dir = '.';
  let cmd: string | undefined;
  let url: string | undefined;
  let browser: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '--cmd') cmd = argv[++i];
    else if (arg.startsWith('--cmd=')) cmd = arg.slice('--cmd='.length);
    else if (arg === '--url') url = argv[++i];
    else if (arg.startsWith('--url=')) url = arg.slice('--url='.length);
    else if (arg === '--browser') browser = argv[++i];
    else if (arg.startsWith('--browser=')) browser = arg.slice('--browser='.length);
    else if (!arg.startsWith('-')) dir = arg;
    else {
      log(`unknown argument: ${arg}\n`);
      process.stderr.write(HELP);
      process.exit(2);
    }
  }
  const resolved = resolve(dir);
  const { child } = runOpen({
    dir: resolved,
    cmd,
    url,
    browser,
    running: () => readPairingCode(),
    log: (line) => process.stdout.write(`${line}\n`),
  });
  if (!child) return;
  // Ctrl-C belongs to the dev server; this process is only holding its hand.
  const stop = () => child.kill('SIGINT');
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  child.on('exit', (code) => process.exit(code ?? 0));
}

interface Args {
  port: number;
  keepToken: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { port: Number(process.env.CODENAME_PORT) || DEFAULT_PORT, keepToken: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '--help' || arg === '-h') {
      process.stderr.write(HELP);
      process.exit(0);
    } else if (arg === '--version' || arg === '-v') {
      process.stderr.write(`${pkg.version}\n`);
      process.exit(0);
    } else if (arg === '--keep-token') {
      args.keepToken = true;
    } else if (arg === '--port') {
      args.port = Number(argv[++i]);
    } else if (arg.startsWith('--port=')) {
      args.port = Number(arg.slice('--port='.length));
    } else {
      log(`unknown argument: ${arg}\n`);
      process.stderr.write(HELP);
      process.exit(2);
    }
  }
  if (!Number.isInteger(args.port) || args.port < 0 || args.port > 65535) {
    log(`invalid port: ${args.port}`);
    process.exit(2);
  }
  return args;
}

async function main() {
  if (process.argv[2] === 'code') printCode();
  if (process.argv[2] === 'unpin') unpinCli();
  if (process.argv[2] === 'setup') setupCli(process.argv.slice(3));
  if (process.argv[2] === 'open') return openCli(process.argv.slice(3));
  const args = parseArgs(process.argv.slice(2));
  const filePath = bridgeFilePath();
  const previous = readBridgeFile(filePath);
  const token = args.keepToken && previous && TOKEN_RE.test(previous.token) ? previous.token : generateToken();

  const cwd = process.cwd();
  const sessions = new Sessions();
  sessions.project = readProject(cwd);

  /** The one write the bridge makes, and only for a panel that says it may. */
  const answerPanel = async (sessionId: string, request: PanelRequest): Promise<unknown> => {
    if (request.method === 'find_definitions') return findDefinitions(cwd, request.names);
    const state: SessionState | null = sessions.get(sessionId).state;
    if (!state?.bridgeMayWrite) throw new Error('this project has not been allowed to take edits from the panel');
    // The consent is kept per project, so it is still on when the same tab
    // has moved to a deployed site; a value read there is not this folder's.
    if (!state.tab?.local) throw new Error('the page is not served from this machine, so nothing read from it is written to this project');
    const applied: AppliedDefinition = applyDefinition(cwd, request);
    log(`applied ${applied.name}: ${applied.from} → ${applied.to} in ${applied.file}:${applied.line}`);
    return applied;
  };

  let server;
  try {
    server = await startServer({
      port: args.port,
      token,
      sessions,
      bridgeVersion: pkg.version,
      pinnedExtensionId: process.env.CODENAME_EXTENSION_ID || previous?.extensionId,
      // Read from the file for each hello, so `unpin` reaches this process.
      readPin: () => process.env.CODENAME_EXTENSION_ID || readBridgeFile(filePath)?.extensionId,
      onPin: (extensionId) => {
        const file = readBridgeFile(filePath);
        if (file && file.pid === process.pid) writeBridgeFile(filePath, { ...file, extensionId });
      },
      project: () => readProject(cwd),
      onAsk: answerPanel,
      onState: (sessionId, state, link) => {
        pushDefinitions(cwd, sessionId, state, link);
      },
      onGone: forget,
      allowNoOrigin: process.env.CODENAME_ALLOW_NO_ORIGIN === '1',
      // Comma-separated page origins, e.g. the panel harness at http://localhost:5320.
      devOrigins: (process.env.CODENAME_DEV_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean),
      log,
    });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EADDRINUSE') log(`another codename-bridge is already running on port ${args.port}`);
    else log(`could not listen on 127.0.0.1:${args.port}: ${(err as Error).message}`);
    process.exit(1);
  }

  writeBridgeFile(filePath, {
    token,
    port: server.port,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    ...(previous?.extensionId ? { extensionId: previous.extensionId } : {}),
  });
  log(`codename-bridge listening on ws://127.0.0.1:${server.port} — pairing code: ${token}`);
  if (sessions.project) log(`running in ${sessions.project.name}${sessions.project.branch ? ` on ${sessions.project.branch}` : ''}`);

  const { server: mcp } = createMcpServer(sessions, pkg.version, { pairingCode: token, cwd });
  const transport = new StdioServerTransport();

  let closing = false;
  const shutdown = async (why: string) => {
    if (closing) return;
    closing = true;
    log(`codename-bridge stopping (${why})`);
    await Promise.allSettled([server.close(), mcp.close()]);
    removeBridgeFile(filePath, process.pid);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  transport.onclose = () => void shutdown('agent closed stdio');

  await mcp.connect(transport);
}

main().catch((err) => {
  log(`codename-bridge failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  process.exit(1);
});
