/**
 * The override sheet for a page that hardcodes its values.
 *
 * A page with CSS variables is repainted by setting them on the root. A page
 * without any is repainted by finding the rules that hold the old value and
 * re-emitting them, *reusing their own selectors*, so `:hover` and `:focus`
 * keep working and nothing has to be guessed about specificity.
 *
 * That makes this the one place where the page's own CSS is rewritten rather
 * than read, and it was the largest untested thing in the project.
 */

import { lengthPx } from '../reskin';
import { isLengthMapEmpty, rewriteLength, type LengthMap } from '../reskinRules';
import { eachStyleRule, MAX_RULES, resolveNested, type RuleLike } from './customProps';

/** `#abc` → `#AABBCC`, so a three-digit hex can be looked up like any other. */
const expand3 = (digits: string): string =>
  `#${digits[0]}${digits[0]}${digits[1]}${digits[1]}${digits[2]}${digits[2]}`.toUpperCase();

/**
 * The same value with every colour the map knows about swapped, or null when
 * it holds none of them.
 *
 * Both spellings a browser serialises: `#rrggbb` in author text, and
 * `rgb(r, g, b)` once it has been through the object model.
 */
export function substitute(value: string, map: Record<string, string>): string | null {
  let touched = false;

  let out = value.replace(/#([0-9a-f]{3,8})\b/gi, (whole, digits: string) => {
    // `#RRGGBBAA` keeps its alpha pair; `#RGB` expands before the lookup.
    const base = digits.length === 3 || digits.length === 4 ? expand3(digits) : `#${digits.slice(0, 6)}`.toUpperCase();
    const tail = digits.length === 8 ? digits.slice(6) : digits.length === 4 ? digits[3]! : '';
    const to = map[base];
    if (!to) return whole;
    touched = true;
    return tail ? `${to}${tail}` : to;
  });

  // Once a value has been through the object model a colour reads as
  // `rgb(190, 58, 34)`, so the same swap has to work in that spelling — and
  // stay in it, since an alpha has nowhere to go in a six-digit hex.
  out = out.replace(
    /(rgba?)\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)([^)]*)\)/gi,
    (whole, fn: string, r: string, g: string, b: string, rest: string) => {
      const hex = `#${[r, g, b].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
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
}

export interface CollectOptions {
  /** Old hex (upper case) → new hex. */
  colorMap?: Record<string, string>;
  lengths?: LengthMap | null;
  /** The root font size, for turning `rem` into pixels. */
  rootPx?: number;
  limit?: number;
}

/**
 * The rules to re-emit, each already wrapped in the grouping rules the
 * original was written under — so an override inherits the breakpoint or
 * feature test that the rule it shadows was written for, rather than applying
 * everywhere.
 */
export function collectOverrides(lists: ArrayLike<RuleLike>[], opts: CollectOptions = {}): string[] {
  const { colorMap = {}, lengths = null, rootPx = 16, limit = MAX_RULES } = opts;
  const useLengths = lengths && !isLengthMapEmpty(lengths) ? lengths : null;
  if (!Object.keys(colorMap).length && !useLengths) return [];

  /**
   * Consecutive rules under the same wrappers share them, which is what the
   * nested walk this replaced produced. Only consecutive ones: re-ordering to
   * group them would change which of two equally specific overrides wins, and
   * document order is the page's answer to that.
   */
  const out: string[] = [];
  let openKey: string | null = null;
  let open: string[] = [];
  let buffer: string[] = [];
  const flush = () => {
    if (!buffer.length) return;
    out.push(open.reduceRight((inner, head) => `${head}{${inner}}`, buffer.join('')));
    buffer = [];
  };

  eachStyleRule(
    lists,
    (rule, groups, parents) => {
      const decls: string[] = [];
      // The rule's own size names the role its weight and line-height belong to.
      const ruleFontPx = useLengths ? lengthPx(rule.style.getPropertyValue('font-size'), rootPx) : null;
      for (const prop of Array.from(rule.style)) {
        const value = rule.style.getPropertyValue(prop);
        const swapped =
          substitute(value, colorMap) ?? (useLengths ? rewriteLength(prop, value, useLengths, ruleFontPx, rootPx) : null);
        if (!swapped) continue;
        // Keep their priority: an `!important` original needs an `!important`
        // shadow to beat it, and a normal one must not become important.
        const priority = rule.style.getPropertyPriority(prop);
        decls.push(`${prop}:${swapped}${priority ? ' !important' : ''}`);
      }
      if (!decls.length) return;
      const key = groups.join('\u0000');
      if (key !== openKey) {
        flush();
        openKey = key;
        open = groups;
      }
      // A nested rule's selector is relative to the one it sits in. Emitted
      // as written, `&:hover` would mean `:root:hover` out here.
      buffer.push(`${resolveNested(parents, rule.selectorText)}{${decls.join(';')}}`);
    },
    limit,
  );
  flush();
  return out;
}
