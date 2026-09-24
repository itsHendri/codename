import { describe, expect, it } from 'vitest';
import { sameOnPage, verifyWrites } from './verify';

const noWait = { schedule: [0, 1, 2, 3], sleep: async () => {} };
const write = { name: '--mark', from: '#be3a22', to: '#1c7f5c' };

describe('verifyWrites', () => {
  it('reports ok as soon as the page reads the new value', async () => {
    const answers = ['#be3a22', '#1C7F5C'];
    let asked = 0;
    const read = async () => ({ '--mark': answers[Math.min(asked++, answers.length - 1)]! });
    expect(await verifyWrites([write], read, noWait)).toEqual([{ name: '--mark', outcome: 'ok', seen: '#1C7F5C' }]);
    expect(asked).toBe(2);
  });

  it('reports silent when the page still reads the old value after the last ask', async () => {
    let asked = 0;
    const read = async () => {
      asked++;
      return { '--mark': '#be3a22' };
    };
    expect(await verifyWrites([write], read, noWait)).toEqual([{ name: '--mark', outcome: 'silent', seen: '#be3a22' }]);
    expect(asked).toBe(4);
  });

  it('reports a contradiction when the page reads something else, and stops asking', async () => {
    let asked = 0;
    const read = async () => {
      asked++;
      return { '--mark': '#000000' };
    };
    expect(await verifyWrites([write], read, noWait)).toEqual([{ name: '--mark', outcome: 'contradicted', seen: '#000000' }]);
    expect(asked).toBe(1);
  });

  it('treats an empty read as not yet, never as a contradiction', async () => {
    const answers = ['', '', '#1c7f5c'];
    let asked = 0;
    const read = async () => ({ '--mark': answers[Math.min(asked++, answers.length - 1)]! });
    expect((await verifyWrites([write], read, noWait))[0]?.outcome).toBe('ok');
  });

  it('keeps asking about the names still pending only', async () => {
    const asked: string[][] = [];
    const read = async (names: string[]) => {
      asked.push(names);
      return { '--mark': '#1c7f5c', '--ink': '#15171b' };
    };
    const reports = await verifyWrites([write, { name: '--ink', from: '#15171b', to: '#000' }], read, noWait);
    expect(reports.map((r) => [r.name, r.outcome])).toEqual([
      ['--mark', 'ok'],
      ['--ink', 'silent'],
    ]);
    expect(asked[1]).toEqual(['--ink']);
  });

  it('waits the gaps in the schedule, not the totals', async () => {
    const slept: number[] = [];
    await verifyWrites([write], async () => ({ '--mark': '#be3a22' }), { schedule: [0, 150, 300, 600], sleep: async (ms) => void slept.push(ms) });
    expect(slept).toEqual([150, 150, 300]);
  });
});

describe('sameOnPage', () => {
  it('compares colours by what they paint', () => {
    expect(sameOnPage('#1C7F5C', 'rgb(28, 127, 92)')).toBe(true);
    expect(sameOnPage('#1c7f5c', '#1c7f5d')).toBe(false);
  });
  it('compares anything else by its text, loosely', () => {
    expect(sameOnPage(' 1.25rem ', '1.25REM')).toBe(true);
    expect(sameOnPage('1.25rem', '1.5rem')).toBe(false);
  });
});
