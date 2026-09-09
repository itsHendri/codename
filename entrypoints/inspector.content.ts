/**
 * The in-page half of the Layers tab.
 *
 * It used to be a one-shot hover probe that vanished on click. Now it stays:
 * a selection outlives hover mode, can be walked with the arrow keys, is
 * measured against whatever the cursor is over, and carries the comment pins.
 * Everything paints inside a closed shadow root at the top of the stacking
 * order with pointer events off, so the page never sees it — except the pins,
 * which are meant to be clicked.
 */

import type { ElementProps, InspectorCommand, TokenLengths } from '@/shared/types';
import { BAR_HEIGHT, OVERLAY, type OverlayTheme } from '@/shared/theme';
import { viewportLabel } from '@/shared/viewport';
import type { Mode } from '@/studio/engine/types';
import { buildSelector, isStableClass } from '@/studio/selector';
import { measure, type Rect } from '@/studio/measure';
import { describeTarget, targetKindLabel, type CommentTarget, type Pin } from '@/studio/annotations';
import type { LayerNode } from '@/studio/layers';
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

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

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
    layout: {
      flexDirection: cs.flexDirection,
      justifyContent: cs.justifyContent,
      alignItems: cs.alignItems,
      flexWrap: cs.flexWrap,
    },
    opacity: cs.opacity,
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
    corners: {
      topLeft: cs.borderTopLeftRadius,
      topRight: cs.borderTopRightRadius,
      bottomRight: cs.borderBottomRightRadius,
      bottomLeft: cs.borderBottomLeftRadius,
    },
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

/** Structure only: script, style and metadata are not layers. */
const SKIPPED = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'TITLE', 'NOSCRIPT', 'TEMPLATE', 'BR']);

/** A page bigger than this is not worth sending whole; the tree stops here. */
const MAX_LAYERS = 1500;

/**
 * How a row reads: `input#family.name-field`. The id goes first because it is
 * the most identifying thing an element has, and a row that shows only classes
 * disagrees with the selector the header shows once you pick it.
 */
function layerLabel(el: Element): string {
  const id = el.getAttribute('id');
  const idPart = id && /^[A-Za-z][\w-]*$/.test(id) ? `#${id}` : '';
  const classes = Array.from(el.classList)
    .filter(isStableClass)
    .slice(0, 2)
    .map((c) => `.${c}`)
    .join('');
  return el.tagName.toLowerCase() + idPart + classes;
}

/**
 * The page as a flat list with depths. Built in one walk; `descendants` is
 * filled in on the way back up so the panel can collapse a subtree by
 * skipping rows.
 */
