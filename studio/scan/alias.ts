/**
 * What a `var()` value points at, followed to the literal.
 *
 * `--button-bg: var(--mark)` is a decision about the button, not about the
 * colour: an edit to it should usually land on `--mark`, and the panel has
 * to know the chain to say so. A value that merely contains a `var()` —
 * `calc(var(--space) * 2)` — is computed, not an alias, and is left alone.
 */

export interface AliasResult {
  /** The names followed, nearest first; empty when the value is not a plain `var()`. */
  chain: string[];
  /** The literal the chain ends in, or null when it does not resolve or cycles. */
  resolved: string | null;
}

/** `var(--x)` or `var(--x, fallback)` on its own, or null. */
export function plainVar(value: string): { name: string; fallback: string | null } | null {
  const v = value.trim();
  if (!/^var\(/i.test(v) || v[v.length - 1] !== ')') return null;
  // The closing paren must be the one that opened `var(`.
  let depth = 0;
  for (let i = 0; i < v.length; i++) {
    const ch = v[i]!;
    if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0 && i !== v.length - 1) return null;
  }
  const inner = v.slice(4, -1).trim();
  const comma = inner.indexOf(',');
  const name = (comma === -1 ? inner : inner.slice(0, comma)).trim();
  if (!/^--[\w-]+$/.test(name)) return null;
  return { name, fallback: comma === -1 ? null : inner.slice(comma + 1).trim() || null };
}

export function resolveAlias(value: string, lookup: (name: string) => string | undefined, maxHops = 8): AliasResult {
  const chain: string[] = [];
  let current = value;
  for (let hop = 0; hop < maxHops; hop++) {
    const ref = plainVar(current);
    if (!ref) return { chain, resolved: chain.length ? current.trim() : null };
    if (chain.includes(ref.name)) return { chain, resolved: null };
    chain.push(ref.name);
    const next = lookup(ref.name);
    if (next === undefined) {
      if (ref.fallback && !plainVar(ref.fallback) && !/var\(/i.test(ref.fallback)) return { chain, resolved: ref.fallback };
      return { chain, resolved: null };
    }
    current = next;
  }
  return { chain, resolved: null };
}
