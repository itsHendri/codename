import { useEffect, useRef, useState } from 'react';
import { useTheme, type ThemePref } from '../lib/theme';
import { ChevronIcon, LogoIcon } from './icons';
import { BridgeSection } from './BridgeMenu';

const THEMES: { key: ThemePref; label: string }[] = [
  { key: 'system', label: 'System' },
  { key: 'dark', label: 'Dark' },
  { key: 'light', label: 'Light' },
];

/**
 * The mark in the footer is the menu. Settings that are set once — the theme,
 * site access, the agent bridge's pairing — live behind it rather than
 * taking a tab.
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
        <ChevronIcon className="h-2.5 w-2.5 rotate-90 text-ink-muted" />
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute left-0 z-30 w-56 rounded-card border border-line bg-surface-raised p-2 text-sm shadow-lg ${
            compact ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          <div className="subhead mb-1 px-1">Theme</div>
          <div className="flex h-control gap-0.5 rounded-control bg-surface-field p-0.5" role="radiogroup" aria-label="Theme">
            {THEMES.map((t) => (
              <button
                key={t.key}
                role="radio"
                aria-checked={pref === t.key}
                onClick={() => setPref(t.key)}
                className={`flex-1 rounded-[4px] px-2 text-xs ${
                  pref === t.key ? 'bg-surface-thumb text-ink shadow-[0_1px_2px_rgb(0_0_0/0.2)]' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-1">
            <div className="subhead px-1">Site access</div>
            {localAllowed ? (
              <p className="px-1 text-2xs text-ink-muted">Dev servers on localhost open without asking.</p>
            ) : (
              <button
                onClick={allowLocal}
                className="rounded-control bg-surface-field px-2 py-1.5 text-left text-xs hover:bg-surface-field-hover"
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
