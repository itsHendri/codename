import type { ReactNode } from 'react';
import { ChevronIcon } from '../icons';

/**
 * One collapsible section of the system. The summary on the right is the point:
 * a collapsed section still tells you what it holds, so you can skip it without
 * opening it.
 */
export function Section({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-line-subtle first:border-t-0">
      {/* The Style column's group head, so the two tabs read as one tool. */}
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="group flex h-[30px] w-full items-center gap-2 px-3 text-left text-xs font-medium text-ink"
      >
        {title}
        <span className="min-w-0 flex-1 truncate text-right text-2xs font-normal text-ink-muted">{summary}</span>
        <ChevronIcon
          className={`h-3 w-3 shrink-0 text-ink-muted transition-transform group-hover:text-ink ${open ? 'rotate-90' : ''}`}
        />
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}
