/**
 * Every place a page defines each of its variables, with the scope it sits
 * in — the token graph's edges.
 *
 * The text pass (`extractCustomProps`) keeps one value per name, as the
 * cascade did when the page loaded, and the two attach passes add the dark
 * and width readings. This keeps all of them, from the object model, each
 * classified once: the root of the cascade, the page's dark side, a width
 * query, or a component scope. A write needs the list to know where an edit
 * lands; the System panel shows it by scope; and the alias chains let an
 * edit to `--button-bg: var(--mark)` be redirected to `--mark`.
 */

import type { CustomPropInfo, PropDefinition } from '@/shared/types';
import { hookFromSelector, isDarkMedia, widthOfMedia } from '../siteMode';
import { splitSelectorList } from '../conditionSheet';
import { resolveAlias } from './alias';
import { eachStyleRule, MAX_RULES, mediaOf, resolveNested, type RuleLike } from './customProps';

/** A selector part that sits at the root of the cascade for the whole page. */
const ROOT_PART = /^(:root|html|:host)(:not\([^)]*\))*$/i;

/** Which side of the page a rule's declarations belong to. */
export function scopeOf(selector: string, media: string[]): PropDefinition['scope'] {
  if (media.some(isDarkMedia)) return 'dark';
  const parts = splitSelectorList(selector);
  if (parts.some((p) => hookFromSelector(p) !== null)) return 'dark';
  if (media.some((m) => widthOfMedia(m) !== null)) return 'width';
  return parts.every((p) => ROOT_PART.test(p.trim())) ? 'root' : 'scoped';
}

const layerOf = (groups: string[]): string | undefined => {
  const head = [...groups].reverse().find((g) => /^@layer\b/i.test(g));
  const name = head?.replace(/^@layer\s*/i, '').trim();
  return name || undefined;
};

/** Every definition of every custom property, keyed by name, in document order. */
export function collectDefinitions(lists: ArrayLike<RuleLike>[], limit = MAX_RULES): Map<string, PropDefinition[]> {
  const found = new Map<string, PropDefinition[]>();
  eachStyleRule(
    lists,
    (rule, groups, parents) => {
      const names = Array.from(rule.style).filter((p) => p.startsWith('--'));
      if (!names.length) return;
      const selector = resolveNested(parents, rule.selectorText);
      const media = groups.map(mediaOf).filter((m): m is string => m !== null);
      const layer = layerOf(groups);
      const source = (rule as CSSStyleRule & { parentStyleSheet?: { href?: string | null } | null }).parentStyleSheet?.href ?? undefined;
      const scope = scopeOf(selector, media);
      for (const name of names) {
        const value = rule.style.getPropertyValue(name).trim();
        if (!value) continue;
        (found.get(name) ?? found.set(name, []).get(name)!).push({
          value,
          selector,
          media,
          ...(layer ? { layer } : {}),
          ...(source ? { source } : {}),
          scope,
        });
      }
    },
    limit,
  );
  return found;
}

/**
 * Attach each variable's definitions and its alias chain. The chain is
 * followed through light values, since that is the side the base value is.
 */
export function attachDefinitions(props: CustomPropInfo[], lists: ArrayLike<RuleLike>[], limit = MAX_RULES): void {
  const found = collectDefinitions(lists, limit);
  const byName = new Map(props.map((p) => [p.name, p]));
  for (const p of props) {
    const defs = found.get(p.name);
    if (defs?.length) p.definitions = defs;
    const { chain, resolved } = resolveAlias(p.value, (name) => byName.get(name)?.value);
    if (chain.length) {
      p.alias = chain;
      if (resolved !== null) p.resolved = resolved;
    }
  }
}
