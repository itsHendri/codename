import { describe, expect, it } from 'vitest';
import { ALWAYS, evaluateFeature, fitZoom, frameCss, MIN_ZOOM, NEVER, rewriteMedia } from './frame';

const phone = { width: 375, height: 667 };
const laptop = { width: 1280, height: 800 };

describe('evaluateFeature', () => {
  it.each([
    ['(max-width: 700px)', phone, true],
    ['(max-width: 700px)', laptop, false],
    ['(min-width: 1024px)', laptop, true],
    ['(min-width: 1024px)', phone, false],
    ['(width: 375px)', phone, true],
    ['(max-height: 700px)', phone, true],
  ])('answers %s for a %o frame', (feature, frame, expected) => {
    expect(evaluateFeature(feature, frame)).toBe(expected);
  });

  it('reads em and rem as the initial 16px, as media queries do', () => {
    expect(evaluateFeature('(max-width: 48em)', { width: 768, height: 1024 })).toBe(true);
    expect(evaluateFeature('(max-width: 48rem)', { width: 769, height: 1024 })).toBe(false);
  });

  it("reads em at the browser's default size when the person changed it", () => {
    expect(evaluateFeature('(max-width: 48em)', { width: 900, height: 1024 }, 20)).toBe(true);
  });

  it.each([
    ['(width <= 700px)', phone, true],
    ['(width > 700px)', phone, false],
    ['(700px >= width)', phone, true],
    ['(400px <= width <= 900px)', { width: 768, height: 1024 }, true],
    ['(400px <= width <= 900px)', laptop, false],
  ])('answers the range form %s', (feature, frame, expected) => {
    expect(evaluateFeature(feature, frame)).toBe(expected);
  });

  it('works out orientation from the frame', () => {
    expect(evaluateFeature('(orientation: portrait)', phone)).toBe(true);
    expect(evaluateFeature('(orientation: landscape)', laptop)).toBe(true);
  });

  it('works out an aspect ratio', () => {
    expect(evaluateFeature('(min-aspect-ratio: 16/10)', laptop)).toBe(true);
    expect(evaluateFeature('(max-aspect-ratio: 1/1)', phone)).toBe(true);
  });

  it('treats the deprecated device-width as the frame too', () => {
    expect(evaluateFeature('(max-device-width: 480px)', phone)).toBe(true);
  });

  it.each([
    ['a colour scheme', '(prefers-color-scheme: dark)'],
    ['a pointer', '(hover: hover)'],
    ['a unit it cannot convert', '(max-width: 20cm)'],
    ['nonsense', '(wat)'],
  ])('leaves %s to the browser', (_, feature) => {
    expect(evaluateFeature(feature, phone)).toBe(null);
  });
});

describe('rewriteMedia', () => {
  it('answers the size features and keeps everything around them', () => {
    expect(rewriteMedia('screen and (max-width: 700px)', phone)).toEqual({ text: `screen and ${ALWAYS}`, changed: true });
    expect(rewriteMedia('screen and (max-width: 700px)', laptop).text).toBe(`screen and ${NEVER}`);
  });

  it('keeps a negation meaning the opposite', () => {
    // `not all and (max-width: 700px)` applies above 700; at a phone it must not.
    expect(rewriteMedia('not all and (max-width: 700px)', phone).text).toBe(`not all and ${ALWAYS}`);
  });

  it('leaves a feature it does not answer for alone, beside one it does', () => {
    expect(rewriteMedia('(prefers-color-scheme: dark) and (max-width: 700px)', phone).text).toBe(
      `(prefers-color-scheme: dark) and ${ALWAYS}`,
    );
  });

  it('answers every query in a list', () => {
    expect(rewriteMedia('(max-width: 400px), (min-width: 1200px)', laptop).text).toBe(`${NEVER}, ${ALWAYS}`);
  });

  it('reaches inside the grouping of level 4 conditions', () => {
    expect(rewriteMedia('not ((min-width: 600px) and (max-width: 900px))', phone).text).toBe(`not (${NEVER} and ${ALWAYS})`);
  });

  it('says it changed nothing for a query with no size in it', () => {
    expect(rewriteMedia('print', phone)).toEqual({ text: 'print', changed: false });
    expect(rewriteMedia('(prefers-reduced-motion: reduce)', phone).changed).toBe(false);
  });

  it('gives the same answer when asked again, so re-applying is safe', () => {
    const once = rewriteMedia('(max-width: 700px) and (orientation: portrait)', phone).text;
    expect(rewriteMedia(once, phone).text).toBe(once);
    expect(rewriteMedia(once, laptop).text).toBe(once);
  });

  it('stands in with queries that really are always and never true', () => {
    // The stand-ins are evaluated by the browser against the real window.
    expect(evaluateFeature(ALWAYS, { width: 1, height: 1 })).toBe(true);
    expect(evaluateFeature(NEVER, { width: 1, height: 1 })).toBe(false);
  });
});

describe('fitZoom', () => {
  it('leaves a frame that fits at full size', () => {
    expect(fitZoom(375, 1100)).toBe(1);
  });

  it('scales a frame wider than the room down, leaving a gutter', () => {
    expect(fitZoom(1280, 1100)).toBe(0.82);
  });

  it('does not scale below the floor', () => {
    expect(fitZoom(2560, 200)).toBe(MIN_ZOOM);
  });

  it('does nothing when there is no room to measure', () => {
    expect(fitZoom(1280, 0)).toBe(1);
  });
});

describe('frameCss', () => {
  it('narrows and centres the body', () => {
    const css = frameCss(phone, 1);
    expect(css).toContain('width: 375px !important');
    expect(css).toContain('margin-left: auto !important');
    expect(css).not.toContain('zoom');
  });

  it('clips what spills past the frame at the root, where a body cannot', () => {
    expect(frameCss(phone, 1)).toContain('html { overflow-x: hidden !important; }');
  });

  it('scales only when it has to', () => {
    expect(frameCss(laptop, 0.82)).toContain('zoom: 0.82 !important');
  });
});
