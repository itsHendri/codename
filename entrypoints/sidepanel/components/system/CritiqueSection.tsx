import type { Critique } from '@/studio/critique';
import { FindingList } from './FindingList';

/**
 * What a designer would flag, from what the scan measured — the same list
 * the agent gets from its `critique` tool, so the two of you read one page.
 * Facts with the numbers behind them; whether each is a mistake is yours to
 * say, which is why nothing here has a fix button.
 */
export function CritiqueSection({ critique }: { critique: Critique }) {
  return (
    <FindingList
      findings={critique.findings}
      empty="Nothing to flag from what the scan measured."
      footer={
        <p className="text-2xs text-ink-muted">
          Your agent reads the same list through its <code>critique</code> tool.
        </p>
      }
    />
  );
}
