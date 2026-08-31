import type { PinnedElement } from '@/shared/types';

declare global {
  interface Window {
    __codenameInspector?: { deactivate: () => void };
  }
}

export default defineContentScript({
  registration: 'runtime',
  main() {
    // Re-injecting while active just restarts cleanly.
    window.__codenameInspector?.deactivate();
    activate();
  },
});

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

function rgbToHexStr(r: number, g: number, b: number): string {
  const h = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

function toHex(cssColor: string): string | null {
  const p = parseRgba(cssColor);
  if (!p || p.a === 0) return null;
  return rgbToHexStr(p.r, p.g, p.b);
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

function contrast(fg: string | null, bg: string | null): number | null {
  if (!fg || !bg) return null;
  const sorted = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return Math.round(((sorted[0]! + 0.05) / (sorted[1]! + 0.05)) * 10) / 10;
}

function opaqueBackground(el: Element): string {
  // Composite translucent layers bottom-up over white.
  const layers: Rgba[] = [];
  let node: Element | null = el;
  while (node) {
    const p = parseRgba(getComputedStyle(node).backgroundColor);
    if (p && p.a > 0) {
      layers.push(p);
      if (p.a >= 1) break;
    }
    node = node.parentElement;
  }
  let r = 255;
  let g = 255;
  let b = 255;
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i]!;
    r = l.r * l.a + r * (1 - l.a);
    g = l.g * l.a + g * (1 - l.a);
    b = l.b * l.a + b * (1 - l.a);
  }
  return rgbToHexStr(r, g, b);
}

function buildSelector(el: Element): string {
  if (el.id) return `${el.tagName.toLowerCase()}#${el.id}`;
  const classes = Array.from(el.classList)
    .filter((c) => /^[\w-]+$/.test(c))
    .slice(0, 2);
  const self = el.tagName.toLowerCase() + (classes.length ? `.${classes.join('.')}` : '');
  const parent = el.parentElement;
  if (parent && parent !== document.body && !classes.length) {
    const pClasses = Array.from(parent.classList).slice(0, 1);
    if (pClasses.length) return `.${pClasses[0]} > ${self}`;
  }
  return self;
}

function activate() {
  const host = document.createElement('codename-inspector');
  host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      .box { position: fixed; pointer-events: none; outline: 2px solid #2563eb; outline-offset: -1px; background: rgba(37, 99, 235, 0.08); }
      .tag { position: fixed; pointer-events: none; background: #2563eb; color: #fff; font: 11px/1.6 ui-sans-serif, system-ui, sans-serif; padding: 1px 7px; border-radius: 4px; white-space: nowrap; }
      .card { position: fixed; pointer-events: none; background: #fff; color: #1f2937; border: 1px solid #d1d5db; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.14); font: 12px/1.5 ui-sans-serif, system-ui, sans-serif; padding: 8px 10px; max-width: 280px; }
      .card .row { display: flex; gap: 6px; align-items: center; }
      .card .k { color: #6b7280; width: 56px; flex-shrink: 0; }
      .card .swatch { width: 10px; height: 10px; border-radius: 2px; border: 1px solid #d1d5db; display: inline-block; }
      .hidden { display: none; }
    </style>
    <div class="box hidden"></div>
    <div class="tag hidden"></div>
    <div class="card hidden"></div>`;
  document.documentElement.appendChild(host);

  const box = shadow.querySelector<HTMLElement>('.box')!;
  const tag = shadow.querySelector<HTMLElement>('.tag')!;
  const card = shadow.querySelector<HTMLElement>('.card')!;
  let current: Element | null = null;

  const onMove = (e: MouseEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === current || el.tagName === 'CODENAME-INSPECTOR' || el === document.body) return;
    current = el;
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    box.classList.remove('hidden');
    Object.assign(box.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    tag.classList.remove('hidden');
    tag.textContent = `${buildSelector(el)} · ${Math.round(rect.width)} × ${Math.round(rect.height)}`;
    Object.assign(tag.style, {
      left: `${Math.max(4, rect.left)}px`,
      top: `${Math.max(4, rect.top - 22)}px`,
    });

    const fg = toHex(cs.color);
    const bg = opaqueBackground(el);
    const ratio = contrast(fg, bg);
    card.classList.remove('hidden');
    card.innerHTML = `
      <div class="row"><span class="k">Font</span><span>${(cs.fontFamily.split(',')[0] ?? '').replace(/["']/g, '')} · ${cs.fontWeight} · ${cs.fontSize}/${cs.lineHeight}</span></div>
      <div class="row"><span class="k">Text</span><span class="swatch" style="background:${fg ?? 'transparent'}"></span><span>${fg ?? '—'}</span></div>
      <div class="row"><span class="k">Fill</span><span class="swatch" style="background:${bg ?? 'transparent'}"></span><span>${bg ?? '—'}</span></div>
      <div class="row"><span class="k">Contrast</span><span>${ratio ?? '—'}${ratio ? ':1' : ''} ${ratio ? (ratio >= 7 ? 'AAA ✓' : ratio >= 4.5 ? 'AA ✓' : '✗') : ''}</span></div>
      <div class="row"><span class="k">Box</span><span>pad ${cs.padding} · radius ${cs.borderRadius}</span></div>`;
    const cardX = Math.min(e.clientX + 16, innerWidth - 296);
    const cardY = Math.min(e.clientY + 16, innerHeight - 140);
    Object.assign(card.style, { left: `${cardX}px`, top: `${cardY}px` });
  };

  const onClick = (e: MouseEvent) => {
    if (!current) return;
    e.preventDefault();
    e.stopPropagation();
    const el = current;
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const fg = toHex(cs.color);
    const bg = opaqueBackground(el);
    const pinned: PinnedElement = {
      selector: buildSelector(el),
      tag: el.tagName.toLowerCase(),
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      color: fg ?? cs.color,
      backgroundColor: bg ?? cs.backgroundColor,
      borderRadius: cs.borderRadius,
      padding: cs.padding,
      margin: cs.margin,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      contrastRatio: contrast(fg, bg),
    };
    chrome.runtime.sendMessage({ type: 'pinned-element', data: pinned });
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') deactivate();
  };

  const onToggleMessage = (msg: unknown) => {
    if ((msg as { type?: string })?.type === 'inspector-off') deactivate();
  };

  function deactivate() {
    removeEventListener('mousemove', onMove, true);
    removeEventListener('click', onClick, true);
    removeEventListener('keydown', onKey, true);
    chrome.runtime.onMessage.removeListener(onToggleMessage);
    host.remove();
    delete window.__codenameInspector;
    chrome.runtime.sendMessage({ type: 'hover-toggled', active: false });
  }

  addEventListener('mousemove', onMove, true);
  addEventListener('click', onClick, true);
  addEventListener('keydown', onKey, true);
  chrome.runtime.onMessage.addListener(onToggleMessage);
  window.__codenameInspector = { deactivate };
  chrome.runtime.sendMessage({ type: 'hover-toggled', active: true });
}
