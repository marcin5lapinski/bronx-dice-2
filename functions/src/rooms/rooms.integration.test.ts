import { describe, it, expect } from 'vitest';
import { db } from '../firebaseAdmin';
import { createRoomHandler } from './createRoom';
import { joinRoomHandler } from './joinRoom';
import { setReadyHandler } from './setReady';
import { startGameHandler } from './startGame';
import { rollDiceHandler } from './rollDice';
import { toggleHeldDieHandler } from './toggleHeldDie';
import { scoreCategoryHandler } from './scoreCategory';
import { handleTurnTimeoutHandler } from './handleTurnTimeout';
import type { RoomDocument } from './types';
import { UPPER_CATEGORIES, LOWER_CATEGORIES, canScoreCategory } from '@bronx-dice/game-engine';

const hostProfile = { displayName: 'Ola', avatarId: 'fox' };
const guestProfile = { displayName: 'Kuba', avatarId: 'wolf' };

async function getRoom(roomId: string): Promise<RoomDocument> {
  const snapshot = await db.collection('rooms').doc(roomId).get();
  return snapshot.data() as RoomDocument;
}

describe('room lifecycle (Firestore emulator)', () => {
  it('goes from createRoom through scoreCategory to a scored turn', async () => {
    const roomId = await createRoomHandler(db, 'uid-host', hostProfile, 2, 30);
    let room = await getRoom(roomId);
    expect(room.phase).toBe('lobby');
    expect(room.players).toHaveLength(1);

    const roomRef = db.collection('rooms').doc(roomId);
    await db.runTransaction((tx) => joinRoomHandler(tx, roomRef, 'uid-guest', guestProfile));
    room = await getRoom(roomId);
    expect(room.players).toHaveLength(2);

    await db.runTransaction((tx) => setReadyHandler(tx, roomRef, 'uid-host', true));
    await db.runTransaction((tx) => setReadyHandler(tx, roomRef, 'uid-guest', true));

    await db.runTransaction((tx) => startGameHandler(tx, roomRef, 'uid-host'));
    room = await getRoom(roomId);
    expect(room.phase).toBe('playing');
    expect(room.currentPlayerIndex).toBe(0);

    await db.runTransaction((tx) => rollDiceHandler(tx, roomRef, 'uid-host', () => 0));
    room = await getRoom(roomId);
    expect(room.dice).toEqual([1, 1, 1, 1, 1]);
    expect(room.rollsLeft).toBe(2);

    await db.runTransaction((tx) => toggleHeldDieHandler(tx, roomRef, 'uid-host', 0));
    room = await getRoom(roomId);
    expect(room.heldDice[0]).toBe(true);

    // 'aces' (an upper category) rather than a lower category — the room's
    // score cards are freshly created by startGame, and lower categories can
    // only be scored once the whole upper section is filled.
    await db.runTransaction((tx) => scoreCategoryHandler(tx, roomRef, 'uid-host', 'aces'));
    room = await getRoom(roomId);
    expect(room.scoreCards['uid-host'].upper.aces).toBe(5); // five dice showing 1
    expect(room.phase).toBe('playing');
    expect(room.currentPlayerIndex).toBe(1);
  });

  it('rejects startGame until every player is ready, then auto-zeros a timed-out turn', async () => {
    const roomId = await createRoomHandler(db, 'uid-host', hostProfile, 2, 15);
    const roomRef = db.collection('rooms').doc(roomId);
    await db.runTransaction((tx) => joinRoomHandler(tx, roomRef, 'uid-guest', guestProfile));

    await expect(
      db.runTransaction((tx) => startGameHandler(tx, roomRef, 'uid-host'))
    ).rejects.toMatchObject({ code: 'failed-precondition' });

    await db.runTransaction((tx) => setReadyHandler(tx, roomRef, 'uid-host', true));
    await db.runTransaction((tx) => setReadyHandler(tx, roomRef, 'uid-guest', true));
    await db.runTransaction((tx) => startGameHandler(tx, roomRef, 'uid-host'));

    // The just-started turn is well within its 15s limit — any timeout attempt
    // right now must be rejected regardless of who calls it.
    await expect(
      db.runTransaction((tx) => handleTurnTimeoutHandler(tx, roomRef, 'uid-guest'))
    ).rejects.toMatchObject({ code: 'failed-precondition' });

    // Simulate the limit having elapsed by backdating turnStartedAt directly.
    const { Timestamp } = await import('firebase-admin/firestore');
    await roomRef.update({ turnStartedAt: Timestamp.fromMillis(Date.now() - 20_000) });

    await db.runTransaction((tx) => handleTurnTimeoutHandler(tx, roomRef, 'uid-guest'));
    const room = await getRoom(roomId);
    expect(room.scoreCards['uid-host'].upper.aces).toBe(0);
    expect(room.currentPlayerIndex).toBe(1);
  });

  it('starts the game with a host-chosen player order', async () => {
    const roomId = await createRoomHandler(db, 'uid-host', hostProfile, 2, 30);
    const roomRef = db.collection('rooms').doc(roomId);
    await db.runTransaction((tx) => joinRoomHandler(tx, roomRef, 'uid-guest', guestProfile));
    await db.runTransaction((tx) => setReadyHandler(tx, roomRef, 'uid-host', true));
    await db.runTransaction((tx) => setReadyHandler(tx, roomRef, 'uid-guest', true));

    await db.runTransaction((tx) =>
      startGameHandler(tx, roomRef, 'uid-host', ['uid-guest', 'uid-host'])
    );

    const room = await getRoom(roomId);
    expect(room.phase).toBe('playing');
    expect(room.players.map((player) => player.id)).toEqual(['uid-guest', 'uid-host']);
    expect(room.currentPlayerIndex).toBe(0);
  });

  it('records online stats for every player once a real game reaches finished', async () => {
    const roomId = await createRoomHandler(db, 'uid-host', hostProfile, 2, 30);
    const roomRef = db.collection('rooms').doc(roomId);
    await db.runTransaction((tx) => joinRoomHandler(tx, roomRef, 'uid-guest', guestProfile));
    await db.runTransaction((tx) => setReadyHandler(tx, roomRef, 'uid-host', true));
    await db.runTransaction((tx) => setReadyHandler(tx, roomRef, 'uid-guest', true));
    await db.runTransaction((tx) => startGameHandler(tx, roomRef, 'uid-host'));

    // recordGameResults writes to users/{uid} inside the same transaction as
    // the room's 'finished' transition, so both player docs must exist first
    // (mirrors production: createRoom/joinRoom's onCall wrappers always
    // require a profile via getProfileOrThrow before either handler runs;
    // this test calls the handlers directly, so it seeds the docs itself).
    await db
      .collection('users')
      .doc('uid-host')
      .set({ displayName: 'Ola', avatarId: 'fox', email: 'ola@example.com' });
    await db
      .collection('users')
      .doc('uid-guest')
      .set({ displayName: 'Kuba', avatarId: 'wolf', email: 'kuba@example.com' });

    const allCategories = [...UPPER_CATEGORIES, ...LOWER_CATEGORIES];

    let room = await getRoom(roomId);
    while (room.phase === 'playing') {
      const currentPlayer = room.players[room.currentPlayerIndex];
      await db.runTransaction((tx) => rollDiceHandler(tx, roomRef, currentPlayer.id, () => 0));
      room = await getRoom(roomId);
      const category = allCategories.find((c) =>
        canScoreCategory(room.scoreCards[currentPlayer.id], c)
      )!;
      await db.runTransaction((tx) => scoreCategoryHandler(tx, roomRef, currentPlayer.id, category));
      room = await getRoom(roomId);
    }

    expect(room.phase).toBe('finished');

    const hostDoc = await db.collection('users').doc('uid-host').get();
    const guestDoc = await db.collection('users').doc('uid-guest').get();
    expect(hostDoc.data()?.onlineStats).toEqual({
      gamesPlayed: 1,
      wins: expect.any(Number),
      totalScore: expect.any(Number),
    });
    expect(guestDoc.data()?.onlineStats).toEqual({
      gamesPlayed: 1,
      wins: expect.any(Number),
      totalScore: expect.any(Number),
    });

    const hostHistory = await db.collection('users').doc('uid-host').collection('onlineGames').get();
    const guestHistory = await db.collection('users').doc('uid-guest').collection('onlineGames').get();
    expect(hostHistory.docs).toHaveLength(1);
    expect(guestHistory.docs).toHaveLength(1);
    expect(hostHistory.docs[0].data()).toMatchObject({
      score: expect.any(Number),
      won: expect.any(Boolean),
    });
    expect(guestHistory.docs[0].data()).toMatchObject({
      score: expect.any(Number),
      won: expect.any(Boolean),
    });
  }, 20000);
});
