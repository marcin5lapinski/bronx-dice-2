import { onCall } from 'firebase-functions/v2/https';
import { Timestamp, type Transaction, type DocumentReference } from 'firebase-admin/firestore';
import { db } from '../firebaseAdmin';
import { unauthenticated, notFound, failedPrecondition, invalidArgument } from '../errors';
import type { RoomDocument } from './types';

export async function leaveRoomHandler(
  tx: Transaction,
  roomRef: DocumentReference,
  uid: string,
  now: () => Timestamp = Timestamp.now
): Promise<void> {
  const snapshot = await tx.get(roomRef);
  if (!snapshot.exists) {
    throw notFound();
  }
  const room = snapshot.data() as RoomDocument;
  if (room.phase !== 'lobby') {
    throw failedPrecondition('Nie można opuścić pokoju w trakcie rozgrywki.');
  }
  const remainingPlayers = room.players.filter((player) => player.id !== uid);
  if (remainingPlayers.length === room.players.length) {
    return;
  }
  if (remainingPlayers.length === 0) {
    tx.delete(roomRef);
    return;
  }
  const hostId = room.hostId === uid ? remainingPlayers[0].id : room.hostId;
  tx.update(roomRef, { players: remainingPlayers, hostId, updatedAt: now() });
}

export const leaveRoom = onCall<{ roomId: string }>(async (request) => {
  if (!request.auth) {
    throw unauthenticated();
  }
  const roomId = request.data?.roomId;
  if (typeof roomId !== 'string' || roomId.length === 0) {
    throw invalidArgument('Brak kodu pokoju.');
  }
  const roomRef = db.collection('rooms').doc(roomId);
  await db.runTransaction((tx) => leaveRoomHandler(tx, roomRef, request.auth!.uid));
});
