/**
 * The specimen: the page's own styles page, drawn in the page.
 *
 * Every design tool has a styles page; Codename's has to be the page's
 * own, or it drifts. So the type ramp, the swatches and the page's own
 * components are rendered as light DOM inside the document — an `<h1>` the
 * page's `h1 {}` rule styles, a swatch painted through `var(--ink)`, a card
 * cloned from the page — and the page itself is hidden under them with one
 * managed stylesheet, then put back untouched when the specimen goes. The
 * inspector selects specimen elements like any other, and an edit made on
 * one files against the rule the page uses. The re-skin repaints the
 * specimen with the page, since it is the page.
 *
 * Plain DOM, no React: a host, a stylesheet, and what the spec says.
 */

import type { SpecimenCommand } from '@/shared/types';
import { RAIL_TAG, SPECIMEN_LABEL_TAG, SPECIMEN_TAG } from '@/shared/inpage';
import { BAR_HEIGHT, type OverlayTheme } from '@/shared/theme';
import type { SpecimenSpec } from '@/studio/specimen/spec';
import { cloneForSpecimen, HIDE_PAGE_CSS, renderSpecimen, type SpecimenComponent } from '@/studio/specimen/render';
import { specimenHtml } from '@/studio/specimen/serialize';
import { buildLayers } from '@/studio/inspect/dom';
import { componentsOf } from '@/studio/layers';

const SHEET_ID = 'codename-specimen';
const INSPECTOR_TAG = 'codename-inspector';
const PANEL_TAG = 'codename-panel';
/** How many component patterns the specimen shows, one of each. */
const MAX_COMPONENTS = 6;

declare global {
  interface Window {
    __codenameSpecimen?: { deactivate(): void };
  }
}

export default defineContentScript({
  registration: 'runtime',
  main() {
    if (window.__codenameSpecimen) return;
    activate();
  },
});

function activate() {
  let host: HTMLElement | null = null;
  let sheet: HTMLStyleElement | null = null;
  let spec: SpecimenSpec | null = null;
  let theme: OverlayTheme = 'dark';
  let scrollY = 0;

  const isOurs = (el: Element) => {
    const tag = el.tagName.toLowerCase();
    return tag === INSPECTOR_TAG || tag === RAIL_TAG || tag === PANEL_TAG || tag === SPECIMEN_TAG || tag === SPECIMEN_LABEL_TAG;
  };

  /** One of each component pattern the page has, cloned, from the page as it stands. */
  const components = (): SpecimenComponent[] => {
    const out: SpecimenComponent[] = [];
    try {
      const layers = buildLayers(document.body, isOurs);
      for (const c of componentsOf(layers, MAX_COMPONENTS)) {
        const first = c.nodes.map((n) => document.querySelector(n.selector)).find((el): el is Element => !!el && !el.closest(SPECIMEN_TAG));
        if (!first) continue;
        out.push({ selector: c.selector, matches: c.count, node: cloneForSpecimen(first) });
      }
    } catch {
      /* a page that throws on a walk gets no components, not no specimen */
    }
    return out;
  };

  const render = () => {
    if (!spec || !host) return;
    host.replaceChildren(renderSpecimen(spec, document, { labels: 'shadow', theme, components: components() }));
  };

  const show = () => {
    if (!host) {
      host = document.createElement(SPECIMEN_TAG);
      // At the end of the body, in the flow the page would have had; the
      // page's own body font and colour cascade in, which is the point.
      document.body.appendChild(host);
      sheet = document.createElement('style');
      sheet.id = SHEET_ID;
      sheet.textContent = HIDE_PAGE_CSS(SPECIMEN_TAG, [INSPECTOR_TAG, RAIL_TAG, PANEL_TAG]) + `\n${SPECIMEN_TAG} { padding-top: ${BAR_HEIGHT + 32}px; }`;
      document.head.appendChild(sheet);
      scrollY = window.scrollY;
      window.scrollTo({ top: 0 });
    }
    render();
  };

  /** The page again, exactly as it was: the host and the sheet go, nothing else was touched. */
  const hide = () => {
    if (!host) return;
    host.remove();
    host = null;
    sheet?.remove();
    sheet = null;
    window.scrollTo({ top: scrollY });
  };

  const onMessage = (msg: { type?: string } & Partial<SpecimenCommand>, _sender: chrome.runtime.MessageSender, sendResponse: (r: unknown) => void) => {
    if (msg?.type !== 'specimen') return false;
    switch (msg.cmd) {
      case 'specimen':
        if (msg.spec) spec = msg.spec;
        if (msg.theme) theme = msg.theme;
        if (msg.on && spec) show();
        else hide();
        sendResponse({ ok: true, on: host !== null });
        return true;
      case 'html':
        sendResponse({ ok: !!spec, html: spec ? specimenHtml(spec, document, theme, components()) : '' });
        return true;
      case 'off':
        deactivate();
        sendResponse({ ok: true });
        return true;
    }
    return false;
  };
  chrome.runtime.onMessage.addListener(onMessage);

  // The panel holds a port open while it is showing this tab; when it goes,
  // the page comes back with the rest of the chrome.
  const onConnect = (port: chrome.runtime.Port) => {
    if (port.name !== 'codename-panel') return;
    port.onDisconnect.addListener(hide);
  };
  chrome.runtime.onConnect.addListener(onConnect);

  function deactivate() {
    hide();
    chrome.runtime.onMessage.removeListener(onMessage);
    chrome.runtime.onConnect.removeListener(onConnect);
    delete window.__codenameSpecimen;
  }
  window.__codenameSpecimen = { deactivate };
}
