import { afterAll, beforeAll, describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'bronx-dice-rules-test',
    firestore: {
      rules: readFileSync('../firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('rooms/{roomId} security rules', () => {
  it('allows an authenticated user to read a room', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('rooms').doc('ABCDE').set({ phase: 'lobby' });
    });
    const alice = testEnv.authenticatedContext('alice');
    await assertSucceeds(alice.firestore().collection('rooms').doc('ABCDE').get());
  });

  it('denies an unauthenticated user from reading a room', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('rooms').doc('ABCDE').set({ phase: 'lobby' });
    });
    const anon = testEnv.unauthenticatedContext();
    await assertFails(anon.firestore().collection('rooms').doc('ABCDE').get());
  });

  it('denies any direct client write, even when authenticated', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(alice.firestore().collection('rooms').doc('ABCDE').set({ phase: 'lobby' }));
  });
});

describe('users/{uid}/localGames/{gameId} security rules', () => {
  it('allows the owning user to read and write their own local game history', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertSucceeds(
      alice
        .firestore()
        .collection('users/alice/localGames')
        .doc('game-1')
        .set({ score: 100, won: true })
    );
    await assertSucceeds(
      alice.firestore().collection('users/alice/localGames').doc('game-1').get()
    );
  });

  it("denies writing to another user's local game history", async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(
      alice
        .firestore()
        .collection('users/bob/localGames')
        .doc('game-1')
        .set({ score: 100, won: true })
    );
  });
});

describe('users/{uid}/onlineGames/{gameId} security rules', () => {
  it('allows the owning user to read their own online game history', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .collection('users/alice/onlineGames')
        .doc('game-1')
        .set({ score: 80, won: false });
    });
    const alice = testEnv.authenticatedContext('alice');
    await assertSucceeds(
      alice.firestore().collection('users/alice/onlineGames').doc('game-1').get()
    );
  });

  it('denies any direct client write, even by the owning user', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(
      alice
        .firestore()
        .collection('users/alice/onlineGames')
        .doc('game-1')
        .set({ score: 80, won: false })
    );
  });
});