function buildLayers(): LayerNode[] {
  const out: LayerNode[] = [];
  const walk = (el: Element, depth: number): number => {
    if (out.length >= MAX_LAYERS) return 0;
    const index = out.length;
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent ?? '')
      .join(' ')
      .trim();
    const cs = getComputedStyle(el);
    // One selector build per node: it walks ancestors and is the expensive part.
    const sel = buildSelector(el);
    out.push({
      id: index,
      tag: el.tagName.toLowerCase(),
      label: layerLabel(el),
      selector: sel.selector,
      stable: sel.stable,
      matches: sel.intent.matches,
      ...(sel.intent.matches > 1 ? { intent: sel.intent.selector } : {}),
      depth,
      descendants: 0,
      hidden: cs.display === 'none' || cs.visibility === 'hidden',
      display: cs.display,
      ...(own ? { text: own.slice(0, 60) } : {}),
    });
    let count = 0;
    // An icon is one layer. Its paths and polylines are drawing, not structure,
    // and on an illustrated page they outnumber everything else several to one.
    if (el.tagName.toLowerCase() !== 'svg') {
      for (const child of el.children) {
        if (SKIPPED.has(child.tagName) || isOurs(child)) continue;
        count += 1 + walk(child, depth + 1);
      }
    }
    out[index]!.descendants = count;
    return count;
  };
  if (document.body) walk(document.body, 0);
  return out;
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
  // The bar is the tool's chrome, not part of the page, so it wears the
  // panel's palette. The panel tells it which; until then, dark.
  const d = {
    accent: 'var(--cn-accent)',
    accentWash: 'var(--cn-wash)',
    cardBg: 'var(--cn-bg)',
    cardInk: 'var(--cn-ink)',
    cardMuted: 'var(--cn-muted)',
    cardLine: 'var(--cn-line)',
  };
  const font = "'Geist', ui-sans-serif, system-ui, sans-serif";
  const host = document.createElement(HOST_TAG.toLowerCase());
  host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      :host { --cn-accent: ${OVERLAY.dark.accent}; --cn-wash: ${OVERLAY.dark.accentWash}; --cn-bg: ${OVERLAY.dark.cardBg}; --cn-ink: ${OVERLAY.dark.cardInk}; --cn-muted: ${OVERLAY.dark.cardMuted}; --cn-line: ${OVERLAY.dark.cardLine}; }
      * { box-sizing: border-box; }
      .box { position: fixed; pointer-events: none; outline: 2px solid ${c.accent}; outline-offset: -1px; background: ${c.accentWash}; }
      .box.sel { background: transparent; box-shadow: 0 0 0 1px ${c.cardBg}; }
      .box.hov { outline-style: dashed; }
      .tag { position: fixed; pointer-events: none; background: ${c.accent}; color: ${c.cardBg}; font: 500 11px/1.6 ${font}; padding: 1px 7px; border-radius: 4px; white-space: nowrap; font-variant-numeric: tabular-nums; }
      .card { position: fixed; pointer-events: none; background: ${c.cardBg}; color: ${c.cardInk}; border: 1px solid ${c.cardLine}; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.24); font: 12px/1.5 ${font}; padding: 8px 10px; max-width: 280px; font-variant-numeric: tabular-nums; }
      .card .row { display: flex; gap: 6px; align-items: center; }
      .card .k { color: ${c.cardMuted}; width: 56px; flex-shrink: 0; }
      .card .swatch { width: 10px; height: 10px; border-radius: 2px; border: 1px solid ${c.cardLine}; display: inline-block; }
      .card .tok { color: ${c.accent}; font-family: ui-monospace, Menlo, monospace; font-size: 11px; }
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
      .marquee { position: fixed; pointer-events: none; border: 1px dashed ${d.accent}; background: ${d.accentWash}; }
      .picked { position: fixed; pointer-events: none; outline: 2px solid ${d.accent}; outline-offset: -1px; background: ${d.accentWash}; }
      .bar { position: fixed; top: 0; left: 0; right: 0; z-index: 2; height: ${BAR_HEIGHT}px; display: flex; align-items: center; gap: 12px; padding: 0 10px; pointer-events: auto; background: ${d.cardBg}; color: ${d.cardInk}; border-bottom: 1px solid ${d.cardLine}; font: 500 11px/1 ${font}; font-variant-numeric: tabular-nums; box-shadow: 0 1px 8px rgba(0,0,0,0.25); }
      .bar.collapsed { right: auto; width: auto; border-bottom-right-radius: 8px; border-right: 1px solid ${d.cardLine}; gap: 0; padding: 0 8px; }
      .bar.collapsed > :not(.mark) { display: none; }
      .bar .mark { display: flex; align-items: center; gap: 6px; cursor: pointer; font-weight: 600; letter-spacing: -0.01em; }
      .bar .mark svg { width: 14px; height: 14px; }
      .bar .host { color: ${d.cardMuted}; }
      .bar .size { position: relative; cursor: pointer; padding: 3px 7px; border-radius: 4px; border: 1px solid ${d.cardLine}; color: ${d.cardInk}; background: transparent; font: inherit; }
      .bar .size:hover { border-color: ${d.accent}; }
      .bar .reset { cursor: pointer; padding: 3px 9px; border-radius: 4px; border: 1px solid ${d.accent}; color: ${d.accent}; background: transparent; font: inherit; font-weight: 600; white-space: nowrap; }
      .bar .reset:hover { background: ${d.accentWash}; }
      .bar .reset span { margin-left: 5px; font-weight: 500; color: ${d.cardMuted}; }
      .bar .menu { position: absolute; top: 100%; left: 0; margin-top: 4px; min-width: 150px; padding: 4px; background: ${d.cardBg}; border: 1px solid ${d.cardLine}; border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,0.35); display: flex; flex-direction: column; }
      .bar .menu button { text-align: left; padding: 5px 8px; border: 0; border-radius: 4px; background: transparent; color: ${d.cardInk}; font: inherit; cursor: pointer; display: flex; gap: 8px; }
      .bar .menu button span { margin-left: auto; color: ${d.cardMuted}; }
      .bar .menu button:hover { background: ${d.accentWash}; }
      .bar .spacer { flex: 1; }
      .bar .modes { display: flex; gap: 2px; padding: 2px; border-radius: 6px; background: color-mix(in srgb, ${d.cardLine} 20%, transparent); border: 1px solid ${d.cardLine}; }
      .bar .mode { display: flex; align-items: center; gap: 5px; padding: 3px 9px; border: 0; border-radius: 4px; background: transparent; color: ${d.cardMuted}; font: inherit; cursor: pointer; }
      .bar .mode svg { width: 13px; height: 13px; }
      .bar .mode:hover { color: ${d.cardInk}; }
      .bar .mode.on { background: ${d.accent}; color: ${d.cardBg}; }
      .hint { position: fixed; z-index: 2; top: ${BAR_HEIGHT + 6}px; pointer-events: none; background: ${d.cardBg}; color: ${d.cardInk}; border: 1px solid ${d.cardLine}; border-radius: 6px; padding: 5px 9px; font: 400 11px/1.4 ${font}; box-shadow: 0 4px 16px rgba(0,0,0,0.3); max-width: 320px; opacity: 1; transition: opacity 300ms; }
      .hint.fading { opacity: 0; }
      .hint b { font-weight: 600; }
      .composer { position: fixed; pointer-events: auto; width: 280px; background: ${d.cardBg}; color: ${d.cardInk}; border: 1px solid ${d.cardLine}; border-radius: 8px; box-shadow: 0 8px 28px rgba(0,0,0,0.4); padding: 8px; font: 400 12px/1.4 ${font}; }
      .composer .about { display: flex; align-items: center; gap: 5px; margin-bottom: 5px; color: ${d.cardMuted}; font-size: 10px; }
      .composer .about b { color: ${d.accent}; font-weight: 600; }
      .composer textarea { width: 100%; box-sizing: border-box; resize: none; border: 1px solid ${d.cardLine}; border-radius: 5px; background: transparent; color: ${d.cardInk}; font: inherit; padding: 5px 6px; }
      .composer textarea:focus { outline: none; border-color: ${d.accent}; }
      .composer .keys { margin-top: 6px; font-size: 10px; color: ${d.cardMuted}; }
      .composer .row { display: flex; align-items: center; justify-content: flex-end; gap: 6px; margin-top: 6px; }
      .composer button { border: 0; border-radius: 5px; padding: 5px 11px; font: 600 11px/1 ${font}; cursor: pointer; white-space: nowrap; }
      .composer .save { background: ${d.accent}; color: ${d.cardBg}; }
      .composer .save:disabled { opacity: 0.4; cursor: default; }
      .composer .cancel { background: transparent; color: ${d.cardMuted}; }
      .edit { position: fixed; z-index: 1; pointer-events: auto; width: 232px; background: ${d.cardBg}; color: ${d.cardInk}; border: 1px solid ${d.cardLine}; border-radius: 8px; box-shadow: 0 8px 28px rgba(0,0,0,0.4); font: 400 11px/1.4 ${font}; font-variant-numeric: tabular-nums; }
      .edit .grip { display: flex; align-items: center; gap: 6px; padding: 6px 8px; cursor: grab; border-bottom: 1px solid ${d.cardLine}; color: ${d.cardMuted}; font-size: 10px; user-select: none; }
      .edit .grip:active { cursor: grabbing; }
      .edit .grip code { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: ${d.cardInk}; font: 500 10px/1.4 ui-monospace, Menlo, monospace; }
      .edit .grip .more { cursor: pointer; color: ${d.accent}; white-space: nowrap; background: none; border: 0; padding: 0; font: 600 10px/1.4 ${font}; }
      .edit .fields { display: grid; grid-template-columns: 50px 1fr; gap: 5px 8px; padding: 8px; align-items: center; }
      .edit label { color: ${d.cardMuted}; }
      .edit input, .edit select { width: 100%; box-sizing: border-box; border: 1px solid ${d.cardLine}; border-radius: 4px; background: transparent; color: ${d.cardInk}; font: inherit; padding: 3px 5px; }
      .edit input:focus, .edit select:focus { outline: none; border-color: ${d.accent}; }
      .edit select option { background: ${d.cardBg}; color: ${d.cardInk}; }
      .edit .colour { display: flex; gap: 5px; align-items: center; }
      .edit .colour input[type=color] { width: 22px; height: 22px; flex: 0 0 22px; padding: 0; cursor: pointer; }
      .edit .colour input[type=text] { flex: 1; font-family: ui-monospace, Menlo, monospace; }
      .edit .colour .tok { flex: 0 0 auto; max-width: 84px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; border: 1px solid ${d.cardLine}; border-radius: 999px; padding: 1px 6px; background: transparent; color: ${d.accent}; font: 500 10px/1.4 ui-monospace, Menlo, monospace; }
      .edit .colour .tok:hover { border-color: ${d.accent}; }
      .edit .colour .tok.hidden { display: none; }
      .edit .len { display: flex; gap: 5px; align-items: center; }
      .edit .len input { flex: 1; }
      .edit .len .tok { flex: 0 0 auto; max-width: 84px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; border: 1px solid ${d.cardLine}; border-radius: 999px; padding: 1px 6px; background: transparent; color: ${d.accent}; font: 500 10px/1.4 ui-monospace, Menlo, monospace; }
      .edit .len .tok:hover { border-color: ${d.accent}; }
      .edit .len .tok.hidden { display: none; }
      .bar .fold { cursor: pointer; color: ${d.cardMuted}; padding: 2px 4px; }
      .bar .fold:hover { color: ${d.cardInk}; }
      .hidden { display: none; }
    </style>
    <div class="bar hidden">
      <div class="mark" title="Collapse"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1 L15 8 L8 15 L1 8 Z"/><path d="M8 5 L11 8 L8 11 L5 8 Z" style="fill: ${d.accent}" stroke="none"/></svg><span>Codename</span></div>
      <span class="host"></span>
      <button class="size" title="Viewport presets"></button>
      <span class="spacer"></span>
      <button class="reset hidden" title="Take back every override — variables, colours, scale, element edits — the dark preview, the viewport preset and the selection. Notes stay.">Reset<span></span></button>
      <span class="spacer"></span>
      <div class="modes scheme" role="radiogroup" aria-label="Colour scheme" title="Preview the page in the system's light or dark values">
        <button class="mode light" role="radio" aria-checked="false">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="3"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/></svg>Light
        </button>
        <button class="mode dark" role="radio" aria-checked="false">
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M9.5 1.5a6.5 6.5 0 1 0 5 10.2A6 6 0 0 1 9.5 1.5z"/></svg>Dark
        </button>
      </div>
      <div class="modes" role="radiogroup" aria-label="Mode">
        <button class="mode select" role="radio" aria-checked="false" title="Select — hover to read, click to pick (Alt+S)">
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 2l9 5.5-4 .8-1.6 3.9z"/></svg>Select
        </button>
        <button class="mode comment" role="radio" aria-checked="false" title="Comment — mark something up for the agent (Alt+C)">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2.5 4.5a2 2 0 012-2h7a2 2 0 012 2v5a2 2 0 01-2 2H7l-3 2.5V11.5h-.5a2 2 0 01-2-2z"/></svg>Comment
        </button>
      </div>
      <span class="fold" title="Collapse">‹</span>
    </div>
    <div class="hint hidden"></div>
    <div class="composer hidden"></div>
    <div class="edit hidden"></div>
    <div class="box sel hidden"></div>
    <div class="box hov hidden"></div>
    <div class="tag hidden"></div>
    <div class="card hidden"></div>
    <div class="measure"></div>
    <div class="pins"></div>
    <div class="marquee hidden"></div>
    <div class="picks"></div>
