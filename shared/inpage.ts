/**
 * How the content scripts talk to each other inside the page.
 *
 * Content scripts of one extension share an isolated world, so the rail can
 * reach the inspector through a global rather than a round trip over the
 * panel, and the inspector can tell the page's other scripts what is selected
 * with an event on the document. `studio/pageFrame.ts` keeps its media
 * registry on `globalThis` for the same reason.
 */

import type { InspectorCommand } from './types';

/** The inspector's handle on `window`; the rail calls it, the panel's messages go through `chrome.runtime`. */
export interface InspectorHandle {
  deactivate(): void;
  /** Run a command as the panel would, answering with what `sendResponse` would have carried. */
  handle(cmd: InspectorCommand): Promise<unknown>;
}

declare global {
  interface Window {
    __codenameInspector?: InspectorHandle;
    __codenameRail?: { deactivate(): void };
  }
}

/** Dispatched on the document by the inspector; `detail` is the selection's selector, or null. */
export const SELECTED_EVENT = 'codename:selected';

/** The rail's host element, which the inspector's window listeners must leave alone. */
export const RAIL_TAG = 'codename-rail';

/** The specimen's host: the styles page drawn in the page's own document. */
export const SPECIMEN_TAG = 'codename-specimen';
/** A label inside the specimen, in its own shadow root: chrome, not the page. */
export const SPECIMEN_LABEL_TAG = 'codename-specimen-label';
/** On specimen content: the selector or utility it stands for, so a selection files against the page's own rule. */
export const SPECIMEN_FOR = 'data-codename-for';
export const SPECIMEN_MATCHES = 'data-codename-matches';

/** Ask the inspector, from another script in the same page. Null when it is not there. */
export async function callInspector<T = unknown>(cmd: InspectorCommand): Promise<T | null> {
  const inspector = window.__codenameInspector;
  if (!inspector) return null;
  try {
    return ((await inspector.handle(cmd)) as T) ?? null;
  } catch {
    return null;
  }
}

/** Whether an event's path runs through the rail. */
export function throughRail(e: Event): boolean {
  return e.composedPath().some((n) => (n as Element).tagName?.toLowerCase() === RAIL_TAG);
}
