import type {
  ColorInfo,
  ContrastPair,
  CustomPropInfo,
  FontFaceInfo,
  FontUsage,
  GradientInfo,
  ScanResult,
  ShapeUsage,
  SvgAsset,
  ValueTally,
} from '@/shared/types';
import { hookFromSelector, isDarkMedia } from '@/studio/siteMode';

export default defineContentScript({
  registration: 'runtime',
  main() {
    scanPage()
      .then((result) => chrome.runtime.sendMessage({ type: 'scan-result', data: result }))
      .catch((err) => chrome.runtime.sendMessage({ type: 'scan-error', error: String(err) }));
  },
});

async function scanPage(): Promise<ScanResult> {
  const css = await gatherCss();
  const sampled = sampleComputedStyles();
  const customProps = extractCustomProps(css.sheets, css.text);
  attachDarkValues(customProps, css.fetched);
  attachVarNames(sampled.colors, customProps);

  return {
    url: location.href,
    title: document.title,
    scannedAt: Date.now(),
    rootFontSize: parseFloat(getComputedStyle(document.documentElement).fontSize) || 16,
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    fontFaces: extractFontFaces(),
    fontUsage: sampled.fontUsage,
    colors: sampled.colors,
    gradients: sampled.gradients,
    contrastPairs: sampled.contrastPairs,
    svgs: gatherSvgs(sampled.svgBgValues),
    customProps,
    shape: sampled.shape,
    cssText: css.text,
    unreadableSheets: css.unreadable,
    stats: { elementsSampled: sampled.count, styleSheets: document.styleSheets.length },
  };
}

/* ---------------- CSS acquisition ---------------- */

/**
 * Every stylesheet's text. A cross-origin sheet hides its rules from the
 * page, so its text is fetched through the background with the site access
 * the user already granted; only one that cannot be fetched either is
 * counted as unreadable.
 */
async function gatherCss(): Promise<{
  text: string;
  unreadable: string[];
  sheets: { href: string | null; text: string }[];
  /** The cross-origin sheets, as fetched text, for a second reading through the object model. */
  fetched: { href: string; text: string }[];
}> {
  // Readable sheets first, in document order; the rest are fetched together
  // and slotted back where they were.
  const slots: ({ href: string | null; text: string } | { pending: string })[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const text = Array.from(sheet.cssRules) // throws on cross-origin sheets
        .map((r) => r.cssText)
        .join('\n');
      // Keep sheets apart so a token can say which file it came from; the
      // concatenation loses that, and an agent being handed a change wants it.
      slots.push({ href: sheet.href, text });
    } catch {
      if (sheet.href) slots.push({ pending: sheet.href });
    }
  }
  const pending = slots.filter((s): s is { pending: string } => 'pending' in s).map((s) => s.pending);
  const texts = await Promise.all(pending.map(fetchSheet));
  const byHref = new Map(pending.map((href, i) => [href, texts[i]!]));
  const sheets: { href: string | null; text: string }[] = [];
  const fetched: { href: string; text: string }[] = [];
  const unreadable: string[] = [];
  for (const slot of slots) {
    if (!('pending' in slot)) {
      sheets.push(slot);
      continue;
    }
    const text = byHref.get(slot.pending) ?? null;
    if (text === null) unreadable.push(slot.pending);
    else {
      sheets.push({ href: slot.pending, text });
      fetched.push({ href: slot.pending, text });
    }
  }
  return { text: sheets.map((s) => s.text).join('\n'), unreadable, sheets, fetched };
}

async function fetchSheet(url: string): Promise<string | null> {
  try {
    const res = (await chrome.runtime.sendMessage({ type: 'fetch-text', url })) as { ok: boolean; text?: string } | undefined;
    return res?.ok && typeof res.text === 'string' ? res.text : null;
  } catch {
    return null;
  }
}

/* ---------------- Fonts ---------------- */

function classifyService(urls: string[]): FontFaceInfo['service'] {
  const hosts = urls.join(' ');
  if (/fonts\.(googleapis|gstatic)\.com/.test(hosts)) return 'google';
  if (/typekit\.(net|com)/.test(hosts)) return 'adobe';
  if (/fast\.fonts\.net/.test(hosts)) return 'monotype';
  if (/cloud\.typography\.com/.test(hosts)) return 'hoefler';
  if (urls.length === 0) return 'system';
  return 'self-hosted';
}

