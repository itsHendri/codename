/**
 * The panel's end of the local companion.
 *
 * The side panel page owns the socket, not the service worker: everything the
 * bridge wants is panel state, the page stays alive while the panel is open,
 * and a worker would need alarms and a full rehydration to relay what the
 * panel already has. No agent link while the panel is closed is the trade,
 * and it is the right one — the workflow is "panel open, agent watching".
 */

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { embeddedTab } from '@/shared/embed';
import type { ElementProps } from '@/shared/types';
import { critique, critiqueToText } from '@/studio/critique';
import { seedBrandFromScan } from '@/studio/seedFromScan';
import {
  DEFAULT_PORT,
  DESIGN_FILES,
  PROTOCOL_VERSION,
  type AgentInfo,
  type AppliedDefinition,
  type BridgeRequest,
  type DefinitionsPayload,
  type DesignFile,
  type DesignSystemResult,
  type Envelope,
  type HelloAck,
  type PanelRequest,
  type ProjectInfo,
  type RunSnapshot,
  type SessionState,
} from '@/shared/protocol';
import { isEmpty, isLocal, standingRules, toPrompt } from '@/studio/commit';
import type { ChangeSet } from '@/studio/commit';
import { active } from '@/studio/changes';
import { buildExport } from '@/studio/export/bundle';
import { driftReport, driftToText, parseTokenFile } from '@/studio/tokenFile';
import { pendingNotes } from './comments';
import type { DesignModel } from './designModel';
import { ALL_SECTIONS, buildBrandMd } from './exporters';
import { applyAgentPreview, captureVisible, clearAgentPreview, cropCapture, isElementProps, sendInspector } from './messaging';
import {
  addReply,
  getSession,
  logAgent,
  setCommentStatus,
  setProjectScope,
  updateSession,
  type TabSession,
} from './session';

export type BridgeStatus = 'off' | 'connecting' | 'connected' | 'unauthorized' | 'locked' | 'other-extension';

export interface Pairing {
  token: string;
  port: number;
}

const PAIRING_KEY = 'bridge';
const MAX_BACKOFF = 30_000;

/* ---------------- a tiny store, so the header dot and the menu agree ---------------- */

let status: BridgeStatus = 'off';
let pairing: Pairing | null = null;
/** The folder the paired bridge is running in, as its hello ack named it. */
let project: ProjectInfo | null = null;
/** The coding agents that bridge can run for Make changes; null from a bridge older than Make changes. */
let agents: AgentInfo[] | null = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const setStatus = (s: BridgeStatus) => {
  if (s === status) return;
  status = s;
  emit();
};

const setAgents = (next: AgentInfo[] | null) => {
  // Whole, not by id: the same agent signing in or out is news too.
  if (JSON.stringify(next) === JSON.stringify(agents)) return;
  agents = next;
  emit();
};

const setProject = (p: ProjectInfo | null) => {
  if (p?.path === project?.path && p?.branch === project?.branch && p?.dirty === project?.dirty) return;
  project = p;
  setProjectScope(p);
  emit();
};

/* ---------------- the socket ---------------- */

/** The bridge closes with this when too many wrong codes have been tried. */
const TOO_MANY = 4429;
/** The bridge closes with this when it paired with a different copy of the extension. */
const OTHER_EXTENSION = 4403;
/** A little past the bridge's own lockout, so the first try back is not refused too. */
const LOCKOUT_MARGIN_MS = 1_000;

/** Nothing will answer these now; a caller waiting on one should hear so. */
function settleAsks(why: string) {
  for (const [id, waiting] of asking) {
    clearTimeout(waiting.timer);
    waiting.reject(new Error(why));
    asking.delete(id);
  }
}

let socket: WebSocket | null = null;
let backoff = 1000;
/** What the panel is waiting on the bridge to answer. */
const asking = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let sessionId = '';
let latest: SessionState | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let tabIdForRequests: number | null = null;
/** The system as the panel shows it, so a request can build the same files Export would. */
let modelForRequests: DesignModel | null = null;

