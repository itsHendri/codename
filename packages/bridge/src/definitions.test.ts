import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ApplyRefused,
  applyDefinition,
  contextOf,
  declarationOn,
  definitionsInCss,
  definitionsInJson,
  findDefinitions,
  isSearchable,
  listFiles,
  stripComments,
} from './definitions';

const dirs: string[] = [];
/** A project on disk. Paths are posix; folders are made as needed. */
const project = (files: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), 'codename-defs-'));
  dirs.push(dir);
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(dir, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
  }
  return dir;
};
/** No git, so the walk is exercised. */
const noGit = { run: () => null };

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('stripComments', () => {
  it('blanks comments and keeps every line', () => {
    const out = stripComments(':root {\n  /* --mark: red; */\n  --mark: blue;\n}');
    expect(out.split('\n')).toHaveLength(4);
    expect(out).not.toContain('red');
    expect(out).toContain('--mark: blue');
  });

  it('leaves a url alone', () => {
    expect(stripComments('a { background: url(https://x.test/a.png); }')).toContain('https://x.test/a.png');
  });
});

describe('declarationOn', () => {
  it('reads the value up to the semicolon', () => {
    expect(declarationOn('  --mark: #BE3A22;', '--mark')?.value).toBe('#BE3A22');
  });

  it('keeps a function call whole', () => {
    expect(declarationOn('--shadow: rgba(0,0,0,.2) 0 1px;', '--shadow')?.value).toBe('rgba(0,0,0,.2) 0 1px');
  });

  it('does not read a usage as a definition', () => {
    expect(declarationOn('color: var(--mark);', '--mark')).toBe(null);
  });

  it('does not match a longer name that ends with the one asked for', () => {
    expect(declarationOn('--brand-mark: red;', '--mark')).toBe(null);
  });

  it('stops at the end of an inline block', () => {
    expect(declarationOn(':root { --mark: red }', '--mark')?.value).toBe('red');
  });
});

describe('contextOf', () => {
  it.each([
    [[':root {'], 'root'],
    [['html'], 'root'],
    [['@theme'], 'root'],
    [['@media (prefers-color-scheme: dark)', ':root'], 'dark'],
    [['@media (max-width: 700px)', ':root'], 'media'],
    [['.card'], 'scoped'],
    [[], 'root'],
  ])('reads %s as %s', (open, expected) => {
    expect(contextOf(open as string[])).toBe(expected);
  });
});

describe('definitionsInCss', () => {
  it('finds a definition and names its line', () => {
    const css = ':root {\n  --paper: #fff;\n  --mark: #BE3A22;\n}\n';
    expect(definitionsInCss(css, ['--mark'], 'src/index.css')).toEqual({
      '--mark': [{ file: 'src/index.css', line: 3, kind: 'css', context: 'root', value: '#BE3A22' }],
    });
  });

  it('marks a Tailwind theme block as root', () => {
    const css = '@import "tailwindcss";\n@theme {\n  --mark: oklch(0.6 0.2 30);\n}\n';
    expect(definitionsInCss(css, ['--mark'], 'app.css')['--mark']?.[0]).toMatchObject({ kind: 'theme', context: 'root' });
  });

  it('separates a dark, a width and a scoped definition from the root one', () => {
    const css = [
      ':root { --mark: red; }',
      '@media (prefers-color-scheme: dark) { :root { --mark: pink; } }',
      '@media (max-width: 700px) { :root { --mark: crimson; } }',
      '.card { --mark: maroon; }',
    ].join('\n');
    expect(definitionsInCss(css, ['--mark'], 'a.css')['--mark']?.map((d) => [d.context, d.value])).toEqual([
      ['root', 'red'],
      ['dark', 'pink'],
      ['media', 'crimson'],
      ['scoped', 'maroon'],
    ]);
  });

  it('ignores a commented-out definition and a usage', () => {
    const css = ':root {\n  /* --mark: red; */\n  color: var(--mark);\n}\n';
    expect(definitionsInCss(css, ['--mark'], 'a.css')).toEqual({});
  });

  it('reads a declaration that wraps over lines, and reports where it starts', () => {
    const css = ':root {\n  --shadow:\n    0 1px 2px rgba(0,0,0,.2);\n}\n';
    expect(definitionsInCss(css, ['--shadow'], 'a.css')['--shadow']?.[0]).toMatchObject({ line: 2 });
  });

  it('says nothing about a file that never mentions the name', () => {
    expect(definitionsInCss('body { color: red }', ['--mark'], 'a.css')).toEqual({});
  });
});

