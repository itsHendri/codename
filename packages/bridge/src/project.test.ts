import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readProject, type Run } from './project';

const dirs: string[] = [];
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'codename-project-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A git that answers from a table; anything unlisted fails the way a real one does. */
const gitSaying = (answers: Record<string, string | null>): Run => (cmd, args) =>
  cmd === 'git' ? (answers[args.join(' ')] ?? null) : null;

describe('readProject', () => {
  it('takes the name from package.json and the branch from git', () => {
    const dir = temp();
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'my-app' }));
    const project = readProject(
      dir,
      gitSaying({
        'rev-parse --show-toplevel': dir,
        'rev-parse --abbrev-ref HEAD': 'main',
        'status --porcelain': '',
      }),
    );
    expect(project).toMatchObject({ name: 'my-app', branch: 'main', dirty: false, root: dir });
  });

  it('falls back to the folder name when there is no package.json', () => {
    const dir = temp();
    const sub = join(dir, 'website');
    mkdirSync(sub);
    expect(readProject(sub, gitSaying({}))?.name).toBe('website');
  });

  it('reports a dirty tree', () => {
    const dir = temp();
    const project = readProject(
      dir,
      gitSaying({ 'rev-parse --show-toplevel': dir, 'rev-parse --abbrev-ref HEAD': 'main', 'status --porcelain': ' M src/a.ts' }),
    );
    expect(project?.dirty).toBe(true);
  });

  it('names a detached head by its short sha rather than "HEAD"', () => {
    const dir = temp();
    const project = readProject(
      dir,
      gitSaying({
        'rev-parse --show-toplevel': dir,
        'rev-parse --abbrev-ref HEAD': 'HEAD',
        'rev-parse --short HEAD': 'fc3424b',
        'status --porcelain': '',
      }),
    );
    expect(project?.branch).toBe('fc3424b');
  });

  it('leaves git fields out entirely when git says nothing', () => {
    const dir = temp();
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'no-git' }));
    const project = readProject(dir, () => null);
    // macOS hands out /var paths that are really /private/var; the realpath is
    // what a repository lookup needs, so that is what travels.
    expect(project).toEqual({ path: realpathSync(dir), name: 'no-git' });
    expect(project).not.toHaveProperty('branch');
    expect(project).not.toHaveProperty('dirty');
  });

  it('survives a package.json that is not valid JSON', () => {
    const dir = temp();
    writeFileSync(join(dir, 'package.json'), '{ oops');
    expect(readProject(dir, () => null)?.name).toBe(dir.split('/').pop());
  });

  it('gives back nothing when the folder is gone', () => {
    expect(readProject(join(tmpdir(), 'codename-does-not-exist-9f3a'), () => null)).toBeUndefined();
  });

  it('reads this repository for real', () => {
    const project = readProject(process.cwd());
    expect(project?.name).toBe('codename');
    expect(project?.branch).toBeTruthy();
  });
});
