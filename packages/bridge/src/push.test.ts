import { describe, expect, it, beforeEach } from 'vitest';
import type { ChangeSet } from '@/studio/commit';
import type { DefinitionsPayload, Envelope } from '../../../shared/protocol';
import { forget, namesIn, pushDefinitions } from './push';
import { makeState } from './test-helpers';

const changeSet = (patch: Partial<ChangeSet> = {}): ChangeSet => ({
  site: 'http://localhost:3000/',
  editedAt: 't',
  local: true,
  tokens: [],
  colors: [],
  system: [],
  elements: [],
  comments: [],
  unreadable: [],
  ...patch,
});

const token = (name: string) => ({ name, from: '#000', to: '#111', reason: 'exact' as const });

describe('namesIn', () => {
  it('collects token names, the variables behind element edits, and locks', () => {
    const state = makeState('s1', 1, {
      changes: changeSet({
        tokens: [token('--mark')],
        elements: [{ selector: '.btn', matches: 1, stable: true, property: 'color', from: '#000', to: '#fff', token: '--ink' }],
      }),
      locks: ['--paper'],
    });
    expect(namesIn(state)).toEqual(['--ink', '--mark', '--paper']);
  });

  it('leaves out anything that is not a custom property', () => {
    const state = makeState('s1', 1, { changes: changeSet({ tokens: [token('brand')] }) });
    expect(namesIn(state)).toEqual([]);
  });

  it('is empty for a page nobody has edited', () => {
    expect(namesIn(makeState('s1', 1))).toEqual([]);
  });
});

describe('pushDefinitions', () => {
  const sent: Envelope[] = [];
  const link = { send: (e: Envelope) => sent.push(e) };
  const find = (): DefinitionsPayload => ({ found: { '--mark': [{ file: 'a.css', line: 2, kind: 'css', context: 'root', value: '#000' }] } });

  beforeEach(() => {
    sent.length = 0;
    forget('s1');
  });

  it('sends the definitions for the names in a change set', () => {
    const state = makeState('s1', 1, { changes: changeSet({ tokens: [token('--mark')] }) });
    expect(pushDefinitions('/repo', 's1', state, link, { find })).toBe(true);
    expect(sent[0]).toMatchObject({ type: 'definitions', payload: { found: { '--mark': [{ file: 'a.css', line: 2 }] } } });
  });

  it('does not search again while the same names are in play', () => {
    const state = makeState('s1', 1, { changes: changeSet({ tokens: [token('--mark')] }) });
    pushDefinitions('/repo', 's1', state, link, { find });
    // A second edit to the same token is a new revision, not a new name.
    const later = makeState('s1', 2, { changes: changeSet({ tokens: [token('--mark')] }) });
    expect(pushDefinitions('/repo', 's1', later, link, { find })).toBe(false);
    expect(sent).toHaveLength(1);
  });

  it('searches again once a new name appears', () => {
    pushDefinitions('/repo', 's1', makeState('s1', 1, { changes: changeSet({ tokens: [token('--mark')] }) }), link, { find });
    const more = makeState('s1', 2, { changes: changeSet({ tokens: [token('--mark'), token('--ink')] }) });
    expect(pushDefinitions('/repo', 's1', more, link, { find })).toBe(true);
    expect(sent).toHaveLength(2);
  });

  it('sends nothing for a page with no named tokens', () => {
    expect(pushDefinitions('/repo', 's1', makeState('s1', 1), link, { find })).toBe(false);
    expect(sent).toEqual([]);
  });
});
