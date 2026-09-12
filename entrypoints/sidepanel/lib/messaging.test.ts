import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The bug this pins: with the inspector already in a tab, a re-skin message
 * "succeeds" with no answer, and the re-skin script was never injected — so
 * a seed change repainted nothing once you had used Hover inspect.
 */
function stubChrome(answers: (unknown | Error)[]) {
  const sendMessage = vi.fn(async () => {
    const next = answers.shift();
    if (next instanceof Error) throw next;
    return next;
  });
  const executeScript = vi.fn(async () => []);
  (globalThis as { chrome?: unknown }).chrome = {
    tabs: { sendMessage, connect: () => ({ onDisconnect: { addListener() {} }, disconnect() {} }) },
    scripting: { executeScript },
    permissions: { request: async () => true },
  };
  return { sendMessage, executeScript };
}

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome;
  vi.resetModules();
});

describe('sending to a content script', () => {
  it('injects when the tab has no script at all', async () => {
    const c = stubChrome([new Error('Receiving end does not exist'), { ok: true, vars: 1, rules: 0 }]);
    const { applyReskin } = await import('./messaging');
    const r = await applyReskin(1, [{ name: '--mark', from: '#000', to: '#fff' }], {});
    expect(c.executeScript).toHaveBeenCalledWith(expect.objectContaining({ files: ['content-scripts/reskin.js'] }));
    expect(r).toEqual({ ok: true, vars: 1, rules: 0 });
  });

  it('injects when another of our scripts answered with nothing', async () => {
    const c = stubChrome([undefined, { ok: true, vars: 1, rules: 0 }]);
    const { applyReskin } = await import('./messaging');
    const r = await applyReskin(1, [{ name: '--mark', from: '#000', to: '#fff' }], {});
    expect(c.executeScript).toHaveBeenCalledTimes(1);
    expect(c.sendMessage).toHaveBeenCalledTimes(2);
    expect(r?.vars).toBe(1);
  });

  it('does not inject twice when the script is already there', async () => {
    const c = stubChrome([{ ok: true, hover: true, selected: false }]);
    const { sendInspector } = await import('./messaging');
    await sendInspector(1, { cmd: 'hover', on: true });
    expect(c.executeScript).not.toHaveBeenCalled();
  });
});

describe('isElementProps', () => {
  const isElementProps = async (v: unknown) => (await import('./messaging')).isElementProps(v);
  const real = {
    selector: 'h1#title',
    tag: 'h1',
    type: { fontWeight: '600' },
    box: { paddingTop: '8px' },
    color: { text: '#000' },
  };

  it('accepts what the inspector actually answers with', async () => {
    expect(await isElementProps(real)).toBe(true);
  });

  it.each([
    ['nothing', null],
    ['a generic acknowledgement', { ok: true, vars: 0, rules: 0 }],
    ['a half-shaped element', { selector: 'h1', tag: 'h1' }],
    ['a string', 'h1#title'],
  ])('refuses %s', async (_, value) => {
    // A content script from another build, or a page that did not understand
    // the command, answers something truthy and shaped nothing like this.
    expect(await isElementProps(value)).toBe(false);
  });
});
