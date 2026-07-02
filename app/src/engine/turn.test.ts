import { describe, it, expect } from 'vitest';
import {
  rollInTurn,
  toggleHeldDie,
  applyScore,
  isScoreCardComplete,
  isGameOver,
  getWinners,
} from './turn';
import { createGameState } from './gameState';
import { createEmptyScoreCard } from './scoreCard';
import { UPPER_CATEGORIES, LOWER_CATEGORIES } from '../types/game';
import type { DiceValue, PlayerScoreCard } from '../types/game';

describe('rollInTurn', () => {
  it('throws when there are no rolls left', () => {
    const state = createGameState(['Ola', 'Kuba']);
    const noRolls = { ...state, rollsLeft: 0 };
    expect(() => rollInTurn(noRolls)).toThrow();
  });

  it('rolls the dice via the injected random function and decrements rollsLeft', () => {
    const state = createGameState(['Ola', 'Kuba']);
    const sequence = [0, 0.2, 0.4, 0.6, 0.8]; // -> 1,2,3,4,5
    let call = 0;
    const random = () => sequence[call++];

    const result = rollInTurn(state, random);

    expect(result.dice).toEqual([1, 2, 3, 4, 5]);
    expect(result.rollsLeft).toBe(2);
  });
});

describe('toggleHeldDie', () => {
  it('flips only the targeted die, leaving the others unchanged', () => {
    const state = createGameState(['Ola', 'Kuba']);
    const withDice = { ...state, dice: [1, 2, 3, 4, 5] as DiceValue[] };

    const result = toggleHeldDie(withDice, 2);
    expect(result.heldDice).toEqual([false, false, true, false, false]);

    const backAgain = toggleHeldDie(result, 2);
    expect(backAgain.heldDice).toEqual([false, false, false, false, false]);
  });
});

describe('applyScore', () => {
  it("scores the current player's category and advances to the next player", () => {
    const state = createGameState(['Ola', 'Kuba']);
    const withDice = {
      ...state,
      dice: [1, 1, 1, 3, 5] as DiceValue[],
      rollsLeft: 1,
    };

    const result = applyScore(withDice, 'aces');

    const olaId = state.players[0].id;
    expect(result.scoreCards[olaId].upper.aces).toBe(3);
    expect(result.currentPlayerIndex).toBe(1);
    expect(result.dice).toEqual([]);
    expect(result.heldDice).toEqual([false, false, false, false, false]);
    expect(result.rollsLeft).toBe(3);
  });
});

function completeScoreCard(): PlayerScoreCard {
  const card = createEmptyScoreCard();
  for (const category of UPPER_CATEGORIES) {
    card.upper[category] = 3;
  }
  for (const category of LOWER_CATEGORIES) {
    card.lower[category] = 10;
  }
  return card;
}

describe('isScoreCardComplete', () => {
  it('returns false for a fresh score card', () => {
    expect(isScoreCardComplete(createEmptyScoreCard())).toBe(false);
  });

  it('returns true once every category is filled', () => {
    expect(isScoreCardComplete(completeScoreCard())).toBe(true);
  });
});

describe('isGameOver', () => {
  it('returns false while any player still has empty categories', () => {
    const state = createGameState(['Ola', 'Kuba']);
    expect(isGameOver(state)).toBe(false);
  });

  it('returns true once every player has a complete score card', () => {
    const state = createGameState(['Ola', 'Kuba']);
    const finished = {
      ...state,
      scoreCards: {
        [state.players[0].id]: completeScoreCard(),
        [state.players[1].id]: completeScoreCard(),
      },
    };
    expect(isGameOver(finished)).toBe(true);
  });
});

describe('getWinners', () => {
  it('returns the single player with the highest total', () => {
    const state = createGameState(['Ola', 'Kuba']);
    const olaCard = completeScoreCard();
    olaCard.lower.chance = 50;
    const finished = {
      ...state,
      scoreCards: {
        [state.players[0].id]: olaCard,
        [state.players[1].id]: completeScoreCard(),
      },
    };
    expect(getWinners(finished)).toEqual([state.players[0]]);
  });

  it('returns every player tied for the highest total', () => {
    const state = createGameState(['Ola', 'Kuba']);
    const finished = {
      ...state,
      scoreCards: {
        [state.players[0].id]: completeScoreCard(),
        [state.players[1].id]: completeScoreCard(),
      },
    };
    expect(getWinners(finished)).toEqual(state.players);
  });
});
