import { describe, it, expect, vi } from 'vitest';
import type { Firestore, Transaction, Timestamp } from 'firebase-admin/firestore';
import { createEmptyScoreCard, type GameState } from '@bronx-dice/game-engine';
import { recordGameResults } from './recordGameResults';

function fakeFirestore() {
  const doc = vi.fn((uid: string) => {
    const historyDocRef = { path: `users/${uid}/onlineGames/auto-id` };
    const historyCollection = { doc: vi.fn(() => historyDocRef) };
    return { path: `users/${uid}`, collection: vi.fn(() => historyCollection) };
  });
  const collection = vi.fn(() => ({ doc }));
  const firestore = { collection } as unknown as Firestore;
  return { firestore };
}

const fixedNow = () => ({ __ts: true }) as unknown as Timestamp;

function scoreCard(chance: number) {
  const card = createEmptyScoreCard();
  card.lower.chance = chance;
  return card;
}

function gameState(scores: Record<string, number>): GameState {
  const players = Object.keys(scores).map((id) => ({ id, name: id }));
  const scoreCards = Object.fromEntries(
    Object.entries(scores).map(([id, score]) => [id, scoreCard(score)])
  );
  return {
    players,
    scoreCards,
    dice: [],
    heldDice: [false, false, false, false, false],
    rollsLeft: 3,
    currentPlayerIndex: 0,
  };
}

describe('recordGameResults', () => {
  it('writes an incremented aggregate and a history entry for every player', () => {
    const { firestore } = fakeFirestore();
    const update = vi.fn();
    const set = vi.fn();
    const tx = { update, set } as unknown as Transaction;

    recordGameResults(tx, firestore, gameState({ 'uid-1': 100, 'uid-2': 60 }), fixedNow);

    expect(update).toHaveBeenCalledTimes(2);
    expect(set).toHaveBeenCalledTimes(2);

    const [winnerUserRef, winnerUpdate] = update.mock.calls[0];
    expect(winnerUserRef.path).toBe('users/uid-1');
    expect(winnerUpdate).toEqual({
      'onlineStats.gamesPlayed': expect.anything(),
      'onlineStats.wins': expect.anything(),
      'onlineStats.totalScore': expect.anything(),
    });

    const [, winnerHistory] = set.mock.calls[0];
    expect(winnerHistory).toEqual({ score: 100, won: true, playedAt: { __ts: true } });

    const [, loserHistory] = set.mock.calls[1];
    expect(loserHistory).toEqual({ score: 60, won: false, playedAt: { __ts: true } });
  });

  it('marks every tied top scorer as a winner', () => {
    const { firestore } = fakeFirestore();
    const update = vi.fn();
    const set = vi.fn();
    const tx = { update, set } as unknown as Transaction;

    recordGameResults(tx, firestore, gameState({ 'uid-1': 80, 'uid-2': 80 }), fixedNow);

    expect(set.mock.calls[0][1]).toEqual({ score: 80, won: true, playedAt: { __ts: true } });
    expect(set.mock.calls[1][1]).toEqual({ score: 80, won: true, playedAt: { __ts: true } });
  });
});
