/**
 * Which project the bridge is running in.
 *
 * The extension sees a URL; the bridge sees a folder. Naming it is what lets
 * the panel key decisions by repository rather than by origin — two apps on
 * localhost:3000 are not the same project, and the same app on staging and
 * production is not two.
 *
 * Everything here fails closed: git missing, not a repository, a detached
 * head, a slow filesystem — each leaves its own field undefined rather than
 * guessing, because a wrong branch name on the brief is worse than none.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { ProjectInfo } from '../../../shared/protocol';

/** Runs a command and gives back its stdout, or null for any kind of failure. */
export interface Run {
  (cmd: string, args: string[], cwd: string): string | null;
}

const GIT_TIMEOUT_MS = 2_000;

const defaultRun: Run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: GIT_TIMEOUT_MS });
  if (r.error || r.status !== 0 || typeof r.stdout !== 'string') return null;
  return r.stdout.trim();
};

/** The `name` field of a package.json, when there is one worth reading. */
function packageName(dir: string): string | undefined {
  try {
    const raw = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name?: unknown };
    return typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : undefined;
  } catch {
    return undefined;
  }
}

export function readProject(cwd: string = process.cwd(), run: Run = defaultRun): ProjectInfo | undefined {
  let path: string;
  try {
    path = realpathSync(cwd);
  } catch {
    return undefined;
  }

  const root = run('git', ['rev-parse', '--show-toplevel'], path) || undefined;
  // The repository root names the project better than a subfolder does, but
  // only when we could read it.
  const nameFrom = root ?? path;
  const name = packageName(path) ?? packageName(nameFrom) ?? basename(nameFrom);

  let branch: string | undefined;
  if (root) {
    const named = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], path);
    // A detached head answers "HEAD", which says nothing; the short sha does.
    branch = named && named !== 'HEAD' ? named : (run('git', ['rev-parse', '--short', 'HEAD'], path) ?? undefined);
  }

  let dirty: boolean | undefined;
  if (root) {
    const status = run('git', ['status', '--porcelain'], path);
    if (status !== null) dirty = status.length > 0;
  }

  return { path, name, ...(root ? { root } : {}), ...(branch ? { branch } : {}), ...(dirty === undefined ? {} : { dirty }) };
}