function extractFontFaces(): FontFaceInfo[] {
  const byFamily = new Map<string, { weights: Set<string>; styles: Set<string>; urls: Set<string> }>();
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const style = rule.style;
      const family = style.getPropertyValue('font-family').replace(/["']/g, '').trim();
      if (!family) continue;
      const entry = byFamily.get(family) ?? { weights: new Set(), styles: new Set(), urls: new Set() };
      const weight = style.getPropertyValue('font-weight').trim() || '400';
      const fstyle = style.getPropertyValue('font-style').trim() || 'normal';
      entry.weights.add(weight);
      entry.styles.add(fstyle);
      for (const m of style.getPropertyValue('src').matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
        try {
          entry.urls.add(new URL(m[1]!, sheet.href ?? location.href).href);
        } catch {
          /* ignore malformed URLs */
        }
      }
      byFamily.set(family, entry);
    }
  }
  return Array.from(byFamily, ([family, e]) => ({
    family,
    weights: Array.from(e.weights).sort(),
    styles: Array.from(e.styles).sort(),
    srcUrls: Array.from(e.urls),
    service: classifyService(Array.from(e.urls)),
  }));
}

/** Which family in the stack actually renders, via width measurement against a generic fallback. */
function renderedFamily(stack: string): string {
  const families = stack.split(',').map((f) => f.replace(/["']/g, '').trim());
  const probe = document.createElement('span');
  probe.textContent = 'mmmmmmmmmmlli!WQ';
  probe.style.cssText =
    'position:absolute;visibility:hidden;white-space:nowrap;font-size:64px;left:-9999px;top:0';
  document.body.appendChild(probe);
  try {
    probe.style.fontFamily = 'monospace';
    const base = probe.getBoundingClientRect().width;
    for (const family of families) {
      if (/^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-.*)$/i.test(family)) return family;
      probe.style.fontFamily = `"${family}", monospace`;
      if (Math.abs(probe.getBoundingClientRect().width - base) > 0.5) return family;
    }
    return families[0] ?? stack;
  } finally {
    probe.remove();
  }
}

/* ---------------- Computed-style sampling ---------------- */

const MAX_ELEMENTS = 2500;

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseRgba(cssColor: string): Rgba | null {
  const m = cssColor.match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.%]+))?\)/);
  if (!m) return null;
  const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return { r: parseFloat(m[1]!), g: parseFloat(m[2]!), b: parseFloat(m[3]!), a };
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

