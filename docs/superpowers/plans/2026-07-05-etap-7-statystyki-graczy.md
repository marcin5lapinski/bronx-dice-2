# Etap 7 — Statystyki graczy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track per-account game statistics (games played, wins, average score, recent history) separately for local hot-seat games and online games, viewable from a new "Statystyki" screen off the player profile.

**Architecture:** Local games are recorded client-side (best-effort, two plain Firestore writes) once `GameScreen` detects game-over for a tracked account slot. Online games are recorded server-side, inside the same Firestore transaction that flips a room to `'finished'` in `scoreCategory`/`handleTurnTimeout`, so the room state and the stats are atomically consistent. Both write to the same shape: an aggregate map on `users/{uid}` plus a bounded-by-query history subcollection.

**Tech Stack:** React 19 + TypeScript (Vite), Firebase (Firestore client SDK for local, Admin SDK/Cloud Functions for online), Vitest + Testing Library (`jsdom`), existing `@bronx-dice/game-engine` (`calculateTotal`, `getWinners` — no engine changes needed).

Source of truth: `docs/superpowers/specs/2026-07-05-etap-7-statystyki-graczy-design.md`.

## Global Constraints

- **Data shape (both local and online):** aggregate on `users/{uid}`: `localStats: { gamesPlayed, wins, totalScore }` / `onlineStats: { gamesPlayed, wins, totalScore }`; history in `users/{uid}/localGames/{gameId}` / `users/{uid}/onlineGames/{gameId}`, each `{ score: number, won: boolean, playedAt: Timestamp }`. No `playerCount`/`roomId` fields — nothing displays them.
- **History query:** `orderBy('playedAt', 'desc').limit(20)` — no TTL/cleanup, the collection can grow unbounded, only the display query is capped.
- **A tie counts as a win for every tied player** — matches `getWinners()`, which already returns all top scorers.
- **Only a genuine `'finished'` phase transition records a game.** `returnToLobby` (abort) never reaches `'finished'`, so aborted online games are never recorded. Locally, only reaching the `WinnerScreen` (i.e. `isGameOver`) records a result.
- **Local writes are best-effort and NOT transactional** (two separate Firestore calls) — a failed write must never disrupt gameplay or the winner screen. **Online writes ARE transactional** — recorded inside the same `db.runTransaction` that commits the room's `'finished'` phase.
- **Account-slot tracking for local games:** `StartScreen` captures the `id` of the row created at position 0 (`rows[0].id`, itself stable across player-count changes) once, in a ref that is never reset by later name edits or reordering. `onStart(playerNames, accountPlayerIndex)` receives the index that id ends up at in the (possibly shuffled) final array, or `null` if not logged in.
- **No engine changes.** `calculateTotal(scoreCard)` and `getWinners(state)` (both already in `@bronx-dice/game-engine`) are reused unmodified by both the client (local) and Cloud Functions (online) paths.
- **Firestore Security Rules:** `users/{uid}/localGames/{gameId}` — read/write only by `request.auth.uid == uid` (client-trusted, same posture as the rest of local mode). `users/{uid}/onlineGames/{gameId}` — read only by the owning uid, `write: if false` (Admin SDK bypasses rules, same posture as `rooms/{roomId}`).

---

### Task 1: Generify `shufflePlayerOrder` to work on any array, not just strings

**Files:**
- Modify: `app/src/utils/playerOrder.ts`
- Test: `app/src/utils/playerOrder.test.ts`

**Interfaces:**
- Produces: `shufflePlayerOrder<T>(items: T[], random?: () => number): T[]` — consumed by `StartScreen` (Task 2, shuffling `PlayerNameRow[]` instead of `string[]`) and unchanged by `RoomLobbyScreen.tsx` (still calls it with `string[]`, inferred `T = string`).

- [ ] **Step 1: Write the failing test**

Modify `app/src/utils/playerOrder.test.ts` — append at the end of the file:

```ts
describe('shufflePlayerOrder with row objects', () => {
  it('shuffles PlayerNameRow objects, keeping each id paired with its value', () => {
    const rows: PlayerNameRow[] = [
      { id: 'a', value: 'Ola' },
      { id: 'b', value: 'Kuba' },
      { id: 'c', value: 'Ala' },
      { id: 'd', value: 'Zosia' },
    ];
    const random = () => 0; // always picks index 0 as the swap target
    const result = shufflePlayerOrder(rows, random);
    // Same Fisher-Yates trace as the 4-item string test above, applied to rows:
    // i=3: swap(3,0) -> [d,b,c,a]
    // i=2: swap(2,0) -> [c,b,d,a]
    // i=1: swap(1,0) -> [b,c,d,a]
    expect(result.map((row) => row.id)).toEqual(['b', 'c', 'd', 'a']);
    expect(result.find((row) => row.id === 'a')!.value).toBe('Ola');
  });
});
```

- [ ] **Step 2: Run the tests to verify the new one fails**

```bash
cd app
npx vitest run src/utils/playerOrder.test.ts
```

Expected: FAIL — TypeScript error, `shufflePlayerOrder` is typed as `(names: string[], ...) => string[]`, doesn't accept `PlayerNameRow[]`.

- [ ] **Step 3: Generify `shufflePlayerOrder`**

Modify `app/src/utils/playerOrder.ts` — change:

```ts
export function shufflePlayerOrder(
  names: string[],
  random: () => number = Math.random
): string[] {
  const shuffled = [...names];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
```

to:

```ts
export function shufflePlayerOrder<T>(
  items: T[],
  random: () => number = Math.random
): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/utils/playerOrder.test.ts
```

Expected: PASS (all pre-existing tests plus the new one — existing `string[]` callers are unaffected since `T` is inferred).

- [ ] **Step 5: Verify the whole app workspace still builds**

```bash
npm run build
cd ..
```

Expected: succeeds — `RoomLobbyScreen.tsx`'s existing `shufflePlayerOrder(orderedIds)` call (on `string[]`) still type-checks with `T` inferred as `string`.

- [ ] **Step 6: Commit**

```bash
git add app/src/utils/playerOrder.ts app/src/utils/playerOrder.test.ts
git commit -m "Generify shufflePlayerOrder to shuffle any array, not just strings"
```

---

### Task 2: `StartScreen` tracks which player slot is the signed-in account

**Files:**
- Modify: `app/src/components/StartScreen.tsx`
- Modify: `app/src/components/StartScreen.test.tsx`

