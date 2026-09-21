import type { ComponentType } from 'react';

export interface TabDef<K extends string> {
  key: K;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  /** A count shown on the tab, when there is one. */
  badge?: number;
}

/**
 * One strip of tabs for both sides of the page: the rail on the left and
 * the panel on the right wear the same one, icon over label, the height
 * of the bar, so the three read as one piece of chrome. Arrows move both
 * focus and selection, as a tablist should.
 */
export function TabStrip<K extends string>({
  tabs,
  active,
  onSelect,
  ariaLabel,
  idPrefix = 'tab',
}: {
  tabs: readonly TabDef<K>[];
  active: K;
  onSelect: (key: K) => void;
  ariaLabel: string;
  idPrefix?: string;
}) {
  const onKeyDown = (e: React.KeyboardEvent) => {
    const idx = tabs.findIndex((t) => t.key === active);
    const next =
      e.key === 'ArrowRight' ? (idx + 1) % tabs.length
      : e.key === 'ArrowLeft' ? (idx - 1 + tabs.length) % tabs.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? tabs.length - 1
      : -1;
    if (next < 0) return;
    e.preventDefault();
    onSelect(tabs[next]!.key);
    document.getElementById(`${idPrefix}-${tabs[next]!.key}`)?.focus();
  };
  return (
    <nav
      role="tablist"
      aria-label={ariaLabel}
      className="grid h-10 shrink-0 items-stretch border-b border-line-subtle"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      onKeyDown={onKeyDown}
    >
      {tabs.map(({ key, label, Icon, badge }) => (
        <button
          key={key}
          role="tab"
          id={`${idPrefix}-${key}`}
          aria-selected={active === key}
          tabIndex={active === key ? 0 : -1}
          onClick={() => onSelect(key)}
          className={`relative flex flex-col items-center justify-center gap-0.5 text-2xs ${
            active === key
              ? 'border-b-2 border-accent font-medium text-accent'
              : 'border-b-2 border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          <Icon />
          {label}
          {badge != null && badge > 0 && (
            <span className="absolute top-1 right-1/2 translate-x-4 rounded-full bg-accent px-1 font-mono text-2xs leading-4 text-accent-ink">
              {badge}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
