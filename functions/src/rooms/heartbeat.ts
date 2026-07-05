import { onCall } from 'firebase-functions/v2/https';
import { Timestamp, type Transaction, type DocumentReference } from 'firebase-admin/firestore';
import { db } from '../firebaseAdmin';
import { unauthenticated, notFound, permissionDenied, invalidArgument } from '../errors';
import type { RoomDocument, RoomPlayer } from './types';

export async function heartbeatHandler(
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
  const index = room.players.findIndex((player) => player.id === uid);
  if (index === -1) {
    throw permissionDenied('Nie jesteś graczem w tym pokoju.');
  }
  const timestamp = now();
  const players = (room.players as RoomPlayer[]).map((player, i) =>
    i === index ? { ...player, lastActiveAt: timestamp } : player
  );
  tx.update(roomRef, { players, updatedAt: timestamp });
}

export const heartbeat = onCall<{ roomId: string }>(async (request) => {
  if (!request.auth) {
    throw unauthenticated();
  }
  const roomId = request.data?.roomId;
  if (typeof roomId !== 'string' || roomId.length === 0) {
    throw invalidArgument('Brak kodu pokoju.');
  }
  const roomRef = db.collection('rooms').doc(roomId);
  await db.runTransaction((tx) => heartbeatHandler(tx, roomRef, request.auth!.uid));
});
