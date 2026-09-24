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

  it('is the same list the content scripts write', async () => {
    // The scanner refuses to read these and the re-skin script refuses to
    // re-read them; the two agreeing is what stops an edit coming round again
    // as something the page does.
    // The frame's sheet is written by the inspector, through studio/pageFrame.ts;
    // the specimen's by its own script.
    const fs = await import('node:fs');
    const source = ['../entrypoints/reskin.content.ts', '../entrypoints/specimen.content.ts', './pageFrame.ts']
      .map((f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8'))
      .join('\n');
    for (const id of MANAGED_SHEET_IDS) expect(source).toContain(`'${id}'`);
    // Every id the script declares is in the shared list.
    for (const [, id] of source.matchAll(/^(?:export )?const [A-Z_]+_ID = '(codename-[a-z-]+)';$/gm)) {
      expect(MANAGED_SHEET_IDS as readonly string[]).toContain(id);
    }
  });
});
