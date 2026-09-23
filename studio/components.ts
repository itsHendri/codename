/**
 * The page's components, as its framework knows them: every component that
 * rendered something on this page, with where each copy of it starts.
 *
 * The same rule as `framework.ts`: the page is asked in its own world, only
 * dev-build fields are read, and a production bundle says nothing rather
 * than something invented. `componentsSource` runs there and brings back
 * plain strings; `refineComponents` judges them here, where it is tested.
 *
 * An element is where a copy of a component starts when the component that
 * rendered it is not the one that rendered its parent. Grouped by that
 * component, those are its instances — twelve cards, one header.
 */

import { named } from './framework';

/** What the page's world brings back, unjudged. */
export interface RawComponent {
  via: 'react' | 'vue';
  name: string;
  file?: string;
  /** A structural selector for where each copy starts, `body > :nth-child(2) > …`. */
  roots: string[];
  /** How many copies there are; `roots` may stop short of it. */
  count: number;
}

/** One component on this page, and its copies. */
export interface PageComponent {
  name: string;
  via: 'react' | 'vue';
  file?: string;
  /** How many copies of it are on the page. */
  count: number;
  /** Where each copy starts, in document order, as far as the list was kept. */
  roots: string[];
}

/** How many elements are looked at, and how many copies of one component are kept. */
export const SCAN_LIMIT = 6000;
export const ROOTS_KEPT = 40;

/**
 * Runs in the page's own world with `world: 'MAIN'`, serialised, so it
 * closes over nothing: every helper is inside it.
 */
export function componentsSource(limit: number, kept: number): RawComponent[] {
  const nameOfType = (type: unknown, depth = 0): string | undefined => {
    if (depth > 4 || !type) return undefined;
    if (typeof type === 'function') {
      const fn = type as { displayName?: string; name?: string };
      return fn.displayName || fn.name || undefined;
    }
    if (typeof type === 'object') {
      const obj = type as { displayName?: string; render?: unknown; type?: unknown };
      return obj.displayName || nameOfType(obj.render ?? obj.type, depth + 1);
    }
    return undefined;
  };
  const fiberOf = (el: Element): Record<string, unknown> | null => {
    for (const key of Object.keys(el)) {
      if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')) {
        return (el as unknown as Record<string, Record<string, unknown> | null>)[key] ?? null;
      }
    }
    return null;
  };
  /** The thing that rendered an element: an owner fiber in React, an instance in Vue. */
  const ownerOf = (el: Element): { key: object; via: 'react' | 'vue'; name?: string; file?: string } | null => {
    const fiber = fiberOf(el);
    if (fiber) {
      const owner = fiber._debugOwner as Record<string, unknown> | null | undefined;
      if (!owner) return null;
      return { key: owner, via: 'react', name: nameOfType(owner.type ?? owner.elementType) ?? (typeof owner.name === 'string' ? owner.name : undefined) };
    }
    const vnode = (el as unknown as { __vnode?: { ctx?: unknown } }).__vnode;
    const inst = (vnode?.ctx ?? (el as unknown as { __vueParentComponent?: unknown }).__vueParentComponent) as
      | { type?: { __name?: string; name?: string; __file?: string } }
      | null
      | undefined;
    if (inst && typeof inst === 'object') {
      const t = inst.type ?? {};
      return { key: inst, via: 'vue', name: t.__name || t.name, file: t.__file };
    }
    return null;
  };
  const path = (el: Element): string => {
    const steps: string[] = [];
    for (let n: Element | null = el; n && n !== document.body && n.parentElement; n = n.parentElement) {
      steps.unshift(`:nth-child(${Array.prototype.indexOf.call(n.parentElement.children, n) + 1})`);
    }
    return ['body', ...steps].join(' > ');
  };

  const groups = new Map<string, { via: 'react' | 'vue'; name: string; file?: string; owners: Set<object>; roots: string[] }>();
  try {
    const all = document.body ? document.body.querySelectorAll('*') : [];
    const n = Math.min(all.length, limit);
    for (let i = 0; i < n; i++) {
      const el = all[i]!;
      const owner = ownerOf(el);
      if (!owner?.name) continue;
      const parent = el.parentElement;
      const up = parent && parent !== document.body ? ownerOf(parent) : null;
      if (up && up.key === owner.key) continue;
      const id = `${owner.via}:${owner.name}:${owner.file ?? ''}`;
      let g = groups.get(id);
      if (!g) groups.set(id, (g = { via: owner.via, name: owner.name, file: owner.file, owners: new Set(), roots: [] }));
      // One copy per owner: a component that renders two elements side by
      // side is one copy with two roots, and the first one stands for it.
      if (g.owners.has(owner.key)) continue;
      g.owners.add(owner.key);
      if (g.roots.length < kept) g.roots.push(path(el));
    }
  } catch {
    // Internals not shaped the way this expects say nothing.
    return [];
  }
  return Array.from(groups.values(), (g) => ({
    via: g.via,
    name: g.name,
    ...(g.file ? { file: g.file } : {}),
    roots: g.roots,
    count: g.owners.size,
  }));
}

/**
 * The page's own answer, judged: names that are internals or wrappers go,
 * copies are counted, and the list reads biggest first — the component there
 * are twelve of is the one a designer is looking for.
 */
export function refineComponents(raw: unknown): PageComponent[] {
  if (!Array.isArray(raw)) return [];
  const out = new Map<string, PageComponent>();
  for (const r of raw as Partial<RawComponent>[]) {
    if (!r || (r.via !== 'react' && r.via !== 'vue')) continue;
    const name = named(r.name);
    const via = r.via;
    if (!name) continue;
    const roots = Array.isArray(r.roots) ? r.roots.filter((s): s is string => typeof s === 'string') : [];
    const count = typeof r.count === 'number' ? r.count : roots.length;
    if (!count) continue;
    // `Memo(Card)` and `Card` are one component.
    const key = `${via}:${name}:${r.file ?? ''}`;
    const prev = out.get(key);
    if (prev) {
      prev.count += count;
      prev.roots.push(...roots);
    } else {
      out.set(key, { name, via, ...(typeof r.file === 'string' && r.file ? { file: r.file } : {}), count, roots });
    }
  }
  return [...out.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
