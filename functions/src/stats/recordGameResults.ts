import { FieldValue, type Firestore, type Timestamp, type Transaction } from 'firebase-admin/firestore';
import { calculateTotal, getWinners, type GameState } from '@bronx-dice/game-engine';

export function recordGameResults(
  tx: Transaction,
  firestore: Firestore,
  gameState: GameState,
  now: () => Timestamp
): void {
  const winnerIds = new Set(getWinners(gameState).map((winner) => winner.id));
  const timestamp = now();

  for (const player of gameState.players) {
    const score = calculateTotal(gameState.scoreCards[player.id]);
    const won = winnerIds.has(player.id);
    const userRef = firestore.collection('users').doc(player.id);

    tx.update(userRef, {
      'onlineStats.gamesPlayed': FieldValue.increment(1),
      'onlineStats.wins': FieldValue.increment(won ? 1 : 0),
      'onlineStats.totalScore': FieldValue.increment(score),
    });
    tx.set(userRef.collection('onlineGames').doc(), {
      score,
      won,
      playedAt: timestamp,
    });
  }
}
