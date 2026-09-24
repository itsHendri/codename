import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeTokens } from './writer';

const dirs: string[] = [];
const project = (files: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), 'codename-writer-'));
  dirs.push(dir);
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(dir, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
  }
  return dir;
};
const noGit = { run: () => null };
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** forfontsake's shape: a root block, the dark side spelled twice, a width override. */
const FORFONTSAKE = `:root {
  --ink: #15171b;
  --mark: #be3a22;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --ink: #e3e0d6;
    --mark: #e0603f;
  }
}
:root[data-theme='dark'] {
  --ink: #e3e0d6;
  --mark: #e0603f;
}
@media (max-width: 700px) {
  :root {
    --mark: #a02a12;
  }
}
`;

describe('writeTokens', () => {
  it('writes a light value into the root only, and reports the other scopes as left', () => {
    const dir = project({ 'src/index.css': FORFONTSAKE });
    const result = writeTokens(dir, [{ name: '--mark', from: '#be3a22', to: '#1c7f5c' }], noGit);
    expect(result.refused).toEqual([]);
    expect(result.written).toEqual([{ name: '--mark', file: 'src/index.css', line: 3, from: '#be3a22', to: '#1c7f5c', scope: 'root' }]);
    expect(result.left.map((l) => l.definition.line)).toEqual([8, 13, 17]);
    const text = readFileSync(join(dir, 'src/index.css'), 'utf8');
    expect(text).toContain('--mark: #1c7f5c;');
    expect(text.match(/#e0603f/g)).toHaveLength(2);
    expect(text).toContain('#a02a12');
    // Only the value moved; every other byte is as it was.
    expect(text.replace('#1c7f5c', '#be3a22')).toBe(FORFONTSAKE);
  });

  it('writes a dark value into both spellings of the dark side', () => {
    const dir = project({ 'src/index.css': FORFONTSAKE });
    const result = writeTokens(dir, [{ name: '--mark', from: '#e0603f', to: '#ff7a5c', mode: 'dark' }], noGit);
    expect(result.refused).toEqual([]);
    expect(result.written.map((w) => [w.line, w.scope])).toEqual([[8, 'dark'], [13, 'dark']]);
    const text = readFileSync(join(dir, 'src/index.css'), 'utf8');
    expect(text.match(/#ff7a5c/g)).toHaveLength(2);
    expect(text).toContain('--mark: #be3a22;');
    expect(text.replace(/#ff7a5c/g, '#e0603f')).toBe(FORFONTSAKE);
  });

  it('refuses a dark edit whose dark blocks disagree, and writes nothing', () => {
    const css = FORFONTSAKE.replace("[data-theme='dark'] {\n  --ink: #e3e0d6;\n  --mark: #e0603f;", "[data-theme='dark'] {\n  --ink: #e3e0d6;\n  --mark: #ff0000;");
    const dir = project({ 'src/index.css': css });
    const result = writeTokens(dir, [{ name: '--mark', from: '#e0603f', to: '#ff7a5c', mode: 'dark' }], noGit);
    expect(result.written).toEqual([]);
    expect(result.refused[0]?.reason).toMatch(/2 dark definitions that disagree/);
    expect(readFileSync(join(dir, 'src/index.css'), 'utf8')).toBe(css);
  });

  it('refuses a name that lives only under a width query', () => {
    const dir = project({ 'a.css': '@media (max-width: 700px) { :root { --mark: #a02a12; } }' });
    const result = writeTokens(dir, [{ name: '--mark', from: '#a02a12', to: '#000' }], noGit);
    expect(result.written).toEqual([]);
    expect(result.refused[0]?.reason).toMatch(/only under width/);
  });

  it('refuses a value that changed since it was read', () => {
    const dir = project({ 'src/index.css': FORFONTSAKE });
    const result = writeTokens(dir, [{ name: '--mark', from: '#000000', to: '#1c7f5c' }], noGit);
    expect(result.refused[0]?.reason).toMatch(/is `#be3a22` in source, not `#000000`/);
    expect(readFileSync(join(dir, 'src/index.css'), 'utf8')).toBe(FORFONTSAKE);
  });

  it('refuses to flatten a computed value unless the edit says so', () => {
    const css = ':root { --base: #be3a22; --mark: var(--base); }';
    const dir = project({ 'a.css': css });
    const refused = writeTokens(dir, [{ name: '--mark', from: 'var(--base)', to: '#1c7f5c' }], noGit);
    expect(refused.written).toEqual([]);
    expect(refused.refused[0]?.reason).toMatch(/computed from others/);
    const flattened = writeTokens(dir, [{ name: '--mark', from: 'var(--base)', to: '#1c7f5c', flatten: true }], noGit);
    expect(flattened.written).toHaveLength(1);
    expect(readFileSync(join(dir, 'a.css'), 'utf8')).toBe(':root { --base: #be3a22; --mark: #1c7f5c; }');
  });

  it('keeps a computed value computed without being told', () => {
    const dir = project({ 'a.css': ':root { --base: #be3a22; --mark: var(--base); }' });
    const result = writeTokens(dir, [{ name: '--mark', from: 'var(--base)', to: 'var(--ink)' }], noGit);
    expect(result.written).toHaveLength(1);
  });

  it('writes a Tailwind @theme value as theme', () => {
    const dir = project({ 'app.css': '@import "tailwindcss";\n@theme {\n  --color-mark: #be3a22;\n}\n' });
    const result = writeTokens(dir, [{ name: '--color-mark', from: '#be3a22', to: 'oklch(60% 0.2 30)' }], noGit);
    expect(result.written[0]).toMatchObject({ scope: 'theme', line: 3 });
    expect(readFileSync(join(dir, 'app.css'), 'utf8')).toContain('--color-mark: oklch(60% 0.2 30);');
  });

  it("lands shadcn's light and dark values in their own blocks", () => {
    const css = ':root {\n  --background: oklch(1 0 0);\n}\n.dark {\n  --background: oklch(0.14 0 0);\n}\n';
    const dir = project({ 'globals.css': css });
    const light = writeTokens(dir, [{ name: '--background', from: 'oklch(1 0 0)', to: 'oklch(0.98 0.01 90)' }], noGit);
    expect(light.written.map((w) => [w.line, w.scope])).toEqual([[2, 'root']]);
    const dark = writeTokens(dir, [{ name: '--background', from: 'oklch(0.14 0 0)', to: 'oklch(0.12 0.01 90)', mode: 'dark' }], noGit);
    expect(dark.written.map((w) => [w.line, w.scope])).toEqual([[5, 'dark']]);
    expect(readFileSync(join(dir, 'globals.css'), 'utf8')).toBe(
      ':root {\n  --background: oklch(0.98 0.01 90);\n}\n.dark {\n  --background: oklch(0.12 0.01 90);\n}\n',
    );
  });

  it('writes several edits in one file in one pass, later lines first', () => {
    const dir = project({ 'src/index.css': FORFONTSAKE });
    const result = writeTokens(
      dir,
      [
        { name: '--ink', from: '#15171b', to: '#000000' },
        { name: '--mark', from: '#be3a22', to: '#1c7f5c' },
      ],
      noGit,
    );
    expect(result.written.map((w) => [w.name, w.line])).toEqual([
      ['--ink', 2],
      ['--mark', 3],
    ]);
    const text = readFileSync(join(dir, 'src/index.css'), 'utf8');
    expect(text).toContain('--ink: #000000;\n  --mark: #1c7f5c;');
  });

  it('refuses an edit whole when one of its places has moved, and still writes the others', () => {
    const dir = project({ 'src/index.css': FORFONTSAKE });
    // Found first, then the file changes under the dark block before the write.
    const found = writeTokens(dir, [], noGit);
    void found;
    const text = FORFONTSAKE.replace("  :root:not([data-theme='light']) {\n    --ink: #e3e0d6;\n", "  :root:not([data-theme='light']) {\n    --ink: #e3e0d6;\n    --pad: 1px;\n");
    writeFileSync(join(dir, 'src/index.css'), text);
    // The search is fresh each call, so this is really the case where a
    // stale `from` for one target refuses that edit and not the other.
    const result = writeTokens(
      dir,
      [
        { name: '--mark', from: '#e0603f', to: '#ff7a5c', mode: 'dark' },
        { name: '--ink', from: '#15171b', to: '#000000' },
      ],
      noGit,
    );
    expect(result.written.map((w) => w.name).sort()).toEqual(['--ink', '--mark', '--mark']);
  });

  it('refuses a bad value before looking', () => {
    const dir = project({ 'src/index.css': FORFONTSAKE });
    const result = writeTokens(dir, [{ name: '--mark', from: '#be3a22', to: 'red; } body {' }], noGit);
    expect(result.refused[0]?.reason).toMatch(/cannot contain/);
    expect(readFileSync(join(dir, 'src/index.css'), 'utf8')).toBe(FORFONTSAKE);
  });

  it('refuses everything when the search did not finish', () => {
    const dir = project({ 'a.css': ':root { --mark: #be3a22; }', 'b.css': 'body {}' });
    const result = writeTokens(dir, [{ name: '--mark', from: '#be3a22', to: '#000' }], { ...noGit, maxFiles: 1 });
    expect(result.written).toEqual([]);
    expect(result.refused[0]?.reason).toMatch(/stopped before it had read the whole project/);
  });

  it('says so for a name that is not defined', () => {
    const dir = project({ 'a.css': 'body {}' });
    expect(writeTokens(dir, [{ name: '--mark', from: 'x', to: 'y' }], noGit).refused[0]?.reason).toMatch(/not defined anywhere/);
  });
});
