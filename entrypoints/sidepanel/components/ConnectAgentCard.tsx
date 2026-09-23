import { useState } from 'react';
import { DEFAULT_PORT } from '@/shared/protocol';
import { pair, useBridge } from '../lib/bridge';
import { CheckIcon, CopyIcon } from './icons';

/** One command, run in the project: the bridge, the dev server, the page, and the code. */
const OPEN_CMD = 'npx codename-bridge open .';

const LABEL: Record<string, string> = {
  off: 'Not connected',
  connecting: 'Looking for the bridge…',
  connected: 'Connected',
  unauthorized: 'That code did not match — check the terminal running codename-bridge open',
  locked: 'Too many wrong codes — the panel tries again by itself once the bridge opens, in five minutes',
  'other-extension':
    'This bridge paired with a different copy of Codename, such as a development build. Run npx codename-bridge unpin, then enter the code again.',
};

/**
 * How the panel meets the project, where you first need it: on the tab that
 * makes the changes. One command in the project folder starts the bridge and
 * the dev server, opens the page and prints the code; the code goes in here.
 * After that, Make changes runs the person's own coding agent from that
 * folder — no chat has to be open for it.
 *
 * Handing the code out over the socket to whoever asks was tried and
 * removed: an Origin header only means something coming from a real
 * browser, so it would have replaced the code with a public extension id.
 */
export function ConnectAgentCard() {
  const { status } = useBridge();
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(OPEN_CMD);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-card border border-line bg-surface-panel p-3 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-ink">Connect your project</span>
        <span className="ml-auto text-2xs text-ink-muted">{LABEL[status] ?? status}</span>
      </div>

      <Step n={1} title="In your project folder, run">
        <div className="flex items-start gap-1.5">
          <code className="min-w-0 flex-1 rounded-control bg-surface-field px-2 py-1.5 font-mono text-2xs break-all whitespace-pre-wrap">
            {OPEN_CMD}
          </code>
          <button onClick={copy} className="flex h-control w-6 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-surface-field hover:text-ink" aria-label="Copy" title={copied ? 'Copied' : 'Copy'}>
            {copied ? <CheckIcon className="h-3 w-3 text-accent" /> : <CopyIcon className="h-3 w-3" />}
          </button>
        </div>
        <p className="text-2xs text-ink-muted">
          It starts the bridge and your dev server, opens the page, and prints a pairing code.
        </p>
      </Step>

      <Step n={2} title="Enter the code">
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
            className="field min-w-0 flex-1 px-2 font-mono tracking-widest uppercase placeholder:tracking-normal placeholder:normal-case placeholder:text-ink-muted"
          />
          <button
            type="submit"
            disabled={code.trim().length < 4}
            className="btn btn-primary"
          >
            Pair
          </button>
        </form>
      </Step>

      <p className="text-2xs text-ink-muted">
        Make changes then runs Claude Code, Cursor or Codex in that folder, signed in with your own
        account. The bridge listens on 127.0.0.1 only; the agent talks to its own model service, as it
        always does.
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
