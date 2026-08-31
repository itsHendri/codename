import { useCallback, useEffect, useState } from 'react';
import { DEVICE_PRESETS } from '@/shared/types';
import { WarnIcon } from './icons';

interface Preset {
  name: string;
  width: number;
  height: number;
  custom?: boolean;
}

const MIN_OUTER_WIDTH = 500;

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

export function ResizeTab({ tabId, restricted }: { tabId: number | null; restricted: boolean }) {
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);
  const [outer, setOuter] = useState<{ width: number; height: number } | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [customs, setCustoms] = useState<Preset[]>([]);
  const [adding, setAdding] = useState(false);
  const [customW, setCustomW] = useState('');
  const [customH, setCustomH] = useState('');
  const [sizeViewport, setSizeViewport] = useState(true);

  const refresh = useCallback(async () => {
    const win = await chrome.windows.getCurrent();
    if (win.width && win.height) setOuter({ width: win.width, height: win.height });
    if (tabId && !restricted) setViewport(await viewportOf(tabId));
  }, [tabId, restricted]);

  useEffect(() => {
    void refresh();
    void chrome.storage.sync.get('customPresets').then((r) => setCustoms((r.customPresets as Preset[]) ?? []));
  }, [refresh]);

  const apply = async (preset: Preset) => {
    const win = await chrome.windows.getCurrent();
    if (win.id == null) return;
    let width = preset.width;
    let height = preset.height;
    if (sizeViewport && viewport && outer) {
      width += outer.width - viewport.width;
      height += outer.height - viewport.height;
    }
    await chrome.windows.update(win.id, {
      width: Math.max(width, MIN_OUTER_WIDTH),
      height: Math.max(height, 200),
      state: 'normal',
    });
    setActivePreset(preset.name);
    setTimeout(() => void refresh(), 300);
  };

  const addCustom = async () => {
    const width = parseInt(customW, 10);
    const height = parseInt(customH, 10);
    if (!width || !height) return;
    const preset: Preset = { name: `${width} × ${height}`, width, height, custom: true };
    const next = [...customs.filter((c) => c.name !== preset.name), preset];
    setCustoms(next);
    await chrome.storage.sync.set({ customPresets: next });
    setAdding(false);
    setCustomW('');
    setCustomH('');
  };

  const removeCustom = async (name: string) => {
    const next = customs.filter((c) => c.name !== name);
    setCustoms(next);
    await chrome.storage.sync.set({ customPresets: next });
  };

  const presets: Preset[] = [...DEVICE_PRESETS.map((p) => ({ ...p })), ...customs];

  return (
    <div className="flex flex-col gap-3 p-3.5">
      <div className="flex flex-col items-center gap-0.5 rounded-lg border border-gray-300 py-3">
        <span className="text-[10px] font-semibold tracking-wide text-gray-400">CURRENT VIEWPORT</span>
        <span className="text-2xl font-semibold tabular-nums">
          {viewport ? `${viewport.width} × ${viewport.height}` : '—'}
        </span>
        <span className="text-[11px] text-gray-400">
          {outer ? `window ${outer.width} × ${outer.height}` : ''}
          {typeof devicePixelRatio === 'number' ? ` · @${devicePixelRatio}x` : ''}
        </span>
      </div>

      <div className="flex items-baseline">
        <span className="font-medium">Presets</span>
        <span className="ml-auto text-xs text-gray-400">click to resize</span>
      </div>

      <div className="flex flex-col gap-2">
        {presets.map((preset) => {
          const isActive = activePreset === preset.name;
          const tooNarrow = preset.width < MIN_OUTER_WIDTH;
          return (
            <button
              key={preset.name}
              onClick={() => apply(preset)}
              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left ${
                isActive ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-gray-300 hover:border-gray-500'
              }`}
            >
              <span className="text-sm">{preset.name}</span>
              {preset.custom && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    void removeCustom(preset.name);
                  }}
                  className="text-[10px] text-gray-400 hover:text-red-600"
                >
                  remove
                </span>
              )}
              <span className={`ml-auto text-xs tabular-nums ${isActive ? '' : 'text-gray-400'}`}>
                {preset.width} × {preset.height}
              </span>
              {tooNarrow && (
                <span className="rounded-full border border-amber-600 px-1.5 text-[9px] text-amber-700">min-width!</span>
              )}
              {isActive && <span className="text-[11px]">✓</span>}
            </button>
          );
        })}

        {adding ? (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-400 px-3 py-2">
            <input
              value={customW}
              onChange={(e) => setCustomW(e.target.value)}
              placeholder="width"
              inputMode="numeric"
              className="w-16 rounded border border-gray-300 px-1.5 py-0.5 text-xs"
            />
            ×
            <input
              value={customH}
              onChange={(e) => setCustomH(e.target.value)}
              placeholder="height"
              inputMode="numeric"
              className="w-16 rounded border border-gray-300 px-1.5 py-0.5 text-xs"
            />
            <button onClick={addCustom} className="ml-auto text-xs text-blue-600 hover:underline">
              save
            </button>
            <button onClick={() => setAdding(false)} className="text-xs text-gray-400 hover:underline">
              cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="rounded-lg border border-dashed border-gray-400 py-2 text-sm text-gray-500 hover:border-gray-600 hover:text-gray-700"
          >
            + Add custom preset
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-dashed border-gray-200 pt-2.5">
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={sizeViewport} onChange={(e) => setSizeViewport(e.target.checked)} />
          Size the viewport (not the window)
        </label>
        <div className="flex gap-2 rounded-lg border border-amber-600 px-2.5 py-2 text-[11px] text-amber-800">
          <WarnIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Chrome can&apos;t shrink a window below ~{MIN_OUTER_WIDTH}px. Phone presets get as close as possible — true
            device emulation is planned for v2.
          </span>
        </div>
      </div>
    </div>
  );
}
