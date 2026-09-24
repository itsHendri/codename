/**
 * A running bridge, without the MCP half: the panel's socket, the file that
 * advertises it, and the runs Make changes starts.
 *
 * `codename-bridge` puts an MCP server on stdio in front of this for an agent
 * in a chat; `codename-bridge open` runs it on its own, so a person can get
 * from a folder to a paired panel without opening a chat at all.
 */

import { randomUUID } from 'node:crypto';
import type { spawn } from 'node:child_process';
import { PROTOCOL_VERSION } from '../../../shared/protocol';
import type { AgentInfo, AppliedDefinition, PanelRequest, RunSnapshot, SessionState, WriteResult } from '../../../shared/protocol';
import { findAgents, realSyncExec, type Found, type SyncExec } from './agents';
import { applyDefinition, findDefinitions } from './definitions';
import { writeTokens } from './writer';
import { bridgeFilePath, generateToken, readBridgeFile, removeBridgeFile, TOKEN_RE, writeBridgeFile } from './pairing';
import { readProject } from './project';
import { forget, pushDefinitions } from './push';
import { buildRunPrompt, startRun, type Run } from './run';
import { Sessions } from './sessions';
import { startServer, type BridgeServer } from './ws';

export interface HostOptions {
  cwd: string;
  port: number;
  keepToken?: boolean;
  version: string;
  log: (line: string) => void;
  /** Where the advertising file goes; the real one unless a test says otherwise. */
  filePath?: string;
  agents?: Found[];
  spawnProcess?: typeof spawn;
}

export interface Host {
  token: string;
  port: number;
  sessions: Sessions;
  server: BridgeServer;
  close(): Promise<void>;
}

type RunRequest = Extract<PanelRequest, { method: 'run_agent' }>;

/**
 * Answers the panel's `run_agent` and `cancel_run`, one run at a time, and
 * sends each snapshot to the panel that asked.
 */
/** How long a sign-in answer is trusted: long enough not to ask on every hello, short enough to notice a sign-in. */
const SIGNED_IN_TTL_MS = 15_000;

export class Runs {
  private current: Run | null = null;
  private last: RunSnapshot | null = null;
  private signedIn = new Map<string, { at: number; ok: boolean | null }>();

  constructor(
    private readonly opts: {
      cwd: string;
      sessions: Sessions;
      agents: Found[];
      log: (line: string) => void;
      spawnProcess?: typeof spawn;
      exec?: SyncExec;
      now?: () => number;
    },
  ) {}

  /** Whether this copy is signed in, asked of the tool itself and kept for a moment. */
  private isSignedIn({ agent, bin }: Found): boolean | null {
    if (!agent.signedIn) return null;
    const now = (this.opts.now ?? Date.now)();
    const known = this.signedIn.get(bin);
    if (known && now - known.at < SIGNED_IN_TTL_MS) return known.ok;
    const ok = agent.signedIn(bin, this.opts.exec ?? realSyncExec);
    this.signedIn.set(bin, { at: now, ok });
    return ok;
  }

  /** The agents with every sign-in asked again, for a panel that says something may have changed. */
  refresh(): AgentInfo[] {
    this.signedIn.clear();
    return this.info();
  }

  info(): AgentInfo[] {
    return this.opts.agents.map((found) => {
      const { agent, bin } = found;
      const info: AgentInfo = { id: agent.id, name: agent.name, can: agent.can };
      if (this.isSignedIn(found) === false) info.signIn = agent.signIn(bin);
      return info;
    });
  }

  latest(): RunSnapshot | null {
    return this.last;
  }

  start(sessionId: string, request: RunRequest): { runId: string } {
    const state: SessionState | null = this.opts.sessions.get(sessionId).state;
    // Every refusal says why, and each is checked before anything runs.
    if (!request.mayRun) throw new Error('Make changes has not been allowed in this project yet');
    if (!state?.tab?.local) throw new Error('the page is not served from this machine, so nothing read from it is written to this project');
    if (typeof request.brief !== 'string' || !request.brief.trim()) throw new Error('there are no changes to make');
    const found = this.opts.agents.find((a) => a.agent.id === request.agent);
    if (!found) throw new Error(`${request.agent || 'that agent'} was not found on this machine`);
    if (this.current) throw new Error(`${this.last?.agentName ?? 'The agent'} is still working on the last change`);
    // Asked again rather than read from the cache: a person who just signed
    // in and pressed again should not be told no.
    this.signedIn.delete(found.bin);
    if (this.isSignedIn(found) === false) {
      const fix = found.agent.signIn(found.bin);
      throw new Error(`${fix.text} ${fix.command}`);
    }

    const runId = randomUUID();
    const locks = Array.isArray(request.locks) ? request.locks.filter((l): l is string => typeof l === 'string') : [];
    this.opts.log(`make changes: ${found.agent.name} (${found.bin})`);
    const run = startRun({
      runId,
      cwd: this.opts.cwd,
      found,
      prompt: buildRunPrompt(request.brief, locks),
      spawnProcess: this.opts.spawnProcess,
      onUpdate: (snapshot) => {
        this.last = snapshot;
        this.send(sessionId, snapshot);
      },
    });
    this.current = run;
    void run.finished.then((s) => {
      if (this.current === run) this.current = null;
      const files = s.files.length ? `: ${s.files.join(', ')}` : '';
      this.opts.log(`make changes ${s.status}${s.error ? ` (${s.error})` : files}`);
    });
    return { runId };
  }

