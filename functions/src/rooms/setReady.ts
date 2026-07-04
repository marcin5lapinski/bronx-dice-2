import { onCall } from 'firebase-functions/v2/https';
import { Timestamp, type Transaction, type DocumentReference } from 'firebase-admin/firestore';
import { db } from '../firebaseAdmin';
import { unauthenticated, notFound, failedPrecondition, permissionDenied, invalidArgument } from '../errors';
import type { RoomDocument } from './types';

export async function setReadyHandler(
  tx: Transaction,
  roomRef: DocumentReference,
  uid: string,
  ready: boolean,
  now: () => Timestamp = Timestamp.now
): Promise<void> {
  const snapshot = await tx.get(roomRef);
  if (!snapshot.exists) {
    throw notFound();
  }
  const room = snapshot.data() as RoomDocument;
  if (room.phase !== 'lobby') {
    throw failedPrecondition('Nie można zmieniać gotowości po starcie gry.');
  }
  if (!room.players.some((player) => player.id === uid)) {
    throw permissionDenied('Nie jesteś graczem w tym pokoju.');
  }
  const players = room.players.map((player) =>
    player.id === uid ? { ...player, ready } : player
  );
  tx.update(roomRef, { players, updatedAt: now() });
}

export const setReady = onCall<{ roomId: string; ready: boolean }>(async (request) => {
  if (!request.auth) {
    throw unauthenticated();
  }
  const { roomId, ready } = request.data ?? {};
  if (typeof roomId !== 'string' || roomId.length === 0) {
    throw invalidArgument('Brak kodu pokoju.');
  }
  if (typeof ready !== 'boolean') {
    throw invalidArgument('Brak statusu gotowości.');
  }
  const roomRef = db.collection('rooms').doc(roomId);
  await db.runTransaction((tx) => setReadyHandler(tx, roomRef, request.auth!.uid, ready));
});
