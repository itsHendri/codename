/**
 * What kind of thing a layer is, at a glance: the glyph every design tool
 * puts before a row. Read from the tag — the one fact about an element the
 * page cannot dress up — into five kinds, since a tree of forty `div`s is
 * scanned by the shapes in it, not by its names.
 */

const TEXT = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'label', 'li', 'strong', 'em', 'b', 'i', 'small', 'blockquote', 'code', 'pre', 'td', 'th', 'dt', 'dd', 'legend', 'figcaption', 'time', 'cite', 'q', 'sup', 'sub', 'mark']);
const MEDIA = new Set(['img', 'svg', 'picture', 'video', 'canvas', 'figure', 'iframe', 'audio', 'object', 'embed']);
const CONTROL = new Set(['button', 'input', 'select', 'textarea', 'summary', 'option']);
const LIST = new Set(['ul', 'ol', 'dl', 'nav', 'menu', 'table', 'tbody', 'thead', 'tr']);

export type LayerKind = 'text' | 'media' | 'control' | 'list' | 'box';

export function kindOf(tag: string): LayerKind {
  const t = tag.toLowerCase();
  if (TEXT.has(t)) return 'text';
  if (MEDIA.has(t)) return 'media';
  if (CONTROL.has(t)) return 'control';
  if (LIST.has(t)) return 'list';
  return 'box';
}

const PATHS: Record<LayerKind, string> = {
  text: 'M3 3.5h8M7 3.5V12',
  media: 'M2 3.5h10v7H2zM2 9l2.8-2.6L7.5 9l1.7-1.6L12 9',
  control: 'M1.5 4.5h11v5h-11zM4.5 7h5',
  list: 'M2 3.5h10M2 7h10M2 10.5h10',
  box: 'M2.5 2.5h9v9h-9z',
};

export function LayerIcon({ tag, className = 'text-ink-muted' }: { tag: string; className?: string }) {
  const kind = kindOf(tag);
  return (
    <svg
      viewBox="0 0 14 14"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
      data-kind={kind}
    >
      <path d={PATHS[kind]} />
    </svg>
  );
}
