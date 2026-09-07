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
        className="flex items-center gap-1 rounded-md border border-gray-300 px-1.5 py-0.5 text-[11px] text-gray-600 hover:border-gray-500"
        title="Resize the page"
      >
        <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 6 V2 H6 M10 2 H14 V6 M14 10 V14 H10 M6 14 H2 V10" />
        </svg>
        {viewport ? viewport.width : '—'}
        <span className="text-[8px]">▼</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border border-gray-300 bg-white p-2 shadow-lg">
          <div className="mb-1.5 flex items-baseline gap-2 px-1">
            <span className="text-xs font-medium">Viewport</span>
            <span className="ml-auto text-[10px] tabular-nums text-gray-400">
              {viewport ? `${viewport.width} × ${viewport.height}` : 'unknown'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {presets.map((preset) => (
              <button
                key={preset.name}
                onClick={() => apply(preset)}
                className="flex flex-col items-start rounded-md border border-gray-200 px-2 py-1 text-left hover:border-blue-600 hover:bg-blue-50"
              >
                <span className="text-[11px]">{preset.name}</span>
                <span className="text-[10px] tabular-nums text-gray-400">
                  {preset.width} × {preset.height}
                  {preset.width < MIN_OUTER_WIDTH && <span className="text-amber-700"> ~min</span>}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex items-center gap-1 border-t border-dashed border-gray-200 pt-1.5">
            <input
              value={draft.w}
              onChange={(e) => setDraft({ ...draft, w: e.target.value })}
              placeholder="w"
              inputMode="numeric"
              className="w-12 rounded border border-gray-300 px-1 py-0.5 text-[11px]"
            />
            <span className="text-[10px] text-gray-400">×</span>
            <input
              value={draft.h}
              onChange={(e) => setDraft({ ...draft, h: e.target.value })}
              placeholder="h"
              inputMode="numeric"
              className="w-12 rounded border border-gray-300 px-1 py-0.5 text-[11px]"
            />
            <button onClick={addCustom} className="ml-auto text-[11px] text-blue-600 hover:underline">
              add
            </button>
          </div>
          <p className="mt-1.5 px-1 text-[10px] text-amber-700">
            Chrome won&apos;t shrink below ~{MIN_OUTER_WIDTH}px, so phone widths get as close as they can.
          </p>
        </div>
      )}
    </div>
  );
}
