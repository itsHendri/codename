import { useState } from 'react';
import { DEFAULT_PORT } from '@/shared/protocol';
import { forget, pair, retry, useBridge, type BridgeStatus } from '../lib/bridge';
import { updateSession, useSession } from '../lib/session';

const LABEL: Record<BridgeStatus, string> = {
  off: 'Not paired',
  connecting: 'Looking for the bridge…',
  connected: 'Connected',
  unauthorized: 'Wrong pairing code',
};

/** The dot beside the site name: there when the agent can see the panel. */
export function BridgeDot({ status }: { status: BridgeStatus }) {
  if (status === 'off') return null;
  const cls =
    status === 'connected'
      ? 'bg-ok'
      : status === 'unauthorized'
        ? 'bg-warn'
        : 'bg-ink-faint animate-pulse';
  return <span className={`h-2 w-2 shrink-0 rounded-full ${cls}`} title={`Agent bridge: ${LABEL[status]}`} />;
}

/**
 * The "Agent bridge" section of the app menu: pair once with the code the
 * bridge prints, and decide whether the agent may paint on this page.
 */
export function BridgeSection() {
  const { status, pairing } = useBridge();
  const { agentMayWrite } = useSession();
  const [code, setCode] = useState('');

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <span className="text-2xs font-semibold tracking-wide text-ink-muted uppercase">Agent bridge</span>
        <span className="ml-auto flex items-center gap-1.5 text-2xs text-ink-muted">
          <BridgeDot status={status} />
          {LABEL[status]}
        </span>
      </div>

      {pairing ? (
        <div className="flex items-center gap-2 rounded-control border border-line px-2 py-1.5 text-xs">
          <span className="text-ink-muted">Port {pairing.port}</span>
          {status !== 'connected' && (
            <button onClick={retry} className="text-accent hover:underline">
              retry
            </button>
          )}
          <button onClick={() => void forget()} className="ml-auto text-ink-muted hover:text-ink">
            Forget
          </button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void pair(code, DEFAULT_PORT);
            setCode('');
          }}
        >
          <p className="px-1 text-2xs text-ink-muted">
            Enter the pairing code: ask your agent for it, or run{' '}
            <code className="font-mono">npx codename-bridge code</code>. The Changes tab walks through it.
          </p>
          <div className="flex gap-1.5">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Pairing code"
              spellCheck={false}
              autoComplete="off"
              className="min-w-0 flex-1 rounded-control border border-line bg-surface-panel px-2 py-1 font-mono text-xs tracking-widest uppercase"
            />
            <button
              type="submit"
              disabled={code.trim().length < 4}
              className="rounded-control bg-accent px-2.5 py-1 text-xs font-medium text-accent-ink hover:bg-accent-hover disabled:opacity-40"
            >
              Pair
            </button>
          </div>
        </form>
      )}

      <label className="flex items-center gap-2 px-1 text-xs">
        <input
          type="checkbox"
          checked={agentMayWrite}
          onChange={(e) => updateSession({ agentMayWrite: e.target.checked })}
        />
        <span>Agent may change this page</span>
      </label>
      <p className="px-1 text-2xs text-ink-muted">
        On by default for localhost. The agent's CSS is a preview on this tab, never a write to
        source.
      </p>
    </div>
  );
}
