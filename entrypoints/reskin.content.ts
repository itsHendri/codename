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
 * Nothing is persisted. Both mechanisms live in this document and die with it —
 * a reload, a navigation or a clear returns the page to its own values.
 */

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
  /** A stylesheet the connected agent wants to try on the page. */
  css?: string;
  /** Per-element edits from the Inspect tab. */
  rules?: { selector: string; property: string; value: string }[];
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
const OWN_SHEETS = new Set([STYLE_ID, PREVIEW_ID, ELEMENTS_ID]);
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
    let ruleCount = 0;

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

    const collect = (rules: CSSRuleList, map: Record<string, string>, out: string[]) => {
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
          collect(rule.cssRules, map, inner);
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
        for (const prop of Array.from(rule.style)) {
          const swapped = substitute(rule.style.getPropertyValue(prop), map);
          if (!swapped) continue;
          // Keep their priority: an !important original needs an !important
          // shadow to beat it, and a normal one must not become important.
          const priority = rule.style.getPropertyPriority(prop);
          decls.push(`${prop}:${swapped}${priority ? ' !important' : ''}`);
        }
        if (decls.length) out.push(`${rule.selectorText}{${decls.join(';')}}`);
      }
    };

    const rewriteRules = (map: Record<string, string>): number => {
      sheet?.remove();
      sheet = null;
      if (!Object.keys(map).length) return 0;

      ruleCount = 0;
      const out: string[] = [];
      for (const styleSheet of Array.from(document.styleSheets)) {
        if (styleSheet.ownerNode instanceof Element && OWN_SHEETS.has(styleSheet.ownerNode.id)) continue;
        let rules: CSSRuleList;
        try {
          rules = styleSheet.cssRules; // cross-origin sheets throw
        } catch {
          continue;
        }
        collect(rules, map, out);
      }
      if (!out.length) return 0;

      sheet = document.createElement('style');
      sheet.id = STYLE_ID;
      sheet.textContent = out.join('\n');
      // Last in <head> means same specificity loses to nothing but later rules,
      // and there are none.
      document.head.appendChild(sheet);
      return out.length;
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
      sendResponse: (response: { ok: boolean; vars: number; rules: number }) => void,
    ) => {
      if (msg?.type === 'reskin-apply') {
        applyVars(msg.overrides ?? []);
        const rules = rewriteRules(msg.colorMap ?? {});
        sendResponse({ ok: true, vars: applied.size, rules });
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
      return false;
    };

    chrome.runtime.onMessage.addListener(onMessage);
    window.__codenameReskin = { clear, applied: () => applied.size };
  },
});
