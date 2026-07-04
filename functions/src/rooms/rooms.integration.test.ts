import { describe, it, expect } from 'vitest';
import { db } from '../firebaseAdmin';
import { createRoomHandler } from './createRoom';
import { joinRoomHandler } from './joinRoom';
import { startGameHandler } from './startGame';
import { rollDiceHandler } from './rollDice';
import { toggleHeldDieHandler } from './toggleHeldDie';
import { scoreCategoryHandler } from './scoreCategory';
import type { RoomDocument } from './types';

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
});
