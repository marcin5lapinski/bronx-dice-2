import { describe, it, expect, vi } from 'vitest';
import type { Transaction, DocumentReference, Timestamp } from 'firebase-admin/firestore';
import { createEmptyScoreCard } from '@bronx-dice/game-engine';
import { handleTurnTimeoutHandler } from './handleTurnTimeout';
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

function fixedNow(millis: number): () => Timestamp {
  return () => ({ toMillis: () => millis }) as unknown as Timestamp;
}

function basePlayingRoom(turnStartedMillis: number): RoomDocument {
  return {
    phase: 'playing',
    hostId: 'uid-1',
    maxPlayers: 2,
    turnTimeLimitSeconds: 15,
    turnStartedAt: { toMillis: () => turnStartedMillis } as unknown as Timestamp,
    players: [
      { id: 'uid-1', name: 'Ola', avatarId: 'fox', ready: true, lastActiveAt: {} as Timestamp },
      { id: 'uid-2', name: 'Kuba', avatarId: 'wolf', ready: true, lastActiveAt: {} as Timestamp },
    ],
    scoreCards: {
      'uid-1': createEmptyScoreCard(),
      'uid-2': createEmptyScoreCard(),
    },
    dice: [],
    heldDice: [false, false, false, false, false],
    rollsLeft: 3,
    currentPlayerIndex: 0,
    createdAt: {} as Timestamp,
    updatedAt: {} as Timestamp,
  };
}

describe('handleTurnTimeoutHandler', () => {
  it('zero-fills the first unfilled category and advances the turn once the limit has elapsed', async () => {
    const room = basePlayingRoom(0);
    const { tx, update } = fakeTransaction(room);
    await handleTurnTimeoutHandler(tx, roomRef, 'uid-1', fixedNow(15_000));
    const [, patch] = update.mock.calls[0];
    expect(patch.scoreCards['uid-1'].upper.aces).toBe(0);
    expect(patch.currentPlayerIndex).toBe(1);
    expect(patch.phase).toBe('playing');
    expect(patch.turnStartedAt).toEqual({ toMillis: expect.any(Function) });
  });

  it('rejects when the time limit has not elapsed yet', async () => {
    const room = basePlayingRoom(0);
    const { tx } = fakeTransaction(room);
    await expect(
      handleTurnTimeoutHandler(tx, roomRef, 'uid-1', fixedNow(14_000))
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('can be triggered by any player in the room, not just the current one', async () => {
    const room = basePlayingRoom(0);
    const { tx, update } = fakeTransaction(room);
    await handleTurnTimeoutHandler(tx, roomRef, 'uid-2', fixedNow(20_000));
    expect(update).toHaveBeenCalled();
  });

  it('rejects a caller who is not a player in the room', async () => {
    const room = basePlayingRoom(0);
    const { tx } = fakeTransaction(room);
    await expect(
      handleTurnTimeoutHandler(tx, roomRef, 'uid-9', fixedNow(20_000))
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects when the room is not in the playing phase', async () => {
    const room = { ...basePlayingRoom(0), phase: 'lobby' } as RoomDocument;
    const { tx } = fakeTransaction(room);
    await expect(
      handleTurnTimeoutHandler(tx, roomRef, 'uid-1', fixedNow(20_000))
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('throws not-found when the room does not exist', async () => {
    const { tx } = fakeTransaction(null);
    await expect(
      handleTurnTimeoutHandler(tx, roomRef, 'uid-1', fixedNow(20_000))
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('sets phase to finished when the zero-fill completes the last category', async () => {
    const room = basePlayingRoom(0);
    const filledUpper = { aces: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 };
    const filledLowerExceptChance = {
      pair: 0, twoPair: 0, threeOfKind: 0, fourOfKind: 0,
      smallStraight: 0, largeStraight: 0, fullHouse: 0, yahtzee: 0, chance: null,
    };
    room.scoreCards['uid-1'] = { upper: { ...filledUpper }, lower: { ...filledLowerExceptChance } } as never;
    room.scoreCards['uid-2'] = {
      upper: { ...filledUpper },
      lower: { ...filledLowerExceptChance, chance: 10 },
    } as never;
    const { tx, update } = fakeTransaction(room);
    await handleTurnTimeoutHandler(tx, roomRef, 'uid-1', fixedNow(15_000));
    const [, patch] = update.mock.calls[0];
    expect(patch.scoreCards['uid-1'].lower.chance).toBe(0);
    expect(patch.phase).toBe('finished');
  });
});
