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
import { critique, critiqueToText } from '@/studio/critique';
import { seedBrandFromScan } from '@/studio/seedFromScan';
import {
  DEFAULT_PORT,
  DESIGN_FILES,
  PROTOCOL_VERSION,
  type BridgeRequest,
  type DesignFile,
  type DesignSystemResult,
  type Envelope,
  type SessionState,
} from '@/shared/protocol';
import { buildChangeSet, isEmpty, isLocal, standingRules, toPrompt } from '@/studio/commit';
import { active } from '@/studio/changes';
import { buildExport } from '@/studio/export/bundle';
import { driftReport, driftToText, parseTokenFile } from '@/studio/tokenFile';
import { pendingNotes } from './comments';
import type { DesignModel } from './designModel';
import { ALL_SECTIONS, buildBrandMd } from './exporters';
import { applyAgentPreview, captureVisible, clearAgentPreview, cropCapture, sendInspector } from './messaging';
import {
  addReply,
  getSession,
  logAgent,
  setCommentStatus,
  updateSession,
  type TabSession,
} from './session';

export type BridgeStatus = 'off' | 'connecting' | 'connected' | 'unauthorized';

export interface Pairing {
  token: string;
  port: number;
}

const PAIRING_KEY = 'bridge';
const MAX_BACKOFF = 30_000;

/* ---------------- a tiny store, so the header dot and the menu agree ---------------- */

let status: BridgeStatus = 'off';
let pairing: Pairing | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const setStatus = (s: BridgeStatus) => {
  if (s === status) return;
  status = s;
  emit();
};

/* ---------------- the socket ---------------- */

let socket: WebSocket | null = null;
let backoff = 1000;
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
        sessionId,
      },
    });
    backoff = 1000;
    setStatus('connected');
    if (latest) send({ v: PROTOCOL_VERSION, id: uid(), type: 'state', payload: latest });
  };
  ws.onmessage = (e) => void onMessage(e.data as string);
  ws.onclose = (e) => {
    socket = null;
    if (e.code === 4401) {
      setStatus('unauthorized');
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
  setStatus(pairing ? 'connecting' : 'off');
}

async function onMessage(raw: string) {
  let msg: Envelope<BridgeRequest>;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
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
        const r = await sendInspector<{ ok: boolean; error?: string }>(tabId, { cmd: 'set-viewport', preset: req.viewport });
        if (!r) throw new Error('the page could not be reached');
        if (!r.ok) throw new Error(r.error ?? 'the window could not be resized');
        // The window has moved; give the page a moment to lay out at the new width.
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      type Box = { x: number; y: number; width: number; height: number };
      let box: { rect: Box; viewport: { width: number; height: number }; matches: number } | null = null;
      if (req.selector) {
        if (tabId == null) throw new Error('no tab');
        const r = await sendInspector<{ ok: boolean; matches: number; error?: string; rect?: Box; viewport?: { width: number; height: number } }>(
          tabId,
          { cmd: 'locate', selector: req.selector },
        );
        if (!r) throw new Error('the page could not be reached');
        if (!r.ok || !r.rect || !r.viewport) throw new Error(r.error ?? `nothing on the page matches ${req.selector}`);
        box = { rect: r.rect, viewport: r.viewport, matches: r.matches };
        // The scroll has landed; let the paint follow before the capture.
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      try {
        const shot = await captureVisible(win.id);
        if (!box) return shot;
        const cropped = await cropCapture(shot, box.rect, box.viewport);
        return { ...cropped, selector: req.selector, matches: box.matches };
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
const snapshot = () => ({ status, pairing });
let memo = snapshot();
const getSnapshot = () => {
  const next = snapshot();
  if (next.status !== memo.status || next.pairing !== memo.pairing) memo = next;
  return memo;
};

export function useBridge(): { status: BridgeStatus; pairing: Pairing | null } {
  useEffect(() => void start(), []);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Build the snapshot the agent sees and push it whenever it changes. */
export function useBridgeSync(
  tabId: number | null,
  tabUrl: string,
  session: TabSession,
  model: DesignModel | null,
) {
  tabIdForRequests = tabId;
  modelForRequests = model;
  const changes = useMemo(() => {
    if (!session.scan) return null;
    const set = buildChangeSet(
      session.scan,
      model?.handoff.overrides ?? [],
      model?.handoff.colorMap ?? {},
      active(session.log),
      pendingNotes(session.comments),
      model?.system ?? [],
      session.locks,
    );
    return isEmpty(set) ? null : set;
  }, [model, session.scan, session.log, session.comments, session.locks]);
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
      locks: session.locks,
      rules: standingRules(session.locks),
    };
    // Only the fields read above: an activity-log entry or a tab switch in the
    // panel must not re-render the prompt and push the same snapshot again.
  }, [tabId, tabUrl, session.revision, session.scan, session.handoff, session.pinned, session.comments, session.agentMayWrite, session.locks, changes]);

  useEffect(() => {
    if (state) schedulePush(state);
  }, [state]);
}

/** Take the agent's preview off the page, from the bar's chip, the Changes row, or the agent itself. */
export async function dropAgentPreview(): Promise<void> {
  if (tabIdForRequests != null) await clearAgentPreview(tabIdForRequests);
  updateSession({ agentPreview: null });
}

/** Press "Send to agent": the current change set becomes the hand-off. */
export function sendToAgent(): boolean {
  const s = latest;
  if (!s?.changes || !s.prompt) return false;
  updateSession((prev) => ({
    handoff: { changes: s.changes!, prompt: s.prompt!, at: new Date().toISOString() },
    revision: prev.revision + 1,
  }));
  return true;
}
