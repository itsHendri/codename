/**
 * The specimen as a page of its own, to save and send.
 *
 * The page's readable stylesheets are inlined, with every `url()` made
 * absolute so fonts and images still load from the file; the root and body
 * keep their attributes so a theme hook (`class="dark"`, `data-theme`) still
 * applies; the labels are inline, since a file has no shadow roots to hide
 * them in.
 */

import { isManagedSheet } from '@/shared/types';
import type { OverlayTheme } from '@/shared/theme';
import { inlineLabelCss, renderSpecimen, type SpecimenComponent } from './render';
import type { SpecimenSpec } from './spec';

const URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;

/** Every `url()` in a sheet's text made absolute against the sheet's own base. */
export function absoluteUrls(cssText: string, base: string): string {
  return cssText.replace(URL_RE, (whole, quote: string, ref: string) => {
    if (/^(data:|blob:|https?:|\/\/)/i.test(ref)) return whole;
    try {
      return `url(${quote}${new URL(ref, base).href}${quote})`;
    } catch {
      return whole;
    }
  });
}

/** The page's own stylesheets as text, the ones that can be read, in order. */
export function pageCss(doc: Document): { css: string; unreadable: number } {
  const parts: string[] = [];
  let unreadable = 0;
  for (const sheet of Array.from(doc.styleSheets)) {
    if (isManagedSheet(sheet)) continue;
    try {
      const text = Array.from(sheet.cssRules)
        .map((r) => r.cssText)
        .join('\n');
      parts.push(absoluteUrls(text, sheet.href ?? doc.baseURI));
    } catch {
      unreadable++;
    }
  }
  return { css: parts.join('\n\n'), unreadable };
}

const attrs = (el: Element | null) =>
  el
    ? Array.from(el.attributes)
        .filter((a) => a.name !== 'style' || !/margin-(left|right|top)/.test(a.value))
        .map((a) => ` ${a.name}="${a.value.replace(/"/g, '&quot;')}"`)
        .join('')
    : '';

export function specimenHtml(spec: SpecimenSpec, doc: Document, theme: OverlayTheme, components: SpecimenComponent[] = []): string {
  const { css, unreadable } = pageCss(doc);
  const body = renderSpecimen(spec, doc, { labels: 'inline', theme, components });
  const title = `Specimen · ${(() => {
    try {
      return new URL(spec.site).host;
    } catch {
      return spec.site;
    }
  })()}`;
  const note = unreadable ? `<!-- ${unreadable} stylesheet(s) could not be read; the page may look different here. -->\n` : '';
  return `<!doctype html>
<html${attrs(doc.documentElement)}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
${note}<style>
${css}
</style>
<style>
${inlineLabelCss()}
body { padding: 32px 24px 64px; }
</style>
</head>
<body${attrs(doc.body)}>
${body.outerHTML}
</body>
</html>
`;
}