**Interfaces:**
- Consumes: `shufflePlayerOrder<T>` (Task 1, now shuffling `PlayerNameRow[]`).
- Produces: `StartScreenProps.onStart` signature changes to `(playerNames: string[], accountPlayerIndex: number | null) => void` — consumed by `App.tsx` (Task 4).

- [ ] **Step 1: Write the failing tests**

Modify `app/src/components/StartScreen.test.tsx` — change the `renderStartScreen` helper's prop type and the 4 existing assertions that check `onStart`'s call args, then add 3 new tests.

Change:

```ts
function renderStartScreen(
  props: { onStart?: (names: string[]) => void; onOpenAuth?: () => void } = {}
) {
```

to:

```ts
function renderStartScreen(
  props: {
    onStart?: (names: string[], accountPlayerIndex: number | null) => void;
    onOpenAuth?: () => void;
  } = {}
) {
```

Change the assertion in `'calls onStart with trimmed player names when clicked'`:

```ts
    expect(onStart).toHaveBeenCalledWith(['Ola', 'Kuba']);
```

to:

```ts
    expect(onStart).toHaveBeenCalledWith(['Ola', 'Kuba'], null);
```

Change the assertion in `'reorders rows and their labels when the underlying order changes'`:

```ts
    expect(onStart).toHaveBeenCalledWith(['Ola', 'Kuba', 'Ala']);
```

to:

```ts
    expect(onStart).toHaveBeenCalledWith(['Ola', 'Kuba', 'Ala'], null);
```

Change the assertion in `'shuffles the names before starting when "Losuj kolejność" is checked'`:

```ts
    expect(onStart).toHaveBeenCalledWith(['Kuba', 'Ola']);
```

to:

```ts
    expect(onStart).toHaveBeenCalledWith(['Kuba', 'Ola'], null);
```

Change the assertion in `'does not shuffle when "Losuj kolejność" is left unchecked'`:

```ts
    expect(onStart).toHaveBeenCalledWith(['Ola', 'Kuba']);
```

to:

```ts
    expect(onStart).toHaveBeenCalledWith(['Ola', 'Kuba'], null);
```

Append these 3 new tests at the end of the `describe('StartScreen', ...)` block, right before the final closing `});`:

```ts
  it("passes the signed-in player's row index as accountPlayerIndex", async () => {
    vi.mocked(subscribeToAuthState).mockImplementationOnce((callback) => {
      callback({ uid: 'uid-1' } as User);
      return () => {};
    });
    vi.mocked(getProfile).mockResolvedValueOnce({
      displayName: 'Ola Nick',
      avatarId: 'avatar01',
      email: 'ola@example.com',
      createdAt: 1700000000000,
    });

    const user = userEvent.setup();
    const onStart = vi.fn();
    renderStartScreen({ onStart });

    await waitFor(() =>
      expect(screen.getByLabelText('Gracz 1')).toHaveValue('Ola Nick')
    );
    await user.clear(screen.getByLabelText('Gracz 2'));
    await user.type(screen.getByLabelText('Gracz 2'), 'Kuba');
    await user.click(screen.getByRole('button', { name: 'Rozpocznij grę' }));

    expect(onStart).toHaveBeenCalledWith(['Ola Nick', 'Kuba'], 0);
  });

  it('keeps tracking the account row after it is manually renamed', async () => {
    vi.mocked(subscribeToAuthState).mockImplementationOnce((callback) => {
      callback({ uid: 'uid-1' } as User);
      return () => {};
    });
    vi.mocked(getProfile).mockResolvedValueOnce({
      displayName: 'Ola Nick',
      avatarId: 'avatar01',
      email: 'ola@example.com',
      createdAt: 1700000000000,
    });

    const user = userEvent.setup();
    const onStart = vi.fn();
    renderStartScreen({ onStart });

    await waitFor(() =>
      expect(screen.getByLabelText('Gracz 1')).toHaveValue('Ola Nick')
    );
    await user.clear(screen.getByLabelText('Gracz 1'));
    await user.type(screen.getByLabelText('Gracz 1'), 'Pseudonim');
    await user.clear(screen.getByLabelText('Gracz 2'));
    await user.type(screen.getByLabelText('Gracz 2'), 'Kuba');
    await user.click(screen.getByRole('button', { name: 'Rozpocznij grę' }));

    expect(onStart).toHaveBeenCalledWith(['Pseudonim', 'Kuba'], 0);
  });

  it('keeps tracking the account row through "Losuj kolejność"', async () => {
    vi.mocked(subscribeToAuthState).mockImplementationOnce((callback) => {
      callback({ uid: 'uid-1' } as User);
      return () => {};
    });
    vi.mocked(getProfile).mockResolvedValueOnce({
      displayName: 'Ola Nick',
      avatarId: 'avatar01',
      email: 'ola@example.com',
      createdAt: 1700000000000,
    });

    const user = userEvent.setup();
    const onStart = vi.fn();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    renderStartScreen({ onStart });

    await waitFor(() =>
      expect(screen.getByLabelText('Gracz 1')).toHaveValue('Ola Nick')
    );
    await user.clear(screen.getByLabelText('Gracz 2'));
    await user.type(screen.getByLabelText('Gracz 2'), 'Kuba');
    await user.click(screen.getByLabelText('Losuj kolejność'));
    await user.click(screen.getByRole('button', { name: 'Rozpocznij grę' }));

    // Fisher-Yates on 2 items with random()=0: i=1, j=0, swap(1,0) -> ['Kuba', 'Ola Nick']
    expect(onStart).toHaveBeenCalledWith(['Kuba', 'Ola Nick'], 1);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd app
npx vitest run src/components/StartScreen.test.tsx
```

Expected: FAIL — `onStart` is currently called with a single argument, and there is no account-tracking logic yet.

- [ ] **Step 3: Implement account-row tracking in `StartScreen`**

Modify `app/src/components/StartScreen.tsx` — change the props interface:

```ts
interface StartScreenProps {
  onStart: (playerNames: string[]) => void;
  onOpenAuth: () => void;
  onOpenProfile: () => void;
}
```

to:

```ts
interface StartScreenProps {
  onStart: (playerNames: string[], accountPlayerIndex: number | null) => void;
  onOpenAuth: () => void;
  onOpenProfile: () => void;
}
```

Add a new ref right after the existing `syncedRowId` ref declaration:

```ts
  const syncedRowId = useRef<string | null>(rows[0].id);
```

becomes:

