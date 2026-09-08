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
const LOCAL_ORIGINS = ['http://localhost/*', 'http://127.0.0.1/*'];

export function AppMenu({ children, compact = false }: { children?: React.ReactNode; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const { pref, setPref } = useTheme();
  const ref = useRef<HTMLDivElement>(null);
  const [localAllowed, setLocalAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open) return;
    // The harness stubs chrome.* without permissions.contains.
    chrome.permissions?.contains?.({ origins: LOCAL_ORIGINS })
      .then(setLocalAllowed)
      .catch(() => setLocalAllowed(null));
  }, [open]);

  // Must run inside the click: Chrome only shows the prompt on a gesture.
  const allowLocal = () => {
    void chrome.permissions.request({ origins: LOCAL_ORIGINS }).then(setLocalAllowed).catch(() => {});
  };

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
        className="flex items-center gap-1.5 rounded-control px-1 py-0.5 hover:bg-surface-control"
        aria-label="Codename menu"
        title="Codename"
      >
        <LogoIcon className={compact ? 'h-4 w-4 text-ink' : 'h-5 w-5 text-ink'} />
        {!compact && <span className="text-lg font-semibold tracking-tight">Codename</span>}
        <span aria-hidden className="text-2xs text-ink-muted">▾</span>
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute left-0 z-30 w-56 rounded-card border border-line bg-surface-raised p-2 text-sm shadow-lg ${
            compact ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
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
          <div className="mt-3 flex flex-col gap-1">
            <div className="px-1 text-2xs font-semibold tracking-wide text-ink-muted uppercase">Site access</div>
            {localAllowed ? (
              <p className="px-1 text-2xs text-ink-muted">Dev servers on localhost open without asking.</p>
            ) : (
              <button
                onClick={allowLocal}
                className="rounded-control border border-line px-2 py-1 text-left text-xs hover:bg-surface-control"
              >
                Always allow localhost
                <span className="block text-2xs text-ink-muted">One prompt, then every dev server just works.</span>
              </button>
            )}
          </div>
          <BridgeSection />
          {children}
        </div>
      )}
    </div>
  );
}
