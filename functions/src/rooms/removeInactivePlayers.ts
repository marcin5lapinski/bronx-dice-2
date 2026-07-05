import { onCall } from 'firebase-functions/v2/https';
import { Timestamp, type Transaction, type DocumentReference } from 'firebase-admin/firestore';
import { removePlayers } from '@bronx-dice/game-engine';
import { db } from '../firebaseAdmin';
import {
  unauthenticated,
  notFound,
  failedPrecondition,
  permissionDenied,
  invalidArgument,
} from '../errors';
import { isInactive } from './presence';
import type { RoomDocument, RoomPlayer } from './types';

export async function removeInactivePlayersHandler(
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
  if (room.hostId !== uid) {
    throw permissionDenied('Tylko host może usunąć nieaktywnych graczy.');
  }
  const nowMs = now().toMillis();
  const players = room.players as RoomPlayer[];
  const inactiveIds = players
    .filter((player) => player.id !== room.hostId && isInactive(player, nowMs))
    .map((player) => player.id);
  if (inactiveIds.length === 0) {
    throw failedPrecondition('Brak nieaktywnych graczy do usunięcia.');
  }
  const next = removePlayers(room, inactiveIds);
  const timestamp = now();
  tx.update(roomRef, {
    players: next.players,
    scoreCards: next.scoreCards,
    dice: next.dice,
    heldDice: next.heldDice,
    rollsLeft: next.rollsLeft,
    currentPlayerIndex: next.currentPlayerIndex,
    turnStartedAt: timestamp,
    updatedAt: timestamp,
  });
}

export const removeInactivePlayers = onCall<{ roomId: string }>(async (request) => {
  if (!request.auth) {
    throw unauthenticated();
  }
  const roomId = request.data?.roomId;
  if (typeof roomId !== 'string' || roomId.length === 0) {
    throw invalidArgument('Brak kodu pokoju.');
  }
  const roomRef = db.collection('rooms').doc(roomId);
  await db.runTransaction((tx) => removeInactivePlayersHandler(tx, roomRef, request.auth!.uid));
});
