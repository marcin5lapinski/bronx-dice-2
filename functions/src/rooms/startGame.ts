import { onCall } from 'firebase-functions/v2/https';
import { Timestamp, type Transaction, type DocumentReference } from 'firebase-admin/firestore';
import { createGameStateFromPlayers, MIN_PLAYERS } from '@bronx-dice/game-engine';
import { db } from '../firebaseAdmin';
import { unauthenticated, notFound, failedPrecondition, permissionDenied, invalidArgument } from '../errors';
import type { RoomDocument, RoomPlayer } from './types';

function applyPlayerOrder(players: RoomPlayer[], playerOrder?: string[]): RoomPlayer[] {
  if (!playerOrder) {
    return players;
  }
  const isValidPermutation =
    playerOrder.length === players.length &&
    new Set(playerOrder).size === players.length &&
    playerOrder.every((id) => players.some((player) => player.id === id));
  if (!isValidPermutation) {
    throw invalidArgument('Nieprawidłowa kolejność graczy.');
  }
  return playerOrder.map((id) => players.find((player) => player.id === id)!);
}

export async function startGameHandler(
  tx: Transaction,
  roomRef: DocumentReference,
  uid: string,
  playerOrder?: string[],
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
  const orderedPlayers = applyPlayerOrder(room.players, playerOrder);
  const gameState = createGameStateFromPlayers(orderedPlayers);
  const timestamp = now();
  tx.update(roomRef, {
    ...gameState,
    phase: 'playing',
    turnStartedAt: timestamp,
    updatedAt: timestamp,
  });
}

export const startGame = onCall<{ roomId: string; playerOrder?: string[] }>(async (request) => {
  if (!request.auth) {
    throw unauthenticated();
  }
  const roomId = request.data?.roomId;
  if (typeof roomId !== 'string' || roomId.length === 0) {
    throw invalidArgument('Brak kodu pokoju.');
  }
  const playerOrder = request.data?.playerOrder;
  if (
    playerOrder !== undefined &&
    (!Array.isArray(playerOrder) || !playerOrder.every((id) => typeof id === 'string'))
  ) {
    throw invalidArgument('Nieprawidłowa kolejność graczy.');
  }
  const roomRef = db.collection('rooms').doc(roomId);
  await db.runTransaction((tx) => startGameHandler(tx, roomRef, request.auth!.uid, playerOrder));
});
