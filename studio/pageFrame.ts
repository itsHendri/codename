/**
 * The frame, put on a live document: the body narrowed and centred, and every
 * size media query answered for the frame (`studio/frame.ts` does the answering).
 *
 * Media lists are rewritten in place, so the page keeps its own rules in its
 * own order and nothing is copied. Each list's source text is kept, and
 * anything else that reads media text — the scanner's breakpoints, the dark
 * preview — asks `sourceMedia` for the text the page wrote rather than the
 * stand-in. Content scripts of one extension share an isolated world, so that
 * record lives on `globalThis`, where all of them see the same one.
 */

import { availableWidth, fitZoom, frameCss, rewriteMedia, type FrameSize } from './frame';

export const FRAME_SHEET_ID = 'codename-frame';

interface MediaHolder {
  mediaText: string;
}

interface Registry {
  /** What the page wrote, for a list this rewrote. */
  source: WeakMap<MediaHolder, string>;
  /** What this wrote into it, to tell its own text from someone else's. */
  written: WeakMap<MediaHolder, string>;
  /** Re-answer every query; for a script that has just changed one. */
  refresh: (() => void) | null;
  /** Put the page's own text back for the length of a synchronous read. */
  hold: (<T>(read: () => T) => T) | null;
  /** Whether a media query holds for the frame on now; null when there is none. */
  matches: ((mediaText: string) => boolean) | null;
  /** Fit the frame to the room the page has again; for the rail, which changes that room. */
  refit: (() => void) | null;
}

const KEY = '__codenameFrameMedia';

function registry(): Registry {
  const g = globalThis as unknown as Record<string, Registry | undefined>;
  return (g[KEY] ??= { source: new WeakMap(), written: new WeakMap(), refresh: null, hold: null, matches: null, refit: null });
}

/**
 * The media text the page wrote. The same as `mediaText` unless a frame is on
 * and this list has a size query in it.
 */
export function sourceMedia(media: { mediaText?: string } | null | undefined): string {
  const text = media?.mediaText ?? '';
  if (!media) return text;
  const r = registry();
  return r.written.get(media as MediaHolder) === text ? (r.source.get(media as MediaHolder) ?? text) : text;
}

/**
 * Run a read that serialises rules — `cssText` carries the media text — with
 * the page's own queries in place, then answer them for the frame again.
 * Synchronous on both sides, so nothing is painted in between.
 */
export function withSourceMedia<T>(read: () => T): T {
  const hold = registry().hold;
  return hold ? hold(read) : read();
}

/**
 * Whether a media query holds for the page as it is shown: for the frame when
 * one is on, for the window otherwise. For a query that is not in the page's
 * sheets — a stylesheet parsed on the side — which the frame never rewrote.
 */
export function mediaMatches(mediaText: string): boolean {
  const matches = registry().matches;
  return matches ? matches(mediaText) : matchMedia(mediaText).matches;
}

/** Ask a frame that is on to look at every query again. Nothing when none is. */
export function refreshFrame(): void {
  registry().refresh?.();
}

/**
 * Ask a frame that is on to fit the room the page has again. The rail
 * pushes the page with a root margin, which no resize event reports.
 */
export function refitFrame(): void {
  registry().refit?.();
}

export interface PageFrame {
  /** Show the page in this frame; the zoom it is shown at comes back. */
  set(frame: FrameSize): number;
  /** Put the page back at the window's own size. */
  clear(): void;
  /** The frame on now, or null. */
  readonly frame: FrameSize | null;
  /** How far it is scaled down to fit the tab. */
  readonly zoom: number;
  /** The frame's box in the viewport, for a capture to be cropped to. */
  rect(): { x: number; y: number; width: number; height: number } | null;
  /** Sheets whose rules could not be read (another origin), so were not answered for. */
  readonly unreadable: number;
}

/** How often a framed page is checked for rules added without touching the DOM. */
const POLL_MS = 1000;

