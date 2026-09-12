/**
 * `codename-bridge setup`: one command instead of three steps. Installs the
 * skill into the agent's skills folder and registers the bridge with the
 * client, or prints what to paste where a client cannot be driven from here.
 * Takes what it needs as arguments so a test can run it against a temp dir
 * and a fake shell.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { CLAUDE_REGISTER_ARGS as REGISTER, CURSOR_MCP_JSON } from '../../../shared/protocol';
import { SKILL_MD, SKILL_NAME } from './skill';

export type SetupClient = 'claude' | 'cursor' | 'none';

export const CLAUDE_REGISTER_ARGS: string[] = [...REGISTER];
export const CURSOR_JSON = CURSOR_MCP_JSON;

export interface Exec {
  (cmd: string, args: string[]): { status: number | null; missing?: boolean; error?: string };
}

export interface SetupOptions {
  client: SetupClient;
  /** Where skills live; defaults to ~/.claude/skills. */
  skillsDir?: string;
  home?: string;
  /** Print the registration instead of running it. */
  print?: boolean;
  exec?: Exec;
  log: (line: string) => void;
}

export interface SetupResult {
  skillPath: string;
  skill: 'created' | 'updated' | 'unchanged';
  registration: 'ran' | 'printed' | 'skipped' | 'failed';
}

const defaultExec: Exec = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.error && (r.error as NodeJS.ErrnoException).code === 'ENOENT') return { status: null, missing: true };
  if (r.error) return { status: null, error: r.error.message };
  return { status: r.status };
};

export function runSetup(opts: SetupOptions): SetupResult {
  const home = opts.home ?? homedir();
  const skillsDir = opts.skillsDir ?? join(home, '.claude', 'skills');
  const skillPath = join(skillsDir, SKILL_NAME, 'SKILL.md');
  const exec = opts.exec ?? defaultExec;

  // The skill: ours to overwrite, so an upgrade refreshes it.
  let skill: SetupResult['skill'];
  if (!existsSync(skillPath)) skill = 'created';
  else skill = readFileSync(skillPath, 'utf8') === SKILL_MD ? 'unchanged' : 'updated';
  if (skill !== 'unchanged') {
    mkdirSync(dirname(skillPath), { recursive: true });
    writeFileSync(skillPath, SKILL_MD);
  }
  opts.log(`skill ${skill}: ${skillPath}`);

  let registration: SetupResult['registration'] = 'skipped';
  if (opts.client === 'claude') {
    const cmd = `claude ${CLAUDE_REGISTER_ARGS.join(' ')}`;
    if (opts.print) {
      registration = 'printed';
      opts.log(`register the bridge with Claude Code:\n  ${cmd}`);
    } else {
      const r = exec('claude', CLAUDE_REGISTER_ARGS);
      if (r.missing) {
        registration = 'printed';
        opts.log(`the claude command is not on your PATH; register the bridge yourself:\n  ${cmd}`);
      } else if (r.status === 0) {
        registration = 'ran';
        opts.log('registered the bridge with Claude Code');
      } else {
        registration = 'failed';
        opts.log(`claude mcp add exited with ${r.status ?? r.error ?? 'an error'}; run it yourself:\n  ${cmd}`);
      }
    }
  } else if (opts.client === 'cursor') {
    registration = 'printed';
    opts.log(`add this to Cursor's MCP settings:\n  ${CURSOR_JSON}\nCursor does not read skills folders; paste the skill above into a project rule if you want it read.`);
  }

  opts.log('then start your agent (it launches the bridge), ask it for the pairing code, and enter it in the panel.');
  return { skillPath, skill, registration };
}
