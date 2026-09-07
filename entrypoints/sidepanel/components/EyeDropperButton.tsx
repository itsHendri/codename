import { useEffect, useState } from 'react';
import { colorFormats } from '../lib/color';
import { EyeDropperIcon } from './icons';

declare global {
  interface Window {
    EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> };
  }
}

export type ColorFormat = 'hex' | 'rgb' | 'hsl' | 'oklch';

export function formatColor(hex: string, format: ColorFormat): string {
  return colorFormats(hex)[format];
}

/**
 * Picking a colour off the screen belongs with the other "point at something and
 * tell me what it is" tools, not with the page's palette — the palette is the
 * system, this is a probe. It also works where a scan cannot: the native
 * EyeDropper samples the whole screen, including restricted pages.
 */
export function EyeDropperButton() {
  const [format, setFormat] = useState<ColorFormat>('hex');
  const [history, setHistory] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void chrome.storage.local
      .get('colorHistory')
      .then((r) => setHistory((r.colorHistory as string[]) ?? []));
  }, []);

  const pick = async () => {
    setError(null);
    if (!window.EyeDropper) {
      setError('EyeDropper needs Chrome 95+.');
      return;
    }
    try {
      const { sRGBHex } = await new window.EyeDropper().open();
      const hex = sRGBHex.toUpperCase();
      await navigator.clipboard.writeText(formatColor(hex, format));
      const next = [hex, ...history.filter((h) => h !== hex)].slice(0, 12);
      setHistory(next);
      await chrome.storage.local.set({ colorHistory: next });
    } catch {
      // Cancelled — not an error worth reporting.
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button
          onClick={pick}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-blue-600 bg-blue-50 py-2 font-medium text-blue-600 hover:bg-blue-100"
        >
          <EyeDropperIcon />
          Pick colour
        </button>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as ColorFormat)}
          className="rounded-lg border border-gray-400 px-2 text-xs"
          aria-label="Colour format"
        >
          <option value="hex">HEX</option>
          <option value="rgb">RGB</option>
          <option value="hsl">HSL</option>
          <option value="oklch">OKLCH</option>
        </select>
      </div>
      <p className="text-center text-[11px] text-gray-400">
        samples anywhere on screen · copies to clipboard
      </p>
      {error && <p className="text-center text-[11px] text-amber-700">{error}</p>}

      {history.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="w-[52px] text-xs text-gray-500">History</span>
          {history.slice(0, 9).map((hex) => (
            <button
              key={hex}
              title={`Copy ${formatColor(hex, format)}`}
              onClick={() => navigator.clipboard.writeText(formatColor(hex, format))}
              className="h-[18px] w-[18px] rounded-full border border-gray-500"
              style={{ background: hex }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