/** The bundle's paths, by the short name an agent asks for. */
const BUNDLE_PATHS: Partial<Record<DesignFile, string>> = {
  'SKILL.md': 'skill/SKILL.md',
  'DESIGN_SYSTEM.md': 'skill/references/DESIGN_SYSTEM.md',
  'tokens.css': 'tokens.css',
  'tokens.json': 'tokens.json',
};

const uid = () => Math.random().toString(36).slice(2, 10);

function send(msg: Envelope) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

function connect() {
  if (!pairing || socket) return;
  // Drawn in the page, there is a panel in every tab Codename is on. Only
  // the one in view holds the bridge's socket, which keeps it to one per
  // window, as Chrome's side panel always was.
  if (embeddedTab() !== null && document.visibilityState !== 'visible') return;
  setStatus('connecting');
  const ws = new WebSocket(`ws://127.0.0.1:${pairing.port}`);
  socket = ws;
  ws.onopen = () => {
    send({
      v: PROTOCOL_VERSION,
      id: uid(),
      type: 'hello',
      payload: {
        token: pairing!.token,
        extensionVersion: chrome.runtime.getManifest?.().version ?? '0',
        extensionId: chrome.runtime.id,
        sessionId,
      },
    });
    backoff = 1000;
    setStatus('connected');
    if (latest) send({ v: PROTOCOL_VERSION, id: uid(), type: 'state', payload: latest });
  };
  ws.onmessage = (e) => void onMessage(e.data as string);
  ws.onclose = (e) => {
    // A socket let go on purpose — pair, retry, forget — has already been
    // replaced or turned off, and its late close must not tear down the one
    // that took its place (which it used to, then open a duplicate).
    if (socket !== ws) return;
    socket = null;
    setProject(null);
    setAgents([]);
    // A bridge that went away mid-question will never answer it, and waiting
    // out the timeout left an Apply button saying "Applying…" for twenty seconds.
    settleAsks('the agent bridge disconnected');
    if (e.code === 4401) {
      setStatus('unauthorized');
      return;
    }
    if (e.code === OTHER_EXTENSION) {
      setStatus('other-extension');
      return;
    }
    if (e.code === TOO_MANY) {
      setStatus('locked');
      // The lockout is not this panel's doing when it holds the right code, so
      // it comes back by itself once the door opens rather than staying out.
      const wait = Number(/retry-after:(\d+)/.exec(e.reason ?? '')?.[1]);
      if (pairing && Number.isFinite(wait)) {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, wait + LOCKOUT_MARGIN_MS);
      }
      return;
    }
    if (!pairing) {
      setStatus('off');
      return;
    }
    setStatus('connecting');
    reconnectTimer = setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, MAX_BACKOFF);
  };
  ws.onerror = () => ws.close();
}

function disconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  const ws = socket;
  socket = null;
  ws?.close();
  settleAsks('the agent bridge disconnected');
  setStatus(pairing ? 'connecting' : 'off');
}

if (embeddedTab() !== null && typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') connect();
    else if (socket) disconnect();
  });
}

/**
 * Everything the bridge sends that is not a request: the answer to our hello,
 * the answer to something we asked, and the definitions it found.
 *
 * Split out from the request path because the two have nothing to do with
 * each other — one is the panel answering, the other the panel being
 * answered — and because it gives a test somewhere to push a frame in.
 */
export function handleBridgeFrame(msg: Envelope): boolean {
  if (msg.type === 'response') {
    const waiting = msg.replyTo ? asking.get(msg.replyTo) : undefined;
    if (waiting && msg.replyTo) {
      asking.delete(msg.replyTo);
      clearTimeout(waiting.timer);
      if (msg.ok === false) waiting.reject(new Error(msg.error ?? 'the bridge refused'));
      else waiting.resolve(msg.payload);
      return true;
    }
    // Not something we asked for, so it is the answer to the hello. Known by
    // its shape rather than its id, which saves holding on to the id at all.
    const ack = msg.payload as HelloAck | undefined;
    if (ack && typeof ack.bridgeVersion === 'string') {
      setProject(ack.project ?? null);
      // An ack with no list at all is from a bridge that cannot run agents.
      setAgents(Array.isArray(ack.agents) ? ack.agents : null);
      if (ack.run) adoptRun(ack.run, true);
      // A run this panel thought was going, that the bridge no longer knows:
      // the bridge was restarted under it, and it is not coming back.
      const shown = getSession().run;
      if (shown?.status === 'running' && ack.run?.runId !== shown.runId) {
        adoptRun({ ...shown, status: 'failed', error: 'The bridge was restarted while it was working.', endedAt: new Date().toISOString() }, false);
      }
    }
    return true;
  }

  if (msg.type === 'run') {
    const run = msg.payload as RunSnapshot | undefined;
    if (run && typeof run.runId === 'string') adoptRun(run, false);
    return true;
  }

  if (msg.type === 'definitions') {
    const payload = msg.payload as DefinitionsPayload | undefined;
    if (payload?.found) updateSession({ definitions: payload });
    return true;
  }

  return false;
}

