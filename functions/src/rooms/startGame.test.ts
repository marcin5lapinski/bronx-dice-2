import { describe, it, expect, vi } from 'vitest';
import type { Transaction, DocumentReference, Timestamp } from 'firebase-admin/firestore';
import { startGameHandler } from './startGame';
import type { RoomDocument } from './types';

function fakeTransaction(room: RoomDocument | null) {
  const update = vi.fn();
  const tx = {
    get: async () => ({ exists: room !== null, data: () => room }),
    update,
  };
  return { tx: tx as unknown as Transaction, update };
}

const roomRef = {} as DocumentReference;
const fixedNow = () => ({}) as unknown as Timestamp;

const lobbyRoom: RoomDocument = {
  phase: 'lobby',
  hostId: 'uid-1',
  maxPlayers: 3,
  turnTimeLimitSeconds: 30,
  players: [
    { id: 'uid-1', name: 'Ola', avatarId: 'fox', ready: true },
    { id: 'uid-2', name: 'Kuba', avatarId: 'wolf', ready: true },
  ],
  createdAt: {} as Timestamp,
  updatedAt: {} as Timestamp,
};

describe('startGameHandler', () => {
  it('starts the game and writes an initial GameState computed from the players', async () => {
    const { tx, update } = fakeTransaction(lobbyRoom);
    await startGameHandler(tx, roomRef, 'uid-1', undefined, fixedNow);
    expect(update).toHaveBeenCalledTimes(1);
    const [, patch] = update.mock.calls[0];
    expect(patch.phase).toBe('playing');
    expect(patch.players).toEqual(lobbyRoom.players);
    expect(patch.currentPlayerIndex).toBe(0);
    expect(patch.dice).toEqual([]);
    expect(Object.keys(patch.scoreCards)).toEqual(['uid-1', 'uid-2']);
    expect(patch.turnStartedAt).toEqual({});
  });

  it('reorders the players according to playerOrder before creating the game state', async () => {
    const { tx, update } = fakeTransaction(lobbyRoom);
    await startGameHandler(tx, roomRef, 'uid-1', ['uid-2', 'uid-1'], fixedNow);
    const [, patch] = update.mock.calls[0];
    expect(patch.players).toEqual([
      { id: 'uid-2', name: 'Kuba', avatarId: 'wolf', ready: true },
      { id: 'uid-1', name: 'Ola', avatarId: 'fox', ready: true },
    ]);
    expect(patch.currentPlayerIndex).toBe(0);
  });

  it('rejects a playerOrder that is not a permutation of the current players', async () => {
    const { tx } = fakeTransaction(lobbyRoom);
    await expect(
      startGameHandler(tx, roomRef, 'uid-1', ['uid-1', 'uid-9'], fixedNow)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects a playerOrder with the wrong number of ids', async () => {
    const { tx } = fakeTransaction(lobbyRoom);
    await expect(
      startGameHandler(tx, roomRef, 'uid-1', ['uid-1'], fixedNow)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects a playerOrder with a duplicated id', async () => {
    const { tx } = fakeTransaction(lobbyRoom);
    await expect(
      startGameHandler(tx, roomRef, 'uid-1', ['uid-1', 'uid-1'], fixedNow)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects when not every player is ready', async () => {
    const notAllReady: RoomDocument = {
      ...lobbyRoom,
      players: [
        { id: 'uid-1', name: 'Ola', avatarId: 'fox', ready: true },
        { id: 'uid-2', name: 'Kuba', avatarId: 'wolf', ready: false },
      ],
    };
    const { tx } = fakeTransaction(notAllReady);
    await expect(startGameHandler(tx, roomRef, 'uid-1', undefined, fixedNow)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('rejects when the caller is not the host', async () => {
    const { tx } = fakeTransaction(lobbyRoom);
    await expect(startGameHandler(tx, roomRef, 'uid-2', undefined, fixedNow)).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('rejects when there are fewer than 2 players', async () => {
    const soloRoom: RoomDocument = { ...lobbyRoom, players: [lobbyRoom.players[0]] };
    const { tx } = fakeTransaction(soloRoom);
    await expect(startGameHandler(tx, roomRef, 'uid-1', undefined, fixedNow)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('rejects when the room already started', async () => {
    const playingRoom = { ...lobbyRoom, phase: 'playing' } as RoomDocument;
    const { tx } = fakeTransaction(playingRoom);
    await expect(startGameHandler(tx, roomRef, 'uid-1', undefined, fixedNow)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('throws not-found when the room does not exist', async () => {
    const { tx } = fakeTransaction(null);
    await expect(startGameHandler(tx, roomRef, 'uid-1', undefined, fixedNow)).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});
