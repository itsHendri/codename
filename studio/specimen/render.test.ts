// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { SPECIMEN_FOR, SPECIMEN_LABEL_TAG } from '@/shared/inpage';
import { cloneForSpecimen, HIDE_PAGE_CSS, renderSpecimen } from './render';
import { absoluteUrls, specimenHtml } from './serialize';
import type { SpecimenSpec } from './spec';

const spec: SpecimenSpec = {
  site: 'http://localhost:5173/',
  type: [
    { name: 'h1', form: 'tag', selectorOrUtility: 'h1', tag: 'h1', declarations: [['font-size', '28px']] },
    { name: 'lede', form: 'class', selectorOrUtility: '.lede', declarations: [['font-size', '17px']] },
    { name: 'xl', form: 'tailwind-theme', selectorOrUtility: 'text-xl', declarations: [['font-size', 'var(--text-xl)']] },
    { name: 'h2', form: 'vars', selectorOrUtility: 'h2', declarations: [['font-size', 'var(--font-size-h2)']] },
  ],
  colours: [{ name: '--ink', value: '#15171b', scope: 'root', link: 'neutral 900' }],
  literals: [{ hex: '#CBC7BC', usage: ['border'], count: 9 }],
  pairs: [{ fg: '#15171B', bg: '#E7E4DB', ratio: 12.1, count: 40 }],
  space: [{ value: '8px', count: 90 }, { name: '--space-4', value: '16px' }],
  radii: [{ value: '4px' }],
  shadows: [{ name: '--shadow-1', value: '0 1px 2px rgba(0,0,0,.2)' }],
};

describe('renderSpecimen', () => {
  it('renders each type style in its own form, carrying the selector it stands for', () => {
    const root = renderSpecimen(spec, document, { labels: 'shadow', theme: 'dark' });
    const samples = Array.from(root.querySelectorAll(`[${SPECIMEN_FOR}]`));
    expect(samples.map((s) => [s.tagName.toLowerCase(), s.getAttribute('class') || s.getAttribute('style')?.slice(0, 20) || '', s.getAttribute(SPECIMEN_FOR)])).toEqual([
      ['h1', '', 'h1'],
      ['div', 'lede', '.lede'],
      ['div', 'text-xl', 'text-xl'],
      ['div', 'font-size: var(--fon', 'h2'],
    ]);
  });

  it('paints a colour through its variable, and labels are custom elements with no text in the light DOM', () => {
    const root = renderSpecimen(spec, document, { labels: 'shadow', theme: 'dark' });
    const swatch = root.querySelector('[data-codename-section="colour"] div[style*="var(--ink)"]');
    expect(swatch).not.toBeNull();
    const labels = root.querySelectorAll(SPECIMEN_LABEL_TAG);
    expect(labels.length).toBeGreaterThan(5);
    expect(Array.from(labels).every((l) => l.textContent === '')).toBe(true);
  });

  it('puts cloned components in with their pattern and count, ids stripped', () => {
    document.body.innerHTML = '<div class="card" id="first" data-codename-x="1"><button id="b">Go</button></div>';
    const clone = cloneForSpecimen(document.querySelector('.card')!);
    expect(clone.id).toBe('');
    expect(clone.querySelector('button')?.id).toBe('');
    expect(clone.hasAttribute('data-codename-x')).toBe(false);
    const root = renderSpecimen(spec, document, { labels: 'shadow', theme: 'light', components: [{ selector: '.card', matches: 12, node: clone }] });
    const placed = root.querySelector(`[data-codename-section="components"] [${SPECIMEN_FOR}=".card"]`);
    expect(placed?.getAttribute('data-codename-matches')).toBe('12');
  });

  it('hides everything in the body but our own hosts', () => {
    expect(HIDE_PAGE_CSS('codename-specimen', ['codename-rail', 'codename-panel'])).toContain('body > :not(codename-specimen):not(codename-rail):not(codename-panel) { display: none !important; }');
  });
});

describe('specimenHtml', () => {
  it('makes urls absolute against the sheet', () => {
    expect(absoluteUrls("@font-face{src:url('/fonts/a.woff2')} .x{background:url(img/b.png)} .y{background:url(data:image/png;base64,AA)}", 'http://localhost:5173/src/index.css')).toBe(
      "@font-face{src:url('http://localhost:5173/fonts/a.woff2')} .x{background:url(http://localhost:5173/src/img/b.png)} .y{background:url(data:image/png;base64,AA)}",
    );
  });

  it('writes a standalone page with inline labels and the root attributes kept', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const style = document.createElement('style');
    style.textContent = 'h1 { color: red; }';
    document.head.append(style);
    const html = specimenHtml(spec, document, 'dark');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('data-theme="dark"');
    expect(html).toContain('h1 { color: red; }');
    expect(html).toContain('class="cn-specimen-label"');
    expect(html).not.toContain(SPECIMEN_LABEL_TAG);
    expect(html).toContain('Specimen · localhost:5173');
  });
});
