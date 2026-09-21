/**
 * Push a document off one of its edges, and put it back exactly.
 *
 * The bar takes its strip from the top of the page and the rail its column
 * from the left, and both do it the same way: the root's inline margin, with
 * `!important`, which is the one declaration nothing in a stylesheet can
 * outrank. What the page had there is kept and restored as written — value
 * and priority — rather than cleared.
 */
export interface RootPush {
  /** Push by this many pixels; asked again with a new size, it moves rather than stacks. */
  set(px: number): void;
  /** Put the page's own margin back. Nothing happens when nothing was pushed. */
  clear(): void;
  /** Whether the page is pushed right now. */
  readonly on: boolean;
}

export function createRootPush(side: 'top' | 'left', doc: Document = document): RootPush {
  const prop = `margin-${side}`;
  let kept: { value: string; priority: string } | null = null;
  return {
    set(px) {
      const root = doc.documentElement;
      if (!kept) kept = { value: root.style.getPropertyValue(prop), priority: root.style.getPropertyPriority(prop) };
      root.style.setProperty(prop, `${px}px`, 'important');
    },
    clear() {
      if (!kept) return;
      const root = doc.documentElement;
      if (kept.value) root.style.setProperty(prop, kept.value, kept.priority);
      else root.style.removeProperty(prop);
      kept = null;
    },
    get on() {
      return kept !== null;
    },
  };
}