async function onMessage(raw: string) {
  let msg: Envelope<BridgeRequest>;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }

  if (handleBridgeFrame(msg)) return;
  if (msg.type !== 'request' || !msg.payload) return;
  const reply = (ok: boolean, payload?: unknown, error?: string) =>
    send({ v: PROTOCOL_VERSION, id: uid(), type: 'response', replyTo: msg.id, ok, payload, error });
  try {
    const result = await handle(msg.payload);
    logAgent(describe(msg.payload, result));
    reply(true, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logAgent(`${verb(msg.payload)} — refused: ${message}`);
    reply(false, undefined, message);
  }
}

/** What the agent asked for, in a few words, for the activity list. */
function verb(req: BridgeRequest): string {
  switch (req.method) {
    case 'screenshot':
      return `asked for a screenshot${req.selector ? ` of ${req.selector}` : ''}${req.viewport ? ` at ${req.viewport}` : ''}`;
    case 'critique':
      return 'asked for the critique';
    case 'check_tokens':
      return `compared the page with ${req.name ?? 'a token file'}`;
    case 'design_system':
      return `asked for the design system${req.files?.length ? ` (${req.files.join(', ')})` : ''}`;
    case 'apply_css':
      return 'asked to paint a preview';
    case 'point':
      return `pointed at ${req.selector}`;
    case 'clear':
      return req.what === 'handoff' ? 'asked to mark the hand-off consumed' : 'asked to clear its preview';
    case 'set_status':
      return `moved comment ${req.id} to ${req.status}`;
    case 'reply':
      return `replied to comment ${req.id}`;
  }
}

function describe(req: BridgeRequest, result: unknown): string {
  const r = (result ?? {}) as Record<string, unknown>;
  switch (req.method) {
    case 'screenshot':
      return `took a screenshot${req.selector ? ` of ${req.selector}` : ''}${req.viewport ? ` at ${req.viewport}` : ''} (${r.width}×${r.height})`;
    case 'critique':
      return 'read the critique';
    case 'check_tokens':
      return `compared the page with ${req.name ?? 'a token file'}: ${(r.summary as string) ?? 'no answer'}`;
    case 'design_system': {
      const files = (r.files as { path: string }[] | undefined)?.map((f) => f.path) ?? [];
      return `read the design system${files.length ? `: ${files.join(', ')}` : ''}`;
    }
    case 'apply_css': {
      const locked = (r.touchesLocked as string[] | undefined) ?? [];
      return req.css.trim()
        ? `painted a preview: ${r.rules} rule(s) reaching ${r.matched} element(s)${locked.length ? `, touching locked ${locked.join(', ')}` : ''}`
        : 'cleared its preview';
    }
    case 'point':
      return `pointed at ${req.selector}${req.note ? ` — “${req.note}”` : ''}`;
    case 'clear':
      return req.what === 'handoff' ? 'marked the hand-off consumed' : 'cleared its preview';
    case 'set_status':
      return `moved comment ${req.id} to ${req.status}`;
    case 'reply':
      return `replied to comment ${req.id}: “${req.text.length > 60 ? `${req.text.slice(0, 57)}…` : req.text}”`;
  }
}

