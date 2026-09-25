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

export type Scheme = 'light' | 'dark';
const MEDIA: Record<Scheme, RegExp> = { dark: DARK_MEDIA, light: LIGHT_MEDIA };
const OTHER: Record<Scheme, Scheme> = { dark: 'light', light: 'dark' };
export const isSchemeMedia = (condition: string, scheme: Scheme): boolean => MEDIA[scheme].test(condition);

/**
 * The condition left once a scheme's query is taken out, or null when
 * nothing is left; `undefined` when the condition cannot be simplified.
 * The dark case is documented on `withoutDarkQuery`; light reads the same.
 */
export function withoutSchemeQuery(condition: string, scheme: Scheme): string | null | undefined {
  const c = condition.trim();
  const media = MEDIA[scheme];
  if (!media.test(c)) return undefined;
  if (/,|\bor\b|\bnot\b/i.test(c)) return undefined;
  const parts = c.split(/\s+and\s+/i).map((p) => p.trim());
  const rest = parts.filter((p) => !media.test(p) && !/^(screen|all)$/i.test(p));
  return rest.length ? rest.join(' and ') : null;
}

/**
 * A condition that applies in one scheme and never in the other: its own
 * query, or the other negated. These are what a forced scheme switches off.
 */
export function isSchemeOnly(condition: string, scheme: Scheme): boolean {
  const c = condition.trim();
  if (MEDIA[scheme].test(c) && !MEDIA[OTHER[scheme]].test(c)) return true;
  return new RegExp(`^\\s*not\\s*\\(?\\s*prefers-color-scheme\\s*:\\s*${OTHER[scheme]}`, 'i').test(c);
}

/**
 * The condition left once the dark query is taken out, or null when nothing
 * is left. `(prefers-color-scheme: dark) and (min-width: 600px)` still needs
 * its breakpoint. A condition joined with commas or `or` is left alone —
 * `undefined` — because dropping one arm changes what the others mean.
 */
export function withoutDarkQuery(condition: string): string | null | undefined {
  // `not (prefers-color-scheme: dark)` is a light block wearing dark's words.
  return withoutSchemeQuery(condition, 'dark');
}

/**
 * A media condition that applies in light and never in dark: the explicit
 * light query, or dark negated. These are what a dark preview has to switch
 * off, since hoisting the dark rules alone leaves them live.
 */
export function isLightOnly(condition: string): boolean {
  return isSchemeOnly(condition, 'light');
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

/* ---------------- breakpoints ---------------- */

const WIDTH_FEATURE = /\(\s*(max|min)-width\s*:\s*([^)]+?)\s*\)/gi;
const WIDTH_RANGE = /\(\s*(?:([\d.]+\w*)\s*([<>]=?)\s*)?width(?:\s*([<>]=?)\s*([\d.]+\w*))?\s*\)/gi;

/**
 * The width a media condition scopes to, written one way, or null when it
 * has none. `screen and (max-width: 700px)` is `(max-width: 700px)`; the
 * range form `(width <= 700px)` reads the same. A dark query is not a
 * breakpoint even when it carries one: that value belongs to the dark
 * reading, and reporting it here too would say a variable changes at a
 * width when it changes with the scheme.
 */
export function widthOfMedia(condition: string): string | null {
  if (DARK_MEDIA.test(condition) || LIGHT_MEDIA.test(condition)) return null;
  // `not all and (max-width: 700px)` applies *above* 700, so reading it as a
  // 700px breakpoint inverts what the page says. Same for `not screen and …`.
  if (/(^|\s)not(\s|$)/i.test(condition)) return null;
  const parts: string[] = [];
  for (const m of condition.matchAll(WIDTH_FEATURE)) parts.push(`(${m[1]!.toLowerCase()}-width: ${m[2]!.trim()})`);
  for (const m of condition.matchAll(WIDTH_RANGE)) {
    const [, lo, loOp, hiOp, hi] = m;
    if (lo && loOp) parts.push(`(${loOp.startsWith('<') ? 'min' : 'max'}-width: ${lo})`);
    if (hi && hiOp) parts.push(`(${hiOp.startsWith('<') ? 'max' : 'min'}-width: ${hi})`);
  }
  return parts.length ? parts.join(' and ') : null;
}

/** `(max-width: 700px)` as a chip reads `≤700`; anything else keeps its words. */
export function widthLabel(query: string): string {
  const m = /^\((max|min)-width:\s*([\d.]+)(px)?\)$/.exec(query);
  if (m) return `${m[1] === 'max' ? '≤' : '≥'}${m[2]}`;
  return query;
}

/* ---------------- which side the page is showing ---------------- */

/** What the page looks like right now, for the bar's Light / Dark switch. */
export interface SchemeSignals {
  /** The system prefers dark. */
  prefersDark: boolean;
  /** The page has `prefers-color-scheme: dark` rules of its own. */
  hasDarkRules: boolean;
  /** A dark hook (`html.dark`, `[data-theme="dark"]`) is set on the root or body right now. */
  hookOn: boolean;
  /** The root's computed `color-scheme`. */
  colorScheme: string;
}

/** Root or body attributes a site's own theme script sets for dark. */
const HOOK_ATTR = /^data-(theme|mode|color-mode|color-scheme|bs-theme|appearance|scheme)$/;
const HOOK_CLASS = /^(dark|dark-mode|theme-dark|mode-dark)$/;

export function hookIsOn(els: (Element | null)[]): boolean {
  return els.some((el) => {
    if (!el) return false;
    if (Array.from(el.classList).some((c) => HOOK_CLASS.test(c))) return true;
    return Array.from(el.attributes).some((a) => HOOK_ATTR.test(a.name) && a.value.trim().toLowerCase() === 'dark');
  });
}

/**
 * The side the page is on as the person sees it: dark when its own script
 * has switched it there, or when it follows the system and the system is
 * dark, or when it says so outright in `color-scheme`. A page with no dark
 * side is light whatever the system prefers.
 */
export function pageScheme(signals: SchemeSignals): Scheme {
  if (signals.hookOn) return 'dark';
  if (signals.prefersDark && signals.hasDarkRules) return 'dark';
  if (signals.colorScheme.trim().toLowerCase() === 'dark') return 'dark';
  return 'light';
}
