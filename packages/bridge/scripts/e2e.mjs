#!/usr/bin/env node
/**
 * Drives a bridge the way an agent would, while a real panel pairs with it.
 *
 *   CODENAME_DEV_ORIGINS=http://localhost:5320 node packages/bridge/scripts/e2e.mjs
 *
 * Spawns the built CLI as an MCP server over stdio, prints its pairing code,
 * then polls list_sessions until a panel connects and exercises the tools.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, '../dist/cli.js');
const waitFor = Number(process.env.E2E_WAIT_MS ?? 120_000);

const transport = new StdioClientTransport({
  command: 'node',
  args: [cli],
  env: { ...process.env },
  stderr: 'pipe',
});
transport.stderr?.on('data', (d) => process.stdout.write(`[bridge] ${d}`));

const client = new Client({ name: 'e2e', version: '0' });
await client.connect(transport);

const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  const images = r.content.filter((c) => c.type === 'image').length;
  console.log(`\n> ${name}(${JSON.stringify(args)})${r.isError ? ' [error]' : ''}\n${text.slice(0, 600)}${images ? `\n(+${images} image)` : ''}`);
  return { text, r };
};

const tools = await client.listTools();
console.log('tools:', tools.tools.map((t) => t.name).join(', '));

console.log(`\nwaiting up to ${waitFor / 1000}s for a panel to pair…`);
const start = Date.now();
let connected = false;
while (Date.now() - start < waitFor) {
  const { text } = await call('list_sessions');
  const list = JSON.parse(text);
  if (list.some((s) => s.connected)) {
    connected = true;
    break;
  }
  await new Promise((r) => setTimeout(r, 3000));
}
if (!connected) {
  console.log('no panel paired; exiting');
  await client.close();
  process.exit(2);
}

await call('get_changes');
await call('get_selection');
await call('critique');
await call('get_screenshot');
await call('apply_css', { css: 'body { outline: 4px solid #59a6ff !important }' });
await call('clear', { what: 'preview' });
console.log('\nwatching for a hand-off (press "Send to agent" in the panel)…');
const w = await call('watch', { timeoutMs: 25000 });
if (!JSON.parse(w.text).timedOut) await call('get_changes');
await client.close();
console.log('\ndone');
