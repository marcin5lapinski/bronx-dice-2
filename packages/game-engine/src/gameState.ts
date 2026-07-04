import type { GameState, Player } from './types/game';
import { createEmptyScoreCard } from './scoreCard';
import { createEmptyDice, MAX_ROLLS } from './dice';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

export function createPlayer(id: string, name: string): Player {
  return { id, name };
}

export function createGameStateFromPlayers(players: Player[]): GameState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(
      `Player count must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}, got ${players.length}`
    );
  }

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

export function createGameState(playerNames: string[]): GameState {
  const players = playerNames.map((name, index) =>
    createPlayer(`player-${index + 1}`, name)
  );
  return createGameStateFromPlayers(players);
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
