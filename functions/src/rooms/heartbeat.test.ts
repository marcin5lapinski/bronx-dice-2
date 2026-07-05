import { describe, it, expect, vi } from 'vitest';
import type { Transaction, DocumentReference, Timestamp } from 'firebase-admin/firestore';
import { heartbeatHandler } from './heartbeat';
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
const oldTimestamp = { toMillis: () => 1_000 } as Timestamp;
const fixedNow = () => ({ toMillis: () => 2_000 }) as unknown as Timestamp;

const lobbyRoom: RoomDocument = {
  phase: 'lobby',
  hostId: 'uid-1',
  maxPlayers: 3,
  turnTimeLimitSeconds: 30,
  players: [
    { id: 'uid-1', name: 'Ola', avatarId: 'fox', ready: true, lastActiveAt: oldTimestamp },
    { id: 'uid-2', name: 'Kuba', avatarId: 'wolf', ready: true, lastActiveAt: oldTimestamp },
  ],
  createdAt: {} as Timestamp,
  updatedAt: {} as Timestamp,
};

describe('heartbeatHandler', () => {
  it("updates the caller's lastActiveAt, leaving other players untouched", async () => {
    const { tx, update } = fakeTransaction(lobbyRoom);
    const timestamp = fixedNow();
    await heartbeatHandler(tx, roomRef, 'uid-2', () => timestamp);

    expect(update).toHaveBeenCalledWith(roomRef, {
      players: [
        { id: 'uid-1', name: 'Ola', avatarId: 'fox', ready: true, lastActiveAt: oldTimestamp },
        { id: 'uid-2', name: 'Kuba', avatarId: 'wolf', ready: true, lastActiveAt: timestamp },
      ],
      updatedAt: timestamp,
    });
  });

  it('throws not-found when the room does not exist', async () => {
    const { tx } = fakeTransaction(null);
    await expect(heartbeatHandler(tx, roomRef, 'uid-1', fixedNow)).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('throws permission-denied when the caller is not a player in the room', async () => {
    const { tx } = fakeTransaction(lobbyRoom);
    await expect(heartbeatHandler(tx, roomRef, 'uid-9', fixedNow)).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });
});