export function createPageFrame(doc: Document = document, onChange?: () => void): PageFrame {
  const reg = registry();
  let frame: FrameSize | null = null;
  let zoom = 1;
  let unreadable = 0;
  /** Every list rewritten while this frame is on, to be put back. */
  let touched = new Set<MediaHolder>();
  let poll = 0;
  /**
   * The browser's default font size, which `em` in a media query means. An
   * element set to `medium` under the root is that size unless the page
   * styles the root's font-size with !important on everything, which none do.
   */
  let emPx = 16;
  const measureEm = () => {
    const probe = doc.createElement('div');
    probe.style.cssText = 'position:absolute!important;visibility:hidden!important;font-size:medium!important';
    doc.documentElement.appendChild(probe);
    emPx = parseFloat(getComputedStyle(probe).fontSize) || 16;
    probe.remove();
  };

  const answer = (media: MediaHolder) => {
    if (!frame) return;
    const current = media.mediaText;
    // Our own text answers from the source; any other text is the new source,
    // because the page (or the dark preview) set it since.
    const source = reg.written.get(media) === current ? (reg.source.get(media) ?? current) : current;
    const next = rewriteMedia(source, frame, emPx).text;
    if (next === source) {
      if (reg.written.get(media) === current && current !== source) media.mediaText = source;
      reg.written.delete(media);
      reg.source.delete(media);
      return;
    }
    if (current !== next) media.mediaText = next;
    reg.source.set(media, source);
    // Read back: the browser serialises what it parsed, not what it was given.
    reg.written.set(media, media.mediaText);
    touched.add(media);
  };

  const walk = (rules: CSSRuleList, depth = 0) => {
    if (depth > 32) return;
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSImportRule) {
        answer(rule.media);
        if (rule.styleSheet) sheet(rule.styleSheet, depth + 1);
        continue;
      }
      if (rule instanceof CSSMediaRule) answer(rule.media);
      // Grouping rules, and style rules with nested rules inside them.
      const inner = (rule as { cssRules?: CSSRuleList }).cssRules;
      if (inner && inner.length) walk(inner, depth + 1);
    }
  };

  const sheet = (s: CSSStyleSheet, depth = 0) => {
    const owner = s.ownerNode as Element | null;
    if (owner && (owner as Element).id === FRAME_SHEET_ID) return;
    if (s.media && s.media.mediaText) answer(s.media);
    let rules: CSSRuleList;
    try {
      rules = s.cssRules;
    } catch {
      unreadable++;
      return;
    }
    walk(rules, depth);
  };

  const sheets = (): CSSStyleSheet[] => [...Array.from(doc.styleSheets), ...(doc.adoptedStyleSheets ?? [])];

  const answerAll = () => {
    if (!frame) return;
    unreadable = 0;
    for (const s of sheets()) sheet(s);
  };

  const style = () => {
    let el = doc.getElementById(FRAME_SHEET_ID) as HTMLStyleElement | null;
    if (!el) {
      el = doc.createElement('style');
      el.id = FRAME_SHEET_ID;
      // After the head, so it comes last in the cascade among equals.
      doc.documentElement.appendChild(el);
    }
    return el;
  };

  const fit = () => {
    if (!frame) return;
    const next = fitZoom(frame.width, availableWidth(doc), frame.fill ? 0 : undefined);
    const css = frameCss(frame, next);
    const el = style();
    if (el.textContent !== css) el.textContent = css;
    if (next !== zoom) {
      zoom = next;
      onChange?.();
    }
  };

  const hold = <T,>(read: () => T): T => {
    for (const media of touched) {
      const source = reg.source.get(media);
      if (source !== undefined && reg.written.get(media) === media.mediaText) media.mediaText = source;
    }
    try {
      return read();
    } finally {
      // The restored text reads as the page's own now, and is answered afresh.
      answerAll();
    }
  };

  const matches = (mediaText: string) =>
    matchMedia(frame ? rewriteMedia(mediaText, frame, emPx).text : mediaText).matches;

  const isSheetNode = (n: Node) =>
    (n.nodeName === 'STYLE' || n.nodeName === 'LINK') && (n as Element).id !== FRAME_SHEET_ID;

  // A stylesheet added, removed, its text replaced (a dev server's hot reload
  // is all three), or its `media` attribute changed.
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      const owner = r.target.nodeType === Node.ELEMENT_NODE ? r.target : r.target.parentNode;
      const hit =
        (owner != null && isSheetNode(owner) && (r.type !== 'attributes' || r.attributeName === 'media')) ||
        Array.from(r.addedNodes).some(isSheetNode) ||
        Array.from(r.removedNodes).some(isSheetNode);
      // Observer callbacks already come batched, after the script that made
      // the change and before the next paint, so this answers at once.
      if (hit) {
        answerAll();
        return;
      }
    }
  });
  /** A linked sheet's rules arrive after the element does. */
  const onLoad = (e: Event) => {
    if ((e.target as Node | null)?.nodeName === 'LINK') answerAll();
  };
  const onResize = () => fit();

  const start = () => {
    observer.observe(doc.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['media'] });
    doc.addEventListener('load', onLoad, true);
    doc.defaultView?.addEventListener('resize', onResize);
    // CSS-in-JS inserts rules through the CSSOM, and a script can set a
    // list's text, neither of which any observer sees. The walk writes only
    // what has changed, so going over everything is the cheap way to be sure.
    poll = window.setInterval(answerAll, POLL_MS);
    reg.refresh = answerAll;
    reg.hold = hold;
    reg.matches = matches;
    reg.refit = fit;
  };

  const stop = () => {
    observer.disconnect();
    doc.removeEventListener('load', onLoad, true);
    doc.defaultView?.removeEventListener('resize', onResize);
    window.clearInterval(poll);
    if (reg.refresh === answerAll) reg.refresh = null;
    if (reg.hold === hold) reg.hold = null;
    if (reg.matches === matches) reg.matches = null;
    if (reg.refit === fit) reg.refit = null;
  };

  return {
    set(next) {
      const wasOn = frame !== null;
      if (!wasOn) measureEm();
      frame = { width: next.width, height: next.height, ...(next.fill ? { fill: true } : {}) };
      zoom = fitZoom(frame.width, availableWidth(doc), frame.fill ? 0 : undefined);
      style().textContent = frameCss(frame, zoom);
      answerAll();
      if (!wasOn) start();
      return zoom;
    },
    clear() {
      if (!frame) return;
      stop();
      for (const media of touched) {
        const source = reg.source.get(media);
        if (source !== undefined && reg.written.get(media) === media.mediaText) media.mediaText = source;
        reg.source.delete(media);
        reg.written.delete(media);
      }
      touched = new Set();
      doc.getElementById(FRAME_SHEET_ID)?.remove();
      frame = null;
      zoom = 1;
      unreadable = 0;
    },
    get frame() {
      return frame;
    },
    get zoom() {
      return zoom;
    },
    get unreadable() {
      return unreadable;
    },
    rect() {
      if (!frame || !doc.body) return null;
      // Across from the body, but down the whole viewport: a page with
      // `body { height: 100% }` runs its content past the body's own box, and
      // the frame is the column, not the box. The bar's strip is not the page.
      const r = doc.body.getBoundingClientRect();
      const rootStyle = getComputedStyle(doc.documentElement);
      const top = Math.max(0, parseFloat(rootStyle.marginTop) || 0);
      // The rail's column is not the page either.
      const left = Math.max(0, parseFloat(rootStyle.marginLeft) || 0);
      const bottom = doc.documentElement.clientHeight;
      if (bottom <= top || r.width <= 0) return null;
      return { x: Math.max(left, r.left), y: top, width: Math.min(r.width, availableWidth(doc)), height: bottom - top };
    },
  };
}
