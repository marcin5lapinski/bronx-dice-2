import { describe, it, expect, vi } from 'vitest';
import type { Transaction, DocumentReference, Timestamp } from 'firebase-admin/firestore';
import { joinRoomHandler } from './joinRoom';
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
const profile = { displayName: 'Kuba', avatarId: 'wolf' };

const lobbyRoom: RoomDocument = {
  phase: 'lobby',
  hostId: 'uid-1',
  maxPlayers: 3,
  turnTimeLimitSeconds: 30,
  players: [
    { id: 'uid-1', name: 'Ola', avatarId: 'fox', ready: true, lastActiveAt: {} as Timestamp },
  ],
  createdAt: {} as Timestamp,
  updatedAt: {} as Timestamp,
};

describe('joinRoomHandler', () => {
  it('adds the player to a lobby room with space', async () => {
    const { tx, update } = fakeTransaction(lobbyRoom);
    await joinRoomHandler(tx, roomRef, 'uid-2', profile, fixedNow);
    expect(update).toHaveBeenCalledWith(roomRef, {
      players: [
        { id: 'uid-1', name: 'Ola', avatarId: 'fox', ready: true, lastActiveAt: {} },
        { id: 'uid-2', name: 'Kuba', avatarId: 'wolf', ready: false, lastActiveAt: {} },
      ],
      updatedAt: {},
    });
  });

  it('is a no-op when the player already joined', async () => {
    const { tx, update } = fakeTransaction(lobbyRoom);
    await joinRoomHandler(tx, roomRef, 'uid-1', profile, fixedNow);
    expect(update).not.toHaveBeenCalled();
  });

  it('throws not-found when the room does not exist', async () => {
    const { tx } = fakeTransaction(null);
    await expect(joinRoomHandler(tx, roomRef, 'uid-2', profile, fixedNow)).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('throws failed-precondition when the room is full', async () => {
    const fullRoom: RoomDocument = { ...lobbyRoom, maxPlayers: 1 };
    const { tx } = fakeTransaction(fullRoom);
    await expect(joinRoomHandler(tx, roomRef, 'uid-2', profile, fixedNow)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('throws failed-precondition when the room already started', async () => {
    const playingRoom = { ...lobbyRoom, phase: 'playing' } as RoomDocument;
    const { tx } = fakeTransaction(playingRoom);
    await expect(joinRoomHandler(tx, roomRef, 'uid-2', profile, fixedNow)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });
});
