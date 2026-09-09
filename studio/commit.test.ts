import { describe, expect, it } from 'vitest';
import type { ScanResult } from '@/shared/types';
import { buildChangeSet, isEmpty, isLocal, summariseElements, toJson, toPrompt } from './commit';
import type { ElementChange } from './changes';
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
  it('says when a token was set by hand', () => {
    const prompt = toPrompt(buildChangeSet(scanOf(), [{ ...markOverride, reason: 'manual' }], {}));
    expect(prompt).toContain('set by hand');
    expect(prompt).not.toMatch(/\{[^}]*color\s*:/);
  });

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

const edit = (over: Partial<ElementChange>): ElementChange => ({
  id: 'x',
  selector: '.btn',
  matches: 1,
  stable: true,
  property: 'padding-top',
  from: '8px',
  to: '12px',
  status: 'applied',
  at: '2026-09-08T00:00:00.000Z',
  ...over,
});

describe('element changes', () => {
  it('describes a reorder as a markup change in words', () => {
    const edits: ElementChange[] = [
      { id: 'm1', selector: 'article.card:nth-of-type(3)', matches: 1, stable: false, property: 'move', from: 'last in `main.plate`', to: 'before `article.card:nth-of-type(1)` ("Grit") in `main.plate`', move: { parent: 'main.plate', before: 'article.card:nth-of-type(1)' }, status: 'applied', at: '2026-09-09T00:00:00.000Z' },
    ];
    const prompt = toPrompt(buildChangeSet(scanOf(), [], {}, edits));
    expect(prompt).toContain('move it: it was last in `main.plate`; put it before `article.card:nth-of-type(1)` ("Grit") in `main.plate`');
    expect(prompt).toContain('positional selector');
  });

  it('renders a shorthand as one line, still no stylesheet', () => {
    const edits: ElementChange[] = [
      { id: 'e1', selector: '.btn', matches: 1, stable: true, property: 'padding', from: '8px 16px', to: '12px', status: 'applied', at: '2026-09-08T00:00:00.000Z' },
    ];
    const prompt = toPrompt(buildChangeSet(scanOf(), [], {}, edits));
    expect(prompt).toContain('`padding`: `8px 16px` → `12px`');
    expect(prompt).not.toMatch(/\{[^}]*:[^}]*\}/);
  });

  it('collapses a scrub to one line, first value to last', () => {
    const out = summariseElements([edit({ id: 'a', to: '9px' }), edit({ id: 'b', from: '9px', to: '14px' })]);
    expect(out).toEqual([expect.objectContaining({ from: '8px', to: '14px' })]);
  });

  it('drops an edit that ended where it started', () => {
    expect(summariseElements([edit({ to: '10px' }), edit({ from: '10px', to: '8px' })])).toEqual([]);
  });

  it('counts towards emptiness and reaches the brief grouped by selector', () => {
    const set = buildChangeSet(scanOf(), [], {}, [
      edit({}),
      edit({ id: 'y', property: 'color', from: '#BE3A22', to: 'var(--mark)', token: '--mark' }),
      edit({ id: 'z', selector: 'h1', property: 'text', from: 'Hi', to: 'Hello', stable: false }),
    ]);
    expect(isEmpty(set)).toBe(false);
    const prompt = toPrompt(set);
    expect(prompt).toContain('## Element changes — 3');
    expect(prompt).toContain('- `.btn`');
    expect(prompt).toContain('`padding-top`: `8px` → `12px`');
    expect(prompt).toContain('`color`: `#BE3A22` → `var(--mark)` (the token `--mark`)');
    expect(prompt).toContain('text: "Hi" → "Hello"');
    expect(prompt).toContain('positional selector');
    // Still never a stylesheet.
    expect(prompt).not.toMatch(/\{[^}]*:[^}]*\}/);
  });
});

describe('scale changes', () => {
  it('reaches the brief even when no variable carries them', () => {
    const set = buildChangeSet(scanOf(), [], {}, [], [], [
      { area: 'type', label: 'body size', from: '15px', to: '18px' },
      { area: 'spacing', label: 'grid step', from: '8px', to: '6px' },
    ]);
    expect(isEmpty(set)).toBe(false);
    const prompt = toPrompt(set);
    expect(prompt).toContain('## Scale changes — 2');
    expect(prompt).toContain('- type · body size: `15px` → `18px`');
    expect(prompt).toContain('- spacing · grid step: `8px` → `6px`');
    // Still an instruction, never a stylesheet.
    expect(prompt).not.toMatch(/\{[^}]*:[^}]*\}/);
  });
});

describe('comments', () => {
  it('lists pending notes by element and counts towards emptiness', () => {
    const set = buildChangeSet(scanOf(), [], {}, [], [
      { id: 'n1', about: '.hero h1', selectors: ['.hero h1'], text: 'Too loud.\nTry the secondary weight.' },
      {
        id: 'n2',
        about: 'a 320 × 180 region at 40, 120',
        selectors: [],
        text: 'These should all be the same height.',
      },
    ]);
    expect(isEmpty(set)).toBe(false);
    const prompt = toPrompt(set);
    expect(prompt).toContain('## Comments — 2');
    expect(prompt).toContain('1. .hero h1 — n1');
    expect(prompt).toContain('   Too loud.\n   Try the secondary weight.');
    expect(prompt).toContain('2. a 320 × 180 region at 40, 120 — n2');
  });
});

describe('toJson', () => {
  it('round-trips', () => {
    const set = buildChangeSet(scanOf(), [markOverride], {});
    expect(JSON.parse(toJson(set))).toEqual(JSON.parse(JSON.stringify(set)));
  });
});
