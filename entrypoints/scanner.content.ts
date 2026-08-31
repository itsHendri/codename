import type {
  ColorInfo,
  ContrastPair,
  CustomPropInfo,
  FontFaceInfo,
  FontUsage,
  GradientInfo,
  ScanResult,
  SvgAsset,
} from '@/shared/types';

export default defineContentScript({
  registration: 'runtime',
  main() {
    try {
      const result = scanPage();
      chrome.runtime.sendMessage({ type: 'scan-result', data: result });
    } catch (err) {
      chrome.runtime.sendMessage({ type: 'scan-error', error: String(err) });
    }
  },
});

function scanPage(): ScanResult {
  const css = gatherCss();
  const sampled = sampleComputedStyles();

  return {
    url: location.href,
    title: document.title,
    scannedAt: Date.now(),
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    fontFaces: extractFontFaces(),
    fontUsage: sampled.fontUsage,
    colors: sampled.colors,
    gradients: sampled.gradients,
    contrastPairs: sampled.contrastPairs,
    svgs: gatherSvgs(),
    customProps: extractCustomProps(css.text),
    cssText: css.text,
    unreadableSheets: css.unreadable,
    stats: { elementsSampled: sampled.count, styleSheets: document.styleSheets.length },
  };
}

/* ---------------- CSS acquisition ---------------- */

function gatherCss(): { text: string; unreadable: string[] } {
  const chunks: string[] = [];
  const unreadable: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = sheet.cssRules; // throws on cross-origin sheets
      const text = Array.from(rules)
        .map((r) => r.cssText)
        .join('\n');
      chunks.push(text);
    } catch {
      if (sheet.href) unreadable.push(sheet.href);
    }
  }
  return { text: chunks.join('\n'), unreadable };
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

function toHex(cssColor: string): string | null {
  const m = cssColor.match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.%]+))?\)/);
  if (!m) return null;
  const alpha = m[4] !== undefined ? parseFloat(m[4]) : 1;
  if (alpha === 0) return null;
  const hex = (n: string) => Math.round(parseFloat(n)).toString(16).padStart(2, '0');
  return `#${hex(m[1]!)}${hex(m[2]!)}${hex(m[3]!)}`.toUpperCase();
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

function opaqueBackground(el: Element): string | null {
  let node: Element | null = el;
  while (node) {
    const bg = getComputedStyle(node).backgroundColor;
    const hex = toHex(bg);
    if (hex) return hex;
    node = node.parentElement;
  }
  return '#FFFFFF';
}

function sampleComputedStyles() {
  const fontMap = new Map<string, { variants: Map<string, number>; count: number; roles: Set<string> }>();
  const colorMap = new Map<string, { usage: Set<'text' | 'background' | 'border'>; count: number }>();
  const gradientMap = new Map<string, number>();
  const pairMap = new Map<string, { fg: string; bg: string; ratio: number; count: number }>();
  const renderedCache = new Map<string, string>();

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let count = 0;
  let node = walker.nextNode();
  while (node && count < MAX_ELEMENTS) {
    const el = node as Element;
    node = walker.nextNode();
    if (el.closest('script,style,noscript')) continue;
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
        const bg = opaqueBackground(el);
        if (bg && parseFloat(cs.fontSize) >= 9) {
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
    if (bgImage.includes('gradient(')) {
      gradientMap.set(bgImage, (gradientMap.get(bgImage) ?? 0) + 1);
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

  return { fontUsage, colors, gradients, contrastPairs, count };
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

function extractCustomProps(cssText: string): CustomPropInfo[] {
  const map = new Map<string, string>();
  for (const m of cssText.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)[;}]/g)) {
    if (!map.has(m[1]!)) map.set(m[1]!, m[2]!.trim());
  }
  return Array.from(map, ([name, value]) => ({ name, value }));
}

/* ---------------- SVGs ---------------- */

function hashString(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function gatherSvgs(): SvgAsset[] {
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
      const use = svg.querySelector('use');
      if (use) {
        const href = use.getAttribute('href') ?? use.getAttribute('xlink:href') ?? '';
        if (href.startsWith('#')) {
          const symbol = document.querySelector(href);
          if (symbol) {
            const viewBox = symbol.getAttribute('viewBox') ?? svg.getAttribute('viewBox') ?? '0 0 24 24';
            const standalone = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${symbol.innerHTML}</svg>`;
            addMarkup(standalone, 'sprite');
            continue;
          }
        } else if (href) {
          addUrl(href.split('#')[0]!, 'sprite');
          continue;
        }
      }
      const clone = svg.cloneNode(true) as SVGElement;
      if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      addMarkup(serializer.serializeToString(clone), 'inline');
    }

    for (const img of Array.from(root.querySelectorAll<HTMLImageElement>('img'))) {
      const src = img.getAttribute('src') ?? '';
      if (src.startsWith('data:image/svg+xml')) {
        try {
          const markup = src.includes('base64,')
            ? atob(src.split('base64,')[1]!)
            : decodeURIComponent(src.split(',').slice(1).join(','));
          addMarkup(markup, 'img');
        } catch {
          /* ignore undecodable data URIs */
        }
      } else if (/\.svg(\?|#|$)/i.test(src)) {
        addUrl(src, 'img');
      }
    }

    for (const el of Array.from(root.querySelectorAll<HTMLElement>('*')).slice(0, MAX_ELEMENTS)) {
      const bg = getComputedStyle(el).backgroundImage;
      if (!bg || bg === 'none') continue;
      for (const m of bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
        const target = m[1]!;
        if (/\.svg(\?|#|$)/i.test(target) || target.startsWith('data:image/svg+xml')) {
          if (target.startsWith('data:')) {
            try {
              const markup = target.includes('base64,')
                ? atob(target.split('base64,')[1]!)
                : decodeURIComponent(target.split(',').slice(1).join(','));
              addMarkup(markup, 'css');
            } catch {
              /* ignore */
            }
          } else {
            addUrl(target, 'css');
          }
        }
      }
    }
  }

  for (const link of Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel*="icon"]'))) {
    if (/\.svg(\?|$)/i.test(link.href)) addUrl(link.href, 'favicon');
  }

  return Array.from(assets.values());
}