async function handle(req: BridgeRequest): Promise<unknown> {
  const tabId = tabIdForRequests;
  const session = getSession();
  switch (req.method) {
    case 'screenshot': {
      const win = await chrome.windows.getCurrent();
      if (win.id == null) throw new Error('no window');
      if (req.viewport) {
        if (tabId == null) throw new Error('no tab');
        // A brief names a media query, so a width is what an agent has to
        // hand; a preset name is the other way of saying one.
        const px = /^(\d+(?:\.\d+)?)(?:px)?$/i.exec(req.viewport.trim());
        const r = await sendInspector<{ ok: boolean; error?: string }>(tabId, {
          cmd: 'set-viewport',
          preset: req.viewport,
          ...(px ? { width: Number(px[1]) } : {}),
        });
        if (!r) throw new Error('the page could not be reached');
        if (!r.ok) throw new Error(r.error ?? 'the page could not be shown at that size');
        // The frame has changed; give the page a moment to lay out at the new width.
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      type Box = { x: number; y: number; width: number; height: number };
      if (tabId == null && req.selector) throw new Error('no tab');
      // `locate` scrolls the element into view and measures it; with no
      // selector it only measures the frame, if the page is in one.
      const located =
        tabId != null
          ? await sendInspector<{ ok: boolean; matches?: number; error?: string; rect?: Box; frame?: Box | null; viewport?: { width: number; height: number } }>(
              tabId,
              { cmd: 'locate', selector: req.selector },
            )
          : null;
      if (req.selector) {
        if (!located) throw new Error('the page could not be reached');
        if (!located.ok || !located.rect) throw new Error(located.error ?? `nothing on the page matches ${req.selector}`);
        // The scroll has landed; let the paint follow before the capture.
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      try {
        const shot = await captureVisible(win.id);
        // The capture is device pixels of the whole tab; boxes are CSS pixels
        // of the viewport, already scaled by the frame's zoom.
        const viewport = located?.viewport?.width ?? 0;
        const pxPerCss = viewport > 0 ? shot.width / viewport : 1;
        if (req.selector && located?.rect) {
          const cropped = await cropCapture(shot, located.rect, pxPerCss);
          return { ...cropped, selector: req.selector, matches: located.matches ?? 0 };
        }
        // Inside a frame the tab around it is dimmed page, not the page at
        // that width, so the picture is the frame's visible part.
        if (located?.frame) return await cropCapture(shot, located.frame, pxPerCss, 0);
        return shot;
      } catch (err) {
        // captureVisibleTab needs activeTab, which only a click on the toolbar
        // icon grants — and a navigation takes it away again.
        if (String(err).includes('activeTab'))
          throw new Error('Chrome allows a screenshot only after the Codename icon was clicked on this tab; ask the user to click it and try again');
        throw err;
      }
    }
    case 'critique': {
      if (!session.scan) throw new Error('the page has not been read yet; ask the user to press Scan');
      // Against the page as read, like the panel and brand.md: the edit is the answer to it.
      const result = critique(session.scan, seedBrandFromScan(session.scan));
      let host = session.scan.url;
      try {
        host = new URL(session.scan.url).host;
      } catch {
        /* keep the url */
      }
      return { ...result, text: critiqueToText(result, host) };
    }
    case 'check_tokens': {
      if (!session.scan) throw new Error('the page has not been read yet; ask the user to press Scan');
      const parsed = parseTokenFile(req.file);
      if (parsed.error) throw new Error(parsed.error);
      if (!parsed.tokens.length) throw new Error('no tokens were found in that file');
      const name = req.name ?? 'the token file';
      const report = driftReport(session.scan, parsed.tokens, name);
      // Kept only once the comparison worked, so a file that could not be
      // read never replaces the one the person loaded by hand.
      updateSession({ tokenFile: { name, tokens: parsed.tokens } });
      let host = session.scan.url;
      try {
        host = new URL(session.scan.url).host;
      } catch {
        /* keep the url */
      }
      return { ...report, text: driftToText(report, host, name) };
    }
    case 'design_system': {
      if (!session.scan) throw new Error('the page has not been read yet; ask the user to press Scan');
      const wanted = new Set<DesignFile>(req.files?.length ? req.files : DESIGN_FILES);
      const files: DesignSystemResult['files'] = [];
      if (wanted.has('brand.md')) {
        files.push({
          path: 'brand.md',
          content: buildBrandMd(session.scan, ALL_SECTIONS),
          note: 'The page as read: fonts, colours by usage, spacing, variables, and what a designer would flag.',
        });
      }
      // The same files the Export tab produces, from the system as the panel shows it.
      const bundle = modelForRequests ? buildExport(modelForRequests.resolved) : [];
      for (const name of DESIGN_FILES) {
        const path = BUNDLE_PATHS[name];
        if (!path || !wanted.has(name)) continue;
        const file = bundle.find((f) => f.path === path);
        if (file) files.push({ path: name, content: file.content, note: file.note });
      }
      const result: DesignSystemResult = { url: session.scan.url, scannedAt: session.scan.scannedAt, files };
      return result;
    }
    case 'apply_css': {
      if (!session.agentMayWrite) throw new Error('the user has not allowed the agent to change this page');
      if (tabId == null) throw new Error('no tab');
      const r = await applyAgentPreview(tabId, req.css);
      if (!r) throw new Error('the page could not be reached');
      const info = r.preview ?? { rules: 0, matched: 0, unreadable: 0, declares: [] };
      const touchesLocked = info.declares.filter((name) => session.locks.includes(name));
      updateSession({
        agentPreview: req.css.trim()
          ? { rules: info.rules, matched: info.matched, at: new Date().toISOString(), css: req.css, declares: info.declares }
          : null,
      });
      return { applied: true, rules: info.rules, matched: info.matched, unreadable: info.unreadable, touchesLocked };
    }
    case 'point': {
      if (tabId == null) throw new Error('no tab');
      const r = await sendInspector<{ ok: boolean; matched?: number }>(tabId, { cmd: 'point', selector: req.selector, note: req.note });
      if (!r) throw new Error('the page could not be reached');
      return { matched: r.matched ?? 0 };
    }
    case 'clear': {
      if (req.what === 'handoff') {
        updateSession({ handoff: null });
        return { cleared: 'handoff' };
      }
      await dropAgentPreview();
      return { cleared: 'preview' };
    }
    case 'set_status':
      setCommentStatus(req.id, req.status);
      return { id: req.id, status: req.status };
    case 'reply':
      addReply(req.id, 'agent', req.text);
      return { id: req.id };
  }
}

function schedulePush(state: SessionState) {
  latest = state;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    send({ v: PROTOCOL_VERSION, id: uid(), type: 'state', payload: state });
  }, 150);
}

