import { describe, expect, it } from 'vitest';
import type { ScanResult } from '@/shared/types';
import { buildChangeSet, isEmpty, isLocal, toJson, toPrompt } from './commit';
import type { Override } from './reskin';

function scanOf(over: Partial<ScanResult> = {}): ScanResult {
  return {
    url: 'http://localhost:5173/',
    title: 'forfontsake',
    scannedAt: Date.now(),
    viewport: { width: 1280, height: 800, dpr: 2 },
    fontFaces: [],
    fontUsage: [],
    colors: [],
    gradients: [],
    contrastPairs: [],
    svgs: [],
    customProps: [
      {
        name: '--mark',
        value: '#be3a22',
        source: 'http://localhost:5173/src/index.css',
        uses: 34,
      },
    ],
    shape: { radii: [], shadows: [], spacing: [] },
    cssText: '.btn{color:#be3a22}.a{border-color:#be3a22}.b{background:rgb(190, 58, 34)}',
    unreadableSheets: [],
    stats: { elementsSampled: 100, styleSheets: 1 },
    ...over,
  };
}

const markOverride: Override = {
  name: '--mark',
  from: '#BE3A22',
  to: '#1C7F5C',
  reason: 'exact',
};

describe('buildChangeSet', () => {
  it('carries the token name, both values and its provenance', () => {
    const set = buildChangeSet(scanOf(), [markOverride], {});
    expect(set.tokens).toHaveLength(1);
    expect(set.tokens[0]).toMatchObject({
      name: '--mark',
      from: '#BE3A22',
      to: '#1C7F5C',
      source: 'http://localhost:5173/src/index.css',
      uses: 34,
    });
  });

  it('does not report a colour twice when a token already covers it', () => {
    // --mark is #BE3A22. Reporting the literal as well would have the agent do
    // the job twice, and the second way is the wrong way.
    const set = buildChangeSet(scanOf(), [markOverride], { '#BE3A22': '#1C7F5C' });
    expect(set.colors).toHaveLength(0);
    expect(set.tokens).toHaveLength(1);
  });

  it('reports hardcoded colours with how often they appear', () => {
    const set = buildChangeSet(scanOf(), [], { '#BE3A22': '#1C7F5C' });
    expect(set.colors).toHaveLength(1);
    // Two hex literals and one rgb() spelling of the same colour.
    expect(set.colors[0]!.uses).toBe(3);
  });

  it('drops a colour it cannot find in the CSS it could read', () => {
    const set = buildChangeSet(scanOf(), [], { '#123456': '#654321' });
    expect(set.colors).toEqual([]);
  });

  it('knows a local dev server from a deployed site', () => {
    expect(isLocal('http://localhost:5173/')).toBe(true);
    expect(isLocal('http://127.0.0.1:3000/x')).toBe(true);
    expect(isLocal('https://stripe.com/')).toBe(false);
    expect(isLocal('not a url')).toBe(false);
  });

  it('is empty when nothing was edited', () => {
    expect(isEmpty(buildChangeSet(scanOf(), [], {}))).toBe(true);
  });
});

describe('toPrompt', () => {
  it('tells the agent to edit the definition, not the usages', () => {
    const prompt = toPrompt(buildChangeSet(scanOf(), [markOverride], {}));
    expect(prompt).toMatch(/Edit the definition/i);
    expect(prompt).toMatch(/Do not replace usages/i);
    expect(prompt).toContain('`--mark`');
    expect(prompt).toContain('#BE3A22');
    expect(prompt).toContain('#1C7F5C');
  });

  it('never hands over a resolved stylesheet', () => {
    const prompt = toPrompt(buildChangeSet(scanOf(), [markOverride], {}));
    // The failure this whole format exists to avoid.
    expect(prompt).not.toMatch(/\{[^}]*color\s*:/);
  });

  it('suggests introducing tokens when the page has none', () => {
    const set = buildChangeSet(scanOf({ customProps: [] }), [], { '#BE3A22': '#1C7F5C' });
    const prompt = toPrompt(set);
    expect(prompt).toMatch(/consider introducing tokens/i);
  });

  it('does not lecture about tokens when the project already has them', () => {
    const set = buildChangeSet(scanOf(), [markOverride], {});
    expect(toPrompt(set)).not.toMatch(/consider introducing tokens/i);
  });

  it('says so when stylesheets could not be read', () => {
    const set = buildChangeSet(
      scanOf({ unreadableSheets: ['https://cdn.example.com/app.css'] }),
      [markOverride],
      {},
    );
    expect(toPrompt(set)).toMatch(/could not be read/i);
  });

  it('warns when the edit was made against a deployed site, not localhost', () => {
    const set = buildChangeSet(scanOf({ url: 'https://stripe.com/' }), [markOverride], {});
    expect(toPrompt(set)).toMatch(/deployed site/i);
    // ...and stays quiet about it on a local one.
    expect(toPrompt(buildChangeSet(scanOf(), [markOverride], {}))).not.toMatch(/deployed site/i);
  });

  it('tells the agent the URLs are a hint, not the source of truth', () => {
    const prompt = toPrompt(buildChangeSet(scanOf(), [markOverride], {}));
    expect(prompt).toMatch(/find the real definitions in the source/i);
  });

  it('says explicitly to change nothing else', () => {
    expect(toPrompt(buildChangeSet(scanOf(), [markOverride], {}))).toMatch(/Change nothing else/i);
  });
});

describe('toJson', () => {
  it('round-trips', () => {
    const set = buildChangeSet(scanOf(), [markOverride], {});
    expect(JSON.parse(toJson(set))).toEqual(JSON.parse(JSON.stringify(set)));
  });
});
