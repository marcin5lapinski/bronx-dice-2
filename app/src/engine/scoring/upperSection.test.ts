import { describe, it, expect } from 'vitest';
import {
  upperCategoryScore,
  calculateUpperSum,
  calculateBonus,
  UPPER_BONUS_THRESHOLD,
  UPPER_BONUS_VALUE,
} from './upperSection';
import type { DiceValue, PlayerScoreCard } from '../../types/game';

describe('upperCategoryScore', () => {
  it('sums only the dice matching the category face value', () => {
    const dice: DiceValue[] = [3, 3, 1, 5, 3];
    expect(upperCategoryScore('threes', dice)).toBe(9);
  });

  it('returns 0 when no dice match', () => {
    const dice: DiceValue[] = [1, 2, 3, 4, 5];
    expect(upperCategoryScore('sixes', dice)).toBe(0);
  });

  it('handles aces (value 1)', () => {
    const dice: DiceValue[] = [1, 1, 1, 2, 3];
    expect(upperCategoryScore('aces', dice)).toBe(3);
  });
});

function emptyScoreCard(): PlayerScoreCard {
  return {
    upper: {
      aces: null,
      twos: null,
      threes: null,
      fours: null,
      fives: null,
      sixes: null,
    },
    lower: {
      pair: null,
      twoPair: null,
      threeOfKind: null,
      fourOfKind: null,
      smallStraight: null,
      largeStraight: null,
      fullHouse: null,
      chance: null,
      yahtzee: null,
    },
  };
}

describe('calculateUpperSum', () => {
  it('treats unfilled (null) categories as 0', () => {
    const card = emptyScoreCard();
    card.upper.aces = 3;
    card.upper.twos = 4;
    expect(calculateUpperSum(card)).toBe(7);
  });

  it('returns 0 for a fully empty upper section', () => {
    expect(calculateUpperSum(emptyScoreCard())).toBe(0);
  });
});

describe('calculateBonus', () => {
  it(`returns ${UPPER_BONUS_VALUE} when the upper sum is exactly the threshold`, () => {
    const card = emptyScoreCard();
    card.upper.sixes = UPPER_BONUS_THRESHOLD;
    expect(calculateBonus(card)).toBe(UPPER_BONUS_VALUE);
  });

  it('returns 0 when the upper sum is one below the threshold', () => {
    const card = emptyScoreCard();
    card.upper.sixes = UPPER_BONUS_THRESHOLD - 1;
    expect(calculateBonus(card)).toBe(0);
  });
});
