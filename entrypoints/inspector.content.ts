/**
 * The in-page half of the Inspect tab.
 *
 * It used to be a one-shot hover probe that vanished on click. Now it stays:
 * a selection outlives hover mode, can be walked with the arrow keys, is
 * measured against whatever the cursor is over, and carries the comment pins.
 * Everything paints inside a closed shadow root at the top of the stacking
 * order with pointer events off, so the page never sees it — except the pins,
 * which are meant to be clicked.
 */

import type { ElementProps, InspectorCommand } from '@/shared/types';
import { OVERLAY } from '@/shared/theme';
import { buildSelector } from '@/studio/selector';
import { measure, type Rect } from '@/studio/measure';
import { DEVICE_PRESETS } from '@/shared/types';

declare global {
  interface Window {
    __codenameInspector?: { deactivate: () => void };
  }
}

export default defineContentScript({
  registration: 'runtime',
  main() {
    // Injecting twice is a no-op: the panel asks for hover mode separately.
    if (window.__codenameInspector) return;
    activate();
  },
});

/* ---------------- colour helpers (sRGB, for the quick readout) ---------------- */

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

/** The colour actually behind an element: translucent layers composited over white. */
function opaqueBackground(el: Element): string {
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

/* ---------------- reading an element ---------------- */

const HOST_TAG = 'CODENAME-INSPECTOR';

function isOurs(el: Element | null): boolean {
  return !!el && (el.tagName === HOST_TAG || el.closest(HOST_TAG.toLowerCase()) !== null);
}

/** Text is editable only when the element's own children are text. */
function ownText(el: Element): string | null {
  const nodes = Array.from(el.childNodes);
  if (!nodes.length || nodes.some((n) => n.nodeType !== Node.TEXT_NODE)) return null;
  return el.textContent ?? '';
}

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

function readProps(el: Element): ElementProps {
  const cs = getComputedStyle(el);
  const sel = buildSelector(el);
  const fg = toHex(cs.color);
  const bg = opaqueBackground(el);
  const breadcrumb: ElementProps['breadcrumb'] = [];
  for (let node: Element | null = el; node && node !== document.documentElement; node = node.parentElement) {
    breadcrumb.unshift({ tag: node.tagName.toLowerCase(), selector: buildSelector(node).selector });
  }
  return {
    selector: sel.selector,
    matches: sel.matches,
    stable: sel.stable,
    intent: sel.intent,
    tag: el.tagName.toLowerCase(),
    breadcrumb,
    rect: rectOf(el),
    box: {
      marginTop: cs.marginTop,
      marginRight: cs.marginRight,
      marginBottom: cs.marginBottom,
      marginLeft: cs.marginLeft,
      paddingTop: cs.paddingTop,
      paddingRight: cs.paddingRight,
      paddingBottom: cs.paddingBottom,
      paddingLeft: cs.paddingLeft,
      width: cs.width,
      height: cs.height,
      boxSizing: cs.boxSizing,
      display: cs.display,
      gap: cs.gap,
    },
    type: {
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
      textAlign: cs.textAlign,
    },
    color: {
      text: fg ?? cs.color,
      background: bg,
      border: toHex(cs.borderTopColor) ?? cs.borderTopColor,
    },
    radius: cs.borderRadius,
    border: {
      width: cs.borderTopWidth,
      style: cs.borderTopStyle,
      color: toHex(cs.borderTopColor) ?? cs.borderTopColor,
    },
    shadow: cs.boxShadow,
    text: ownText(el),
    contrastRatio: contrast(fg, bg),
  };
}

function find(selector: string | undefined): Element | null {
  if (!selector) return null;
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

/* ---------------- the overlay ---------------- */

function activate() {
  const c = OVERLAY[matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'];
  // The bar is the tool's chrome, not part of the page: dark like the panel, always.
  const d = OVERLAY.dark;
  const font = "'Geist', ui-sans-serif, system-ui, sans-serif";
  const host = document.createElement(HOST_TAG.toLowerCase());
  host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      * { box-sizing: border-box; }
      .box { position: fixed; pointer-events: none; outline: 2px solid ${c.accent}; outline-offset: -1px; background: ${c.accentWash}; }
      .box.sel { background: transparent; box-shadow: 0 0 0 1px ${c.cardBg}; }
      .box.hov { outline-style: dashed; }
      .tag { position: fixed; pointer-events: none; background: ${c.accent}; color: ${c.cardBg}; font: 500 11px/1.6 ${font}; padding: 1px 7px; border-radius: 4px; white-space: nowrap; font-variant-numeric: tabular-nums; }
      .card { position: fixed; pointer-events: none; background: ${c.cardBg}; color: ${c.cardInk}; border: 1px solid ${c.cardLine}; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.24); font: 12px/1.5 ${font}; padding: 8px 10px; max-width: 280px; font-variant-numeric: tabular-nums; }
      .card .row { display: flex; gap: 6px; align-items: center; }
      .card .k { color: ${c.cardMuted}; width: 56px; flex-shrink: 0; }
      .card .swatch { width: 10px; height: 10px; border-radius: 2px; border: 1px solid ${c.cardLine}; display: inline-block; }
      .seg { position: fixed; pointer-events: none; background: ${c.accent}; }
      .seg.x { height: 1px; }
      .seg.y { width: 1px; }
      .seg::before, .seg::after { content: ''; position: absolute; background: ${c.accent}; }
      .seg.x::before, .seg.x::after { width: 1px; height: 7px; top: -3px; }
      .seg.x::before { left: 0; } .seg.x::after { right: 0; }
      .seg.y::before, .seg.y::after { height: 1px; width: 7px; left: -3px; }
      .seg.y::before { top: 0; } .seg.y::after { bottom: 0; }
      .dist { position: fixed; pointer-events: none; transform: translate(-50%, -50%); background: ${c.accent}; color: ${c.cardBg}; font: 500 10px/1.5 ${font}; padding: 0 5px; border-radius: 3px; white-space: nowrap; font-variant-numeric: tabular-nums; }
      .pin { position: fixed; pointer-events: auto; cursor: pointer; transform: translate(-50%, -50%); width: 20px; height: 20px; border-radius: 10px 10px 10px 2px; background: ${c.accent}; color: ${c.cardBg}; font: 600 11px/20px ${font}; text-align: center; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
      .pin.done { opacity: 0.45; }
      .bar { position: fixed; top: 0; left: 0; right: 0; height: 28px; display: flex; align-items: center; gap: 12px; padding: 0 10px; pointer-events: auto; background: ${d.cardBg}; color: ${d.cardInk}; border-bottom: 1px solid ${d.cardLine}; font: 500 11px/1 ${font}; font-variant-numeric: tabular-nums; box-shadow: 0 1px 8px rgba(0,0,0,0.25); }
      .bar.collapsed { right: auto; width: auto; border-bottom-right-radius: 8px; border-right: 1px solid ${d.cardLine}; gap: 0; padding: 0 8px; }
      .bar.collapsed > :not(.mark) { display: none; }
      .bar .mark { display: flex; align-items: center; gap: 6px; cursor: pointer; font-weight: 600; letter-spacing: -0.01em; }
      .bar .mark svg { width: 14px; height: 14px; }
      .bar .host { color: ${d.cardMuted}; }
      .bar .size { position: relative; cursor: pointer; padding: 3px 7px; border-radius: 4px; border: 1px solid ${d.cardLine}; color: ${d.cardInk}; background: transparent; font: inherit; }
      .bar .size:hover { border-color: ${d.accent}; }
      .bar .menu { position: absolute; top: 100%; left: 0; margin-top: 4px; min-width: 150px; padding: 4px; background: ${d.cardBg}; border: 1px solid ${d.cardLine}; border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,0.35); display: flex; flex-direction: column; }
      .bar .menu button { text-align: left; padding: 5px 8px; border: 0; border-radius: 4px; background: transparent; color: ${d.cardInk}; font: inherit; cursor: pointer; display: flex; gap: 8px; }
      .bar .menu button span { margin-left: auto; color: ${d.cardMuted}; }
      .bar .menu button:hover { background: ${d.accentWash}; }
      .bar .spacer { flex: 1; }
      .bar .toggle { display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; }
      .bar .toggle .track { width: 26px; height: 14px; border-radius: 7px; background: ${d.cardLine}; position: relative; transition: background 150ms; }
      .bar .toggle .track::after { content: ''; position: absolute; top: 2px; left: 2px; width: 10px; height: 10px; border-radius: 5px; background: ${d.cardInk}; transition: transform 150ms; }
      .bar .toggle.on .track { background: ${d.accent}; }
      .bar .toggle.on .track::after { transform: translateX(12px); background: ${d.cardBg}; }
      .bar .fold { cursor: pointer; color: ${d.cardMuted}; padding: 2px 4px; }
      .bar .fold:hover { color: ${d.cardInk}; }
      .hidden { display: none; }
    </style>
    <div class="bar hidden">
      <div class="mark" title="Collapse"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1 L15 8 L8 15 L1 8 Z"/><path d="M8 5 L11 8 L8 11 L5 8 Z" fill="${d.accent}" stroke="none"/></svg><span>Codename</span></div>
      <span class="host"></span>
      <button class="size" title="Viewport presets"></button>
      <span class="spacer"></span>
      <label class="toggle"><span>Inspect</span><span class="track"></span></label>
      <span class="fold" title="Collapse">‹</span>
    </div>
    <div class="box sel hidden"></div>
    <div class="box hov hidden"></div>
    <div class="tag hidden"></div>
    <div class="card hidden"></div>
    <div class="measure"></div>
    <div class="pins"></div>`;
  document.documentElement.appendChild(host);

  const selBox = shadow.querySelector<HTMLElement>('.box.sel')!;
  const hovBox = shadow.querySelector<HTMLElement>('.box.hov')!;
  const tag = shadow.querySelector<HTMLElement>('.tag')!;
  const card = shadow.querySelector<HTMLElement>('.card')!;
  const measureLayer = shadow.querySelector<HTMLElement>('.measure')!;
  const pinLayer = shadow.querySelector<HTMLElement>('.pins')!;
  const bar = shadow.querySelector<HTMLElement>('.bar')!;
  const barHost = bar.querySelector<HTMLElement>('.host')!;
  const barSize = bar.querySelector<HTMLButtonElement>('.size')!;
  const barToggle = bar.querySelector<HTMLElement>('.toggle')!;

  let selected: Element | null = null;
  let hovered: Element | null = null;
  let hoverOn = false;
  let measuring = false;
  let pins: { id: string; selector: string; label: string; done?: boolean }[] = [];

  const place = (box: HTMLElement, r: Rect) => {
    Object.assign(box.style, {
      left: `${r.x}px`,
      top: `${r.y}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
  };

  const send = (msg: unknown) => {
    try {
      void chrome.runtime.sendMessage(msg);
    } catch {
      /* panel closed */
    }
  };

  /* ----- selection ----- */

  const announce = () => send({ type: 'element-selected', data: selected ? readProps(selected) : null });

  const select = (el: Element | null) => {
    if (el && (isOurs(el) || el === document.documentElement)) return;
    selected = el;
    layout();
    announce();
  };

  const walk = (dir: 'parent' | 'child' | 'next' | 'prev') => {
    if (!selected) return;
    const parent = selected.parentElement;
    const next =
      dir === 'parent'
        ? parent && parent !== document.documentElement
          ? parent
          : null
        : dir === 'child'
          ? selected.firstElementChild
          : dir === 'next'
            ? selected.nextElementSibling
            : selected.previousElementSibling;
    if (next && !isOurs(next)) select(next);
  };

  /* ----- painting ----- */

  const drawMeasure = () => {
    measureLayer.replaceChildren();
    if (!measuring || !selected || !hovered || hovered === selected) return;
    for (const s of measure(rectOf(selected), rectOf(hovered))) {
      const line = document.createElement('div');
      line.className = `seg ${s.axis}`;
      if (s.axis === 'x') {
        Object.assign(line.style, { left: `${s.from}px`, top: `${s.at}px`, width: `${s.length}px` });
      } else {
        Object.assign(line.style, { top: `${s.from}px`, left: `${s.at}px`, height: `${s.length}px` });
      }
      const label = document.createElement('div');
      label.className = 'dist';
      label.textContent = `${Math.round(s.length)}`;
      const mid = (s.from + s.to) / 2;
      Object.assign(
        label.style,
        s.axis === 'x' ? { left: `${mid}px`, top: `${s.at - 10}px` } : { left: `${s.at + 12}px`, top: `${mid}px` },
      );
      measureLayer.append(line, label);
    }
  };

  const drawPins = () => {
    pinLayer.replaceChildren();
    for (const pin of pins) {
      const el = find(pin.selector);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const dot = document.createElement('div');
      dot.className = `pin${pin.done ? ' done' : ''}`;
      dot.textContent = pin.label;
      dot.title = pin.selector;
      // Top-right corner, clear of the hover tag that sits at the top-left.
      Object.assign(dot.style, { left: `${r.right - 10}px`, top: `${r.top - 4}px` });
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        send({ type: 'pin-clicked', id: pin.id });
      });
      pinLayer.appendChild(dot);
    }
  };

  let raf = 0;
  const layout = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (selected?.isConnected) {
        selBox.classList.remove('hidden');
        place(selBox, rectOf(selected));
      } else {
        selBox.classList.add('hidden');
        if (selected) {
          // The page re-rendered it away; say so rather than track a ghost.
          selected = null;
          announce();
        }
      }
      drawMeasure();
      drawPins();
    });
  };

  /* ----- hover mode ----- */

  const onMove = (e: MouseEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isOurs(el) || el === document.documentElement || el === hovered) return;
    hovered = el;
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    hovBox.classList.remove('hidden');
    place(hovBox, rectOf(el));
    tag.classList.remove('hidden');
    tag.textContent = `${buildSelector(el).intent.selector} · ${Math.round(rect.width)} × ${Math.round(rect.height)}`;
    Object.assign(tag.style, { left: `${Math.max(4, rect.left)}px`, top: `${Math.max(4, rect.top - 22)}px` });

    if (measuring && selected) {
      card.classList.add('hidden');
      drawMeasure();
      return;
    }
    const fg = toHex(cs.color);
    const bg = opaqueBackground(el);
    const ratio = contrast(fg, bg);
    card.classList.remove('hidden');
    card.innerHTML = `
      <div class="row"><span class="k">Font</span><span>${(cs.fontFamily.split(',')[0] ?? '').replace(/["']/g, '')} · ${cs.fontWeight} · ${cs.fontSize}/${cs.lineHeight}</span></div>
      <div class="row"><span class="k">Text</span><span class="swatch" style="background:${fg ?? 'transparent'}"></span><span>${fg ?? '—'}</span></div>
      <div class="row"><span class="k">Fill</span><span class="swatch" style="background:${bg}"></span><span>${bg}</span></div>
      <div class="row"><span class="k">Contrast</span><span>${ratio ?? '—'}${ratio ? ':1' : ''} ${ratio ? (ratio >= 7 ? 'AAA ✓' : ratio >= 4.5 ? 'AA ✓' : '✗') : ''}</span></div>
      <div class="row"><span class="k">Box</span><span>pad ${cs.padding} · radius ${cs.borderRadius}</span></div>`;
    const cardX = Math.min(e.clientX + 16, innerWidth - 296);
    const cardY = Math.min(e.clientY + 16, innerHeight - 140);
    Object.assign(card.style, { left: `${cardX}px`, top: `${cardY}px` });
  };

  const onClick = (e: MouseEvent) => {
    if (!hovered) return;
    e.preventDefault();
    e.stopPropagation();
    select(hovered);
  };

  const setHover = (on: boolean) => {
    if (on === hoverOn) return;
    hoverOn = on;
    if (on) {
      addEventListener('mousemove', onMove, true);
      addEventListener('click', onClick, true);
    } else {
      removeEventListener('mousemove', onMove, true);
      removeEventListener('click', onClick, true);
      hovered = null;
      hovBox.classList.add('hidden');
      tag.classList.add('hidden');
      card.classList.add('hidden');
      drawMeasure();
    }
    send({ type: 'hover-toggled', active: on });
    if (barOn) renderBar();
  };

  /* ----- the bar ----- */

  let barOn = false;
  let menu: HTMLElement | null = null;

  const renderBar = () => {
    barHost.textContent = location.host;
    barSize.textContent = `${innerWidth} × ${innerHeight}`;
    barToggle.classList.toggle('on', hoverOn);
  };

  const closeMenu = () => {
    menu?.remove();
    menu = null;
  };

  const openMenu = () => {
    if (menu) return closeMenu();
    menu = document.createElement('div');
    menu.className = 'menu';
    // The page knows its own chrome delta, so it can ask for an outer size directly.
    const dw = outerWidth - innerWidth;
    const dh = outerHeight - innerHeight;
    for (const p of DEVICE_PRESETS) {
      const b = document.createElement('button');
      b.innerHTML = `${p.name}<span>${p.width} × ${p.height}</span>`;
      b.addEventListener('click', () => {
        send({ type: 'resize-window', width: p.width + dw, height: p.height + dh });
        closeMenu();
      });
      menu.appendChild(b);
    }
    barSize.appendChild(menu);
  };

  const showBar = (on: boolean) => {
    barOn = on;
    bar.classList.toggle('hidden', !on);
    if (on) renderBar();
    else closeMenu();
  };

  barSize.addEventListener('click', (e) => {
    e.stopPropagation();
    openMenu();
  });
  barToggle.addEventListener('click', () => setHover(!hoverOn));
  // The mark folds the bar down to a pill and opens it again; the chevron only folds.
  bar.querySelector('.mark')!.addEventListener('click', (e) => {
    e.stopPropagation();
    bar.classList.toggle('collapsed');
  });
  bar.querySelector('.fold')!.addEventListener('click', (e) => {
    e.stopPropagation();
    bar.classList.add('collapsed');
  });
  addEventListener('resize', () => barOn && renderBar());
  addEventListener('click', () => closeMenu(), true);

  // The panel holds a port open while it is showing this tab; when it goes,
  // the bar and hover mode go with it. The selection stays for its return.
  const onConnect = (port: chrome.runtime.Port) => {
    if (port.name !== 'codename-panel') return;
    showBar(true);
    port.onDisconnect.addListener(() => {
      showBar(false);
      setHover(false);
    });
  };
  chrome.runtime.onConnect.addListener(onConnect);

  /* ----- keyboard ----- */

  const typing = (t: EventTarget | null) => {
    const el = t as HTMLElement | null;
    return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  };

  const onKey = (e: KeyboardEvent) => {
    if (typing(e.target)) return;
    if (e.key === 'Escape') {
      // One level at a time: hover off first, then the selection.
      if (hoverOn) setHover(false);
      else if (selected) select(null);
      else return;
      e.preventDefault();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && selected) {
      e.preventDefault();
      send({ type: 'inspector-shortcut', action: e.shiftKey ? 'redo' : 'undo' });
      return;
    }
    if (!selected) return;
    const dir =
      e.key === 'ArrowUp'
        ? 'parent'
        : e.key === 'ArrowDown'
          ? 'child'
          : e.key === 'ArrowRight'
            ? 'next'
            : e.key === 'ArrowLeft'
              ? 'prev'
              : null;
    if (!dir) return;
    e.preventDefault();
    walk(dir);
  };

  /* ----- commands from the panel ----- */

  const onMessage = (
    msg: { type?: string } & Partial<InspectorCommand>,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (r: unknown) => void,
  ) => {
    if (msg?.type !== 'inspector') return false;
    switch (msg.cmd) {
      case 'hover':
        setHover(!!msg.on);
        break;
      case 'select':
        select(find(msg.selector));
        break;
      case 'deselect':
        select(null);
        break;
      case 'walk':
        if (msg.dir) walk(msg.dir);
        break;
      case 'ancestor': {
        // depth counts from body (0) down to the element itself.
        const chain: Element[] = [];
        for (let n: Element | null = selected; n && n !== document.documentElement; n = n.parentElement) chain.unshift(n);
        const target = chain[msg.depth ?? chain.length - 1];
        if (target) select(target);
        break;
      }
      case 'read':
        sendResponse(selected ? readProps(selected) : null);
        return true;
      case 'text': {
        const el = find(msg.selector);
        if (el && msg.text !== undefined) el.textContent = msg.text;
        layout();
        break;
      }
      case 'pins':
        pins = msg.pins ?? [];
        layout();
        break;
      case 'measure':
        measuring = !!msg.on;
        if (measuring && !hoverOn) setHover(true);
        drawMeasure();
        break;
      case 'bar':
        showBar(!!msg.on);
        break;
      case 'off':
        deactivate();
        break;
    }
    sendResponse({ ok: true, hover: hoverOn, selected: !!selected });
    return true;
  };

  const observer = new MutationObserver(layout);

  function deactivate() {
    setHover(false);
    removeEventListener('keydown', onKey, true);
    removeEventListener('scroll', layout, true);
    removeEventListener('resize', layout);
    observer.disconnect();
    chrome.runtime.onMessage.removeListener(onMessage);
    chrome.runtime.onConnect.removeListener(onConnect);
    host.remove();
    delete window.__codenameInspector;
  }

  addEventListener('keydown', onKey, true);
  addEventListener('scroll', layout, true);
  addEventListener('resize', layout);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
  chrome.runtime.onMessage.addListener(onMessage);
  window.__codenameInspector = { deactivate };
}
