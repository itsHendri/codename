import { css_to_tokens } from '@projectwallace/css-design-tokens';
import { critique } from '@/studio/critique';
import { seedBrandFromScan } from '@/studio/seedFromScan';
import type { ScanResult } from '@/shared/types';
import { isGray } from './color';

export function buildTokensJson(scan: ScanResult): string {
  const tokens = css_to_tokens(scan.cssText);
  return JSON.stringify(tokens, null, 2);
}

interface Consistency {
  colorCount: number;
  grayCount: number;
  fontSizeCount: number;
  fontFamilyCount: number;
  gradientCount: number;
}

export function consistencyStats(scan: ScanResult): Consistency {
  const sizes = new Set<string>();
  for (const f of scan.fontUsage) for (const v of f.variants) sizes.add(v.size);
  return {
    colorCount: scan.colors.length,
    grayCount: scan.colors.filter((c) => isGray(c.hex)).length,
    fontSizeCount: sizes.size,
    fontFamilyCount: scan.fontUsage.length,
    gradientCount: scan.gradients.length,
  };
}

function varPrefixes(scan: ScanResult): { prefix: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of scan.customProps) {
    const m = p.name.match(/^--([a-zA-Z]+)/);
    if (m) counts.set(`--${m[1]}-*`, (counts.get(`--${m[1]}-*`) ?? 0) + 1);
  }
  return Array.from(counts, ([prefix, count]) => ({ prefix, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

export interface ExportSections {
  colors: boolean;
  typography: boolean;
  spacing: boolean;
  shadows: boolean;
  rawVars: boolean;
}

export const ALL_SECTIONS: ExportSections = {
  colors: true,
  typography: true,
  spacing: true,
  shadows: true,
  rawVars: true,
};

export function buildBrandMd(scan: ScanResult, sections: ExportSections): string {
  const lines: string[] = [];
  const host = new URL(scan.url).hostname;
  const date = new Date(scan.scannedAt).toISOString().slice(0, 10);
  lines.push(`# Brand reference — ${host}`);
  lines.push('');
  lines.push(`> Extracted from ${scan.url} on ${date} by Codename.`);
  lines.push(`> Use this as design context: match these colors, fonts, and conventions.`);
  lines.push('');

  if (sections.typography && scan.fontUsage.length) {
    const heading = scan.fontUsage.find((f) => f.roles.includes('headings'));
    const body = scan.fontUsage.find((f) => f.roles.includes('body'));
    const code = scan.fontUsage.find((f) => f.roles.includes('code'));
    lines.push('## Typography');
    lines.push('');
    if (heading || body) {
      lines.push(
        `**Pairing:** ${heading?.family ?? body?.family} for headings, ${body?.family ?? '—'} for body${code ? `, ${code.family} for code` : ''}.`,
      );
      lines.push('');
    }
    for (const f of scan.fontUsage) {
      const face = scan.fontFaces.find((ff) => ff.family === f.family);
      const weights = face?.weights.join(', ') ?? 'n/a';
      lines.push(`- **${f.family}** — roles: ${f.roles.join(', ')}; weights: ${weights}; served: ${face?.service ?? 'system'}; used on ${f.elementCount} elements`);
    }
    lines.push('');
    lines.push('### Type scale in use');
    lines.push('');
    lines.push('| Size | Weight | Line height | Count |');
    lines.push('| --- | --- | --- | --- |');
    const scale = scan.fontUsage
      .flatMap((f) => f.variants)
      .sort((a, b) => parseFloat(b.size) - parseFloat(a.size))
      .slice(0, 10);
    for (const v of scale) lines.push(`| ${v.size} | ${v.weight} | ${v.lineHeight} | ${v.count} |`);
    lines.push('');
  }

  if (sections.colors && scan.colors.length) {
    lines.push('## Colors');
    lines.push('');
    for (const usage of ['text', 'background', 'border'] as const) {
      const group = scan.colors.filter((c) => c.usage.includes(usage)).slice(0, 8);
      if (!group.length) continue;
      lines.push(`### ${usage.charAt(0).toUpperCase()}${usage.slice(1)}`);
      lines.push('');
      for (const c of group) lines.push(`- \`${c.hex}\` — seen ${c.count}×`);
      lines.push('');
    }
    if (scan.gradients.length) {
      lines.push('### Gradients');
      lines.push('');
      for (const g of scan.gradients.slice(0, 5)) lines.push(`- \`${g.css}\``);
      lines.push('');
    }
  }

  if (sections.spacing && scan.shape.spacing.length) {
    lines.push('## Spacing');
    lines.push('');
    lines.push('Lengths seen in padding, margin and gap, most used first.');
    lines.push('');
    for (const v of scan.shape.spacing.slice(0, 12)) lines.push(`- \`${v.value}\` × ${v.count}`);
    if (scan.shape.radii.length) {
      lines.push('');
      lines.push(`Corner radii: ${scan.shape.radii.slice(0, 6).map((r) => `\`${r.value}\` × ${r.count}`).join(', ')}`);
    }
    lines.push('');
  }

  if (sections.shadows && scan.shape.shadows.length) {
    lines.push('## Shadows');
    lines.push('');
    for (const v of scan.shape.shadows.slice(0, 6)) lines.push(`- \`${v.value}\` × ${v.count}`);
    lines.push('');
  }

  if (sections.rawVars && scan.customProps.length) {
    lines.push('## CSS custom properties');
    lines.push('');
    const prefixes = varPrefixes(scan);
    if (prefixes.length) {
      lines.push(`Naming conventions: ${prefixes.map((p) => `\`${p.prefix}\` (${p.count})`).join(', ')}`);
      lines.push('');
    }
    lines.push('```css');
    for (const p of scan.customProps.slice(0, 80)) lines.push(`${p.name}: ${p.value};`);
    lines.push('```');
    lines.push('');
  }

  const stats = consistencyStats(scan);
  lines.push('## Consistency report');
  lines.push('');
  lines.push(
    `${stats.colorCount} distinct colors (${stats.grayCount} grays/neutrals), ${stats.fontFamilyCount} font families, ${stats.fontSizeCount} font sizes, ${stats.gradientCount} gradients.`,
  );
  // The same facts the panel's Critique section and the agent's tool show,
  // so a brand.md pasted as context already says what to be careful of.
  const review = critique(scan, seedBrandFromScan(scan));
  if (review.findings.length) {
    lines.push('');
    lines.push(`### What a designer would flag — ${review.summary}`);
    lines.push('');
    for (const f of review.findings) lines.push(`- [${f.level}] ${f.kind}: ${f.message}`);
  }
  if (scan.unreadableSheets.length) {
    lines.push('');
    lines.push(
      `_Note: ${scan.unreadableSheets.length} cross-origin stylesheet(s) could not be read; values above may be incomplete._`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

export { download } from '@/studio/download';
