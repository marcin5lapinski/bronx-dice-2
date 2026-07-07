import { describe, it, expect } from 'vitest';
import { createEmptyScoreCard, type DiceValue } from '@bronx-dice/game-engine';
import { chooseHeuristicCategory } from './heuristic';

describe('chooseHeuristicCategory', () => {
  it('picks the open category with the highest preview score', () => {
    const card = createEmptyScoreCard();
    // Only upper categories are open on a fresh card (lower section is
    // locked until the upper section is filled). Counts: three 1s, one 4,
    // one 5 -> aces=3, fours=4, fives=5 is the best.
    const dice: DiceValue[] = [1, 1, 1, 4, 5];
    expect(chooseHeuristicCategory(card, dice, 2)).toBe('fives');
  });

  it('never returns an already-filled category', () => {
    const card = createEmptyScoreCard();
    const filled = { ...card, upper: { ...card.upper, fives: 10 } };
    const dice: DiceValue[] = [5, 5, 1, 4, 3];
    expect(chooseHeuristicCategory(filled, dice, 2)).not.toBe('fives');
  });

  it('only considers lower-section categories once the upper section is full', () => {
    const upperFilled = {
      upper: {
        aces: 1,
        twos: 2,
        threes: 3,
        fours: 4,
        fives: 5,
        sixes: 6,
      },
      lower: createEmptyScoreCard().lower,
    };
    const dice: DiceValue[] = [6, 6, 6, 6, 6];
    // Everything upper is filled, so the best legal option is yahtzee.
    expect(chooseHeuristicCategory(upperFilled, dice, 1)).toBe('yahtzee');
  });
});
