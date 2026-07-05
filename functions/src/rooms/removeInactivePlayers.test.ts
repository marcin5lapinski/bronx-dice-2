import { describe, it, expect, vi } from 'vitest';
import type { Transaction, DocumentReference, Timestamp } from 'firebase-admin/firestore';
import { createEmptyScoreCard } from '@bronx-dice/game-engine';
import { removeInactivePlayersHandler } from './removeInactivePlayers';
import { INACTIVITY_THRESHOLD_MS } from './presence';
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

function activeAt(millis: number): Timestamp {
  return { toMillis: () => millis } as unknown as Timestamp;
}

function fixedNow(millis: number): () => Timestamp {
  return () => activeAt(millis);
}

const NOW_MS = 1_000_000;
const STALE_MS = NOW_MS - INACTIVITY_THRESHOLD_MS - 1;
const FRESH_MS = NOW_MS - 1_000;

function basePlayingRoom(): RoomDocument {
  return {
    phase: 'playing',
    hostId: 'uid-1',
    maxPlayers: 3,
    turnTimeLimitSeconds: 30,
    turnStartedAt: activeAt(0),
    players: [
      { id: 'uid-1', name: 'Ola', avatarId: 'fox', ready: true, lastActiveAt: activeAt(FRESH_MS) },
      {
        id: 'uid-2',
        name: 'Kuba',
        avatarId: 'wolf',
        ready: true,
        lastActiveAt: activeAt(STALE_MS),
      },
      {
        id: 'uid-3',
        name: 'Zosia',
        avatarId: 'owl',
        ready: true,
        lastActiveAt: activeAt(FRESH_MS),
      },
    ],
    scoreCards: {
      'uid-1': createEmptyScoreCard(),
      'uid-2': createEmptyScoreCard(),
      'uid-3': createEmptyScoreCard(),
    },
    dice: [1, 2, 3, 4, 5],
    heldDice: [false, false, false, false, false],
    rollsLeft: 2,
    currentPlayerIndex: 1,
    createdAt: activeAt(0),
    updatedAt: activeAt(0),
  };
}

describe('removeInactivePlayersHandler', () => {
  it("removes stale non-host players and advances the turn away from the removed current player", async () => {
    const room = basePlayingRoom();
    const { tx, update } = fakeTransaction(room);
    await removeInactivePlayersHandler(tx, roomRef, 'uid-1', fixedNow(NOW_MS));

    const [, patch] = update.mock.calls[0];
    expect(patch.players.map((p: { id: string }) => p.id)).toEqual(['uid-1', 'uid-3']);
    expect(Object.keys(patch.scoreCards)).toEqual(['uid-1', 'uid-3']);
    expect(patch.currentPlayerIndex).toBe(1); // uid-3, the only survivor after uid-2
    expect(patch.dice).toEqual([]);
    expect(patch.rollsLeft).toBe(3);
  });

  it('rejects when the caller is not the host', async () => {
    const room = basePlayingRoom();
    const { tx } = fakeTransaction(room);
    await expect(
      removeInactivePlayersHandler(tx, roomRef, 'uid-3', fixedNow(NOW_MS))
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects when there are no inactive players', async () => {
    const room = {
      ...basePlayingRoom(),
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
    const { tx } = fakeTransaction(room);
    await expect(
      removeInactivePlayersHandler(tx, roomRef, 'uid-1', fixedNow(NOW_MS))
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects when the room is not in the playing phase', async () => {
    const room = { ...basePlayingRoom(), phase: 'lobby' } as RoomDocument;
    const { tx } = fakeTransaction(room);
    await expect(
      removeInactivePlayersHandler(tx, roomRef, 'uid-1', fixedNow(NOW_MS))
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('throws not-found when the room does not exist', async () => {
    const { tx } = fakeTransaction(null);
    await expect(
      removeInactivePlayersHandler(tx, roomRef, 'uid-1', fixedNow(NOW_MS))
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});
