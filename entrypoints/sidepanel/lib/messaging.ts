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

export async function saveScan(tabId: number, data: unknown): Promise<void> {
  await chrome.storage.session.set({ [`scan:${tabId}`]: data });
}

export async function loadScan<T>(tabId: number): Promise<T | null> {
  const entry = await chrome.storage.session.get(`scan:${tabId}`);
  return (entry[`scan:${tabId}`] as T) ?? null;
}