describe('definitionsInJson', () => {
  it('pairs a DTCG token with a page variable by name', () => {
    const json = JSON.stringify({ color: { mark: { $type: 'color', $value: '#BE3A22' } } }, null, 2);
    expect(definitionsInJson(json, ['--mark'], 'tokens.json')['--mark']?.[0]).toMatchObject({
      kind: 'dtcg',
      context: 'root',
      value: '#BE3A22',
    });
  });

  it('reads a flat map of custom properties', () => {
    const json = JSON.stringify({ '--mark': '#BE3A22' }, null, 2);
    expect(definitionsInJson(json, ['--mark'], 'design-tokens.json')['--mark']?.[0]).toMatchObject({ kind: 'flat-json' });
  });

  it('leaves a name two tokens could answer to unpaired', () => {
    const json = JSON.stringify({ light: { mark: { $value: '#a00' } }, dark: { mark: { $value: '#f00' } } }, null, 2);
    expect(definitionsInJson(json, ['--mark'], 'tokens.json')).toEqual({});
  });

  it('leaves the line null when the leaf key is written more than once', () => {
    const json = '{\n  "color": {\n    "mark": { "$value": "#BE3A22" }\n  },\n  "notes": { "mark": "see above" }\n}';
    expect(definitionsInJson(json, ['--mark'], 'tokens.json')['--mark']?.[0]?.line).toBe(null);
  });
});

describe('listFiles', () => {
  it('takes only files that could hold a definition', () => {
    expect(['a.css', 'b.scss', 'c.astro', 'tokens.json'].every(isSearchable)).toBe(true);
    expect(['a.ts', 'b.png', 'package.json'].some(isSearchable)).toBe(false);
  });

  it('skips dependencies and build output when it has to walk', () => {
    const dir = project({
      'src/index.css': ':root{--mark:red}',
      'node_modules/pkg/style.css': ':root{--mark:blue}',
      'dist/app.css': ':root{--mark:green}',
    });
    expect(listFiles(dir, noGit.run).files).toEqual(['src/index.css']);
  });

  it('asks git first, so an ignored file is ignored', () => {
    const dir = project({ 'src/index.css': ':root{--mark:red}' });
    const files = listFiles(dir, () => 'src/index.css\0dist/out.css\0notes.md\0').files;
    expect(files).toEqual(['src/index.css', 'dist/out.css']);
  });
});

describe('findDefinitions', () => {
  it('searches a project and reports where each name lives', () => {
    const dir = project({
      'src/index.css': ':root {\n  --mark: #BE3A22;\n}\n',
      'src/dark.css': '@media (prefers-color-scheme: dark) {\n  :root { --mark: #FF8A70; }\n}\n',
      'node_modules/x/a.css': ':root { --mark: nope; }',
    });
    const { found } = findDefinitions(dir, ['--mark'], noGit);
    expect(found['--mark']).toHaveLength(2);
    expect(found['--mark']?.map((d) => d.context).sort()).toEqual(['dark', 'root']);
  });

  it('ignores a name that is not a custom property', () => {
    expect(findDefinitions(project({}), ['mark'], noGit).found).toEqual({});
  });

  it('flags a search that ran out of budget', () => {
    const dir = project({ 'a.css': ':root{--mark:red}', 'b.css': ':root{--mark:blue}' });
    let t = 0;
    const result = findDefinitions(dir, ['--mark'], { ...noGit, now: () => (t += 1000), budgetMs: 500 });
    expect(result.truncated).toBe(true);
  });
});

