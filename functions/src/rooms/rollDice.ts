import { onCall } from 'firebase-functions/v2/https';
import { Timestamp, type Transaction, type DocumentReference } from 'firebase-admin/firestore';
import { rollInTurn } from '@bronx-dice/game-engine';
import { db } from '../firebaseAdmin';
import { unauthenticated, notFound, failedPrecondition, permissionDenied, invalidArgument } from '../errors';
import type { RoomDocument } from './types';

export async function rollDiceHandler(
  tx: Transaction,
  roomRef: DocumentReference,
  uid: string,
  random: () => number = Math.random,
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
  if (room.rollsLeft <= 0) {
    throw failedPrecondition('Nie masz już rzutów w tej turze.');
  }
  const next = rollInTurn(room, random);
  tx.update(roomRef, { dice: next.dice, rollsLeft: next.rollsLeft, updatedAt: now() });
}

export const rollDice = onCall<{ roomId: string }>(async (request) => {
  if (!request.auth) {
    throw unauthenticated();
  }
  const roomId = request.data?.roomId;
  if (typeof roomId !== 'string' || roomId.length === 0) {
    throw invalidArgument('Brak kodu pokoju.');
  }
  const roomRef = db.collection('rooms').doc(roomId);
  await db.runTransaction((tx) => rollDiceHandler(tx, roomRef, request.auth!.uid));
});