```ts
  const syncedRowId = useRef<string | null>(rows[0].id);
  // Stable identity of "your" player slot (row 0 at mount) for local-game
  // stats attribution. Unlike syncedRowId, this is never cleared by editing
  // the name and survives drag-reordering/shuffling, since row 0's `id`
  // itself never changes (handlePlayerCountChange always reuses it).
  const accountRowId = useRef(rows[0].id);
```

Replace `handleStart`:

```ts
  const handleStart = () => {
    const finalNames = randomizeOrder
      ? shufflePlayerOrder(trimmedNames)
      : trimmedNames;
    onStart(finalNames);
  };
```

with:

```ts
  const handleStart = () => {
    const orderedRows = randomizeOrder
      ? shufflePlayerOrder(visibleRows)
      : visibleRows;
    const finalNames = orderedRows.map((row) => row.value.trim());
    const accountPlayerIndex = user
      ? orderedRows.findIndex((row) => row.id === accountRowId.current)
      : -1;
    onStart(finalNames, accountPlayerIndex === -1 ? null : accountPlayerIndex);
  };
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/components/StartScreen.test.tsx
```

Expected: PASS (all pre-existing tests plus the 3 new ones).

- [ ] **Step 5: Commit**

```bash
cd ..
git add app/src/components/StartScreen.tsx app/src/components/StartScreen.test.tsx
git commit -m "Track which StartScreen player slot is the signed-in account"
```

---

### Task 3: `statsService.ts` — client-side read/write for local stats

**Files:**
- Create: `app/src/services/statsService.ts`
- Test: `app/src/services/statsService.test.ts`

**Interfaces:**
- Produces: `recordLocalGameResult(uid: string, result: { score: number; won: boolean }): Promise<void>`, `getStats(uid: string, mode: 'local' | 'online'): Promise<GameStats>`, `type GameStats = { gamesPlayed: number; wins: number; averageScore: number; history: GameHistoryEntry[] }`, `type GameHistoryEntry = { id: string; score: number; won: boolean; playedAt: number }` — `recordLocalGameResult` consumed by `GameScreen` (Task 4), `getStats` consumed by `StatsScreen` (Task 8).

- [ ] **Step 1: Write the failing tests**

Create `app/src/services/statsService.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd app
npx vitest run src/services/statsService.test.ts
```

Expected: FAIL — `Cannot find module './statsService'`.

- [ ] **Step 3: Implement `statsService.ts`**

Create `app/src/services/statsService.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/services/statsService.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Verify the whole app workspace still builds**

```bash
npm run build
cd ..
```

- [ ] **Step 6: Commit**

```bash
git add app/src/services/statsService.ts app/src/services/statsService.test.ts
git commit -m "Add statsService for recording and reading local/online game stats"
```

---

### Task 4: `GameScreen`/`App.tsx` — record a local game's result on game-over

**Files:**
- Modify: `app/src/components/GameScreen.tsx`
- Modify: `app/src/components/GameScreen.test.tsx`
- Modify: `app/src/App.tsx`

**Interfaces:**
- Consumes: `recordLocalGameResult` (Task 3), `calculateTotal`/`getWinners` (`@bronx-dice/game-engine`, pre-existing), `useAuth` (`../contexts/AuthContext`, pre-existing), `accountPlayerIndex` from `StartScreen.onStart` (Task 2).
- Produces: `GameScreenProps.accountPlayerIndex: number | null` (required prop) — `App.tsx` now threads it from `StartScreen.onStart` through `Screen`'s `'local-game'` variant.

- [ ] **Step 1: Write the failing tests**

Modify `app/src/components/GameScreen.test.tsx` — replace the full contents:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from 'firebase/auth';
import { UPPER_CATEGORIES, LOWER_CATEGORIES } from '@bronx-dice/game-engine';
import GameScreen from './GameScreen';
import { useAuth } from '../contexts/AuthContext';
import { recordLocalGameResult } from '../services/statsService';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../services/statsService', () => ({
  recordLocalGameResult: vi.fn(),
}));

async function playSoloGameToCompletion() {
  const totalCategories = UPPER_CATEGORIES.length + LOWER_CATEGORIES.length;
  for (let turn = 0; turn < totalCategories; turn++) {
    fireEvent.click(screen.getByRole('button', { name: 'Rzuć kośćmi' }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const scoreButtons = document.querySelectorAll('.score-board tbody button');
    fireEvent.click(scoreButtons[0]);
  }
}

describe('GameScreen', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      profile: null,
      loading: false,
      refreshProfile: vi.fn(),
    });
    vi.mocked(recordLocalGameResult).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('rolls dice and displays the results when the roll button is clicked', async () => {
    const user = userEvent.setup();
    vi.spyOn(Math, 'random').mockReturnValue(0); // every die shows 1
    render(
      <GameScreen
        playerNames={['Ola', 'Kuba']}
        accountPlayerIndex={null}
        onPlayAgain={() => {}}
        onExit={() => {}}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Rzuć kośćmi' }));

    expect(screen.getByText('Pozostałe rzuty: 2')).toBeInTheDocument();
    // The real result is masked behind a placeholder face while the dice
    // are mid-animation...
    expect(screen.getAllByRole('button', { name: '5' })).toHaveLength(5);

    // ...and revealed once the roll animation settles.
    await waitFor(
      () =>
        expect(screen.getAllByRole('button', { name: '1' })).toHaveLength(5),
      { timeout: 2000 }
    );
  });

  it('hides the score board preview while the roll animation is in progress', async () => {
    const user = userEvent.setup();
    vi.spyOn(Math, 'random').mockReturnValue(0); // every die = 1 -> aces score = 5
    render(
      <GameScreen
        playerNames={['Ola', 'Kuba']}
        accountPlayerIndex={null}
        onPlayAgain={() => {}}
        onExit={() => {}}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Rzuć kośćmi' }));

    const row = screen.getByText('Jedynki').closest('tr')!;
    expect(row.querySelector('button')).not.toBeInTheDocument();
  });

  it('scoring a category records it on the board and advances to the next player', async () => {
    const user = userEvent.setup();
    vi.spyOn(Math, 'random').mockReturnValue(0); // every die = 1 -> aces score = 5
    render(
      <GameScreen
        playerNames={['Ola', 'Kuba']}
        accountPlayerIndex={null}
        onPlayAgain={() => {}}
        onExit={() => {}}
      />
    );

    expect(screen.getByText('Tura: Ola')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Rzuć kośćmi' }));
    const row = screen.getByText('Jedynki').closest('tr')!;
    await waitFor(
      () => expect(row.querySelector('button')).toBeInTheDocument(),
      { timeout: 2000 }
    );
    await user.click(row.querySelector('button')!);

    expect(row).toHaveTextContent('5');
    expect(screen.getByText('Tura: Kuba')).toBeInTheDocument();
  });

  it('calls onExit after confirming when the exit button is clicked', async () => {
    const user = userEvent.setup();
    const onExit = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <GameScreen
        playerNames={['Ola', 'Kuba']}
        accountPlayerIndex={null}
        onPlayAgain={() => {}}
        onExit={onExit}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Wyjdź z gry' }));

    expect(window.confirm).toHaveBeenCalled();
    expect(onExit).toHaveBeenCalled();
  });

  it('does not call onExit when the exit confirmation is declined', async () => {
    const user = userEvent.setup();
    const onExit = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <GameScreen
        playerNames={['Ola', 'Kuba']}
        accountPlayerIndex={null}
        onPlayAgain={() => {}}
        onExit={onExit}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Wyjdź z gry' }));

    expect(onExit).not.toHaveBeenCalled();
  });

  it("records the account player's result once the game ends, when logged in with a tracked slot", () => {
    vi.useFakeTimers();
    vi.mocked(useAuth).mockReturnValue({
      user: { uid: 'uid-1' } as User,
      profile: null,
      loading: false,
      refreshProfile: vi.fn(),
    });
    vi.spyOn(Math, 'random').mockReturnValue(0);

    render(
      <GameScreen
        playerNames={['Ola']}
        accountPlayerIndex={0}
        onPlayAgain={() => {}}
        onExit={() => {}}
      />
    );

    playSoloGameToCompletion();

    expect(recordLocalGameResult).toHaveBeenCalledTimes(1);
    expect(recordLocalGameResult).toHaveBeenCalledWith(
      'uid-1',
      expect.objectContaining({ won: true })
    );
  });

  it('does not record a result when accountPlayerIndex is null', () => {
    vi.useFakeTimers();
    vi.mocked(useAuth).mockReturnValue({
      user: { uid: 'uid-1' } as User,
      profile: null,
      loading: false,
      refreshProfile: vi.fn(),
    });
    vi.spyOn(Math, 'random').mockReturnValue(0);

    render(
      <GameScreen
        playerNames={['Ola']}
        accountPlayerIndex={null}
        onPlayAgain={() => {}}
        onExit={() => {}}
      />
    );

    playSoloGameToCompletion();

    expect(recordLocalGameResult).not.toHaveBeenCalled();
  });

  it('does not record a result when signed out, even with a tracked slot', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);

    render(
      <GameScreen
        playerNames={['Ola']}
        accountPlayerIndex={0}
        onPlayAgain={() => {}}
        onExit={() => {}}
      />
    );

    playSoloGameToCompletion();

    expect(recordLocalGameResult).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

```bash
cd app
npx vitest run src/components/GameScreen.test.tsx
```

Expected: FAIL — `accountPlayerIndex` isn't a known prop yet, `useAuth`/`recordLocalGameResult` are never called.

- [ ] **Step 3: Implement result-recording in `GameScreen`**

Modify `app/src/components/GameScreen.tsx` — replace the full contents:

```tsx
import { useEffect, useRef, useState } from 'react';
import {
  createGameState,
  rollInTurn,
  toggleHeldDie,
  applyScore,
  isGameOver,
  getWinners,
  calculateTotal,
  type GameState,
  type ScoreCategory,
} from '@bronx-dice/game-engine';
import DiceTray, { ROLL_ANIMATION_MS } from './DiceTray';
import RollButton from './RollButton';
import ScoreBoard from './ScoreBoard';
import WinnerScreen from './WinnerScreen';
import { useAuth } from '../contexts/AuthContext';
import { recordLocalGameResult } from '../services/statsService';