describe('applyDefinition', () => {
  const edit = { name: '--mark', from: '#BE3A22', to: '#1C7F5C', file: 'src/index.css', line: 2 };

  it('rewrites only the value, keeping the line around it', () => {
    const dir = project({ 'src/index.css': ':root {\n  --mark:   #BE3A22; /* brand */\n}\n' });
    expect(applyDefinition(dir, edit, noGit)).toMatchObject({ file: 'src/index.css', line: 2, to: '#1C7F5C' });
    expect(readFileSync(join(dir, 'src/index.css'), 'utf8')).toBe(':root {\n  --mark:   #1C7F5C; /* brand */\n}\n');
  });

  it('refuses when the value in source is not what was read', () => {
    const dir = project({ 'src/index.css': ':root {\n  --mark: #123456;\n}\n' });
    expect(() => applyDefinition(dir, edit, noGit)).toThrow(ApplyRefused);
    expect(() => applyDefinition(dir, edit, noGit)).toThrow(/changed since it was read/);
  });

  it('refuses when the only definitions sit under a media query', () => {
    const dir = project({ 'src/index.css': '@media (max-width: 700px) {\n  :root { --mark: #BE3A22; }\n}\n' });
    expect(() => applyDefinition(dir, edit, noGit)).toThrow(/media query or a scoped selector/);
  });

  it('refuses when two root definitions disagree', () => {
    const dir = project({
      'src/index.css': ':root {\n  --mark: #BE3A22;\n}\n',
      'src/other.css': ':root { --mark: #BE3A22; }\n',
    });
    expect(() => applyDefinition(dir, edit, noGit)).toThrow(/2 definitions at the root/);
  });

  it('refuses when the definition has moved', () => {
    const dir = project({ 'src/index.css': '\n\n:root {\n  --mark: #BE3A22;\n}\n' });
    expect(() => applyDefinition(dir, edit, noGit)).toThrow(/has moved since it was found/);
  });

  it('refuses to edit a token file', () => {
    const dir = project({ 'tokens.json': JSON.stringify({ mark: { $value: '#BE3A22' } }) });
    expect(() => applyDefinition(dir, { ...edit, file: 'tokens.json', line: 1 }, noGit)).toThrow(/token file/);
  });

  it('refuses a name it cannot find at all', () => {
    expect(() => applyDefinition(project({ 'a.css': 'body{}' }), edit, noGit)).toThrow(/not defined anywhere/);
  });

  it('leaves no temporary file behind', () => {
    const dir = project({ 'src/index.css': ':root {\n  --mark: #BE3A22;\n}\n' });
    applyDefinition(dir, edit, noGit);
    expect(listFiles(dir, noGit.run).files.filter((f) => f.includes('.tmp'))).toEqual([]);
  });
});

