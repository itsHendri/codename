import type { InspectorCommand } from '@/shared/types';

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
 * Talk to the inspector, injecting it the first time. Injection is idempotent
 * and does not turn hover mode on by itself; the command does.
 */
export async function sendInspector<T = unknown>(tabId: number, command: InspectorCommand): Promise<T | null> {
  const msg = { type: 'inspector', ...command };
  const send = () => chrome.tabs.sendMessage(tabId, msg) as Promise<T | undefined>;
  try {
    return (await send()) ?? null;
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content-scripts/inspector.js'] });
      return (await send()) ?? null;
    } catch {
      return null;
    }
  }
}

export async function startInspector(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content-scripts/inspector.js'] });
  await sendInspector(tabId, { cmd: 'hover', on: true });
}

export async function stopInspector(tabId: number): Promise<void> {
  await sendInspector(tabId, { cmd: 'hover', on: false });
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

async function sendReskin(
  tabId: number,
  message: {
    type: string;
    overrides?: ReskinOverride[];
    colorMap?: Record<string, string>;
    css?: string;
    rules?: { selector: string; property: string; value: string }[];
  },
): Promise<ReskinResult | null> {
  const send = () => chrome.tabs.sendMessage(tabId, message) as Promise<ReskinResult | undefined>;
  try {
    return (await send()) ?? null;
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content-scripts/reskin.js'],
      });
      return (await send()) ?? null;
    } catch {
      return null;
    }
  }
}

export function applyReskin(
  tabId: number,
  overrides: ReskinOverride[],
  colorMap: Record<string, string>,
): Promise<ReskinResult | null> {
  return sendReskin(tabId, { type: 'reskin-apply', overrides, colorMap });
}

export function clearReskin(tabId: number): Promise<ReskinResult | null> {
  return sendReskin(tabId, { type: 'reskin-clear' });
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