interface GameScreenProps {
  playerNames: string[];
  accountPlayerIndex: number | null;
  onPlayAgain: () => void;
  onExit: () => void;
}

function GameScreen({
  playerNames,
  accountPlayerIndex,
  onPlayAgain,
  onExit,
}: GameScreenProps) {
  const { user } = useAuth();
  const [state, setState] = useState<GameState>(() =>
    createGameState(playerNames)
  );
  // While true, the dice are still mid-animation: ScoreBoard's clickable
  // score previews are hidden so the player can't read the roll's outcome
  // in the table before the dice visually settle.
  const [isRolling, setIsRolling] = useState(false);
  const resultRecorded = useRef(false);

  useEffect(() => {
    if (!isRolling) {
      return;
    }
    const timer = setTimeout(() => setIsRolling(false), ROLL_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [isRolling]);

  // Records the tracked account slot's result exactly once, the first time
  // the game ends. Best-effort: a failed write must never disrupt the
  // winner screen. Guarded by a ref (not just the isGameOver check) so
  // StrictMode's double-invoked effects in dev can't record it twice.
  useEffect(() => {
    if (!isGameOver(state) || resultRecorded.current) {
      return;
    }
    resultRecorded.current = true;
    if (accountPlayerIndex === null || !user) {
      return;
    }
    const player = state.players[accountPlayerIndex];
    const score = calculateTotal(state.scoreCards[player.id]);
    const won = getWinners(state).some((winner) => winner.id === player.id);
    recordLocalGameResult(user.uid, { score, won }).catch(() => {
      // Best-effort — a failed write must never disrupt the winner screen.
    });
  }, [state, accountPlayerIndex, user]);

  if (isGameOver(state)) {
    return (
      <WinnerScreen
        winners={getWinners(state)}
        players={state.players}
        scoreCards={state.scoreCards}
        onPlayAgain={onPlayAgain}
      />
    );
  }

  const currentPlayer = state.players[state.currentPlayerIndex];

  const handleExit = () => {
    if (window.confirm('Czy na pewno chcesz zakończyć grę?')) {
      onExit();
    }
  };

  return (
    <div className="game-screen">
      <button type="button" className="back-button" onClick={handleExit}>
        Wyjdź z gry
      </button>
      <h2>Tura: {currentPlayer.name}</h2>
      <DiceTray
        dice={state.dice}
        heldDice={state.heldDice}
        onToggleHeld={(index) =>
          setState((current) => toggleHeldDie(current, index))
        }
      />
      <RollButton
        rollsLeft={state.rollsLeft}
        onRoll={() => {
          setState((current) => rollInTurn(current));
          setIsRolling(true);
        }}
      />
      <ScoreBoard
        players={state.players}
        scoreCards={state.scoreCards}
        currentPlayerId={currentPlayer.id}
        dice={isRolling ? [] : state.dice}
        rollsLeft={state.rollsLeft}
        onScore={(category: ScoreCategory) =>
          setState((current) => applyScore(current, category))
        }
      />
    </div>
  );
}

export default GameScreen;
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/components/GameScreen.test.tsx
```

Expected: PASS (8 tests).

- [ ] **Step 5: Wire `accountPlayerIndex` through `App.tsx`**

Modify `app/src/App.tsx` — change the `Screen` union member:

```ts
  | { kind: 'local-game'; playerNames: string[] }
```

to:

```ts
  | { kind: 'local-game'; playerNames: string[]; accountPlayerIndex: number | null }
```

Change the `'local-game'` render branch:

```tsx
  if (screen.kind === 'local-game') {
    return (
      <GameScreen
        playerNames={screen.playerNames}
        onPlayAgain={() => setScreen({ kind: 'local-start' })}
        onExit={() => setScreen({ kind: 'local-start' })}
      />
    );
  }
```

to:

```tsx
  if (screen.kind === 'local-game') {
    return (
      <GameScreen
        playerNames={screen.playerNames}
        accountPlayerIndex={screen.accountPlayerIndex}
        onPlayAgain={() => setScreen({ kind: 'local-start' })}
        onExit={() => setScreen({ kind: 'local-start' })}
      />
    );
  }
```

Change the `StartScreen` render at the bottom of the file:

```tsx
  return (
    <StartScreen
      onStart={(playerNames) => setScreen({ kind: 'local-game', playerNames })}
      onOpenAuth={() => setScreen({ kind: 'auth-gate', authScreen: 'login' })}
      onOpenProfile={() => setScreen({ kind: 'profile' })}
    />
  );
```

to:

```tsx
  return (
    <StartScreen
      onStart={(playerNames, accountPlayerIndex) =>
        setScreen({ kind: 'local-game', playerNames, accountPlayerIndex })
      }
      onOpenAuth={() => setScreen({ kind: 'auth-gate', authScreen: 'login' })}
      onOpenProfile={() => setScreen({ kind: 'profile' })}
    />
  );
```

- [ ] **Step 6: Run the full app test suite and build**

```bash
npx vitest run
npm run build
cd ..
```

Expected: all tests pass (App.tsx's existing "starts the game..." test is unaffected — it doesn't inspect `onStart`'s raw arguments), build succeeds.

- [ ] **Step 7: Commit**

```bash
git add app/src/components/GameScreen.tsx app/src/components/GameScreen.test.tsx app/src/App.tsx
git commit -m "Record local game results for the tracked account slot on game-over"
```

---

### Task 5: `functions/src/stats/recordGameResults.ts` — transactional stats write for online games

**Files:**
- Create: `functions/src/stats/recordGameResults.ts`
- Test: `functions/src/stats/recordGameResults.test.ts`

**Interfaces:**
- Consumes: `calculateTotal`, `getWinners`, `type GameState` (`@bronx-dice/game-engine`, pre-existing).
- Produces: `recordGameResults(tx: Transaction, firestore: Firestore, gameState: GameState, now: () => Timestamp): void` — consumed by `scoreCategoryHandler`/`handleTurnTimeoutHandler` (Task 6). Takes `firestore` as an explicit parameter (not imported directly) so it stays unit-testable with a fake, matching the existing `createRoomHandler(firestore, ...)` pattern in `functions/src/rooms/createRoom.ts`.

- [ ] **Step 1: Write the failing tests**

Create `functions/src/stats/recordGameResults.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd functions
npx vitest run src/stats/recordGameResults.test.ts
```

Expected: FAIL — `Cannot find module './recordGameResults'`.

- [ ] **Step 3: Implement `recordGameResults`**

Create `functions/src/stats/recordGameResults.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/stats/recordGameResults.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Verify the whole functions package still builds**

```bash
npm run build
cd ..
```

- [ ] **Step 6: Commit**

```bash
git add functions/src/stats/recordGameResults.ts functions/src/stats/recordGameResults.test.ts
git commit -m "Add recordGameResults for transactionally recording online game stats"
```

---

### Task 6: Wire `recordGameResults` into `scoreCategory` and `handleTurnTimeout`

**Files:**
- Modify: `functions/src/rooms/scoreCategory.ts`
- Modify: `functions/src/rooms/scoreCategory.test.ts`
- Modify: `functions/src/rooms/handleTurnTimeout.ts`
- Modify: `functions/src/rooms/handleTurnTimeout.test.ts`

**Interfaces:**
- Consumes: `recordGameResults` (Task 5).
- Produces: nothing new — both handlers now record stats as a side effect whenever they transition a room's `phase` to `'finished'`, inside the same transaction.

- [ ] **Step 1: Write the failing test for `scoreCategory`**

Modify `functions/src/rooms/scoreCategory.test.ts` — change the `fakeTransaction` helper to also expose a `set` spy:

```ts
function fakeTransaction(room: RoomDocument | null) {
  const update = vi.fn();
  const tx = {
    get: async () => ({ exists: room !== null, data: () => room }),
    update,
  };
  return { tx: tx as unknown as Transaction, update };
}
```

to:

```ts
function fakeTransaction(room: RoomDocument | null) {
  const update = vi.fn();
  const set = vi.fn();
  const tx = {
    get: async () => ({ exists: room !== null, data: () => room }),
    update,
    set,
  };
  return { tx: tx as unknown as Transaction, update, set };
}
```

Change the `'sets phase to finished when scoring completes the last open category'` test:

```ts
    const { tx, update } = fakeTransaction(room);
    await scoreCategoryHandler(tx, roomRef, 'uid-1', 'chance', fixedNow);
    const [, patch] = update.mock.calls[0];
    expect(patch.scoreCards['uid-1'].lower.chance).toBe(5);
    expect(patch.phase).toBe('finished');
  });
```

to:

```ts
    const { tx, update, set } = fakeTransaction(room);
    await scoreCategoryHandler(tx, roomRef, 'uid-1', 'chance', fixedNow);
    const [, patch] = update.mock.calls[0];
    expect(patch.scoreCards['uid-1'].lower.chance).toBe(5);
    expect(patch.phase).toBe('finished');

    // Stats are recorded for every player once the game finishes: the room
    // update stays first (existing assertions above index into it), then
    // one aggregate update + one history write per player.
    expect(update).toHaveBeenCalledTimes(3);
    expect(set).toHaveBeenCalledTimes(2);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd functions
npx vitest run src/rooms/scoreCategory.test.ts
```

Expected: FAIL — `update`/`set` call counts are `1`/`0`, no stats are recorded yet.

- [ ] **Step 3: Wire `recordGameResults` into `scoreCategoryHandler`**

Modify `functions/src/rooms/scoreCategory.ts` — add the import:

```ts
import { db } from '../firebaseAdmin';
```

to:

```ts
import { db } from '../firebaseAdmin';
import { recordGameResults } from '../stats/recordGameResults';
```

Change the end of `scoreCategoryHandler`:

```ts
  const next = applyScore(room, category);
  const phase = isGameOver(next) ? 'finished' : 'playing';
  const timestamp = now();
  tx.update(roomRef, {
    scoreCards: next.scoreCards,
    dice: next.dice,
    heldDice: next.heldDice,
    rollsLeft: next.rollsLeft,
    currentPlayerIndex: next.currentPlayerIndex,
    phase,
    turnStartedAt: timestamp,
    updatedAt: timestamp,
  });
}
```

to:

```ts
  const next = applyScore(room, category);
  const phase = isGameOver(next) ? 'finished' : 'playing';
  const timestamp = now();
  tx.update(roomRef, {
    scoreCards: next.scoreCards,
    dice: next.dice,
    heldDice: next.heldDice,
    rollsLeft: next.rollsLeft,
    currentPlayerIndex: next.currentPlayerIndex,
    phase,
    turnStartedAt: timestamp,
    updatedAt: timestamp,
  });
  if (phase === 'finished') {
    recordGameResults(tx, db, next, now);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/rooms/scoreCategory.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 5: Write the failing test for `handleTurnTimeout`**

Modify `functions/src/rooms/handleTurnTimeout.test.ts` — apply the identical `fakeTransaction` change as Step 1 above:

```ts
function fakeTransaction(room: RoomDocument | null) {
  const update = vi.fn();
  const tx = {
    get: async () => ({ exists: room !== null, data: () => room }),
    update,
  };
  return { tx: tx as unknown as Transaction, update };
}
```

to:

```ts
function fakeTransaction(room: RoomDocument | null) {
  const update = vi.fn();
  const set = vi.fn();
  const tx = {
    get: async () => ({ exists: room !== null, data: () => room }),
    update,
    set,
  };
  return { tx: tx as unknown as Transaction, update, set };
}
```

Change the `'sets phase to finished when the zero-fill completes the last category'` test:

```ts
    const { tx, update } = fakeTransaction(room);
    await handleTurnTimeoutHandler(tx, roomRef, 'uid-1', fixedNow(15_000));
    const [, patch] = update.mock.calls[0];
    expect(patch.scoreCards['uid-1'].lower.chance).toBe(0);
    expect(patch.phase).toBe('finished');
  });
