import { describe, expect, it } from 'vitest';
import { MAX_PAGES, pagesOf } from './pages';

const here = 'https://forfontsake.xyz/fonts/halftone?x=1';

describe('the pages a page links to', () => {
  it('keeps same-origin links, deduped by path, named by their words', () => {
    const pages = pagesOf(
      [
        { href: '/', text: ' Home ' },
        { href: '/about', text: 'About\n us' },
        { href: 'https://forfontsake.xyz/about', text: 'About' },
        { href: '/pricing', text: '' },
        { href: 'https://twitter.com/x', text: 'Twitter' },
        { href: 'mailto:hi@x.com', text: 'Mail' },
      ],
      here,
    );
    expect(pages.map((p) => [p.path, p.label, p.count])).toEqual([
      ['/', 'Home', 1],
      ['/about', 'About us', 2],
      ['/pricing', '/pricing', 1],
    ]);
  });

  it('puts the current page first and leaves out anchors on it', () => {
    const pages = pagesOf(
      [
        { href: '#top', text: 'Top' },
        { href: '/fonts/halftone?x=1#glyphs', text: 'Glyphs' },
        { href: '/fonts/halftone?x=1', text: 'Halftone' },
        { href: '/fonts/grit', text: 'Grit' },
      ],
      here,
    );
    expect(pages.map((p) => [p.path, p.current])).toEqual([
      ['/fonts/halftone?x=1', true],
      ['/fonts/grit', false],
    ]);
  });

  it('lets a later link with words name a page a bare path found first', () => {
    const pages = pagesOf([{ href: '/blog', text: '' }, { href: '/blog', text: 'Journal' }], here);
    expect(pages[0]).toMatchObject({ label: 'Journal', count: 2 });
  });

  it('stops at the cap and survives a bad current url', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ href: `/p/${i}`, text: `Page ${i}` }));
    expect(pagesOf(many, here)).toHaveLength(MAX_PAGES);
    expect(pagesOf(many, 'not a url')).toEqual([]);
  });
});
