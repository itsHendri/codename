const LEVEL_CLASS: Record<string, string> = {
  fail: 'border-warn text-warn-ink',
  warn: 'border-line-strong text-ink-secondary',
  note: 'border-line-subtle text-ink-muted',
};

export interface ListedFinding {
  kind: string;
  level: 'fail' | 'warn' | 'note';
  message: string;
}

/**
 * A measured finding, however it was measured: the critique reads the page
 * alone, the token-file report reads it against a file. Both are facts with
 * the numbers behind them, so both are shown the same way — and neither has
 * a fix button, because whether a fact is a mistake is the reader's call.
 */
export function FindingList({ findings, empty, footer }: { findings: ListedFinding[]; empty: string; footer?: React.ReactNode }) {
  if (!findings.length) return <p className="text-xs text-ink-muted">{empty}</p>;
  return (
    <div className="flex flex-col gap-1.5">
      {findings.map((f, i) => (
        <div key={`${f.kind}-${i}`} className="flex items-start gap-2 rounded-control border border-line-subtle px-2 py-1.5">
          <span className={`mt-px shrink-0 rounded-full border px-1.5 text-2xs ${LEVEL_CLASS[f.level]}`}>{f.level}</span>
          <div className="min-w-0 flex-1">
            <span className="text-2xs tracking-wide text-ink-muted uppercase">{f.kind}</span>
            <p className="text-xs text-ink-secondary">{f.message}</p>
          </div>
        </div>
      ))}
      {footer}
    </div>
  );
}
