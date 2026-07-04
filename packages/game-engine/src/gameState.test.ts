import { describe, it, expect } from 'vitest';
import type { GameState } from './types/game';
import {
  createPlayer,
  createGameState,
  createGameStateFromPlayers,
  nextTurn,
  MIN_PLAYERS,
  MAX_PLAYERS,
} from './gameState';
import { MAX_ROLLS } from './dice';

describe('createPlayer', () => {
  it('creates a player with the given id and name', () => {
    expect(createPlayer('player-1', 'Ola')).toEqual({
      id: 'player-1',
      name: 'Ola',
    });
  });
});

describe('createGameState', () => {
  it('creates a player array (not separate variables) from the given names', () => {
    const state = createGameState(['Ola', 'Kuba', 'Zosia']);
    expect(state.players).toEqual([
      { id: 'player-1', name: 'Ola' },
      { id: 'player-2', name: 'Kuba' },
      { id: 'player-3', name: 'Zosia' },
    ]);
  });

  it('creates an empty score card for every player', () => {
    const state = createGameState(['Ola', 'Kuba']);
    expect(Object.keys(state.scoreCards)).toEqual(['player-1', 'player-2']);
    expect(state.scoreCards['player-1'].upper.aces).toBeNull();
  });

  it('starts with no dice rolled, nothing held, full rolls, and player 0 first', () => {
    const state = createGameState(['Ola', 'Kuba']);
    expect(state.dice).toEqual([]);
    expect(state.heldDice).toEqual([false, false, false, false, false]);
    expect(state.rollsLeft).toBe(MAX_ROLLS);
    expect(state.currentPlayerIndex).toBe(0);
  });

  it(`throws with fewer than ${MIN_PLAYERS} players`, () => {
    expect(() => createGameState(['Ola'])).toThrow();
  });

  it(`throws with more than ${MAX_PLAYERS} players`, () => {
    expect(() =>
      createGameState(['A', 'B', 'C', 'D', 'E', 'F', 'G'])
    ).toThrow();
  });

  it(`allows exactly ${MAX_PLAYERS} players`, () => {
    const state = createGameState(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(state.players).toHaveLength(6);
  });
});

describe('nextTurn', () => {
  it('advances to the next player', () => {
    const state = createGameState(['Ola', 'Kuba', 'Zosia']);
    const next = nextTurn(state);
    expect(next.currentPlayerIndex).toBe(1);
  });

  it('wraps around from the last player back to the first', () => {
    let state = createGameState(['Ola', 'Kuba']);
    state = nextTurn(state); // player 1
    state = nextTurn(state); // wraps to player 0
    expect(state.currentPlayerIndex).toBe(0);
  });

  it('resets dice, held dice, and rolls left', () => {
    const state = createGameState(['Ola', 'Kuba']);
    const midTurn = {
      ...state,
      dice: [1, 2, 3, 4, 5] as GameState['dice'],
      heldDice: [true, true, false, false, false],
      rollsLeft: 1,
    };
    const next = nextTurn(midTurn);
    expect(next.dice).toEqual([]);
    expect(next.heldDice).toEqual([false, false, false, false, false]);
    expect(next.rollsLeft).toBe(MAX_ROLLS);
  });
});

describe('createGameStateFromPlayers', () => {
  it('builds a GameState from the given players unchanged (e.g. real Firebase uids as ids)', () => {
    const players = [
      { id: 'uid-1', name: 'Ola' },
      { id: 'uid-2', name: 'Kuba' },
    ];
    const state = createGameStateFromPlayers(players);
    expect(state.players).toBe(players);
    expect(Object.keys(state.scoreCards)).toEqual(['uid-1', 'uid-2']);
    expect(state.scoreCards['uid-1'].upper.aces).toBeNull();
  });

  it('starts with no dice rolled, nothing held, full rolls, and player 0 first', () => {
    const state = createGameStateFromPlayers([
      { id: 'uid-1', name: 'Ola' },
      { id: 'uid-2', name: 'Kuba' },
    ]);
    expect(state.dice).toEqual([]);
    expect(state.heldDice).toEqual([false, false, false, false, false]);
    expect(state.rollsLeft).toBe(MAX_ROLLS);
    expect(state.currentPlayerIndex).toBe(0);
  });

  it(`throws with fewer than ${MIN_PLAYERS} players`, () => {
    expect(() => createGameStateFromPlayers([{ id: 'uid-1', name: 'Ola' }])).toThrow();
  });

  it(`throws with more than ${MAX_PLAYERS} players`, () => {
    const players = Array.from({ length: 7 }, (_, i) => ({
      id: `uid-${i}`,
      name: `P${i}`,
    }));
    expect(() => createGameStateFromPlayers(players)).toThrow();
  });
});

describe('createGameState (built on createGameStateFromPlayers)', () => {
  it('still generates sequential player-N ids from names', () => {
    const state = createGameState(['Ola', 'Kuba']);
    expect(state.players).toEqual([
      { id: 'player-1', name: 'Ola' },
      { id: 'player-2', name: 'Kuba' },
    ]);
  });
});
