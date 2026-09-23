import { describe, expect, it } from 'vitest';
import { AGENTS, candidates, customAgent, findAgents, locate, relativeTo, type LocateEnv } from './agents';

const env = (over: Partial<LocateEnv> & { present?: string[]; dirs?: Record<string, string[]> } = {}): LocateEnv => ({
  home: '/Users/h',
  path: '/usr/bin:/bin',
  platform: 'darwin',
  executable: (f) => (over.present ?? []).includes(f),
  list: (d) => over.dirs?.[d] ?? [],
  ...over,
});

const line = (v: unknown) => JSON.stringify(v);

describe('Claude Code', () => {
  const claude = AGENTS.claude;

  it('is held to reading and editing, with no shell, no web, and no MCP of its own', () => {
    const inv = claude.invocation('/bin/claude', 'THE BRIEF');
    expect(inv.cmd).toBe('/bin/claude');
    expect(inv.args).toEqual([
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
    ]);
    // The brief goes on stdin, never into argv after a variadic option.
    expect(inv.args.join(' ')).not.toContain('THE BRIEF');
    expect(inv.stdin).toBe('THE BRIEF');
  });

  it('reads an edit, a read, and the result from its stream', () => {
    const edit = line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/p/src/a.tsx' } }] } });
    const read = line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/p/src/b.css' } }] } });
    const grep = line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Grep', input: { pattern: '--mark' } }] } });
    expect(claude.parse(edit)).toEqual({ kind: 'step', text: 'Editing /p/src/a.tsx', file: '/p/src/a.tsx' });
    expect(claude.parse(read)).toEqual({ kind: 'step', text: 'Reading /p/src/b.css' });
    expect(claude.parse(grep)).toEqual({ kind: 'step', text: 'Searching for --mark' });
    expect(claude.parse(line({ type: 'result', subtype: 'success', is_error: false, result: 'Moved it.' }))).toEqual({ kind: 'done', summary: 'Moved it.' });
    expect(claude.parse(line({ type: 'result', subtype: 'success', is_error: true, result: 'Invalid API key' }))).toEqual({ kind: 'failed', error: 'Invalid API key' });
  });

  it('says nothing about text, tool results, or lines that are not JSON', () => {
    expect(claude.parse(line({ type: 'assistant', message: { content: [{ type: 'text', text: 'thinking' }] } }))).toBe(null);
    expect(claude.parse(line({ type: 'user', message: { content: [{ type: 'tool_result' }] } }))).toBe(null);
    expect(claude.parse('warming up')).toBe(null);
  });
});

describe('signing in', () => {
  it('names the desktop app’s own copy, quoted, when that is the one found', () => {
    const bundled = '/Users/h/Library/Application Support/Claude/claude-code/2.1.280/claude.app/Contents/MacOS/claude';
    const fix = AGENTS.claude.signIn(bundled);
    expect(fix.command).toBe(`"${bundled}" auth login`);
    expect(fix.text).toMatch(/Claude app signs in its own copy separately/);
    expect(AGENTS.claude.signIn('/usr/local/bin/claude')).toEqual({
      text: 'Claude Code is not signed in. Run this in a terminal, then try again:',
      command: '/usr/local/bin/claude auth login',
    });
  });

  it('reads Claude Code’s own answer to auth status', () => {
    const answer = (stdout: string) => () => ({ status: 0, stdout });
    expect(AGENTS.claude.signedIn!('/c', answer('{"loggedIn": true}'))).toBe(true);
    expect(AGENTS.claude.signedIn!('/c', answer('{"loggedIn": false, "authMethod": "none"}'))).toBe(false);
    expect(AGENTS.claude.signedIn!('/c', answer('command not found'))).toBe(null);
  });
});

describe('Cursor', () => {
  it('applies edits in print mode and says it can run commands', () => {
    const inv = AGENTS.cursor.invocation('cursor-agent', 'B');
    expect(inv.args).toEqual(['-p', '--output-format', 'stream-json', '--force', 'B']);
    expect(AGENTS.cursor.can).toMatch(/run commands/);
  });

  it('reads its tool calls and result', () => {
    const edit = line({ type: 'tool_call', subtype: 'started', tool_call: { editToolCall: { args: { path: '/p/x.css' } } } });
    const read = line({ type: 'tool_call', subtype: 'started', tool_call: { readToolCall: { args: { path: '/p/y.ts' } } } });
    expect(AGENTS.cursor.parse(edit)).toEqual({ kind: 'step', text: 'Editing /p/x.css', file: '/p/x.css' });
    expect(AGENTS.cursor.parse(read)).toEqual({ kind: 'step', text: 'Reading /p/y.ts' });
    expect(AGENTS.cursor.parse(line({ type: 'result', is_error: false, result: 'ok' }))).toEqual({ kind: 'done', summary: 'ok' });
  });
});

