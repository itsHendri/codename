import { describe, expect, it } from 'vitest';
import type { ScanResult } from '@/shared/types';
import { buildBrandMd } from './exporters';

const scan: ScanResult = {
  url: 'http://localhost:5173/',
  title: 't',
  scannedAt: 0,
  viewport: { width: 1280, height: 800, dpr: 2 },
  fontFaces: [],
  fontUsage: [],
  colors: [],
  gradients: [],
  contrastPairs: [],
  svgs: [],
  customProps: [],
  shape: {
    radii: [{ value: '4px', count: 40 }],
    shadows: [{ value: '0 4px 12px rgba(0,0,0,0.12)', count: 3 }],
    spacing: [{ value: '8px', count: 90 }, { value: '16px', count: 70 }],
  },
  cssText: '',
  unreadableSheets: [],
  stats: { elementsSampled: 1, styleSheets: 1 },
};

const all = { colors: true, typography: true, spacing: true, shadows: true, rawVars: true };

describe('buildBrandMd sections', () => {
  it('writes spacing and shadows when asked', () => {
    const md = buildBrandMd(scan, all);
    expect(md).toContain('## Spacing');
    expect(md).toContain('- `8px` × 90');
    expect(md).toContain('Corner radii: `4px` × 40');
    expect(md).toContain('## Shadows');
    expect(md).toContain('0 4px 12px rgba(0,0,0,0.12)');
  });

  it('leaves them out when the boxes are unticked', () => {
    const md = buildBrandMd(scan, { ...all, spacing: false, shadows: false });
    expect(md).not.toContain('## Spacing');
    expect(md).not.toContain('## Shadows');
  });
});
