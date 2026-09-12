import { describe, expect, it } from 'vitest';
import { isManagedSheet, MANAGED_SHEET_IDS } from '@/shared/types';

describe('the sheets this extension owns', () => {
  it('knows one of ours from the page', () => {
    for (const id of MANAGED_SHEET_IDS) {
      expect(isManagedSheet({ ownerNode: { id } })).toBe(true);
    }
    expect(isManagedSheet({ ownerNode: { id: 'site-styles' } })).toBe(false);
    expect(isManagedSheet({ ownerNode: null })).toBe(false);
    expect(isManagedSheet({})).toBe(false);
  });

  it('is the same list the re-skin script writes', async () => {
    // The scanner refuses to read these and the re-skin script refuses to
    // re-read them; the two agreeing is what stops an edit coming round again
    // as something the page does.
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../entrypoints/reskin.content.ts', import.meta.url), 'utf8'),
    );
    for (const id of MANAGED_SHEET_IDS) expect(source).toContain(`'${id}'`);
    // Every id the script declares is in the shared list.
    for (const [, id] of source.matchAll(/^const [A-Z_]+_ID = '(codename-[a-z-]+)';$/gm)) {
      expect(MANAGED_SHEET_IDS as readonly string[]).toContain(id);
    }
  });
});
