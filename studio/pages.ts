/**
 * The site's pages, as the page itself links to them.
 *
 * Framer and Figma keep a Pages list beside the layers. A live site has no
 * such list, but it has links: every same-origin `<a href>` on the page is a
 * page you can go to without leaving the tool. Read off the page, deduped by
 * path, with the link's own words as the label.
 */

export interface PageLink {
  /** Path and query, which is what makes one page different from another. */
  path: string;
  /** The link's text, or the path when it has none. */
  label: string;
  href: string;
  /** Whether this is the page showing now. */
  current: boolean;
  /** How many links on the page go here. */
  count: number;
}

/** How many pages are worth listing; a sitemap in a footer is not a rail's job. */
export const MAX_PAGES = 80;

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();

export function pagesOf(links: { href: string; text: string }[], currentHref: string): PageLink[] {
  let current: URL;
  try {
    current = new URL(currentHref);
  } catch {
    return [];
  }
  const here = current.pathname + current.search;
  const seen = new Map<string, PageLink>();
  for (const link of links) {
    let url: URL;
    try {
      url = new URL(link.href, current.href);
    } catch {
      continue;
    }
    if (url.origin !== current.origin) continue;
    if (!/^https?:$/.test(url.protocol)) continue;
    const path = url.pathname + url.search;
    // A link to a place on this page is not another page.
    if (path === here && url.hash) continue;
    const label = tidy(link.text).slice(0, 60) || path;
    const had = seen.get(path);
    if (had) {
      had.count += 1;
      // The first link with words names the page; a bare path does not.
      if (had.label === had.path && label !== path) had.label = label;
      continue;
    }
    seen.set(path, { path, label, href: url.origin + path, current: path === here, count: 1 });
  }
  return Array.from(seen.values())
    .sort((a, b) => (a.current === b.current ? a.path.localeCompare(b.path) : a.current ? -1 : 1))
    .slice(0, MAX_PAGES);
}
