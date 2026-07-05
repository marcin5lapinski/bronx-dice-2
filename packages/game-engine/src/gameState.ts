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

export function removePlayers(state: GameState, playerIds: string[]): GameState {
  const removeSet = new Set(playerIds);
  if (removeSet.size === 0) {
    return state;
  }

  const currentPlayerId = state.players[state.currentPlayerIndex]?.id;
  const players = state.players.filter((player) => !removeSet.has(player.id));
  const scoreCards = Object.fromEntries(
    Object.entries(state.scoreCards).filter(([id]) => !removeSet.has(id))
  );

  if (players.length === 0) {
    return { ...state, players, scoreCards, currentPlayerIndex: 0 };
  }

  if (currentPlayerId !== undefined && !removeSet.has(currentPlayerId)) {
    return {
      ...state,
      players,
      scoreCards,
      currentPlayerIndex: players.findIndex((player) => player.id === currentPlayerId),
    };
  }

  // The current player was removed: advance to the next surviving player in
  // the original turn order and reset the turn, same as nextTurn would.
  const originalPlayers = state.players;
  for (let step = 1; step <= originalPlayers.length; step++) {
    const candidate = originalPlayers[(state.currentPlayerIndex + step) % originalPlayers.length];
    if (!removeSet.has(candidate.id)) {
      return {
        ...state,
        players,
        scoreCards,
        currentPlayerIndex: players.findIndex((player) => player.id === candidate.id),
        dice: createEmptyDice(),
        heldDice: [false, false, false, false, false],
        rollsLeft: MAX_ROLLS,
      };
    }
  }

  return { ...state, players, scoreCards, currentPlayerIndex: 0 };
}
