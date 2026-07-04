import { describe, it, expect, vi } from 'vitest';
import type { Transaction, DocumentReference, Timestamp } from 'firebase-admin/firestore';
import { toggleHeldDieHandler } from './toggleHeldDie';
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

const playingRoom: RoomDocument = {
  phase: 'playing',
  hostId: 'uid-1',
  maxPlayers: 2,
  turnTimeLimitSeconds: 30,
  turnStartedAt: {} as Timestamp,
  players: [
    { id: 'uid-1', name: 'Ola', avatarId: 'fox', ready: true },
    { id: 'uid-2', name: 'Kuba', avatarId: 'wolf', ready: true },
  ],
  scoreCards: {},
  dice: [1, 2, 3, 4, 5],
  heldDice: [false, false, false, false, false],
  rollsLeft: 2,
  currentPlayerIndex: 0,
  createdAt: {} as Timestamp,
  updatedAt: {} as Timestamp,
};

describe('toggleHeldDieHandler', () => {
  it("toggles the held state for the given die index on the caller's turn", async () => {
    const { tx, update } = fakeTransaction(playingRoom);
    await toggleHeldDieHandler(tx, roomRef, 'uid-1', 1, fixedNow);
    expect(update).toHaveBeenCalledWith(roomRef, {
      heldDice: [false, true, false, false, false],
      updatedAt: {},
    });
  });

  it('rejects an out-of-range die index', async () => {
    const { tx } = fakeTransaction(playingRoom);
    await expect(toggleHeldDieHandler(tx, roomRef, 'uid-1', 5, fixedNow)).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('rejects before any dice have been rolled', async () => {
    const notRolledRoom = { ...playingRoom, dice: [] };
    const { tx } = fakeTransaction(notRolledRoom);
    await expect(toggleHeldDieHandler(tx, roomRef, 'uid-1', 0, fixedNow)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it("rejects when it is not the caller's turn", async () => {
    const { tx } = fakeTransaction(playingRoom);
    await expect(toggleHeldDieHandler(tx, roomRef, 'uid-2', 0, fixedNow)).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('rejects when the room is not in the playing phase', async () => {
    const lobbyRoom = { ...playingRoom, phase: 'lobby' } as RoomDocument;
    const { tx } = fakeTransaction(lobbyRoom);
    await expect(toggleHeldDieHandler(tx, roomRef, 'uid-1', 0, fixedNow)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('throws not-found when the room does not exist', async () => {
    const { tx } = fakeTransaction(null);
    await expect(toggleHeldDieHandler(tx, roomRef, 'uid-1', 0, fixedNow)).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});
