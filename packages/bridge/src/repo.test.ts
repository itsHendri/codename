import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readProjectFile, resolveInside } from './repo';

const dirs: string[] = [];
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'codename-repo-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('resolveInside', () => {
  it('resolves a path in the project', () => {
    const dir = temp();
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'index.css'), ':root{}');
    expect(resolveInside(dir, 'src/index.css')).toContain('src/index.css');
  });

  it.each([['..', '../secret'], ['a climb back out', 'src/../../secret'], ['an absolute path', '/etc/passwd']])(
    'refuses %s',
    (_, path) => {
      expect(resolveInside(temp(), path)).toBe(null);
    },
  );

  it('refuses a symlink that points out of the project', () => {
    const dir = temp();
    const outside = temp();
    writeFileSync(join(outside, 'secret.css'), ':root{--x:1}');
    symlinkSync(join(outside, 'secret.css'), join(dir, 'link.css'));
    expect(resolveInside(dir, 'link.css')).toBe(null);
  });
});

describe('readProjectFile', () => {
  it('reads a file inside the project', () => {
    const dir = temp();
    writeFileSync(join(dir, 'tokens.json'), '{"a":1}');
    expect(readProjectFile(dir, 'tokens.json')).toEqual({ path: 'tokens.json', content: '{"a":1}' });
  });

  it('says so when the path escapes, without naming what is out there', () => {
    expect(() => readProjectFile(temp(), '../../etc/passwd')).toThrow(/outside the folder/);
  });

  it('says so when there is no such file', () => {
    expect(() => readProjectFile(temp(), 'nope.css')).toThrow(/no file at/);
  });

  it('refuses a file over the size limit', () => {
    const dir = temp();
    writeFileSync(join(dir, 'big.css'), 'x'.repeat(5000));
    expect(() => readProjectFile(dir, 'big.css', 1000)).toThrow(/the limit is/);
  });
});
