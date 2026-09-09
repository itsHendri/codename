import { useEffect, useState } from 'react';

/** A text value committed on blur or Enter, and flagged while it would not parse. */
export function TextInput({
  value,
  ariaLabel,
  valid,
  onCommit,
  className = '',
}: {
  value: string;
  ariaLabel: string;
  valid: (v: string) => boolean;
  onCommit: (v: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const ok = valid(draft);
  const commit = () => {
    if (ok && draft !== value) onCommit(draft);
  };
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
      spellCheck={false}
      aria-label={ariaLabel}
      className={`w-full min-w-0 rounded-control border bg-surface-recessed px-1 py-0.5 font-mono text-xs ${
        ok ? 'border-line' : 'border-warn bg-warn-soft'
      } ${className}`}
    />
  );
}