`;
  document.documentElement.appendChild(host);

  const selBox = shadow.querySelector<HTMLElement>('.box.sel')!;
  const hovBox = shadow.querySelector<HTMLElement>('.box.hov')!;
  const tag = shadow.querySelector<HTMLElement>('.tag')!;
  const card = shadow.querySelector<HTMLElement>('.card')!;
  const measureLayer = shadow.querySelector<HTMLElement>('.measure')!;
  const pinLayer = shadow.querySelector<HTMLElement>('.pins')!;
  const marquee = shadow.querySelector<HTMLElement>('.marquee')!;
  const pickLayer = shadow.querySelector<HTMLElement>('.picks')!;

  const bar = shadow.querySelector<HTMLElement>('.bar')!;
  const barHost = bar.querySelector<HTMLElement>('.host')!;
  const barSize = bar.querySelector<HTMLButtonElement>('.size')!;
  const barSelect = bar.querySelector<HTMLButtonElement>('.mode.select')!;
  const barComment = bar.querySelector<HTMLButtonElement>('.mode.comment')!;
  const barLight = bar.querySelector<HTMLButtonElement>('.mode.light')!;
  const barReset = bar.querySelector<HTMLButtonElement>('.reset')!;
  const barDark = bar.querySelector<HTMLButtonElement>('.mode.dark')!;
  const hint = shadow.querySelector<HTMLElement>('.hint')!;
  const composer = shadow.querySelector<HTMLElement>('.composer')!;
  const editCard = shadow.querySelector<HTMLElement>('.edit')!;

  let selected: Element | null = null;
  let hovered: Element | null = null;
  let hoverOn = false;
  let measuring = false;
  let pins: Pin[] = [];
  let barOn = false;
  let noteOn = false;
  /** Which way the bar's Light/Dark switch sits; the panel owns the truth. */
  let barMode: Mode = 'light';
  /** The page's own names for its colours, from the scan: `#15171B` → `--ink`. */
  let tokenNames: Record<string, string> = {};
  let tokenLengths: TokenLengths = { space: {}, radius: {}, type: {} };
  const named = (hex: string | null) => (hex && tokenNames[hex.toUpperCase()]) || null;
  /** A single px length's name on this page, for the kind the property says it is. */
  const namedLength = (kind: keyof TokenLengths, value: string): string | null => {
    const m = /^(-?\d*\.?\d+)px$/.exec(value.trim());
    return m ? (tokenLengths[kind][String(parseFloat(m[1]!))] ?? null) : null;
  };
  /** How many overrides the panel holds; the bar only shows Reset when there are some. */
  let resettable = 0;
  /** The page's zoom, as the background last reported it. 1 until asked. */
  let zoom = 1;
  let canReset = false;
  /** Elements shift-clicked in note mode, in the order they were picked. */
  let picked: Element[] = [];
  let drag: { x: number; y: number } | null = null;

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

  /** Like `send`, for the background, which answers. */
  const ask = async <T,>(msg: unknown): Promise<T | null> => {
    try {
      return ((await chrome.runtime.sendMessage(msg)) as T) ?? null;
    } catch {
      return null;
    }
  };

  /* ----- selection ----- */

  const announce = () => send({ type: 'element-selected', data: selected ? readProps(selected) : null });

  const select = (el: Element | null) => {
    if (el && (isOurs(el) || el === document.documentElement)) return;
    selected = el;
    editPinned = null;
    renderEdit();
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
      let left: number;
      let top: number;
      if (pin.rect) {
        // Page coordinates, so a region stays where it was drawn when you scroll.
        left = pin.rect.x - scrollX + pin.rect.width - 10;
        top = pin.rect.y - scrollY - 4;
      } else {
        const el = find(pin.selector);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        left = r.right - 10;
        top = r.top - 4;
      }
      const dot = document.createElement('div');
      dot.className = `pin${pin.done ? ' done' : ''}`;
      dot.textContent = pin.label;
      dot.title = pin.selector ?? 'region';
      // Top-right corner, clear of the hover tag that sits at the top-left.
      Object.assign(dot.style, { left: `${left}px`, top: `${top}px` });
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
        placeEdit();
      } else {
        selBox.classList.add('hidden');
        editCard.classList.add('hidden');
        if (selected) {
          // The page re-rendered it away; say so rather than track a ghost.
          selected = null;
          announce();
        }
      }
      drawMeasure();
      drawPins();
      drawPicks();
    });
  };

  /* ----- hover mode ----- */

  const clearHover = () => {
    hovered = null;
    hovBox.classList.add('hidden');
    tag.classList.add('hidden');
    card.classList.add('hidden');
  };

  const onMove = (e: MouseEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    // Over our own bar or pins: drop the highlight so a click there is a click there.
    if (el && isOurs(el)) {
      if (hovered) clearHover();
      return;
    }
    if (!el || el === document.documentElement || el === hovered) return;
    hovered = el;
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    hovBox.classList.remove('hidden');
    place(hovBox, rectOf(el));
    tag.classList.remove('hidden');
    tag.textContent = `${buildSelector(el).intent.selector} · ${Math.round(rect.width)} × ${Math.round(rect.height)}`;
    // Above the element when there is room under the bar; otherwise tucked inside its top edge.
    const minTop = barOn ? BAR_HEIGHT + 4 : 4;
    const tagTop = rect.top - 22 >= minTop ? rect.top - 22 : Math.max(minTop, rect.top + 4);
    Object.assign(tag.style, { left: `${Math.max(4, rect.left)}px`, top: `${tagTop}px` });

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
      <div class="row"><span class="k">Text</span><span class="swatch" style="background:${fg ?? 'transparent'}"></span><span>${fg ?? '—'}${named(fg) ? ` <span class="tok">${escapeHtml(named(fg)!)}</span>` : ''}</span></div>
      <div class="row"><span class="k">Fill</span><span class="swatch" style="background:${bg}"></span><span>${bg}${named(bg) ? ` <span class="tok">${escapeHtml(named(bg)!)}</span>` : ''}</span></div>
      <div class="row"><span class="k">Contrast</span><span>${ratio ?? '—'}${ratio ? ':1' : ''} ${ratio ? (ratio >= 7 ? 'AAA ✓' : ratio >= 4.5 ? 'AA ✓' : '✗') : ''}</span></div>
      <div class="row"><span class="k">Box</span><span>pad ${cs.padding} · radius ${cs.borderRadius}</span></div>`;
    const cardX = Math.min(e.clientX + 16, innerWidth - 296);
    const cardY = Math.min(e.clientY + 16, innerHeight - 140);
    Object.assign(card.style, { left: `${cardX}px`, top: `${cardY}px` });
  };

  const onClick = (e: MouseEvent) => {
    if (e.composedPath().includes(host)) return;
    if (!hovered) return;
    e.preventDefault();
    e.stopPropagation();
    select(hovered);
  };

  const setHover = (on: boolean) => {
    if (on === hoverOn) return;
    hoverOn = on;
    if (on) {
      if (noteOn) setNote(false);
      addEventListener('mousemove', onMove, true);
      addEventListener('click', onClick, true);
    } else {
      removeEventListener('mousemove', onMove, true);
      removeEventListener('click', onClick, true);
      clearHover();
      drawMeasure();
    }
    if (barOn) {
      renderBar();
      showHint(
        on
          ? '<b>Select</b> — hover for font, colour and contrast; click to pick an element. Arrow keys walk the tree, Esc lets go.'
          : null,
      );
    }
  };

  /* ----- the edit card: the selection's most-reached-for values, on the page ----- */

  /** Where the card was dragged to, if it was; otherwise it follows the element. */
  let editPinned: { left: number; top: number } | null = null;
  let editDrag: { x: number; y: number; left: number; top: number } | null = null;

  const EDIT_FIELDS: { label: string; property: string }[] = [
    { label: 'Text', property: 'color' },
    { label: 'Fill', property: 'background-color' },
    { label: 'Size', property: 'font-size' },
    { label: 'Weight', property: 'font-weight' },
    { label: 'Padding', property: 'padding' },
    { label: 'Radius', property: 'border-radius' },
  ];

  const HEX6 = /^#[0-9a-f]{6}$/i;
  const isEnter = (e: KeyboardEvent) => e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter';
  const asPx = (v: string) => (/^-?\d*\.?\d+$/.test(v.trim()) ? `${v.trim()}px` : v.trim());
  /** A shorthand typed as "8 16" means pixels; anything with units is kept. */
  const asLengths = (v: string) => v.trim().split(/\s+/).map(asPx).join(' ');

  const editValues = (props: ElementProps): Record<string, string> => {
    const z = (v: string) => (v === '0px' ? '0' : v);
    const [t, r, b, l] = [props.box.paddingTop, props.box.paddingRight, props.box.paddingBottom, props.box.paddingLeft].map(z);
    const padding = t === r && r === b && b === l ? t! : t === b && r === l ? `${t} ${r}` : `${t} ${r} ${b} ${l}`;
    return {
      color: props.color.text,
      'background-color': props.color.background,
      'font-size': props.type.fontSize,
      'font-weight': props.type.fontWeight,
      padding,
      'border-radius': props.radius,
    };
  };

  const emitEdit = (property: string, to: string) => send({ type: 'element-edit', property, to });

  const colourControl = (property: string, value: string): HTMLElement => {
    const wrap = document.createElement('div');
    wrap.className = 'colour';
    const pick = document.createElement('input');
    pick.type = 'color';
    pick.value = HEX6.test(value) ? value : '#000000';
    const text = document.createElement('input');
    text.type = 'text';
    text.value = value;
    text.spellcheck = false;
    text.dataset.prop = property;
    pick.addEventListener('input', () => {
      text.value = pick.value.toUpperCase();
      emitEdit(property, text.value);
    });
    const commit = () => {
      const v = text.value.trim();
      if (!v || !CSS.supports('color', v)) return;
      if (HEX6.test(v)) pick.value = v;
      emitEdit(property, v);
    };
    text.addEventListener('change', commit);
    text.addEventListener('keydown', (e) => isEnter(e) && commit());
    // The page's own name for this colour, when it has one: writing `var(--ink)`
    // is the edit a token system wants, and the brief carries the name.
    const tok = document.createElement('button');
    tok.className = 'tok';
    tok.dataset.tokFor = property;
    const showTok = (hex: string) => {
      const name = named(hex);
      tok.textContent = name ?? '';
      tok.title = name ? `This is ${name} on this page — click to write var(${name}) instead of the hex` : '';
      tok.classList.toggle('hidden', !name);
    };
    showTok(value);
    tok.addEventListener('click', () => {
      const name = named(text.value.trim()) ?? tok.textContent;
      if (!name) return;
      text.value = `var(${name})`;
      emitEdit(property, `var(${name})`);
    });
    wrap.append(pick, text, tok);
    return wrap;
  };

  const LENGTH_KIND: Record<string, keyof TokenLengths> = {
    padding: 'space',
    'border-radius': 'radius',
    'font-size': 'type',
  };

  const lengthControl = (property: string, value: string, many = false): HTMLElement => {
    const wrap = document.createElement('div');
    wrap.className = 'len';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.spellcheck = false;
    input.dataset.prop = property;
    const commit = () => {
      const v = many ? asLengths(input.value) : asPx(input.value);
      if (!v || !CSS.supports(property, v)) return;
      input.value = v;
      emitEdit(property, v);
    };
    input.addEventListener('change', commit);
    input.addEventListener('keydown', (e) => {
      if (isEnter(e)) commit();
      // Arrows nudge a single length by a pixel; shift makes it ten.
      const dir = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0;
      if (!dir || many) return;
      const m = /^(-?\d*\.?\d+)(px|rem|em)?$/.exec(input.value.trim());
      if (!m) return;
      e.preventDefault();
      const step = (e.shiftKey ? 10 : 1) * dir;
      input.value = `${Math.round((parseFloat(m[1]!) + step) * 100) / 100}${m[2] ?? 'px'}`;
      commit();
    });
    // The page's own name for this length, when its variable says what kind it is.
    const kind = LENGTH_KIND[property];
    const tok = document.createElement('button');
    tok.className = 'tok';
    const showTok = (v: string) => {
      const name = kind ? namedLength(kind, v) : null;
      tok.textContent = name ?? '';
      tok.title = name ? `This is ${name} on this page — click to write var(${name}) instead` : '';
      tok.classList.toggle('hidden', !name);
    };
    showTok(value);
    input.addEventListener('input', () => showTok(input.value));
    tok.addEventListener('click', () => {
      const name = tok.textContent;
      if (!name) return;
      input.value = `var(${name})`;
      emitEdit(property, `var(${name})`);
    });
    wrap.append(input, tok);
    return wrap;
  };

  const weightControl = (value: string): HTMLElement => {
    const sel = document.createElement('select');
    sel.dataset.prop = 'font-weight';
    for (let w = 100; w <= 900; w += 100) {
      const o = document.createElement('option');
      o.value = String(w);
      o.textContent = String(w);
      sel.appendChild(o);
    }
    sel.value = String(Math.round(parseFloat(value) / 100) * 100 || 400);
    sel.addEventListener('change', () => emitEdit('font-weight', sel.value));
    return sel;
  };

  const renderEdit = () => {
    editCard.replaceChildren();
    if (!selected?.isConnected) {
      editCard.classList.add('hidden');
      return;
    }
    const props = readProps(selected);
    const values = editValues(props);

    const grip = document.createElement('div');
    grip.className = 'grip';
    const name = document.createElement('code');
    name.textContent = props.intent.matches > 1 ? props.intent.selector : props.selector;
    name.title = props.selector;
    const more = document.createElement('button');
    more.className = 'more';
    more.textContent = 'More in panel ↗';
    more.addEventListener('click', (e) => {
      e.stopPropagation();
      send({ type: 'panel-focus' });
    });
    grip.append(name, more);

    // Drag by the grip: the card then stays where it was put until the next pick.
    grip.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      const box = editCard.getBoundingClientRect();
      editDrag = { x: e.clientX, y: e.clientY, left: box.left, top: box.top };
      grip.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    grip.addEventListener('pointermove', (e) => {
      if (!editDrag) return;
      editPinned = {
        left: editDrag.left + (e.clientX - editDrag.x),
        top: editDrag.top + (e.clientY - editDrag.y),
      };
      placeEdit();
    });
    const endDrag = () => {
      editDrag = null;
    };
    grip.addEventListener('pointerup', endDrag);
    grip.addEventListener('pointercancel', endDrag);

    const fields = document.createElement('div');
    fields.className = 'fields';
    for (const f of EDIT_FIELDS) {
      const label = document.createElement('label');
      label.textContent = f.label;
      const value = values[f.property] ?? '';
      const control =
        f.property === 'color' || f.property === 'background-color'
          ? colourControl(f.property, value)
          : f.property === 'font-weight'
            ? weightControl(value)
            : lengthControl(f.property, value, f.property === 'padding');
      fields.append(label, control);
    }

    // Escape leaves the field, not the selection; the page's own shortcuts stay out.
    editCard.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') (e.target as HTMLElement).blur();
    });

    editCard.append(grip, fields);
    editCard.classList.remove('hidden');
    placeEdit();
  };

  /** After the panel applied a change, the computed values moved; show them, but never under a caret. */
  const refreshEdit = (props: ElementProps) => {
    if (editCard.classList.contains('hidden')) return;
    const values = editValues(props);
    const focused = shadow.activeElement as HTMLElement | null;
    for (const el of editCard.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-prop]')) {
      if (el === focused) continue;
      const v = values[el.dataset.prop!];
      if (v === undefined) continue;
      if (el instanceof HTMLSelectElement) el.value = String(Math.round(parseFloat(v) / 100) * 100 || 400);
      else el.value = v;
      const pick = el.previousElementSibling;
      if (pick instanceof HTMLInputElement && pick.type === 'color' && HEX6.test(v)) pick.value = v;
      const tok = el.nextElementSibling;
      if (tok instanceof HTMLButtonElement && tok.classList.contains('tok')) {
        const kind = LENGTH_KIND[el.dataset.prop!];
        const name = kind ? namedLength(kind, v) : named(v);
        tok.textContent = name ?? '';
        tok.classList.toggle('hidden', !name);
      }
    }
  };

  /** Below the element, or above when there is no room; clear of the bar either way. */
  const placeEdit = () => {
    if (!selected?.isConnected || editCard.classList.contains('hidden')) return;
    const w = editCard.offsetWidth || 232;
    const h = editCard.offsetHeight || 200;
    const clear = barOn ? BAR_HEIGHT + 8 : 8;
    if (editPinned) {
      Object.assign(editCard.style, {
        left: `${Math.min(Math.max(8, editPinned.left), innerWidth - w - 8)}px`,
        top: `${Math.min(Math.max(clear, editPinned.top), innerHeight - h - 8)}px`,
      });
      return;
    }
    const r = rectOf(selected);
    const below = r.y + r.height + 8;
    const top = below + h <= innerHeight - 8 ? below : Math.max(clear, r.y - h - 8);
    Object.assign(editCard.style, {
      left: `${Math.min(Math.max(8, r.x), innerWidth - w - 8)}px`,
      top: `${Math.min(Math.max(clear, top), innerHeight - h - 8)}px`,
    });
  };

  /* ----- notes: what a note is about ----- */

  const drawPicks = () => {
    pickLayer.replaceChildren();
    for (const el of picked) {
      if (!el.isConnected) continue;
      const r = rectOf(el);
      const box = document.createElement('div');
      box.className = 'picked';
      Object.assign(box.style, {
        left: `${r.x}px`,
        top: `${r.y}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      });
      pickLayer.appendChild(box);
    }
  };

  let composing: CommentTarget | null = null;

  const closeComposer = () => {
    composing = null;
    composer.classList.add('hidden');
    composer.replaceChildren();
  };

  /**
   * A note is written where it is about. Sending you to a panel to type
   * breaks eye contact with the thing you were pointing at.
   */
  const openComposer = (target: CommentTarget, anchor: Rect) => {
    composing = target;
    composer.replaceChildren();

    const about = document.createElement('div');
    about.className = 'about';
    about.innerHTML = `<b>${targetKindLabel(target)}</b> ${escapeHtml(describeTarget(target))}`;
    const field = document.createElement('textarea');
    field.rows = 3;
    field.placeholder = 'What should change here?';
    const keys = document.createElement('div');
    keys.className = 'keys';
    keys.textContent = '⌘↩ to pin · Esc to drop';
    const row = document.createElement('div');
    row.className = 'row';
    const cancel = document.createElement('button');
    cancel.className = 'cancel';
    cancel.textContent = 'Cancel';
    const save = document.createElement('button');
    save.className = 'save';
    save.textContent = 'Pin note';
    save.disabled = true;

    const submit = () => {
      const text = field.value.trim();
      if (!text || !composing) return;
      send({ type: 'note-created', target: composing, text });
      closeComposer();
    };
    field.addEventListener('input', () => {
      save.disabled = !field.value.trim();
    });
    field.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
      if (e.key === 'Escape') closeComposer();
    });
    cancel.addEventListener('click', closeComposer);
    save.addEventListener('click', submit);

    row.append(cancel, save);
    composer.append(about, field, keys, row);
    composer.classList.remove('hidden');

    // Below what it is about, not under the cursor: a box that covers the
    // thing you just pointed at makes you move it before you can describe it.
    const w = 280;
    const h = composer.offsetHeight || 140;
    const below = anchor.y + anchor.height + 8;
    const clear = BAR_HEIGHT + 8;
    const top = below + h <= innerHeight - 8 ? below : Math.max(clear, anchor.y - h - 8);
    Object.assign(composer.style, {
      left: `${Math.min(Math.max(8, anchor.x), innerWidth - w - 8)}px`,
      top: `${Math.min(Math.max(clear, top), innerHeight - h - 8)}px`,
    });
    field.focus();
  };

  const emitTarget = (target: CommentTarget, anchor: Rect) => {
    picked = [];
    drawPicks();
    openComposer(target, anchor);
  };

  /** A run of text the user has selected inside `el`, if there is one. */
  const selectedTextIn = (el: Element): string | null => {
    const sel = getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const quote = range.toString().trim();
    if (!quote || quote.length > 300) return null;
    const anchor = range.commonAncestorContainer;
    const node = anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement : (anchor as Element);
    return node && (node === el || el.contains(node) || node.contains(el)) ? quote : null;
  };

  const onNoteDown = (e: MouseEvent) => {
    if (e.composedPath().includes(host)) return;
    if (composing) {
      // A click elsewhere puts the half-written note away rather than
      // silently starting another one on top of it.
      closeComposer();
      return;
    }
    drag = { x: e.clientX, y: e.clientY };
  };

  const onNoteMove = (e: MouseEvent) => {
    if (!drag) return;
    const w = Math.abs(e.clientX - drag.x);
    const h = Math.abs(e.clientY - drag.y);
    if (w < 6 && h < 6) return;
    marquee.classList.remove('hidden');
    Object.assign(marquee.style, {
      left: `${Math.min(drag.x, e.clientX)}px`,
      top: `${Math.min(drag.y, e.clientY)}px`,
      width: `${w}px`,
      height: `${h}px`,
    });
  };

  const onNoteUp = (e: MouseEvent) => {
    const start = drag;
    drag = null;
    marquee.classList.add('hidden');
    if (!start || e.composedPath().includes(host)) return;
    e.preventDefault();
    e.stopPropagation();

    const w = Math.abs(e.clientX - start.x);
    const h = Math.abs(e.clientY - start.y);

    // A drag is a region: it can cover empty space that no element owns.
    if (w >= 6 || h >= 6) {
      const x = Math.min(start.x, e.clientX);
      const y = Math.min(start.y, e.clientY);
      const centre = document.elementFromPoint(x + w / 2, y + h / 2);
      const within = centre && !isOurs(centre) ? buildSelector(centre).intent.selector : undefined;
      emitTarget(
        { kind: 'region', rect: { x: x + scrollX, y: y + scrollY, width: w, height: h }, within },
        { x, y, width: w, height: h },
      );
      return;
    }

    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isOurs(el) || el === document.documentElement) return;

    // Shift keeps adding: "these three should line up" is one note, not three.
    if (e.shiftKey) {
      picked = picked.includes(el) ? picked.filter((p) => p !== el) : [...picked, el];
      drawPicks();
      return;
    }

    if (picked.length) {
      const all = picked.includes(el) ? picked : [...picked, el];
      emitTarget(
        { kind: 'elements', selectors: all.map((p) => buildSelector(p).selector) },
        rectOf(el),
      );
      return;
    }

    const quote = selectedTextIn(el);
    const sel = buildSelector(el);
    emitTarget(
      quote
        ? { kind: 'text', selector: sel.selector, quote }
        : { kind: 'element', selector: sel.selector, matches: sel.matches },
      rectOf(el),
    );
  };

  /**
   * Marking something up must not also press it. mousedown is left alone so a
   * text selection can still be dragged out; the click that follows is what
   * would have activated the button, and that is what gets swallowed.
   */
  const onNoteClick = (e: MouseEvent) => {
    if (e.composedPath().includes(host)) return;
    e.preventDefault();
    e.stopPropagation();
  };

  const setNote = (on: boolean) => {
    if (on === noteOn) return;
    noteOn = on;
    if (on) {
      setHover(false);
      addEventListener('mousedown', onNoteDown, true);
      addEventListener('mousemove', onNoteMove, true);
      addEventListener('mouseup', onNoteUp, true);
      addEventListener('click', onNoteClick, true);
      showHint(
        '<b>Comment</b> — click an element, drag a box over anything, shift-click several, or select text. Type the note where it lands.',
      );
    } else {
      removeEventListener('mousedown', onNoteDown, true);
      removeEventListener('mousemove', onNoteMove, true);
      removeEventListener('mouseup', onNoteUp, true);
      removeEventListener('click', onNoteClick, true);
      showHint(null);
      closeComposer();
      marquee.classList.add('hidden');
      picked = [];
      drag = null;
      drawPicks();
    }
    send({ type: 'note-toggled', active: on });
    if (barOn) renderBar();
  };

  /* ----- the bar ----- */

  let menu: HTMLElement | null = null;

  const renderBar = () => {
    barHost.textContent = location.host;
    // Named after the preset it is, so "did that take?" has an answer.
    barSize.textContent = viewportLabel({ innerWidth, innerHeight, zoom });
    barSize.title = `${innerWidth} × ${innerHeight} CSS px at ${Math.round(zoom * 100)}% — viewport presets`;
    barSelect.classList.toggle('on', hoverOn);
    barSelect.setAttribute('aria-checked', String(hoverOn));
    barComment.classList.toggle('on', noteOn);
    barComment.setAttribute('aria-checked', String(noteOn));
    barLight.classList.toggle('on', barMode === 'light');
    barLight.setAttribute('aria-checked', String(barMode === 'light'));
    barDark.classList.toggle('on', barMode === 'dark');
    barDark.setAttribute('aria-checked', String(barMode === 'dark'));
    // A resized or zoomed viewport is an override too, and only the bar knows about it.
    barReset.classList.toggle('hidden', resettable === 0 && !canReset);
    barReset.querySelector('span')!.textContent = resettable > 0 ? String(resettable) : '';
  };

  /** The zoom lives in the browser, not the page; ask before trusting the label. */
  const refreshViewport = async () => {
    const r = await ask<{ ok: boolean; zoom?: number; canReset?: boolean }>({ type: 'viewport-state' });
    if (r?.ok && typeof r.zoom === 'number') {
      zoom = r.zoom;
      canReset = !!r.canReset;
    }
    if (barOn) renderBar();
  };

  const applyBarTheme = (theme: OverlayTheme) => {
    const t = OVERLAY[theme];
    host.style.setProperty('--cn-accent', t.accent);
    host.style.setProperty('--cn-wash', t.accentWash);
    host.style.setProperty('--cn-bg', t.cardBg);
    host.style.setProperty('--cn-ink', t.cardInk);
    host.style.setProperty('--cn-muted', t.cardMuted);
    host.style.setProperty('--cn-line', t.cardLine);
  };

  /**
   * What the mode you just chose actually does, for a few seconds.
   * Permanent would be clutter; never is how you end up with three switches
   * nobody can explain.
   */
  let hintTimer = 0;
  const showHint = (html: string | null) => {
    window.clearTimeout(hintTimer);
    if (!html) {
      hint.classList.add('hidden');
      return;
    }
    hint.innerHTML = html;
    hint.classList.remove('hidden', 'fading');
    // Under the mode buttons, which is what it is explaining.
    const box = bar.getBoundingClientRect();
    hint.style.right = `${Math.max(8, innerWidth - box.right + 30)}px`;
    hintTimer = window.setTimeout(() => {
      hint.classList.add('fading');
      hintTimer = window.setTimeout(() => hint.classList.add('hidden'), 300);
    }, 4200);
  };

  const closeMenu = () => {
    menu?.remove();
    menu = null;
  };

  interface ResizeReply {
    ok: boolean;
    error?: string;
    zoom?: number;
    viewport?: { width: number; height: number };
    canReset?: boolean;
  }

  const pickPreset = async (p: (typeof DEVICE_PRESETS)[number]) => {
    // The page sends what it can see; the background knows the window and the zoom.
    const r = await ask<ResizeReply>({
      type: 'resize-window',
      preset: { name: p.name, width: p.width, height: p.height },
      inner: { width: innerWidth, height: innerHeight },
      outer: { width: outerWidth, height: outerHeight },
    });
    if (!r) return showHint('The panel could not reach the browser to resize the window.');
    if (!r.ok) return showHint(`<b>${p.name}</b> — ${escapeHtml(r.error ?? 'the window could not be resized')}`);
    zoom = r.zoom ?? 1;
    canReset = !!r.canReset;
    renderBar();
    showHint(
      zoom === 1
        ? `<b>${p.name}</b> — the window is now ${p.width} × ${p.height}.`
        : `<b>${p.name}</b> — the display is too small for ${p.width}px beside the panel, so the page is zoomed to ${Math.round(zoom * 100)}%. Its CSS viewport is ${r.viewport?.width ?? p.width} wide, so breakpoints read true.`,
    );
  };

  const resetViewport = async () => {
    const r = await ask<ResizeReply>({ type: 'reset-viewport' });
    if (!r?.ok) return showHint(`Reset — ${escapeHtml(r?.error ?? 'the window could not be put back')}`);
    zoom = r.zoom ?? 1;
    canReset = false;
    renderBar();
    showHint('<b>Reset</b> — the window and zoom are back where they were.');
  };

  const openMenu = () => {
    if (menu) return closeMenu();
    menu = document.createElement('div');
    menu.className = 'menu';
    for (const p of DEVICE_PRESETS) {
      const b = document.createElement('button');
      b.innerHTML = `${p.name}<span>${p.width} × ${p.height}</span>`;
      b.addEventListener('click', () => {
        void pickPreset(p);
        closeMenu();
      });
      menu.appendChild(b);
    }
    const reset = document.createElement('button');
    reset.innerHTML = `Reset<span>100%</span>`;
    reset.disabled = !canReset;
    reset.style.opacity = canReset ? '' : '0.4';
    reset.addEventListener('click', () => {
      void resetViewport();
      closeMenu();
    });
    menu.appendChild(reset);
    barSize.appendChild(menu);
  };

  /**
   * The bar takes its strip from the page rather than floating over it: the
   * root's inline margin is the one declaration nothing in a stylesheet can
   * outrank, and it is put back exactly. A header the page fixes to the top
   * of the viewport will still sit under the bar; that is stated in the
   * README rather than fought.
   */
  let pushed: { value: string; priority: string } | null = null;
  const pushPage = (on: boolean) => {
    const root = document.documentElement;
    if (on) {
      if (pushed) return;
      pushed = {
        value: root.style.getPropertyValue('margin-top'),
        priority: root.style.getPropertyPriority('margin-top'),
      };
      root.style.setProperty('margin-top', `${BAR_HEIGHT}px`, 'important');
    } else if (pushed) {
      if (pushed.value) root.style.setProperty('margin-top', pushed.value, pushed.priority);
      else root.style.removeProperty('margin-top');
      pushed = null;
    }
  };

  const showBar = (on: boolean) => {
    barOn = on;
    bar.classList.toggle('hidden', !on);
    pushPage(on);
    if (on) {
      renderBar();
      void refreshViewport();
    } else closeMenu();
    layout();
  };

  barSize.addEventListener('click', (e) => {
    e.stopPropagation();
    openMenu();
  });
  barSelect.addEventListener('click', () => setHover(!hoverOn));
  barComment.addEventListener('click', () => setNote(!noteOn));
  const setMode = (mode: Mode) => {
    if (mode === barMode) return;
    barMode = mode;
    renderBar();
    send({ type: 'mode-changed', mode });
    showHint(
      mode === 'dark'
        ? '<b>Dark</b> — the page repaints with the dark side of its system. Light puts it back.'
        : null,
    );
  };
  barReset.addEventListener('click', () => {
    barMode = 'light';
    resettable = 0;
    const viewport = canReset;
    renderBar();
    // The selection goes too, so the card and the outline leave with the overrides.
    select(null);
    send({ type: 'reset-all' });
    if (viewport) void resetViewport();
    showHint(
      `<b>Reset</b> — every override and the dark preview are gone${viewport ? ', and the window is back at 100%' : ''}; the page is reading as itself again. Notes stay.`,
    );
  });
  barLight.addEventListener('click', () => setMode('light'));
  barDark.addEventListener('click', () => setMode('dark'));
  // The mark folds the bar down to a pill and opens it again; the chevron only folds.
  bar.querySelector('.mark')!.addEventListener('click', (e) => {
    e.stopPropagation();
    bar.classList.toggle('collapsed');
  });
  bar.querySelector('.fold')!.addEventListener('click', (e) => {
    e.stopPropagation();
    bar.classList.add('collapsed');
  });
  // A zoom change fires resize too, so the label re-asks rather than trusting its cache.
  addEventListener('resize', () => barOn && void refreshViewport());
  addEventListener('click', () => closeMenu(), true);

  // The panel holds a port open while it is showing this tab; when it goes,
  // the bar and hover mode go with it. The selection stays for its return.
  const onConnect = (port: chrome.runtime.Port) => {
    if (port.name !== 'codename-panel') return;
    showBar(true);
    port.onDisconnect.addListener(() => {
      showBar(false);
      setHover(false);
      setNote(false);
    });
  };
  chrome.runtime.onConnect.addListener(onConnect);

  /* ----- keyboard ----- */

  /**
   * The real target, not the shadow host. A window listener sees our own host
   * for anything inside the overlay — a closed root hides its inside from
   * `composedPath()` too — so the root's own `activeElement` is what says
   * whether the composer or the edit card has the caret.
   */
  const typing = (e: Event) => {
    const inside = shadow.activeElement as HTMLElement | null;
    const el = inside ?? ((e.composedPath()[0] ?? e.target) as HTMLElement | null);
    return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName ?? ''));
  };

  const onKey = (e: KeyboardEvent) => {
    if (typing(e)) return;
    if (e.key === 'Escape') {
      // One level at a time: a half-made note, then note mode, then hover,
      // then the selection.
      if (composing) closeComposer();
      else if (picked.length) {
        picked = [];
        drawPicks();
      } else if (noteOn) setNote(false);
      else if (hoverOn) setHover(false);
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
      case 'toggle':
        if (msg.what === 'comment') setNote(!noteOn);
        else setHover(!hoverOn);
        break;
      case 'tokens':
        tokenNames = msg.colors ?? {};
        tokenLengths = msg.lengths ?? { space: {}, radius: {}, type: {} };
        if (!editCard.classList.contains('hidden')) renderEdit();
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
      case 'read': {
        const props = selected ? readProps(selected) : null;
        if (props) refreshEdit(props);
        sendResponse(props);
        return true;
      }
      case 'layers':
        sendResponse(buildLayers());
        return true;
      case 'peek': {
        // Hovering a row in the panel lights the element up on the page.
        const el = find(msg.selector);
        if (el) {
          hovBox.classList.remove('hidden');
          place(hovBox, rectOf(el));
        } else {
          hovBox.classList.add('hidden');
        }
        break;
      }
      case 'unpeek':
        if (!hoverOn) hovBox.classList.add('hidden');
        break;
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
      case 'reset-viewport':
        if (canReset) void resetViewport();
        break;
      case 'bar':
        if (msg.theme) applyBarTheme(msg.theme);
        if (msg.mode && msg.mode !== barMode) barMode = msg.mode;
        if (typeof msg.resettable === 'number') resettable = msg.resettable;
        showBar(!!msg.on);
        break;
      case 'note':
        setNote(!!msg.on);
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
    setNote(false);
    pushPage(false);
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
