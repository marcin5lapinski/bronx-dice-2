import { describe, it, expect } from 'vitest';
import {
  createEmptyScoreCard,
  isUpperCategory,
  isUpperSectionFilled,
  canScoreCategory,
  calculateTotal,
  scoreCategory,
  findNextScorableCategory,
  DOUBLE_SCORE_ROLLS_LEFT,
  YAHTZEE_BONUS,
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

describe('scoreCategory', () => {
  function filledUpperCard() {
    const card = createEmptyScoreCard();
    card.upper = {
      aces: 1,
      twos: 2,
      threes: 3,
      fours: 4,
      fives: 5,
      sixes: 6,
    };
    return card;
  }

  it('scores an upper category using the dice face value sum', () => {
    const card = createEmptyScoreCard();
    const result = scoreCategory(card, 'threes', [3, 3, 1, 2, 5], 3);
    expect(result.upper.threes).toBe(6);
  });

  it('does not double an upper category even when rollsLeft is DOUBLE_SCORE_ROLLS_LEFT', () => {
    const card = createEmptyScoreCard();
    const result = scoreCategory(
      card,
      'threes',
      [3, 3, 1, 2, 5],
      DOUBLE_SCORE_ROLLS_LEFT
    );
    expect(result.upper.threes).toBe(6); // not 12 — doubling never applies to upper categories
  });

  it('does not mutate the input score card', () => {
    const card = createEmptyScoreCard();
    scoreCategory(card, 'threes', [3, 3, 1, 2, 5], 3);
    expect(card.upper.threes).toBeNull();
  });

  it('throws when the category cannot be scored', () => {
    const card = createEmptyScoreCard();
    card.upper.aces = 1;
    expect(() => scoreCategory(card, 'aces', [1, 1, 1, 1, 1], 3)).toThrow();
  });

  it('throws when scoring a lower category before the upper section is filled', () => {
    const card = createEmptyScoreCard();
    expect(() =>
      scoreCategory(card, 'chance', [1, 2, 3, 4, 5], 3)
    ).toThrow();
  });

  it(`doubles a lower category score when rollsLeft is ${DOUBLE_SCORE_ROLLS_LEFT}`, () => {
    const card = filledUpperCard();
    const result = scoreCategory(
      card,
      'chance',
      [1, 2, 3, 4, 5],
      DOUBLE_SCORE_ROLLS_LEFT
    );
    expect(result.lower.chance).toBe(30); // (1+2+3+4+5) * 2
  });

  it('does not double a lower category score when rollsLeft is not 2', () => {
    const card = filledUpperCard();
    const result = scoreCategory(card, 'chance', [1, 2, 3, 4, 5], 1);
    expect(result.lower.chance).toBe(15);
  });

  it(`applies the yahtzee +${YAHTZEE_BONUS} bonus without doubling it`, () => {
    const card = filledUpperCard();
    const result = scoreCategory(
      card,
      'yahtzee',
      [4, 4, 4, 4, 4],
      DOUBLE_SCORE_ROLLS_LEFT
    );
    expect(result.lower.yahtzee).toBe(4 * 5 * 2 + YAHTZEE_BONUS); // 40 + 50 = 90
  });

  it('scores yahtzee as 0 with no bonus when the dice do not match', () => {
    const card = filledUpperCard();
    const result = scoreCategory(
      card,
      'yahtzee',
      [4, 4, 4, 4, 5],
      DOUBLE_SCORE_ROLLS_LEFT
    );
    expect(result.lower.yahtzee).toBe(0);
  });
});

describe('findNextScorableCategory', () => {
  it('returns the first unfilled upper category when the upper section is incomplete', () => {
    const card = createEmptyScoreCard();
    card.upper.aces = 1;
    card.upper.twos = 2;
    expect(findNextScorableCategory(card)).toBe('threes');
  });

  it('returns the first unfilled lower category once the upper section is filled', () => {
    const card = createEmptyScoreCard();
    card.upper = { aces: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6 };
    card.lower.pair = 4;
    expect(findNextScorableCategory(card)).toBe('twoPair');
  });

  it('throws when the score card is already complete', () => {
    const card = createEmptyScoreCard();
    card.upper = { aces: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6 };
    card.lower = {
      pair: 4,
      twoPair: 4,
      threeOfKind: 8,
      fourOfKind: 16,
      smallStraight: 15,
      largeStraight: 20,
      fullHouse: 25,
      chance: 10,
      yahtzee: 50,
    };
    expect(() => findNextScorableCategory(card)).toThrow();
  });
});
