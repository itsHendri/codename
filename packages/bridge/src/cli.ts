/**
 * `codename-bridge`: stdio MCP on one side, a loopback WebSocket on the other.
 *
 * stdout belongs to the MCP transport, so everything a human should read goes
 * to stderr.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import pkg from '../package.json';
import { DEFAULT_PORT } from '../../../shared/protocol';
import { createMcpServer } from './mcp';
import { bridgeFilePath, generateToken, readBridgeFile, removeBridgeFile, TOKEN_RE, writeBridgeFile } from './pairing';
import { Sessions } from './sessions';
import { startServer } from './ws';

const log = (line: string) => process.stderr.write(`${line}\n`);

const HELP = `codename-bridge ${pkg.version}

Runs the local companion for the codename extension: an MCP server on stdio
for your agent and a WebSocket on 127.0.0.1 for the panel.

Usage: codename-bridge [--port N] [--keep-token]

  --port N        Port for the panel socket (default ${DEFAULT_PORT}, or $CODENAME_PORT)
  --keep-token    Reuse the pairing code from ~/.codename/bridge.json
  --version       Print the version
  --help          This text
`;

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
  const args = parseArgs(process.argv.slice(2));
  const filePath = bridgeFilePath();
  const previous = readBridgeFile(filePath);
  const token = args.keepToken && previous && TOKEN_RE.test(previous.token) ? previous.token : generateToken();

  const sessions = new Sessions();
  let server;
  try {
    server = await startServer({
      port: args.port,
      token,
      sessions,
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

  writeBridgeFile(filePath, { token, port: server.port, pid: process.pid, startedAt: new Date().toISOString() });
  log(`codename-bridge listening on ws://127.0.0.1:${server.port} — pairing code: ${token}`);

  const { server: mcp } = createMcpServer(sessions, pkg.version);
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
