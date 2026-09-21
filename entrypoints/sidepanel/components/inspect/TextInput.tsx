import { useEffect, useId, useState } from 'react';

/** A text value committed on blur or Enter, and flagged while it would not parse. */
export function TextInput({
  value,
  ariaLabel,
  valid,
  onCommit,
  className = '',
  suggestions,
}: {
  value: string;
  ariaLabel: string;
  valid: (v: string) => boolean;
  onCommit: (v: string) => void;
  className?: string;
  /** Values worth offering, as a datalist: the page's own fonts, say. */
  suggestions?: string[];
}) {
  const listId = useId();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const ok = valid(draft);
  const commit = () => {
    if (ok && draft !== value) onCommit(draft);
  };
  return (
    <>
    {suggestions && suggestions.length > 0 && (
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    )}
    <input
      list={suggestions?.length ? listId : undefined}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
      spellCheck={false}
      aria-label={ariaLabel}
      className={`field w-full min-w-0 px-2 font-mono ${ok ? '' : 'field-invalid'} ${className}`}
    />
    </>
  );
}
