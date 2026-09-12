import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CLAUDE_REGISTER_ARGS, runSetup } from './setup';
import { SKILL_MD } from './skill';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codename-setup-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('setup', () => {
  it('writes the skill, registers with Claude Code, and refreshes on a second run', () => {
    const calls: string[][] = [];
    const lines: string[] = [];
    const first = runSetup({ client: 'claude', home: dir, exec: (cmd, args) => (calls.push([cmd, ...args]), { status: 0 }), log: (l) => lines.push(l) });
    expect(first.skill).toBe('created');
    expect(first.registration).toBe('ran');
    expect(readFileSync(first.skillPath, 'utf8')).toBe(SKILL_MD);
    expect(first.skillPath).toBe(join(dir, '.claude', 'skills', 'codename', 'SKILL.md'));
    expect(calls).toEqual([['claude', ...CLAUDE_REGISTER_ARGS]]);

    const again = runSetup({ client: 'none', home: dir, log: () => {} });
    expect(again.skill).toBe('unchanged');
    expect(again.registration).toBe('skipped');
  });

  it('prints the command when claude is not installed, and the JSON for Cursor', () => {
    const lines: string[] = [];
    const r = runSetup({ client: 'claude', home: dir, exec: () => ({ status: null, missing: true }), log: (l) => lines.push(l) });
    expect(r.registration).toBe('printed');
    expect(lines.join('\n')).toContain('claude mcp add codename -- npx codename-bridge');

    const cursor = runSetup({ client: 'cursor', skillsDir: join(dir, 'skills'), log: (l) => lines.push(l) });
    expect(cursor.registration).toBe('printed');
    expect(cursor.skillPath).toBe(join(dir, 'skills', 'codename', 'SKILL.md'));
    expect(lines.join('\n')).toContain('"mcpServers"');
  });
});
