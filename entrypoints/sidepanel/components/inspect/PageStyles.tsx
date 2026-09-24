import type { ScanResult } from '@/shared/types';

/**
 * What the page is made of, when nothing is picked.
 *
 * Figma's design panel does this: with no selection it shows the file's own
 * colour and text styles rather than an empty column. Here they are what the
 * scan read — the colours with the variables that name them, the fonts in
 * the sizes they are used at, the radii and the spacing steps — each a way
 * into Variables, where they are edited.
 */
function Head({ children, onOpen }: { children: string; onOpen: () => void }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="subhead">{children}</span>
      <button onClick={onOpen} className="text-2xs text-ink-muted hover:text-accent">
        Edit in System
      </button>
    </div>
  );
}

export function PageStyles({ scan, onOpenSystem }: { scan: ScanResult; onOpenSystem: () => void }) {
  const colours = scan.colors.slice(0, 12);
  const fonts = scan.fontUsage.slice(0, 4);
  const radii = scan.shape.radii.slice(0, 6);
  const spacing = scan.shape.spacing.slice(0, 8);
  return (
    <div className="-mx-3 flex flex-col gap-3 border-t border-line-subtle px-3 pt-3">
      {colours.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <Head onOpen={onOpenSystem}>Colours</Head>
          <div className="flex flex-wrap gap-1.5">
            {colours.map((c) => (
              <button
                key={c.hex}
                onClick={onOpenSystem}
                title={`${c.hex}${c.varNames[0] ? ` · ${c.varNames[0]}` : ''} · ${c.count} uses`}
                className="flex h-control-sm items-center gap-1.5 rounded-control bg-surface-field pr-2 pl-1 font-mono text-2xs text-ink-secondary hover:bg-surface-field-hover hover:text-ink"
              >
                <span className="h-3 w-3 rounded-[3px] swatch" style={{ backgroundColor: c.hex }} />
                {c.varNames[0] ?? c.hex}
              </button>
            ))}
          </div>
        </section>
      )}
      {fonts.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <Head onOpen={onOpenSystem}>Type</Head>
          {fonts.map((f) => (
            <button
              key={f.family}
              onClick={onOpenSystem}
              className="flex h-control items-center gap-2 rounded-control bg-surface-field px-2 text-left hover:bg-surface-field-hover"
            >
              <span className="min-w-0 flex-1 truncate text-xs text-ink" style={{ fontFamily: f.family }}>
                {f.family}
              </span>
              <span className="shrink-0 font-mono text-2xs text-ink-muted">
                {f.variants
                  .slice(0, 4)
                  .map((v) => `${v.size.replace(/px$/, '')}/${v.weight}`)
                  .join(' · ')}
              </span>
            </button>
          ))}
        </section>
      )}
      {(radii.length > 0 || spacing.length > 0) && (
        <section className="flex flex-col gap-1.5">
          <Head onOpen={onOpenSystem}>Shape</Head>
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-2xs text-ink-secondary">
            {radii.length > 0 && <span className="text-ink-muted">radius</span>}
            {radii.map((r) => (
              <span key={`r${r.value}`} className="h-5 rounded-[4px] bg-surface-field px-1.5 leading-5" title={`${r.count} uses`}>
                {r.value}
              </span>
            ))}
            {spacing.length > 0 && <span className="ml-1 text-ink-muted">space</span>}
            {spacing.map((s) => (
              <span key={`s${s.value}`} className="h-5 rounded-[4px] bg-surface-field px-1.5 leading-5" title={`${s.count} uses`}>
                {s.value}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
