/**
 * Where a page keeps its own dark mode, so the panel can switch it on
 * without the browser's help.
 *
 * Two places, in practice. Rules inside `@media (prefers-color-scheme: dark)`
 * follow the OS; a theme switcher instead hangs them off a hook — `html.dark`,
 * `[data-theme="dark"]` — that a script sets. Neither needs the debugger
 * permission to emulate: the media rules can be re-emitted without their
 * condition, and the hook can simply be set. This file decides what counts;
 * the content script does the walking.
 */

export type DarkHook = { kind: 'class'; name: string } | { kind: 'attr'; name: string; value: string };

const DARK_MEDIA = /prefers-color-scheme\s*:\s*dark/i;
const LIGHT_MEDIA = /prefers-color-scheme\s*:\s*light/i;

export const isDarkMedia = (condition: string): boolean => DARK_MEDIA.test(condition);
export const isLightMedia = (condition: string): boolean => LIGHT_MEDIA.test(condition);

/**
 * The condition left once the dark query is taken out, or null when nothing
 * is left. `(prefers-color-scheme: dark) and (min-width: 600px)` still needs
 * its breakpoint. A condition joined with commas or `or` is left alone —
 * `undefined` — because dropping one arm changes what the others mean.
 */
export function withoutDarkQuery(condition: string): string | null | undefined {
  const c = condition.trim();
  if (!DARK_MEDIA.test(c)) return undefined;
  if (/,|\bor\b/i.test(c)) return undefined;
  const parts = c.split(/\s+and\s+/i).map((p) => p.trim());
  const rest = parts.filter((p) => !DARK_MEDIA.test(p) && !/^(screen|all)$/i.test(p));
  return rest.length ? rest.join(' and ') : null;
}

const CLASS_HOOK = /(?:^|[\s>,~+]|html|body|:root)\.(dark|dark-mode|dark-theme|theme-dark|mode-dark)(?![\w-])/i;
const ATTR_HOOK = /\[(data-(?:theme|mode|color-mode|color-scheme|bs-theme|appearance))\s*=\s*["']?dark["']?\]/i;

/**
 * The hook a selector hangs a dark rule off, when it does. Only the leftmost
 * compound counts — `.dark .card` is a dark-mode rule for cards, while
 * `.card .dark-badge` is not a mode at all.
 */
export function hookFromSelector(selector: string): DarkHook | null {
  const first = selector.split(/\s*[\s>~+]\s*/)[0] ?? selector;
  const attr = ATTR_HOOK.exec(first);
  if (attr) return { kind: 'attr', name: attr[1]!.toLowerCase(), value: 'dark' };
  const cls = CLASS_HOOK.exec(` ${first}`);
  if (cls) return { kind: 'class', name: cls[1]! };
  return null;
}

export const hookKey = (h: DarkHook): string => (h.kind === 'class' ? `.${h.name}` : `[${h.name}="${h.value}"]`);
