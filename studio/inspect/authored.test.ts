// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { authoredFor } from './authored';
import type { RuleLike } from '../scan/customProps';

const rule = (selectorText: string, decls: Record<string, string>, important: string[] = []): RuleLike => {
  const keys = Object.keys(decls);
  const style = Object.assign(
    { length: keys.length, getPropertyValue: (p: string) => decls[p] ?? '', getPropertyPriority: (p: string) => (important.includes(p) ? 'important' : ''), cssText: '' },
    keys,
  ) as unknown as CSSStyleDeclaration;
  return { selectorText, style, cssText: `${selectorText} {}` };
};
const group = (head: string, rules: RuleLike[]): RuleLike => ({ cssText: `${head} {}`, cssRules: rules, conditionText: head.replace(/^@\w+\s*/, '') });
const always = () => true;
const opts = { mediaMatches: always, unreadable: 0 };

const page = () => {
  document.body.innerHTML = '<main class="card"><h1 id="title" class="title">Hi</h1></main>';
  return document.getElementById('title')!;
};

describe('authoredFor', () => {
  it('names the winning declaration and its token', () => {
    const el = page();
    const out = authoredFor(el, [[rule('h1', { color: 'var(--ink)', 'font-size': '28px' })]], opts);
    expect(out.color).toMatchObject({ value: 'var(--ink)', token: '--ink', rule: { selector: 'h1' }, certain: true });
    expect(out['font-size']).toMatchObject({ value: '28px', certain: true });
    expect(out['font-size']?.token).toBeUndefined();
  });

  it('lets specificity win over source order, and source order settle a tie', () => {
    const el = page();
    const out = authoredFor(el, [[rule('.card .title', { color: '#111' }), rule('.title', { color: '#222' }), rule('h1', { color: '#333' }), rule('h1', { color: '#444' })]], opts);
    expect(out.color?.value).toBe('#111');
    const tie = authoredFor(el, [[rule('h1', { color: '#333' }), rule('h1', { color: '#444' })]], opts);
    expect(tie.color?.value).toBe('#444');
  });

  it('lets !important win over specificity', () => {
    const el = page();
    const out = authoredFor(el, [[rule('#title', { color: '#111' }), rule('h1', { color: '#222' }, ['color'])]], opts);
    expect(out.color).toMatchObject({ value: '#222', important: true });
  });

  it('ignores a rule whose media condition is not in force', () => {
    const el = page();
    const lists = [[rule('h1', { color: '#111' }), group('@media (max-width: 700px)', [rule('h1', { color: '#222' })])]];
    expect(authoredFor(el, lists, { ...opts, mediaMatches: (m) => !m.includes('700px') }).color?.value).toBe('#111');
    expect(authoredFor(el, lists, opts).color?.value).toBe('#222');
  });

  it('counts a state rule only while that state is held', () => {
    const el = page();
    const lists = [[rule('h1', { color: '#111' }), rule('h1:hover', { color: '#222' })]];
    expect(authoredFor(el, lists, opts).color?.value).toBe('#111');
    expect(authoredFor(el, lists, { ...opts, heldState: ':hover' }).color?.value).toBe('#222');
  });

  it('skips pseudo-elements', () => {
    const el = page();
    expect(authoredFor(el, [[rule('h1::before', { color: '#222' })]], opts).color).toBeUndefined();
  });

  it('reads a longhand out of a shorthand written with a var()', () => {
    const el = page();
    const out = authoredFor(el, [[rule('h1', { padding: 'var(--space-2) var(--space-4)' })]], opts);
    expect(out['padding-top']).toMatchObject({ value: 'var(--space-2) var(--space-4)', certain: true });
    expect(out['padding-top']?.token).toBeUndefined();
    const one = authoredFor(el, [[rule('h1', { padding: 'var(--space-2)' })]], opts);
    expect(one['padding-left']?.token).toBe('--space-2');
  });

  it('puts the style attribute ahead of every normal rule', () => {
    const el = page();
    el.setAttribute('style', 'color: var(--mark)');
    const out = authoredFor(el, [[rule('#title', { color: '#111' })]], opts);
    expect(out.color).toMatchObject({ token: '--mark', rule: { selector: 'inline' } });
  });

  it('is uncertain when a sheet could not be read, or when two layers compete', () => {
    const el = page();
    expect(authoredFor(el, [[rule('h1', { color: '#111' })]], { ...opts, unreadable: 1 }).color?.certain).toBe(false);
    const layered = [[group('@layer base', [rule('h1', { color: '#111' })]), group('@layer theme', [rule('h1', { color: '#222' })])]];
    expect(authoredFor(el, layered, opts).color?.certain).toBe(false);
    const oneLayer = [[group('@layer base', [rule('h1', { color: '#111' })]), rule('h1', { color: '#222' })]];
    expect(authoredFor(el, oneLayer, opts).color).toMatchObject({ value: '#222', certain: true });
  });

  it('follows an inheriting property up to the ancestor that set it', () => {
    const el = page();
    const out = authoredFor(el, [[rule('body', { color: 'var(--ink)', 'font-size': '1.2em', 'letter-spacing': '0.01em' }), rule('main', { 'font-family': 'Inter' })]], opts);
    expect(out.color).toMatchObject({ token: '--ink', rule: { selector: 'body' }, inherited: true, certain: true });
    expect(out['font-family']).toMatchObject({ value: 'Inter', rule: { selector: 'main' }, inherited: true });
    // A relative size is a different number on every level, so it is not carried.
    expect(out['font-size']).toBeUndefined();
    expect(out['letter-spacing']?.inherited).toBe(true);
  });

  it('prefers the element\'s own declaration to an inherited one', () => {
    const el = page();
    const out = authoredFor(el, [[rule('body', { color: 'var(--ink)' }), rule('h1', { color: 'var(--mark)' })]], opts);
    expect(out.color).toMatchObject({ token: '--mark', rule: { selector: 'h1' } });
    expect(out.color?.inherited).toBeUndefined();
  });

  it('stops at its budget and marks the rest uncertain', () => {
    const el = page();
    const many = Array.from({ length: 1000 }, () => rule('h1', { color: '#111' }));
    let t = 0;
    const out = authoredFor(el, [many], { ...opts, budgetMs: 5, now: () => (t += 10) });
    expect(out.color?.certain).toBe(false);
  });
});
