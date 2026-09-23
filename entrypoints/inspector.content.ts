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

import type { AgentPresence, ElementProps, InspectorCommand, TokenLengths } from '@/shared/types';
import { BAR_HEIGHT, OVERLAY, type OverlayTheme } from '@/shared/theme';
import { RAIL_TAG, SELECTED_EVENT, throughRail } from '@/shared/inpage';
import { createRootPush } from '@/studio/pushRoot';
import { DEVICE_KINDS, frameFor, presetsOf, viewportLabel, type DeviceKind, type Frame } from '@/shared/viewport';
import type { Mode } from '@/studio/engine/types';
import { lengthPx } from '@/studio/reskin';
import { buildSelector } from '@/studio/selector';
import { measure, type Rect } from '@/studio/measure';
import { readProps } from '@/studio/inspect/readProps';
import { buildLayers, find, findAll, neighbour, rectOf } from '@/studio/inspect/dom';
import { DRAG_MIN, dropIndex, dropZone, placeMenu, placeSizeLabel, regionFrom, takesChildren } from '@/studio/inspect/geometry';
import { shortcutSheet } from '@/studio/inspect/commands';
import { describeTarget, targetKindLabel, type CommentTarget, type Pin } from '@/studio/annotations';
import { WIDTH_RANGE } from '@/studio/conditions';
import { DEVICE_PRESETS } from '@/shared/types';
import { createPageFrame } from '@/studio/pageFrame';
import { availableWidth } from '@/studio/frame';

export default defineContentScript({
  registration: 'runtime',
  main() {
    // Injecting twice is a no-op: the panel asks for hover mode separately.
    if (window.__codenameInspector) return;
    activate();
  },
});

/* ---------------- reading an element ---------------- */

const HOST_TAG = 'CODENAME-INSPECTOR';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function isOurs(el: Element | null): boolean {
  return !!el && (el.tagName === HOST_TAG || el.tagName.toLowerCase() === RAIL_TAG || el.closest(HOST_TAG.toLowerCase()) !== null);
}

/* ---------------- the overlay ---------------- */

