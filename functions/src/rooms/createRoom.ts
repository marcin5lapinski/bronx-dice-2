import { onCall } from 'firebase-functions/v2/https';
import { Timestamp, type Firestore, type Transaction, type DocumentReference } from 'firebase-admin/firestore';
import { MIN_PLAYERS, MAX_PLAYERS } from '@bronx-dice/game-engine';
import { db } from '../firebaseAdmin';
import { getProfileOrThrow, type StoredProfile } from '../profiles';
import { unauthenticated, invalidArgument, internal } from '../errors';
import { generateRoomCode } from './roomCode';
import type { RoomDocument } from './types';

const MAX_ROOM_CODE_ATTEMPTS = 5;

export async function createRoomHandler(
  firestore: Firestore,
  uid: string,
  profile: StoredProfile,
  maxPlayers: number,
  random: () => number = Math.random,
  now: () => Timestamp = Timestamp.now
): Promise<string> {
  if (!Number.isInteger(maxPlayers) || maxPlayers < MIN_PLAYERS || maxPlayers > MAX_PLAYERS) {
    throw invalidArgument(
      `Liczba graczy musi być liczbą całkowitą od ${MIN_PLAYERS} do ${MAX_PLAYERS}.`
    );
  }

  const timestamp = now();
  const room: RoomDocument = {
    phase: 'lobby',
    hostId: uid,
    maxPlayers,
    players: [{ id: uid, name: profile.displayName, avatarId: profile.avatarId }],
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  for (let attempt = 0; attempt < MAX_ROOM_CODE_ATTEMPTS; attempt++) {
    const roomId = generateRoomCode(random);
    const created = await tryCreateRoom(firestore, roomId, room);
    if (created) {
      return roomId;
    }
  }
  throw internal('Nie udało się utworzyć pokoju. Spróbuj ponownie.');
}

async function tryCreateRoom(
  firestore: Firestore,
  roomId: string,
  room: RoomDocument
): Promise<boolean> {
  return firestore.runTransaction(async (tx: Transaction) => {
    const ref: DocumentReference = firestore.collection('rooms').doc(roomId);
    const snapshot = await tx.get(ref);
    if (snapshot.exists) {
      return false;
    }
    tx.set(ref, room);
    return true;
  });
}

export const createRoom = onCall<{ maxPlayers: number }>(async (request) => {
  if (!request.auth) {
    throw unauthenticated();
  }
  const uid = request.auth.uid;
  const profile = await getProfileOrThrow(db, uid);
  const roomId = await createRoomHandler(db, uid, profile, request.data?.maxPlayers);
  return { roomId };
});
