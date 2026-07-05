import {
  doc,
  collection,
  addDoc,
  updateDoc,
  increment,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/client';

export type StatsMode = 'local' | 'online';

export interface GameResult {
  score: number;
  won: boolean;
}

export interface GameHistoryEntry {
  id: string;
  score: number;
  won: boolean;
  playedAt: number;
}

export interface GameStats {
  gamesPlayed: number;
  wins: number;
  averageScore: number;
  history: GameHistoryEntry[];
}

const HISTORY_LIMIT = 20;

function historyCollectionName(mode: StatsMode): 'localGames' | 'onlineGames' {
  return mode === 'local' ? 'localGames' : 'onlineGames';
}

function statsFieldPrefix(mode: StatsMode): 'localStats' | 'onlineStats' {
  return mode === 'local' ? 'localStats' : 'onlineStats';
}

export async function recordLocalGameResult(
  uid: string,
  result: GameResult
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    'localStats.gamesPlayed': increment(1),
    'localStats.wins': increment(result.won ? 1 : 0),
    'localStats.totalScore': increment(result.score),
  });
  await addDoc(collection(db, 'users', uid, 'localGames'), {
    score: result.score,
    won: result.won,
    playedAt: Timestamp.now(),
  });
}

export async function getStats(uid: string, mode: StatsMode): Promise<GameStats> {
  const userSnapshot = await getDoc(doc(db, 'users', uid));
  const data = userSnapshot.exists() ? userSnapshot.data() : undefined;
  const stats = data?.[statsFieldPrefix(mode)] as
    | { gamesPlayed?: number; wins?: number; totalScore?: number }
    | undefined;
  const gamesPlayed = stats?.gamesPlayed ?? 0;
  const wins = stats?.wins ?? 0;
  const totalScore = stats?.totalScore ?? 0;
  const averageScore = gamesPlayed > 0 ? totalScore / gamesPlayed : 0;

  const historyQuery = query(
    collection(db, 'users', uid, historyCollectionName(mode)),
    orderBy('playedAt', 'desc'),
    limit(HISTORY_LIMIT)
  );
  const historySnapshot = await getDocs(historyQuery);
  const history: GameHistoryEntry[] = historySnapshot.docs.map((docSnapshot) => {
    const entry = docSnapshot.data();
    return {
      id: docSnapshot.id,
      score: entry.score,
      won: entry.won,
      playedAt: (entry.playedAt as Timestamp).toMillis(),
    };
  });

  return { gamesPlayed, wins, averageScore, history };
}
