/**
 * The tools the agent sees. Every one of them answers from the latest
 * snapshot or forwards a request to the panel; none of them interprets a
 * ChangeSet, and none of them ever renders a stylesheet from one.
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError, type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { standingRules } from '../../../studio/commit';
import { z } from 'zod';
import { DESIGN_FILES, type CommentStatus, type DesignSystemResult, type ScreenshotResult } from '../../../shared/protocol';
import { DEVICE_PRESETS } from '../../../shared/types';

const VIEWPORTS = ['reset', ...DEVICE_PRESETS.map((p) => p.name)] as ['reset', ...string[]];
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

/** The rules as the panel renders them with no locks; the resource carries the live version. */
const STANDING_RULES = standingRules();

const mimeOf = (file: string) => (file.endsWith('.md') ? 'text/markdown' : file.endsWith('.json') ? 'application/json' : 'text/css');

const INSTRUCTIONS = `${STANDING_RULES}

How to work: call \`watch\` in a loop; when it reports a hand-off, call \`get_changes\`, apply the brief to source, then \`clear\` the hand-off. Pending comments come from \`get_comments\`; acknowledge, act, resolve. Read \`codename://rules\` for the rules with the current page's locked tokens, and \`codename://design-system/brand.md\` (or \`get_design_system\`) for the page's design context before larger work.`;

export interface McpOptions {
  /** The code the panel must be given to pair with this bridge. */
  pairingCode?: string;
}

