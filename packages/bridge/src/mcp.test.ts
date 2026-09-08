import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { createMcpServer } from './mcp';
import { Sessions, type Link } from './sessions';
import { makeState } from './test-helpers';

const EXPECTED_TOOLS = [
  'list_sessions',
  'get_changes',
  'watch',
  'get_screenshot',
  'apply_css',
  'clear',
  'get_selection',
  'get_comments',
  'set_status',
  'reply',
];

async function connectedClient(sessions: Sessions) {
  const { server, tools } = createMcpServer(sessions, '0.0.0-test');
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

  it('answers from the session snapshot and refuses writes without consent', async () => {
    const sessions = new Sessions();
    const link: Link = { send: () => {} };
    sessions.connect('s1', link);
    const { client, close } = await connectedClient(sessions);

    expect(textOf(await client.callTool({ name: 'get_changes', arguments: {} }))).toMatch(/has not sent any state/);

    const changes = { site: 'http://localhost:3000', editedAt: 'now', local: true, tokens: [], colors: [], system: [], elements: [], comments: [], unreadable: [] };
    sessions.update('s1', makeState('s1', 1, { changes, prompt: 'live prompt', comments: [{ id: 'c1', url: '', selector: 'h1', matches: 1, text: 'bigger', status: 'pending', createdAt: '', replies: [] }] }));
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
});
