import { onCall } from 'firebase-functions/v2/https';
import { Timestamp, type Transaction, type DocumentReference } from 'firebase-admin/firestore';
import { createGameStateFromPlayers, MIN_PLAYERS } from '@bronx-dice/game-engine';
import { db } from '../firebaseAdmin';
import { unauthenticated, notFound, failedPrecondition, permissionDenied, invalidArgument } from '../errors';
import type { RoomDocument } from './types';

export async function startGameHandler(
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
    throw failedPrecondition('Gra już wystartowała lub się zakończyła.');
  }
  if (room.hostId !== uid) {
    throw permissionDenied('Tylko host może rozpocząć grę.');
  }
  if (room.players.length < MIN_PLAYERS) {
    throw failedPrecondition(`Potrzeba co najmniej ${MIN_PLAYERS} graczy.`);
  }
  if (!room.players.every((player) => player.ready)) {
    throw failedPrecondition('Nie wszyscy gracze są gotowi.');
  }
  const gameState = createGameStateFromPlayers(room.players);
  const timestamp = now();
  tx.update(roomRef, {
    ...gameState,
    phase: 'playing',
    turnStartedAt: timestamp,
    updatedAt: timestamp,
  });
}

export const startGame = onCall<{ roomId: string }>(async (request) => {
  if (!request.auth) {
    throw unauthenticated();
  }
  const roomId = request.data?.roomId;
  if (typeof roomId !== 'string' || roomId.length === 0) {
    throw invalidArgument('Brak kodu pokoju.');
  }
  const roomRef = db.collection('rooms').doc(roomId);
  await db.runTransaction((tx) => startGameHandler(tx, roomRef, request.auth!.uid));
});
