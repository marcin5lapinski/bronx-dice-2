import { describe, it, expect, vi } from 'vitest';
import type { Transaction, DocumentReference, Timestamp } from 'firebase-admin/firestore';
import { setReadyHandler } from './setReady';
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
    { id: 'uid-1', name: 'Ola', avatarId: 'fox', ready: false, lastActiveAt: {} as Timestamp },
    { id: 'uid-2', name: 'Kuba', avatarId: 'wolf', ready: false, lastActiveAt: {} as Timestamp },
  ],
  createdAt: {} as Timestamp,
  updatedAt: {} as Timestamp,
};

describe('setReadyHandler', () => {
  it("updates only the caller's own ready state", async () => {
    const { tx, update } = fakeTransaction(lobbyRoom);
    await setReadyHandler(tx, roomRef, 'uid-1', true, fixedNow);
    expect(update).toHaveBeenCalledWith(roomRef, {
      players: [
        { id: 'uid-1', name: 'Ola', avatarId: 'fox', ready: true, lastActiveAt: {} },
        { id: 'uid-2', name: 'Kuba', avatarId: 'wolf', ready: false, lastActiveAt: {} },
      ],
      updatedAt: {},
    });
  });

  it('can flip ready back to false', async () => {
    const readyRoom: RoomDocument = {
      ...lobbyRoom,
      players: [
        { id: 'uid-1', name: 'Ola', avatarId: 'fox', ready: true, lastActiveAt: {} as Timestamp },
        { id: 'uid-2', name: 'Kuba', avatarId: 'wolf', ready: false, lastActiveAt: {} as Timestamp },
      ],
    };
    const { tx, update } = fakeTransaction(readyRoom);
    await setReadyHandler(tx, roomRef, 'uid-1', false, fixedNow);
    const [, patch] = update.mock.calls[0];
    expect(patch.players[0].ready).toBe(false);
  });

  it('throws not-found when the room does not exist', async () => {
    const { tx } = fakeTransaction(null);
    await expect(
      setReadyHandler(tx, roomRef, 'uid-1', true, fixedNow)
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('rejects when the room is not in the lobby phase', async () => {
    const playingRoom = { ...lobbyRoom, phase: 'playing' } as RoomDocument;
    const { tx } = fakeTransaction(playingRoom);
    await expect(
      setReadyHandler(tx, roomRef, 'uid-1', true, fixedNow)
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects a caller who is not a player in the room', async () => {
    const { tx } = fakeTransaction(lobbyRoom);
    await expect(
      setReadyHandler(tx, roomRef, 'uid-9', true, fixedNow)
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
