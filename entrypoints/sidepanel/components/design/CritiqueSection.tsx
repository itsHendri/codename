import type { Critique } from '@/studio/critique';

const LEVEL_CLASS: Record<string, string> = {
  fail: 'border-warn text-warn-ink',
  warn: 'border-line-strong text-ink-secondary',
  note: 'border-line-subtle text-ink-muted',
};

/**
 * What a designer would flag, from what the scan measured — the same list
 * the agent gets from its `critique` tool, so the two of you read one page.
 * Facts with the numbers behind them; whether each is a mistake is yours to
 * say, which is why nothing here has a fix button.
 */
export function CritiqueSection({ critique }: { critique: Critique }) {
  if (!critique.findings.length) {
    return <p className="text-xs text-ink-muted">Nothing to flag from what the scan measured.</p>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {critique.findings.map((f, i) => (
        <div key={i} className="flex items-start gap-2 rounded-control border border-line-subtle px-2 py-1.5">
          <span className={`mt-px shrink-0 rounded-full border px-1.5 text-2xs ${LEVEL_CLASS[f.level]}`}>{f.level}</span>
          <div className="min-w-0 flex-1">
            <span className="text-2xs tracking-wide text-ink-muted uppercase">{f.kind}</span>
            <p className="text-xs text-ink-secondary">{f.message}</p>
          </div>
        </div>
      ))}
      <p className="text-2xs text-ink-muted">
        Your agent reads the same list through its <code>critique</code> tool.
      </p>
    </div>
  );
}
