import type { OverlayTheme } from '@/shared/theme';
import type { SvgAsset } from '@/shared/types';

/** What the rail shows, set by the panel's messages and read by React. */
export interface RailState {
  on: boolean;
  theme: OverlayTheme;
  svgs: SvgAsset[];
  width: number;
}

export interface RailStore {
  get(): RailState;
  set(patch: Partial<RailState>): void;
  subscribe(listener: () => void): () => void;
}

export function createStore(initial: RailState): RailStore {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch };
      for (const fn of listeners) fn();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
