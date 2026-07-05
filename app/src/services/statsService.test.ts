import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordLocalGameResult, getStats } from './statsService';

const mockDoc = vi.fn();
const mockCollection = vi.fn();
const mockAddDoc = vi.fn();
const mockUpdateDoc = vi.fn();
const mockIncrement = vi.fn();
const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();
const mockQuery = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockTimestampNow = vi.fn();

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  collection: (...args: unknown[]) => mockCollection(...args),
  addDoc: (...args: unknown[]) => mockAddDoc(...args),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  increment: (...args: unknown[]) => mockIncrement(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  orderBy: (...args: unknown[]) => mockOrderBy(...args),
  limit: (...args: unknown[]) => mockLimit(...args),
  Timestamp: { now: () => mockTimestampNow() },
}));

vi.mock('../firebase/client', () => ({
  db: 'the-db-instance',
}));

describe('statsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockReturnValue('user-doc-ref');
    mockCollection.mockReturnValue('history-collection-ref');
    mockQuery.mockReturnValue('history-query');
    mockOrderBy.mockReturnValue('order-by-clause');
    mockLimit.mockReturnValue('limit-clause');
  });

  describe('recordLocalGameResult', () => {
    it('increments the aggregate local stats and appends a history entry', async () => {
      mockUpdateDoc.mockResolvedValue(undefined);
      mockAddDoc.mockResolvedValue(undefined);
      mockIncrement.mockImplementation((n: number) => ({ __increment: n }));
      mockTimestampNow.mockReturnValue('the-timestamp');

      await recordLocalGameResult('uid-1', { score: 120, won: true });

      expect(mockDoc).toHaveBeenCalledWith('the-db-instance', 'users', 'uid-1');
      expect(mockUpdateDoc).toHaveBeenCalledWith('user-doc-ref', {
        'localStats.gamesPlayed': { __increment: 1 },
        'localStats.wins': { __increment: 1 },
        'localStats.totalScore': { __increment: 120 },
      });
      expect(mockCollection).toHaveBeenCalledWith(
        'the-db-instance',
        'users',
        'uid-1',
        'localGames'
      );
      expect(mockAddDoc).toHaveBeenCalledWith('history-collection-ref', {
        score: 120,
        won: true,
        playedAt: 'the-timestamp',
      });
    });

    it('increments wins by zero for a loss', async () => {
      mockUpdateDoc.mockResolvedValue(undefined);
      mockAddDoc.mockResolvedValue(undefined);
      mockIncrement.mockImplementation((n: number) => ({ __increment: n }));
      mockTimestampNow.mockReturnValue('the-timestamp');

      await recordLocalGameResult('uid-1', { score: 40, won: false });

      expect(mockUpdateDoc).toHaveBeenCalledWith('user-doc-ref', {
        'localStats.gamesPlayed': { __increment: 1 },
        'localStats.wins': { __increment: 0 },
        'localStats.totalScore': { __increment: 40 },
      });
    });
  });

  describe('getStats', () => {
    it('reads aggregate stats and computes the average score', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          onlineStats: { gamesPlayed: 4, wins: 3, totalScore: 400 },
        }),
      });
      mockGetDocs.mockResolvedValue({ docs: [] });

      const result = await getStats('uid-1', 'online');

      expect(result.gamesPlayed).toBe(4);
      expect(result.wins).toBe(3);
      expect(result.averageScore).toBe(100);
      expect(mockCollection).toHaveBeenCalledWith(
        'the-db-instance',
        'users',
        'uid-1',
        'onlineGames'
      );
    });

    it('returns zeroed stats when the user has no recorded games yet', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => false, data: () => undefined });
      mockGetDocs.mockResolvedValue({ docs: [] });

      const result = await getStats('uid-1', 'local');

      expect(result).toEqual({ gamesPlayed: 0, wins: 0, averageScore: 0, history: [] });
    });

    it('maps history documents, converting playedAt to millis', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ localStats: { gamesPlayed: 1, wins: 1, totalScore: 100 } }),
      });
      const toMillis = vi.fn().mockReturnValue(1700000000000);
      mockGetDocs.mockResolvedValue({
        docs: [
          {
            id: 'game-1',
            data: () => ({ score: 100, won: true, playedAt: { toMillis } }),
          },
        ],
      });

      const result = await getStats('uid-1', 'local');

      expect(result.history).toEqual([
        { id: 'game-1', score: 100, won: true, playedAt: 1700000000000 },
      ]);
    });
  });
});
