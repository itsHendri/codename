import type { InspectorCommand } from '@/shared/types';
import type { OverlayTheme } from '@/shared/theme';
import type { Mode } from '@/studio/engine/types';
import type { LengthMap } from '@/studio/reskinRules';

const RESTRICTED_PREFIXES = ['chrome://', 'chrome-extension://', 'edge://', 'about:', 'devtools://'];

export function isRestricted(url: string | undefined): boolean {
  if (!url) return true;
  if (RESTRICTED_PREFIXES.some((p) => url.startsWith(p))) return true;
  if (url.startsWith('https://chromewebstore.google.com')) return true;
  return false;
}

export async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

/**
 * Ask for host access to the tab's site. Must be called synchronously from a
 * user gesture (button click). Resolves true without a prompt when already granted.
 */
export async function ensureHostAccess(url: string): Promise<boolean> {
  try {
    const origin = new URL(url).origin + '/*';
    return await chrome.permissions.request({ origins: [origin] });
  } catch {
    return false;
  }
}

export async function runScan(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content-scripts/scanner.js'],
  });
}

/**
 * Send to a content script, injecting it when nobody answers.
 *
 * "Nobody answers" has two shapes. With no script in the tab the send rejects.
 * With *another* of our scripts in the tab — the inspector stays injected now
 * — its listener returns false for a message it does not own and the send
 * resolves with `undefined`. Both mean inject and try once more; injection is
 * idempotent, so a second copy is never started.
 */
async function sendOrInject<T>(tabId: number, file: string, message: unknown): Promise<T | null> {
  const send = () => chrome.tabs.sendMessage(tabId, message) as Promise<T | undefined>;
  try {
    const first = await send();
    if (first !== undefined) return first;
  } catch {
    /* not injected */
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [file] });
    return (await send()) ?? null;
  } catch {
    return null;
  }
}

/** Talk to the inspector. Injection does not turn hover mode on by itself; the command does. */
export function sendInspector<T = unknown>(tabId: number, command: InspectorCommand): Promise<T | null> {
  return sendOrInject<T>(tabId, 'content-scripts/inspector.js', { type: 'inspector', ...command });
}

let barPort: chrome.runtime.Port | null = null;
let barTab: number | null = null;

export interface BarLook {
  /** The panel's palette, which the bar wears. */
  theme: OverlayTheme;
  /** Which way the bar's Light/Dark switch sits. */
  mode: Mode;
  /** How many overrides Reset would take back; 0 hides the button. */
  resettable: number;
  /** How the dark preview is being shown, for the bar's hint. */
  darkVia?: 'site' | 'mirror' | null;
}

/**
 * Show the in-page bar and hold a port open to it, so the page knows the
 * moment the panel closes and can take the bar and hover mode down with it.
 */
export async function attachBar(tabId: number, look: BarLook): Promise<void> {
  if (barTab === tabId && barPort) {
    void setBarLook(tabId, look);
    return;
  }
  barPort?.disconnect();
  barPort = null;
  barTab = tabId;
  const shown = await setBarLook(tabId, look);
  if (!shown) return;
  try {
    barPort = chrome.tabs.connect(tabId, { name: 'codename-panel' });
    barPort.onDisconnect.addListener(() => {
      if (barTab === tabId) barPort = null;
    });
  } catch {
    barPort = null;
  }
}

/** Re-send the bar's palette and switch position; the bar is shown if it was not. */
export function setBarLook(tabId: number, look: BarLook): Promise<unknown> {
  return sendInspector(tabId, {
    cmd: 'bar',
    on: true,
    theme: look.theme,
    mode: look.mode,
    resettable: look.resettable,
    darkVia: look.darkVia ?? null,
  });
}

/* ---------------- live re-skin ---------------- */

interface ReskinOverride {
  name: string;
  from: string;
  to: string;
}

/**
 * Talk to the re-skin script, injecting it the first time. Sending blind and
 * injecting on failure avoids both a redundant inject on every keystroke and a
 * separate "is it there?" round trip.
 */
export interface ReskinResult {
  /** Custom properties overridden on the root. */
  vars: number;
  /** Rules re-emitted for pages that hardcode their colours. */
  rules: number;
}

function sendReskin(
  tabId: number,
  message: {
    type: string;
    overrides?: ReskinOverride[];
    colorMap?: Record<string, string>;
    lengthMap?: LengthMap | null;
    css?: string;
    mode?: 'light' | 'dark';
    rules?: { selector: string; property: string; value: string }[];
  },
): Promise<ReskinResult | null> {
  return sendOrInject<ReskinResult>(tabId, 'content-scripts/reskin.js', message);
}

export function applyReskin(
  tabId: number,
  overrides: ReskinOverride[],
  colorMap: Record<string, string>,
  lengthMap: LengthMap | null = null,
): Promise<ReskinResult | null> {
  return sendReskin(tabId, { type: 'reskin-apply', overrides, colorMap, lengthMap });
}

export function clearReskin(tabId: number): Promise<ReskinResult | null> {
  return sendReskin(tabId, { type: 'reskin-clear' });
}

/* ---------------- the site's own dark mode ---------------- */

export interface SiteModeResult extends ReskinResult {
  /** The hooks the stylesheet hangs dark rules off, now set: `.dark`, `[data-theme="dark"]`. */
  hooks: string[];
}

/** Show the page's own dark mode (its dark media rules and theme hooks), or put it back. */
export function setSiteMode(tabId: number, mode: 'light' | 'dark'): Promise<SiteModeResult | null> {
  return sendReskin(tabId, { type: 'site-mode', mode }) as Promise<SiteModeResult | null>;
}

/* ---------------- the agent's own preview sheet ---------------- */

export function applyAgentPreview(tabId: number, css: string): Promise<ReskinResult | null> {
  return sendReskin(tabId, { type: 'reskin-preview', css });
}

export function clearAgentPreview(tabId: number): Promise<ReskinResult | null> {
  return sendReskin(tabId, { type: 'reskin-preview-clear' });
}

/* ---------------- element edits ---------------- */

export function applyElementRules(
  tabId: number,
  rules: { selector: string; property: string; value: string }[],
): Promise<ReskinResult | null> {
  return sendReskin(tabId, { type: 'elements-set', rules });
}

/** PNG of the visible tab in a window, as base64 without the data-URL prefix. */
export async function captureVisible(
  windowId: number,
): Promise<{ png: string; width: number; height: number }> {
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  const png = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('screenshot could not be decoded'));
    img.src = dataUrl;
  });
  return { png, width: img.naturalWidth, height: img.naturalHeight };
}
