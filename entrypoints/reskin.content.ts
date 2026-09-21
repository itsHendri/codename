/**
 * Applies token overrides to the live page. Two mechanisms, because pages come
 * in two kinds.
 *
 * **Variables.** Set inline on the root element rather than through an injected
 * stylesheet: an inline declaration outranks every author rule for that element,
 * including `:root.dark` and rules inside media queries, so one write wins
 * without `!important` and `removeProperty` puts it back exactly.
 *
 * **Hardcoded colours.** Most of the web has no custom properties to override —
 * stripe.com has none — so for those the page's own rules are read back, any
 * declaration painting a colour we are changing is re-emitted with the new
 * value, and the result is appended as one stylesheet. Their selector is reused
 * verbatim, which is what keeps `:hover`, `:focus` and media queries working:
 * we are not inventing rules, we are shadowing theirs with the same reach.
 *
 * **Lengths in rules.** The same rewrite reaches the type ladder, the grid and
 * the radius: `font-size: 15px` says what it is by its property name, which a
 * variable holding `15px` cannot, so a rule can move where a variable must be
 * left alone. `studio/reskinRules` decides each declaration and fails closed.
 *
 * Nothing is persisted. Both mechanisms live in this document and die with it —
 * a reload, a navigation or a clear returns the page to its own values.
 */

import { isLengthMapEmpty, type LengthMap } from '@/studio/reskinRules';
import { collectOverrides } from '@/studio/scan/overrideSheet';
import { MANAGED_SHEET_IDS } from '@/shared/types';
import { pseudosOf, type StateName } from '@/studio/conditions';
import {
  elementsSheet,
  hoistState,
  collectStateRules,
  stateSheet as buildStateSheet,
  type ConditionRule,
  type HoistedRule,
} from '@/studio/conditionSheet';
import type { DarkHook } from '@/studio/siteMode';
import { hoistDark, lightOnlyMedia, previewReach } from '@/studio/siteDark';
import { mediaMatches, refreshFrame, sourceMedia, withSourceMedia } from '@/studio/pageFrame';

interface Override {
  name: string;
  from: string;
  to: string;
}

interface ApplyMessage {
  type?: string;
  overrides?: Override[];
  /** old hex (uppercase) → new hex, for pages that hardcode their colours. */
  colorMap?: Record<string, string>;
  /** Lengths the rules should move, by property. */
  lengthMap?: LengthMap | null;
  /** A stylesheet the connected agent wants to try on the page. */
  css?: string;
  /** Per-element edits from the Layers tab, each with the state it is about. */
  rules?: ConditionRule[];
  /** For `site-mode`: which side of the page's own theme to show. */
  mode?: 'light' | 'dark';
  /** For `elements-set`: whether the panel is already painting the page dark. */
  darkPreview?: boolean;
  /** For `state-set`: the state to hold the page in, or null to let go. */
  state?: StateName | null;
  /** For `state-set`: the element being held, so only its rules are hoisted. */
  selector?: string;
}

declare global {
  interface Window {
    __codenameReskin?: { clear: () => void; applied: () => number };
  }
}

const STYLE_ID = 'codename-reskin';
/**
 * The agent's own sheet. It is a preview the user consented to, kept apart
 * from the re-skin so either can be cleared without the other.
 */
const PREVIEW_ID = 'codename-agent-preview';
/**
 * Element edits. These use `!important` where the re-skin does not: the
 * re-skin shadows the page's own selectors at their own specificity, but an
 * element edit invents a selector and cannot know what it is up against.
 * It is preview-only and never handed off, so the cost is nil.
 */
const ELEMENTS_ID = 'codename-elements';
/**
 * The page's own dark rules, hoisted out of their media query so they apply
 * in daylight. The site's dark mode, shown without the debugger permission.
 */
const SITE_DARK_ID = 'codename-site-dark';
/**
 * Where the agent's preview lands: a dashed outline on every element its
 * rules reach, so what it is doing is visible the way a teammate's cursor
 * is. Comes and goes with the preview.
 */
