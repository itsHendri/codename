// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { buildSelector, escapeIdent, isStableClass } from './selector';

function mount(html: string) {
  document.body.innerHTML = html;
  return (sel: string) => document.querySelector(sel)!;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('isStableClass', () => {
  it('keeps authored names and drops generated ones', () => {
    expect(isStableClass('btn')).toBe(true);
    expect(isStableClass('btn-primary')).toBe(true);
    expect(isStableClass('css-1x2y3z')).toBe(false);
    expect(isStableClass('sc-bdVaJa')).toBe(false);
    expect(isStableClass('btn-3f9a1c')).toBe(false);
    expect(isStableClass('Button_root__x3F9a')).toBe(false);
    expect(isStableClass('md:flex')).toBe(false);
    expect(isStableClass('w-[32px]')).toBe(false);
    expect(isStableClass('bg-white/50')).toBe(false);
  });
});

describe('buildSelector', () => {
  it('uses a unique id', () => {
    const $ = mount('<main><button id="save" class="btn">Save</button></main>');
    const r = buildSelector($('#save'));
    expect(r).toMatchObject({ selector: 'button#save', matches: 1, stable: true });
    expect(r.intent).toEqual({ selector: 'button.btn', matches: 1 });
  });

  it('uses up to two stable classes', () => {
    const $ = mount('<div><a class="link primary large">x</a><a class="link">y</a></div>');
    const r = buildSelector($('a.primary'));
    expect(r).toMatchObject({ selector: 'a.link.primary', matches: 1, stable: true });
  });

  it('skips hashed, CSS-module and Tailwind-variant classes', () => {
    const $ = mount(
      '<div><button class="css-1x2y3z Button_root__x3F9a md:flex w-[32px] cta">go</button><button class="cta other">no</button></div>',
    );
    const r = buildSelector($('button'));
    expect(r.selector).toBe('button.cta:nth-of-type(1)');
    expect(r.intent.selector).toBe('button.cta');
    expect(r.intent.matches).toBe(2);
  });

  it('gives sibling buttons with the same class distinct positional selectors', () => {
    const $ = mount('<div><button class="btn">A</button><button class="btn">B</button></div>');
    const [a, b] = Array.from(document.querySelectorAll('button')).map((el) => buildSelector(el)) as [
      ReturnType<typeof buildSelector>,
      ReturnType<typeof buildSelector>,
    ];
    expect(a.selector).not.toBe(b.selector);
    expect(a).toMatchObject({ matches: 1, stable: false });
    expect(b).toMatchObject({ matches: 1, stable: false });
    expect(b.selector).toContain(':nth-of-type(2)');
    expect(a.intent).toEqual({ selector: 'button.btn', matches: 2 });
    expect(document.querySelector(b.selector)).toBe($('button:last-child'));
  });

  it('prefers a structural ancestor over nth-of-type', () => {
    const $ = mount('<header><button class="btn">A</button></header><footer><button class="btn">B</button></footer>');
    const r = buildSelector($('footer button'));
    expect(r).toMatchObject({ selector: 'footer > button.btn', matches: 1, stable: true });
  });

  it('anchors the path at an ancestor with a unique id', () => {
    const $ = mount(
      '<section id="hero"><div><span class="t">a</span></div></section><section><div><span class="t">b</span></div></section>',
    );
    const r = buildSelector($('#hero span'));
    expect(r).toMatchObject({ selector: 'section#hero > div > span.t', matches: 1, stable: true });
  });

  it('returns html and body as themselves', () => {
    expect(buildSelector(document.documentElement)).toMatchObject({ selector: 'html', matches: 1, stable: true });
    expect(buildSelector(document.body)).toMatchObject({ selector: 'body', matches: 1, stable: true });
  });

  it('escapes an id containing a dot', () => {
    const $ = mount('<div id="a.b"></div>');
    const r = buildSelector($('[id="a.b"]'));
    expect(r.selector).toBe('div#a\\.b');
    expect(r.matches).toBe(1);
    expect(document.querySelector(r.selector)).toBe($('[id="a.b"]'));
  });

  it('scopes to the shadow root for shadow-tree elements', () => {
    mount('<div id="host"></div><p class="p">light</p>');
    const shadow = document.getElementById('host')!.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<p class="p">shadow</p>';
    const r = buildSelector(shadow.querySelector('p')!);
    expect(r).toMatchObject({ selector: 'p.p', matches: 1, stable: true });
  });
});

describe('escapeIdent', () => {
  it('escapes special characters and a leading digit', () => {
    expect(escapeIdent('a.b')).toBe('a\\.b');
    expect(escapeIdent('plain-name_1')).toBe('plain-name_1');
    expect(escapeIdent('1st')).toMatch(/^\\31 st$/);
  });
});