export function createMcpServer(
  sessions: Sessions,
  version: string,
  opts: McpOptions = {},
): { server: McpServer; tools: string[] } {
  const server = new McpServer({ name: 'codename', version }, { instructions: INSTRUCTIONS });
  const tools: string[] = [];

  // The rules reach the agent without a tool call: as the server's
  // instructions above, and as resources a client can load into context.
  server.registerResource(
    'rules',
    'codename://rules',
    {
      title: 'Codename rules',
      description: 'The standing rules for applying a Codename brief, including any tokens the person locked on the current page.',
      mimeType: 'text/markdown',
    },
    async (uri) => {
      const current = sessions.current();
      const text = current?.state?.rules || STANDING_RULES;
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text }] };
    },
  );
  server.registerResource(
    'design-system',
    new ResourceTemplate('codename://design-system/{file}', {
      // Advertised only once a panel has read a page, so a client that reads
      // everything it is shown at startup is not handed five errors.
      list: async () => ({
        resources: sessions.current()?.state?.scanSummary
          ? DESIGN_FILES.map((file) => ({
              uri: `codename://design-system/${file}`,
              name: file,
              mimeType: mimeOf(file),
              description: 'The design system the panel read off the current page, as Export would write it.',
            }))
          : [],
      }),
    }),
    { title: 'Design system files', description: 'brand.md, tokens.css, tokens.json, SKILL.md and DESIGN_SYSTEM.md for the current page.' },
    async (uri, { file }) => {
      const name = String(file) as (typeof DESIGN_FILES)[number];
      if (!DESIGN_FILES.includes(name)) throw new McpError(ErrorCode.InvalidParams, `no such file: ${name}; one of ${DESIGN_FILES.join(', ')}`);
      if (!sessions.current()?.state?.scanSummary) {
        throw new McpError(ErrorCode.InvalidParams, 'no panel has read a page yet; open the Codename panel on a tab, pair it, and try again');
      }
      const result = (await sessions.sendRequest(undefined, { method: 'design_system', files: [name] })) as DesignSystemResult;
      const found = result.files.find((f) => f.path === name);
      if (!found) throw new McpError(ErrorCode.InvalidParams, `${name} is not available for this page yet`);
      return { contents: [{ uri: uri.href, mimeType: mimeOf(name), text: found.content }] };
    },
  );
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
    'critique',
    {
      description:
        'What a designer would flag on the page, from what the panel measured: contrast pairs under AA with how many elements carry them, spacing off the grid the page is otherwise on, colours close enough to be one colour written twice, type sizes on no step of the ladder, too many font families, too many radii. Facts with numbers, not taste; act on them in source and say which you left alone.',
      inputSchema: { session },
    },
    guard(async ({ session }) => {
      const result = (await sessions.sendRequest(session, { method: 'critique' })) as { text: string };
      return text(result.text);
    }),
  );

  register(
    'check_tokens',
    {
      description:
        "Hold the page up against a design token file from the repository — W3C DTCG JSON as Penpot, Figma and Tokens Studio export it, or a flat map of custom properties. Read the file yourself and pass its contents. Returns three kinds of fact: variables whose value has drifted from the token of the same name, colours the page paints that no token holds, and tokens nothing on this page reaches. The file is not automatically right; say which differences you are acting on and which you are leaving.",
      inputSchema: {
        session,
        file: z
          .string()
          .max(2_000_000)
          .describe('The token file\'s contents, as JSON text. Up to 2MB; a design token file is far smaller.'),
        name: z.string().optional().describe('What to call it in the report, e.g. "design/tokens.json".'),
      },
    },
    guard(async ({ session, file, name }) => {
      const result = (await sessions.sendRequest(session, { method: 'check_tokens', file, name })) as { text: string };
      return text(result.text);
    }),
  );

  register(
    'get_design_system',
    {
      description:
        'The design system the panel read off the page, as files: brand.md (fonts, colours by usage, spacing, the page\'s own variables, and what a designer would flag), tokens.css, tokens.json (W3C DTCG), SKILL.md and DESIGN_SYSTEM.md. Write them into the repo as design context — for example `.claude/skills/<host>/SKILL.md` with DESIGN_SYSTEM.md beside it — and call again after the user rescans; `scannedAt` says when the page was read. Pass `files` to fetch only some.',
      inputSchema: {
        session,
        files: z.array(z.enum(DESIGN_FILES)).optional().describe('Which files to return. Defaults to all of them.'),
      },
    },
    guard(async ({ session, files }) => {
      const result = (await sessions.sendRequest(session, { method: 'design_system', files })) as DesignSystemResult;
      const when = new Date(result.scannedAt).toISOString();
      return {
        content: [
          {
            type: 'text',
            text: `Design system of ${result.url}, read ${when}. ${result.files.length} file(s): ${result.files.map((f) => f.path).join(', ')}.`,
          },
          ...result.files.map((f) => ({ type: 'text' as const, text: `=== ${f.path} — ${f.note} ===\n${f.content}` })),
        ],
      };
    }),
  );

  register(
    'get_screenshot',
    {
      description:
        'Capture the visible part of the page as it is right now, including any preview the panel is painting. Returns a PNG. Pass `selector` to scroll the first match into view and crop to its box, to check one component after a change. Pass `viewport` to move the window to one of the bar\'s presets first (the page is zoomed where the display is too small, so its CSS viewport still reads true) — call once per width to review a change at every breakpoint — and `reset` to put the window back when you are done.',
      inputSchema: {
        session,
        selector: z.string().optional().describe('A CSS selector; the capture is cropped to the first match.'),
        viewport: z.enum(VIEWPORTS).optional().describe(`One of ${DEVICE_PRESETS.map((p) => `${p.name} (${p.width}×${p.height})`).join(', ')}, or reset.`),
      },
    },
    guard(async ({ session, viewport, selector }) => {
      const shot = (await sessions.sendRequest(session, { method: 'screenshot', viewport, selector }, 20_000)) as ScreenshotResult;
      return {
        content: [
          { type: 'image', data: shot.png, mimeType: 'image/png' },
          {
            type: 'text',
            text: `${shot.width}x${shot.height} px${shot.selector ? `, cropped to ${shot.selector} (${shot.matches ?? 1} ${shot.matches === 1 ? 'match' : 'matches'}, first shown)` : ''}`,
          },
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
      const r = (await sessions.sendRequest(session, { method: 'apply_css', css })) as {
        rules?: number;
        matched?: number;
        unreadable?: number;
        touchesLocked?: string[];
      };
      const rules = r?.rules ?? 0;
      const matched = r?.matched ?? 0;
      const unreadable = r?.unreadable ?? 0;
      const locked = r?.touchesLocked ?? [];
      return text(
        `applied: ${rules} ${rules === 1 ? 'rule' : 'rules'} reaching ${matched} ${matched === 1 ? 'element' : 'elements'}` +
          (unreadable ? `; ${unreadable} selector(s) the page could not read` : '') +
          '. The user sees a chip on the bar and a dashed outline on each of them until you call clear.' +
          (locked.length ? ` Note: the sheet redefines ${locked.join(', ')}, which the user locked (keep as is) — the preview stays up, but do not change ${locked.length === 1 ? 'that definition' : 'those definitions'} in source.` : ''),
      );
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
      description:
        "The element the user has pinned in the panel: a selector (with how many elements it matches), tag, text, bounding box and a few computed styles. `component` is present when the page's own dev build names what rendered it (React, Vue, Angular, or a build plugin's attribute) — that is the file to open; it is absent on a production build and never guessed from markup.",
      inputSchema: { session },
    },
    guard(({ session }) => {
      const state = sessions.getState(session);
      return state.selection ? json(state.selection) : text('nothing is selected');
    }),
  );

  register(
    'point',
    {
      description:
        'Point at an element the way a teammate would: the page scrolls to it, outlines it for a moment, and shows your note on the bar. Read-only and needs no consent; use it to say "look here" before or after a change. Returns how many elements the selector matched.',
      inputSchema: {
        selector: z.string().describe('A CSS selector; the first match is pointed at.'),
        note: z.string().max(200).optional().describe('A few words, shown beside the pointer.'),
        session,
      },
    },
    guard(async ({ selector, note, session }) => {
      const r = (await sessions.sendRequest(session, { method: 'point', selector, note })) as { matched: number };
      return text(r.matched ? `pointing at ${selector} (${r.matched} ${r.matched === 1 ? 'match' : 'matches'})` : `nothing on the page matches ${selector}; the user was told`);
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
