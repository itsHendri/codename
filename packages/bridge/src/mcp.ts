/**
 * The tools the agent sees. Every one of them answers from the latest
 * snapshot or forwards a request to the panel; none of them interprets a
 * ChangeSet, and none of them ever renders a stylesheet from one.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { CommentStatus, ScreenshotResult } from '../../../shared/protocol';
import type { Sessions } from './sessions';

export const MAX_WATCH_MS = 25_000;

const session = z.string().optional().describe('Session id from list_sessions. Defaults to the session that most recently pushed state.');
const commentStatus = z.enum(['pending', 'acknowledged', 'resolved', 'dismissed']);

const json = (value: unknown): CallToolResult => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
const text = (value: string): CallToolResult => ({ content: [{ type: 'text', text: value }] });
const fail = (err: unknown): CallToolResult => ({
  content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
  isError: true,
});

/** Wraps a handler so thrown errors come back as an `isError` result instead of a protocol failure. */
const guard =
  <A>(fn: (args: A) => Promise<CallToolResult> | CallToolResult) =>
  async (args: A): Promise<CallToolResult> => {
    try {
      return await fn(args);
    } catch (err) {
      return fail(err);
    }
  };

export interface McpOptions {
  /** The code the panel must be given to pair with this bridge. */
  pairingCode?: string;
}

export function createMcpServer(
  sessions: Sessions,
  version: string,
  opts: McpOptions = {},
): { server: McpServer; tools: string[] } {
  const server = new McpServer({ name: 'codename', version });
  const tools: string[] = [];
  const register: McpServer['registerTool'] = (name, config, cb) => {
    tools.push(name);
    return server.registerTool(name, config, cb);
  };

  register(
    'pairing_code',
    {
      description:
        'The six-character code the user types into the Codename panel (Changes tab, or the menu) to pair it with this bridge. Tell it to the user when they ask how to connect; it is for them alone and is never sent anywhere else.',
      inputSchema: {},
    },
    guard(() =>
      opts.pairingCode
        ? text(`Pairing code: ${opts.pairingCode} — enter it in the Codename panel under Connect agent.`)
        : text('This bridge has no pairing code.'),
    ),
  );

  register(
    'list_sessions',
    {
      description:
        'List every panel that has paired with this bridge: session id, page url/title, whether the page is local, its revision and whether it is still connected. Pass a sessionId as `session` to other tools to address a specific panel.',
      inputSchema: {},
    },
    guard(() => json(sessions.list())),
  );

  register(
    'get_changes',
    {
      description:
        'The design change the user made in the panel, as a ChangeSet (token renames with old and new values, colour literal swaps) plus a prompt describing it. Prefers a hand-off the user explicitly sent ("Send to agent"); falls back to the live, unsent edit. Apply the change to source by editing the token definitions it names; never paste rendered CSS.',
      inputSchema: { session },
    },
    guard(({ session }) => {
      const state = sessions.getState(session);
      if (state.handoff) return json({ source: 'handoff', at: state.handoff.at, changes: state.handoff.changes, prompt: state.handoff.prompt });
      if (state.changes) return json({ source: 'live', changes: state.changes, prompt: state.prompt });
      return text('The user has not changed anything on this page yet.');
    }),
  );

  register(
    'watch',
    {
      description:
        'Block until the panel state changes (a hand-off, a comment, a status change, a new selection) or the timeout elapses, then return the revision and what is waiting: `handoff` set, count of pending `comments`, whether a `selection` exists. Omit `since` to wait for the next change; pass the last revision you saw to catch anything you missed. Call it again in a loop to work hands-free.',
      inputSchema: {
        session,
        since: z.number().int().optional().describe('Return as soon as revision exceeds this. Defaults to the current revision.'),
        timeoutMs: z.number().int().positive().optional().describe(`How long to wait, capped at ${MAX_WATCH_MS}.`),
      },
    },
    guard(async ({ session, since, timeoutMs }) => {
      const current = sessions.get(session);
      const from = since ?? current.state?.revision ?? -1;
      const result = await sessions.waitFor(current.id, from, Math.min(timeoutMs ?? MAX_WATCH_MS, MAX_WATCH_MS));
      const state = current.state;
      return json({
        session: current.id,
        revision: result.revision,
        timedOut: result.timedOut,
        handoff: Boolean(state?.handoff),
        comments: state?.comments.filter((c) => c.status === 'pending').length ?? 0,
        selection: Boolean(state?.selection),
      });
    }),
  );

  register(
    'get_screenshot',
    {
      description: 'Capture the visible part of the page as it is right now, including any preview the panel is painting. Returns a PNG.',
      inputSchema: { session },
    },
    guard(async ({ session }) => {
      const shot = (await sessions.sendRequest(session, { method: 'screenshot' })) as ScreenshotResult;
      return {
        content: [
          { type: 'image', data: shot.png, mimeType: 'image/png' },
          { type: 'text', text: `${shot.width}x${shot.height} px` },
        ],
      };
    }),
  );

  register(
    'apply_css',
    {
      description:
        'Paint a stylesheet onto the page as a preview so the user can see a proposal before you touch source. Replaces any earlier preview. Requires the user to have allowed agent writes in the panel menu.',
      inputSchema: { css: z.string().describe('A complete stylesheet to inject.'), session },
    },
    guard(async ({ css, session }) => {
      const state = sessions.getState(session);
      if (!state.agentMayWrite) return fail('the user has not allowed the agent to change this page; ask them to enable it in the panel menu');
      await sessions.sendRequest(session, { method: 'apply_css', css });
      return text('applied');
    }),
  );

  register(
    'clear',
    {
      description: 'Remove the agent preview from the page (`preview`) or mark the pending hand-off as consumed (`handoff`).',
      inputSchema: { what: z.enum(['preview', 'handoff']), session },
    },
    guard(async ({ what, session }) => {
      await sessions.sendRequest(session, { method: 'clear', what });
      return text(`cleared ${what}`);
    }),
  );

  register(
    'get_selection',
    {
      description: 'The element the user has pinned in the panel: a selector (with how many elements it matches), tag, text, bounding box and a few computed styles.',
      inputSchema: { session },
    },
    guard(({ session }) => {
      const state = sessions.getState(session);
      return state.selection ? json(state.selection) : text('nothing is selected');
    }),
  );

  register(
    'get_comments',
    {
      description: 'Comments the user pinned to elements on the page, each with a selector, text, status and reply thread. Filter by status to find work: `pending` is new.',
      inputSchema: { session, status: commentStatus.optional() },
    },
    guard(({ session, status }) => {
      const comments = sessions.getState(session).comments;
      return json(status ? comments.filter((c) => c.status === status) : comments);
    }),
  );

  register(
    'set_status',
    {
      description: 'Move a comment through its lifecycle: acknowledge it when you start, resolve it when the change is in source, dismiss it if you will not act on it.',
      inputSchema: { id: z.string(), status: commentStatus, session },
    },
    guard(async ({ id, status, session }) => {
      await sessions.sendRequest(session, { method: 'set_status', id, status: status as CommentStatus });
      return text(`comment ${id} is now ${status}`);
    }),
  );

  register(
    'reply',
    {
      description: 'Reply in a comment thread. Keep it short; the user reads it in the panel.',
      inputSchema: { id: z.string(), text: z.string(), session },
    },
    guard(async ({ id, text: body, session }) => {
      await sessions.sendRequest(session, { method: 'reply', id, text: body });
      return text(`replied to ${id}`);
    }),
  );

  return { server, tools };
}
