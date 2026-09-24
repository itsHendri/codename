import type { TokenSuggestion } from '@/studio/tokenMatch';
import { asReference } from '@/studio/tokenMatch';

/**
 * "matches --mark" when only the value agrees: a computed value cannot say
 * where it came from, so the chips offer the page's variables that would
 * give it. "is --mark" only when the inspector read the declaration that
 * paints it and it names the variable — a fact, not a match.
 */
export function TokenChips({
  suggestions = [],
  current,
  onPick,
  max = 3,
}: {
  suggestions?: TokenSuggestion[];
  current: string;
  onPick: (s: TokenSuggestion) => void;
  max?: number;
}) {
  const page = suggestions.filter((s) => s.source === 'page').slice(0, max);
  if (page.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {page.map((s) => {
        const chosen = current.trim() === asReference(s);
        return (
          <button
            key={s.name}
            onClick={() => onPick(s)}
            title={`${s.name}: ${s.value}`}
            className={`h-5 max-w-full truncate rounded-control px-1.5 font-mono text-2xs ${
              chosen
                ? 'bg-accent-soft text-accent'
                : 'bg-surface-field text-ink-secondary hover:bg-surface-field-hover hover:text-ink'
            }`}
          >
            <span className="font-sans text-ink-muted">{s.authored ? 'is' : s.exact ? 'matches' : 'near'} </span>
            {s.name}
          </button>
        );
      })}
    </div>
  );
}