function activate() {
  // Everything drawn here — the bar, the cards, the selection and its
  // labels — is the tool's chrome, not part of the page, so it wears the
  // panel's palette rather than the system's. The panel tells it which;
  // until then, dark.
  const d = {
    accent: 'var(--cn-accent)',
    accentWash: 'var(--cn-wash)',
    cardBg: 'var(--cn-bg)',
    cardInk: 'var(--cn-ink)',
    cardMuted: 'var(--cn-muted)',
    cardLine: 'var(--cn-line)',
    chromeBg: 'var(--cn-app)',
    field: 'var(--cn-field)',
    fieldHover: 'var(--cn-field-hover)',
    thumb: 'var(--cn-thumb)',
  };
  const c = d;
  const font = "'Geist', ui-sans-serif, system-ui, sans-serif";
  const mono = 'ui-monospace, Menlo, monospace';
  // A select's chevron, in ink-muted, which is the same grey in both themes.
  const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10' fill='none' stroke='%23767676' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2.5 4l2.5 2.5L7.5 4'/%3E%3C/svg%3E")`;
  const host = document.createElement(HOST_TAG.toLowerCase());
  host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      :host { --cn-accent: ${OVERLAY.dark.accent}; --cn-wash: ${OVERLAY.dark.accentWash}; --cn-bg: ${OVERLAY.dark.cardBg}; --cn-ink: ${OVERLAY.dark.cardInk}; --cn-muted: ${OVERLAY.dark.cardMuted}; --cn-line: ${OVERLAY.dark.cardLine}; --cn-app: ${OVERLAY.dark.chromeBg}; --cn-field: ${OVERLAY.dark.field}; --cn-field-hover: ${OVERLAY.dark.fieldHover}; --cn-thumb: ${OVERLAY.dark.thumb}; }
      * { box-sizing: border-box; }
      .box { position: fixed; pointer-events: none; outline: 2px solid ${c.accent}; outline-offset: -1px; background: ${c.accentWash}; }
      .box.sel { background: transparent; box-shadow: 0 0 0 1px ${c.cardBg}; }
      .box.hov { outline-width: 1px; outline-offset: 0; background: transparent; }
      .box.sel.moving { background: ${c.accentWash}; }
      .drop { position: fixed; pointer-events: none; z-index: 1; background: ${c.accent}; border-radius: 2px; }
      .size { position: fixed; pointer-events: none; transform: translateX(-50%); background: ${c.accent}; color: ${c.cardBg}; font: 500 11px/1.6 ${font}; padding: 1px 6px; border-radius: 4px; white-space: nowrap; font-variant-numeric: tabular-nums; }
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
      .bar { position: fixed; top: 0; left: 0; right: 0; z-index: 2; height: ${BAR_HEIGHT}px; display: grid; grid-template-columns: minmax(max-content, 1fr) auto minmax(max-content, 1fr); align-items: center; gap: 12px; padding: 0 10px; pointer-events: auto; background: ${d.chromeBg}; color: ${d.cardInk}; border-bottom: 1px solid ${d.cardLine}; font: 500 11px/1 ${font}; font-variant-numeric: tabular-nums; box-shadow: 0 1px 8px rgba(0,0,0,0.25); }
      .bar .host { color: ${d.cardMuted}; }
      .bar .device { display: flex; align-items: center; gap: 6px; }
      .bar .kinds { display: flex; gap: 2px; padding: 2px; border-radius: 6px; background: ${d.field}; }
      .bar .kind { display: flex; align-items: center; justify-content: center; width: 26px; height: 20px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: ${d.cardMuted}; cursor: pointer; }
      .bar .kind svg { width: 14px; height: 14px; }
      .bar .kind:hover { color: ${d.cardInk}; }
      .bar .kind.on { background: ${d.thumb}; color: ${d.cardInk}; box-shadow: 0 1px 2px rgba(0,0,0,0.2); }
      .bar .frame { height: 24px; max-width: 120px; padding: 0 20px 0 8px; border: 0; border-radius: 6px; background: ${d.field} ${CHEVRON} no-repeat right 5px center / 10px 10px; color: ${d.cardInk}; font: inherit; cursor: pointer; appearance: none; }
      .bar .frame:hover { background-color: ${d.fieldHover}; }
      .bar .frame:focus-visible { outline: 1px solid ${d.accent}; outline-offset: -1px; }
      .bar .frame option, .bar .frame optgroup { background: ${d.cardBg}; color: ${d.cardInk}; }
      .bar .dim { display: flex; align-items: center; gap: 4px; height: 24px; padding: 0 7px; border: 0; border-radius: 6px; background: ${d.field}; color: ${d.cardMuted}; cursor: text; }
      .bar .dim:hover { background: ${d.fieldHover}; }
      .bar .dim:focus-within { outline: 1px solid ${d.accent}; outline-offset: -1px; }
      .bar .dim input { width: 38px; border: 0; padding: 0; background: transparent; color: ${d.cardInk}; font: inherit; text-align: right; }
      .bar .dim input:focus { outline: none; }
      .bar .dim i { font-style: normal; }
      .bar .scale { color: ${d.cardMuted}; }
      .bar .reset { cursor: pointer; height: 24px; padding: 0 9px; border-radius: 6px; border: 0; color: ${d.accent}; background: ${d.accentWash}; font: inherit; font-weight: 600; white-space: nowrap; }
      .bar .reset:hover { background: color-mix(in srgb, ${d.accent} 24%, transparent); }
      .bar .reset span { margin-left: 5px; font-weight: 500; color: ${d.cardMuted}; }
      .bar .agent { display: flex; align-items: center; gap: 6px; height: 24px; padding: 0 3px 0 9px; border-radius: 6px; border: 1px dashed ${d.accent}; color: ${d.cardInk}; background: transparent; font: inherit; white-space: nowrap; cursor: default; }
      .bar .agent i { width: 7px; height: 7px; border-radius: 50%; background: ${d.accent}; }
      .bar .agent span { color: ${d.cardMuted}; font-weight: 500; }
      .bar .agent button { display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; border: 0; border-radius: 4px; background: transparent; color: ${d.cardMuted}; cursor: pointer; padding: 0; }
      .bar .agent button:hover { color: ${d.cardInk}; background: ${d.fieldHover}; }
      .bar .agent button svg { width: 10px; height: 10px; }
      /* Framer's top bar: tools left, the page and its frame centred, the
         switches right, whatever the widths on either side. */
      .bar .side, .bar .middle { display: flex; align-items: center; gap: 8px; min-width: 0; }
      .bar .side.right { justify-content: flex-end; }
      .bar .modes { display: flex; gap: 2px; padding: 2px; border-radius: 6px; background: ${d.field}; }
      .bar .mode { display: flex; align-items: center; gap: 5px; height: 20px; padding: 0 8px; border: 0; border-radius: 4px; background: transparent; color: ${d.cardMuted}; font: inherit; cursor: pointer; }
      .bar .mode svg { width: 13px; height: 13px; }
      .bar .mode:hover { color: ${d.cardInk}; }
      .bar .mode.on { background: ${d.thumb}; color: ${d.cardInk}; box-shadow: 0 1px 2px rgba(0,0,0,0.2); }
      /* Alone rather than in a group, so it wears the track itself. */
      .bar .side > .mode.layers { height: 24px; background: ${d.field}; }
      .bar .side > .mode.layers:hover { background: ${d.fieldHover}; }
      .bar .side > .mode.layers.on { background: ${d.thumb}; }
      /* The panel's pane fills in while it is open, as a dock icon shows. */
      .bar .mode.layers .pane { fill: transparent; }
      .bar .mode.layers.on .pane { fill: currentColor; opacity: 0.45; }
      /* A narrow window narrows the bar. It gives up words before it gives
         up controls. These sheets are in the shadow root, which a device
         frame does not rewrite, so they follow the window, not the frame. */
      @media (max-width: 1280px) {
        .bar .host, .bar .mode .label, .bar .agent span { display: none; }
        .bar .mode { padding: 0 6px; }
      }
      @media (max-width: 900px) {
        .bar { gap: 8px; }
        .bar .frame, .bar .reset span { display: none; }
      }
      @media (max-width: 620px) {
        .bar { gap: 4px; padding: 0 6px; }
        .bar .dim span, .bar .dim i, .bar .scheme, .bar .scale { display: none; }
        .bar .dim { padding: 0 4px; }
        .bar .dim input { width: 32px; }
        .bar .kind { width: 22px; }
        .bar .mode { padding: 0 4px; }
        .bar .reset { padding: 0 6px; }
      }
      .hint { position: fixed; z-index: 2; top: ${BAR_HEIGHT + 6}px; pointer-events: none; background: ${d.cardBg}; color: ${d.cardInk}; border: 1px solid ${d.cardLine}; border-radius: 8px; padding: 6px 10px; font: 400 11px/1.4 ${font}; box-shadow: 0 4px 16px rgba(0,0,0,0.3); max-width: 320px; opacity: 1; transition: opacity 300ms; }
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
      /* The right-click menu: what can be done to the selection, and nothing
         about how it looks — that is the panel's, on the right. */
      .sheet { position: fixed; z-index: 4; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(640px, calc(100vw - 32px)); max-height: calc(100vh - 96px); overflow: auto; pointer-events: auto; padding: 16px 18px; background: ${d.cardBg}; color: ${d.cardInk}; border: 1px solid ${d.cardLine}; border-radius: 12px; box-shadow: 0 16px 48px rgba(0,0,0,0.4); font: 400 12px/1.4 ${font}; }
      .sheet h2 { margin: 0 0 12px; font: 600 13px/1 ${font}; }
      .sheet .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px 20px; }
      .sheet h3 { margin: 0 0 6px; font: 500 11px/1 ${font}; color: ${d.cardMuted}; text-transform: uppercase; letter-spacing: 0.04em; }
      .sheet dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 5px 10px; align-items: baseline; }
      .sheet dt { margin: 0; font: 500 11px/1.3 ${mono}; color: ${d.cardInk}; white-space: nowrap; }
      .sheet dd { margin: 0; color: ${d.cardMuted}; }
      .menu { position: fixed; z-index: 3; pointer-events: auto; min-width: 208px; max-width: 260px; padding: 4px; background: ${d.cardBg}; color: ${d.cardInk}; border: 1px solid ${d.cardLine}; border-radius: 8px; box-shadow: 0 8px 28px rgba(0,0,0,0.35); font: 400 11px/1 ${font}; }
      .menu .head { display: block; height: 24px; line-height: 24px; padding: 0 8px; color: ${d.cardMuted}; font: 500 10px/1 ui-monospace, Menlo, monospace; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
      .menu button { display: flex; align-items: center; gap: 8px; width: 100%; height: 24px; padding: 0 8px; border: 0; border-radius: 4px; background: transparent; color: ${d.cardInk}; font: inherit; text-align: left; cursor: pointer; }
      .menu button:hover, .menu button:focus-visible { background: ${d.fieldHover}; outline: none; }
      .menu button:disabled { color: ${d.cardMuted}; cursor: default; background: transparent; }
      .menu button kbd { margin-left: auto; color: ${d.cardMuted}; font: 400 10px/1 ${font}; }
      .menu hr { height: 1px; margin: 4px 0; border: 0; background: ${d.cardLine}; }
      /* Important, because a rule like \`.bar .agent { display: flex }\` is more
         specific than one class, and hid nothing: the agent chip showed on
         every page with no preview on it. */
      .bar button, .bar select, .bar .dim, .menu button { transition: color 120ms cubic-bezier(0.2, 0, 0, 1), background-color 120ms cubic-bezier(0.2, 0, 0, 1), box-shadow 120ms cubic-bezier(0.2, 0, 0, 1); }
      @media (prefers-reduced-motion: reduce) { .bar button, .bar select, .bar .dim, .menu button, .hint { transition: none; } }
      .hidden { display: none !important; }
    </style>
    <div class="bar hidden">
      <div class="side left">
      <button class="mode layers" role="switch" aria-checked="false" aria-label="Left panel" title="Show or hide the left panel — pages, layers, components, assets (Alt+L)">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><rect class="pane" x="2.7" y="3.2" width="3.3" height="9.6" rx="0.6" stroke="none"/><rect x="2" y="2.5" width="12" height="11" rx="1.8"/><path d="M6.5 2.5v11"/></svg>
      </button>
      <div class="modes" role="group" aria-label="Mode">
        <button class="mode preview" role="switch" aria-checked="false" title="Preview — use the page as a visitor would: links, buttons, scrolling. P, or click again to go back to selecting">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M5 3.5v9l7.5-4.5z"/></svg><span class="label">Preview</span>
        </button>
        <button class="mode comment" role="switch" aria-checked="false" title="Comment — mark something up for the agent. C, or click again to go back to selecting">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2.5 4.5a2 2 0 012-2h7a2 2 0 012 2v5a2 2 0 01-2 2H7l-3 2.5V11.5h-.5a2 2 0 01-2-2z"/></svg><span class="label">Comment</span>
        </button>
      </div>
      </div>
      <div class="middle">
      <span class="host"></span>
      <div class="device" role="group" aria-label="Frame">
        <div class="kinds" role="radiogroup" aria-label="Device"><button class="kind" data-kind="desktop" role="radio" aria-checked="false" aria-label="Desktop" title="Desktop — click again to go back to the window"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.5" y="2.5" width="13" height="8.5" rx="1.2"/><path d="M8 11v2.5M5.5 13.5h5"/></svg></button><button class="kind" data-kind="laptop" role="radio" aria-checked="false" aria-label="Laptop" title="Laptop — click again to go back to the window"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="3" width="10" height="7" rx="1"/><path d="M1.5 12.5h13"/></svg></button><button class="kind" data-kind="tablet" role="radio" aria-checked="false" aria-label="Tablet" title="Tablet — click again to go back to the window"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="1.5" width="10" height="13" rx="1.5"/><path d="M7.5 12.5h1"/></svg></button><button class="kind" data-kind="phone" role="radio" aria-checked="false" aria-label="Phone" title="Phone — click again to go back to the window"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="4.5" y="1.5" width="7" height="13" rx="1.5"/><path d="M7.5 12.5h1"/></svg></button></div>
        <select class="frame" aria-label="Frame" title="The frame the page is shown in"></select>
        <label class="dim" title="Width the page's media queries see"><span>W</span><input class="w" inputmode="numeric" aria-label="Frame width" /><i>px</i></label>
        <label class="dim" title="Height the page's media queries see"><span>H</span><input class="h" inputmode="numeric" aria-label="Frame height" /><i>px</i></label>
        <span class="scale hidden"></span>
      </div>
      </div>
      <div class="side right">
      <button class="reset hidden" title="Take back every override — variables, colours, scale, element edits, the agent's preview — the dark preview, the viewport preset and the selection. Notes stay.">Reset<span></span></button>
      <div class="agent hidden" title="Your agent is previewing a stylesheet on this page; the dashed outlines are what it reaches. A preview, not a change: it never enters the brief."><i></i>Agent preview<span></span><button title="Take the agent's preview off the page" aria-label="Take the agent's preview off the page"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M3 3l6 6M9 3 3 9"/></svg></button></div>
      <div class="modes scheme" role="radiogroup" aria-label="Colour scheme" title="Preview the page in the system's light or dark values">
        <button class="mode light" role="radio" aria-checked="false">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="3"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/></svg><span class="label">Light</span>
        </button>
        <button class="mode system" role="radio" aria-checked="false" title="As the system prefers">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="5.5"/><path d="M8 2.5v11a5.5 5.5 0 0 0 0-11z" fill="currentColor" stroke="none"/></svg><span class="label">Auto</span>
        </button>
        <button class="mode dark" role="radio" aria-checked="false">
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M9.5 1.5a6.5 6.5 0 1 0 5 10.2A6 6 0 0 1 9.5 1.5z"/></svg><span class="label">Dark</span>
        </button>
      </div>
      </div>
    </div>
    <div class="hint hidden"></div>
    <div class="composer hidden"></div>
    <div class="menu hidden" role="menu" aria-label="Selection"></div>
    <div class="sheet hidden" role="dialog" aria-label="Keyboard shortcuts"></div>
    <div class="drop hidden"></div>
    <div class="box sel hidden"></div>
    <div class="box hov hidden"></div>
    <div class="size hidden"></div>
    <div class="measure"></div>
    <div class="pins"></div>
    <div class="marquee hidden"></div>
    <div class="picks"></div>
`;
  document.documentElement.appendChild(host);

  const selBox = shadow.querySelector<HTMLElement>('.box.sel')!;
  const hovBox = shadow.querySelector<HTMLElement>('.box.hov')!;
  const sizeLabel = shadow.querySelector<HTMLElement>('.size')!;
  const measureLayer = shadow.querySelector<HTMLElement>('.measure')!;
  const pinLayer = shadow.querySelector<HTMLElement>('.pins')!;
  const marquee = shadow.querySelector<HTMLElement>('.marquee')!;
  const pickLayer = shadow.querySelector<HTMLElement>('.picks')!;

  const bar = shadow.querySelector<HTMLElement>('.bar')!;
  const barHost = bar.querySelector<HTMLElement>('.host')!;
  const barKinds = Array.from(bar.querySelectorAll<HTMLButtonElement>('.kind'));
  const barFrame = bar.querySelector<HTMLSelectElement>('.frame')!;
  const barW = bar.querySelector<HTMLInputElement>('.dim .w')!;
  const barH = bar.querySelector<HTMLInputElement>('.dim .h')!;
  const barScale = bar.querySelector<HTMLElement>('.scale')!;
  const barPreview = bar.querySelector<HTMLButtonElement>('.mode.preview')!;
  const barLayers = bar.querySelector<HTMLButtonElement>('.mode.layers')!;
  const barComment = bar.querySelector<HTMLButtonElement>('.mode.comment')!;
  const barLight = bar.querySelector<HTMLButtonElement>('.mode.light')!;
  const barReset = bar.querySelector<HTMLButtonElement>('.reset')!;
  const barAgent = bar.querySelector<HTMLElement>('.agent')!;
  const barDark = bar.querySelector<HTMLButtonElement>('.mode.dark')!;
  const barSystem = bar.querySelector<HTMLButtonElement>('.mode.system')!;
  const hint = shadow.querySelector<HTMLElement>('.hint')!;
  const composer = shadow.querySelector<HTMLElement>('.composer')!;
  const menu = shadow.querySelector<HTMLElement>('.menu')!;
  const sheet = shadow.querySelector<HTMLElement>('.sheet')!;
  const dropLine = shadow.querySelector<HTMLElement>('.drop')!;

  let selected: Element | null = null;
  let hovered: Element | null = null;
  let hoverOn = false;
  let measuring = false;
  /** Alt held: measure for as long as it is down, as Figma does, without the switch. */
  let altHeld = false;
  let pins: Pin[] = [];
  let barOn = false;
  // Whether the rail is showing. The panel is the truth; the bar echoes it,
  // and asks for the change rather than making it.
  let railOn = false;
  let noteOn = false;
  /** Which way the bar's Light/Dark switch sits; the panel owns the truth. */
  /** Which side of the page's theme is forced; neither is the page as it stands. */
  let barScheme: 'light' | 'dark' | 'system' = 'system';
  /** How many overrides the panel holds; the bar only shows Reset when there are some. */
  let resettable = 0;
  /** What the connected agent is previewing, for the chip; null when nothing. */
  let agent: AgentPresence | null = null;
  /** How the dark preview is being shown, as the panel last said. */
  let darkVia: 'site' | 'mirror' | null = null;
  /** The frame the page is being shown in; null when it is at the window's own size. */
  let frame: Frame | null = null;
  /** How far the frame is scaled down to fit the tab. */
  let scale = 1;
  /** Bumped by every frame change, so a restore that was already asking stands down. */
  let frameTurn = 0;
  /**
   * Draws the frame on this page. The tab keeps its size; the page is
   * narrowed inside it and its media queries answer to the frame.
   */
  const pageFrame = createPageFrame(document, () => {
    // The tab got wider or narrower, so the fit changed.
    scale = pageFrame.zoom;
    if (barOn) renderBar();
    layout();
  });
  /**
   * The room the page has between the rail and the panel, when no device
   * frame is chosen. Chrome's side panel narrowed the tab itself, so the
   * page's media queries saw the width it really had; a panel drawn in the
   * page does not, and a responsive page laid its desktop layout into a
   * column half as wide. So the page is shown in a frame the size of the
   * room — the same machinery as a device frame, at zoom 1 — and its media
   * queries answer to the width it has. Not remembered: it is the window.
   */
  let room: { width: number; height: number } | null = null;
  const fitRoom = () => {
    if (frame) return;
    const width = Math.round(availableWidth(document));
    const height = Math.round(innerHeight - (barOn ? BAR_HEIGHT : 0));
    if (width >= Math.round(innerWidth) - 1) {
      if (room) {
        room = null;
        pageFrame.clear();
        scale = 1;
      }
    } else if (!room || room.width !== width || room.height !== height) {
      room = { width, height };
      scale = pageFrame.set({ ...room, fill: true });
    } else return;
    if (barOn) renderBar();
    layout();
  };
  // The rail and the panel push the root with its inline margins; a change
  // there is a column shown, hidden or dragged, and the room with it.
  const roomWatch = new MutationObserver(() => fitRoom());
  roomWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  addEventListener('resize', fitRoom);

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

  const announce = () => {
    const props = selected ? readProps(selected) : null;
    send({ type: 'element-selected', data: props });
    // The rail listens here, in the same page, rather than through the panel.
    document.dispatchEvent(new CustomEvent(SELECTED_EVENT, { detail: props?.selector ?? null }));
  };

  const select = (el: Element | null) => {
    if (el && (isOurs(el) || el === document.documentElement)) return;
    // The state class belongs to the element it was put on, not to the next.
    holdState(null);
    selected = el;
    closeMenu();
    layout();
    announce();
  };

  /**
   * Hold the selection in a state, by putting a class on it.
   *
   * The page's own `:hover` rules are re-emitted against this class by the
   * re-skin script, so the element paints as though the pointer were on it
   * without the debugger permission and its permanent infobar. Only one
   * element is ever held, and only one state at a time.
   */
  let heldState: string | null = null;
  const holdState = (cls: string | null) => {
    if (heldState && selected) selected.classList.remove(heldState);
    // A re-render may have replaced the node; take the class off anything
    // still wearing it rather than leaving the page stuck in a state.
    if (heldState) for (const el of Array.from(document.querySelectorAll(`.${heldState}`))) el.classList.remove(heldState);
    heldState = cls;
    if (cls && selected) selected.classList.add(cls);
  };

  const walk = (dir: 'parent' | 'child' | 'next' | 'prev') => {
    if (!selected) return;
    const next = neighbour(selected, dir, isOurs);
    if (next) select(next);
  };

  /* ----- painting ----- */

  const drawMeasure = () => {
    measureLayer.replaceChildren();
    if (!(measuring || altHeld) || !selected || !hovered || hovered === selected) return;
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
        const r = rectOf(selected);
        place(selBox, r);
        // The size under the box, as a design tool labels a selection; above
        // it when the box runs off the bottom of the viewport.
        sizeLabel.classList.remove('hidden');
        sizeLabel.textContent = `${Math.round(r.width)} × ${Math.round(r.height)}`;
        const at = placeSizeLabel(r, { width: innerWidth, height: innerHeight }, barOn ? BAR_HEIGHT + 4 : 4);
        Object.assign(sizeLabel.style, { left: `${at.left}px`, top: `${at.top}px` });
      } else {
        selBox.classList.add('hidden');
        sizeLabel.classList.add('hidden');
        closeMenu();
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
  };

  const onMove = (e: MouseEvent) => {
    if (moving) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    // Over our own bar or pins: drop the highlight so a click there is a click there.
    if (el && isOurs(el)) {
      if (hovered) clearHover();
      return;
    }
    if (!el || el === document.documentElement || el === hovered) return;
    hovered = el;
    // The outline says what a click will hit, and that is all it says: what
    // the element is made of is on the edit card and in the panel once it is
    // picked, and a readout here said the same things a third time.
    hovBox.classList.remove('hidden');
    place(hovBox, rectOf(el));
    // Alt read off the pointer as well as the key: a key pressed while
    // another window had focus is never heard.
    altHeld = e.altKey && hoverOn;
    if ((measuring || altHeld) && selected) drawMeasure();
  };

  const onClick = (e: MouseEvent) => {
    if (e.composedPath().includes(host) || throughRail(e)) return;
    // A drag that just ended is not a click.
    if (swallowClick) {
      swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (!hovered) return;
    e.preventDefault();
    e.stopPropagation();
    // The selection clicked again lets go of it, as a toggle reads.
    select(hovered === selected ? null : hovered);
  };

  /* ----- dragging the selection, anywhere on the page ----- */

  /**
   * Press on the selection and drag, and it moves wherever it is let go, as
   * a layer does on a design tool's canvas and in the rail: over the edge of
   * a box it goes beside that box, over the middle of one that can take it
   * in it goes inside, among that box's own children. The box it would join
   * is outlined and a line says where in it. The drop is the rail's own move
   * — a change in the log, undone the same way, applied as a real DOM move
   * (a framework may put it back on its next render).
   *
   * Siblings only, at first; Hendri asked for into as well (W38), since the
   * rail already allowed it and the page not doing the same read as broken.
   */
  let swallowClick = false;
  let press: { x: number; y: number } | null = null;
  /**
   * `home` is where it sits now; `into` is the box it would land in, with
   * `before` the child it would go before (null: last). `before` undefined
   * means no move: over itself, or back where it already is.
   */
  let moving: { home: Element; into: Element | null; before: Element | null | undefined } | null = null;
  const ids = new WeakMap<Element, number>();
  let nextId = 1;
  const idOf = (el: Element) => {
    let id = ids.get(el);
    if (id === undefined) ids.set(el, (id = nextId++));
    return id;
  };
  const nodeOf = (el: Element) => {
    const { selector } = buildSelector(el);
    return { id: idOf(el), selector, stable: !selector.includes('nth-of-type'), tag: el.tagName.toLowerCase() };
  };
  const shown = (el: Element) => {
    if (isOurs(el)) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  };
  /** Children laid out across (flex rows, grids) read left to right; the rest top to bottom. */
  const across = (parent: Element) => {
    const cs = getComputedStyle(parent);
    if (/grid/.test(cs.display)) return true;
    return /flex/.test(cs.display) && !cs.flexDirection.startsWith('column');
  };

  /** A box's children as they are laid out, without the one in hand and without Codename's own. */
  const kidsOf = (box: Element) => Array.from(box.children).filter((c) => c !== selected && shown(c));
  /** The next shown sibling of `el` that is not the one in hand, or null. */
  const nextOf = (el: Element) => {
    for (let n = el.nextElementSibling; n; n = n.nextElementSibling) if (n !== selected && shown(n)) return n;
    return null;
  };
  /** Whether `box` is the one in hand or inside it: nothing lands in itself. */
  const inHand = (box: Element) => !!selected && (box === selected || selected.contains(box));

  /** Where a drop at (x, y) would put the selection: the box it joins, and the child it goes before. */
  const aim = (x: number, y: number): { into: Element | null; before: Element | null | undefined } => {
    if (!selected) return { into: null, before: undefined };
    // The one in hand ignores the pointer while it is lifted, so this is what is under it.
    let over = document.elementFromPoint(x, y);
    while (over && (isOurs(over) || inHand(over) || !shown(over))) over = over.parentElement;
    if (!over || over === document.documentElement) over = document.body;
    const parent = over === document.body ? null : over.parentElement;
    const zone = parent ? dropZone(over.getBoundingClientRect(), x, y, across(parent), takesChildren(over.tagName)) : 'into';

    let into: Element;
    let before: Element | null;
    if (zone === 'into') {
      into = over;
      const kids = kidsOf(over);
      const at = dropIndex(kids.map((k) => k.getBoundingClientRect()), x, y, across(over));
      before = at === null ? null : kids[at]!;
    } else {
      into = parent!;
      before = zone === 'before' ? over : nextOf(over);
    }
    if (inHand(into)) return { into: null, before: undefined };
    // Back where it already is is not a move.
    if (into === selected.parentElement && before === nextOf(selected)) return { into, before: undefined };
    return { into, before };
  };

  const drawDrop = () => {
    const into = moving?.into;
    if (!moving || !into || moving.before === undefined) {
      dropLine.classList.add('hidden');
      hovBox.classList.add('hidden');
      return;
    }
    // The box it would join, outlined, unless that is just where it already lives.
    if (into !== moving.home) {
      hovBox.classList.remove('hidden');
      place(hovBox, rectOf(into));
    } else hovBox.classList.add('hidden');

    const { before } = moving;
    const horizontal = across(into);
    const kids = kidsOf(into);
    const ref = before ?? kids[kids.length - 1] ?? null;
    let line: { left: number; top: number; width: number; height: number };
    if (!ref) {
      // An empty box: the line runs along its inside top.
      const r = into.getBoundingClientRect();
      line = { left: r.left + 6, top: r.top + 6, width: Math.max(0, r.width - 12), height: 3 };
    } else {
      const r = ref.getBoundingClientRect();
      const at = before ? (horizontal ? r.left : r.top) : horizontal ? r.right : r.bottom;
      line = horizontal ? { left: at - 1.5, top: r.top, width: 3, height: r.height } : { left: r.left, top: at - 1.5, width: r.width, height: 3 };
    }
    Object.assign(dropLine.style, { left: `${line.left}px`, top: `${line.top}px`, width: `${line.width}px`, height: `${line.height}px` });
    dropLine.classList.remove('hidden');
  };

  /**
   * The element in hand, lifted: it follows the pointer while its slot stays
   * where it was, so the drag feels like carrying it rather than aiming a
   * line. Only inline styles the move itself set, and each put back exactly
   * as it was found; `translate` is its own property, so a transform the
   * page set is left to compose with it.
   */
  let lifted: { el: HTMLElement | SVGElement; was: Record<'translate' | 'position' | 'zIndex' | 'opacity' | 'transition' | 'pointerEvents' | 'boxShadow', string> } | null = null;
  const lift = (el: Element) => {
    // A drop still waiting to land is set down first, so what is kept as
    // "how it was" is never the lifted look itself.
    if (lifted) {
      window.clearTimeout(landingTimer);
      setDown();
    }
    if (!(el instanceof HTMLElement || el instanceof SVGElement)) return;
    const st = el.style;
    lifted = {
      el,
      was: { translate: st.translate, position: st.position, zIndex: st.zIndex, opacity: st.opacity, transition: st.transition, pointerEvents: st.pointerEvents, boxShadow: st.boxShadow },
    };
    // Above its siblings, under Codename's own chrome.
    if (getComputedStyle(el).position === 'static') st.position = 'relative';
    st.zIndex = '2147483000';
    st.opacity = '0.9';
    // Lifted off the page, as a held layer is drawn in a design tool.
    st.boxShadow = '0 10px 28px rgba(0, 0, 0, 0.22), 0 2px 6px rgba(0, 0, 0, 0.12)';
    st.transition = 'none';
    st.pointerEvents = 'none';
  };
  const follow = (dx: number, dy: number) => {
    if (!lifted) return;
    lifted.el.style.translate = `${dx}px ${dy}px`;
    layout();
  };
  const setDown = () => {
    if (!lifted) return;
    Object.assign(lifted.el.style, lifted.was);
    lifted = null;
    layout();
  };

  /** Set when a drop was sent: the element stays in hand until the move lands, so it never flashes home first. */
  let landingTimer = 0;
  const endMove = (keepLifted = false) => {
    window.clearTimeout(landingTimer);
    if (keepLifted && lifted) landingTimer = window.setTimeout(setDown, 800);
    else setDown();
    moving = null;
    press = null;
    dropLine.classList.add('hidden');
    hovBox.classList.add('hidden');
    selBox.classList.remove('moving');
  };

  const onPressDown = (e: PointerEvent) => {
    if (e.button !== 0 || !selected?.isConnected) return;
    if (e.composedPath().includes(host) || throughRail(e)) return;
    const target = e.target as Element | null;
    if (!target || !selected.contains(target)) return;
    press = { x: e.clientX, y: e.clientY };
  };

  const onPressMove = (e: PointerEvent) => {
    if (!press || !selected) return;
    if (!moving) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_MIN) return;
      const home = selected.parentElement;
      // The page's own root boxes stay where they are.
      if (!home || home === document.documentElement || selected === document.body) {
        press = null;
        return;
      }
      moving = { home, into: null, before: undefined };
      selBox.classList.add('moving');
      clearHover();
      lift(selected);
    }
    e.preventDefault();
    follow(e.clientX - press.x, e.clientY - press.y);
    const aimed = aim(e.clientX, e.clientY);
    moving.into = aimed.into;
    moving.before = aimed.before;
    drawDrop();
  };

  const onPressUp = () => {
    if (moving && selected) {
      const { home, into, before } = moving;
      if (into && before !== undefined) {
        const wasBefore = nextOf(selected);
        // The rail's message, so the panel files it exactly as a drag there.
        send({
          type: 'rail-move',
          node: nodeOf(selected),
          parent: nodeOf(into),
          before: before ? nodeOf(before) : null,
          wasIn: nodeOf(home),
          wasBefore: wasBefore ? nodeOf(wasBefore) : null,
        });
      }
      swallowClick = true;
      // A click only follows when the pointer comes up where it went down.
      setTimeout(() => (swallowClick = false), 0);
      // A real drop: held where it was let go until the panel's move puts it
      // in its new place, and set down in the same frame (or after a moment,
      // if the panel never answers).
      endMove(!!into && before !== undefined);
      return;
    }
    endMove();
  };

  // A press on the selection is a move in the making, not a text selection.
  const onSelectStart = (e: Event) => {
    if (press) e.preventDefault();
  };

  // Links and images start the browser's own drag; in Select, the drag is ours.
  const onNativeDrag = (e: DragEvent) => {
    if (!e.composedPath().includes(host)) e.preventDefault();
  };

  const setHover = (on: boolean) => {
    if (on === hoverOn) return;
    hoverOn = on;
    if (on) {
      if (noteOn) setNote(false);
      addEventListener('mousemove', onMove, true);
      addEventListener('click', onClick, true);
      addEventListener('contextmenu', onContextMenu, true);
      addEventListener('pointerdown', onPressDown, true);
      addEventListener('pointermove', onPressMove, true);
      addEventListener('pointerup', onPressUp, true);
      addEventListener('dragstart', onNativeDrag, true);
      addEventListener('selectstart', onSelectStart, true);
      addEventListener('pointerdown', onAway);
      addEventListener('scroll', closeMenu, true);
      addEventListener('resize', closeMenu);
    } else {
      removeEventListener('mousemove', onMove, true);
      removeEventListener('click', onClick, true);
      removeEventListener('contextmenu', onContextMenu, true);
      removeEventListener('pointerdown', onPressDown, true);
      removeEventListener('pointermove', onPressMove, true);
      removeEventListener('pointerup', onPressUp, true);
      removeEventListener('dragstart', onNativeDrag, true);
      removeEventListener('selectstart', onSelectStart, true);
      endMove();
      removeEventListener('pointerdown', onAway);
      removeEventListener('scroll', closeMenu, true);
      removeEventListener('resize', closeMenu);
      closeMenu();
      clearHover();
      drawMeasure();
    }
    // No hint for a mode: the lit button says it, and Hendri found the
    // sentences under the bar more noise than help (W38).
    if (barOn) {
      renderBar();
      showHint(null);
    }
  };

  /* ----- reorders: a real move in the DOM, put back before it is redone ----- */

  /**
   * Where each moved element came from, so the whole set can be restored and
   * re-applied from the log as one declarative state, the way rules are.
   * A framework that owns this DOM may put things back on its next render;
   * that is why a move is a preview here and a sentence in the brief.
   */
  const movedFrom = new Map<Element, { parent: Node; next: Node | null }>();

  const applyMoves = (moves: { selector: string; parent: string; before: string | null }[]) => {
    for (const [el, origin] of Array.from(movedFrom).reverse()) {
      if (el.isConnected && origin.parent instanceof Element && origin.parent.isConnected) {
        origin.parent.insertBefore(el, origin.next && origin.next.parentNode === origin.parent ? origin.next : null);
      }
    }
    movedFrom.clear();
    for (const m of moves) {
      const el = find(m.selector);
      const parent = find(m.parent);
      if (!el || !parent || el === parent || el.contains(parent)) continue;
      const before = m.before ? find(m.before) : null;
      if (before && before.parentNode !== parent) continue;
      if (!movedFrom.has(el) && el.parentNode) movedFrom.set(el, { parent: el.parentNode, next: el.nextSibling });
      parent.insertBefore(el, before);
    }
  };

  /* ----- the edit card: the selection's most-reached-for values, on the page ----- */

  /** Where the card was dragged to, if it was; otherwise it follows the element. */
  const isEnter = (e: KeyboardEvent) => e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter';

  /* ----- the right-click menu ----- */

  /**
   * What can be done to the selection, where it is. Every item is something
   * Codename already does from the rail, the bar or the panel: nothing here
   * is new, only nearer. How the element looks is not in it; that is the
   * panel's, on the right, as it is in Figma and Framer.
   */
  const closeMenu = () => {
    if (menu.classList.contains('hidden')) return;
    menu.classList.add('hidden');
    menu.replaceChildren();
  };

  const openMenu = (x: number, y: number) => {
    if (!selected?.isConnected) return;
    const props = readProps(selected);
    const el = selected;
    const many = props.intent.matches > 1;
    menu.replaceChildren();

    const head = document.createElement('div');
    head.className = 'head';
    // The shared selector when there are several: shorter, and what "all" means.
    head.textContent = many ? `${props.intent.selector} ×${props.intent.matches}` : props.selector;
    head.title = props.selector;
    menu.append(head);

    const item = (label: string, run: () => void, key?: string, disabled = false) => {
      const b = document.createElement('button');
      b.setAttribute('role', 'menuitem');
      b.textContent = label;
      b.disabled = disabled;
      if (key) {
        const k = document.createElement('kbd');
        k.textContent = key;
        b.append(k);
      }
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        closeMenu();
        run();
      });
      menu.append(b);
    };
    const rule = () => menu.append(document.createElement('hr'));

    const parent = el.parentElement;
    item('Select parent', () => walk('parent'), '↑', !parent || parent === document.documentElement);
    item('Select child', () => walk('child'), '↓', !el.firstElementChild);
    rule();
    if (many) {
      // The scope switch in the panel, from here: an edit then reaches them all.
      item(`Edit all ${props.intent.matches} matching`, () => send({ type: 'rail-scope', scope: 'all' }));
    }
    // The rail's eye: a display edit in the log, undone the same way.
    item('Hide', () => send({ type: 'rail-hide', node: { selector: props.selector, stable: props.stable, display: props.box.display } }));
    item('Add a note…', () => {
      const sel = buildSelector(el);
      emitTarget({ kind: 'element', selector: sel.selector, matches: sel.matches }, rectOf(el));
    });
    item('Copy selector', () => void navigator.clipboard.writeText(many ? props.intent.selector : props.selector).catch(() => {}));
    rule();
    item('Show in panel', () => send({ type: 'panel-focus' }));
    item('Deselect', () => select(null), 'Esc');

    menu.classList.remove('hidden');
    const at = placeMenu(
      { x, y },
      { width: menu.offsetWidth || 208, height: menu.offsetHeight || 220 },
      { width: innerWidth, height: innerHeight },
      barOn ? BAR_HEIGHT + 4 : 4,
    );
    Object.assign(menu.style, { left: `${at.left}px`, top: `${at.top}px` });
    // Focus the first item a frame later: the selection this opened with
    // is announced to the rail in the same turn, and anything that takes
    // focus there would take it back from the menu.
    setTimeout(() => menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true }), 0);
  };

  // Keys inside the menu stay in the menu: arrows move, Escape closes it
  // rather than letting go of the selection.
  menu.addEventListener('keydown', (e) => {
    e.stopPropagation();
    const items = [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const at = items.indexOf(shadow.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length];
      next?.focus();
    }
  });

  /**
   * Right-click on the page while Select is on: pick what is under the
   * pointer and offer what can be done to it. Alt keeps the browser's own
   * menu, so inspecting the page the usual way is one key away.
   */
  const onContextMenu = (e: MouseEvent) => {
    if (e.altKey || e.composedPath().includes(host) || throughRail(e)) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isOurs(el) || el === document.documentElement) return;
    e.preventDefault();
    e.stopPropagation();
    if (el !== selected) select(el);
    openMenu(e.clientX, e.clientY);
  };
  // A press anywhere else closes it, as a menu does. The menu sits in a
  // closed shadow root, so a listener on the window cannot see that a press
  // landed inside it; the menu stops its own presses before they bubble out.
  const onAway = () => closeMenu();
  menu.addEventListener('pointerdown', (e) => e.stopPropagation());

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
    // Clear of the size label when the note is about the selection, which
    // sits in the 22px under (or over) the box.
    const gap = selected ? 28 : 8;
    const below = anchor.y + anchor.height + gap;
    const clear = BAR_HEIGHT + 8;
    const top = below + h <= innerHeight - 8 ? below : Math.max(clear, anchor.y - h - gap);
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

    // A drag is a region: it can cover empty space that no element owns.
    const region = regionFrom(start, { x: e.clientX, y: e.clientY });
    if (region) {
      const { x, y, width: w, height: h } = region;
      const centre = document.elementFromPoint(x + w / 2, y + h / 2);
      const within = centre && !isOurs(centre) ? buildSelector(centre).intent.selector : undefined;
      emitTarget({ kind: 'region', rect: { x: x + scrollX, y: y + scrollY, width: w, height: h }, within }, region);
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
      showHint(null);
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

  /**
   * Selecting is where Codename is: on whenever the bar is, and where Preview
   * and Comment come back to. It has no button of its own — Hendri found a
   * third button for the state you are already in one too many — so Preview
   * and Comment are switches, and turning the lit one off is how you get
   * back. Preview is the page left alone, to be used as a visitor would;
   * Comment marks it up.
   */
  type Mode = 'select' | 'preview' | 'comment';
  const setMode = (mode: Mode) => {
    if (mode === 'comment') setNote(true);
    else {
      if (noteOn) setNote(false);
      setHover(mode === 'select');
    }
  };
  /** A mode's button pressed again, or Escape: back to Select. */
  const toggleMode = (mode: Mode) => setMode(mode === 'select' || modeNow() === mode ? 'select' : mode);
  const modeNow = (): Mode => (noteOn ? 'comment' : hoverOn ? 'select' : 'preview');

  /* ----- the bar ----- */


  const renderBar = () => {
    barHost.textContent = location.host;
    renderDevice();
    const previewing = !hoverOn && !noteOn;
    barPreview.classList.toggle('on', previewing);
    barPreview.setAttribute('aria-checked', String(previewing));
    barLayers.classList.toggle('on', railOn);
    barLayers.setAttribute('aria-checked', String(railOn));
    barComment.classList.toggle('on', noteOn);
    barComment.setAttribute('aria-checked', String(noteOn));
    barLight.classList.toggle('on', barScheme === 'light');
    barLight.setAttribute('aria-checked', String(barScheme === 'light'));
    barDark.classList.toggle('on', barScheme === 'dark');
    barDark.setAttribute('aria-checked', String(barScheme === 'dark'));
    // The middle is a position of its own, drawn like the other two.
    barSystem.classList.toggle('on', barScheme === 'system');
    barSystem.setAttribute('aria-checked', String(barScheme === 'system'));
    // A resized or zoomed viewport is an override too, and only the bar knows about it.
    barReset.classList.toggle('hidden', resettable === 0 && !frame);
    barReset.querySelector('span')!.textContent = resettable > 0 ? String(resettable) : '';
    barAgent.classList.toggle('hidden', !agent);
    if (agent) {
      barAgent.querySelector('span')!.textContent = `· ${agent.rules} ${agent.rules === 1 ? 'rule' : 'rules'} · ${agent.matched} ${agent.matched === 1 ? 'element' : 'elements'}`;
    }
  };

  /**
   * Put back the frame this tab was left in. A reload or a navigation starts
   * a fresh page with no frame drawn, and the background remembers which one
   * it was.
   */
  const restoreFrame = async () => {
    if (frame) return;
    const asked = frameTurn;
    const r = await ask<{ ok: boolean; frame?: Frame | null }>({ type: 'frame-state' });
    // A frame picked or taken off while this was asking is the newer word.
    if (r?.ok && r.frame && !frame && asked === frameTurn) void setFrame(r.frame, true);
  };

  /**
   * The device picker: which kind, which frame, and its size.
   *
   * With no frame the fields show the window's own size, so typing a
   * width is how you start; the kind lit up is the frame's, and clicking it
   * again goes back to the window. Fields that are being typed in are left
   * alone, or a re-render would take the digits out from under the cursor.
   */
  const renderDevice = () => {
    for (const b of barKinds) {
      const on = frame?.kind === b.dataset.kind;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    }
    const value = frame ? (frame.name ?? 'custom') : 'window';
    if (barFrame.dataset.for !== `${value}:${frame?.kind ?? ''}`) {
      barFrame.dataset.for = `${value}:${frame?.kind ?? ''}`;
      barFrame.replaceChildren();
      const option = (v: string, label: string) => {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = label;
        return o;
      };
      barFrame.appendChild(option('window', 'Window'));
      for (const kind of DEVICE_KINDS) {
        const group = document.createElement('optgroup');
        group.label = kind[0]!.toUpperCase() + kind.slice(1);
        // The name only: W and H beside it already say the size, and repeating
        // it here truncated the closed menu to "Mobile S · 375 ×".
        for (const preset of presetsOf(kind)) group.appendChild(option(preset.name, preset.name));
        barFrame.appendChild(group);
      }
      if (frame && !frame.name) barFrame.appendChild(option('custom', 'Custom'));
    }
    barFrame.value = value;
    const root = shadow as unknown as { activeElement: Element | null };
    if (root.activeElement !== barW) barW.value = String(frame?.width ?? room?.width ?? Math.round(innerWidth));
    if (root.activeElement !== barH) barH.value = String(frame?.height ?? room?.height ?? Math.round(innerHeight));
    barScale.classList.toggle('hidden', scale === 1);
    barScale.textContent = `${Math.round(scale * 100)}%`;
    barScale.title = `Shown at ${Math.round(scale * 100)}% to fit the tab; the page's media queries see the full ${frame?.width ?? ''} × ${frame?.height ?? ''}.`;
    bar.querySelector<HTMLElement>('.device')!.title = viewportLabel(frame, { width: innerWidth, height: innerHeight }, scale);
  };

  const applyBarTheme = (theme: OverlayTheme) => {
    const t = OVERLAY[theme];
    host.style.setProperty('--cn-accent', t.accent);
    host.style.setProperty('--cn-wash', t.accentWash);
    host.style.setProperty('--cn-bg', t.cardBg);
    host.style.setProperty('--cn-ink', t.cardInk);
    host.style.setProperty('--cn-muted', t.cardMuted);
    host.style.setProperty('--cn-line', t.cardLine);
    host.style.setProperty('--cn-app', t.chromeBg);
    host.style.setProperty('--cn-field', t.field);
    host.style.setProperty('--cn-field-hover', t.fieldHover);
    host.style.setProperty('--cn-thumb', t.thumb);
  };

  /**
   * What the mode you just chose actually does, for a few seconds.
   * Permanent would be clutter; never is how you end up with three switches
   * nobody can explain.
   */
  let hintTimer = 0;
  let pointTimer = 0;
  const showHint = (html: string | null) => {
    window.clearTimeout(hintTimer);
    if (!html) {
      hint.classList.add('hidden');
      return;
    }
    hint.innerHTML = html;
    hint.classList.remove('hidden', 'fading');
    // Under the tools, which are what it is explaining.
    hint.style.left = `${Math.max(8, bar.getBoundingClientRect().left + 8)}px`;
    hint.style.right = 'auto';
    hintTimer = window.setTimeout(() => {
      hint.classList.add('fading');
      hintTimer = window.setTimeout(() => hint.classList.add('hidden'), 300);
    }, 4200);
  };


  /**
   * Show the page as a frame of a given size.
   *
   * Drawn in the page rather than by resizing or emulating: the window stays
   * where the person put it, the page is centred in the tab, its media
   * queries answer to the frame, and a frame too big for the tab is scaled
   * down to fit — which the bar says, so a breakpoint check is never a guess
   * about what is on screen.
   */
  const setFrame = async (size: { width: number; height: number }, quiet = false) => {
    frameTurn++;
    frame = frameFor(size);
    room = null;
    scale = pageFrame.set(frame);
    renderBar();
    layout();
    // Remembered so a reload comes back in it; the frame is on either way.
    void ask({ type: 'frame-set', width: frame.width, height: frame.height });
    if (!quiet) {
      const name = escapeHtml(frame.name ?? 'Custom');
      const size = `${frame.width} × ${frame.height}`;
      const unread = pageFrame.unreadable
        ? ` ${pageFrame.unreadable} ${pageFrame.unreadable === 1 ? 'stylesheet' : 'stylesheets'} from another site could not be read, so their breakpoints still follow the window.`
        : '';
      showHint(
        (scale === 1
          ? `<b>${name}</b> — the page is ${size}, as its media queries see it. The window has not moved.`
          : `<b>${name}</b> — shown at ${Math.round(scale * 100)}% to fit the tab; the page is still ${size} as its media queries see it.`) + unread,
      );
    }
    return true;
  };

  const resetViewport = async (quiet = false) => {
    const had = frame !== null;
    frameTurn++;
    pageFrame.clear();
    frame = null;
    scale = 1;
    // Back to the window, which beside the columns is the room they leave.
    fitRoom();
    if (barOn) renderBar();
    layout();
    void ask({ type: 'frame-clear' });
    if (!quiet && had)
      showHint(
        room
          ? `<b>Window</b> — the page fills the ${room.width}px between the rail and the panel again, and its media queries see that width.`
          : '<b>Window</b> — the page is at the window\'s own size again.',
      );
    return true;
  };

  /** Set by Escape, so the blur that follows puts the size back instead of taking it. */
  let cancelSize = false;

  /** A size typed into W or H, taken when the field is left. */
  const commitSize = () => {
    if (cancelSize) {
      cancelSize = false;
      return;
    }
    const width = parseInt(barW.value, 10);
    const height = parseInt(barH.value, 10);
    const current = frame ?? { width: Math.round(innerWidth), height: Math.round(innerHeight) };
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      renderBar();
      return;
    }
    if (frame && width === current.width && height === current.height) return;
    if (!frame && width === current.width && height === current.height) return;
    // A typed size gets the kind its width implies, and its preset's name if it is one.
    void setFrame(frameFor({ width, height }));
  };

  /**
   * The bar takes its strip from the page rather than floating over it: the
   * root's inline margin is the one declaration nothing in a stylesheet can
   * outrank, and it is put back exactly. A header the page fixes to the top
   * of the viewport will still sit under the bar; that is stated in the
   * README rather than fought.
   */
  const pushTop = createRootPush('top');
  const pushPage = (on: boolean) => {
    if (on) {
      if (!pushTop.on) pushTop.set(BAR_HEIGHT);
    } else pushTop.clear();
  };

  const showBar = (on: boolean) => {
    barOn = on;
    bar.classList.toggle('hidden', !on);
    pushPage(on);
    fitRoom();
    if (on) {
      // Select is where the bar starts: picking things is what it is for.
      if (!noteOn) setHover(true);
      renderBar();
      void restoreFrame();
    }
    layout();
  };

  for (const b of barKinds) {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const kind = b.dataset.kind as DeviceKind;
      // The lit kind again is "back to the window", the way a toggle reads.
      if (frame?.kind === kind) void resetViewport();
      else {
        const first = presetsOf(kind)[0];
        if (first) void setFrame(first);
      }
    });
  }
  barFrame.addEventListener('change', () => {
    const v = barFrame.value;
    if (v === 'window') void resetViewport();
    else if (v !== 'custom') {
      const preset = DEVICE_KINDS.flatMap((k) => presetsOf(k)).find((p) => p.name === v);
      if (preset) void setFrame(preset);
    }
  });
  for (const input of [barW, barH]) {
    input.addEventListener('keydown', (e) => {
      // Typing in the bar is not a shortcut for anything on the page.
      e.stopPropagation();
      if (isEnter(e)) input.blur();
      if (e.key === 'Escape') {
        // Put the digits back before leaving: the render skips a focused field,
        // and the blur would otherwise take what was typed.
        cancelSize = true;
        barW.value = String(frame?.width ?? Math.round(innerWidth));
        barH.value = String(frame?.height ?? Math.round(innerHeight));
        input.blur();
      }
    });
    input.addEventListener('blur', commitSize);
    input.addEventListener('focus', () => input.select());
  }
  barPreview.addEventListener('click', () => toggleMode('preview'));
  /** Show or fold the rail: the bar flips at once and asks the panel, which holds the answer. */
  const toggleRail = () => {
    railOn = !railOn;
    renderBar();
    send({ type: 'rail-toggled', on: railOn });
  };
  barLayers.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleRail();
  });
  barComment.addEventListener('click', () => toggleMode('comment'));
  /** The lit side again is "as the system": a switch with a middle. */
  const setScheme = (scheme: 'light' | 'dark' | 'system') => {
    if (scheme === barScheme) return;
    barScheme = scheme;
    renderBar();
    send({ type: 'mode-changed', mode: scheme });
    showHint(null);
  };
  barAgent.querySelector('button')!.addEventListener('click', () => {
    agent = null;
    renderBar();
    send({ type: 'agent-clear' });
  });
  barReset.addEventListener('click', () => {
    barScheme = 'system';
    resettable = 0;
    agent = null;
    const viewport = frame !== null;
    renderBar();
    // The selection goes too, so the card and the outline leave with the overrides.
    select(null);
    // One path: the panel takes everything back and asks for the viewport too.
    send({ type: 'reset-all' });
    showHint(
      `<b>Reset</b> — every override and the dark preview are gone${viewport ? ', and the page is back at the window\'s size' : ''}; the page is reading as itself again. Notes stay.`,
    );
  });
  barLight.addEventListener('click', () => setScheme(barScheme === 'light' ? 'system' : 'light'));
  barDark.addEventListener('click', () => setScheme(barScheme === 'dark' ? 'system' : 'dark'));
  barSystem.addEventListener('click', () => setScheme('system'));
  // The window's own size is what the bar shows when there is no frame.
  addEventListener('resize', () => barOn && !frame && renderBar());

  // The panel holds a port open while it is showing this tab; when it goes,
  // the bar and hover mode go with it. The selection stays for its return.
  const onConnect = (port: chrome.runtime.Port) => {
    if (port.name !== 'codename-panel') return;
    showBar(true);
    port.onDisconnect.addListener(() => {
      showBar(false);
      setHover(false);
      setNote(false);
      // The bar is the only control for the frame, so the frame goes with it:
      // a narrowed page with nothing on it saying why would read as broken.
      void resetViewport(true);
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
    // The rail has its own keyboard: arrows walk its rows, not the DOM.
    if (throughRail(e)) return true;
    const inside = shadow.activeElement as HTMLElement | null;
    const el = inside ?? ((e.composedPath()[0] ?? e.target) as HTMLElement | null);
    return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName ?? ''));
  };

  /**
   * One level at a time: an open menu, a half-made note, then Preview or
   * Comment back to Select, then the selection. False when there was nothing to let go of.
   */
  const escape = (): boolean => {
    if (sheetOpen()) closeSheet();
    else if (moving) endMove();
    else if (!menu.classList.contains('hidden')) closeMenu();
    else if (composing) closeComposer();
    else if (picked.length) {
      picked = [];
      drawPicks();
    } else if (modeNow() !== 'select') setMode('select');
    else if (selected) select(null);
    else return false;
    return true;
  };

  /* ----- the shortcut sheet ----- */

  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const sheetOpen = () => !sheet.classList.contains('hidden');
  const closeSheet = () => sheet.classList.add('hidden');
  /** Shift+?: every key the bar answers to, drawn from the same list the command menu searches. */
  const toggleSheet = () => {
    if (sheetOpen()) return closeSheet();
    sheet.replaceChildren();
    const h = document.createElement('h2');
    h.textContent = 'Keyboard shortcuts';
    const cols = document.createElement('div');
    cols.className = 'cols';
    for (const group of shortcutSheet(isMac)) {
      const col = document.createElement('section');
      const t = document.createElement('h3');
      t.textContent = group.title;
      const dl = document.createElement('dl');
      for (const item of group.items) {
        const dt = document.createElement('dt');
        dt.textContent = item.keys;
        const dd = document.createElement('dd');
        dd.textContent = item.what;
        dl.append(dt, dd);
      }
      col.append(t, dl);
      cols.append(col);
    }
    sheet.append(h, cols);
    sheet.classList.remove('hidden');
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Alt' && altHeld) {
      altHeld = false;
      drawMeasure();
    }
  };
  const onBlurWindow = () => {
    if (!altHeld) return;
    altHeld = false;
    drawMeasure();
  };

  const onKey = (e: KeyboardEvent) => {
    if (typing(e)) return;
    if (e.key === 'Escape') {
      if (escape()) e.preventDefault();
      return;
    }
    if (e.key === 'Alt' && hoverOn && selected && !altHeld) {
      altHeld = true;
      drawMeasure();
      return;
    }
    if (barOn && e.key === '?' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      toggleSheet();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && selected) {
      e.preventDefault();
      send({ type: 'inspector-shortcut', action: e.shiftKey ? 'redo' : 'undo' });
      return;
    }
    // P and C, as a design tool's single keys: on, and off again. Only while
    // the bar is up, and never with a modifier, so the page's and the
    // browser's own shortcuts keep theirs.
    const bare = !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat;
    if (barOn && bare && (e.key === 'p' || e.key === 'P' || e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      toggleMode(e.key.toLowerCase() === 'p' ? 'preview' : 'comment');
      return;
    }
    if (!selected) return;
    // Figma's: Enter into the children, Shift+Enter out to the parent, Tab
    // along the siblings. Only while selecting, where the page's own Tab
    // order is not what anyone is using.
    if (hoverOn && bare && (e.key === 'Enter' || e.key === 'Tab')) {
      e.preventDefault();
      walk(e.key === 'Enter' ? (e.shiftKey ? 'parent' : 'child') : e.shiftKey ? 'prev' : 'next');
      return;
    }
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

  /**
   * Run a command. From the panel over `chrome.runtime`, or from the rail in
   * the same page through the handle on `window`; the answer goes to
   * `sendResponse` either way, and the return says whether it comes later.
   */
  const handle = (msg: Partial<InspectorCommand>, sendResponse: (r: unknown) => void): boolean => {
    switch (msg.cmd) {
      case 'hover':
        setHover(!!msg.on);
        break;
      case 'toggle':
        // A shortcut on a tab whose panel is closed would light the page up
        // with no bar and nobody listening; the bar is the sign of a panel.
        if (!barOn) break;
        if (msg.what === 'comment') toggleMode('comment');
        else if (msg.what === 'layers') toggleRail();
        else toggleMode('preview');
        break;
      case 'tokens':
        // The page's names for its values were for the edit card, which is
        // gone; the panel shows them now. Accepted and ignored.
        break;
      case 'select':
        select(find(msg.selector));
        break;
      case 'deselect':
        select(null);
        break;
      case 'escape':
        // Escape pressed in the rail: the same ladder as on the page.
        escape();
        break;
      case 'state':
        holdState(msg.state ? `codename-state-${msg.state}` : null);
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
        sendResponse(props);
        return true;
      }
      case 'layers':
        sendResponse(buildLayers(document.body, isOurs));
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
      case 'locate': {
        const viewport = { width: innerWidth, height: innerHeight };
        if (!msg.selector) {
          sendResponse({ ok: true, matches: 0, frame: pageFrame.rect(), viewport });
          return true;
        }
        const { first: el, matches } = findAll(msg.selector);
        if (!el) {
          sendResponse({ ok: false, matches, error: `nothing on the page matches ${msg.selector}` });
          return true;
        }
        // An instant scroll lands before the next line, whatever the page's
        // scroll-behavior says, so the box is where the capture will find it.
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        const r = el.getBoundingClientRect();
        sendResponse({
          ok: true,
          matches,
          rect: { x: r.x, y: r.y, width: r.width, height: r.height },
          frame: pageFrame.rect(),
          viewport,
        });
        return true;
      }
      case 'set-viewport': {
        // The agent or a width condition wants a size; answer once it is on,
        // so a capture can follow.
        const done = (ok: boolean, error?: string) => sendResponse({ ok, frame, scale, error });
        if (msg.preset === 'reset') {
          resetViewport(true).then((ok) => done(ok, ok ? undefined : 'the frame could not be taken off'), (e) => done(false, String(e)));
          return true;
        }
        const asked = msg.width;
        if (typeof asked === 'number' && (asked < WIDTH_RANGE.min || asked > WIDTH_RANGE.max)) {
          done(false, `a frame ${asked}px wide cannot be shown; ask for ${WIDTH_RANGE.min}–${WIDTH_RANGE.max}px`);
          return true;
        }
        // A width with no device behind it — one of the page's own
        // breakpoints — keeps the height already in play, since the thing
        // being asked for is a width.
        const size =
          typeof asked === 'number'
            ? { width: asked, height: frame?.height ?? Math.round(innerHeight) }
            : DEVICE_PRESETS.find((p) => p.name === msg.preset);
        if (!size) {
          done(false, `no preset named ${msg.preset}`);
          return true;
        }
        setFrame(size, true).then((ok) => done(ok, ok ? undefined : 'the page could not be shown at that size'), (e) => done(false, String(e)));
        return true;
      }
      case 'point': {
        // The agent says "look here": the way a teammate would point at the screen.
        const { first: el, matches: matched } = findAll(msg.selector);
        if (el) {
          el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
          hovBox.classList.remove('hidden');
          place(hovBox, rectOf(el));
          window.clearTimeout(pointTimer);
          pointTimer = window.setTimeout(() => {
            if (!hoverOn) hovBox.classList.add('hidden');
          }, 2600);
        }
        if (barOn) showHint(`<b>Agent</b> — ${msg.note ? escapeHtml(msg.note) : 'look here'}${el ? '' : ' (nothing on the page matches that selector)'}`);
        sendResponse({ ok: true, matched });
        return true;
      }
      case 'text': {
        const el = find(msg.selector);
        if (el && msg.text !== undefined) el.textContent = msg.text;
        layout();
        break;
      }
      case 'moves':
        applyMoves(msg.moves ?? []);
        // The element in hand is in its new place now; set it down there.
        if (lifted && !moving) {
          window.clearTimeout(landingTimer);
          setDown();
        }
        layout();
        break;
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
        // Asked by the panel's Reset, which already said what happened.
        if (frame) void resetViewport(true);
        break;
      case 'bar':
        if (msg.theme) applyBarTheme(msg.theme);
        if (typeof msg.rail === 'boolean') railOn = msg.rail;
        if (msg.scheme) barScheme = msg.scheme;
        if (typeof msg.resettable === 'number') resettable = msg.resettable;
        if (msg.agent !== undefined) agent = msg.agent;
        if (msg.darkVia !== undefined) darkVia = msg.darkVia;
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

  const onMessage = (
    msg: { type?: string } & Partial<InspectorCommand>,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (r: unknown) => void,
  ) => {
    if (msg?.type !== 'inspector') return false;
    return handle(msg, sendResponse);
  };

  const observer = new MutationObserver(layout);

  function deactivate() {
    setHover(false);
    setNote(false);
    pushPage(false);
    roomWatch.disconnect();
    removeEventListener('resize', fitRoom);
    room = null;
    pageFrame.clear();
    removeEventListener('keydown', onKey, true);
    removeEventListener('keyup', onKeyUp, true);
    removeEventListener('blur', onBlurWindow);
    removeEventListener('scroll', layout, true);
    removeEventListener('resize', layout);
    observer.disconnect();
    chrome.runtime.onMessage.removeListener(onMessage);
    chrome.runtime.onConnect.removeListener(onConnect);
    host.remove();
    delete window.__codenameInspector;
  }

  addEventListener('keydown', onKey, true);
  addEventListener('keyup', onKeyUp, true);
  addEventListener('blur', onBlurWindow);
  addEventListener('scroll', layout, true);
  addEventListener('resize', layout);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
  chrome.runtime.onMessage.addListener(onMessage);
  window.__codenameInspector = {
    deactivate,
    handle: (cmd) =>
      new Promise((resolve) => {
        if (!handle(cmd, resolve)) resolve(undefined);
      }),
  };
}