```

to:

```ts
    const { tx, update, set } = fakeTransaction(room);
    await handleTurnTimeoutHandler(tx, roomRef, 'uid-1', fixedNow(15_000));
    const [, patch] = update.mock.calls[0];
    expect(patch.scoreCards['uid-1'].lower.chance).toBe(0);
    expect(patch.phase).toBe('finished');

    expect(update).toHaveBeenCalledTimes(3);
    expect(set).toHaveBeenCalledTimes(2);
  });
```

- [ ] **Step 6: Run the test to verify it fails**

```bash
npx vitest run src/rooms/handleTurnTimeout.test.ts
```

Expected: FAIL — `update`/`set` call counts are `1`/`0`.

- [ ] **Step 7: Wire `recordGameResults` into `handleTurnTimeoutHandler`**

Modify `functions/src/rooms/handleTurnTimeout.ts` — add the import:

```ts
import { db } from '../firebaseAdmin';
```

to:

```ts
import { db } from '../firebaseAdmin';
import { recordGameResults } from '../stats/recordGameResults';
```

Change the end of `handleTurnTimeoutHandler`:

```ts
  const next = applyTimeoutScore(room);
  const phase = isGameOver(next) ? 'finished' : 'playing';
  const timestamp = now();
  tx.update(roomRef, {
    scoreCards: next.scoreCards,
    dice: next.dice,
    heldDice: next.heldDice,
    rollsLeft: next.rollsLeft,
    currentPlayerIndex: next.currentPlayerIndex,
    phase,
    turnStartedAt: timestamp,
    updatedAt: timestamp,
  });
}
```

to:

```ts
  const next = applyTimeoutScore(room);
  const phase = isGameOver(next) ? 'finished' : 'playing';
  const timestamp = now();
  tx.update(roomRef, {
    scoreCards: next.scoreCards,
    dice: next.dice,
    heldDice: next.heldDice,
    rollsLeft: next.rollsLeft,
    currentPlayerIndex: next.currentPlayerIndex,
    phase,
    turnStartedAt: timestamp,
    updatedAt: timestamp,
  });
  if (phase === 'finished') {
    recordGameResults(tx, db, next, now);
  }
}
```

- [ ] **Step 8: Run the test to verify it passes**

```bash
npx vitest run src/rooms/handleTurnTimeout.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 9: Verify the whole functions package builds, lints, and passes**

