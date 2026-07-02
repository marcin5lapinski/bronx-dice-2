import type { GameState, Player } from '../types/game';
import { createEmptyScoreCard } from './scoreCard';
import { createEmptyDice, MAX_ROLLS } from './dice';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

export function createPlayer(id: string, name: string): Player {
  return { id, name };
}

export function createGameState(playerNames: string[]): GameState {
  if (playerNames.length < MIN_PLAYERS || playerNames.length > MAX_PLAYERS) {
    throw new Error(
      `Player count must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}, got ${playerNames.length}`
    );
  }

  const players = playerNames.map((name, index) =>
    createPlayer(`player-${index + 1}`, name)
  );

  const scoreCards: GameState['scoreCards'] = {};
  for (const player of players) {
    scoreCards[player.id] = createEmptyScoreCard();
  }

  return {
    players,
    scoreCards,
    dice: createEmptyDice(),
    heldDice: [false, false, false, false, false],
    rollsLeft: MAX_ROLLS,
    currentPlayerIndex: 0,
  };
}

export function nextTurn(state: GameState): GameState {
  const nextIndex = (state.currentPlayerIndex + 1) % state.players.length;
  return {
    ...state,
    currentPlayerIndex: nextIndex,
    dice: createEmptyDice(),
    heldDice: [false, false, false, false, false],
    rollsLeft: MAX_ROLLS,
  };
}
