import type { ComponentType } from 'react';

export interface StripItem<K extends string> {
  key: K;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  /** A longer name for the tooltip, when the label is short. */
  title?: string;
}

/** The strip's width in the page, for the rail's host and the push it makes. */
export const STRIP_WIDTH = 60;

/**
 * The rail's far-left strip: one icon over a small label per section, the
 * way Figma and Weave lay out the left of the canvas. The column beside it
 * shows the section chosen; choosing the one already open folds the
 * column, and the strip stays. Arrows move focus and selection together.
 */
export function SideStrip<K extends string>({
  items,
  active,
  open,
  onSelect,
  ariaLabel,
  idPrefix = 'strip',
}: {
  items: readonly StripItem<K>[];
  active: K;
  /** Whether the column beside the strip is showing. */
  open: boolean;
  onSelect: (key: K) => void;
  ariaLabel: string;
  idPrefix?: string;
}) {
  const onKeyDown = (e: React.KeyboardEvent) => {
    const idx = items.findIndex((t) => t.key === active);
    const next =
      e.key === 'ArrowDown'
        ? (idx + 1) % items.length
        : e.key === 'ArrowUp'
          ? (idx - 1 + items.length) % items.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? items.length - 1
              : -1;
    if (next < 0) return;
    e.preventDefault();
    onSelect(items[next]!.key);
    (e.currentTarget as HTMLElement).querySelector<HTMLElement>(`#${idPrefix}-${items[next]!.key}`)?.focus();
  };
  return (
    <nav
      role="tablist"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      className="flex shrink-0 flex-col items-stretch gap-0.5 border-r border-line p-1"
      style={{ width: STRIP_WIDTH }}
      onKeyDown={onKeyDown}
    >
      {items.map(({ key, label, Icon, title }) => {
        const on = active === key && open;
        return (
          <button
            key={key}
            role="tab"
            id={`${idPrefix}-${key}`}
            aria-selected={active === key}
            aria-expanded={active === key ? open : undefined}
            tabIndex={active === key ? 0 : -1}
            onClick={() => onSelect(key)}
            title={title ?? label}
            className={`flex h-11 flex-col items-center justify-center gap-0.5 rounded-control text-[9px] leading-none ${
              on ? 'bg-surface-control font-medium text-ink' : 'text-ink-muted hover:bg-surface-control/60 hover:text-ink'
            }`}
          >
            <Icon />
            <span className="max-w-full truncate">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
