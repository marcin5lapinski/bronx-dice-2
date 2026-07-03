import { describe, it, expect } from 'vitest';
import { AVATAR_OPTIONS, avatarSrc } from './avatarOptions';

describe('avatarOptions', () => {
  it('has at least 12 distinct avatar options with unique ids', () => {
    expect(AVATAR_OPTIONS.length).toBeGreaterThanOrEqual(12);
    const ids = AVATAR_OPTIONS.map((option) => option.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('avatarSrc returns the image path for a known id', () => {
    expect(avatarSrc('avatar01')).toBe('/dice/avatars/avatar01.png');
  });

  it('avatarSrc falls back to the first option for an unknown id', () => {
    expect(avatarSrc('does-not-exist')).toBe(AVATAR_OPTIONS[0].src);
  });
});
