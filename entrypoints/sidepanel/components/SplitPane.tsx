import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Neither pane may vanish: a tree you cannot see is a tree you cannot pick from. */
export function clampRatio(ratio: number, min = 0.15, max = 0.85): number {
  if (!Number.isFinite(ratio)) return min;
  return Math.min(max, Math.max(min, ratio));
}

function readRatio(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : clampRatio(parseFloat(raw));
  } catch {
    return fallback;
  }
}

/**
 * Two panes, one above the other, with a handle between them. The ratio is
 * remembered per key in localStorage — a convenience for this browser, not
 * state anything else reads.
 */
export function SplitPane({
  top,
  bottom,
  storageKey,
  defaultRatio = 0.4,
  min = 0.15,
  max = 0.85,
}: {
  top: ReactNode;
  bottom: ReactNode;
  storageKey: string;
  defaultRatio?: number;
  min?: number;
  max?: number;
}) {
  const [ratio, setRatio] = useState(() => readRatio(storageKey, defaultRatio));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(ratio));
    } catch {
      /* private mode */
    }
  }, [storageKey, ratio]);

  const fromPointer = (clientY: number) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box || box.height === 0) return;
    setRatio(clampRatio((clientY - box.top) / box.height, min, max));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e.clientY);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === 'ArrowUp' ? -0.05 : e.key === 'ArrowDown' ? 0.05 : 0;
    if (!delta) return;
    e.preventDefault();
    setRatio((r) => clampRatio(r + delta, min, max));
  };

  return (
    <div ref={ref} className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-col" style={{ flex: `${ratio} 1 0px` }}>
        {top}
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={Math.round(min * 100)}
        aria-valuemax={Math.round(max * 100)}
        aria-label="Resize the layers tree"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onKeyDown={onKeyDown}
        className="group flex h-1.5 shrink-0 cursor-row-resize items-center justify-center border-y border-line-subtle bg-surface-recessed hover:bg-surface-control"
      >
        <span className="h-0.5 w-8 rounded-full bg-line-strong group-hover:bg-ink-faint" />
      </div>
      <div className="flex min-h-0 flex-col" style={{ flex: `${1 - ratio} 1 0px` }}>
        {bottom}
      </div>
    </div>
  );
}
