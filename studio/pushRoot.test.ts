// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createRootPush } from './pushRoot';

describe('pushing the page off an edge', () => {
  it('sets an important margin and puts back what the page had', () => {
    document.documentElement.style.setProperty('margin-left', '3px');
    const push = createRootPush('left');
    push.set(240);
    expect(document.documentElement.style.getPropertyValue('margin-left')).toBe('240px');
    expect(document.documentElement.style.getPropertyPriority('margin-left')).toBe('important');
    expect(push.on).toBe(true);
    push.clear();
    expect(document.documentElement.style.getPropertyValue('margin-left')).toBe('3px');
    expect(document.documentElement.style.getPropertyPriority('margin-left')).toBe('');
    expect(push.on).toBe(false);
  });

  it('removes the margin when the page had none, and moves rather than stacks', () => {
    document.documentElement.style.removeProperty('margin-top');
    const push = createRootPush('top');
    push.set(40);
    push.set(48);
    expect(document.documentElement.style.getPropertyValue('margin-top')).toBe('48px');
    push.clear();
    expect(document.documentElement.style.getPropertyValue('margin-top')).toBe('');
    // Clearing twice is nothing, not a second restore of a stale value.
    push.clear();
    expect(push.on).toBe(false);
  });

  it('pushes from the right on its own margin, leaving the left one alone', () => {
    const left = createRootPush('left');
    const right = createRootPush('right');
    left.set(240);
    right.set(360);
    expect(document.documentElement.style.getPropertyValue('margin-left')).toBe('240px');
    expect(document.documentElement.style.getPropertyValue('margin-right')).toBe('360px');
    right.clear();
    expect(document.documentElement.style.getPropertyValue('margin-right')).toBe('');
    expect(document.documentElement.style.getPropertyValue('margin-left')).toBe('240px');
    left.clear();
  });
});
