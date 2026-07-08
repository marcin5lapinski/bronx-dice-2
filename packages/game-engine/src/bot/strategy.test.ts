import { describe, it, expect } from 'vitest';
import {
  UPPER_CATEGORIES,
  LOWER_CATEGORIES,
  type DiceValue,
  type PlayerScoreCard,
} from '../types/game';
import { chooseBotRollDecision, chooseBotScoreDecision } from './strategy';

function emptyLowerFilledUpper(upperValue: number): PlayerScoreCard {
  return {
    upper: Object.fromEntries(
      UPPER_CATEGORIES.map((category) => [category, upperValue])
    ) as PlayerScoreCard['upper'],
    lower: Object.fromEntries(
      LOWER_CATEGORIES.map((category) => [category, null])
    ) as PlayerScoreCard['lower'],
  };
}

describe('chooseBotRollDecision', () => {
  it('holds four matching dice and rerolls the fifth when that beats stopping now', () => {
    const scoreCard = emptyLowerFilledUpper(0);
    const dice: DiceValue[] = [6, 6, 6, 6, 1];

    const decision = chooseBotRollDecision(scoreCard, dice, 1);

    expect(decision).toEqual({
      action: 'reroll',
      hold: [true, true, true, true, false],
    });
  });

  it('favors scoring now over rerolling when doubling (rollsLeft === 2) makes it pay off', () => {
    const scoreCard = emptyLowerFilledUpper(0);
    const dice: DiceValue[] = [5, 5, 5, 5, 5];

    const decision = chooseBotRollDecision(scoreCard, dice, 2);

    expect(decision).toEqual({ action: 'score', category: 'yahtzee' });
  });
});

describe('chooseBotScoreDecision', () => {
  it('returns the legal category with the highest turn value when forced to score', () => {
    const scoreCard = emptyLowerFilledUpper(0);
    const dice: DiceValue[] = [3, 3, 3, 3, 3];

    expect(chooseBotScoreDecision(scoreCard, dice, 0)).toBe('yahtzee');
  });

  it('reflects the upper-section +50 bonus when picking between two open upper categories', () => {
    const scoreCard: PlayerScoreCard = {
      upper: { aces: 5, twos: 10, threes: 15, fours: 20, fives: null, sixes: null },
      lower: Object.fromEntries(
        LOWER_CATEGORIES.map((category) => [category, null])
      ) as PlayerScoreCard['lower'],
    };
    // Filled upper sum is 50. 'sixes' (raw 18) pushes the sum to 68, crossing
    // the 63 bonus threshold; 'fives' (raw 5) does not (55 < 63).
    const dice: DiceValue[] = [6, 6, 6, 5, 2];

    expect(chooseBotScoreDecision(scoreCard, dice, 0)).toBe('sixes');
  });

  it('throws when no legal category is available', () => {
    const fullCard: PlayerScoreCard = {
      upper: Object.fromEntries(
        UPPER_CATEGORIES.map((category) => [category, 0])
      ) as PlayerScoreCard['upper'],
      lower: Object.fromEntries(
        LOWER_CATEGORIES.map((category) => [category, 0])
      ) as PlayerScoreCard['lower'],
    };

    expect(() => chooseBotScoreDecision(fullCard, [1, 2, 3, 4, 5], 0)).toThrow();
  });
});