  /** On the way out: an agent in its own process group would otherwise outlive the bridge. */
  stop(): void {
    this.current?.cancel();
  }

  cancel(): { cancelled: boolean } {
    if (!this.current) throw new Error('nothing is running');
    this.current.cancel();
    return { cancelled: true };
  }

  /** To whichever socket the session has now; a panel that reconnected gets the rest. */
  private send(sessionId: string, snapshot: RunSnapshot) {
    let link;
    try {
      link = this.opts.sessions.get(sessionId).link;
    } catch {
      return;
    }
    try {
      link?.send({ v: PROTOCOL_VERSION, id: `run-${snapshot.runId}-${snapshot.steps.length}-${snapshot.status}`, type: 'run', payload: snapshot });
    } catch {
      // A socket that closed mid-send; the next hello carries the snapshot.
    }
  }
}

export async function startBridge(opts: HostOptions): Promise<Host> {
  const { cwd, log } = opts;
  // $CODENAME_BRIDGE_FILE lets a second bridge run beside the real one (a test
  // driver, say) without taking over the file the real one is found by.
  const filePath = opts.filePath ?? (process.env.CODENAME_BRIDGE_FILE || bridgeFilePath());
  const previous = readBridgeFile(filePath);
  const token = opts.keepToken && previous && TOKEN_RE.test(previous.token) ? previous.token : generateToken();

  const sessions = new Sessions();
  sessions.project = readProject(cwd);
  const runs = new Runs({ cwd, sessions, agents: opts.agents ?? findAgents(), log, spawnProcess: opts.spawnProcess });

  /** What the panel asks of the folder: where tokens live, the token writes, and Make changes. */
  const answerPanel = async (sessionId: string, request: PanelRequest): Promise<unknown> => {
    if (request.method === 'find_definitions') return findDefinitions(cwd, request.names);
    if (request.method === 'run_agent') return runs.start(sessionId, request);
    if (request.method === 'cancel_run') return runs.cancel();
    if (request.method === 'list_agents') return runs.refresh();
    const state: SessionState | null = sessions.get(sessionId).state;
    if (!state?.bridgeMayWrite) throw new Error('this project has not been allowed to take edits from the panel');
    // The consent is kept per project, so it is still on when the same tab
    // has moved to a deployed site; a value read there is not this folder's.
    if (!state.tab?.local) throw new Error('the page is not served from this machine, so nothing read from it is written to this project');
    if (request.method === 'write_tokens') {
      const result: WriteResult = writeTokens(cwd, request.edits);
      for (const w of result.written) log(`wrote ${w.name}: ${w.from} → ${w.to} in ${w.file}:${w.line} (${w.scope})`);
      for (const r of result.refused) log(`refused ${r.name}: ${r.reason}`);
      return result;
    }
    const applied: AppliedDefinition = applyDefinition(cwd, request);
    log(`applied ${applied.name}: ${applied.from} → ${applied.to} in ${applied.file}:${applied.line}`);
    return applied;
  };

  const server = await startServer({
    port: opts.port,
    token,
    sessions,
    bridgeVersion: opts.version,
    pinnedExtensionId: process.env.CODENAME_EXTENSION_ID || previous?.extensionId,
    // Read from the file for each hello, so `unpin` reaches this process.
    readPin: () => process.env.CODENAME_EXTENSION_ID || readBridgeFile(filePath)?.extensionId,
    onPin: (extensionId) => {
      const file = readBridgeFile(filePath);
      if (file && file.pid === process.pid) writeBridgeFile(filePath, { ...file, extensionId });
    },
    project: () => readProject(cwd),
    agents: () => runs.info(),
    run: () => runs.latest(),
    onAsk: answerPanel,
    onState: (sessionId, state, link) => {
      pushDefinitions(cwd, sessionId, state, link);
    },
    onGone: forget,
    allowNoOrigin: process.env.CODENAME_ALLOW_NO_ORIGIN === '1',
    // Comma-separated page origins, e.g. the panel harness at http://localhost:5320.
    devOrigins: (process.env.CODENAME_DEV_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean),
    log,
  });

  writeBridgeFile(filePath, {
    token,
    port: server.port,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    cwd,
    ...(previous?.extensionId ? { extensionId: previous.extensionId } : {}),
  });
  log(`codename-bridge listening on ws://127.0.0.1:${server.port} — pairing code: ${token}`);
  if (sessions.project) log(`running in ${sessions.project.name}${sessions.project.branch ? ` on ${sessions.project.branch}` : ''}`);
  const names = runs.info().map((a) => a.name);
  log(names.length ? `Make changes can run: ${names.join(', ')}` : 'no coding agent found on this machine; Make changes needs Claude Code, Cursor or Codex');

  return {
    token,
    port: server.port,
    sessions,
    server,
    close: async () => {
      runs.stop();
      await server.close();
      removeBridgeFile(filePath, process.pid);
    },
  };
}
