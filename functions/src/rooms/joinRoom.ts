import { onCall } from 'firebase-functions/v2/https';
import { Timestamp, type Transaction, type DocumentReference } from 'firebase-admin/firestore';
import { db } from '../firebaseAdmin';
import { getProfileOrThrow, type StoredProfile } from '../profiles';
import { unauthenticated, notFound, failedPrecondition, invalidArgument } from '../errors';
import type { RoomDocument, RoomPlayer } from './types';

export async function joinRoomHandler(
  tx: Transaction,
  roomRef: DocumentReference,
  uid: string,
  profile: StoredProfile,
  now: () => Timestamp = Timestamp.now
): Promise<void> {
  const snapshot = await tx.get(roomRef);
  if (!snapshot.exists) {
    throw notFound();
  }
  const room = snapshot.data() as RoomDocument;
  if (room.phase !== 'lobby') {
    throw failedPrecondition('Pokój już wystartował lub gra się zakończyła.');
  }
  if (room.players.some((player) => player.id === uid)) {
    return;
  }
  if (room.players.length >= room.maxPlayers) {
    throw failedPrecondition('Pokój jest pełny.');
  }
  const newPlayer: RoomPlayer = {
    id: uid,
    name: profile.displayName,
    avatarId: profile.avatarId,
    ready: false,
  };
  tx.update(roomRef, {
    players: [...room.players, newPlayer],
    updatedAt: now(),
  });
}

export const joinRoom = onCall<{ roomId: string }>(async (request) => {
  if (!request.auth) {
    throw unauthenticated();
  }
  const roomId = request.data?.roomId;
  if (typeof roomId !== 'string' || roomId.length === 0) {
    throw invalidArgument('Brak kodu pokoju.');
  }
  const uid = request.auth.uid;
  const profile = await getProfileOrThrow(db, uid);
  const roomRef = db.collection('rooms').doc(roomId);
  await db.runTransaction((tx) => joinRoomHandler(tx, roomRef, uid, profile));
});
