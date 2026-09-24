/**
 * The specificity of one complex selector, as the cascade counts it:
 * ids, then classes / attributes / pseudo-classes, then types and
 * pseudo-elements. `:is()`, `:not()` and `:has()` count as their most
 * specific argument; `:where()` counts nothing; the `*` and combinators
 * count nothing. Enough to order the rules that match one element.
 */

import { splitSelectorList } from '../conditionSheet';

export type Specificity = [ids: number, classes: number, types: number];

const ZERO_ARG = new Set(['where']);
const MAX_ARG = new Set(['is', 'not', 'has', 'matches', 'any']);

export function specificity(selector: string): Specificity {
  let a = 0;
  let b = 0;
  let c = 0;
  const s = selector.trim();
  let i = 0;
  const ident = () => {
    const start = i;
    while (i < s.length && /[\w-\\]/.test(s[i]!)) i += s[i] === '\\' ? 2 : 1;
    return s.slice(start, i);
  };
  while (i < s.length) {
    const ch = s[i]!;
    if (ch === '#') {
      i++;
      ident();
      a++;
    } else if (ch === '.') {
      i++;
      ident();
      b++;
    } else if (ch === '[') {
      const end = closing(s, i, '[', ']');
      i = end + 1;
      b++;
    } else if (ch === ':') {
      const element = s[i + 1] === ':';
      i += element ? 2 : 1;
      const name = ident().toLowerCase();
      if (s[i] === '(') {
        const end = closing(s, i, '(', ')');
        const inner = s.slice(i + 1, end);
        i = end + 1;
        if (element) {
          c++;
        } else if (ZERO_ARG.has(name)) {
          /* nothing */
        } else if (MAX_ARG.has(name)) {
          const best = splitSelectorList(inner)
            .map(specificity)
            .sort(compare)
            .pop() ?? [0, 0, 0];
          a += best[0];
          b += best[1];
          c += best[2];
        } else if (/^nth-(last-)?(child|of-type)$/.test(name)) {
          // `:nth-child(2 of .x)` adds the most specific of its selectors.
          b++;
          const of = /\bof\s+(.+)$/i.exec(inner);
          if (of) {
            const best = splitSelectorList(of[1]!).map(specificity).sort(compare).pop() ?? [0, 0, 0];
            a += best[0];
            b += best[1];
            c += best[2];
          }
        } else {
          b++;
        }
      } else if (element || /^(before|after|first-line|first-letter)$/.test(name)) {
        c++;
      } else {
        b++;
      }
    } else if (/[a-z]/i.test(ch)) {
      ident();
      c++;
    } else {
      // `*`, combinators, whitespace, commas inside a bad split.
      i++;
    }
  }
  return [a, b, c];
}

function closing(s: string, from: number, open: string, close: string): number {
  let depth = 0;
  let quote = '';
  for (let i = from; i < s.length; i++) {
    const ch = s[i]!;
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return i;
  }
  return s.length - 1;
}

/** Cascade order: negative when `x` loses to `y`. */
export function compare(x: Specificity, y: Specificity): number {
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}
