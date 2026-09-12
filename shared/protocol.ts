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
import type { ComponentOrigin } from '@/studio/framework';

export const PROTOCOL_VERSION = 1 as const;
export const DEFAULT_PORT = 9612;

/** How an agent client is pointed at the bridge; the panel's Connect card and `setup` print the same. */
export const CLAUDE_REGISTER_ARGS = ['mcp', 'add', 'codename', '--', 'npx', 'codename-bridge'] as const;
export const CURSOR_MCP_JSON = '{ "mcpServers": { "codename": { "command": "npx", "args": ["codename-bridge"] } } }';

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
  /**
   * `chrome.runtime.id`. The bridge pins the first one it pairs with and
   * refuses the rest — a narrowing, not an authentication: an Origin header
   * is only trustworthy coming from a real browser.
   */
  extensionId?: string;
}

/**
 * The folder the bridge is running in. The extension sees a URL; this is how
 * a decision gets keyed to a repository instead of an origin. Every field
 * past `path` is absent rather than guessed when git cannot say.
 */
export interface ProjectInfo {
  path: string;
  name: string;
  root?: string;
  branch?: string;
  dirty?: boolean;
}

/** What the bridge says back to a hello it accepted. */
export interface HelloAck {
  bridgeVersion: string;
  project?: ProjectInfo;
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
  /** What the page's dev build says rendered it; absent on a built site. */
  component?: ComponentOrigin;
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
  /**
   * The user's consent for the bridge to write one variable definition in the
   * project it runs in. Off until they say so, per project, and the only
   * write the bridge is ever allowed.
   */
  bridgeMayWrite?: boolean;
  /** Tokens the person locked: keep as is, whatever a brief touches. */
  locks: string[];
  /** The standing rules, rendered by the panel, for the agent to read before it asks for anything. */
  rules: string;
}

/* ---------------- bridge → extension ---------------- */

/** The files the panel can hand an agent as design context; the same ones Export produces. */
export const DESIGN_FILES = ['brand.md', 'tokens.css', 'tokens.json', 'SKILL.md', 'DESIGN_SYSTEM.md'] as const;
export type DesignFile = (typeof DESIGN_FILES)[number];

export interface DesignSystemResult {
  url: string;
  /** When the page was read; the agent compares it with what it wrote last time. */
  scannedAt: number;
  files: { path: DesignFile; content: string; note: string }[];
}

export type BridgeRequest =
  /**
   * `viewport` names a preset on the bar (or `reset`); the window moves first,
   * then the capture. `selector` scrolls the first match into view and crops
   * the capture to its box.
   */
  | { method: 'screenshot'; viewport?: string; selector?: string }
  /** What a designer would flag on the page, from what the scan measured. */
  | { method: 'critique' }
  /** The page held up against a design token file the agent read from the repository. */
  | { method: 'check_tokens'; file: string; name?: string }
  /** The extracted system as files, so the agent can write its own instructions. */
  | { method: 'design_system'; files?: DesignFile[] }
  | { method: 'apply_css'; css: string }
  /** "Look here": the page scrolls to the element, lights it up and shows the note. Read-only. */
  | { method: 'point'; selector: string; note?: string }
  | { method: 'clear'; what: 'preview' | 'handoff' }
  | { method: 'set_status'; id: string; status: CommentStatus }
  | { method: 'reply'; id: string; text: string };

export interface ScreenshotResult {
  /** PNG, base64, no data-URL prefix. */
  png: string;
  width: number;
  height: number;
  /** Set when the capture was cropped to an element. */
  selector?: string;
  matches?: number;
}

/* ---------------- what the bridge finds in the repository ---------------- */

/** Where a custom property is defined in source, as the bridge found it. */
export interface Definition {
  /** Repository-relative, posix separators. */
  file: string;
  line: number | null;
  kind: 'css' | 'theme' | 'dtcg' | 'flat-json';
  /**
   * What the definition sits inside. Only `root` is unambiguous enough to
   * write to: a scoped or media-scoped definition is one of several the
   * cascade picks between.
   */
  context: 'root' | 'scoped' | 'media' | 'dark';
  value: string;
}

export interface DefinitionsPayload {
  /** Keyed by property name, including the leading `--`. */
  found: Record<string, Definition[]>;
  /** Set when the search hit its file or time budget, so absence proves nothing. */
  truncated?: boolean;
}

/* ---------------- panel → bridge ---------------- */

/**
 * What the panel asks the bridge for. The mirror image of `BridgeRequest`:
 * the panel owns the page, the bridge owns the folder, and each asks the
 * other for what only it can see.
 */
export type PanelRequest =
  /** Where are these properties defined in source? */
  | { method: 'find_definitions'; names: string[] }
  /**
   * Write one value in one definition. Refused unless the person turned the
   * project's write switch on, and unless the definition is still exactly
   * where and what it was when it was found.
   */
  | { method: 'apply_definition'; name: string; from: string; to: string; file: string; line: number };

export interface AppliedDefinition {
  name: string;
  file: string;
  line: number;
  from: string;
  to: string;
}

export type MessageType = 'hello' | 'state' | 'request' | 'response' | 'definitions' | 'ask';
