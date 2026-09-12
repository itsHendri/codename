import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it } from 'vitest';
import { createMcpServer } from './mcp';
import { Sessions, type Link } from './sessions';
import { makeState } from './test-helpers';

const EXPECTED_TOOLS = [
  'pairing_code',
  'list_sessions',
  'get_changes',
  'watch',
  'critique',
  'check_tokens',
  'find_definition',
  'apply_definition',
  'get_design_system',
  'get_screenshot',
  'apply_css',
  'clear',
  'get_selection',
  'point',
  'get_comments',
  'set_status',
  'reply',
];

async function connectedClient(sessions: Sessions, pairingCode?: string, cwd?: string) {
  const { server, tools } = createMcpServer(sessions, '0.0.0-test', { pairingCode, cwd });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(clientSide);
  return { client, tools, close: () => Promise.all([client.close(), server.close()]) };
}

const textOf = (result: Awaited<ReturnType<Client['callTool']>>) => {
  const content = result.content as Array<{ type: string; text?: string }>;
  return content.find((c) => c.type === 'text')?.text ?? '';
};

describe('MCP tools', () => {
  it('registers every tool the plan names', async () => {
    const { client, tools, close } = await connectedClient(new Sessions());
    expect(tools).toEqual(EXPECTED_TOOLS);
    const listed = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(listed).toEqual([...EXPECTED_TOOLS].sort());
    await close();
  });

  it('tells the user the pairing code, and says so when it has none', async () => {
    const paired = await connectedClient(new Sessions(), 'K7M4XQ');
    expect(textOf(await paired.client.callTool({ name: 'pairing_code', arguments: {} }))).toContain('K7M4XQ');
    await paired.close();
    const bare = await connectedClient(new Sessions());
    expect(textOf(await bare.client.callTool({ name: 'pairing_code', arguments: {} }))).toMatch(/no pairing code/);
    await bare.close();
  });

  it('answers from the session snapshot and refuses writes without consent', async () => {
    const sessions = new Sessions();
    const link: Link = { send: () => {} };
    sessions.connect('s1', link);
    const { client, close } = await connectedClient(sessions);

    expect(textOf(await client.callTool({ name: 'get_changes', arguments: {} }))).toMatch(/has not sent any state/);

    const changes = { site: 'http://localhost:3000', editedAt: 'now', local: true, tokens: [], colors: [], system: [], elements: [], comments: [], unreadable: [] };
    sessions.update('s1', makeState('s1', 1, { changes, prompt: 'live prompt', comments: [{ id: 'c1', url: '', target: { kind: 'element' as const, selector: '.btn', matches: 1 }, text: 'bigger', status: 'pending', createdAt: '', replies: [] }] }));
    expect(JSON.parse(textOf(await client.callTool({ name: 'get_changes', arguments: {} })))).toEqual({ source: 'live', changes, prompt: 'live prompt' });

    sessions.update('s1', makeState('s1', 2, { changes, prompt: 'live', handoff: { changes, prompt: 'sent', at: 't' } }));
    expect(JSON.parse(textOf(await client.callTool({ name: 'get_changes', arguments: {} })))).toMatchObject({ source: 'handoff', prompt: 'sent' });

    expect(textOf(await client.callTool({ name: 'get_selection', arguments: {} }))).toBe('nothing is selected');

    const refused = await client.callTool({ name: 'apply_css', arguments: { css: 'body{}' } });
    expect(refused.isError).toBe(true);
    expect(textOf(refused)).toMatch(/panel menu/);

    const watched = JSON.parse(textOf(await client.callTool({ name: 'watch', arguments: { since: 0, timeoutMs: 10 } })));
    expect(watched).toEqual({ session: 's1', revision: 2, timedOut: false, handoff: true, comments: 0, selection: false });

    const timedOut = JSON.parse(textOf(await client.callTool({ name: 'watch', arguments: { timeoutMs: 10 } })));
    expect(timedOut).toMatchObject({ revision: 2, timedOut: true });

    await close();
  });

  it('hands the agent its rules and the design files as resources, not only tools', async () => {
    const sessions = new Sessions();
    const link: Link = {
      send: (envelope) => {
        if (envelope.type !== 'request') return;
        queueMicrotask(() =>
          sessions.handleResponse('s1', {
            v: envelope.v,
            id: 'r',
            type: 'response',
            replyTo: envelope.id,
            ok: true,
            payload: { url: 'http://localhost:3000/', scannedAt: 0, files: [{ path: 'brand.md', content: '# brand', note: 'n' }] },
          }),
        );
      },
    };
    const { client, close } = await connectedClient(sessions);
    // Before any panel: the rules still read, without locks.
    const bare = await client.readResource({ uri: 'codename://rules' });
    expect((bare.contents[0] as { text: string }).text).toContain('Edit the definition of each token');

    sessions.connect('s1', link);
    sessions.update('s1', makeState('s1', 1, { locks: ['--ink'], rules: 'RULES with --ink locked', scanSummary: { scannedAt: 0, colors: 1, fonts: 1, customProps: 1 } }));
    const withLocks = await client.readResource({ uri: 'codename://rules' });
    expect((withLocks.contents[0] as { text: string }).text).toBe('RULES with --ink locked');
    expect(JSON.parse(textOf(await client.callTool({ name: 'list_sessions', arguments: {} })))[0]).toMatchObject({ locks: ['--ink'] });

    const listed = await client.listResources();
    expect(listed.resources.map((r) => r.uri)).toEqual(expect.arrayContaining(['codename://rules', 'codename://design-system/brand.md']));
    const brand = await client.readResource({ uri: 'codename://design-system/brand.md' });
    expect((brand.contents[0] as { text: string }).text).toBe('# brand');
    await close();
  });

  it('points where the agent says and reports the reach of a preview', async () => {
    const sessions = new Sessions();
    const link: Link = {
      send: (envelope) => {
        if (envelope.type !== 'request') return;
        const req = envelope.payload as { method: string };
        const payload = req.method === 'point' ? { matched: 3 } : { applied: true, rules: 4, matched: 27, unreadable: 1, touchesLocked: ['--mark'] };
        queueMicrotask(() => sessions.handleResponse('s1', { v: envelope.v, id: 'r', type: 'response', replyTo: envelope.id, ok: true, payload }));
      },
    };
    sessions.connect('s1', link);
    sessions.update('s1', makeState('s1', 1, { agentMayWrite: true }));
    const { client, close } = await connectedClient(sessions);

    expect(textOf(await client.callTool({ name: 'point', arguments: { selector: '.card', note: 'these' } }))).toBe('pointing at .card (3 matches)');
    const applied = textOf(await client.callTool({ name: 'apply_css', arguments: { css: '.card{outline:1px solid red}' } }));
    expect(applied).toContain('4 rules reaching 27 elements');
    expect(applied).toContain('1 selector(s)');
    expect(applied).toContain('redefines --mark, which the user locked');

    await close();
  });

  it('passes a token file to the panel and returns the comparison as text', async () => {
    const sessions = new Sessions();
    let seen: unknown = null;
    const link: Link = {
      send: (envelope) => {
        if (envelope.type !== 'request') return;
        seen = envelope.payload;
        queueMicrotask(() =>
          sessions.handleResponse('s1', {
            v: envelope.v,
            id: 'r',
            type: 'response',
            replyTo: envelope.id,
            ok: true,
            payload: { tokens: 12, findings: [], summary: 'the page and the file agree', text: 'localhost and tokens.json agree, across 12 tokens.' },
          }),
        );
      },
    };
    sessions.connect('s1', link);
    const { client, close } = await connectedClient(sessions);

    const result = textOf(await client.callTool({ name: 'check_tokens', arguments: { file: '{"a":{"$value":"#fff"}}', name: 'tokens.json' } }));
    expect(seen).toMatchObject({ method: 'check_tokens', name: 'tokens.json' });
    expect(result).toBe('localhost and tokens.json agree, across 12 tokens.');
    await close();
  });

  it('asks the panel for the design system and hands each file over as its own block', async () => {
    const sessions = new Sessions();
    // A panel that answers the one request it gets.
    const link: Link = {
      send: (envelope) => {
        if (envelope.type !== 'request') return;
        const files = (envelope.payload as { files?: string[] }).files ?? [];
        queueMicrotask(() =>
          sessions.handleResponse('s1', {
            v: envelope.v,
            id: 'r',
            type: 'response',
            replyTo: envelope.id,
            ok: true,
            payload: {
              url: 'http://localhost:3000/',
              scannedAt: Date.UTC(2026, 8, 10),
              files: files.map((path) => ({ path, content: `# ${path}`, note: 'n' })),
            },
          }),
        );
      },
    };
    sessions.connect('s1', link);
    const { client, close } = await connectedClient(sessions);

    const result = await client.callTool({ name: 'get_design_system', arguments: { files: ['brand.md', 'SKILL.md'] } });
    const blocks = (result.content as Array<{ type: string; text: string }>).map((c) => c.text);
    expect(blocks[0]).toContain('2026-09-10');
    expect(blocks[0]).toContain('brand.md, SKILL.md');
    expect(blocks[1]).toMatch(/^=== brand\.md — n ===\n# brand\.md$/);
    expect(blocks[2]).toMatch(/^=== SKILL\.md/);

    await close();
  });
});

describe('the project on disk', () => {
  const dirs: string[] = [];
  const project = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), 'codename-mcp-'));
    dirs.push(dir);
    for (const [path, content] of Object.entries(files)) {
      const absolute = join(dir, path);
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, content);
    }
    return dir;
  };
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  /** A session whose state says whether the person allowed writes. */
  const sessionsWith = (bridgeMayWrite: boolean) => {
    const sessions = new Sessions();
    sessions.connect('s1', { send: () => {} });
    sessions.update('s1', makeState('s1', 1, { bridgeMayWrite }));
    return sessions;
  };

  it('finds where a property is defined, and says what each definition sits in', async () => {
    const dir = project({
      'src/index.css': ':root {\n  --mark: #BE3A22;\n}\n',
      'src/dark.css': '@media (prefers-color-scheme: dark) { :root { --mark: #FF8A70; } }\n',
    });
    const { client, close } = await connectedClient(new Sessions(), undefined, dir);
    const found = JSON.parse(textOf(await client.callTool({ name: 'find_definition', arguments: { name: '--mark' } })));
    expect(found.found['--mark']).toHaveLength(2);
    expect(found.found['--mark'].map((d: { context: string }) => d.context).sort()).toEqual(['dark', 'root']);
    await close();
  });

  it('reads a token file from the project when given a path', async () => {
    const dir = project({ 'design/tokens.json': '{"mark":{"$value":"#BE3A22"}}' });
    const sessions = new Sessions();
    let seen: unknown;
    sessions.connect('s1', {
      send: (envelope) => {
        if (envelope.type !== 'request') return;
        seen = envelope.payload;
        queueMicrotask(() =>
          sessions.handleResponse('s1', { v: envelope.v, id: 'r', type: 'response', replyTo: envelope.id, ok: true, payload: { text: 'read it' } }),
        );
      },
    });
    const { client, close } = await connectedClient(sessions, undefined, dir);
    const result = textOf(await client.callTool({ name: 'check_tokens', arguments: { path: 'design/tokens.json' } }));
    expect(seen).toMatchObject({ method: 'check_tokens', name: 'design/tokens.json', file: '{"mark":{"$value":"#BE3A22"}}' });
    expect(result).toBe('read it');
    await close();
  });

  it('refuses a token file path that points out of the project', async () => {
    const { client, close } = await connectedClient(new Sessions(), undefined, project({}));
    const result = await client.callTool({ name: 'check_tokens', arguments: { path: '../../etc/passwd' } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/outside the folder/);
    await close();
  });

  it('insists on exactly one of path and file', async () => {
    const { client, close } = await connectedClient(new Sessions(), undefined, project({}));
    const both = await client.callTool({ name: 'check_tokens', arguments: { path: 'a.json', file: '{}' } });
    expect(both.isError).toBe(true);
    const neither = await client.callTool({ name: 'check_tokens', arguments: {} });
    expect(neither.isError).toBe(true);
    await close();
  });

  it('will not write a definition until the person has allowed it', async () => {
    const dir = project({ 'src/index.css': ':root {\n  --mark: #BE3A22;\n}\n' });
    const { client, close } = await connectedClient(sessionsWith(false), undefined, dir);
    const result = await client.callTool({
      name: 'apply_definition',
      arguments: { name: '--mark', from: '#BE3A22', to: '#1C7F5C' },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/has not allowed/);
    expect(readFileSync(join(dir, 'src/index.css'), 'utf8')).toContain('#BE3A22');
    await close();
  });

  it('writes one definition once the person has allowed it', async () => {
    const dir = project({ 'src/index.css': ':root {\n  --mark: #BE3A22;\n}\n' });
    const { client, close } = await connectedClient(sessionsWith(true), undefined, dir);
    const result = textOf(
      await client.callTool({ name: 'apply_definition', arguments: { name: '--mark', from: '#BE3A22', to: '#1C7F5C' } }),
    );
    expect(result).toBe('--mark: #BE3A22 → #1C7F5C in src/index.css:2');
    expect(readFileSync(join(dir, 'src/index.css'), 'utf8')).toBe(':root {\n  --mark: #1C7F5C;\n}\n');
    await close();
  });

  it('refuses to choose between two root definitions', async () => {
    const dir = project({ 'a.css': ':root { --mark: #BE3A22; }', 'b.css': ':root { --mark: #BE3A22; }' });
    const { client, close } = await connectedClient(sessionsWith(true), undefined, dir);
    const result = await client.callTool({ name: 'apply_definition', arguments: { name: '--mark', from: '#BE3A22', to: '#1C7F5C' } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/exactly one definition/);
    await close();
  });
});
