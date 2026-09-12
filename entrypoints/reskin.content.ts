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

import { lengthPx } from '@/studio/reskin';
import { isLengthMapEmpty, rewriteLength, type LengthMap } from '@/studio/reskinRules';
import { hookFromSelector, hookKey, isDarkMedia, isLightOnly, withoutDarkQuery, type DarkHook } from '@/studio/siteMode';

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
  /** Per-element edits from the Layers tab. */
  rules?: { selector: string; property: string; value: string }[];
  /** For `site-mode`: which side of the page's own theme to show. */
  mode?: 'light' | 'dark';
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
const OWN_SHEETS = new Set([STYLE_ID, PREVIEW_ID, ELEMENTS_ID, SITE_DARK_ID, MARKS_ID]);

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
    let siteDark: HTMLStyleElement | null = null;
    let appliedHooks: DarkHook[] = [];
    let savedColorScheme: string | null = null;
    let ruleCount = 0;
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

    /** Every sheet's rules, own sheets left out, cross-origin ones fetched — all at once. */
    const allRules = async (): Promise<CSSRuleList[]> => {
      const sheets = Array.from(document.styleSheets).filter(
        (s) => !(s.ownerNode instanceof Element && OWN_SHEETS.has(s.ownerNode.id)),
      );
      const lists = await Promise.all(sheets.map(readableRules));
      return lists.filter((r): r is CSSRuleList => r !== null);
    };

    /** The name a grouping rule was written under, so a re-emitted rule lands in the same layer. */
    const groupHead = (rule: CSSMediaRule | CSSSupportsRule | CSSLayerBlockRule): string =>
      rule instanceof CSSMediaRule
        ? `@media ${rule.conditionText}`
        : rule instanceof CSSSupportsRule
          ? `@supports ${rule.conditionText}`
          : rule.name
            ? `@layer ${rule.name}`
            : '@layer';

    /* -------- hardcoded colours -------- */

    const hexOf3 = (h: string) => `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toUpperCase();

    /** Swap any colour in a declaration value that the map covers, alpha intact. */
    const substitute = (value: string, map: Record<string, string>): string | null => {
      let touched = false;

      let out = value.replace(/#([0-9a-f]{3,8})\b/gi, (whole, digits: string) => {
        // #RRGGBBAA keeps its alpha pair; #RGB expands before lookup.
        const base =
          digits.length === 3 || digits.length === 4
            ? hexOf3(digits)
            : `#${digits.slice(0, 6)}`.toUpperCase();
        const tail = digits.length === 8 ? digits.slice(6) : digits.length === 4 ? digits[3]! : '';
        const to = map[base];
        if (!to) return whole;
        touched = true;
        return tail ? `${to}${tail}` : to;
      });

      out = out.replace(
        /(rgba?)\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)([^)]*)\)/gi,
        (whole, fn: string, r: string, g: string, b: string, rest: string) => {
          const hex = `#${[r, g, b]
            .map((n) => Number(n).toString(16).padStart(2, '0'))
            .join('')}`.toUpperCase();
          const to = map[hex];
          if (!to) return whole;
          touched = true;
          const nr = parseInt(to.slice(1, 3), 16);
          const ng = parseInt(to.slice(3, 5), 16);
          const nb = parseInt(to.slice(5, 7), 16);
          return `${fn}(${nr}, ${ng}, ${nb}${rest})`;
        },
      );

      return touched ? out : null;
    };

    const rootPx = () => parseFloat(getComputedStyle(root).fontSize) || 16;

    const collect = (rules: CSSRuleList, map: Record<string, string>, lengths: LengthMap | null, out: string[], rem: number) => {
      for (const rule of Array.from(rules)) {
        if (ruleCount++ > MAX_RULES) return;

        // Grouping rules carry their condition through, so an override inherits
        // the breakpoint or feature test the original was written under.
        if (
          rule instanceof CSSMediaRule ||
          rule instanceof CSSSupportsRule ||
          (typeof CSSLayerBlockRule !== 'undefined' && rule instanceof CSSLayerBlockRule)
        ) {
          const inner: string[] = [];
          collect(rule.cssRules, map, lengths, inner, rem);
          if (inner.length) out.push(`${groupHead(rule)}{${inner.join('')}}`);
          continue;
        }

        if (!(rule instanceof CSSStyleRule)) continue;
        const decls: string[] = [];
        // The rule's own size names the role its weight and line-height belong to.
        const ruleFontPx = lengths ? lengthPx(rule.style.getPropertyValue('font-size'), rem) : null;
        for (const prop of Array.from(rule.style)) {
          const value = rule.style.getPropertyValue(prop);
          const swapped =
            substitute(value, map) ?? (lengths ? rewriteLength(prop, value, lengths, ruleFontPx, rem) : null);
          if (!swapped) continue;
          // Keep their priority: an !important original needs an !important
          // shadow to beat it, and a normal one must not become important.
          const priority = rule.style.getPropertyPriority(prop);
          decls.push(`${prop}:${swapped}${priority ? ' !important' : ''}`);
        }
        if (decls.length) out.push(`${rule.selectorText}{${decls.join(';')}}`);
      }
    };

    const rewriteRules = async (map: Record<string, string>, lengths: LengthMap | null): Promise<number> => {
      const run = ++applyRun;
      const empty = !Object.keys(map).length && isLengthMapEmpty(lengths);
      const lists = empty ? [] : await allRules();
      if (run !== applyRun) return 0; // superseded while waiting; the newer run owns the DOM
      sheet?.remove();
      sheet = null;
      if (empty) return 0;

      ruleCount = 0;
      const rem = rootPx();
      const out: string[] = [];
      for (const rules of lists) collect(rules, map, isLengthMapEmpty(lengths) ? null : lengths, out, rem);
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

    /**
     * Rules under a dark media query, re-emitted without it. A dark query
     * joined to a breakpoint keeps the breakpoint; one joined with commas is
     * left alone. Hooks the stylesheet hangs dark rules off are collected on
     * the way so they can be set on the root.
     */
    const hoistDark = (rules: CSSRuleList, out: string[], hooks: Map<string, DarkHook>, inDark: boolean) => {
      for (const rule of Array.from(rules)) {
        if (ruleCount++ > MAX_RULES) return;
        if (rule instanceof CSSMediaRule) {
          const rest = withoutDarkQuery(rule.conditionText);
          if (rest === undefined) {
            if (isDarkMedia(rule.conditionText)) continue; // an arm we cannot separate
            const inner: string[] = [];
            hoistDark(rule.cssRules, inner, hooks, inDark);
            if (inner.length) out.push(`@media ${rule.conditionText}{${inner.join('')}}`);
            continue;
          }
          const inner: string[] = [];
          hoistDark(rule.cssRules, inner, hooks, true);
          if (inner.length) out.push(rest ? `@media ${rest}{${inner.join('')}}` : inner.join(''));
          continue;
        }
        if (rule instanceof CSSSupportsRule || (typeof CSSLayerBlockRule !== 'undefined' && rule instanceof CSSLayerBlockRule)) {
          const inner: string[] = [];
          hoistDark(rule.cssRules, inner, hooks, inDark);
          if (inner.length) out.push(`${groupHead(rule)}{${inner.join('')}}`);
          continue;
        }
        if (!(rule instanceof CSSStyleRule)) continue;
        if (inDark) out.push(rule.cssText);
        for (const sel of rule.selectorText.split(',')) {
          const hook = hookFromSelector(sel.trim());
          if (hook) hooks.set(hookKey(hook), hook);
        }
      }
    };

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
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSMediaRule && isLightOnly(rule.conditionText)) {
          suppressed.push({ rule, was: rule.media.mediaText });
          rule.media.mediaText = 'not all';
          continue;
        }
        if (rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule || (typeof CSSLayerBlockRule !== 'undefined' && rule instanceof CSSLayerBlockRule)) {
          suppressLight(rule.cssRules);
        }
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
      ruleCount = 0;
      const out: string[] = [];
      const hooks = new Map<string, DarkHook>();
      for (const rules of lists) hoistDark(rules, out, hooks, false);
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
    };

    const setElements = (rules: NonNullable<ApplyMessage['rules']>) => {
      elements?.remove();
      elements = null;
      if (!rules.length) return;
      const bySelector = new Map<string, string[]>();
      for (const r of rules) {
        const list = bySelector.get(r.selector) ?? [];
        list.push(`${r.property}:${r.value} !important`);
        bySelector.set(r.selector, list);
      }
      elements = document.createElement('style');
      elements.id = ELEMENTS_ID;
      elements.textContent = Array.from(bySelector, ([sel, decls]) => `${sel}{${decls.join(';')}}`).join('\n');
      document.head.appendChild(elements);
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
      // query is counted as unreadable rather than guessed at.
      const reached = new Set<Element>();
      const selectors: string[] = [];
      // Reach is what applies now: a rule under a media or supports condition
      // the page does not meet at this moment is counted as a rule but reaches
      // nothing and is not marked. A rule that sets its own outline is not
      // marked either, or the mark would paint over the very thing it proposes.
      const walk = (rules: CSSRuleList, applies: boolean) => {
        for (const rule of Array.from(rules)) {
          if (rule instanceof CSSMediaRule) {
            walk(rule.cssRules, applies && matchMedia(rule.conditionText).matches);
            continue;
          }
          if (rule instanceof CSSSupportsRule) {
            walk(rule.cssRules, applies && CSS.supports(rule.conditionText));
            continue;
          }
          if (typeof CSSLayerBlockRule !== 'undefined' && rule instanceof CSSLayerBlockRule) {
            walk(rule.cssRules, applies);
            continue;
          }
          if (!(rule instanceof CSSStyleRule)) continue;
          info.rules++;
          let ownOutline = false;
          for (const prop of Array.from(rule.style)) {
            if (prop.startsWith('--') && !info.declares.includes(prop)) info.declares.push(prop);
            if (prop === 'outline' || prop.startsWith('outline-')) ownOutline = true;
          }
          if (!applies) continue;
          try {
            const els = document.querySelectorAll(rule.selectorText);
            els.forEach((el) => reached.add(el));
            if (!ownOutline && !selectors.includes(rule.selectorText)) selectors.push(rule.selectorText);
          } catch {
            info.unreadable++;
          }
        }
      };
      try {
        const parsed = new CSSStyleSheet();
        parsed.replaceSync(css);
        walk(parsed.cssRules, true);
      } catch {
        info.unreadable++;
      }
      info.matched = reached.size;
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
      sendResponse: (response: { ok: boolean; vars: number; rules: number; hooks?: string[]; preview?: PreviewInfo; error?: string }) => void,
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
        setElements(msg.rules ?? []);
        sendResponse({ ok: true, vars: applied.size, rules: msg.rules?.length ?? 0 });
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