const MARKS_ID = 'codename-agent-marks';
const MARK_COLOUR = '#6bb5ff';
/**
 * The page's own `:hover`/`:focus`/`:active` rules, re-emitted against a
 * class the inspector controls. This is how a state previews with no
 * debugger permission: the page keeps its rules, and a copy of them triggers
 * on the class instead of on the pointer. It sits before the element sheet,
 * so an edit made in that state still wins.
 */
const STATE_ID = 'codename-state';
// The same list the scanner refuses to read, so the two agree about what is
// ours and what is the page's.
const OWN_SHEETS = new Set<string>(MANAGED_SHEET_IDS);

/** The agent's sheet, counted: rules, the elements they reach, selectors that could not be read. */
interface PreviewInfo {
  rules: number;
  matched: number;
  unreadable: number;
  /** Custom properties the sheet sets, so the panel can say when one is locked. */
  declares: string[];
}
/** A pathological page shouldn't hang the panel; stop well before that. */
const MAX_RULES = 20000;

export default defineContentScript({
  registration: 'runtime',
  main() {
    if (window.__codenameReskin) return;

    const applied = new Map<string, string>();
    const root = document.documentElement;
    let sheet: HTMLStyleElement | null = null;
    let preview: HTMLStyleElement | null = null;
    let marks: HTMLStyleElement | null = null;
    let elements: HTMLStyleElement | null = null;
    let stateStyle: HTMLStyleElement | null = null;
    let siteDark: HTMLStyleElement | null = null;
    let appliedHooks: DarkHook[] = [];
    let savedColorScheme: string | null = null;
    /**
     * Applies overlap: the panel sends every few frames and a cross-origin
     * fetch takes longer than that. Each run takes a number, and a run that
     * finds a newer one when its await returns does nothing — the DOM is
     * only ever touched by the latest.
     */
    let applyRun = 0;
    let modeRun = 0;

    /**
     * Cross-origin stylesheets hide their rules from the page, but the
     * background can fetch their text with the site access the user already
     * granted. Parsed once into a detached sheet and kept for the document's
     * life; a fetch that fails is remembered as null so it is not retried
     * on every keystroke.
     */
    const fetched = new Map<string, CSSStyleSheet | null>();
    const readableRules = async (styleSheet: CSSStyleSheet): Promise<CSSRuleList | null> => {
      try {
        return styleSheet.cssRules;
      } catch {
        /* cross-origin */
      }
      const href = styleSheet.href;
      if (!href) return null;
      if (!fetched.has(href)) {
        let parsed: CSSStyleSheet | null = null;
        try {
          const res = (await chrome.runtime.sendMessage({ type: 'fetch-text', url: href })) as
            | { ok: boolean; text?: string }
            | undefined;
          if (res?.ok && res.text) {
            parsed = new CSSStyleSheet();
            parsed.replaceSync(res.text);
          }
        } catch {
          parsed = null;
        }
        fetched.set(href, parsed);
      }
      return fetched.get(href)?.cssRules ?? null;
    };

    /**
     * Every sheet's rules, cross-origin ones fetched — all at once.
     *
     * `skip` says which of our own sheets to leave out. The default is all of
     * them, which is what the colour and length rewrites want: they are
     * reading the page in order to rewrite it, and reading their own output
     * would compound. The state hoist passes a shorter list, because it is
     * asking a different question — what does this page paint on hover *as it
     * stands* — and the re-skin's output is part of how it stands now.
     */
    const allRules = async (skip: Set<string> = OWN_SHEETS): Promise<CSSRuleList[]> => {
      const sheets = Array.from(document.styleSheets).filter(
        (s) => !(s.ownerNode instanceof Element && skip.has(s.ownerNode.id)),
      );
      const lists = await Promise.all(sheets.map(readableRules));
      return lists.filter((r): r is CSSRuleList => r !== null);
    };

    /**
     * What the state hoist leaves out: itself, our element edits (which
     * already carry both the pseudo and the class), the agent's proposal, and
     * the outlines. The re-skin and the site's dark mode stay in, because
     * they are the page as it is being painted right now.
     */
    const NOT_THE_PAGE = new Set([STATE_ID, ELEMENTS_ID, PREVIEW_ID, MARKS_ID]);

    /* -------- hardcoded colours -------- */

    /** What a `rem` is worth on this page, for the length rewrites. */
    const rootPx = () => parseFloat(getComputedStyle(root).fontSize) || 16;

    const rewriteRules = async (map: Record<string, string>, lengths: LengthMap | null): Promise<number> => {
      const run = ++applyRun;
      const empty = !Object.keys(map).length && isLengthMapEmpty(lengths);
      const lists = empty ? [] : await allRules();
      if (run !== applyRun) return 0; // superseded while waiting; the newer run owns the DOM
      sheet?.remove();
      sheet = null;
      if (empty) return 0;

      const out = collectOverrides(lists, { colorMap: map, lengths, rootPx: rootPx(), limit: MAX_RULES });
      if (!out.length) return 0;

      sheet = document.createElement('style');
      sheet.id = STYLE_ID;
      sheet.textContent = out.join('\n');
      // Last in <head> means same specificity loses to nothing but later rules,
      // and there are none.
      document.head.appendChild(sheet);
      return out.length;
    };

    /* -------- the site's own dark mode -------- */

    const setHook = (hook: DarkHook, on: boolean) => {
      for (const el of [root, document.body].filter(Boolean)) {
        if (hook.kind === 'class') el.classList.toggle(hook.name, on);
        else if (on) el.setAttribute(hook.name, hook.value);
        else el.removeAttribute(hook.name);
      }
    };

    /**
     * Light-only media blocks in the page's own sheets are switched off in
     * place while the dark preview is up — `not all` never matches — and
     * put back exactly. Hoisting the dark rules alone would leave them live
     * wherever they outrank a hoisted rule.
     */
    const suppressed: { rule: CSSMediaRule; was: string }[] = [];
    const suppressLight = (rules: CSSRuleList) => {
      for (const found of lightOnlyMedia([rules])) {
        const rule = found as CSSMediaRule;
        // The page's own text, not a device frame's stand-in for it: what is
        // put back is what the page wrote, and the frame answers it again.
        suppressed.push({ rule, was: sourceMedia(rule.media) });
        rule.media.mediaText = 'not all';
      }
    };

    const clearSiteDark = () => {
      siteDark?.remove();
      siteDark = null;
      for (const { rule, was } of suppressed) {
        try {
          rule.media.mediaText = was;
        } catch {
          /* the sheet is gone */
        }
      }
      if (suppressed.length) refreshFrame();
      suppressed.length = 0;
      for (const h of appliedHooks) setHook(h, false);
      appliedHooks = [];
      if (savedColorScheme !== null) {
        if (savedColorScheme) root.style.colorScheme = savedColorScheme;
        else root.style.removeProperty('color-scheme');
        savedColorScheme = null;
      }
    };

    const setSiteMode = async (mode: 'light' | 'dark'): Promise<{ rules: number; hooks: string[] }> => {
      const run = ++modeRun;
      if (mode === 'light') {
        clearSiteDark();
        return { rules: 0, hooks: [] };
      }
      const lists = await allRules();
      if (run !== modeRun) return { rules: 0, hooks: [] };
      clearSiteDark();
      // A nested rule's text carries its media query; the copy needs the page's own.
      const { css: out, hooks } = withSourceMedia(() => hoistDark(lists, MAX_RULES));
      if (!out.length && !hooks.size) return { rules: 0, hooks: [] };
      // The page's own readable sheets can be edited in place; a fetched
      // sheet is a detached copy, and its light rules were never applied.
      for (const styleSheet of Array.from(document.styleSheets)) {
        if (styleSheet.ownerNode instanceof Element && OWN_SHEETS.has(styleSheet.ownerNode.id)) continue;
        try {
          suppressLight(styleSheet.cssRules);
        } catch {
          /* cross-origin */
        }
      }
      if (out.length) {
        siteDark = document.createElement('style');
        siteDark.id = SITE_DARK_ID;
        siteDark.textContent = out.join('\n');
        // Before our own re-skin sheets, so an edit still wins over the theme.
        const first = document.head.querySelector(`#${STYLE_ID}, #${ELEMENTS_ID}, #${PREVIEW_ID}`);
        document.head.insertBefore(siteDark, first);
      }
      appliedHooks = Array.from(hooks.values());
      for (const h of appliedHooks) setHook(h, true);
      // Form controls and scrollbars follow too.
      savedColorScheme = root.style.colorScheme;
      root.style.colorScheme = 'dark';
      return { rules: out.length, hooks: Array.from(hooks.keys()) };
    };

    /* -------- variables -------- */

    const applyVars = (overrides: Override[]) => {
      const incoming = new Set(overrides.map((o) => o.name));
      for (const name of applied.keys()) {
        if (!incoming.has(name)) {
          root.style.removeProperty(name);
          applied.delete(name);
        }
      }
      for (const { name, to } of overrides) {
        root.style.setProperty(name, to);
        applied.set(name, to);
      }
    };

    const clear = () => {
      for (const name of applied.keys()) root.style.removeProperty(name);
      applied.clear();
      sheet?.remove();
      sheet = null;
      stateStyle?.remove();
      stateStyle = null;
    };

    const setElements = (rules: NonNullable<ApplyMessage['rules']>, darkPreview = false) => {
      elements?.remove();
      elements = null;
      if (!rules.length) return;
      const text = elementsSheet(rules, { darkPreview });
      if (!text) return;
      elements = document.createElement('style');
      elements.id = ELEMENTS_ID;
      elements.textContent = text;
      document.head.appendChild(elements);
    };

    /* -------- holding the page in a state -------- */

    /**
     * Re-emit every rule of the page's own that styles `selector` in `state`,
     * against our class instead of the pseudo-class.
     *
     * Only rules that match the element being held are taken: a page has
     * hundreds of hover rules and re-emitting all of them would light the
     * whole document up. The answer carries what was found, so the panel can
     * show "already on hover" without reading the CSSOM itself.
     */
    /**
     * Which `state-set` is the current one.
     *
     * Reading the page's sheets can wait on the background for a cross-origin
     * fetch, so two clicks in quick succession overlap. Without this the
     * slower answer would append its sheet after the faster one and orphan a
     * `<style>` node that nothing would ever remove.
     */
    let stateToken = 0;

    const setState = async (state: StateName | null, selector: string | null): Promise<HoistedRule[]> => {
      const mine = ++stateToken;
      stateStyle?.remove();
      stateStyle = null;
      if (!state || !selector) return [];

      let element: Element | null = null;
      try {
        element = document.querySelector(selector);
      } catch {
        element = null;
      }
      if (!element) return [];

      const pseudos = pseudosOf(state);
      const lists = await allRules(NOT_THE_PAGE);
      // Another pick arrived while the sheets were being read.
      if (mine !== stateToken) return [];
      const collected = collectStateRules(lists, pseudos, MAX_RULES);

      // Keep only what would actually reach this element. The selector with
      // its pseudo taken out is exactly that question, and the page answers it.
      const el = element;
      const hoisted = hoistState(collected, state, pseudos).filter((h) => {
        try {
          return el.matches(h.bare);
        } catch {
          // A selector this browser cannot parse reaches nothing we can prove.
          return false;
        }
      });

      // One last look: the await above gave another pick time to arrive.
      if (mine !== stateToken) return [];
      const text = buildStateSheet(hoisted);
      if (text) {
        stateStyle = document.createElement('style');
        stateStyle.id = STATE_ID;
        stateStyle.textContent = text;
        // Before the element sheet, so an edit made in this state still wins.
        const first = document.head.querySelector(`#${ELEMENTS_ID}`);
        if (first) document.head.insertBefore(stateStyle, first);
        else document.head.appendChild(stateStyle);
      }
      return hoisted;
    };

    const setPreview = (css: string): PreviewInfo => {
      preview?.remove();
      preview = null;
      marks?.remove();
      marks = null;
      const info: PreviewInfo = { rules: 0, matched: 0, unreadable: 0, declares: [] };
      if (!css.trim()) return info;
      preview = document.createElement('style');
      preview.id = PREVIEW_ID;
      preview.textContent = css;
      document.head.appendChild(preview);
      // Read the sheet back to say what it reaches. A selector the page cannot
      // query is counted as unreadable rather than guessed at; a rule under a
      // condition the page does not meet right now is counted but reaches
      // nothing, and a rule that sets its own outline is not marked.
      let selectors: string[] = [];
      try {
        const parsed = new CSSStyleSheet();
        parsed.replaceSync(css);
        const reach = previewReach(parsed.cssRules, {
          mediaMatches,
          supports: (c) => CSS.supports(c),
          query: (selector) => document.querySelectorAll(selector),
        });
        info.rules = reach.rules;
        info.unreadable = reach.unreadable;
        info.declares = reach.declares;
        info.matched = reach.matched.size;
        selectors = reach.selectors;
      } catch {
        info.unreadable++;
      }
      if (selectors.length) {
        marks = document.createElement('style');
        marks.id = MARKS_ID;
        marks.textContent = `${selectors.join(',\n')}{outline:1.5px dashed ${MARK_COLOUR} !important;outline-offset:2px !important}`;
        document.head.appendChild(marks);
      }
      return info;
    };

    const onMessage = (
      msg: ApplyMessage,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: {
        ok: boolean;
        vars: number;
        rules: number;
        hooks?: string[];
        preview?: PreviewInfo;
        /** For `state-set`: the page's own rules for that state, as facts. */
        cascade?: HoistedRule[];
        error?: string;
      }) => void,
    ) => {
      // A branch that throws must still answer, or the panel reads silence
      // as "not injected", re-injects, and gets silence again.
      const failed = (err: unknown) =>
        sendResponse({ ok: false, vars: applied.size, rules: 0, error: err instanceof Error ? err.message : String(err) });
      if (msg?.type === 'reskin-apply') {
        try {
          applyVars(msg.overrides ?? []);
          rewriteRules(msg.colorMap ?? {}, msg.lengthMap ?? null)
            .then((rules) => sendResponse({ ok: true, vars: applied.size, rules }))
            .catch(failed);
        } catch (err) {
          failed(err);
        }
        return true;
      }
      if (msg?.type === 'reskin-clear') {
        clear();
        sendResponse({ ok: true, vars: 0, rules: 0 });
        return true;
      }
      if (msg?.type === 'reskin-preview') {
        const agent = setPreview(msg.css ?? '');
        sendResponse({ ok: true, vars: applied.size, rules: agent.rules, preview: agent });
        return true;
      }
      if (msg?.type === 'reskin-preview-clear') {
        setPreview('');
        sendResponse({ ok: true, vars: applied.size, rules: 0 });
        return true;
      }
      if (msg?.type === 'elements-set') {
        setElements(msg.rules ?? [], msg.darkPreview === true);
        sendResponse({ ok: true, vars: applied.size, rules: msg.rules?.length ?? 0 });
        return true;
      }
      if (msg?.type === 'state-set') {
        setState(msg.state ?? null, msg.selector ?? null)
          .then((hoisted) => sendResponse({ ok: true, vars: applied.size, rules: hoisted.length, cascade: hoisted }))
          .catch(failed);
        return true;
      }
      if (msg?.type === 'elements-clear') {
        setElements([]);
        sendResponse({ ok: true, vars: applied.size, rules: 0 });
        return true;
      }
      if (msg?.type === 'site-mode') {
        setSiteMode(msg.mode === 'dark' ? 'dark' : 'light')
          .then((r) => sendResponse({ ok: true, vars: applied.size, rules: r.rules, hooks: r.hooks }))
          .catch(failed);
        return true;
      }
      return false;
    };

    chrome.runtime.onMessage.addListener(onMessage);
    window.__codenameReskin = { clear, applied: () => applied.size };
  },
});
