import { onCall } from 'firebase-functions/v2/https';
import { Timestamp, type Transaction, type DocumentReference } from 'firebase-admin/firestore';
import { applyTimeoutScore, isGameOver } from '@bronx-dice/game-engine';
import { db } from '../firebaseAdmin';
import { recordGameResults } from '../stats/recordGameResults';
import { unauthenticated, notFound, failedPrecondition, permissionDenied, invalidArgument } from '../errors';
import type { RoomDocument } from './types';

export async function handleTurnTimeoutHandler(
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
  if (room.phase !== 'playing') {
    throw failedPrecondition('Gra nie jest w trakcie rozgrywki.');
  }
  if (!room.players.some((player) => player.id === uid)) {
    throw permissionDenied('Nie jesteś graczem w tym pokoju.');
  }
  const elapsedMs = now().toMillis() - room.turnStartedAt.toMillis();
  if (elapsedMs < room.turnTimeLimitSeconds * 1000) {
    throw failedPrecondition('Czas tury jeszcze nie upłynął.');
  }
  const next = applyTimeoutScore(room);
  const phase = isGameOver(next) ? 'finished' : 'playing';
  const timestamp = now();
  tx.update(roomRef, {
    scoreCards: next.scoreCards,
    dice: next.dice,
    heldDice: next.heldDice,
    rollsLeft: next.rollsLeft,
    currentPlayerIndex: next.currentPlayerIndex,
    phase,
    turnStartedAt: timestamp,
    updatedAt: timestamp,
  });
  if (phase === 'finished') {
    recordGameResults(tx, db, next, now);
  }
}

export const handleTurnTimeout = onCall<{ roomId: string }>(async (request) => {
  if (!request.auth) {
    throw unauthenticated();
  }
  const roomId = request.data?.roomId;
  if (typeof roomId !== 'string' || roomId.length === 0) {
    throw invalidArgument('Brak kodu pokoju.');
  }
  const roomRef = db.collection('rooms').doc(roomId);
  await db.runTransaction((tx) => handleTurnTimeoutHandler(tx, roomRef, request.auth!.uid));
});
