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
      <span className="text-2xs tracking-wide text-ink-muted uppercase">{children}</span>
      <button onClick={onOpen} className="text-2xs text-ink-muted hover:text-accent">
        edit in Variables
      </button>
    </div>
  );
}

export function PageStyles({ scan, onOpenVariables }: { scan: ScanResult; onOpenVariables: () => void }) {
  const colours = scan.colors.slice(0, 12);
  const fonts = scan.fontUsage.slice(0, 4);
  const radii = scan.shape.radii.slice(0, 6);
  const spacing = scan.shape.spacing.slice(0, 8);
  return (
    <div className="flex flex-col gap-3 border-t border-dashed border-line-subtle pt-3">
      {colours.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <Head onOpen={onOpenVariables}>Colours</Head>
          <div className="flex flex-wrap gap-1.5">
            {colours.map((c) => (
              <button
                key={c.hex}
                onClick={onOpenVariables}
                title={`${c.hex}${c.varNames[0] ? ` · ${c.varNames[0]}` : ''} · ${c.count} uses`}
                className="flex items-center gap-1.5 rounded-full border border-line bg-surface-control py-0.5 pr-2 pl-0.5 font-mono text-2xs text-ink-secondary hover:border-line-strong"
              >
                <span className="h-4 w-4 rounded-full border border-line" style={{ backgroundColor: c.hex }} />
                {c.varNames[0] ?? c.hex}
              </button>
            ))}
          </div>
        </section>
      )}
      {fonts.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <Head onOpen={onOpenVariables}>Type</Head>
          {fonts.map((f) => (
            <button
              key={f.family}
              onClick={onOpenVariables}
              className="flex items-baseline gap-2 rounded-control border border-line px-2 py-1 text-left hover:border-line-strong"
            >
              <span className="min-w-0 flex-1 truncate text-sm" style={{ fontFamily: f.family }}>
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
          <Head onOpen={onOpenVariables}>Shape</Head>
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-2xs text-ink-secondary">
            {radii.length > 0 && <span className="text-ink-muted">radius</span>}
            {radii.map((r) => (
              <span key={`r${r.value}`} className="rounded-control border border-line px-1.5" title={`${r.count} uses`}>
                {r.value}
              </span>
            ))}
            {spacing.length > 0 && <span className="ml-1 text-ink-muted">space</span>}
            {spacing.map((s) => (
              <span key={`s${s.value}`} className="rounded-control border border-line px-1.5" title={`${s.count} uses`}>
                {s.value}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
