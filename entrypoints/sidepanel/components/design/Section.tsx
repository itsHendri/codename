import type { ReactNode } from 'react';

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
    <div className="border-t border-gray-200 first:border-t-0">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left hover:bg-gray-50"
      >
        <span className={`text-[10px] text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}>
          ▶
        </span>
        <span className="font-medium">{title}</span>
        <span className="ml-auto truncate text-[11px] text-gray-400">{summary}</span>
      </button>
      {open && <div className="px-3.5 pb-4">{children}</div>}
    </div>
  );
}
