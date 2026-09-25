import type { OverlayTheme } from '@/shared/theme';
import type { SvgAsset } from '@/shared/types';

/** What the rail shows, set by the panel's messages and read by React. */
export interface RailState {
  on: boolean;
  theme: OverlayTheme;
  svgs: SvgAsset[];
  /** The rail's whole width, strip and column, when the column is open. */
  width: number;
  /** Whether the column beside the strip is open. Off leaves the strip alone in the page. */
  column: boolean;
  /** The side the page is showing, so the assets sit on the ground the page gives them. */
  scheme: 'light' | 'dark';
  /** The page's own text colour right now: what `currentColor` is in an asset on the page. */
  ink: string;
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
