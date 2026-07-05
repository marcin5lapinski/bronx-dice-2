import { onCall } from 'firebase-functions/v2/https';
import { Timestamp, type Transaction, type DocumentReference } from 'firebase-admin/firestore';
import { db } from '../firebaseAdmin';
import { unauthenticated, notFound, failedPrecondition, permissionDenied, invalidArgument } from '../errors';
import { isInactive } from './presence';
import type { RoomDocument, RoomPlayer } from './types';

export async function returnToLobbyHandler(
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
  if (room.hostId !== uid) {
    throw permissionDenied('Tylko host może wrócić do pokoju.');
  }
  if (room.phase === 'playing') {
    const nowMs = now().toMillis();
    const others = (room.players as RoomPlayer[]).filter((player) => player.id !== room.hostId);
    if (!others.every((player) => isInactive(player, nowMs))) {
      throw failedPrecondition('Inni gracze są wciąż połączeni z pokojem.');
    }
  } else if (room.phase !== 'finished') {
    throw failedPrecondition('Nie można wrócić do pokoju w tym momencie.');
  }
  const timestamp = now();
  const lobbyRoom: RoomDocument = {
    phase: 'lobby',
    hostId: room.hostId,
    maxPlayers: room.maxPlayers,
    turnTimeLimitSeconds: room.turnTimeLimitSeconds,
    players: (room.players as RoomPlayer[]).map((player) => ({ ...player, ready: false })),
    createdAt: room.createdAt,
    updatedAt: timestamp,
  };
  tx.set(roomRef, lobbyRoom);
}

export const returnToLobby = onCall<{ roomId: string }>(async (request) => {
  if (!request.auth) {
    throw unauthenticated();
  }
  const roomId = request.data?.roomId;
  if (typeof roomId !== 'string' || roomId.length === 0) {
    throw invalidArgument('Brak kodu pokoju.');
  }
  const roomRef = db.collection('rooms').doc(roomId);
  await db.runTransaction((tx) => returnToLobbyHandler(tx, roomRef, request.auth!.uid));
});
