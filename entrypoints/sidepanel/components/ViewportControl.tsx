import { useCallback, useEffect, useRef, useState } from 'react';
import { DEVICE_PRESETS } from '@/shared/types';

/**
 * Resize was a tab; it is a viewport setting, not a view of anything. As a
 * header control it sits next to the site it applies to and gives a tab slot
 * back — at 360px, six tabs left 60px each.
 */

const MIN_OUTER_WIDTH = 500;

interface Preset {
  name: string;
  width: number;
  height: number;
  custom?: boolean;
}

async function viewportOf(tabId: number): Promise<{ width: number; height: number } | null> {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({ width: innerWidth, height: innerHeight }),
    });
    return (result?.result as { width: number; height: number }) ?? null;
  } catch {
    return null;
  }
}

export function ViewportControl({ tabId, restricted }: { tabId: number | null; restricted: boolean }) {
  const [open, setOpen] = useState(false);
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);
  const [outer, setOuter] = useState<{ width: number; height: number } | null>(null);
  const [customs, setCustoms] = useState<Preset[]>([]);
  const [draft, setDraft] = useState({ w: '', h: '' });
  const wrap = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    const win = await chrome.windows.getCurrent();
    if (win.width && win.height) setOuter({ width: win.width, height: win.height });
    if (tabId && !restricted) setViewport(await viewportOf(tabId));
  }, [tabId, restricted]);

  useEffect(() => {
    void refresh();
    void chrome.storage.sync
      .get('customPresets')
      .then((r) => setCustoms((r.customPresets as Preset[]) ?? []));
  }, [refresh]);

  // Close on an outside click, the way a menu should.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const apply = async (preset: Preset) => {
    const win = await chrome.windows.getCurrent();
    if (win.id == null) return;
    // Size the page area, not the window frame: pad by the chrome delta.
    let width = preset.width;
    let height = preset.height;
    if (viewport && outer) {
      width += outer.width - viewport.width;
      height += outer.height - viewport.height;
    }
    await chrome.windows.update(win.id, {
      width: Math.max(width, MIN_OUTER_WIDTH),
      height: Math.max(height, 200),
      state: 'normal',
    });
    setTimeout(() => void refresh(), 300);
    setOpen(false);
  };

  const addCustom = async () => {
    const width = parseInt(draft.w, 10);
    const height = parseInt(draft.h, 10);
    if (!width || !height) return;
    const preset: Preset = { name: `${width} × ${height}`, width, height, custom: true };
    const next = [...customs.filter((c) => c.name !== preset.name), preset];
    setCustoms(next);
    await chrome.storage.sync.set({ customPresets: next });
    setDraft({ w: '', h: '' });
  };

  const presets: Preset[] = [...DEVICE_PRESETS.map((p) => ({ ...p })), ...customs];

  return (
    <div className="relative" ref={wrap}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-control border border-line px-1.5 py-0.5 text-xs text-ink-secondary hover:border-line-strong"
        title="Resize the page"
      >
        <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 6 V2 H6 M10 2 H14 V6 M14 10 V14 H10 M6 14 H2 V10" />
        </svg>
        {viewport ? viewport.width : '—'}
        <span className="text-2xs">▼</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-card border border-line bg-surface-panel p-2 shadow-lg">
          <div className="mb-1.5 flex items-baseline gap-2 px-1">
            <span className="text-sm font-medium">Viewport</span>
            <span className="ml-auto text-2xs tabular-nums text-ink-muted">
              {viewport ? `${viewport.width} × ${viewport.height}` : 'unknown'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {presets.map((preset) => (
              <button
                key={preset.name}
                onClick={() => apply(preset)}
                className="flex flex-col items-start rounded-control border border-line-subtle px-2 py-1 text-left hover:border-accent hover:bg-accent-soft"
              >
                <span className="text-xs">{preset.name}</span>
                <span className="text-2xs tabular-nums text-ink-muted">
                  {preset.width} × {preset.height}
                  {preset.width < MIN_OUTER_WIDTH && <span className="text-warn-ink"> ~min</span>}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex items-center gap-1 border-t border-dashed border-line-subtle pt-1.5">
            <input
              value={draft.w}
              onChange={(e) => setDraft({ ...draft, w: e.target.value })}
              placeholder="w"
              inputMode="numeric"
              className="w-12 rounded border border-line px-1 py-0.5 text-xs"
            />
            <span className="text-2xs text-ink-muted">×</span>
            <input
              value={draft.h}
              onChange={(e) => setDraft({ ...draft, h: e.target.value })}
              placeholder="h"
              inputMode="numeric"
              className="w-12 rounded border border-line px-1 py-0.5 text-xs"
            />
            <button onClick={addCustom} className="ml-auto text-xs text-accent hover:underline">
              add
            </button>
          </div>
          <p className="mt-1.5 px-1 text-2xs text-warn-ink">
            Chrome won&apos;t shrink below ~{MIN_OUTER_WIDTH}px, so phone widths get as close as they can.
          </p>
        </div>
      )}
    </div>
  );
}