function toHex(cssColor: string): string | null {
  const p = parseRgba(cssColor);
  if (!p || p.a === 0) return null;
  return rgbToHex(p.r, p.g, p.b);
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

function contrastRatio(fg: string, bg: string): number {
  const sorted = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (sorted[0]! + 0.05) / (sorted[1]! + 0.05);
}

/** Effective background of an element: its own bg composited over its ancestors', memoized. */
function resolvedBg(el: Element | null, cache: Map<Element, { r: number; g: number; b: number }>): {
  r: number;
  g: number;
  b: number;
} {
  if (!el) return { r: 255, g: 255, b: 255 };
  const hit = cache.get(el);
  if (hit) return hit;
  const parent = resolvedBg(el.parentElement, cache);
  const own = parseRgba(getComputedStyle(el).backgroundColor);
  let out = parent;
  if (own && own.a > 0) {
    out = {
      r: own.r * own.a + parent.r * (1 - own.a),
      g: own.g * own.a + parent.g * (1 - own.a),
      b: own.b * own.a + parent.b * (1 - own.a),
    };
  }
  cache.set(el, out);
  return out;
}

function sampleComputedStyles() {
  const fontMap = new Map<string, { variants: Map<string, number>; count: number; roles: Set<string> }>();
  const colorMap = new Map<string, { usage: Set<'text' | 'background' | 'border'>; count: number }>();
  const gradientMap = new Map<string, number>();
  const pairMap = new Map<string, { fg: string; bg: string; ratio: number; count: number }>();
  const renderedCache = new Map<string, string>();
  const bgCache = new Map<Element, { r: number; g: number; b: number }>();
  const svgBgValues = new Set<string>();
  const radiusMap = new Map<string, number>();
  const shadowMap = new Map<string, number>();
  const spacingMap = new Map<string, number>();

  // The page's base backgrounds are design tokens too — the walker below starts inside <body>.
  for (const rootEl of [document.documentElement, document.body]) {
    const hex = toHex(getComputedStyle(rootEl).backgroundColor);
    if (hex) addColor(colorMap, hex, 'background');
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) =>
      /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test((n as Element).tagName)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  let count = 0;
  let node = walker.nextNode();
  while (node && count < MAX_ELEMENTS) {
    const el = node as Element;
    node = walker.nextNode();
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    count++;

    const cs = getComputedStyle(el);

    // Fonts: only for elements with direct text
    const hasText = Array.from(el.childNodes).some(
      (n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim().length > 0,
    );
    if (hasText) {
      const stack = cs.fontFamily;
      let family = renderedCache.get(stack);
      if (!family) {
        family = renderedFamily(stack);
        renderedCache.set(stack, family);
      }
      const entry =
        fontMap.get(family) ?? { variants: new Map(), count: 0, roles: new Set<string>() };
      const key = `${cs.fontSize}|${cs.fontWeight}|${cs.lineHeight}`;
      entry.variants.set(key, (entry.variants.get(key) ?? 0) + 1);
      entry.count++;
      const tag = el.tagName.toLowerCase();
      if (/^h[1-3]$/.test(tag)) entry.roles.add('headings');
      else if (tag === 'code' || tag === 'pre' || tag === 'kbd') entry.roles.add('code');
      else entry.roles.add('body');
      fontMap.set(family, entry);

      const fg = toHex(cs.color);
      if (fg) {
        addColor(colorMap, fg, 'text');
        if (parseFloat(cs.fontSize) >= 9) {
          const bgRgb = resolvedBg(el, bgCache);
          const bg = rgbToHex(bgRgb.r, bgRgb.g, bgRgb.b);
          const pairKey = `${fg}/${bg}`;
          const pair = pairMap.get(pairKey) ?? { fg, bg, ratio: contrastRatio(fg, bg), count: 0 };
          pair.count++;
          pairMap.set(pairKey, pair);
        }
      }
    }

    const bgHex = toHex(cs.backgroundColor);
    if (bgHex) addColor(colorMap, bgHex, 'background');
    if (cs.borderTopWidth !== '0px') {
      const borderHex = toHex(cs.borderTopColor);
      if (borderHex) addColor(colorMap, borderHex, 'border');
    }
    const bgImage = cs.backgroundImage;
    if (bgImage && bgImage !== 'none') {
      if (bgImage.includes('gradient(')) {
        gradientMap.set(bgImage, (gradientMap.get(bgImage) ?? 0) + 1);
      }
      if (bgImage.includes('.svg') || bgImage.includes('data:image/svg+xml')) {
        svgBgValues.add(bgImage);
      }
    }

    // Shape and rhythm. Same walk — a second pass over 2500 elements would
    // double the cost of a scan for data the first pass already has in hand.
    const radius = cs.borderRadius;
    if (radius && radius !== '0px') bump(radiusMap, radius);

    const shadow = cs.boxShadow;
    if (shadow && shadow !== 'none') bump(shadowMap, shadow);

    // Only the sides that are actually set: a computed padding of 0px on three
    // sides is the absence of a decision, not a 0 in the spacing scale.
    for (const value of [
      cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft,
      cs.marginTop, cs.marginBottom,
      cs.rowGap, cs.columnGap,
    ]) {
      const px = parseFloat(value);
      // Sub-pixel and huge values are layout accidents, not scale steps.
      if (Number.isFinite(px) && px >= 2 && px <= 160 && Number.isInteger(px)) {
        bump(spacingMap, `${px}px`);
      }
    }
  }

  const fontUsage: FontUsage[] = Array.from(fontMap, ([family, e]) => ({
    family,
    elementCount: e.count,
    roles: Array.from(e.roles),
    variants: Array.from(e.variants, ([key, n]) => {
      const [size = '', weight = '', lineHeight = ''] = key.split('|');
      return { size, weight, lineHeight, count: n };
    }).sort((a, b) => b.count - a.count),
  })).sort((a, b) => b.elementCount - a.elementCount);

  const colors: ColorInfo[] = Array.from(colorMap, ([hex, e]) => ({
    hex,
    usage: Array.from(e.usage),
    count: e.count,
    varNames: [],
  })).sort((a, b) => b.count - a.count);

  const gradients: GradientInfo[] = Array.from(gradientMap, ([css, n]) => ({ css, count: n })).sort(
    (a, b) => b.count - a.count,
  );

  const contrastPairs: ContrastPair[] = Array.from(pairMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const shape: ShapeUsage = {
    radii: rank(radiusMap),
    shadows: rank(shadowMap),
    spacing: rank(spacingMap),
  };

  return { fontUsage, colors, gradients, contrastPairs, count, svgBgValues, shape };
}

function bump(map: Map<string, number>, value: string) {
  map.set(value, (map.get(value) ?? 0) + 1);
}

/** Most-used first, capped — the long tail of one-off values is noise. */
function rank(map: Map<string, number>, limit = 24): ValueTally[] {
  return Array.from(map, ([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function addColor(
  map: Map<string, { usage: Set<'text' | 'background' | 'border'>; count: number }>,
  hex: string,
  usage: 'text' | 'background' | 'border',
) {
  const entry = map.get(hex) ?? { usage: new Set(), count: 0 };
  entry.usage.add(usage);
  entry.count++;
  map.set(hex, entry);
}

/* ---------------- Custom properties ---------------- */

function extractCustomProps(
  sheets: { href: string | null; text: string }[],
  allCss: string,
): CustomPropInfo[] {
  const map = new Map<string, { value: string; source?: string }>();
  for (const sheet of sheets) {
    for (const m of sheet.text.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)[;}]/g)) {
      const name = m[1]!;
      if (map.has(name)) continue; // first definition wins, as the cascade did
      map.set(name, { value: m[2]!.trim(), source: sheet.href ?? undefined });
    }
  }
  return Array.from(map, ([name, { value, source }]) => ({
    name,
    value,
    source,
    // Blast radius: how many declarations lean on this token.
    uses: allCss.split(`var(${name}`).length - 1,
  }));
}

/**
 * The value each variable takes under the page's own dark mode. The scan keeps
 * the first definition as the cascade would in light; this reads the sheets
 * again through the object model and takes the last definition found under a
 * dark media query or a dark theme hook, which is what the cascade does there.
 */
function attachDarkValues(props: CustomPropInfo[], fetched: { href: string; text: string }[]) {
  const byName = new Map(props.map((p) => [p.name, p]));
  const walk = (rules: CSSRuleList, inDark: boolean) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSMediaRule) {
        walk(rule.cssRules, inDark || isDarkMedia(rule.conditionText));
        continue;
      }
      if (rule instanceof CSSSupportsRule || (typeof CSSLayerBlockRule !== 'undefined' && rule instanceof CSSLayerBlockRule)) {
        walk(rule.cssRules, inDark);
        continue;
      }
      if (!(rule instanceof CSSStyleRule)) continue;
      const dark = inDark || rule.selectorText.split(',').some((s) => hookFromSelector(s.trim()) !== null);
      if (!dark) continue;
      for (const prop of Array.from(rule.style)) {
        if (!prop.startsWith('--')) continue;
        const known = byName.get(prop);
        const value = rule.style.getPropertyValue(prop).trim();
        if (known && value && value !== known.value) known.dark = value;
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      walk(sheet.cssRules, false);
    } catch {
      /* cross-origin: read below from the fetched text */
    }
  }
  for (const { text } of fetched) {
    try {
      const parsed = new CSSStyleSheet();
      parsed.replaceSync(text);
      walk(parsed.cssRules, false);
    } catch {
      /* unparsable text */
    }
  }
}

/** Give extracted colors the site's own token names when a custom property resolves to them. */
function attachVarNames(colors: ColorInfo[], props: CustomPropInfo[]) {
  const byHex = new Map<string, string[]>();
  for (const p of props) {
    const hex = cssValueToHex(p.value);
    if (!hex) continue;
    const names = byHex.get(hex) ?? [];
    if (names.length < 3) names.push(p.name);
    byHex.set(hex, names);
  }
  for (const c of colors) c.varNames = byHex.get(c.hex) ?? [];
}

function cssValueToHex(value: string): string | null {
  const v = value.trim().toLowerCase();
  const m6 = v.match(/^#([0-9a-f]{6})\b/);
  if (m6) return `#${m6[1]}`.toUpperCase();
  const m3 = v.match(/^#([0-9a-f]{3})\b/);
  if (m3) {
    const [a, b, c] = m3[1]!;
    return `#${a}${a}${b}${b}${c}${c}`.toUpperCase();
  }
  if (v.startsWith('rgb')) return toHex(v);
  return null;
}

/* ---------------- SVGs ---------------- */

function hashString(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function decodeSvgDataUri(uri: string): string | null {
  try {
    return uri.includes('base64,')
      ? atob(uri.split('base64,')[1]!)
      : decodeURIComponent(uri.split(',').slice(1).join(','));
  } catch {
    return null;
  }
}

function gatherSvgs(bgImageValues: Set<string>): SvgAsset[] {
  const assets = new Map<string, SvgAsset>();
  const serializer = new XMLSerializer();

  const addMarkup = (markup: string, source: SvgAsset['source']) => {
    const normalized = markup.replace(/\s+/g, ' ').trim();
    const id = hashString(normalized);
    if (!assets.has(id)) assets.set(id, { id, source, markup, bytes: markup.length });
  };
  const addUrl = (url: string, source: SvgAsset['source']) => {
    try {
      const abs = new URL(url, location.href).href;
      const id = hashString(abs);
      if (!assets.has(id)) assets.set(id, { id, source, url: abs });
    } catch {
      /* ignore malformed URLs */
    }
  };

  const roots: (Document | ShadowRoot)[] = [document];
  for (let i = 0; i < roots.length; i++) {
    const root = roots[i]!;
    for (const el of Array.from(root.querySelectorAll('*'))) {
      if (el.shadowRoot) roots.push(el.shadowRoot);
    }

    for (const svg of Array.from(root.querySelectorAll('svg'))) {
      const uses = Array.from(svg.querySelectorAll('use'));
      const useHref = (u: Element) => u.getAttribute('href') ?? u.getAttribute('xlink:href') ?? '';

      // Pure sprite instance (<svg><use .../></svg>): rebuild a standalone file from the symbol.
      if (uses.length === 1 && svg.children.length === 1) {
        const href = useHref(uses[0]!);
        if (href.startsWith('#')) {
          const symbol = document.getElementById(href.slice(1));
          if (symbol) {
            const viewBox = symbol.getAttribute('viewBox') ?? svg.getAttribute('viewBox') ?? '0 0 24 24';
            addMarkup(
              `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${symbol.innerHTML}</svg>`,
              'sprite',
            );
          }
          continue; // resolved, or unresolvable — either way a plain clone would be blank
        }
        if (href) {
          addUrl(href.split('#')[0]!, 'sprite');
          continue;
        }
      }

      const clone = svg.cloneNode(true) as SVGElement;
      // Inline any locally referenced symbols so the standalone file still renders.
      const localIds = [...new Set(uses.map(useHref).filter((h) => h.startsWith('#')).map((h) => h.slice(1)))];
      if (localIds.length) {
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        let missing = false;
        for (const id of localIds) {
          const symbol = document.getElementById(id);
          if (symbol) defs.appendChild(symbol.cloneNode(true));
          else missing = true;
        }
        if (missing && svg.children.length === uses.length) continue; // would export blank
        if (defs.childNodes.length) clone.insertBefore(defs, clone.firstChild);
      }
      if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      addMarkup(serializer.serializeToString(clone), 'inline');
    }

    for (const img of Array.from(root.querySelectorAll<HTMLImageElement>('img'))) {
      const src = img.getAttribute('src') ?? '';
      if (src.startsWith('data:image/svg+xml')) {
        const markup = decodeSvgDataUri(src);
        if (markup) addMarkup(markup, 'img');
      } else if (/\.svg(\?|#|$)/i.test(src)) {
        addUrl(src, 'img');
      }
    }
  }

  // CSS background SVGs, collected during the computed-style sampling pass.
  for (const bg of bgImageValues) {
    for (const m of bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
      const target = m[1]!;
      if (target.startsWith('data:image/svg+xml')) {
        const markup = decodeSvgDataUri(target);
        if (markup) addMarkup(markup, 'css');
      } else if (/\.svg(\?|#|$)/i.test(target)) {
        addUrl(target, 'css');
      }
    }
  }

  for (const link of Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel*="icon"]'))) {
    if (/\.svg(\?|$)/i.test(link.href)) addUrl(link.href, 'favicon');
  }

  return Array.from(assets.values());
}
