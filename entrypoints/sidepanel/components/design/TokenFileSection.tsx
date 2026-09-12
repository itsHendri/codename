import { useRef, useState } from 'react';
import { parseTokenFile, type DriftReport } from '@/studio/tokenFile';
import { updateSession, useSession } from '../../lib/session';
import { FindingList } from './FindingList';

/**
 * The page held up against a design token file.
 *
 * Penpot, Figma and Tokens Studio all hand out W3C DTCG JSON, and Codename
 * writes it in Export, so the file is the one thing a design tool and a
 * running page can be compared through. What comes back is the same kind of
 * fact the critique gives — and the file is not automatically right, which is
 * why nothing here offers to make the page match it.
 */
export function TokenFileSection({ report }: { report: DriftReport | null }) {
  const { tokenFile } = useSession();
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = async (file: File) => {
    setError(null);
    const parsed = parseTokenFile(await file.text());
    if (parsed.error) return setError(parsed.error);
    if (!parsed.tokens.length) return setError('no tokens were found in that file');
    updateSession({ tokenFile: { name: file.name, tokens: parsed.tokens } });
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void load(file);
          e.target.value = '';
        }}
      />

      {tokenFile && report ? (
        <>
          <div className="flex items-center gap-2 text-xs">
            <code className="min-w-0 flex-1 truncate" title={tokenFile.name}>
              {tokenFile.name}
            </code>
            <span className="shrink-0 font-mono text-2xs text-ink-muted">{report.tokens} tokens</span>
            <button onClick={() => input.current?.click()} className="shrink-0 text-2xs text-accent hover:underline">
              replace
            </button>
            <button
              onClick={() => updateSession({ tokenFile: null })}
              className="shrink-0 text-2xs text-ink-muted hover:text-ink-secondary"
            >
              clear
            </button>
          </div>
          <FindingList
            findings={report.findings}
            empty="The page and this file agree."
            footer={
              <p className="text-2xs text-ink-muted">
                Your agent can ask for the same comparison with its <code>check_tokens</code> tool.
              </p>
            }
          />
        </>
      ) : (
        <>
          <p className="text-xs text-ink-muted">
            Compare this page with a design token file — W3C DTCG JSON as Penpot, Figma and Tokens Studio export it, or a
            plain map of custom properties. Nothing leaves your machine.
          </p>
          <button
            onClick={() => input.current?.click()}
            className="self-start rounded-control border border-line px-2 py-1 text-xs hover:bg-surface-control"
          >
            Choose a token file…
          </button>
        </>
      )}
      {error && <p className="text-xs text-warn-ink">{error}</p>}
    </div>
  );
}
