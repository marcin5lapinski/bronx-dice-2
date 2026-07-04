import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/client';

export interface CreateRoomData {
  maxPlayers: number;
  turnTimeLimitSeconds: number;
}

export async function createRoom(data: CreateRoomData): Promise<string> {
  const call = httpsCallable<CreateRoomData, { roomId: string }>(functions, 'createRoom');
  const result = await call(data);
  return result.data.roomId;
}

export async function joinRoom(roomId: string): Promise<void> {
  const call = httpsCallable<{ roomId: string }, void>(functions, 'joinRoom');
  await call({ roomId });
}

export async function setReady(roomId: string, ready: boolean): Promise<void> {
  const call = httpsCallable<{ roomId: string; ready: boolean }, void>(functions, 'setReady');
  await call({ roomId, ready });
}

export async function startGame(roomId: string, playerOrder?: string[]): Promise<void> {
  const call = httpsCallable<{ roomId: string; playerOrder?: string[] }, void>(
    functions,
    'startGame'
  );
  await call({ roomId, playerOrder });
}

export async function rollDice(roomId: string): Promise<void> {
  const call = httpsCallable<{ roomId: string }, void>(functions, 'rollDice');
  await call({ roomId });
}

export async function toggleHeldDie(roomId: string, dieIndex: number): Promise<void> {
  const call = httpsCallable<{ roomId: string; dieIndex: number }, void>(
    functions,
    'toggleHeldDie'
  );
  await call({ roomId, dieIndex });
}

export async function scoreCategory(roomId: string, category: string): Promise<void> {
  const call = httpsCallable<{ roomId: string; category: string }, void>(
    functions,
    'scoreCategory'
  );
  await call({ roomId, category });
}

export async function leaveRoom(roomId: string): Promise<void> {
  const call = httpsCallable<{ roomId: string }, void>(functions, 'leaveRoom');
  await call({ roomId });
}

export async function handleTurnTimeout(roomId: string): Promise<void> {
  const call = httpsCallable<{ roomId: string }, void>(functions, 'handleTurnTimeout');
  await call({ roomId });
}