/* ---------------- pairing ---------------- */

async function loadPairing(): Promise<void> {
  try {
    const got = await chrome.storage.local.get(PAIRING_KEY);
    const p = got[PAIRING_KEY] as Pairing | undefined;
    pairing = p?.token ? { token: p.token, port: p.port || DEFAULT_PORT } : null;
  } catch {
    pairing = null;
  }
  emit();
  if (pairing) connect();
}

export async function pair(token: string, port = DEFAULT_PORT): Promise<void> {
  const clean = token.trim().toUpperCase();
  if (!clean) return;
  pairing = { token: clean, port };
  await chrome.storage.local.set({ [PAIRING_KEY]: pairing });
  emit();
  disconnect();
  connect();
}

export async function forget(): Promise<void> {
  pairing = null;
  setProject(null);
  await chrome.storage.local.remove(PAIRING_KEY);
  disconnect();
  setStatus('off');
  emit();
}

/** Try again now instead of waiting out the backoff. */
export function retry() {
  if (!pairing) return;
  backoff = 1000;
  disconnect();
  connect();
}

/* ---------------- asking the bridge ---------------- */

const ASK_TIMEOUT_MS = 20_000;

/** Puts a question to the bridge and waits for its answer. */
function ask<T>(payload: PanelRequest): Promise<T> {
  if (socket?.readyState !== WebSocket.OPEN) return Promise.reject(new Error('no agent is connected'));
  const id = uid();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      asking.delete(id);
      reject(new Error('the bridge did not answer'));
    }, ASK_TIMEOUT_MS);
    asking.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
    send({ v: PROTOCOL_VERSION, id, type: 'ask', payload });
  });
}

