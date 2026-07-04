import { describe, it, expect, vi } from 'vitest';
import type { Transaction, DocumentReference, Timestamp } from 'firebase-admin/firestore';
import { rollDiceHandler } from './rollDice';
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
  players: [
    { id: 'uid-1', name: 'Ola', avatarId: 'fox' },
    { id: 'uid-2', name: 'Kuba', avatarId: 'wolf' },
  ],
  scoreCards: {},
  dice: [],
  heldDice: [false, false, false, false, false],
  rollsLeft: 3,
  currentPlayerIndex: 0,
  createdAt: {} as Timestamp,
  updatedAt: {} as Timestamp,
};

describe('rollDiceHandler', () => {
  it("rolls dice and decrements rollsLeft on the current player's turn", async () => {
    const { tx, update } = fakeTransaction(playingRoom);
    await rollDiceHandler(tx, roomRef, 'uid-1', () => 0, fixedNow);
    expect(update).toHaveBeenCalledWith(roomRef, {
      dice: [1, 1, 1, 1, 1],
      rollsLeft: 2,
      updatedAt: {},
    });
  });

  it('rejects when it is not the caller\'s turn', async () => {
    const { tx } = fakeTransaction(playingRoom);
    await expect(rollDiceHandler(tx, roomRef, 'uid-2', () => 0, fixedNow)).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('rejects when there are no rolls left', async () => {
    const noRollsRoom = { ...playingRoom, rollsLeft: 0 };
    const { tx } = fakeTransaction(noRollsRoom);
    await expect(rollDiceHandler(tx, roomRef, 'uid-1', () => 0, fixedNow)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('rejects when the room is not in the playing phase', async () => {
    const lobbyRoom = { ...playingRoom, phase: 'lobby' } as RoomDocument;
    const { tx } = fakeTransaction(lobbyRoom);
    await expect(rollDiceHandler(tx, roomRef, 'uid-1', () => 0, fixedNow)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('throws not-found when the room does not exist', async () => {
    const { tx } = fakeTransaction(null);
    await expect(rollDiceHandler(tx, roomRef, 'uid-1', () => 0, fixedNow)).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});
