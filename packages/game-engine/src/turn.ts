import type { GameState, ScoreCategory, Player, PlayerScoreCard } from './types/game';
import { UPPER_CATEGORIES, LOWER_CATEGORIES } from './types/game';
import { rollDice } from './dice';
import { scoreCategory, calculateTotal } from './scoreCard';
import { nextTurn } from './gameState';

export function rollInTurn(
  state: GameState,
  random: () => number = Math.random
): GameState {
  if (state.rollsLeft <= 0) {
    throw new Error('No rolls left this turn');
  }
  return {
    ...state,
    dice: rollDice(state.dice, state.heldDice, random),
    rollsLeft: state.rollsLeft - 1,
  };
}

export function toggleHeldDie(state: GameState, index: number): GameState {
  return {
    ...state,
    heldDice: state.heldDice.map((held, i) => (i === index ? !held : held)),
  };
}

export function applyScore(
  state: GameState,
  category: ScoreCategory
): GameState {
  const currentPlayer = state.players[state.currentPlayerIndex];
  const updatedScoreCard = scoreCategory(
    state.scoreCards[currentPlayer.id],
    category,
    state.dice,
    state.rollsLeft
  );
  return nextTurn({
    ...state,
    scoreCards: { ...state.scoreCards, [currentPlayer.id]: updatedScoreCard },
  });
}

export function isScoreCardComplete(scoreCard: PlayerScoreCard): boolean {
  const upperFilled = UPPER_CATEGORIES.every(
    (category) => scoreCard.upper[category] !== null
  );
  const lowerFilled = LOWER_CATEGORIES.every(
    (category) => scoreCard.lower[category] !== null
  );
  return upperFilled && lowerFilled;
}

export function isGameOver(state: GameState): boolean {
  return state.players.every((player) =>
    isScoreCardComplete(state.scoreCards[player.id])
  );
}

export function getWinners(state: GameState): Player[] {
  const totals = state.players.map((player) => ({
    player,
    total: calculateTotal(state.scoreCards[player.id]),
  }));
  const maxTotal = Math.max(...totals.map((entry) => entry.total));
  return totals
    .filter((entry) => entry.total === maxTotal)
    .map((entry) => entry.player);
}
