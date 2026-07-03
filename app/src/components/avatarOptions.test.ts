import { describe, it, expect } from 'vitest';
import { AVATAR_OPTIONS, avatarEmoji } from './avatarOptions';

describe('avatarOptions', () => {
  it('has at least 12 distinct avatar options with unique ids', () => {
    expect(AVATAR_OPTIONS.length).toBeGreaterThanOrEqual(12);
    const ids = AVATAR_OPTIONS.map((option) => option.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('avatarEmoji returns the emoji for a known id', () => {
    expect(avatarEmoji('fox')).toBe('🦊');
  });

  it('avatarEmoji falls back to a placeholder for an unknown id', () => {
    expect(avatarEmoji('does-not-exist')).toBe('❓');
  });
});
