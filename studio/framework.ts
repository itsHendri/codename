/**
 * The component an element came from, when the framework's dev build says so.
 *
 * The rule everywhere else here is that the extension sees the rendered page,
 * so a file position would be a guess. This is the one place the page can be
 * asked directly — but only from the page's own world. A content script runs
 * in an isolated world, where DOM *nodes* are shared and the expandos a page
 * script hangs off them are not: `__reactFiber$…`, `__vueParentComponent` and
 * `window.ng` are all invisible from there. So the reading is done by a
 * probe injected with `world: 'MAIN'` (`probeSource`), which returns raw
 * strings, and the judging — what counts as a name, how it is worded — stays
 * here, where it can be tested.
 *
 * Attributes are the exception: they belong to the node, so a build plugin's
 * `data-v-inspector` reads fine from the isolated world.
 *
 * The rule holds in the form that matters: nothing is derived from class
 * names or heuristics, and where no build answers, the answer is null. Only
 * dev-only fields are read, so a production bundle — whose names are
 * minified anyway — says nothing rather than something invented.
 */

export interface ComponentOrigin {
  /** The component's own name, as the framework knows it. */
  name: string;
  /** Who said so, so the brief can say how it knows. */
  via: 'react' | 'vue' | 'angular' | 'attribute';
  /**
   * The source path, only where the build stated it (Vue's `__file`, an
   * inspector plugin's attribute). Never derived, never a line number we
   * worked out ourselves.
   */
  file?: string;
}

/** A name worth reporting: not a host tag, not an anonymous or internal wrapper. */
function usable(name: unknown): name is string {
  if (typeof name !== 'string') return false;
  const n = name.trim();
  if (!n || n.length > 80) return false;
  // React's internals and common wrappers say nothing about the design.
  if (/^(Anonymous|Unknown|_default|Fragment|Suspense|StrictMode|Provider|Consumer|Context|ForwardRef|Memo)$/.test(n)) return false;
  return /^[A-Za-z_$][\w$.]*$/.test(n);
}

const clean = (name: string): string => {
  let n = name.trim();
  // memo and forwardRef wrap the real name, sometimes twice over.
  for (let i = 0; i < 4; i++) {
    const m = /^(?:Memo|ForwardRef)\((.+)\)$/.exec(n);
    if (!m) break;
    n = m[1]!;
  }
  return n.replace(/^[_$]+/, '');
};

/** The wrapper comes off before the name is judged, so `Memo(Field)` is `Field`. */
const named = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const n = clean(raw);
  return usable(n) ? n : null;
};

/* ---------------- what the page's own world reports ---------------- */

/** What the probe brings back: unjudged strings, nothing live. */
export interface RawProbe {
  via: 'react' | 'vue' | 'angular';
  name?: string;
  file?: string;
}

/**
 * The probe, as source, to be injected with `world: 'MAIN'`. It must stand
 * alone — `chrome.scripting.executeScript` serialises it, so it can close
 * over nothing — which is why it only reads and never judges.
 *
 * React: `_debugOwner` is the component that rendered the element and exists
 * only in a dev build, so a production bundle falls through to null rather
 * than reporting a minified ancestor. Across a server-component boundary the
 * owner is a plain `{ name }` record rather than a fiber, which is why both
 * shapes are read.
 *
 * Vue: the owner is `__vnode.ctx` — the instance whose render created the
 * element. `__vueParentComponent` is the instance whose subtree it was
 * patched into, which is a different thing for slot content, and using it
 * would name the receiving component and its file for markup it does not
 * contain.
 */
