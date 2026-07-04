import { describe, it, expect } from 'vitest';
import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import { MIN_PLAYERS } from '@bronx-dice/game-engine';
import { createRoomHandler } from './createRoom';

function fakeDb(existingRoomIds: Set<string>) {
  const writes: Array<{ roomId: string; data: unknown }> = [];
  const firestore = {
    collection: () => ({
      doc: (roomId: string) => ({ id: roomId }),
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<boolean>) => {
      const tx = {
        get: async (ref: { id: string }) => ({
          exists: existingRoomIds.has(ref.id),
        }),
        set: (ref: { id: string }, data: unknown) => {
          writes.push({ roomId: ref.id, data });
          existingRoomIds.add(ref.id);
        },
      };
      return fn(tx);
    },
  };
  return { firestore: firestore as unknown as Firestore, writes };
}

function sequenceRandom(values: number[]): () => number {
  let call = 0;
  return () => values[call++ % values.length];
}

const profile = { displayName: 'Ola', avatarId: 'fox' };
const fixedNow = () => ({}) as unknown as Timestamp;

describe('createRoomHandler', () => {
  it('creates a lobby room with the host as the sole player', async () => {
    const { firestore, writes } = fakeDb(new Set());
    const roomId = await createRoomHandler(firestore, 'uid-1', profile, 3, () => 0, fixedNow);
    expect(roomId).toBe('AAAAA');
    expect(writes).toHaveLength(1);
    expect(writes[0].data).toMatchObject({
      phase: 'lobby',
      hostId: 'uid-1',
      maxPlayers: 3,
      players: [{ id: 'uid-1', name: 'Ola', avatarId: 'fox' }],
    });
  });

  it('retries with a new code when the first generated one is already taken', async () => {
    const { firestore, writes } = fakeDb(new Set(['AAAAA']));
    const random = sequenceRandom([0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5]);
    const roomId = await createRoomHandler(firestore, 'uid-1', profile, 2, random, fixedNow);
    expect(roomId).not.toBe('AAAAA');
    expect(writes).toHaveLength(1);
  });

  it('throws internal after exhausting all retry attempts', async () => {
    const { firestore } = fakeDb(new Set(['AAAAA']));
    await expect(
      createRoomHandler(firestore, 'uid-1', profile, 2, () => 0, fixedNow)
    ).rejects.toMatchObject({ code: 'internal' });
  });

  it('rejects maxPlayers below the minimum', async () => {
    const { firestore } = fakeDb(new Set());
    await expect(
      createRoomHandler(firestore, 'uid-1', profile, MIN_PLAYERS - 1, () => 0, fixedNow)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects maxPlayers above the maximum', async () => {
    const { firestore } = fakeDb(new Set());
    await expect(
      createRoomHandler(firestore, 'uid-1', profile, 7, () => 0, fixedNow)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