describe('Codex', () => {
  it('runs sandboxed to the folder, brief on stdin', () => {
    const inv = AGENTS.codex.invocation('codex', 'B');
    expect(inv.args).toEqual(['exec', '--json', '--sandbox', 'workspace-write', '--skip-git-repo-check', '-']);
    expect(inv.stdin).toBe('B');
    expect(AGENTS.codex.can).toMatch(/sandbox/);
  });

  it('reads file changes, commands, its last message and a failure', () => {
    expect(AGENTS.codex.parse(line({ type: 'item.completed', item: { type: 'file_change', changes: [{ path: '/p/a.css', kind: 'update' }] } }))).toEqual({
      kind: 'step',
      text: 'Editing /p/a.css',
      file: '/p/a.css',
    });
    expect(AGENTS.codex.parse(line({ type: 'item.started', item: { type: 'command_execution', command: 'rg mark' } }))).toEqual({ kind: 'step', text: 'Running rg mark' });
    expect(AGENTS.codex.parse(line({ type: 'item.completed', item: { type: 'agent_message', text: 'Done.' } }))).toEqual({ kind: 'done', summary: 'Done.' });
    expect(AGENTS.codex.parse(line({ type: 'turn.failed', error: { message: 'boom' } }))).toEqual({ kind: 'failed', error: 'boom' });
  });
});

describe('a custom command', () => {
  it('puts the brief where {prompt} is, without a shell', () => {
    const a = customAgent('aider --yes --message {prompt}');
    expect(a.name).toBe('aider');
    expect(a.invocation('aider', 'B')).toEqual({ cmd: 'aider', args: ['--yes', '--message', 'B'] });
  });

  it('pipes the brief in when there is no slot for it', () => {
    expect(customAgent('mytool run').invocation('mytool', 'B')).toEqual({ cmd: 'mytool', args: ['run'], stdin: 'B' });
  });

  it('shows each line of output as a step', () => {
    expect(customAgent('x').parse('  editing a.css ')).toEqual({ kind: 'step', text: 'editing a.css' });
    expect(customAgent('x').parse('   ')).toBe(null);
  });
});

describe('finding the tools', () => {
  it('looks on PATH first', () => {
    expect(locate('claude', env({ present: ['/usr/bin/claude', '/Users/h/.local/bin/claude'] }))).toBe('/usr/bin/claude');
  });

  it('looks in the usual install folders a desktop app PATH leaves out', () => {
    expect(locate('codex', env({ present: ['/opt/homebrew/bin/codex'] }))).toBe('/opt/homebrew/bin/codex');
    expect(locate('claude', env({ present: ['/Users/h/.claude/local/claude'] }))).toBe('/Users/h/.claude/local/claude');
  });

  it('finds the Claude desktop app’s own copy, newest version first', () => {
    const root = '/Users/h/Library/Application Support/Claude/claude-code';
    const bin = (v: string) => `${root}/${v}/claude.app/Contents/MacOS/claude`;
    const e = env({ dirs: { [root]: ['2.1.9', '2.1.280', '2.1.275'] }, present: [bin('2.1.275'), bin('2.1.280'), bin('2.1.9')] });
    expect(locate('claude', e)).toBe(bin('2.1.280'));
    // Only Claude, and only on a Mac.
    expect(candidates('codex', e).some((c) => c.includes('Application Support'))).toBe(false);
    expect(locate('claude', { ...e, platform: 'linux' })).toBe(null);
  });

  it('offers only what it found, with a custom command first', () => {
    const e = env({ present: ['/usr/bin/codex'] });
    expect(findAgents(e, undefined).map((f) => f.agent.id)).toEqual(['codex']);
    expect(findAgents(e, 'aider {prompt}').map((f) => [f.agent.id, f.bin])).toEqual([
      ['custom', 'aider'],
      ['codex', '/usr/bin/codex'],
    ]);
    expect(findAgents(env(), undefined)).toEqual([]);
  });
});

describe('relativeTo', () => {
  it('shortens a path inside the project and leaves others alone', () => {
    expect(relativeTo('/p', '/p/src/a.css')).toBe('src/a.css');
    expect(relativeTo('/p/', '/p/a.css')).toBe('a.css');
    expect(relativeTo('/p', 'src/a.css')).toBe('src/a.css');
    expect(relativeTo('/p', '/elsewhere/a.css')).toBe('/elsewhere/a.css');
  });
});
