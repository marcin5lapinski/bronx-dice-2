import { describe, it, expect, vi } from 'vitest';
import type { Transaction, DocumentReference, Timestamp } from 'firebase-admin/firestore';
import { leaveRoomHandler } from './leaveRoom';
import type { RoomDocument } from './types';

function fakeTransaction(room: RoomDocument | null) {
  const update = vi.fn();
  const del = vi.fn();
  const tx = {
    get: async () => ({ exists: room !== null, data: () => room }),
    update,
    delete: del,
  };
  return { tx: tx as unknown as Transaction, update, del };
}

const roomRef = {} as DocumentReference;
const fixedNow = () => ({}) as unknown as Timestamp;

const twoPlayerLobby: RoomDocument = {
  phase: 'lobby',
  hostId: 'uid-1',
  maxPlayers: 3,
  players: [
    { id: 'uid-1', name: 'Ola', avatarId: 'fox' },
    { id: 'uid-2', name: 'Kuba', avatarId: 'wolf' },
  ],
  createdAt: {} as Timestamp,
  updatedAt: {} as Timestamp,
};

describe('leaveRoomHandler', () => {
  it('removes a non-host player from the lobby, keeping the host', async () => {
    const { tx, update } = fakeTransaction(twoPlayerLobby);
    await leaveRoomHandler(tx, roomRef, 'uid-2', fixedNow);
    expect(update).toHaveBeenCalledWith(roomRef, {
      players: [{ id: 'uid-1', name: 'Ola', avatarId: 'fox' }],
      hostId: 'uid-1',
      updatedAt: {},
    });
  });

  it('promotes the next remaining player to host when the host leaves', async () => {
    const { tx, update } = fakeTransaction(twoPlayerLobby);
    await leaveRoomHandler(tx, roomRef, 'uid-1', fixedNow);
    expect(update).toHaveBeenCalledWith(roomRef, {
      players: [{ id: 'uid-2', name: 'Kuba', avatarId: 'wolf' }],
      hostId: 'uid-2',
      updatedAt: {},
    });
  });

  it('deletes the room when the last player leaves', async () => {
    const soloRoom: RoomDocument = { ...twoPlayerLobby, players: [twoPlayerLobby.players[0]] };
    const { tx, del, update } = fakeTransaction(soloRoom);
    await leaveRoomHandler(tx, roomRef, 'uid-1', fixedNow);
    expect(del).toHaveBeenCalledWith(roomRef);
    expect(update).not.toHaveBeenCalled();
  });

  it('is a no-op when the caller is not in the room', async () => {
    const { tx, update, del } = fakeTransaction(twoPlayerLobby);
    await leaveRoomHandler(tx, roomRef, 'uid-9', fixedNow);
    expect(update).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it('rejects when the room is not in the lobby phase', async () => {
    const playingRoom = { ...twoPlayerLobby, phase: 'playing' } as RoomDocument;
    const { tx } = fakeTransaction(playingRoom);
    await expect(leaveRoomHandler(tx, roomRef, 'uid-1', fixedNow)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('throws not-found when the room does not exist', async () => {
    const { tx } = fakeTransaction(null);
    await expect(leaveRoomHandler(tx, roomRef, 'uid-1', fixedNow)).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});