/**
 * Writes one variable definition in source, through the bridge.
 *
 * The only write that does not go through the agent, and the narrowest one
 * there is: the bridge refuses anything it cannot be certain of, and the
 * reason comes back as the error.
 */
export async function applyDefinition(edit: {
  name: string;
  from: string;
  to: string;
  file: string;
  line: number;
}): Promise<AppliedDefinition> {
  const applied = await ask<AppliedDefinition>({ method: 'apply_definition', ...edit });
  logAgent(`${applied.name} applied in ${applied.file}:${applied.line}`);
  return applied;
}

/**
 * Read the selected element again.
 *
 * After anything that repaints the page from outside the element editor —
 * applying a definition to source, for one — the values the panel is showing
 * are the ones from before.
 */
export async function rereadSelection(): Promise<void> {
  if (tabIdForRequests == null) return;
  const props = await sendInspector<ElementProps | null>(tabIdForRequests, { cmd: 'read' }).catch(() => null);
  if (isElementProps(props)) updateSession({ pinned: props });
}

/** Ask again where these properties are defined, after a source edit. */
export async function refreshDefinitions(names: string[]): Promise<void> {
  if (!names.length) return;
  const found = await ask<DefinitionsPayload>({ method: 'find_definitions', names });
  updateSession({ definitions: found });
}

/* ---------------- hooks ---------------- */

