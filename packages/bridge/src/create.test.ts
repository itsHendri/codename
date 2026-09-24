import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createTokensFile, entryStylesheet, importLine, importPoint } from './create';

const dirs: string[] = [];
const project = (files: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), 'codename-create-'));
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

describe('entryStylesheet', () => {
  it('finds the sheet a Vite index.html links', () => {
    const dir = project({ 'index.html': '<html><head><link rel="stylesheet" href="/src/styles.css"></head></html>', 'src/styles.css': 'body{}' });
    expect(entryStylesheet(dir)).toEqual({ file: 'src/styles.css', via: 'link' });
  });

  it('finds the first css the entry module imports, and ignores a hosted link', () => {
    const dir = project({
      'index.html': '<link rel="stylesheet" href="https://fonts.example/x.css"><script type="module" src="/src/main.tsx"></script>',
      'src/main.tsx': "import React from 'react';\nimport './index.css';\nimport './App.css';",
      'src/index.css': ':root{}',
      'src/App.css': '',
    });
    expect(entryStylesheet(dir)).toEqual({ file: 'src/index.css', via: 'import' });
  });

  it('knows where Next and Astro keep theirs', () => {
    expect(entryStylesheet(project({ 'app/globals.css': '@import "tailwindcss";' }))).toEqual({ file: 'app/globals.css', via: 'next' });
    expect(entryStylesheet(project({ 'src/styles/global.css': '' }))).toEqual({ file: 'src/styles/global.css', via: 'astro' });
  });

  it('is null where there is nothing to import from', () => {
    expect(entryStylesheet(project({ 'src/main.tsx': 'export {}' }))).toBeNull();
  });
});

describe('importPoint', () => {
  it('lands after the leading statements and comments, before the first rule', () => {
    const css = `@charset "utf-8";\n/* head */\n@import "tailwindcss";\n@layer base, components;\n\n:root { --x: 1; }`;
    const at = importPoint(css);
    expect(css.slice(at)).toBe('\n\n:root { --x: 1; }');
  });

  it('is the start of a file with no statements, and the end of one with nothing else', () => {
    expect(importPoint('body { margin: 0 }')).toBe(0);
    expect(importPoint('@import "a.css";\n')).toBe('@import "a.css";'.length);
  });

  it('does not treat a layer block as a statement', () => {
    const css = `@layer base {\n  h1 {}\n}`;
    expect(importPoint(css)).toBe(0);
  });
});

describe('createTokensFile', () => {
  it('writes the file and one import line after the entry\'s own imports, nothing else moved', () => {
    const entry = `@import "tailwindcss";\n\n@layer base {\n  h1 { color: red; }\n}\n`;
    const dir = project({ 'src/index.css': entry });
    const result = createTokensFile(dir, { path: 'src/tokens.css', content: ':root {\n  --primary-600: #be3a22;\n}', importInto: 'src/index.css' });
    expect(result).toEqual({ file: 'src/tokens.css', importedFrom: 'src/index.css', line: 2 });
    expect(readFileSync(join(dir, 'src/tokens.css'), 'utf8')).toBe(':root {\n  --primary-600: #be3a22;\n}\n');
    expect(readFileSync(join(dir, 'src/index.css'), 'utf8')).toBe(`@import "tailwindcss";\n@import './tokens.css';\n\n@layer base {\n  h1 { color: red; }\n}\n`);
  });

  it('imports relative to the entry, from a different folder', () => {
    expect(importLine('app/globals.css', 'app/styles/tokens.css')).toBe("@import './styles/tokens.css';");
    expect(importLine('src/styles/global.css', 'src/tokens.css')).toBe("@import '../tokens.css';");
  });

  it('puts the import first in a file that starts with a rule', () => {
    const dir = project({ 'style.css': 'body { margin: 0 }\n' });
    createTokensFile(dir, { path: 'tokens.css', content: ':root{}', importInto: 'style.css' });
    expect(readFileSync(join(dir, 'style.css'), 'utf8')).toBe("@import './tokens.css';\nbody { margin: 0 }\n");
  });

  it('writes without an import when none is asked for', () => {
    const dir = project({});
    expect(createTokensFile(dir, { path: 'src/tokens.css', content: ':root{}\n' })).toEqual({ file: 'src/tokens.css' });
    expect(readFileSync(join(dir, 'src/tokens.css'), 'utf8')).toBe(':root{}\n');
  });

  it('refuses a file that exists, a path outside the project, a non-stylesheet, a missing entry, and a second import', () => {
    const dir = project({ 'src/tokens.css': 'x', 'src/index.css': "@import './tokens.css';\n" });
    expect(() => createTokensFile(dir, { path: 'src/tokens.css', content: 'y' })).toThrow(/exists already/);
    expect(() => createTokensFile(dir, { path: '../tokens.css', content: 'y' })).toThrow(/not inside/);
    expect(() => createTokensFile(dir, { path: '/etc/tokens.css', content: 'y' })).toThrow(/not inside/);
    expect(() => createTokensFile(dir, { path: 'src/tokens.txt', content: 'y' })).toThrow(/not a stylesheet/);
    expect(() => createTokensFile(dir, { path: 'src/t2.css', content: 'y', importInto: 'src/nope.css' })).toThrow(/not a stylesheet in the project/);
    expect(() => createTokensFile(dir, { path: 'src/t2.css', content: 'y', importInto: 'src/index.css' })).not.toThrow();
    expect(() => createTokensFile(dir, { path: 'src/t3.css', content: 'y', importInto: 'src/index.css' })).not.toThrow();
    // Nothing written on a refusal.
    expect(readFileSync(join(dir, 'src/tokens.css'), 'utf8')).toBe('x');
  });
});
