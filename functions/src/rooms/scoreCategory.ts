import { onCall } from 'firebase-functions/v2/https';
import { Timestamp, type Transaction, type DocumentReference } from 'firebase-admin/firestore';
import {
  applyScore,
  canScoreCategory,
  isGameOver,
  UPPER_CATEGORIES,
  LOWER_CATEGORIES,
  type ScoreCategory,
} from '@bronx-dice/game-engine';
import { db } from '../firebaseAdmin';
import { recordGameResults } from '../stats/recordGameResults';
import { unauthenticated, notFound, failedPrecondition, permissionDenied, invalidArgument } from '../errors';
import type { RoomDocument } from './types';

const ALL_CATEGORIES: string[] = [...UPPER_CATEGORIES, ...LOWER_CATEGORIES];

export async function scoreCategoryHandler(
  tx: Transaction,
  roomRef: DocumentReference,
  uid: string,
  category: ScoreCategory,
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
  const currentScoreCard = room.scoreCards[currentPlayer.id];
  if (!canScoreCategory(currentScoreCard, category)) {
    throw failedPrecondition('Nie można teraz zapisać tej kategorii.');
  }
  const next = applyScore(room, category);
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

export const scoreCategory = onCall<{ roomId: string; category: string }>(async (request) => {
  if (!request.auth) {
    throw unauthenticated();
  }
  const { roomId, category } = request.data ?? {};
  if (typeof roomId !== 'string' || roomId.length === 0) {
    throw invalidArgument('Brak kodu pokoju.');
  }
  if (typeof category !== 'string' || !ALL_CATEGORIES.includes(category)) {
    throw invalidArgument('Nieznana kategoria.');
  }
  const roomRef = db.collection('rooms').doc(roomId);
  await db.runTransaction((tx) =>
    scoreCategoryHandler(tx, roomRef, request.auth!.uid, category as ScoreCategory)
  );
});
