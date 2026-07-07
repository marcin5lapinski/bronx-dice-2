// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { diceFaceSrc, preloadDiceFaces } from './diceAssets';

describe('diceFaceSrc', () => {
  it('builds the glow path for an unheld die', () => {
    expect(diceFaceSrc(3, false)).toBe('/dice/die-glow-3.png');
  });

  it('builds the muted path for a held die', () => {
    expect(diceFaceSrc(3, true)).toBe('/dice/die-muted-3.png');
  });
});

describe('preloadDiceFaces', () => {
  it('creates an Image for every value/held-state combination', () => {
    const created: string[] = [];
    class FakeImage {
      set src(value: string) {
        created.push(value);
      }
    }
    const OriginalImage = globalThis.Image;
    globalThis.Image = FakeImage as unknown as typeof Image;

    try {
      preloadDiceFaces();
    } finally {
      globalThis.Image = OriginalImage;
    }

    const expected = [1, 2, 3, 4, 5, 6].flatMap((value) => [
      `/dice/die-glow-${value}.png`,
      `/dice/die-muted-${value}.png`,
    ]);
    expect(created.sort()).toEqual(expected.sort());
  });
});
