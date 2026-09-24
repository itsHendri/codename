import { describe, expect, it } from 'vitest';
import { toYaml, yamlString } from './yaml';

describe('toYaml', () => {
  it('quotes what YAML would read as something else, and leaves plain words alone', () => {
    expect(yamlString('Inter')).toBe('Inter');
    expect(yamlString('#1A1C1E')).toBe('"#1A1C1E"');
    expect(yamlString('{colors.primary}')).toBe('"{colors.primary}"');
    expect(yamlString('16px')).toBe('"16px"');
    expect(yamlString('no')).toBe('"no"');
    expect(yamlString('a: b')).toBe('"a: b"');
    expect(yamlString('say "hi"')).toBe('"say \\"hi\\""');
  });

  it('nests maps and lists two spaces at a time', () => {
    const out = toYaml({
      name: 'Daylight',
      colors: { primary: '#1A1C1E', '4x': '16px' },
      typography: { h1: { fontFamily: 'Public Sans', fontSize: '48px', fontWeight: 600, lineHeight: 1.1 } },
      omitted: [],
      list: ['a', { b: 1 }],
    });
    expect(out).toBe(
      [
        'name: Daylight',
        'colors:',
        '  primary: "#1A1C1E"',
        '  "4x": "16px"',
        'typography:',
        '  h1:',
        '    fontFamily: Public Sans',
        '    fontSize: "48px"',
        '    fontWeight: 600',
        '    lineHeight: 1.1',
        'omitted: []',
        'list:',
        '  - a',
        '  -',
        '    b: 1',
      ].join('\n'),
    );
  });
});
