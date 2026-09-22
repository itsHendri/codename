import { describe, expect, it } from 'vitest';
import { clampPanel, embeddedTab, PANEL_MAX, PANEL_MIN } from './embed';

describe('the panel in the page', () => {
  it('reads its tab from the URL, and is not embedded without one', () => {
    expect(embeddedTab('?tab=42')).toBe(42);
    expect(embeddedTab('')).toBeNull();
    expect(embeddedTab('?tab=')).toBeNull();
    expect(embeddedTab('?tab=abc')).toBeNull();
    expect(embeddedTab('?tab=-3')).toBeNull();
  });

  it('keeps its width between the side panel floor and the ceiling', () => {
    expect(clampPanel(100)).toBe(PANEL_MIN);
    expect(clampPanel(9999)).toBe(PANEL_MAX);
    expect(clampPanel(400.4)).toBe(400);
  });
});
