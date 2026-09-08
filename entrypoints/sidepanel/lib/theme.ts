/**
 * Which palette the panel paints with.
 *
 * `chrome.storage.sync` is the source of truth, so a choice follows the user
 * across machines. It is also async, and MV3 forbids an inline script, so the
 * choice is mirrored to `localStorage` for the one synchronous read `main.tsx`
 * makes before the first paint — otherwise a light-theme user would see a
 * dark flash on every open.
 */

import { useEffect, useState } from 'react';

export type ThemePref = 'system' | 'dark' | 'light';
export type ResolvedTheme = 'dark' | 'light';

const KEY = 'theme';
const PREFS: ThemePref[] = ['system', 'dark', 'light'];
/** Dark is the panel's default; following the OS is a choice, not the fallback. */
const DEFAULT: ThemePref = 'dark';

const isPref = (v: unknown): v is ThemePref => PREFS.includes(v as ThemePref);

export function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === 'system') delete root.dataset.theme;
  else root.dataset.theme = pref;
}

export function readCachedPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return isPref(v) ? v : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

async function readStoredPref(): Promise<ThemePref> {
  try {
    const got = await chrome.storage.sync.get(KEY);
    return isPref(got[KEY]) ? got[KEY] : DEFAULT;
  } catch {
    return readCachedPref();
  }
}

function systemTheme(): ResolvedTheme {
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function resolveTheme(pref: ThemePref): ResolvedTheme {
  return pref === 'system' ? systemTheme() : pref;
}

export function useTheme(): {
  pref: ThemePref;
  resolved: ResolvedTheme;
  setPref: (pref: ThemePref) => void;
} {
  const [pref, setPrefState] = useState<ThemePref>(readCachedPref);
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme);

  useEffect(() => {
    void readStoredPref().then((p) => {
      setPrefState(p);
      applyTheme(p);
      try {
        localStorage.setItem(KEY, p);
      } catch {
        /* private mode */
      }
    });
    const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === 'sync' && isPref(changes[KEY]?.newValue)) {
        setPrefState(changes[KEY]!.newValue as ThemePref);
        applyTheme(changes[KEY]!.newValue as ThemePref);
      }
    };
    // The harness stubs chrome.* without onChanged.
    chrome.storage.onChanged?.addListener(onChanged);
    const mq = matchMedia('(prefers-color-scheme: light)');
    const onMq = () => setSystem(systemTheme());
    mq.addEventListener('change', onMq);
    return () => {
      chrome.storage.onChanged?.removeListener(onChanged);
      mq.removeEventListener('change', onMq);
    };
  }, []);

  const setPref = (p: ThemePref) => {
    setPrefState(p);
    applyTheme(p);
    try {
      localStorage.setItem(KEY, p);
    } catch {
      /* private mode */
    }
    void chrome.storage.sync.set({ [KEY]: p }).catch(() => {});
  };

  return { pref, resolved: pref === 'system' ? system : pref, setPref };
}