describe('the traps a review found in the write path', () => {
  const edit = { name: '--mark', from: '#BE3A22', to: '#1C7F5C', file: 'src/index.css', line: 2 };

  it('replaces a declaration that wraps over lines as the one thing it is', () => {
    const dir = project({
      'src/index.css': ':root {\n  --stack: system-ui, -apple-system,\n           "Segoe UI", sans-serif;\n}\n',
    });
    applyDefinition(
      dir,
      { name: '--stack', from: 'system-ui, -apple-system, "Segoe UI", sans-serif', to: 'Inter, sans-serif', file: 'src/index.css', line: 2 },
      noGit,
    );
    expect(readFileSync(join(dir, 'src/index.css'), 'utf8')).toBe(':root {\n  --stack: Inter, sans-serif;\n}\n');
  });

  it.each([
    ['a declaration ender', 'red; } body { display: none } :root { --x: 1'],
    ['a newline', 'red\n}'],
    ['a comment', 'red /* sneaky */'],
    ['an unclosed bracket', 'rgb(0,0,0'],
    ['an unclosed quote', '"Inter'],
    ['nothing at all', '   '],
  ])('refuses a value carrying %s', (_, to) => {
    const dir = project({ 'src/index.css': ':root {\n  --mark: #BE3A22;\n}\n' });
    expect(() => applyDefinition(dir, { ...edit, to }, noGit)).toThrow(ApplyRefused);
    expect(readFileSync(join(dir, 'src/index.css'), 'utf8')).toContain('#BE3A22');
  });

  it('keeps the file permissions it found', () => {
    const dir = project({ 'src/index.css': ':root {\n  --mark: #BE3A22;\n}\n' });
    const file = join(dir, 'src/index.css');
    chmodSync(file, 0o640);
    applyDefinition(dir, edit, noGit);
    expect(statSync(file).mode & 0o777).toBe(0o640);
  });

  it('reads a definition after a protocol-relative url on the same line', () => {
    const css = ':root {\n  --logo: url(//cdn.example.com/l.png);\n  --mark: #BE3A22;\n}\n';
    expect(definitionsInCss(css, ['--mark'], 'a.css')['--mark']?.[0]).toMatchObject({ line: 3, value: '#BE3A22' });
  });

  it('does not let a brace inside a string escape its block', () => {
    const css = '.card {\n  --tip: "}";\n  --mark: #BE3A22;\n}\n';
    expect(definitionsInCss(css, ['--mark'], 'a.css')['--mark']?.[0]?.context).toBe('scoped');
  });

  it('keeps a data url whole rather than splitting it on its own semicolon', () => {
    const css = ':root {\n  --icon: url("data:image/svg+xml;base64,AAAA");\n}\n';
    expect(definitionsInCss(css, ['--icon'], 'a.css')['--icon']?.[0]?.value).toBe('url("data:image/svg+xml;base64,AAAA")');
  });

  it.each(['page.html', 'App.vue', 'Page.astro', 'Card.svelte'])('reads :root in %s as root, not scoped', (file) => {
    const markup = '<template>\n  <div class="card">hi</div>\n</template>\n<style>\n:root {\n  --mark: #BE3A22;\n}\n</style>\n';
    expect(definitionsInCss(markup, ['--mark'], file)['--mark']?.[0]?.context).toBe('root');
  });

  it('still reads a scoped selector in a markup file as scoped', () => {
    const markup = '<style>\n.card {\n  --mark: #BE3A22;\n}\n</style>\n';
    expect(definitionsInCss(markup, ['--mark'], 'App.vue')['--mark']?.[0]?.context).toBe('scoped');
  });

  it('is not fooled by a trailing comment that repeats the property', () => {
    const dir = project({ 'src/index.css': ':root {\n  --mark: #BE3A22; /* --mark: red */\n}\n' });
    expect(applyDefinition(dir, edit, noGit).to).toBe('#1C7F5C');
    expect(readFileSync(join(dir, 'src/index.css'), 'utf8')).toBe(':root {\n  --mark: #1C7F5C; /* --mark: red */\n}\n');
  });

  it('leaves line endings and a missing final newline alone', () => {
    const dir = project({ 'src/index.css': ':root {\r\n  --mark: #BE3A22;\r\n}' });
    applyDefinition(dir, edit, noGit);
    expect(readFileSync(join(dir, 'src/index.css'), 'utf8')).toBe(':root {\r\n  --mark: #1C7F5C;\r\n}');
  });

  it('treats a Tailwind theme block as the root', () => {
    const css = '@theme {\n  --mark: #BE3A22;\n}\n';
    expect(definitionsInCss(css, ['--mark'], 'app.css')['--mark']?.[0]).toMatchObject({ kind: 'theme', context: 'root' });
  });

  it('treats a layer as a wrapper rather than a scope', () => {
    const css = '@layer base {\n  :root {\n    --mark: #BE3A22;\n  }\n}\n';
    expect(definitionsInCss(css, ['--mark'], 'a.css')['--mark']?.[0]?.context).toBe('root');
  });
});
