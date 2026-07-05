import { describe, it, expect, vi } from 'vitest';
import type { Transaction, DocumentReference, Timestamp } from 'firebase-admin/firestore';
import { createEmptyScoreCard } from '@bronx-dice/game-engine';
import { scoreCategoryHandler } from './scoreCategory';
import type { RoomDocument } from './types';

function fakeTransaction(room: RoomDocument | null) {
  const update = vi.fn();
  const set = vi.fn();
  const tx = {
    get: async () => ({ exists: room !== null, data: () => room }),
    update,
    set,
  };
  return { tx: tx as unknown as Transaction, update, set };
}

const roomRef = {} as DocumentReference;
const fixedNow = () => ({}) as unknown as Timestamp;

function basePlayingRoom(): RoomDocument {
  return {
    phase: 'playing',
    hostId: 'uid-1',
    maxPlayers: 2,
    turnTimeLimitSeconds: 30,
    turnStartedAt: {} as Timestamp,
    players: [
      { id: 'uid-1', name: 'Ola', avatarId: 'fox', ready: true, lastActiveAt: {} as Timestamp },
      { id: 'uid-2', name: 'Kuba', avatarId: 'wolf', ready: true, lastActiveAt: {} as Timestamp },
    ],
    scoreCards: {
      'uid-1': createEmptyScoreCard(),
      'uid-2': createEmptyScoreCard(),
    },
    dice: [3, 3, 5, 5, 5],
    heldDice: [false, false, false, false, false],
    rollsLeft: 3,
    currentPlayerIndex: 0,
    createdAt: {} as Timestamp,
    updatedAt: {} as Timestamp,
  };
}

describe('scoreCategoryHandler', () => {
  it('scores the category, advances the turn, and keeps phase playing', async () => {
    // Upper categories can be scored before the upper section is filled (unlike
    // lower categories, which basePlayingRoom's fresh scoreCards can't take yet).
    const room = basePlayingRoom();
    const { tx, update } = fakeTransaction(room);
    await scoreCategoryHandler(tx, roomRef, 'uid-1', 'threes', fixedNow);
    const [, patch] = update.mock.calls[0];
    expect(patch.scoreCards['uid-1'].upper.threes).toBe(6); // two 3s among [3,3,5,5,5]
    expect(patch.currentPlayerIndex).toBe(1);
    expect(patch.phase).toBe('playing');
    expect(patch.turnStartedAt).toEqual({});
  });

  it('sets phase to finished when scoring completes the last open category', async () => {
    const room = basePlayingRoom();
    // Player uid-1: everything filled except 'chance'. Player uid-2: fully filled already.
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
    room.dice = [1, 1, 1, 1, 1];
    room.rollsLeft = 3;
    const { tx, update, set } = fakeTransaction(room);
    await scoreCategoryHandler(tx, roomRef, 'uid-1', 'chance', fixedNow);
    const [, patch] = update.mock.calls[0];
    expect(patch.scoreCards['uid-1'].lower.chance).toBe(5);
    expect(patch.phase).toBe('finished');

    // Stats are recorded for every player once the game finishes: the room
    // update stays first (existing assertions above index into it), then
    // one aggregate update + one history write per player.
    expect(update).toHaveBeenCalledTimes(3);
    expect(set).toHaveBeenCalledTimes(2);
  });

  it('rejects a category that cannot be scored right now', async () => {
    const room = basePlayingRoom();
    room.scoreCards['uid-1'].upper.aces = 3; // already scored
    const { tx } = fakeTransaction(room);
    await expect(
      scoreCategoryHandler(tx, roomRef, 'uid-1', 'aces', fixedNow)
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects before rolling', async () => {
    const room = { ...basePlayingRoom(), dice: [] };
    const { tx } = fakeTransaction(room);
    await expect(
      scoreCategoryHandler(tx, roomRef, 'uid-1', 'chance', fixedNow)
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it("rejects when it is not the caller's turn", async () => {
    const room = basePlayingRoom();
    const { tx } = fakeTransaction(room);
    await expect(
      scoreCategoryHandler(tx, roomRef, 'uid-2', 'chance', fixedNow)
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects when the room is not in the playing phase', async () => {
    const room = { ...basePlayingRoom(), phase: 'lobby' } as RoomDocument;
    const { tx } = fakeTransaction(room);
    await expect(
      scoreCategoryHandler(tx, roomRef, 'uid-1', 'chance', fixedNow)
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('throws not-found when the room does not exist', async () => {
    const { tx } = fakeTransaction(null);
    await expect(
      scoreCategoryHandler(tx, roomRef, 'uid-1', 'chance', fixedNow)
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});
