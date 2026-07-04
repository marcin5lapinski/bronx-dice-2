import { describe, it, expect } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { getProfileOrThrow } from './profiles';

function fakeDb(profile: Record<string, unknown> | null): Firestore {
  return {
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: profile !== null, data: () => profile }),
      }),
    }),
  } as unknown as Firestore;
}

describe('getProfileOrThrow', () => {
  it('returns displayName and avatarId from an existing profile', async () => {
    const db = fakeDb({
      displayName: 'Ola',
      avatarId: 'fox',
      email: 'ola@example.com',
      createdAt: {},
    });
    const profile = await getProfileOrThrow(db, 'uid-1');
    expect(profile).toEqual({ displayName: 'Ola', avatarId: 'fox' });
  });

  it('throws failed-precondition when the profile does not exist', async () => {
    const db = fakeDb(null);
    await expect(getProfileOrThrow(db, 'uid-1')).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });
});