export function probeSource(selector: string): RawProbe | null {
  const el = (() => {
    try {
      return document.querySelector(selector);
    } catch {
      return null;
    }
  })();
  if (!el) return null;

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

  try {
    // React: the fiber, then the chain of owners a dev build records.
    let fiber: Record<string, unknown> | null = null;
    for (const key of Object.keys(el)) {
      if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')) {
        fiber = (el as unknown as Record<string, Record<string, unknown> | null>)[key] ?? null;
        break;
      }
    }
    for (let node = fiber, depth = 0; node && depth < 12; depth++) {
      const owner = node._debugOwner as Record<string, unknown> | null | undefined;
      if (owner) {
        // A fiber names its type; a server-component record names itself.
        const name = nameOfType(owner.type ?? owner.elementType) ?? (typeof owner.name === 'string' ? owner.name : undefined);
        if (name) return { via: 'react', name };
      }
      node = (node.return as Record<string, unknown> | null) ?? null;
    }

    // Vue: the instance whose render created this element.
    const vnode = (el as unknown as { __vnode?: { ctx?: unknown } }).__vnode;
    const owner = (vnode?.ctx ?? (el as unknown as { __vueParentComponent?: unknown }).__vueParentComponent) as
      | { type?: { __name?: string; name?: string; __file?: string }; parent?: unknown }
      | null
      | undefined;
    for (let node = owner, depth = 0; node && depth < 12; depth++) {
      const type = node.type ?? {};
      const name = type.__name || type.name;
      if (name) return { via: 'vue', name, ...(type.__file ? { file: type.__file } : {}) };
      node = node.parent as typeof node;
    }

    // Angular's dev-mode global; a production build does not define it.
    const ng = (window as unknown as { ng?: { getComponent?: (el: Element) => unknown } }).ng;
    if (ng && typeof ng.getComponent === 'function') {
      for (let node: Element | null = el; node; node = node.parentElement) {
        const found = ng.getComponent(node) as { constructor?: { name?: string } } | null;
        const name = found?.constructor?.name;
        if (name) return { via: 'angular', name };
      }
    }
  } catch {
    // A framework internal that is not shaped the way we expect says nothing.
    return null;
  }
  return null;
}

/** The probe's raw answer, judged: a usable name, or nothing. */
export function refineProbe(raw: RawProbe | null | undefined): ComponentOrigin | null {
  const name = named(raw?.name);
  if (!raw || !name) return null;
  return { name, via: raw.via, ...(raw.file ? { file: raw.file } : {}) };
}

/* ---------------- attributes a build plugin wrote ---------------- */

/**
 * `path:line:column`, as vite-plugin-vue-inspector writes it. The path is
 * everything before the last two colons, so an absolute Windows path keeps
 * its drive letter instead of becoming a component called `C`.
 */
function fromVInspector(value: string): ComponentOrigin | null {
  const m = /^(.*):\d+:\d+$/.exec(value.trim());
  const path = (m?.[1] ?? value).trim();
  if (!path) return null;
  const base = named(path.split(/[\\/]/).pop()?.replace(/\.\w+$/, ''));
  return base ? { name: base, via: 'attribute', file: path } : null;
}

/**
 * What a build plugin wrote onto this element — and only this element. An
 * ancestor's `data-component` says what the ancestor is, not what the thing
 * you selected is, and a site that labels its whole layout would otherwise
 * put that one name on every element in the page.
 */
export function attributeComponent(el: Element): ComponentOrigin | null {
  const v = el.getAttribute('data-v-inspector');
  if (v) {
    const origin = fromVInspector(v);
    if (origin) return origin;
  }

  const path = el.getAttribute('data-inspector-relative-path');
  const component = named(el.getAttribute('data-inspector-component'));
  if (component) return { name: component, via: 'attribute', ...(path ? { file: path } : {}) };

  const declared = named(el.getAttribute('data-component'));
  return declared ? { name: declared, via: 'attribute' } : null;
}

/* ---------------- the one entry point ---------------- */

/**
 * What an isolated world can answer on its own: the attributes on the node.
 * The framework's own account of the element comes from `probeSource`, run
 * in the page's world, and is merged in by whoever asked.
 */
export function componentOf(el: Element): ComponentOrigin | null {
  try {
    return attributeComponent(el);
  } catch {
    return null;
  }
}

/** How the origin reads in a sentence, for the brief and the panel's tooltip. */
export function describeOrigin(origin: ComponentOrigin): string {
  const how =
    origin.via === 'react' ? "React's dev build"
      : origin.via === 'vue' ? "Vue's dev build"
        : origin.via === 'angular' ? "Angular's dev mode"
          : 'a build plugin attribute';
  return `${origin.name}${origin.file ? ` (${origin.file})` : ''}, as ${how} names it`;
}
