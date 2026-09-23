#!/usr/bin/env node
/**
 * Make changes, end to end, with a real coding agent.
 *
 *   npm run build -w codename-bridge
 *   node packages/bridge/scripts/make-changes-e2e.mjs [scratch-dir]
 *
 * Builds a throwaway project (a stylesheet with a token, a page with two
 * buttons, a git commit), starts the built bridge in it on a spare port with
 * its own bridge file, pairs a socket the way the panel does, pushes a state,
 * and asks for a run on a brief. Prints each step the agent reports, then
 * checks the token moved, the buttons swapped, and nothing outside the
 * project was touched. Uses the agent's own login; `E2E_AGENT` picks which.
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, '../dist/cli.js');
const scratch = resolve(process.argv[2] ?? mkdtempSync(join(tmpdir(), 'codename-e2e-')));
const agent = process.env.E2E_AGENT ?? 'claude';
const port = Number(process.env.E2E_PORT ?? 9687);
const limit = Number(process.env.E2E_WAIT_MS ?? 300_000);

/* ---------------- the project ---------------- */

const dir = join(scratch, 'fixture');
mkdirSync(join(dir, 'src'), { recursive: true });
const sentinel = join(scratch, 'outside.txt');
writeFileSync(sentinel, 'nothing should touch this\n');
writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture', private: true }, null, 2) + '\n');
writeFileSync(join(dir, 'src', 'styles.css'), ':root {\n  --mark: #BE3A22;\n  --ink: #15171B;\n}\n\n.btn { color: var(--mark); }\n');
writeFileSync(
  join(dir, 'index.html'),
  '<!doctype html>\n<link rel="stylesheet" href="src/styles.css">\n<nav class="glyph-sets">\n  <button class="glyph-set">a–z</button>\n  <button class="glyph-set">A–Z</button>\n  <button class="glyph-set">0–9</button>\n</nav>\n',
);
const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
git('init', '-q');
git('-c', 'user.email=e2e@codename.local', '-c', 'user.name=e2e', 'add', '.');
git('-c', 'user.email=e2e@codename.local', '-c', 'user.name=e2e', 'commit', '-qm', 'fixture');

const brief = `Apply a design change I made against localhost:5999, running from fixture.

## Token changes — 1 definition

Edit the definition of each token. Do not replace usages.

- \`--mark\`: \`#BE3A22\` → \`#1C7F5C\` (1 usage) — defined at src/styles.css:2

## Element changes

- \`button.glyph-set:nth-of-type(2)\` — move: before \`button.glyph-set:nth-of-type(1)\` (in index.html, the "A–Z" button now comes before "a–z")
`;

/* ---------------- the bridge ---------------- */

const bridge = spawn('node', [cli, '--port', String(port)], {
  cwd: dir,
  env: { ...process.env, CODENAME_ALLOW_NO_ORIGIN: '1', CODENAME_BRIDGE_FILE: join(scratch, 'bridge.json') },
  stdio: ['pipe', 'pipe', 'pipe'],
});
let token = null;
const ready = new Promise((ok, fail) => {
  bridge.stderr.on('data', (d) => {
    const text = d.toString();
    process.stdout.write(text.split('\n').filter(Boolean).map((l) => `[bridge] ${l}\n`).join(''));
    token ??= /pairing code: ([A-Z0-9]{6})/.exec(text)?.[1] ?? null;
    if (token) ok();
  });
  bridge.on('exit', (code) => fail(new Error(`bridge exited with ${code}`)));
});
await ready;

/* ---------------- the panel's side ---------------- */

const ws = new WebSocket(`ws://127.0.0.1:${port}`);
await new Promise((r) => ws.once('open', r));
let n = 0;
const send = (type, payload) => {
  const id = `e${++n}`;
  ws.send(JSON.stringify({ v: 1, id, type, payload }));
  return id;
};
const frames = [];
const waiting = new Map();
ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  frames.push(msg);
  if (msg.replyTo && waiting.has(msg.replyTo)) waiting.get(msg.replyTo)(msg);
});
const ask = (payload) =>
  new Promise((r) => {
    const id = send('ask', payload);
    waiting.set(id, r);
  });

const hello = send('hello', { token, extensionVersion: 'e2e', sessionId: 'e2e' });
const ack = await new Promise((r) => waiting.set(hello, r));
console.log('\nagents the bridge found:', (ack.payload.agents ?? []).map((a) => `${a.name} — ${a.can}`).join('\n  ') || 'none');
send('state', {
  sessionId: 'e2e',
  revision: 1,
  tab: { id: 1, url: 'http://localhost:5999/', origin: 'http://localhost:5999', title: 'fixture', local: true },
  scanSummary: null,
  changes: null,
  prompt: brief,
  handoff: null,
  selection: null,
  comments: [],
  agentMayWrite: false,
  locks: [],
  rules: '',
});
await new Promise((r) => setTimeout(r, 200));

const refused = await ask({ method: 'run_agent', agent, brief, locks: [], mayRun: false });
console.log(`\nwithout consent: ${refused.ok ? 'RAN (wrong)' : `refused — ${refused.error}`}`);

const started = Date.now();
const answer = await ask({ method: 'run_agent', agent, brief, locks: ['--ink'], mayRun: true });
if (!answer.ok) {
  console.log(`run refused: ${answer.error}`);
  bridge.kill();
  process.exit(1);
}
console.log(`\nrun ${answer.payload.runId} started with ${agent}`);

let shown = 0;
const last = await new Promise((done) => {
  const t = setInterval(() => {
    const runs = frames.filter((f) => f.type === 'run').map((f) => f.payload);
    const latest = runs.at(-1);
    if (latest) {
      for (const s of latest.steps.slice(shown)) console.log(`  · ${s.text}`);
      shown = latest.steps.length;
    }
    if (latest && latest.status !== 'running') {
      clearInterval(t);
      done(latest);
    } else if (Date.now() - started > limit) {
      clearInterval(t);
      done({ status: 'timed out', files: [], steps: [] });
    }
  }, 250);
});

console.log(`\n${last.status} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
if (last.summary) console.log(`summary: ${last.summary}`);
if (last.error) console.log(`error: ${last.error}`);
console.log(`files it reported: ${last.files.join(', ') || 'none'}`);

/* ---------------- what actually changed ---------------- */

const css = readFileSync(join(dir, 'src', 'styles.css'), 'utf8');
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const status = git('status', '--porcelain').replace(/\n$/, '');
const checks = [
  ['--mark is #1C7F5C', /--mark:\s*#1C7F5C/i.test(css)],
  ['--ink (locked) is untouched', /--ink:\s*#15171B/.test(css)],
  ['the usage still reads var(--mark)', /color:\s*var\(--mark\)/.test(css)],
  ['A–Z now comes before a–z', html.indexOf('A–Z') < html.indexOf('a–z')],
  ['only the two files changed', status.split('\n').filter(Boolean).map((l) => l.slice(3)).sort().join(',') === 'index.html,src/styles.css'],
  ['nothing outside the project was touched', readFileSync(sentinel, 'utf8') === 'nothing should touch this\n'],
  // A custom command's output is plain lines, so which files it touched is not known.
  ...(agent === 'custom' ? [] : [['the run reported both files', ['index.html', 'src/styles.css'].every((f) => last.files.includes(f))]]),
];
console.log('\ngit status:\n' + (status || '(clean)'));
console.log('');
for (const [what, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);

ws.close();
bridge.stdin.end();
bridge.kill();
process.exit(last.status === 'done' && checks.every(([, ok]) => ok) ? 0 : 1);
