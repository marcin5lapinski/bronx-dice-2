import { describe, it, expect } from 'vitest';
import {
  createEmptyScoreCard,
  isUpperCategory,
  isUpperSectionFilled,
  canScoreCategory,
  calculateTotal,
} from './scoreCard';

describe('createEmptyScoreCard', () => {
  it('creates a score card with every category set to null', () => {
    const card = createEmptyScoreCard();
    expect(card.upper.aces).toBeNull();
    expect(card.upper.sixes).toBeNull();
    expect(card.lower.pair).toBeNull();
    expect(card.lower.yahtzee).toBeNull();
  });
});

describe('isUpperCategory', () => {
  it('returns true for upper categories', () => {
    expect(isUpperCategory('aces')).toBe(true);
  });

  it('returns false for lower categories', () => {
    expect(isUpperCategory('pair')).toBe(false);
  });
});

describe('isUpperSectionFilled', () => {
  it('returns false when any upper category is still null', () => {
    const card = createEmptyScoreCard();
    card.upper.aces = 3;
    expect(isUpperSectionFilled(card)).toBe(false);
  });

  it('returns true when all 6 upper categories are filled', () => {
    const card = createEmptyScoreCard();
    card.upper = {
      aces: 1,
      twos: 2,
      threes: 3,
      fours: 4,
      fives: 5,
      sixes: 6,
    };
    expect(isUpperSectionFilled(card)).toBe(true);
  });
});

describe('canScoreCategory', () => {
  it('allows an unfilled upper category at any time', () => {
    const card = createEmptyScoreCard();
    expect(canScoreCategory(card, 'aces')).toBe(true);
  });

  it('disallows an already-filled upper category', () => {
    const card = createEmptyScoreCard();
    card.upper.aces = 3;
    expect(canScoreCategory(card, 'aces')).toBe(false);
  });

  it('disallows a lower category before the upper section is filled', () => {
    const card = createEmptyScoreCard();
    expect(canScoreCategory(card, 'pair')).toBe(false);
  });

  it('allows an unfilled lower category once the upper section is filled', () => {
    const card = createEmptyScoreCard();
    card.upper = {
      aces: 1,
      twos: 2,
      threes: 3,
      fours: 4,
      fives: 5,
      sixes: 6,
    };
    expect(canScoreCategory(card, 'pair')).toBe(true);
  });

  it('disallows an already-filled lower category', () => {
    const card = createEmptyScoreCard();
    card.upper = {
      aces: 1,
      twos: 2,
      threes: 3,
      fours: 4,
      fives: 5,
      sixes: 6,
    };
    card.lower.pair = 8;
    expect(canScoreCategory(card, 'pair')).toBe(false);
  });
});

describe('calculateTotal', () => {
  it('sums upper (with bonus) and lower sections, treating null as 0', () => {
    const card = createEmptyScoreCard();
    card.upper = {
      aces: 3,
      twos: 6,
      threes: 9,
      fours: 12,
      fives: 15,
      sixes: 18,
    }; // sum = 63 -> bonus 50
    card.lower.chance = 20;
    expect(calculateTotal(card)).toBe(63 + 50 + 20);
  });

  it('returns 0 for a fully empty score card', () => {
    expect(calculateTotal(createEmptyScoreCard())).toBe(0);
  });
});
