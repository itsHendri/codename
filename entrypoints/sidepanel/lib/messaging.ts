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

export async function startInspector(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content-scripts/inspector.js'],
  });
}

export async function stopInspector(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'inspector-off' });
  } catch {
    // Inspector not injected — nothing to stop.
  }
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
  message: { type: string; overrides?: ReskinOverride[]; colorMap?: Record<string, string> },
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