```bash
npm run build
npm run lint
npm test
cd ..
```

- [ ] **Step 10: Commit**

```bash
git add functions/src/rooms/scoreCategory.ts functions/src/rooms/scoreCategory.test.ts functions/src/rooms/handleTurnTimeout.ts functions/src/rooms/handleTurnTimeout.test.ts
git commit -m "Record online game stats when scoreCategory/handleTurnTimeout finish a game"
```

---

### Task 7: Firestore Security Rules for the new stats subcollections

**Files:**
- Modify: `firestore.rules`
- Modify: `app/src/firebase/firestoreRules.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by other tasks — this is a leaf task, but must land before shipping since it's the only thing standing between the client and a real Firestore project.

This task's test **requires the Firestore emulator**, exactly like the existing `rooms/{roomId}` rules tests in this file — it is run via `npm run test:rules` from the repo root (which wraps `firebase emulators:exec --only firestore "..."`), not by plain `npx vitest run`.

- [ ] **Step 1: Write the failing tests**

Modify `app/src/firebase/firestoreRules.test.ts` — append at the end of the file, after the existing `describe('rooms/{roomId} security rules', ...)` block:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail (requires the emulator)**

```bash
npm run test:rules
```

Expected: FAIL — the current `firestore.rules` has no `localGames`/`onlineGames` rules, so both `assertSucceeds` calls above fail (default-deny).

- [ ] **Step 3: Add the rules**

Modify `firestore.rules` — replace the full contents:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;

      match /localGames/{gameId} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
      match /onlineGames/{gameId} {
        allow read: if request.auth != null && request.auth.uid == uid;
        allow write: if false;
      }
    }
    match /rooms/{roomId} {
      allow read: if request.auth != null;
      allow write: if false;
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm run test:rules
```

