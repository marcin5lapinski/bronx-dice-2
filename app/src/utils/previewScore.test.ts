import { describe, it, expect } from 'vitest';
import { createEmptyScoreCard, type DiceValue } from '@bronx-dice/game-engine';
import { previewScore, scoreValue } from './previewScore';

describe('scoreValue', () => {
  it('reads the upper section value for an upper category', () => {
    const card = createEmptyScoreCard();
    const filled = { ...card, upper: { ...card.upper, aces: 3 } };
    expect(scoreValue(filled, 'aces')).toBe(3);
  });

  it('reads the lower section value for a lower category', () => {
    const card = createEmptyScoreCard();
    const filled = { ...card, lower: { ...card.lower, chance: 20 } };
    expect(scoreValue(filled, 'chance')).toBe(20);
  });

  it('returns null for an unfilled category', () => {
    const card = createEmptyScoreCard();
    expect(scoreValue(card, 'aces')).toBeNull();
  });
});

describe('previewScore', () => {
  it('computes the score for an upper category from the current dice', () => {
    const card = createEmptyScoreCard();
    const dice: DiceValue[] = [1, 1, 3, 4, 5];
    expect(previewScore(card, 'aces', dice, 2)).toBe(2);
  });

  it('does not mutate the passed-in score card', () => {
    const card = createEmptyScoreCard();
    const dice: DiceValue[] = [1, 1, 3, 4, 5];
    previewScore(card, 'aces', dice, 2);
    expect(card.upper.aces).toBeNull();
  });

  it('doubles a lower-section category scored with rollsLeft 2, but not otherwise', () => {
    const emptyCard = createEmptyScoreCard();
    // Fill upper section to unlock lower section
    const card = {
      ...emptyCard,
      upper: {
        aces: 1,
        twos: 2,
        threes: 3,
        fours: 4,
        fives: 5,
        sixes: 6,
      },
    };
    const dice: DiceValue[] = [2, 2, 2, 4, 5];
    expect(previewScore(card, 'chance', dice, 2)).toBe(30);
    expect(previewScore(card, 'chance', dice, 1)).toBe(15);
  });
});
