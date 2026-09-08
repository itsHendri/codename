/**
 * The contract between the panel and the local companion (`codename-bridge`).
 *
 * One process on the user's machine speaks stdio MCP to the agent and a
 * WebSocket on 127.0.0.1 to the extension. The panel pushes full snapshots of
 * what it knows; the bridge holds the latest one per session and answers the
 * agent's tools from it. The bridge validates only the envelope — the payload
 * shapes below are owned by the extension, so `studio/commit.ts` stays the one
 * place that defines a change.
 */

import type { ChangeSet } from '@/studio/commit';
import type { CommentTarget } from '@/studio/annotations';

export const PROTOCOL_VERSION = 1 as const;
export const DEFAULT_PORT = 9612;

export interface Envelope<T = unknown> {
  v: typeof PROTOCOL_VERSION;
  id: string;
  type: string;
  /** Set on a response, naming the request it answers. */
  replyTo?: string;
  ok?: boolean;
  error?: string;
  payload?: T;
}

/* ---------------- extension → bridge ---------------- */

export interface HelloPayload {
  token: string;
  extensionVersion: string;
  sessionId: string;
}

/** An element the user has pinned in the panel. */
export interface SelectedElement {
  selector: string;
  /** How many elements the selector matches; 1 means it is unique. */
  matches: number;
  tag: string;
  text?: string;
  rect?: { x: number; y: number; width: number; height: number };
  /** Computed values worth a glance: font, colours, box. Free-form on purpose. */
  computed: Record<string, string>;
}

export type CommentStatus = 'pending' | 'acknowledged' | 'resolved' | 'dismissed';

export interface CommentReply {
  from: 'user' | 'agent';
  text: string;
  at: string;
}

export interface Comment {
  id: string;
  url: string;
  /** An element, a set of them, a region of the page, or a run of text. */
  target: CommentTarget;
  text: string;
  status: CommentStatus;
  createdAt: string;
  replies: CommentReply[];
}

export interface SessionState {
  sessionId: string;
  /**
   * Bumps on intent, not on every drag tick: a hand-off, a comment, a status
   * change, a new selection. `watch` resolves when it moves.
   */
  revision: number;
  tab: { id: number; url: string; origin: string; title: string; local: boolean };
  scanSummary: { scannedAt: number; colors: number; fonts: number; customProps: number } | null;
  /** The live edit, as it would be handed off right now. */
  changes: ChangeSet | null;
  /** The brief for `changes`, precomputed so the bridge never renders one. */
  prompt: string | null;
  /** Set when the user pressed "Send to agent". Cleared by the agent or the user. */
  handoff: { changes: ChangeSet; prompt: string; at: string } | null;
  selection: SelectedElement | null;
  comments: Comment[];
  /** The user's consent for the agent to paint on this page. */
  agentMayWrite: boolean;
}

/* ---------------- bridge → extension ---------------- */

export type BridgeRequest =
  | { method: 'screenshot' }
  | { method: 'apply_css'; css: string }
  | { method: 'clear'; what: 'preview' | 'handoff' }
  | { method: 'set_status'; id: string; status: CommentStatus }
  | { method: 'reply'; id: string; text: string };

export interface ScreenshotResult {
  /** PNG, base64, no data-URL prefix. */
  png: string;
  width: number;
  height: number;
}

export type MessageType = 'hello' | 'state' | 'request' | 'response';
