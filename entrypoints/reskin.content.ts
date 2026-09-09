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
import { hookFromSelector, hookKey, isDarkMedia, withoutDarkQuery, type DarkHook } from '@/studio/siteMode';

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
const OWN_SHEETS = new Set([STYLE_ID, PREVIEW_ID, ELEMENTS_ID, SITE_DARK_ID]);
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
    let elements: HTMLStyleElement | null = null;
    let siteDark: HTMLStyleElement | null = null;
    let appliedHooks: DarkHook[] = [];
    let savedColorScheme: string | null = null;
    let ruleCount = 0;

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

    /** Every sheet's rules, own sheets left out, cross-origin ones fetched. */
    const allRules = async (): Promise<CSSRuleList[]> => {
      const out: CSSRuleList[] = [];
      for (const styleSheet of Array.from(document.styleSheets)) {
        if (styleSheet.ownerNode instanceof Element && OWN_SHEETS.has(styleSheet.ownerNode.id)) continue;
        const rules = await readableRules(styleSheet);
        if (rules) out.push(rules);
      }
      return out;
    };

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

    const collect = (rules: CSSRuleList, map: Record<string, string>, lengths: LengthMap | null, out: string[]) => {
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
          collect(rule.cssRules, map, lengths, inner);
          if (inner.length) {
            const condition =
              rule instanceof CSSMediaRule
                ? `@media ${rule.conditionText}`
                : rule instanceof CSSSupportsRule
                  ? `@supports ${rule.conditionText}`
                  : '@layer';
            out.push(`${condition}{${inner.join('')}}`);
          }
          continue;
        }

        if (!(rule instanceof CSSStyleRule)) continue;
        const decls: string[] = [];
        // The rule's own size names the role its weight and line-height belong to.
        const ruleFontPx = lengths ? lengthPx(rule.style.getPropertyValue('font-size'), rootPx()) : null;
        for (const prop of Array.from(rule.style)) {
          const value = rule.style.getPropertyValue(prop);
          const swapped =
            substitute(value, map) ?? (lengths ? rewriteLength(prop, value, lengths, ruleFontPx, rootPx()) : null);
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
      sheet?.remove();
      sheet = null;
      if (!Object.keys(map).length && isLengthMapEmpty(lengths)) return 0;

      ruleCount = 0;
      const out: string[] = [];
      for (const rules of await allRules()) collect(rules, map, isLengthMapEmpty(lengths) ? null : lengths, out);
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
          if (inner.length) {
            const head = rule instanceof CSSSupportsRule ? `@supports ${rule.conditionText}` : '@layer';
            out.push(`${head}{${inner.join('')}}`);
          }
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

    const clearSiteDark = () => {
      siteDark?.remove();
      siteDark = null;
      for (const h of appliedHooks) setHook(h, false);
      appliedHooks = [];
      if (savedColorScheme !== null) {
        if (savedColorScheme) root.style.colorScheme = savedColorScheme;
        else root.style.removeProperty('color-scheme');
        savedColorScheme = null;
      }
    };

    const setSiteMode = async (mode: 'light' | 'dark'): Promise<{ rules: number; hooks: string[] }> => {
      clearSiteDark();
      if (mode === 'light') return { rules: 0, hooks: [] };
      ruleCount = 0;
      const out: string[] = [];
      const hooks = new Map<string, DarkHook>();
      for (const rules of await allRules()) hoistDark(rules, out, hooks, false);
      if (!out.length && !hooks.size) return { rules: 0, hooks: [] };
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

    const setPreview = (css: string) => {
      preview?.remove();
      preview = null;
      if (!css.trim()) return;
      preview = document.createElement('style');
      preview.id = PREVIEW_ID;
      preview.textContent = css;
      document.head.appendChild(preview);
    };

    const onMessage = (
      msg: ApplyMessage,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: { ok: boolean; vars: number; rules: number; hooks?: string[] }) => void,
    ) => {
      if (msg?.type === 'reskin-apply') {
        applyVars(msg.overrides ?? []);
        void rewriteRules(msg.colorMap ?? {}, msg.lengthMap ?? null).then((rules) =>
          sendResponse({ ok: true, vars: applied.size, rules }),
        );
        return true;
      }
      if (msg?.type === 'reskin-clear') {
        clear();
        sendResponse({ ok: true, vars: 0, rules: 0 });
        return true;
      }
      if (msg?.type === 'reskin-preview') {
        setPreview(msg.css ?? '');
        sendResponse({ ok: true, vars: applied.size, rules: preview ? 1 : 0 });
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
        void setSiteMode(msg.mode === 'dark' ? 'dark' : 'light').then((r) =>
          sendResponse({ ok: true, vars: applied.size, rules: r.rules, hooks: r.hooks }),
        );
        return true;
      }
      return false;
    };

    chrome.runtime.onMessage.addListener(onMessage);
    window.__codenameReskin = { clear, applied: () => applied.size };
  },
});
