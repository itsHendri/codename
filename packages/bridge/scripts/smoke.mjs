#!/usr/bin/env node
// Pretend to be the extension against a running bridge.
//
//   CODENAME_ALLOW_NO_ORIGIN=1 node packages/bridge/dist/cli.js   # terminal 1
//   node packages/bridge/scripts/smoke.mjs K7M4XQ [port]           # terminal 2
//
// Sends hello + one sample state, prints every frame, and answers any request
// with a stub so the MCP tools have something to return.

import WebSocket from 'ws';

const [token, portArg] = process.argv.slice(2);
if (!token) {
  console.error('usage: smoke.mjs <pairing-code> [port]');
  process.exit(2);
}
const port = Number(portArg ?? process.env.CODENAME_PORT ?? 9612);
const sessionId = `smoke-${process.pid}`;
let seq = 0;
let revision = 1;
const send = (frame) => {
  const envelope = { v: 1, id: `smoke-${++seq}`, ...frame };
  console.log('→', JSON.stringify(envelope));
  ws.send(JSON.stringify(envelope));
};

const state = (revision) => ({
  sessionId,
  revision,
  tab: { id: 1, url: 'http://localhost:3000/', origin: 'http://localhost:3000', title: 'Smoke', local: true },
  scanSummary: { scannedAt: Date.now(), colors: 12, fonts: 2, customProps: 30 },
  changes: {
    site: 'http://localhost:3000/',
    editedAt: new Date().toISOString(),
    local: true,
    tokens: [{ name: '--brand-primary', from: '#533AFD', to: '#1C7F5C', uses: 14, reason: 'edited' }],
    colors: [],
    unreadable: [],
  },
  prompt: 'Change --brand-primary from #533AFD to #1C7F5C.',
  handoff: null,
  selection: null,
  comments: [],
  agentMayWrite: true,
});

// A 1x1 transparent PNG, so get_screenshot returns a real image.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const ws = new WebSocket(`ws://127.0.0.1:${port}`);
ws.on('open', () => {
  console.log(`connected to ws://127.0.0.1:${port} as ${sessionId}`);
  send({ type: 'hello', payload: { token, extensionVersion: 'smoke', sessionId } });
  send({ type: 'state', payload: state(1) });
});
ws.on('message', (data) => {
  const frame = JSON.parse(data.toString());
  console.log('←', JSON.stringify(frame));
  if (frame.type !== 'request') return;
  const { method } = frame.payload ?? {};
  const payload = method === 'screenshot' ? { png: PNG, width: 1, height: 1 } : { ok: true, method };
  send({ type: 'response', replyTo: frame.id, ok: true, payload });
  if (method === 'clear' && frame.payload.what === 'handoff') send({ type: 'state', payload: state(++revision) });
});
ws.on('close', (code, reason) => {
  console.log(`closed ${code} ${reason}`);
  process.exit(code === 1000 || code === 1001 ? 0 : 1);
});
ws.on('error', (err) => {
  console.error('error:', err.message);
  process.exit(1);
});
