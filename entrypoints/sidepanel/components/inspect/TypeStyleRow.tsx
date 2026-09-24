import { useState } from 'react';
import type { CustomPropInfo, ElementProps, TypeStyle } from '@/shared/types';
import { fieldPx, sizeLabel, styleOf } from '@/studio/typeStyleMatch';
import type { Change } from './fields';
import { ChevronIcon } from '../icons';

/** A style's family, when it holds one as a literal, so an option can wear it. */
const familyOf = (s: TypeStyle) => s.fields.family?.literal;

/**
 * Which type style the selection is on, and the others it could be on.
 *
 * Figma shows the applied text style in the Typography row; Framer's Text →
 * Styles; PandaDoc's heading picker draws each option in its own style.
 * This does the same over the page's own styles, in whatever form the
 * project writes them, and only those: a switch is one edit, previewed at
 * once, that says "this element is on the heading style now, not the
 * display one" — the tag stays what it is.
 */
export function TypeStyleRow({
  element,
  styles,
  props,
  rootFontSize = 16,
  onChange,
}: {
  element: ElementProps;
  styles: TypeStyle[];
  props: CustomPropInfo[];
  rootFontSize?: number;
  onChange: Change;
}) {
  const [open, setOpen] = useState(false);
  if (!styles.length) return null;
  const current = styleOf(element, styles, props, rootFontSize);
  const tag = element.tag.toUpperCase();
  const label = current ? `${tag} · ${current.style.name} ${sizeLabel(current.style, props, rootFontSize)}` : `${tag} · no style`;
  const pick = (s: TypeStyle) => {
    setOpen(false);
    if (current?.style === s) return;
    onChange('type-style', s.name, undefined, { typeStyle: s, from: current?.style.name ?? '' });
  };
  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Type style"
        title={
          current
            ? `${current.how === 'is' ? 'On' : 'Matches'} the ${current.style.name} style (${current.style.selectorOrUtility}); click to put it on another`
            : 'No page style has these numbers; click to put it on one'
        }
        className={`flex h-control w-full items-center gap-1.5 rounded-control px-2 text-left text-xs ${open ? 'bg-accent-soft text-accent' : 'bg-surface-field text-ink hover:bg-surface-field-hover'}`}
      >
        <span className="font-sans text-ink-muted">{current ? (current.how === 'is' ? 'is ' : 'matches ') : ''}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronIcon className={`h-2.5 w-2.5 text-ink-muted transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <ul className="m-0 flex list-none flex-col gap-0.5 rounded-control bg-surface-panel p-1 shadow-[inset_0_0_0_1px_var(--line-subtle)]" role="listbox" aria-label="Type styles">
          {styles.map((s) => {
            const size = fieldPx(s.fields.size, props, rootFontSize);
            const chosen = current?.style === s;
            return (
              <li key={`${s.form}:${s.selectorOrUtility}`}>
                <button
                  onClick={() => pick(s)}
                  aria-label={`Use style ${s.name}`}
                  aria-pressed={chosen}
                  title={`${s.selectorOrUtility} · ${s.form}`}
                  className={`flex h-7 w-full items-center gap-2 rounded-control px-1.5 text-left ${chosen ? 'bg-accent-soft text-accent' : 'hover:bg-surface-field'}`}
                >
                  <span
                    className="min-w-0 flex-1 truncate leading-none"
                    style={{
                      fontSize: size ? `${Math.max(11, Math.min(20, size * 0.6))}px` : undefined,
                      fontWeight: s.fields.weight?.literal,
                      fontFamily: familyOf(s),
                    }}
                  >
                    {s.name}
                  </span>
                  <span className="shrink-0 font-mono text-2xs text-ink-muted">{sizeLabel(s, props, rootFontSize)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
