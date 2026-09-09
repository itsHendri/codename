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
  PROTOCOL_VERSION,
  type BridgeRequest,
  type Envelope,
  type SessionState,
} from '@/shared/protocol';
import { buildChangeSet, isEmpty, isLocal, toPrompt } from '@/studio/commit';
import { active } from '@/studio/changes';
import { pendingNotes } from './comments';
import type { DesignModel } from './designModel';
import { applyAgentPreview, captureVisible, clearAgentPreview } from './messaging';
import {
  addReply,
  getSession,
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
    reply(true, await handle(msg.payload));
  } catch (err) {
    reply(false, undefined, err instanceof Error ? err.message : String(err));
  }
}

async function handle(req: BridgeRequest): Promise<unknown> {
  const tabId = tabIdForRequests;
  const session = getSession();
  switch (req.method) {
    case 'screenshot': {
      const win = await chrome.windows.getCurrent();
      if (win.id == null) throw new Error('no window');
      try {
        return await captureVisible(win.id);
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
    case 'apply_css': {
      if (!session.agentMayWrite) throw new Error('the user has not allowed the agent to change this page');
      if (tabId == null) throw new Error('no tab');
      const r = await applyAgentPreview(tabId, req.css);
      if (!r) throw new Error('the page could not be reached');
      updateSession({ agentPreview: req.css.trim().length > 0 });
      return { applied: true };
    }
    case 'clear': {
      if (req.what === 'handoff') {
        updateSession({ handoff: null });
        return { cleared: 'handoff' };
      }
      if (tabId != null) await clearAgentPreview(tabId);
      updateSession({ agentPreview: false });
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
  const changes = useMemo(() => {
    if (!session.scan) return null;
    const set = buildChangeSet(
      session.scan,
      model?.handoff.overrides ?? [],
      model?.handoff.colorMap ?? {},
      active(session.log),
      pendingNotes(session.comments),
      model?.system ?? [],
    );
    return isEmpty(set) ? null : set;
  }, [model, session.scan, session.log, session.comments]);
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
          }
        : null,
      comments: session.comments,
      agentMayWrite: session.agentMayWrite,
    };
  }, [tabId, tabUrl, session, changes]);

  useEffect(() => {
    if (state) schedulePush(state);
  }, [state]);
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
