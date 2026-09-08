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
          className="flex flex-1 items-center justify-center gap-2 rounded-card border border-accent bg-accent-soft py-2 font-medium text-accent hover:bg-accent-soft"
        >
          <EyeDropperIcon />
          Pick colour
        </button>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as ColorFormat)}
          className="rounded-card border border-line px-2 text-sm"
          aria-label="Colour format"
        >
          <option value="hex">HEX</option>
          <option value="rgb">RGB</option>
          <option value="hsl">HSL</option>
          <option value="oklch">OKLCH</option>
        </select>
      </div>
      <p className="text-center text-xs text-ink-muted">
        samples anywhere on screen · copies to clipboard
      </p>
      {error && <p className="text-center text-xs text-warn-ink">{error}</p>}

      {history.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="w-13 text-sm text-ink-muted">History</span>
          {history.slice(0, 9).map((hex) => (
            <button
              key={hex}
              title={`Copy ${formatColor(hex, format)}`}
              onClick={() => navigator.clipboard.writeText(formatColor(hex, format))}
              className="size-4.5 rounded-full border border-line-strong"
              style={{ background: hex }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
