import { describe, it, expect } from 'vitest';
import {
  countsByValue,
  pairScore,
  twoPairScore,
  threeOfKindScore,
  fourOfKindScore,
  fullHouseScore,
  smallStraightScore,
  largeStraightScore,
  yahtzeeScore,
  chanceScore,
} from './combinations';
import type { DiceValue } from '../../types/game';

describe('countsByValue', () => {
  it('counts occurrences of each face value', () => {
    const dice: DiceValue[] = [2, 2, 3, 5, 5];
    expect(countsByValue(dice)).toEqual({
      1: 0,
      2: 2,
      3: 1,
      4: 0,
      5: 2,
      6: 0,
    });
  });
});

describe('pairScore', () => {
  it('scores the pair when exactly one pair exists', () => {
    expect(pairScore([2, 2, 1, 3, 6])).toBe(4); // 2+2
  });

  it('returns 0 when there is no pair', () => {
    expect(pairScore([1, 2, 3, 4, 5])).toBe(0);
  });

  it('returns 0 for three of a kind (not a pair)', () => {
    expect(pairScore([2, 2, 2, 1, 3])).toBe(0);
  });

  it('returns 0 for two pair (ambiguous, scored under Two Pair instead)', () => {
    expect(pairScore([2, 2, 3, 3, 4])).toBe(0);
  });

  it('returns 0 for a full house (the pair inside it does not count)', () => {
    expect(pairScore([2, 2, 2, 5, 5])).toBe(0);
  });
});

describe('twoPairScore', () => {
  it('sums both pairs when two distinct pairs exist', () => {
    expect(twoPairScore([2, 2, 3, 3, 4])).toBe(10); // 2+2+3+3
  });

  it('returns 0 for four of a kind (not two distinct pairs)', () => {
    expect(twoPairScore([3, 3, 3, 3, 5])).toBe(0);
  });

  it('returns 0 when there is only one pair', () => {
    expect(twoPairScore([2, 2, 1, 3, 6])).toBe(0);
  });

  it('returns 0 for a full house (three-of-a-kind hand also containing a pair)', () => {
    expect(twoPairScore([2, 2, 2, 3, 3])).toBe(0);
  });
});

describe('threeOfKindScore', () => {
  it('scores three matching dice', () => {
    expect(threeOfKindScore([3, 3, 3, 5, 4])).toBe(9);
  });

  it('returns 0 when nothing has three of a kind', () => {
    expect(threeOfKindScore([2, 2, 3, 3, 4])).toBe(0);
  });

  it('returns 0 for a full house (three + two, not plain three of a kind)', () => {
    expect(threeOfKindScore([3, 3, 3, 5, 5])).toBe(0);
  });

  it('returns 0 for four of a kind', () => {
    expect(threeOfKindScore([3, 3, 3, 3, 5])).toBe(0);
  });
});

describe('fourOfKindScore', () => {
  it('scores four matching dice', () => {
    expect(fourOfKindScore([4, 4, 4, 4, 2])).toBe(16);
  });

  it('returns 0 for a full house (three + two, not four)', () => {
    expect(fourOfKindScore([2, 2, 2, 5, 5])).toBe(0);
  });

  it('returns 0 for five matching dice (that is Yahtzee, not four of a kind)', () => {
    expect(fourOfKindScore([6, 6, 6, 6, 6])).toBe(0);
  });
});

describe('fullHouseScore', () => {
  it('sums all dice for a true full house (3 + 2)', () => {
    expect(fullHouseScore([2, 2, 2, 5, 5])).toBe(16);
  });

  it('returns 0 for four of a kind', () => {
    expect(fullHouseScore([4, 4, 4, 4, 5])).toBe(0);
  });

  it('returns 0 for five of a kind', () => {
    expect(fullHouseScore([6, 6, 6, 6, 6])).toBe(0);
  });

  it('returns 0 when there is no pairing at all', () => {
    expect(fullHouseScore([1, 2, 3, 4, 5])).toBe(0);
  });
});

describe('smallStraightScore', () => {
  it('scores 15 for 1-2-3-4-5 in any order', () => {
    expect(smallStraightScore([3, 1, 4, 5, 2])).toBe(15);
  });

  it('returns 0 when the straight is broken', () => {
    expect(smallStraightScore([1, 2, 2, 4, 5])).toBe(0);
  });
});

describe('largeStraightScore', () => {
  it('scores 20 for 2-3-4-5-6 in any order', () => {
    expect(largeStraightScore([6, 4, 2, 5, 3])).toBe(20);
  });

  it('returns 0 when the straight is broken', () => {
    expect(largeStraightScore([1, 2, 3, 4, 5])).toBe(0);
  });
});

describe('yahtzeeScore', () => {
  it('returns the sum of the dice when all five match', () => {
    expect(yahtzeeScore([5, 5, 5, 5, 5])).toBe(25);
  });

  it('returns 0 when not all dice match (bonus is applied elsewhere, not here)', () => {
    expect(yahtzeeScore([5, 5, 5, 5, 4])).toBe(0);
  });
});

describe('chanceScore', () => {
  it('sums all five dice regardless of combination', () => {
    expect(chanceScore([1, 2, 3, 4, 5])).toBe(15);
  });
});
