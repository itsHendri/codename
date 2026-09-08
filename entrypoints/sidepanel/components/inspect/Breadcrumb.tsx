import { useEffect, useRef } from 'react';

export function Breadcrumb({
  items,
  onSelect,
}: {
  items: { tag: string; selector: string }[];
  onSelect: (index: number) => void;
}) {
  const row = useRef<HTMLDivElement>(null);
  // The current element is the last item; keep it in view as the trail grows.
  useEffect(() => {
    if (row.current) row.current.scrollLeft = row.current.scrollWidth;
  }, [items]);

  const last = items.length - 1;
  return (
    <div ref={row} className="flex items-center gap-1 overflow-x-auto whitespace-nowrap font-mono text-2xs [scrollbar-width:none]">
      {items.map((item, i) => (
        <span key={`${i}-${item.selector}`} className="flex items-center gap-1">
          {i === last ? (
            <span className="rounded-control bg-accent-soft px-1 font-medium text-accent" title={item.selector} aria-current="true">
              {item.tag}
            </span>
          ) : (
            <button
              onClick={() => onSelect(i)}
              title={item.selector}
              className="rounded-control px-1 text-ink-muted hover:bg-surface-control hover:text-ink"
            >
              {item.tag}
            </button>
          )}
          {i < last && <span className="text-ink-faint" aria-hidden>›</span>}
        </span>
      ))}
    </div>
  );
}
