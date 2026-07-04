import { onCall } from 'firebase-functions/v2/https';
import { Timestamp, type Transaction, type DocumentReference } from 'firebase-admin/firestore';
import { toggleHeldDie as applyToggleHeldDie } from '@bronx-dice/game-engine';
import { db } from '../firebaseAdmin';
import { unauthenticated, notFound, failedPrecondition, permissionDenied, invalidArgument } from '../errors';
import type { RoomDocument } from './types';

export async function toggleHeldDieHandler(
  tx: Transaction,
  roomRef: DocumentReference,
  uid: string,
  dieIndex: number,
  now: () => Timestamp = Timestamp.now
): Promise<void> {
  const snapshot = await tx.get(roomRef);
  if (!snapshot.exists) {
    throw notFound();
  }
  const room = snapshot.data() as RoomDocument;
  if (room.phase !== 'playing') {
    throw failedPrecondition('Gra nie jest w trakcie rozgrywki.');
  }
  const currentPlayer = room.players[room.currentPlayerIndex];
  if (currentPlayer.id !== uid) {
    throw permissionDenied('To nie twoja tura.');
  }
  if (room.dice.length !== 5) {
    throw failedPrecondition('Musisz najpierw rzucić kośćmi.');
  }
  if (!Number.isInteger(dieIndex) || dieIndex < 0 || dieIndex > 4) {
    throw invalidArgument('Zły indeks kostki.');
  }
  const next = applyToggleHeldDie(room, dieIndex);
  tx.update(roomRef, { heldDice: next.heldDice, updatedAt: now() });
}

export const toggleHeldDie = onCall<{ roomId: string; dieIndex: number }>(async (request) => {
  if (!request.auth) {
    throw unauthenticated();
  }
  const { roomId, dieIndex } = request.data ?? {};
  if (typeof roomId !== 'string' || roomId.length === 0) {
    throw invalidArgument('Brak kodu pokoju.');
  }
  const roomRef = db.collection('rooms').doc(roomId);
  await db.runTransaction((tx) => toggleHeldDieHandler(tx, roomRef, request.auth!.uid, dieIndex));
});
