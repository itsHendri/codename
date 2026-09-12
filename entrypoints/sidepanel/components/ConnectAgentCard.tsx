import { useState } from 'react';
import { CURSOR_MCP_JSON, DEFAULT_PORT } from '@/shared/protocol';
import { pair, useBridge } from '../lib/bridge';
import { CopyIcon } from './icons';

// One command: installs the codename skill and registers the bridge with Claude Code.
const CLAUDE_CMD = 'npx codename-bridge setup';
const CURSOR_JSON = CURSOR_MCP_JSON;

const LABEL: Record<string, string> = {
  off: 'Not connected',
  connecting: 'Looking for the bridge…',
  connected: 'Connected',
  unauthorized: 'That code did not match — check it with your agent',
};

/**
 * How the panel meets the agent, in the three steps it takes, where you first
 * need it: on the tab that hands work over. Register the bridge with the
 * agent, start the agent (it launches the bridge), and type the code the
 * bridge is waiting for. The code goes to the bridge's stderr, which an agent
 * swallows, so the card says how to read it: ask the agent, or run
 * `codename-bridge code` in a terminal.
 */
export function ConnectAgentCard() {
  const { status } = useBridge();
  const [code, setCode] = useState('');
  const [agent, setAgent] = useState<'claude' | 'cursor'>('claude');
  const [copied, setCopied] = useState(false);

  const snippet = agent === 'claude' ? CLAUDE_CMD : CURSOR_JSON;
  const copy = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-card border border-line bg-surface-panel p-3 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-ink">Connect your agent</span>
        <span className="ml-auto text-2xs text-ink-muted">{LABEL[status] ?? status}</span>
      </div>

      <Step n={1} title="Register the bridge with your agent, once">
        <div className="flex items-center gap-1 text-2xs">
          {(['claude', 'cursor'] as const).map((a) => (
            <button
              key={a}
              onClick={() => setAgent(a)}
              className={`rounded-full border px-2 py-0.5 ${
                agent === a ? 'border-accent text-accent' : 'border-line-subtle text-ink-muted hover:text-ink-secondary'
              }`}
            >
              {a === 'claude' ? 'Claude Code' : 'Cursor'}
            </button>
          ))}
          {agent === 'cursor' && <span className="text-ink-muted">in mcp.json</span>}
        </div>
        <div className="flex items-start gap-1.5">
          <code className="min-w-0 flex-1 rounded-control border border-line bg-surface-recessed px-1.5 py-1 font-mono text-2xs break-all whitespace-pre-wrap">
            {snippet}
          </code>
          <button onClick={copy} className="shrink-0 pt-1 text-ink-muted hover:text-accent" aria-label="Copy" title={copied ? 'Copied' : 'Copy'}>
            {copied ? <span className="text-2xs text-accent">✓</span> : <CopyIcon />}
          </button>
        </div>
      </Step>

      <Step n={2} title="Start your agent — it launches the bridge for you">
        <p className="text-2xs text-ink-muted">
          The bridge prints a six-character pairing code where the agent, not you, can see it. Ask the
          agent: <i>what is the Codename pairing code?</i> (it has a <code>pairing_code</code> tool) — or
          run <code className="font-mono">npx codename-bridge code</code> in a terminal.
        </p>
      </Step>

      <Step n={3} title="Enter the code">
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void pair(code, DEFAULT_PORT);
            setCode('');
          }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Pairing code"
            spellCheck={false}
            autoComplete="off"
            aria-label="Pairing code"
            className="min-w-0 flex-1 rounded-control border border-line bg-surface-recessed px-2 py-1 font-mono text-xs tracking-widest uppercase"
          />
          <button
            type="submit"
            disabled={code.trim().length < 4}
            className="rounded-control bg-accent px-2.5 py-1 text-xs font-medium text-accent-ink hover:bg-accent-hover disabled:opacity-40"
          >
            Pair
          </button>
        </form>
      </Step>

      <p className="text-2xs text-ink-muted">
        Everything stays on this machine: the bridge listens on 127.0.0.1 only. Nothing is written to
        source through it.
      </p>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-surface-control font-mono text-2xs text-ink-secondary">
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-ink-secondary">{title}</span>
        {children}
      </div>
    </div>
  );
}
