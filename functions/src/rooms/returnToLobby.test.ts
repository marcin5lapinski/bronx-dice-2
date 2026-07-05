import { describe, it, expect, vi } from 'vitest';
import type { Transaction, DocumentReference, Timestamp } from 'firebase-admin/firestore';
import { createEmptyScoreCard } from '@bronx-dice/game-engine';
import { returnToLobbyHandler } from './returnToLobby';
import { INACTIVITY_THRESHOLD_MS } from './presence';
import type { RoomDocument } from './types';

function fakeTransaction(room: RoomDocument | null) {
  const set = vi.fn();
  const tx = {
    get: async () => ({ exists: room !== null, data: () => room }),
    set,
  };
  return { tx: tx as unknown as Transaction, set };
}

const roomRef = {} as DocumentReference;

function activeAt(millis: number): Timestamp {
  return { toMillis: () => millis } as unknown as Timestamp;
}

function fixedNow(millis: number): () => Timestamp {
  return () => activeAt(millis);
}

const NOW_MS = 1_000_000;
const STALE_MS = NOW_MS - INACTIVITY_THRESHOLD_MS - 1;
const FRESH_MS = NOW_MS - 1_000;

const player1LastActive = activeAt(FRESH_MS);
const player2LastActive = activeAt(FRESH_MS);

const finishedRoom: RoomDocument = {
  phase: 'finished',
  hostId: 'uid-1',
  maxPlayers: 2,
  turnTimeLimitSeconds: 30,
  turnStartedAt: activeAt(0),
  players: [
    { id: 'uid-1', name: 'Ola', avatarId: 'fox', ready: true, lastActiveAt: player1LastActive },
    { id: 'uid-2', name: 'Kuba', avatarId: 'wolf', ready: true, lastActiveAt: player2LastActive },
  ],
  scoreCards: {
    'uid-1': createEmptyScoreCard(),
    'uid-2': createEmptyScoreCard(),
  },
  dice: [1, 1, 1, 1, 1],
  heldDice: [true, true, true, true, true],
  rollsLeft: 0,
  currentPlayerIndex: 0,
  createdAt: activeAt(0),
  updatedAt: activeAt(0),
};

describe('returnToLobbyHandler', () => {
  it('turns a finished room back into a lobby, resetting ready and dropping game fields', async () => {
    const { tx, set } = fakeTransaction(finishedRoom);
    const timestamp = activeAt(NOW_MS);
    await returnToLobbyHandler(tx, roomRef, 'uid-1', () => timestamp);

    expect(set).toHaveBeenCalledWith(roomRef, {
      phase: 'lobby',
      hostId: 'uid-1',
      maxPlayers: 2,
      turnTimeLimitSeconds: 30,
      players: [
        { id: 'uid-1', name: 'Ola', avatarId: 'fox', ready: false, lastActiveAt: player1LastActive },
        { id: 'uid-2', name: 'Kuba', avatarId: 'wolf', ready: false, lastActiveAt: player2LastActive },
      ],
      createdAt: finishedRoom.createdAt,
      updatedAt: timestamp,
    });
  });

  it('rejects when the caller is not the host', async () => {
    const { tx } = fakeTransaction(finishedRoom);
    await expect(
      returnToLobbyHandler(tx, roomRef, 'uid-2', fixedNow(NOW_MS))
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('allows the host to abort a playing room when every other player is inactive', async () => {
    const playingRoom: RoomDocument = {
      ...finishedRoom,
      phase: 'playing',
      players: [
        { id: 'uid-1', name: 'Ola', avatarId: 'fox', ready: true, lastActiveAt: activeAt(FRESH_MS) },
        {
          id: 'uid-2',
          name: 'Kuba',
          avatarId: 'wolf',
          ready: true,
          lastActiveAt: activeAt(STALE_MS),
        },
      ],
    };
    const { tx, set } = fakeTransaction(playingRoom);
    await returnToLobbyHandler(tx, roomRef, 'uid-1', fixedNow(NOW_MS));
    expect(set).toHaveBeenCalled();
    const [, doc] = set.mock.calls[0];
    expect(doc.phase).toBe('lobby');
  });

  it('rejects aborting a playing room while another player is still active', async () => {
    const playingRoom: RoomDocument = {
      ...finishedRoom,
      phase: 'playing',
      players: [
        { id: 'uid-1', name: 'Ola', avatarId: 'fox', ready: true, lastActiveAt: activeAt(FRESH_MS) },
        {
          id: 'uid-2',
          name: 'Kuba',
          avatarId: 'wolf',
          ready: true,
          lastActiveAt: activeAt(FRESH_MS),
        },
      ],
    };
    const { tx } = fakeTransaction(playingRoom);
    await expect(
      returnToLobbyHandler(tx, roomRef, 'uid-1', fixedNow(NOW_MS))
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects when the room is already in the lobby phase', async () => {
    const lobbyRoom = { ...finishedRoom, phase: 'lobby' } as RoomDocument;
    const { tx } = fakeTransaction(lobbyRoom);
    await expect(
      returnToLobbyHandler(tx, roomRef, 'uid-1', fixedNow(NOW_MS))
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('throws not-found when the room does not exist', async () => {
    const { tx } = fakeTransaction(null);
    await expect(
      returnToLobbyHandler(tx, roomRef, 'uid-1', fixedNow(NOW_MS))
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});