Expected: PASS (all pre-existing `rooms/{roomId}` tests plus the 4 new ones).

- [ ] **Step 5: Commit**

```bash
git add firestore.rules app/src/firebase/firestoreRules.test.ts
git commit -m "Add Firestore rules for the localGames/onlineGames stats subcollections"
```

---

### Task 8: `StatsScreen` — display local and online stats

**Files:**
- Create: `app/src/components/StatsScreen.tsx`
- Test: `app/src/components/StatsScreen.test.tsx`
- Modify: `app/src/styles/components.css`

**Interfaces:**
- Consumes: `getStats` (Task 3), `useAuth` (`../contexts/AuthContext`, pre-existing).
- Produces: `StatsScreenProps { onBack: () => void }`, default export `StatsScreen` — consumed by `ProfileScreen` (Task 9).

- [ ] **Step 1: Write the failing tests**

Create `app/src/components/StatsScreen.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from 'firebase/auth';
import StatsScreen from './StatsScreen';
import { useAuth } from '../contexts/AuthContext';
import { getStats } from '../services/statsService';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../services/statsService', () => ({
  getStats: vi.fn(),
}));

const fakeUser = { uid: 'uid-1' } as User;

describe('StatsScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows local and online stats once loaded', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: fakeUser,
      profile: null,
      loading: false,
      refreshProfile: vi.fn(),
    });
    vi.mocked(getStats).mockImplementation(async (_uid, mode) =>
      mode === 'local'
        ? {
            gamesPlayed: 5,
            wins: 2,
            averageScore: 88.4,
            history: [{ id: 'g1', score: 100, won: true, playedAt: 1700000000000 }],
          }
        : { gamesPlayed: 3, wins: 1, averageScore: 70, history: [] }
    );

    render(<StatsScreen onBack={() => {}} />);

    expect(await screen.findByText('Liczba gier: 5')).toBeInTheDocument();
    expect(screen.getByText('Wygrane: 2')).toBeInTheDocument();
    expect(screen.getByText('Średnia punktów: 88.4')).toBeInTheDocument();
    expect(screen.getByText('Liczba gier: 3')).toBeInTheDocument();
    expect(screen.getByText('Wygrane: 1')).toBeInTheDocument();
    expect(screen.getByText('Średnia punktów: 70.0')).toBeInTheDocument();
    expect(screen.getByText('Brak rozegranych gier.')).toBeInTheDocument();
  });

  it('calls onBack when the back button is clicked', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: fakeUser,
      profile: null,
      loading: false,
      refreshProfile: vi.fn(),
    });
    vi.mocked(getStats).mockResolvedValue({
      gamesPlayed: 0,
      wins: 0,
      averageScore: 0,
      history: [],
    });
    const user = userEvent.setup();
    const onBack = vi.fn();

    render(<StatsScreen onBack={onBack} />);
    await user.click(screen.getByRole('button', { name: 'Wstecz' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd app
npx vitest run src/components/StatsScreen.test.tsx
```

Expected: FAIL — `Cannot find module './StatsScreen'`.

- [ ] **Step 3: Implement `StatsScreen`**

Create `app/src/components/StatsScreen.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getStats, type GameStats } from '../services/statsService';

interface StatsScreenProps {
  onBack: () => void;
}

function formatDate(millis: number): string {
  return new Date(millis).toLocaleDateString('pl-PL');
}

interface StatsSectionProps {
  title: string;
  stats: GameStats | null;
}

function StatsSection({ title, stats }: StatsSectionProps) {
  return (
    <section>
      <h2>{title}</h2>
      {stats ? (
        <>
          <p>Liczba gier: {stats.gamesPlayed}</p>
          <p>Wygrane: {stats.wins}</p>
          <p>Średnia punktów: {stats.averageScore.toFixed(1)}</p>
          {stats.history.length > 0 ? (
            <ul className="stats-history">
              {stats.history.map((entry) => (
                <li key={entry.id}>
                  <span>{formatDate(entry.playedAt)}</span>
                  <span>{entry.score}</span>
                  <span>{entry.won ? 'Wygrana' : 'Przegrana'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>Brak rozegranych gier.</p>
          )}
        </>
      ) : (
        <p>Ładowanie…</p>
      )}
    </section>
  );
}

function StatsScreen({ onBack }: StatsScreenProps) {
  const { user } = useAuth();
  const [localStats, setLocalStats] = useState<GameStats | null>(null);
  const [onlineStats, setOnlineStats] = useState<GameStats | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }
    getStats(user.uid, 'local').then(setLocalStats);
    getStats(user.uid, 'online').then(setOnlineStats);
  }, [user]);

  return (
    <div className="auth-screen">
      <h1>Statystyki</h1>
      <StatsSection title="Lokalne" stats={localStats} />
      <StatsSection title="Online" stats={onlineStats} />
      <button type="button" className="back-button" onClick={onBack}>
        Wstecz
      </button>
    </div>
  );
}

export default StatsScreen;
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/components/StatsScreen.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 5: Add history list styling**

Modify `app/src/styles/components.css` — append at the end of the file:

```css
/* StatsScreen */
.stats-history {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
}

