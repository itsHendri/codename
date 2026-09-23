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
import { startBridge, type Host } from './host';
import { createMcpServer } from './mcp';
import { bridgeFilePath, readBridgeFile, readPairingCode, readRunningBridge, writeBridgeFile } from './pairing';
import { runOpen } from './open';
import { runSetup, type SetupClient } from './setup';

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
  open            Start the bridge for this folder (unless your agent already
                  did), start the dev server, and open it in your browser,
                  ready for the panel. Make changes in the panel then runs
                  Claude Code, Cursor or Codex here — no chat needed.
  code            Print the pairing code of the bridge that is running, and exit.
                  An agent that starts the bridge swallows what it prints, so
                  this is how you read the code.
  unpin           Forget which copy of the extension this bridge paired with.
                  The bridge only answers the first one it pairs with; run this
                  after switching between a development build and the store
                  one, then pair again. Takes effect on a running bridge too.
                  ($CODENAME_EXTENSION_ID pins one by hand instead.)
  --port N        Port for the panel socket (default ${DEFAULT_PORT}, or $CODENAME_PORT)
  --keep-token    Reuse the pairing code from ~/.codename/bridge.json
  --version       Print the version
  --help          This text

Make changes runs whichever of these you pick in the panel: $CODENAME_AGENT_CMD
(a command with {prompt} where the brief goes), Claude Code, Cursor
(cursor-agent), Codex.
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

/**
 * `codename-bridge open`: a person at a terminal, so it talks on stdout.
 *
 * Starts the bridge here when this folder has none, keeping the last pairing
 * code so a panel that paired before connects by itself, then starts the dev
 * server and opens it. With this, Make changes needs no chat open anywhere.
 */
async function openCli(argv: string[]): Promise<void> {
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
  const say = (line: string) => process.stdout.write(`${line}\n`);
  const resolved = resolve(dir);

  const running = readRunningBridge();
  let host: Host | null = null;
  if (running && !running.cwd) {
    // Every bridge since Make changes writes its folder; one that did not is
    // older, and a panel paired with it would find nothing to run.
    say(`A codename bridge from an older version is running (pid ${running.pid}), usually started by an agent chat.`);
    say('Make changes needs this version. Close the agent session that started it, or stop that process, then run this again.');
    process.exit(1);
  }
  if (running?.cwd && running.cwd !== resolved) {
    // Only one bridge can hold the port, and a panel paired with that one
    // would hand this page's changes to another project.
    say(`A codename bridge is already running for ${running.cwd} (pid ${running.pid}).`);
    say('Stop it first — close the agent or terminal that started it — then run this again, so the panel works on this project.');
    process.exit(1);
  }
  if (!running) {
    try {
      host = await startBridge({
        cwd: resolved,
        port: Number(process.env.CODENAME_PORT) || DEFAULT_PORT,
        keepToken: true,
        version: pkg.version,
        // The bridge's own lines are for a person here, but quieter than the dev server's.
        log: (line) => process.stderr.write(`[codename] ${line}\n`),
      });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      say(code === 'EADDRINUSE' ? 'Something else is using the bridge\'s port. Set CODENAME_PORT to another one.' : `Could not start the bridge: ${(err as Error).message}`);
      process.exit(1);
    }
  }

  const { child } = runOpen({
    dir: resolved,
    cmd,
    url,
    browser,
    running: () => (host ? { token: host.token, port: host.port } : readPairingCode()),
    log: say,
  });

  let stopping = false;
  const stop = async (code: number) => {
    if (stopping) return;
    stopping = true;
    await host?.close();
    process.exit(code);
  };
  // Ctrl-C belongs to the dev server; the bridge goes when it does.
  const onSignal = () => {
    if (child) child.kill('SIGINT');
    else void stop(0);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  child?.on('exit', (code) => void stop(code ?? 0));
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
  const cwd = process.cwd();

  let host: Host;
  try {
    host = await startBridge({ cwd, port: args.port, keepToken: args.keepToken, version: pkg.version, log });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EADDRINUSE') log(`another codename-bridge is already running on port ${args.port}`);
    else log(`could not listen on 127.0.0.1:${args.port}: ${(err as Error).message}`);
    process.exit(1);
  }

  const { server: mcp } = createMcpServer(host.sessions, pkg.version, { pairingCode: host.token, cwd });
  const transport = new StdioServerTransport();

  let closing = false;
  const shutdown = async (why: string) => {
    if (closing) return;
    closing = true;
    log(`codename-bridge stopping (${why})`);
    await Promise.allSettled([host.close(), mcp.close()]);
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
