import { useEffect, useRef, useState } from 'react';
import { useTheme, type ThemePref } from '../lib/theme';
import { LogoIcon } from './icons';
import { BridgeSection } from './BridgeMenu';

const THEMES: { key: ThemePref; label: string }[] = [
  { key: 'system', label: 'System' },
  { key: 'dark', label: 'Dark' },
  { key: 'light', label: 'Light' },
];

/**
 * The wordmark is the menu. A 360px header has room for the site and the
 * viewport control and nothing else, so settings that are set once — the
 * theme, and later the agent bridge — live behind the name.
 */
export function AppMenu({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { pref, setPref } = useTheme();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative flex items-center">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-control px-1 py-0.5 hover:bg-surface-control"
      >
        <LogoIcon className="h-5 w-5 text-ink" />
        <span className="text-lg font-semibold tracking-tight">Codename</span>
        <span aria-hidden className="text-2xs text-ink-muted">▾</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full left-0 z-30 mt-1 w-56 rounded-card border border-line bg-surface-raised p-2 text-sm shadow-lg"
        >
          <div className="mb-1 px-1 text-2xs font-semibold tracking-wide text-ink-muted uppercase">Theme</div>
          <div className="flex rounded-control border border-line p-0.5" role="radiogroup" aria-label="Theme">
            {THEMES.map((t) => (
              <button
                key={t.key}
                role="radio"
                aria-checked={pref === t.key}
                onClick={() => setPref(t.key)}
                className={`flex-1 rounded px-2 py-1 text-xs ${
                  pref === t.key ? 'bg-ink text-surface-app' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <BridgeSection />
          {children}
        </div>
      )}
    </div>
  );
}