.stats-history li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: var(--text-dim);
}
```

- [ ] **Step 6: Verify the whole app workspace still builds**

```bash
npm run build
cd ..
```

- [ ] **Step 7: Commit**

```bash
git add app/src/components/StatsScreen.tsx app/src/components/StatsScreen.test.tsx app/src/styles/components.css
git commit -m "Add StatsScreen showing local/online games played, wins, average, history"
```

---

### Task 9: Wire `StatsScreen` into `ProfileScreen`

**Files:**
- Modify: `app/src/components/ProfileScreen.tsx`
- Modify: `app/src/components/ProfileScreen.test.tsx`

**Interfaces:**
- Consumes: `StatsScreen` (Task 8).
- Produces: nothing new — no `App.tsx` routing change, `ProfileScreen` handles the "stats" sub-view itself, matching its existing "editing" sub-view pattern.

- [ ] **Step 1: Write the failing test**

Modify `app/src/components/ProfileScreen.test.tsx` — add a mock for `./StatsScreen` right after the existing `vi.mock` calls:

```ts
vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));
```

becomes:

```ts
vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('./StatsScreen', () => ({
  default: ({ onBack }: { onBack: () => void }) => (
    <button type="button" onClick={onBack}>
      Wstecz ze statystyk (stub)
    </button>
  ),
}));
```

Append this test at the end of the `describe('ProfileScreen', ...)` block, right before the final closing `});`:

```tsx
  it('navigates to the stats screen and back', async () => {
    const user = userEvent.setup();
    vi.mocked(useAuth).mockReturnValue({
      user: fakeUser,
      profile: fakeProfile,
      loading: false,
      refreshProfile: vi.fn(),
    });
    render(<ProfileScreen onSignedOut={() => {}} onBackToLocal={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'Statystyki' }));
    expect(
      screen.getByRole('button', { name: 'Wstecz ze statystyk (stub)' })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Wstecz ze statystyk (stub)' }));
    expect(screen.getByRole('heading', { name: 'Profil gracza' })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify the new one fails**

```bash
cd app
npx vitest run src/components/ProfileScreen.test.tsx
```

Expected: FAIL — there is no "Statystyki" button yet.

- [ ] **Step 3: Add the stats sub-view to `ProfileScreen`**

Modify `app/src/components/ProfileScreen.tsx` — replace the full contents:

```tsx
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { updateProfile } from '../services/profileService';
import { signOutUser } from '../services/authService';
import { authErrorMessage } from '../services/authErrors';
import { avatarSrc } from './avatarOptions';
import ProfileForm from './ProfileForm';
import StatsScreen from './StatsScreen';

interface ProfileScreenProps {
  onSignedOut: () => void;
  onBackToLocal: () => void;
}

type ProfileView = 'summary' | 'editing' | 'stats';

function ProfileScreen({ onSignedOut, onBackToLocal }: ProfileScreenProps) {
  const { user, profile, refreshProfile } = useAuth();
  const [view, setView] = useState<ProfileView>('summary');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user || !profile) {
    return null;
  }

  const handleUpdate = async (data: {
    displayName: string;
    avatarId: string;
  }) => {
    setSubmitting(true);
    setError(null);
    try {
      await updateProfile(user.uid, data);
      await refreshProfile();
      setView('summary');
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await signOutUser();
    onSignedOut();
  };

  if (view === 'stats') {
    return <StatsScreen onBack={() => setView('summary')} />;
  }

  if (view === 'editing') {
    return (
      <div className="auth-screen">
        <h1>Edytuj profil</h1>
        <ProfileForm
          initialDisplayName={profile.displayName}
          initialAvatarId={profile.avatarId}
          submitLabel="Zapisz zmiany"
          submitting={submitting}
          error={error}
          onSubmit={handleUpdate}
        />
        <button type="button" onClick={() => setView('summary')}>
          Anuluj
        </button>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <h1>Profil gracza</h1>
      <img
        className="profile-avatar"
        src={avatarSrc(profile.avatarId)}
        alt="Avatar gracza"
      />
      <p>{profile.displayName}</p>
      <p>{profile.email}</p>
      <button type="button" onClick={() => setView('editing')}>
        Edytuj profil
      </button>
      <button type="button" onClick={() => setView('stats')}>
        Statystyki
      </button>
      <button type="button" onClick={handleSignOut}>
        Wyloguj
      </button>
      <button type="button" onClick={onBackToLocal}>
        Wstecz
      </button>
    </div>
  );
}

export default ProfileScreen;
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/components/ProfileScreen.test.tsx
```

Expected: PASS (all pre-existing tests plus the new one).

- [ ] **Step 5: Verify the whole app workspace builds, lints, and passes**

```bash
npm run build
npm run lint
npm test
cd ..
```

- [ ] **Step 6: Commit**

```bash
git add app/src/components/ProfileScreen.tsx app/src/components/ProfileScreen.test.tsx
git commit -m "Add a Statystyki button to ProfileScreen, wired to StatsScreen"
```

---

### Task 10: Full-repo verification

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Verify every workspace builds and tests pass**

```bash
npm run build:engine
npm test --workspace=packages/game-engine
npm run build --workspace=functions
npm run lint --workspace=functions
npm test --workspace=functions
npm run build --workspace=app
npm run lint --workspace=app
npm test --workspace=app
```

Expected: every command succeeds.

- [ ] **Step 2: Manually verify the Firestore rules test (requires the emulator)**

```bash
npm run test:rules
```

Expected: PASS (already verified in Task 7, but re-run here since it's easy to skip when iterating quickly through Tasks 8–9 without the emulator running).

- [ ] **Step 3: Manual smoke test in a browser (dev server + emulators)**

Start the Firebase emulators and the Vite dev server (see the project's existing manual-verification workflow — `firebase emulators:start` from the repo root, `npm run dev` from `app/`), then in the browser:

1. Play a local game while logged in, let it finish, open Profil gracza → Statystyki, confirm "Lokalne" shows 1 game played and the right score/win.
2. Play the same local game again but click "Wyjdź z gry" mid-game (with confirm) — confirm Statystyki still shows only 1 game (aborted games don't count).
3. Play an online game to completion with two browser sessions, open Statystyki on both accounts, confirm "Online" reflects the finished game for both.
4. Host a room, start a game, then use "Przerwij grę i wróć do pokoju" — confirm Statystyki's "Online" count does not increase (aborted online games don't count either).

- [ ] **Step 4: Update the roadmap doc**

Modify `docs/superpowers/specs/2026-07-01-bronx-dice-roadmap-design.md` — change:

```
### Etap 7 (opcjonalnie, niski priorytet) — Statystyki graczy
- Zapis historii rozgrywek (lokalnych i online) do Firestore, powiązanej z kontem gracza.
- Ekran statystyk: liczba gier, wygrane, historia punktów per gracz.
```

to:

```
### Etap 7 (opcjonalnie, niski priorytet) — Statystyki graczy — UKOŃCZONE
- Zapis historii rozgrywek (lokalnych i online) do Firestore, powiązanej z kontem gracza.
- Ekran statystyk: liczba gier, wygrane, historia punktów per gracz.
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-07-01-bronx-dice-roadmap-design.md
git commit -m "Mark Etap 7 (player statistics) complete in the roadmap"
```

