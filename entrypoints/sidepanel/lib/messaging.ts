import type { AgentPresence, ElementProps, InspectorCommand, RailCommand, SpecimenCommand } from '@/shared/types';
import { probeSource, refineProbe, type ComponentOrigin, type RawProbe } from '@/studio/framework';
import type { OverlayTheme } from '@/shared/theme';
import type { Mode } from '@/studio/engine/types';
import type { LengthMap } from '@/studio/reskinRules';
import type { StateName } from '@/studio/conditions';
import type { ConditionRule, HoistedRule } from '@/studio/conditionSheet';
import { embeddedTab } from '@/shared/embed';

export { isRestricted } from '@/shared/embed';

/**
 * The tab this panel is about. In Chrome's side panel, the active one in its
 * window; drawn in the page, the one it was drawn in, whichever is active.
 */
export async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const own = embeddedTab();
  if (own !== null) {
    try {
      return await chrome.tabs.get(own);
    } catch {
      return null;
    }
  }
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

/** Talk to the rail. It is injected on the first word, and shows only when told to. */
export function sendRail<T = unknown>(tabId: number, command: RailCommand): Promise<T | null> {
  return sendOrInject<T>(tabId, 'content-scripts/rail.js', { type: 'rail', ...command });
}

/** Talk to the specimen script: the styles page over the page, or the page again. */
export function sendSpecimen<T = unknown>(tabId: number, command: SpecimenCommand): Promise<T | null> {
  return sendOrInject<T>(tabId, 'content-scripts/specimen.js', { type: 'specimen', ...command });
}

/** The specimen as a standalone page, for saving; null when the page has none up. */
export async function specimenHtml(tabId: number): Promise<string | null> {
  const r = await sendSpecimen<{ ok: boolean; html: string }>(tabId, { cmd: 'html' });
  return r?.ok && r.html ? r.html : null;
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
  /** What the agent is previewing, for the chip; null when nothing. */
  agent?: AgentPresence | null;
  /** Whether the rail is showing, for the bar's Layers toggle. */
  rail?: boolean;
  /** Whether the specimen is showing, for the bar's Styles switch. */
  specimen?: boolean;
  /** Which side of the page's theme is forced, for the Light/Dark switch. */
  scheme?: 'light' | 'dark' | 'system';
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
    agent: look.agent ?? null,
    rail: look.rail ?? true,
    specimen: look.specimen ?? false,
    scheme: look.scheme ?? 'system',
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
/**
 * Whether a reply really is an element, rather than merely truthy.
 *
 * `sendInspector` is typed on what the command is supposed to answer, but the
 * reply crosses a message boundary: a content script from an older build, or
 * a generic `{ok:true}` from a page that did not understand the command, is
 * shaped nothing like this and would be written straight into the panel's
 * state to crash on first read.
 */
export function isElementProps(value: unknown): value is ElementProps {
  const v = value as Partial<ElementProps> | null;
  return Boolean(v && typeof v.selector === 'string' && typeof v.tag === 'string' && v.type && v.box && v.color);
}

export interface ReskinResult {
  /** Custom properties overridden on the root. */
  vars: number;
  /** Rules re-emitted for pages that hardcode their colours. */
  rules: number;
  /** For the agent's preview: what its sheet holds and reaches. */
  preview?: { rules: number; matched: number; unreadable: number; declares: string[] };
  /** For a state hoist: the page's own rules for that state on that element. */
  cascade?: HoistedRule[];
  /** For a verify read: what the page's own sheets say each variable is, override lifted. */
  values?: Record<string, string>;
}

function sendReskin(
  tabId: number,
  message: {
    type: string;
    overrides?: ReskinOverride[];
    colorMap?: Record<string, string>;
    lengthMap?: LengthMap | null;
    css?: string;
    mode?: 'light' | 'dark' | 'system';
    rules?: ConditionRule[];
    darkPreview?: boolean;
    state?: StateName | null;
    selector?: string | null;
    names?: string[];
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

/**
 * What the page's own stylesheets say these variables are right now, with
 * the panel's overrides lifted for the read. After a write to source, this
 * is what says whether the page picked it up.
 */
export function verifyVars(tabId: number, names: string[]): Promise<ReskinResult | null> {
  return sendReskin(tabId, { type: 'reskin-verify', names });
}

/* ---------------- the site's own dark mode ---------------- */

export interface SiteModeResult extends ReskinResult {
  /** The hooks the stylesheet hangs dark rules off, now set: `.dark`, `[data-theme="dark"]`. */
  hooks: string[];
}

/** Force one side of the page's own theme (its media rules and hooks), or put it back with `system`. */
export function setSiteMode(tabId: number, mode: 'light' | 'dark' | 'system'): Promise<SiteModeResult | null> {
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
  rules: ConditionRule[],
  darkPreview = false,
): Promise<ReskinResult | null> {
  return sendReskin(tabId, { type: 'elements-set', rules, darkPreview });
}

/**
 * Hold the page in a state, and hear what it already does there.
 *
 * The reply is the page's own rules for that state on that element, read out
 * of the CSSOM where the panel cannot reach — facts for the panel to show,
 * never something it edits.
 */
export function setStateHoist(
  tabId: number,
  state: StateName | null,
  selector: string | null,
): Promise<HoistedRule[]> {
  return sendReskin(tabId, { type: 'state-set', state, selector }).then((r) => r?.cascade ?? []);
}

/**
 * What rendered an element, according to the page's own world.
 *
 * A content script cannot see this: `__reactFiber$…`, `__vueParentComponent`
 * and `window.ng` are expandos on the page's own wrappers, and the isolated
 * world gets different ones. So the probe is injected with `world: 'MAIN'`,
 * where it reads those and returns plain strings — nothing live crosses back
 * — and the judging happens here.
 */
export async function probeComponent(tabId: number, selector: string): Promise<ComponentOrigin | null> {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: probeSource,
      args: [selector],
    });
    return refineProbe(result?.result as RawProbe | null | undefined);
  } catch {
    // A page that refuses injection (a restricted URL, a strict CSP on the
    // main world) simply does not say; it is not an error worth showing.
    return null;
  }
}

/**
 * Crop a capture to an element's box. The capture is in device pixels and the
 * box in CSS pixels, so the scale between them is the capture's width over
 * the viewport's; a little margin keeps a shadow or an outline in the frame.
 */
export async function cropCapture(
  shot: { png: string; width: number; height: number },
  rect: { x: number; y: number; width: number; height: number },
  /** Capture pixels per CSS pixel: the capture's width over the viewport's. */
  pxPerCss: number,
  marginCss = 8,
): Promise<{ png: string; width: number; height: number }> {
  const scale = pxPerCss > 0 ? pxPerCss : 1;
  const x = Math.max(0, Math.floor((rect.x - marginCss) * scale));
  const y = Math.max(0, Math.floor((rect.y - marginCss) * scale));
  const w = Math.min(shot.width - x, Math.ceil((rect.width + marginCss * 2) * scale));
  const h = Math.min(shot.height - y, Math.ceil((rect.height + marginCss * 2) * scale));
  if (w <= 0 || h <= 0) throw new Error('the element is outside the visible page');
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('screenshot could not be decoded'));
    img.src = `data:image/png;base64,${shot.png}`;
  });
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
  const url = canvas.toDataURL('image/png');
  return { png: url.slice(url.indexOf(',') + 1), width: w, height: h };
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