let started = false;
async function start() {
  if (started) return;
  started = true;
  try {
    const win = await chrome.windows.getCurrent();
    sessionId = String(win.id ?? 'w');
  } catch {
    sessionId = 'w';
  }
  await loadPairing();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => ({ status, pairing, project, agents });
let memo = snapshot();
const getSnapshot = () => {
  const next = snapshot();
  if (next.status !== memo.status || next.pairing !== memo.pairing || next.project !== memo.project || next.agents !== memo.agents) memo = next;
  return memo;
};

/** The same store `useBridge` reads, for code that is not a component. */
export const bridgeStatus = (): BridgeStatus => status;

export function useBridge(): { status: BridgeStatus; pairing: Pairing | null; project: ProjectInfo | null; agents: AgentInfo[] | null } {
  useEffect(() => void start(), []);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Build the snapshot the agent sees and push it whenever it changes. */
export function useBridgeSync(
  tabId: number | null,
  tabUrl: string,
  session: TabSession,
  model: DesignModel | null,
  /** The change set the panel is already showing; the same one the agent sees. */
  built: ChangeSet,
) {
  tabIdForRequests = tabId;
  modelForRequests = model;
  const changes = useMemo(() => (isEmpty(built) ? null : built), [built]);
  const state = useMemo<SessionState | null>(() => {
    if (tabId == null) return null;
    let origin = '';
    try {
      origin = new URL(tabUrl).origin;
    } catch {
      /* about:blank and friends */
    }
    const pinned = session.pinned;
    return {
      sessionId,
      revision: session.revision,
      tab: { id: tabId, url: tabUrl, origin, title: session.scan?.title ?? '', local: isLocal(tabUrl) },
      scanSummary: session.scan
        ? {
            scannedAt: session.scan.scannedAt,
            colors: session.scan.colors.length,
            fonts: session.scan.fontUsage.length,
            customProps: session.scan.customProps.length,
          }
        : null,
      changes,
      prompt: changes ? toPrompt(changes) : null,
      handoff: session.handoff,
      selection: pinned
        ? {
            selector: pinned.selector,
            matches: pinned.matches,
            tag: pinned.tag,
            text: pinned.text ?? undefined,
            rect: pinned.rect,
            computed: {
              font: `${pinned.type.fontWeight} ${pinned.type.fontSize}/${pinned.type.lineHeight} ${pinned.type.fontFamily}`,
              color: pinned.color.text,
              backgroundColor: pinned.color.background,
              padding: `${pinned.box.paddingTop} ${pinned.box.paddingRight} ${pinned.box.paddingBottom} ${pinned.box.paddingLeft}`,
              margin: `${pinned.box.marginTop} ${pinned.box.marginRight} ${pinned.box.marginBottom} ${pinned.box.marginLeft}`,
              borderRadius: pinned.radius,
              boxShadow: pinned.shadow,
            },
            ...(pinned.component ? { component: pinned.component } : {}),
          }
        : null,
      comments: session.comments,
      agentMayWrite: session.agentMayWrite,
      bridgeMayWrite: session.bridgeMayWrite,
      locks: session.locks,
      rules: standingRules(session.locks),
    };
    // Only the fields read above: an activity-log entry or a tab switch in the
    // panel must not re-render the prompt and push the same snapshot again.
  }, [
    tabId,
    tabUrl,
    session.revision,
    session.scan,
    session.handoff,
    session.pinned,
    session.comments,
    session.agentMayWrite,
    session.bridgeMayWrite,
    session.locks,
    changes,
  ]);

  useEffect(() => {
    if (state) schedulePush(state);
  }, [state]);
}

/** Take the agent's preview off the page, from the bar's chip, the Changes row, or the agent itself. */
export async function dropAgentPreview(): Promise<void> {
  if (tabIdForRequests != null) await clearAgentPreview(tabIdForRequests);
  updateSession({ agentPreview: null });
}

/* ---------------- Make changes ---------------- */

/** Runs whose ending has been acted on, so a repeated frame or a later hello does not act twice. */
const ended = new Set<string>();
let runApplied: ((run: RunSnapshot) => void) | null = null;

/**
 * What the panel does when a run changed files: the source now says what the
 * overrides were saying, so they come off and the page is shown as source
 * paints it. Registered by the app, which owns the overrides.
 */
export function onRunApplied(fn: ((run: RunSnapshot) => void) | null): void {
  runApplied = fn;
}

/**
 * A snapshot of a run, from a `run` frame or a hello ack.
 *
 * A hello brings the bridge's latest run whatever it was; only one that is
 * still going, or the one this panel is already showing, is taken from it —
 * a run that finished yesterday is not news, and must not clear today's edits.
 */
export function adoptRun(run: RunSnapshot, fromHello: boolean): void {
  const shown = getSession().run;
  if (fromHello && run.status !== 'running' && shown?.runId !== run.runId) return;
  updateSession({ run });
  if (run.status === 'running' || ended.has(run.runId)) return;
  ended.add(run.runId);
  if (run.status === 'done') {
    const files = run.files.length;
    // A tool that cannot say what it touched is not taken to have touched
    // everything: the edits stay until the person has looked at the diff.
    if (run.filesKnown === false) logAgent(`${run.agentName} finished; it does not say which files it changed`);
    else logAgent(files ? `${run.agentName} changed ${files} ${files === 1 ? 'file' : 'files'}: ${run.files.join(', ')}` : `${run.agentName} finished without changing a file`);
    if (files) runApplied?.(run);
  } else if (run.status === 'failed') {
    logAgent(`${run.agentName} stopped: ${run.error ?? 'no reason given'}`);
  } else {
    logAgent(`${run.agentName} was cancelled`);
  }
}

/**
 * Press Make changes: the bridge runs the chosen agent on the brief in the
 * project folder, and progress comes back as `run` frames. Throws the
 * bridge's reason when it refuses.
 *
 * It does not set the hand-off. An agent in a chat that is watching would
 * wake on one and apply the same change a second time, beside the run.
 */
export async function makeChanges(agent: string): Promise<void> {
  const s = latest;
  if (!s?.changes || !s.prompt) throw new Error('there are no changes to make');
  const session = getSession();
  await ask<{ runId: string }>({
    method: 'run_agent',
    agent,
    brief: s.prompt,
    locks: session.locks,
    mayRun: session.agentsMayRun.includes(agent),
  });
}

/** Ask the bridge for its agents afresh, after one may have been signed in. */
export async function refreshAgents(): Promise<void> {
  const next = await ask<AgentInfo[]>({ method: 'list_agents' });
  if (Array.isArray(next)) setAgents(next);
}

/** Stop the run that is going. */
export async function cancelRun(): Promise<void> {
  await ask({ method: 'cancel_run' });
}
