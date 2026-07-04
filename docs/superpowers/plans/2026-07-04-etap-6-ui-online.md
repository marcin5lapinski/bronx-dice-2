# Etap 6 — UI trybu online: lobby i rozgrywka na żywo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the UI for online play — tworzenie/dołączanie do pokoju, poczekalnia z ready-checkiem, i podpięcie istniejących komponentów gry (`DiceTray`/`RollButton`/`ScoreBoard`/`WinnerScreen`) do stanu z Firestore — plus limit czasu na turę z automatycznym wypełnieniem zerem po jego upłynięciu.

**Architecture:** Nowe ekrany (`OnlineMenuScreen`, `RoomLobbyScreen`, `OnlineGameScreen`, `OnlineRoomScreen`) w `app/`, zasilane przez `useRoom` (subskrypcja `onSnapshot` na `rooms/{roomId}`) i cienki `roomService` (wrapper na `httpsCallable`). Backend (`functions/`) rozszerzony o ready-check (`setReady`) i wymuszony timeout tury (`handleTurnTimeout`), oba oparte o dwie nowe, czyste funkcje w `packages/game-engine`. Istniejące komponenty gry (`DiceTray`/`RollButton`/`ScoreBoard`) dostają opcjonalny prop `interactive` (domyślnie `true`), żeby tryb lokalny nie wymagał żadnych zmian.

**Tech Stack:** React 19 + TypeScript (Vite), Firebase (Firestore `onSnapshot`, Cloud Functions `httpsCallable`), Vitest + Testing Library (`jsdom`), istniejące `@bronx-dice/game-engine` i `functions/` pakiety z Etapu 5.

Source of truth: `docs/superpowers/specs/2026-07-04-etap-6-ui-online-design.md`.

## Global Constraints

- **`TURN_TIME_LIMIT_OPTIONS = [15, 30, 45, 60]`** (sekundy) — jedyne dopuszczalne wartości `turnTimeLimitSeconds`, wybierane raz przy `createRoom`, niezmienne później. Zdefiniowane w `functions/src/rooms/types.ts` (serwer) i osobno w `app/src/components/OnlineMenuScreen.tsx` (klient) — brak wspólnego pakietu dla tej stałej, świadoma duplikacja (tak jak `PlayerProfile` w `app/src/types/auth.ts` niezależnie od `functions/`).
- **Wszyscy gracze, łącznie z hostem, dołączają z `ready: false`.** „Rozpocznij grę" jest aktywne dla hosta tylko gdy `players.length >= MIN_PLAYERS && players.every(p => p.ready)`.
- **`turnStartedAt` jest zapisywane przy każdej zmianie tury** — początkowy zapis w `startGame`, każdy udany `scoreCategory`, każdy udany `handleTurnTimeout`. Nigdy w `rollDice`/`toggleHeldDie` (te nie zmieniają, czyja jest tura).
- **`handleTurnTimeout` może wywołać dowolny gracz z pokoju**, nie tylko aktualny — serwer sam weryfikuje upłynięcie czasu i fazę; klient po cichu ignoruje `failed-precondition` (spodziewany wyścig, gdy inny klient już obsłużył timeout).
- **Brak zmian w Firestore Security Rules** — wszystkie nowe pola piszą wyłącznie Cloud Functions przez Admin SDK.
- **Zero zmian w istniejących regułach punktacji** — nowe funkcje silnika (`findNextScorableCategory`, `applyTimeoutScore`) są czystymi dodatkami, nie modyfikują `scoreCategory`/`applyScore`.
- **`DiceTray`/`RollButton`/`ScoreBoard` dostają opcjonalny prop `interactive?: boolean` domyślnie `true`** — lokalny `GameScreen` nie wymaga żadnej zmiany wywołania.
- **Poza zakresem (nie implementować):** wskaźniki obecności online/offline, rematch, sprzątanie/TTL pokoi, zmiana `turnTimeLimitSeconds` po utworzeniu pokoju, `leaveRoom` poza fazą `lobby`.

---

### Task 1: `findNextScorableCategory` — pierwsza wolna kategoria od góry

**Files:**
- Modify: `packages/game-engine/src/scoreCard.ts`
- Test: `packages/game-engine/src/scoreCard.test.ts`

**Interfaces:**
- Consumes: `UPPER_CATEGORIES`, `LOWER_CATEGORIES` (`./types/game`, już zaimportowane w tym pliku).
- Produces: `findNextScorableCategory(scoreCard: PlayerScoreCard): ScoreCategory` — konsumowane przez `applyTimeoutScore` (Task 2) i pośrednio przez `handleTurnTimeout` (Task 7).

- [ ] **Step 1: Write the failing tests**

Modify `packages/game-engine/src/scoreCard.test.ts` — dodaj `findNextScorableCategory` do importu z `'./scoreCard'`:

```ts
import {
  createEmptyScoreCard,
  isUpperCategory,
  isUpperSectionFilled,
  canScoreCategory,
  calculateTotal,
  scoreCategory,
  findNextScorableCategory,
  DOUBLE_SCORE_ROLLS_LEFT,
  YAHTZEE_BONUS,
} from './scoreCard';
```

Dopisz na końcu pliku:

```ts
describe('findNextScorableCategory', () => {
  it('returns the first unfilled upper category when the upper section is incomplete', () => {
    const card = createEmptyScoreCard();
    card.upper.aces = 1;
    card.upper.twos = 2;
    expect(findNextScorableCategory(card)).toBe('threes');
  });

  it('returns the first unfilled lower category once the upper section is filled', () => {
    const card = createEmptyScoreCard();
    card.upper = { aces: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6 };
    card.lower.pair = 4;
    expect(findNextScorableCategory(card)).toBe('twoPair');
  });

  it('throws when the score card is already complete', () => {
    const card = createEmptyScoreCard();
    card.upper = { aces: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6 };
    card.lower = {
      pair: 4,
      twoPair: 4,
      threeOfKind: 8,
      fourOfKind: 16,
      smallStraight: 15,
      largeStraight: 20,
      fullHouse: 25,
      chance: 10,
      yahtzee: 50,
    };
    expect(() => findNextScorableCategory(card)).toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd packages/game-engine
npx vitest run src/scoreCard.test.ts
```

Expected: FAIL — `findNextScorableCategory` is not exported yet.

- [ ] **Step 3: Implement `findNextScorableCategory`**

Modify `packages/game-engine/src/scoreCard.ts` — dodaj na końcu pliku:

```ts
export function findNextScorableCategory(
  scoreCard: PlayerScoreCard
): ScoreCategory {
  const nextUpper = UPPER_CATEGORIES.find(
    (category) => scoreCard.upper[category] === null
  );
  if (nextUpper) {
    return nextUpper;
  }
  const nextLower = LOWER_CATEGORIES.find(
    (category) => scoreCard.lower[category] === null
  );
  if (!nextLower) {
    throw new Error('Score card is already complete');
  }
  return nextLower;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/scoreCard.test.ts
```

Expected: PASS (all pre-existing tests plus the 3 new ones).

- [ ] **Step 5: Commit**

```bash
cd ../..
git add packages/game-engine/src/scoreCard.ts packages/game-engine/src/scoreCard.test.ts
git commit -m "Add findNextScorableCategory for the turn-timeout auto-zero rule"
```

---

### Task 2: `applyTimeoutScore` — wymuszone zero i przejście do kolejnej tury

**Files:**
- Modify: `packages/game-engine/src/turn.ts`
- Test: `packages/game-engine/src/turn.test.ts`

**Interfaces:**
- Consumes: `findNextScorableCategory`, `isUpperCategory` (`./scoreCard`, `findNextScorableCategory` z Task 1), `nextTurn` (`./gameState`, już zaimportowane).
- Produces: `applyTimeoutScore(state: GameState): GameState` — konsumowane przez `handleTurnTimeout` (Task 7).

- [ ] **Step 1: Write the failing tests**

Modify `packages/game-engine/src/turn.test.ts` — dodaj `applyTimeoutScore` do importu z `'./turn'`:

```ts
import {
  rollInTurn,
  toggleHeldDie,
  applyScore,
  applyTimeoutScore,
  isScoreCardComplete,
  isGameOver,
  getWinners,
} from './turn';
```

Dopisz po bloku `describe('applyScore', ...)`:

```ts
describe('applyTimeoutScore', () => {
  it('writes a zero into the first unfilled upper category and advances the turn', () => {
    const state = createGameState(['Ola', 'Kuba']);
    const olaId = state.players[0].id;

    const result = applyTimeoutScore(state);

    expect(result.scoreCards[olaId].upper.aces).toBe(0);
    expect(result.currentPlayerIndex).toBe(1);
    expect(result.dice).toEqual([]);
    expect(result.rollsLeft).toBe(3);
  });

  it('writes a zero into the first unfilled lower category once the upper section is filled', () => {
    const state = createGameState(['Ola', 'Kuba']);
    const olaId = state.players[0].id;
    const filledUpperCard = {
      ...state.scoreCards[olaId],
      upper: { aces: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6 },
    };
    const withFilledUpper = {
      ...state,
      scoreCards: { ...state.scoreCards, [olaId]: filledUpperCard },
    };

    const result = applyTimeoutScore(withFilledUpper);

    expect(result.scoreCards[olaId].lower.pair).toBe(0);
  });

  it('does not double the forced zero even when rollsLeft is DOUBLE_SCORE_ROLLS_LEFT', () => {
    const state = createGameState(['Ola', 'Kuba']);
    const withDoubleRoll = { ...state, rollsLeft: 2 };

    const result = applyTimeoutScore(withDoubleRoll);

    expect(result.scoreCards[state.players[0].id].upper.aces).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd packages/game-engine
npx vitest run src/turn.test.ts
```

Expected: FAIL — `applyTimeoutScore` is not exported yet.

- [ ] **Step 3: Implement `applyTimeoutScore`**

Modify `packages/game-engine/src/turn.ts` — zmień import z `'./scoreCard'`:

```ts
import { scoreCategory, calculateTotal } from './scoreCard';
```

na:

```ts
import {
  scoreCategory,
  calculateTotal,
  findNextScorableCategory,
  isUpperCategory,
} from './scoreCard';
```

Dodaj po `applyScore`:

```ts
export function applyTimeoutScore(state: GameState): GameState {
  const currentPlayer = state.players[state.currentPlayerIndex];
  const scoreCard = state.scoreCards[currentPlayer.id];
  const category = findNextScorableCategory(scoreCard);
  const updatedScoreCard = isUpperCategory(category)
    ? { ...scoreCard, upper: { ...scoreCard.upper, [category]: 0 } }
    : { ...scoreCard, lower: { ...scoreCard.lower, [category]: 0 } };
  return nextTurn({
    ...state,
    scoreCards: { ...state.scoreCards, [currentPlayer.id]: updatedScoreCard },
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/turn.test.ts
```

Expected: PASS (all pre-existing tests plus the 3 new ones).

- [ ] **Step 5: Rebuild the engine and re-verify `app`/`functions` still build**

```bash
cd ../..
npm run build:engine
npm run build --workspace=app
npm run build --workspace=functions
```

Expected: all three succeed with no type errors — this task only adds new exports.

- [ ] **Step 6: Commit**

```bash
git add packages/game-engine/src/turn.ts packages/game-engine/src/turn.test.ts
git commit -m "Add applyTimeoutScore to force a zero and advance the turn on timeout"
```

---

### Task 3: Extend the room data model with ready-check and turn-timer fields

**Files:**
- Modify: `functions/src/rooms/types.ts`
- Modify: `functions/src/rooms/createRoom.ts`
- Modify: `functions/src/rooms/createRoom.test.ts`
- Modify: `functions/src/rooms/joinRoom.ts`
- Modify: `functions/src/rooms/joinRoom.test.ts`
- Modify: `functions/src/rooms/startGame.test.ts` (fixture only, no behavior change yet)
- Modify: `functions/src/rooms/scoreCategory.test.ts` (fixture only, no behavior change yet)
- Modify: `functions/src/rooms/leaveRoom.test.ts` (fixture only, no behavior change yet)
- Modify: `functions/src/rooms/rollDice.test.ts` (fixture only, no behavior change yet)
- Modify: `functions/src/rooms/toggleHeldDie.test.ts` (fixture only, no behavior change yet)

**Interfaces:**
- Produces: `RoomPlayer.ready: boolean`, `TURN_TIME_LIMIT_OPTIONS: readonly [15, 30, 45, 60]`, `TurnTimeLimitSeconds` type, `RoomBase.turnTimeLimitSeconds`, and `turnStartedAt: Timestamp` on the `'playing' | 'finished'` branch of `RoomDocument` (`functions/src/rooms/types.ts`) — consumed by every task from here on. `createRoomHandler` gains a required `turnTimeLimitSeconds: number` parameter (validated) — consumed by Task 9's `roomService.createRoom`.

This task adds required fields to a shared type, which immediately breaks every existing `RoomPlayer`/`RoomDocument` literal in the package. All of it must land in one commit to keep `npm run build`/`npm test` green — same pattern as Etap 5 Task 1's workspace conversion.

- [ ] **Step 1: Extend `types.ts`**

Modify `functions/src/rooms/types.ts` — replace the full contents:

```ts
import type { GameState, Player } from '@bronx-dice/game-engine';
import type { Timestamp } from 'firebase-admin/firestore';

export interface RoomPlayer extends Player {
  avatarId: string;
  ready: boolean;
}

export const TURN_TIME_LIMIT_OPTIONS = [15, 30, 45, 60] as const;
export type TurnTimeLimitSeconds = (typeof TURN_TIME_LIMIT_OPTIONS)[number];

interface RoomBase {
  hostId: string;
  maxPlayers: number;
  turnTimeLimitSeconds: TurnTimeLimitSeconds;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type RoomDocument =
  | (RoomBase & { phase: 'lobby'; players: RoomPlayer[] })
  | (RoomBase & { phase: 'playing' | 'finished' } & GameState & {
        turnStartedAt: Timestamp;
      });
```

- [ ] **Step 2: Update `createRoomHandler` to accept and validate `turnTimeLimitSeconds`**

Modify `functions/src/rooms/createRoom.ts` — replace the full contents:

```ts
import { onCall } from 'firebase-functions/v2/https';
import { Timestamp, type Firestore, type Transaction, type DocumentReference } from 'firebase-admin/firestore';
import { MIN_PLAYERS, MAX_PLAYERS } from '@bronx-dice/game-engine';
import { db } from '../firebaseAdmin';
import { getProfileOrThrow, type StoredProfile } from '../profiles';
import { unauthenticated, invalidArgument, internal } from '../errors';
import { generateRoomCode } from './roomCode';
import { TURN_TIME_LIMIT_OPTIONS, type RoomDocument, type TurnTimeLimitSeconds } from './types';

const MAX_ROOM_CODE_ATTEMPTS = 5;

export async function createRoomHandler(
  firestore: Firestore,
  uid: string,
  profile: StoredProfile,
  maxPlayers: number,
  turnTimeLimitSeconds: number,
  random: () => number = Math.random,
  now: () => Timestamp = Timestamp.now
): Promise<string> {
  if (!Number.isInteger(maxPlayers) || maxPlayers < MIN_PLAYERS || maxPlayers > MAX_PLAYERS) {
    throw invalidArgument(
      `Liczba graczy musi być liczbą całkowitą od ${MIN_PLAYERS} do ${MAX_PLAYERS}.`
    );
  }
  if (!(TURN_TIME_LIMIT_OPTIONS as readonly number[]).includes(turnTimeLimitSeconds)) {
    throw invalidArgument(
      `Limit czasu na turę musi być jedną z wartości: ${TURN_TIME_LIMIT_OPTIONS.join(', ')} sekund.`
    );
  }

  const timestamp = now();
  const room: RoomDocument = {
    phase: 'lobby',
    hostId: uid,
    maxPlayers,
    turnTimeLimitSeconds: turnTimeLimitSeconds as TurnTimeLimitSeconds,
    players: [
      { id: uid, name: profile.displayName, avatarId: profile.avatarId, ready: false },
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  for (let attempt = 0; attempt < MAX_ROOM_CODE_ATTEMPTS; attempt++) {
    const roomId = generateRoomCode(random);
    const created = await tryCreateRoom(firestore, roomId, room);
    if (created) {
      return roomId;
    }
  }
  throw internal('Nie udało się utworzyć pokoju. Spróbuj ponownie.');
}

async function tryCreateRoom(
  firestore: Firestore,
  roomId: string,
  room: RoomDocument
): Promise<boolean> {
  return firestore.runTransaction(async (tx: Transaction) => {
    const ref: DocumentReference = firestore.collection('rooms').doc(roomId);
    const snapshot = await tx.get(ref);
    if (snapshot.exists) {
      return false;
    }
    tx.set(ref, room);
    return true;
  });
}

export const createRoom = onCall<{ maxPlayers: number; turnTimeLimitSeconds: number }>(
  async (request) => {
    if (!request.auth) {
      throw unauthenticated();
    }
    const uid = request.auth.uid;
    const profile = await getProfileOrThrow(db, uid);
    const roomId = await createRoomHandler(
      db,
      uid,
      profile,
      request.data?.maxPlayers,
      request.data?.turnTimeLimitSeconds
    );
    return { roomId };
  }
);
```

- [ ] **Step 3: Update `createRoom.test.ts` for the new parameter and add validation tests**

Modify `functions/src/rooms/createRoom.test.ts` — replace the full contents:

```ts
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
  it('creates a lobby room with the host as the sole, not-ready player', async () => {
    const { firestore, writes } = fakeDb(new Set());
    const roomId = await createRoomHandler(firestore, 'uid-1', profile, 3, 30, () => 0, fixedNow);
    expect(roomId).toBe('AAAAA');
    expect(writes).toHaveLength(1);
    expect(writes[0].data).toMatchObject({
      phase: 'lobby',
      hostId: 'uid-1',
      maxPlayers: 3,
      turnTimeLimitSeconds: 30,
      players: [{ id: 'uid-1', name: 'Ola', avatarId: 'fox', ready: false }],
    });
  });

  it('retries with a new code when the first generated one is already taken', async () => {
    const { firestore, writes } = fakeDb(new Set(['AAAAA']));
    const random = sequenceRandom([0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5]);
    const roomId = await createRoomHandler(firestore, 'uid-1', profile, 2, 30, random, fixedNow);
    expect(roomId).not.toBe('AAAAA');
    expect(writes).toHaveLength(1);
  });

  it('throws internal after exhausting all retry attempts', async () => {
    const { firestore } = fakeDb(new Set(['AAAAA']));
    await expect(
      createRoomHandler(firestore, 'uid-1', profile, 2, 30, () => 0, fixedNow)
    ).rejects.toMatchObject({ code: 'internal' });
  });

  it('rejects maxPlayers below the minimum', async () => {
    const { firestore } = fakeDb(new Set());
    await expect(
      createRoomHandler(firestore, 'uid-1', profile, MIN_PLAYERS - 1, 30, () => 0, fixedNow)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects maxPlayers above the maximum', async () => {
    const { firestore } = fakeDb(new Set());
    await expect(
      createRoomHandler(firestore, 'uid-1', profile, 7, 30, () => 0, fixedNow)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects a turnTimeLimitSeconds value outside {15, 30, 45, 60}', async () => {
    const { firestore } = fakeDb(new Set());
    await expect(
      createRoomHandler(firestore, 'uid-1', profile, 3, 20, () => 0, fixedNow)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
```

- [ ] **Step 4: Give the new joiner a `ready: false` field**

Modify `functions/src/rooms/joinRoom.ts` — change:

```ts
  const newPlayer: RoomPlayer = { id: uid, name: profile.displayName, avatarId: profile.avatarId };
```

to:

```ts
  const newPlayer: RoomPlayer = {
    id: uid,
    name: profile.displayName,
    avatarId: profile.avatarId,
    ready: false,
  };
```

- [ ] **Step 5: Update `joinRoom.test.ts` fixtures and expectations**

Modify `functions/src/rooms/joinRoom.test.ts` — change the `lobbyRoom` fixture:

```ts
const lobbyRoom: RoomDocument = {
  phase: 'lobby',
  hostId: 'uid-1',
  maxPlayers: 3,
  turnTimeLimitSeconds: 30,
  players: [{ id: 'uid-1', name: 'Ola', avatarId: 'fox', ready: true }],
  createdAt: {} as Timestamp,
  updatedAt: {} as Timestamp,
};
```

Change the two assertions that list players to include `ready`:

```ts
  it('adds the player to a lobby room with space', async () => {
    const { tx, update } = fakeTransaction(lobbyRoom);
    await joinRoomHandler(tx, roomRef, 'uid-2', profile, fixedNow);
    expect(update).toHaveBeenCalledWith(roomRef, {
      players: [
        { id: 'uid-1', name: 'Ola', avatarId: 'fox', ready: true },
        { id: 'uid-2', name: 'Kuba', avatarId: 'wolf', ready: false },
      ],
      updatedAt: {},
    });
  });
```

(The "already joined" / "room full" / "already started" tests only construct `{...lobbyRoom, ...}` and don't assert on player shape, so they need no further edits beyond the fixture change above.)

- [ ] **Step 6: Update the remaining fixture-only test files**

Modify `functions/src/rooms/startGame.test.ts` — change the `lobbyRoom` fixture:

```ts
const lobbyRoom: RoomDocument = {
  phase: 'lobby',
  hostId: 'uid-1',
  maxPlayers: 3,
  turnTimeLimitSeconds: 30,
  players: [
    { id: 'uid-1', name: 'Ola', avatarId: 'fox', ready: true },
    { id: 'uid-2', name: 'Kuba', avatarId: 'wolf', ready: true },
  ],
  createdAt: {} as Timestamp,
  updatedAt: {} as Timestamp,
};
```

Modify `functions/src/rooms/scoreCategory.test.ts` — change `basePlayingRoom()`:

```ts
function basePlayingRoom(): RoomDocument {
  return {
    phase: 'playing',
    hostId: 'uid-1',
    maxPlayers: 2,
    turnTimeLimitSeconds: 30,
    turnStartedAt: {} as Timestamp,
    players: [
      { id: 'uid-1', name: 'Ola', avatarId: 'fox', ready: true },
      { id: 'uid-2', name: 'Kuba', avatarId: 'wolf', ready: true },
    ],
    scoreCards: {
      'uid-1': createEmptyScoreCard(),
      'uid-2': createEmptyScoreCard(),
    },
    dice: [3, 3, 5, 5, 5],
    heldDice: [false, false, false, false, false],
    rollsLeft: 3,
    currentPlayerIndex: 0,
    createdAt: {} as Timestamp,
    updatedAt: {} as Timestamp,
  };
}
```

Modify `functions/src/rooms/leaveRoom.test.ts` — change the `twoPlayerLobby` fixture and its two player-list assertions:

```ts
const twoPlayerLobby: RoomDocument = {
  phase: 'lobby',
  hostId: 'uid-1',
  maxPlayers: 3,
  turnTimeLimitSeconds: 30,
  players: [
    { id: 'uid-1', name: 'Ola', avatarId: 'fox', ready: true },
    { id: 'uid-2', name: 'Kuba', avatarId: 'wolf', ready: true },
  ],
  createdAt: {} as Timestamp,
  updatedAt: {} as Timestamp,
};
```

```ts
  it('removes a non-host player from the lobby, keeping the host', async () => {
    const { tx, update } = fakeTransaction(twoPlayerLobby);
    await leaveRoomHandler(tx, roomRef, 'uid-2', fixedNow);
    expect(update).toHaveBeenCalledWith(roomRef, {
      players: [{ id: 'uid-1', name: 'Ola', avatarId: 'fox', ready: true }],
      hostId: 'uid-1',
      updatedAt: {},
    });
  });

  it('promotes the next remaining player to host when the host leaves', async () => {
    const { tx, update } = fakeTransaction(twoPlayerLobby);
    await leaveRoomHandler(tx, roomRef, 'uid-1', fixedNow);
    expect(update).toHaveBeenCalledWith(roomRef, {
      players: [{ id: 'uid-2', name: 'Kuba', avatarId: 'wolf', ready: true }],
      hostId: 'uid-2',
      updatedAt: {},
    });
  });
```

Modify `functions/src/rooms/rollDice.test.ts` — change the `playingRoom` fixture:

```ts
const playingRoom: RoomDocument = {
  phase: 'playing',
  hostId: 'uid-1',
  maxPlayers: 2,
  turnTimeLimitSeconds: 30,
  turnStartedAt: {} as Timestamp,
  players: [
    { id: 'uid-1', name: 'Ola', avatarId: 'fox', ready: true },
    { id: 'uid-2', name: 'Kuba', avatarId: 'wolf', ready: true },
  ],
  scoreCards: {},
  dice: [],
  heldDice: [false, false, false, false, false],
  rollsLeft: 3,
  currentPlayerIndex: 0,
  createdAt: {} as Timestamp,
  updatedAt: {} as Timestamp,
};
```

Modify `functions/src/rooms/toggleHeldDie.test.ts` — change the `playingRoom` fixture:

```ts
const playingRoom: RoomDocument = {
  phase: 'playing',
  hostId: 'uid-1',
  maxPlayers: 2,
  turnTimeLimitSeconds: 30,
  turnStartedAt: {} as Timestamp,
  players: [
    { id: 'uid-1', name: 'Ola', avatarId: 'fox', ready: true },
    { id: 'uid-2', name: 'Kuba', avatarId: 'wolf', ready: true },
  ],
  scoreCards: {},
  dice: [1, 2, 3, 4, 5],
  heldDice: [false, false, false, false, false],
  rollsLeft: 2,
  currentPlayerIndex: 0,
  createdAt: {} as Timestamp,
  updatedAt: {} as Timestamp,
};
```

- [ ] **Step 7: Run the full `functions` suite and build to verify everything is green**

```bash
cd functions
npx vitest run
npm run build
cd ..
```

Expected: every test file passes (no behavior changed for `joinRoom`'s existing-player/full/started cases, `startGame`, `scoreCategory`, `leaveRoom`, `rollDice`, `toggleHeldDie` — only fixtures grew new required fields); `tsc` compiles clean.

- [ ] **Step 8: Commit**

```bash
git add functions/src/rooms/types.ts functions/src/rooms/createRoom.ts functions/src/rooms/createRoom.test.ts functions/src/rooms/joinRoom.ts functions/src/rooms/joinRoom.test.ts functions/src/rooms/startGame.test.ts functions/src/rooms/scoreCategory.test.ts functions/src/rooms/leaveRoom.test.ts functions/src/rooms/rollDice.test.ts functions/src/rooms/toggleHeldDie.test.ts
git commit -m "Extend room data model with ready-check and turn-timer fields"
```

---

### Task 4: `setReady` Cloud Function

**Files:**
- Create: `functions/src/rooms/setReady.ts`
- Test: `functions/src/rooms/setReady.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `RoomDocument` (`./types`, Task 3), `db` (`../firebaseAdmin`), `unauthenticated`, `notFound`, `failedPrecondition`, `permissionDenied`, `invalidArgument` (`../errors`).
- Produces: `setReadyHandler(tx, roomRef, uid, ready, now?): Promise<void>` and the `setReady` `onCall` export — consumed by `app`'s `roomService.setReady` (Task 9).

- [ ] **Step 1: Write the failing tests**

Create `functions/src/rooms/setReady.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import type { Transaction, DocumentReference, Timestamp } from 'firebase-admin/firestore';
import { setReadyHandler } from './setReady';
import type { RoomDocument } from './types';

function fakeTransaction(room: RoomDocument | null) {
  const update = vi.fn();
  const tx = {
    get: async () => ({ exists: room !== null, data: () => room }),
    update,
  };
  return { tx: tx as unknown as Transaction, update };
}

const roomRef = {} as DocumentReference;
const fixedNow = () => ({}) as unknown as Timestamp;

const lobbyRoom: RoomDocument = {
  phase: 'lobby',
  hostId: 'uid-1',
  maxPlayers: 3,
  turnTimeLimitSeconds: 30,
  players: [
    { id: 'uid-1', name: 'Ola', avatarId: 'fox', ready: false },
    { id: 'uid-2', name: 'Kuba', avatarId: 'wolf', ready: false },
  ],
  createdAt: {} as Timestamp,
  updatedAt: {} as Timestamp,
};

describe('setReadyHandler', () => {
  it("updates only the caller's own ready state", async () => {
    const { tx, update } = fakeTransaction(lobbyRoom);
    await setReadyHandler(tx, roomRef, 'uid-1', true, fixedNow);
    expect(update).toHaveBeenCalledWith(roomRef, {
      players: [
        { id: 'uid-1', name: 'Ola', avatarId: 'fox', ready: true },
        { id: 'uid-2', name: 'Kuba', avatarId: 'wolf', ready: false },
      ],
      updatedAt: {},
    });
  });

  it('can flip ready back to false', async () => {
    const readyRoom: RoomDocument = {
      ...lobbyRoom,
      players: [
        { id: 'uid-1', name: 'Ola', avatarId: 'fox', ready: true },
        { id: 'uid-2', name: 'Kuba', avatarId: 'wolf', ready: false },
      ],
    };
    const { tx, update } = fakeTransaction(readyRoom);
    await setReadyHandler(tx, roomRef, 'uid-1', false, fixedNow);
    const [, patch] = update.mock.calls[0];
    expect(patch.players[0].ready).toBe(false);
  });

  it('throws not-found when the room does not exist', async () => {
    const { tx } = fakeTransaction(null);
    await expect(
      setReadyHandler(tx, roomRef, 'uid-1', true, fixedNow)
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('rejects when the room is not in the lobby phase', async () => {
    const playingRoom = { ...lobbyRoom, phase: 'playing' } as RoomDocument;
    const { tx } = fakeTransaction(playingRoom);
    await expect(
      setReadyHandler(tx, roomRef, 'uid-1', true, fixedNow)
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects a caller who is not a player in the room', async () => {
    const { tx } = fakeTransaction(lobbyRoom);
    await expect(
      setReadyHandler(tx, roomRef, 'uid-9', true, fixedNow)
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd functions
npx vitest run src/rooms/setReady.test.ts
```

Expected: FAIL — `Cannot find module './setReady'`.

- [ ] **Step 3: Implement `setReady.ts`**

Create `functions/src/rooms/setReady.ts`:

```ts
import { onCall } from 'firebase-functions/v2/https';
import { Timestamp, type Transaction, type DocumentReference } from 'firebase-admin/firestore';
import { db } from '../firebaseAdmin';
import { unauthenticated, notFound, failedPrecondition, permissionDenied, invalidArgument } from '../errors';
import type { RoomDocument } from './types';

export async function setReadyHandler(
  tx: Transaction,
  roomRef: DocumentReference,
  uid: string,
  ready: boolean,
  now: () => Timestamp = Timestamp.now
): Promise<void> {
  const snapshot = await tx.get(roomRef);
  if (!snapshot.exists) {
    throw notFound();
  }
  const room = snapshot.data() as RoomDocument;
  if (room.phase !== 'lobby') {
    throw failedPrecondition('Nie można zmieniać gotowości po starcie gry.');
  }
  if (!room.players.some((player) => player.id === uid)) {
    throw permissionDenied('Nie jesteś graczem w tym pokoju.');
  }
  const players = room.players.map((player) =>
    player.id === uid ? { ...player, ready } : player
  );
  tx.update(roomRef, { players, updatedAt: now() });
}

export const setReady = onCall<{ roomId: string; ready: boolean }>(async (request) => {
  if (!request.auth) {
    throw unauthenticated();
  }
  const { roomId, ready } = request.data ?? {};
  if (typeof roomId !== 'string' || roomId.length === 0) {
    throw invalidArgument('Brak kodu pokoju.');
  }
  if (typeof ready !== 'boolean') {
    throw invalidArgument('Brak statusu gotowości.');
  }
  const roomRef = db.collection('rooms').doc(roomId);
  await db.runTransaction((tx) => setReadyHandler(tx, roomRef, request.auth!.uid, ready));
});
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/rooms/setReady.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Export `setReady` from the entry point**

Modify `functions/src/index.ts` — add the export alongside the others:

```ts
export { setReady } from './rooms/setReady';
```

- [ ] **Step 6: Verify the whole package still builds, lints, and passes**

```bash
npm run build
npm run lint
npm test
cd ..
```

Expected: build succeeds, lint clean, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add functions/src/rooms/setReady.ts functions/src/rooms/setReady.test.ts functions/src/index.ts
git commit -m "Add setReady Cloud Function for the lobby ready-check"
```

---

### Task 5: `startGameHandler` requires everyone ready; writes `turnStartedAt`

**Files:**
- Modify: `functions/src/rooms/startGame.ts`
- Modify: `functions/src/rooms/startGame.test.ts`

**Interfaces:**
- Consumes: nothing new (uses fields already present after Task 3).
- Produces: `startGameHandler` now writes `turnStartedAt: now()` alongside `phase: 'playing'` — consumed by `scoreCategoryHandler` (Task 6) and `handleTurnTimeout` (Task 7), which both read/rewrite it.

- [ ] **Step 1: Write the failing test**

Modify `functions/src/rooms/startGame.test.ts` — add after the "starts the game..." test:

```ts
  it('rejects when not every player is ready', async () => {
    const notAllReady: RoomDocument = {
      ...lobbyRoom,
      players: [
        { id: 'uid-1', name: 'Ola', avatarId: 'fox', ready: true },
        { id: 'uid-2', name: 'Kuba', avatarId: 'wolf', ready: false },
      ],
    };
    const { tx } = fakeTransaction(notAllReady);
    await expect(startGameHandler(tx, roomRef, 'uid-1', fixedNow)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });
```

Extend the "starts the game..." test's assertions to also check `turnStartedAt`:

```ts
  it('starts the game and writes an initial GameState computed from the players', async () => {
    const { tx, update } = fakeTransaction(lobbyRoom);
    await startGameHandler(tx, roomRef, 'uid-1', fixedNow);
    expect(update).toHaveBeenCalledTimes(1);
    const [, patch] = update.mock.calls[0];
    expect(patch.phase).toBe('playing');
    expect(patch.players).toEqual(lobbyRoom.players);
    expect(patch.currentPlayerIndex).toBe(0);
    expect(patch.dice).toEqual([]);
    expect(Object.keys(patch.scoreCards)).toEqual(['uid-1', 'uid-2']);
    expect(patch.turnStartedAt).toEqual({});
  });
```

(Recall from Task 3 Step 6 that `lobbyRoom` in this file now has both players `ready: true`, so this happy-path test keeps passing unchanged apart from the new assertion.)

- [ ] **Step 2: Run the tests to verify the new one fails**

```bash
cd functions
npx vitest run src/rooms/startGame.test.ts
```

Expected: FAIL — no ready-check exists yet, and `turnStartedAt` isn't written.

- [ ] **Step 3: Implement the ready-check and `turnStartedAt` write**

Modify `functions/src/rooms/startGame.ts` — change:

```ts
  if (room.players.length < MIN_PLAYERS) {
    throw failedPrecondition(`Potrzeba co najmniej ${MIN_PLAYERS} graczy.`);
  }
  const gameState = createGameStateFromPlayers(room.players);
  tx.update(roomRef, { ...gameState, phase: 'playing', updatedAt: now() });
```

to:

```ts
  if (room.players.length < MIN_PLAYERS) {
    throw failedPrecondition(`Potrzeba co najmniej ${MIN_PLAYERS} graczy.`);
  }
  if (!room.players.every((player) => player.ready)) {
    throw failedPrecondition('Nie wszyscy gracze są gotowi.');
  }
  const gameState = createGameStateFromPlayers(room.players);
  const timestamp = now();
  tx.update(roomRef, {
    ...gameState,
    phase: 'playing',
    turnStartedAt: timestamp,
    updatedAt: timestamp,
  });
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/rooms/startGame.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Verify the whole package still builds and passes**

```bash
npm run build
npm test
cd ..
```

- [ ] **Step 6: Commit**

```bash
git add functions/src/rooms/startGame.ts functions/src/rooms/startGame.test.ts
git commit -m "Require every player ready before startGame; write turnStartedAt"
```

---

### Task 6: `scoreCategoryHandler` bumps `turnStartedAt` on every turn change

**Files:**
- Modify: `functions/src/rooms/scoreCategory.ts`
- Modify: `functions/src/rooms/scoreCategory.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `scoreCategoryHandler` now writes `turnStartedAt: now()` on every successful score (the turn always advances after a score, per `applyScore` → `nextTurn`).

- [ ] **Step 1: Write the failing assertion**

Modify `functions/src/rooms/scoreCategory.test.ts` — extend the first test's assertions:

```ts
  it('scores the category, advances the turn, and keeps phase playing', async () => {
    // Upper categories can be scored before the upper section is filled (unlike
    // lower categories, which basePlayingRoom's fresh scoreCards can't take yet).
    const room = basePlayingRoom();
    const { tx, update } = fakeTransaction(room);
    await scoreCategoryHandler(tx, roomRef, 'uid-1', 'threes', fixedNow);
    const [, patch] = update.mock.calls[0];
    expect(patch.scoreCards['uid-1'].upper.threes).toBe(6); // two 3s among [3,3,5,5,5]
    expect(patch.currentPlayerIndex).toBe(1);
    expect(patch.phase).toBe('playing');
    expect(patch.turnStartedAt).toEqual({});
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd functions
npx vitest run src/rooms/scoreCategory.test.ts
```

Expected: FAIL — `patch.turnStartedAt` is `undefined`.

- [ ] **Step 3: Write `turnStartedAt` on every successful score**

Modify `functions/src/rooms/scoreCategory.ts` — change:

```ts
  const next = applyScore(room, category);
  const phase = isGameOver(next) ? 'finished' : 'playing';
  tx.update(roomRef, {
    scoreCards: next.scoreCards,
    dice: next.dice,
    heldDice: next.heldDice,
    rollsLeft: next.rollsLeft,
    currentPlayerIndex: next.currentPlayerIndex,
    phase,
    updatedAt: now(),
  });
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
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/rooms/scoreCategory.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 5: Verify the whole package still builds and passes**

```bash
npm run build
npm test
cd ..
```

- [ ] **Step 6: Commit**

```bash
git add functions/src/rooms/scoreCategory.ts functions/src/rooms/scoreCategory.test.ts
git commit -m "Bump turnStartedAt whenever scoreCategory advances the turn"
```

---

### Task 7: `handleTurnTimeout` Cloud Function

**Files:**
- Create: `functions/src/rooms/handleTurnTimeout.ts`
- Test: `functions/src/rooms/handleTurnTimeout.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `applyTimeoutScore`, `isGameOver` (`@bronx-dice/game-engine`, Task 2 and pre-existing), `db` (`../firebaseAdmin`), `unauthenticated`, `notFound`, `failedPrecondition`, `permissionDenied`, `invalidArgument` (`../errors`), `RoomDocument` (`./types`).
- Produces: `handleTurnTimeoutHandler(tx, roomRef, uid, now?): Promise<void>` and the `handleTurnTimeout` `onCall` export — consumed by `app`'s `roomService.handleTurnTimeout` (Task 9) and `OnlineGameScreen`'s countdown (Task 15).

- [ ] **Step 1: Write the failing tests**

Create `functions/src/rooms/handleTurnTimeout.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import type { Transaction, DocumentReference, Timestamp } from 'firebase-admin/firestore';
import { createEmptyScoreCard } from '@bronx-dice/game-engine';
import { handleTurnTimeoutHandler } from './handleTurnTimeout';
import type { RoomDocument } from './types';

function fakeTransaction(room: RoomDocument | null) {
  const update = vi.fn();
  const tx = {
    get: async () => ({ exists: room !== null, data: () => room }),
    update,
  };
  return { tx: tx as unknown as Transaction, update };
}

const roomRef = {} as DocumentReference;

function fixedNow(millis: number): () => Timestamp {
  return () => ({ toMillis: () => millis }) as unknown as Timestamp;
}

function basePlayingRoom(turnStartedMillis: number): RoomDocument {
  return {
    phase: 'playing',
    hostId: 'uid-1',
    maxPlayers: 2,
    turnTimeLimitSeconds: 15,
    turnStartedAt: { toMillis: () => turnStartedMillis } as unknown as Timestamp,
    players: [
      { id: 'uid-1', name: 'Ola', avatarId: 'fox', ready: true },
      { id: 'uid-2', name: 'Kuba', avatarId: 'wolf', ready: true },
    ],
    scoreCards: {
      'uid-1': createEmptyScoreCard(),
      'uid-2': createEmptyScoreCard(),
    },
    dice: [],
    heldDice: [false, false, false, false, false],
    rollsLeft: 3,
    currentPlayerIndex: 0,
    createdAt: {} as Timestamp,
    updatedAt: {} as Timestamp,
  };
}

describe('handleTurnTimeoutHandler', () => {
  it('zero-fills the first unfilled category and advances the turn once the limit has elapsed', async () => {
    const room = basePlayingRoom(0);
    const { tx, update } = fakeTransaction(room);
    await handleTurnTimeoutHandler(tx, roomRef, 'uid-1', fixedNow(15_000));
    const [, patch] = update.mock.calls[0];
    expect(patch.scoreCards['uid-1'].upper.aces).toBe(0);
    expect(patch.currentPlayerIndex).toBe(1);
    expect(patch.phase).toBe('playing');
    expect(patch.turnStartedAt).toEqual({ toMillis: expect.any(Function) });
  });

  it('rejects when the time limit has not elapsed yet', async () => {
    const room = basePlayingRoom(0);
    const { tx } = fakeTransaction(room);
    await expect(
      handleTurnTimeoutHandler(tx, roomRef, 'uid-1', fixedNow(14_000))
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('can be triggered by any player in the room, not just the current one', async () => {
    const room = basePlayingRoom(0);
    const { tx, update } = fakeTransaction(room);
    await handleTurnTimeoutHandler(tx, roomRef, 'uid-2', fixedNow(20_000));
    expect(update).toHaveBeenCalled();
  });

  it('rejects a caller who is not a player in the room', async () => {
    const room = basePlayingRoom(0);
    const { tx } = fakeTransaction(room);
    await expect(
      handleTurnTimeoutHandler(tx, roomRef, 'uid-9', fixedNow(20_000))
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects when the room is not in the playing phase', async () => {
    const room = { ...basePlayingRoom(0), phase: 'lobby' } as RoomDocument;
    const { tx } = fakeTransaction(room);
    await expect(
      handleTurnTimeoutHandler(tx, roomRef, 'uid-1', fixedNow(20_000))
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('throws not-found when the room does not exist', async () => {
    const { tx } = fakeTransaction(null);
    await expect(
      handleTurnTimeoutHandler(tx, roomRef, 'uid-1', fixedNow(20_000))
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('sets phase to finished when the zero-fill completes the last category', async () => {
    const room = basePlayingRoom(0);
    const filledUpper = { aces: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 };
    const filledLowerExceptChance = {
      pair: 0, twoPair: 0, threeOfKind: 0, fourOfKind: 0,
      smallStraight: 0, largeStraight: 0, fullHouse: 0, yahtzee: 0, chance: null,
    };
    room.scoreCards['uid-1'] = { upper: { ...filledUpper }, lower: { ...filledLowerExceptChance } } as never;
    room.scoreCards['uid-2'] = {
      upper: { ...filledUpper },
      lower: { ...filledLowerExceptChance, chance: 10 },
    } as never;
    const { tx, update } = fakeTransaction(room);
    await handleTurnTimeoutHandler(tx, roomRef, 'uid-1', fixedNow(15_000));
    const [, patch] = update.mock.calls[0];
    expect(patch.scoreCards['uid-1'].lower.chance).toBe(0);
    expect(patch.phase).toBe('finished');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd functions
npx vitest run src/rooms/handleTurnTimeout.test.ts
```

Expected: FAIL — `Cannot find module './handleTurnTimeout'`.

- [ ] **Step 3: Implement `handleTurnTimeout.ts`**

Create `functions/src/rooms/handleTurnTimeout.ts`:

```ts
import { onCall } from 'firebase-functions/v2/https';
import { Timestamp, type Transaction, type DocumentReference } from 'firebase-admin/firestore';
import { applyTimeoutScore, isGameOver } from '@bronx-dice/game-engine';
import { db } from '../firebaseAdmin';
import { unauthenticated, notFound, failedPrecondition, permissionDenied, invalidArgument } from '../errors';
import type { RoomDocument } from './types';

export async function handleTurnTimeoutHandler(
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
  if (room.phase !== 'playing') {
    throw failedPrecondition('Gra nie jest w trakcie rozgrywki.');
  }
  if (!room.players.some((player) => player.id === uid)) {
    throw permissionDenied('Nie jesteś graczem w tym pokoju.');
  }
  const elapsedMs = now().toMillis() - room.turnStartedAt.toMillis();
  if (elapsedMs < room.turnTimeLimitSeconds * 1000) {
    throw failedPrecondition('Czas tury jeszcze nie upłynął.');
  }
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

export const handleTurnTimeout = onCall<{ roomId: string }>(async (request) => {
  if (!request.auth) {
    throw unauthenticated();
  }
  const roomId = request.data?.roomId;
  if (typeof roomId !== 'string' || roomId.length === 0) {
    throw invalidArgument('Brak kodu pokoju.');
  }
  const roomRef = db.collection('rooms').doc(roomId);
  await db.runTransaction((tx) => handleTurnTimeoutHandler(tx, roomRef, request.auth!.uid));
});
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/rooms/handleTurnTimeout.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 5: Export `handleTurnTimeout` from the entry point**

Modify `functions/src/index.ts` — add:

```ts
export { handleTurnTimeout } from './rooms/handleTurnTimeout';
```

- [ ] **Step 6: Verify the whole package still builds, lints, and passes**

```bash
npm run build
npm run lint
npm test
cd ..
```

- [ ] **Step 7: Commit**

```bash
git add functions/src/rooms/handleTurnTimeout.ts functions/src/rooms/handleTurnTimeout.test.ts functions/src/index.ts
git commit -m "Add handleTurnTimeout Cloud Function for the per-turn time limit"
```

---

### Task 8: Extend the Firestore-emulator integration test for ready → start → timeout

**Files:**
- Modify: `functions/src/rooms/rooms.integration.test.ts`

**Interfaces:**
- Consumes: `setReadyHandler` (Task 4), `handleTurnTimeoutHandler` (Task 7), and the updated `createRoomHandler`/`startGameHandler` signatures (Tasks 3, 5).

- [ ] **Step 1: Rewrite the integration test to cover the new lifecycle**

Modify `functions/src/rooms/rooms.integration.test.ts` — replace the full contents:

```ts
import { describe, it, expect } from 'vitest';
import { db } from '../firebaseAdmin';
import { createRoomHandler } from './createRoom';
import { joinRoomHandler } from './joinRoom';
import { setReadyHandler } from './setReady';
import { startGameHandler } from './startGame';
import { rollDiceHandler } from './rollDice';
import { toggleHeldDieHandler } from './toggleHeldDie';
import { scoreCategoryHandler } from './scoreCategory';
import { handleTurnTimeoutHandler } from './handleTurnTimeout';
import type { RoomDocument } from './types';

const hostProfile = { displayName: 'Ola', avatarId: 'fox' };
const guestProfile = { displayName: 'Kuba', avatarId: 'wolf' };

async function getRoom(roomId: string): Promise<RoomDocument> {
  const snapshot = await db.collection('rooms').doc(roomId).get();
  return snapshot.data() as RoomDocument;
}

describe('room lifecycle (Firestore emulator)', () => {
  it('goes from createRoom through scoreCategory to a scored turn', async () => {
    const roomId = await createRoomHandler(db, 'uid-host', hostProfile, 2, 30);
    let room = await getRoom(roomId);
    expect(room.phase).toBe('lobby');
    expect(room.players).toHaveLength(1);

    const roomRef = db.collection('rooms').doc(roomId);
    await db.runTransaction((tx) => joinRoomHandler(tx, roomRef, 'uid-guest', guestProfile));
    room = await getRoom(roomId);
    expect(room.players).toHaveLength(2);

    await db.runTransaction((tx) => setReadyHandler(tx, roomRef, 'uid-host', true));
    await db.runTransaction((tx) => setReadyHandler(tx, roomRef, 'uid-guest', true));

    await db.runTransaction((tx) => startGameHandler(tx, roomRef, 'uid-host'));
    room = await getRoom(roomId);
    expect(room.phase).toBe('playing');
    expect(room.currentPlayerIndex).toBe(0);

    await db.runTransaction((tx) => rollDiceHandler(tx, roomRef, 'uid-host', () => 0));
    room = await getRoom(roomId);
    expect(room.dice).toEqual([1, 1, 1, 1, 1]);
    expect(room.rollsLeft).toBe(2);

    await db.runTransaction((tx) => toggleHeldDieHandler(tx, roomRef, 'uid-host', 0));
    room = await getRoom(roomId);
    expect(room.heldDice[0]).toBe(true);

    // 'aces' (an upper category) rather than a lower category — the room's
    // score cards are freshly created by startGame, and lower categories can
    // only be scored once the whole upper section is filled.
    await db.runTransaction((tx) => scoreCategoryHandler(tx, roomRef, 'uid-host', 'aces'));
    room = await getRoom(roomId);
    expect(room.scoreCards['uid-host'].upper.aces).toBe(5); // five dice showing 1
    expect(room.phase).toBe('playing');
    expect(room.currentPlayerIndex).toBe(1);
  });

  it('rejects startGame until every player is ready, then auto-zeros a timed-out turn', async () => {
    const roomId = await createRoomHandler(db, 'uid-host', hostProfile, 2, 15);
    const roomRef = db.collection('rooms').doc(roomId);
    await db.runTransaction((tx) => joinRoomHandler(tx, roomRef, 'uid-guest', guestProfile));

    await expect(
      db.runTransaction((tx) => startGameHandler(tx, roomRef, 'uid-host'))
    ).rejects.toMatchObject({ code: 'failed-precondition' });

    await db.runTransaction((tx) => setReadyHandler(tx, roomRef, 'uid-host', true));
    await db.runTransaction((tx) => setReadyHandler(tx, roomRef, 'uid-guest', true));
    await db.runTransaction((tx) => startGameHandler(tx, roomRef, 'uid-host'));

    // The just-started turn is well within its 15s limit — any timeout attempt
    // right now must be rejected regardless of who calls it.
    await expect(
      db.runTransaction((tx) => handleTurnTimeoutHandler(tx, roomRef, 'uid-guest'))
    ).rejects.toMatchObject({ code: 'failed-precondition' });

    // Simulate the limit having elapsed by backdating turnStartedAt directly.
    const { Timestamp } = await import('firebase-admin/firestore');
    await roomRef.update({ turnStartedAt: Timestamp.fromMillis(Date.now() - 20_000) });

    await db.runTransaction((tx) => handleTurnTimeoutHandler(tx, roomRef, 'uid-guest'));
    const room = await getRoom(roomId);
    expect(room.scoreCards['uid-host'].upper.aces).toBe(0);
    expect(room.currentPlayerIndex).toBe(1);
  });
});
```

- [ ] **Step 2: Run the integration suite against the emulator**

```bash
cd ..
npm run test:functions-integration
```

Expected: both tests pass against the live Firestore emulator.

- [ ] **Step 3: Commit**

```bash
git add functions/src/rooms/rooms.integration.test.ts
git commit -m "Extend the Firestore-emulator integration test for ready-check and timeout"
```

---

### Task 9: Functions SDK wiring + `roomService.ts`

**Files:**
- Modify: `app/src/firebase/client.ts`
- Create: `app/src/services/roomService.ts`
- Test: `app/src/services/roomService.test.ts`

**Interfaces:**
- Consumes: `httpsCallable` (`firebase/functions`), `functions` (new export from `../firebase/client`).
- Produces: `createRoom`, `joinRoom`, `setReady`, `startGame`, `rollDice`, `toggleHeldDie`, `scoreCategory`, `leaveRoom`, `handleTurnTimeout` — consumed by every online screen (Tasks 13–16).

- [ ] **Step 1: Add the Functions SDK to `firebase/client.ts`**

Modify `app/src/firebase/client.ts` — replace the full contents:

```ts
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}
```

- [ ] **Step 2: Write the failing tests for `roomService`**

Create `app/src/services/roomService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as roomService from './roomService';

const mockHttpsCallable = vi.fn();

vi.mock('firebase/functions', () => ({
  httpsCallable: (...args: unknown[]) => mockHttpsCallable(...args),
}));

vi.mock('../firebase/client', () => ({
  functions: 'the-functions-instance',
}));

describe('roomService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createRoom calls the createRoom callable and returns the roomId', async () => {
    const call = vi.fn().mockResolvedValue({ data: { roomId: 'AAAAA' } });
    mockHttpsCallable.mockReturnValue(call);

    const roomId = await roomService.createRoom({ maxPlayers: 3, turnTimeLimitSeconds: 30 });

    expect(mockHttpsCallable).toHaveBeenCalledWith('the-functions-instance', 'createRoom');
    expect(call).toHaveBeenCalledWith({ maxPlayers: 3, turnTimeLimitSeconds: 30 });
    expect(roomId).toBe('AAAAA');
  });

  it('joinRoom calls the joinRoom callable with the roomId', async () => {
    const call = vi.fn().mockResolvedValue({ data: undefined });
    mockHttpsCallable.mockReturnValue(call);

    await roomService.joinRoom('AAAAA');

    expect(mockHttpsCallable).toHaveBeenCalledWith('the-functions-instance', 'joinRoom');
    expect(call).toHaveBeenCalledWith({ roomId: 'AAAAA' });
  });

  it('setReady calls the setReady callable with roomId and ready', async () => {
    const call = vi.fn().mockResolvedValue({ data: undefined });
    mockHttpsCallable.mockReturnValue(call);

    await roomService.setReady('AAAAA', true);

    expect(call).toHaveBeenCalledWith({ roomId: 'AAAAA', ready: true });
  });

  it('startGame calls the startGame callable with the roomId', async () => {
    const call = vi.fn().mockResolvedValue({ data: undefined });
    mockHttpsCallable.mockReturnValue(call);

    await roomService.startGame('AAAAA');

    expect(call).toHaveBeenCalledWith({ roomId: 'AAAAA' });
  });

  it('rollDice calls the rollDice callable with the roomId', async () => {
    const call = vi.fn().mockResolvedValue({ data: undefined });
    mockHttpsCallable.mockReturnValue(call);

    await roomService.rollDice('AAAAA');

    expect(call).toHaveBeenCalledWith({ roomId: 'AAAAA' });
  });

  it('toggleHeldDie calls the toggleHeldDie callable with roomId and dieIndex', async () => {
    const call = vi.fn().mockResolvedValue({ data: undefined });
    mockHttpsCallable.mockReturnValue(call);

    await roomService.toggleHeldDie('AAAAA', 2);

    expect(call).toHaveBeenCalledWith({ roomId: 'AAAAA', dieIndex: 2 });
  });

  it('scoreCategory calls the scoreCategory callable with roomId and category', async () => {
    const call = vi.fn().mockResolvedValue({ data: undefined });
    mockHttpsCallable.mockReturnValue(call);

    await roomService.scoreCategory('AAAAA', 'chance');

    expect(call).toHaveBeenCalledWith({ roomId: 'AAAAA', category: 'chance' });
  });

  it('leaveRoom calls the leaveRoom callable with the roomId', async () => {
    const call = vi.fn().mockResolvedValue({ data: undefined });
    mockHttpsCallable.mockReturnValue(call);

    await roomService.leaveRoom('AAAAA');

    expect(call).toHaveBeenCalledWith({ roomId: 'AAAAA' });
  });

  it('handleTurnTimeout calls the handleTurnTimeout callable with the roomId', async () => {
    const call = vi.fn().mockResolvedValue({ data: undefined });
    mockHttpsCallable.mockReturnValue(call);

    await roomService.handleTurnTimeout('AAAAA');

    expect(call).toHaveBeenCalledWith({ roomId: 'AAAAA' });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd app
npx vitest run src/services/roomService.test.ts
```

Expected: FAIL — `Cannot find module './roomService'`.

- [ ] **Step 4: Implement `roomService.ts`**

Create `app/src/services/roomService.ts`:

```ts
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

export async function startGame(roomId: string): Promise<void> {
  const call = httpsCallable<{ roomId: string }, void>(functions, 'startGame');
  await call({ roomId });
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
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run src/services/roomService.test.ts
```

Expected: PASS (9 tests).

- [ ] **Step 6: Verify the whole `app` workspace still builds and passes**

```bash
npm run build
npm test
cd ..
```

- [ ] **Step 7: Commit**

```bash
git add app/src/firebase/client.ts app/src/services/roomService.ts app/src/services/roomService.test.ts
git commit -m "Add Functions SDK wiring and roomService client wrapper"
```

---

### Task 10: `app/src/types/room.ts` + `useRoom` hook

**Files:**
- Create: `app/src/types/room.ts`
- Create: `app/src/hooks/useRoom.ts`
- Test: `app/src/hooks/useRoom.test.ts`

**Interfaces:**
- Produces: `RoomPlayer`, `RoomDocument`, `TURN_TIME_LIMIT_OPTIONS` (`app/src/types/room.ts` — client-side mirror of `functions/src/rooms/types.ts`, same duplication pattern as `PlayerProfile`). `useRoom(roomId: string): { room: RoomDocument | null; loading: boolean; notFound: boolean }` — consumed by `OnlineRoomScreen` (Task 16).

- [ ] **Step 1: Create the client-side room types**

Create `app/src/types/room.ts`:

```ts
import type { GameState, Player } from '@bronx-dice/game-engine';
import type { Timestamp } from 'firebase/firestore';

export interface RoomPlayer extends Player {
  avatarId: string;
  ready: boolean;
}

export const TURN_TIME_LIMIT_OPTIONS = [15, 30, 45, 60] as const;

interface RoomBase {
  hostId: string;
  maxPlayers: number;
  turnTimeLimitSeconds: (typeof TURN_TIME_LIMIT_OPTIONS)[number];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type RoomDocument =
  | (RoomBase & { phase: 'lobby'; players: RoomPlayer[] })
  | (RoomBase & { phase: 'playing' | 'finished' } & GameState & {
        turnStartedAt: Timestamp;
      });
```

- [ ] **Step 2: Write the failing tests for `useRoom`**

Create `app/src/hooks/useRoom.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useRoom } from './useRoom';

const mockDoc = vi.fn();
const mockOnSnapshot = vi.fn();

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
}));

vi.mock('../firebase/client', () => ({
  db: 'the-db-instance',
}));

describe('useRoom', () => {
  it('subscribes to rooms/{roomId} and exposes the latest document', async () => {
    mockDoc.mockReturnValue('room-ref');
    let capturedCallback: (snapshot: unknown) => void = () => {};
    mockOnSnapshot.mockImplementation((_ref, callback) => {
      capturedCallback = callback;
      return () => {};
    });

    const { result } = renderHook(() => useRoom('AAAAA'));

    expect(mockDoc).toHaveBeenCalledWith('the-db-instance', 'rooms', 'AAAAA');
    expect(result.current.loading).toBe(true);

    capturedCallback({ exists: () => true, data: () => ({ phase: 'lobby' }) });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.room).toEqual({ phase: 'lobby' });
    expect(result.current.notFound).toBe(false);
  });

  it('sets notFound when the room document does not exist', async () => {
    mockDoc.mockReturnValue('room-ref');
    let capturedCallback: (snapshot: unknown) => void = () => {};
    mockOnSnapshot.mockImplementation((_ref, callback) => {
      capturedCallback = callback;
      return () => {};
    });

    const { result } = renderHook(() => useRoom('AAAAA'));
    capturedCallback({ exists: () => false });

    await waitFor(() => expect(result.current.notFound).toBe(true));
    expect(result.current.room).toBeNull();
  });

  it('unsubscribes on unmount', () => {
    mockDoc.mockReturnValue('room-ref');
    const unsubscribe = vi.fn();
    mockOnSnapshot.mockReturnValue(unsubscribe);

    const { unmount } = renderHook(() => useRoom('AAAAA'));
    unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd app
npx vitest run src/hooks/useRoom.test.ts
```

Expected: FAIL — `Cannot find module './useRoom'`.

- [ ] **Step 4: Implement `useRoom.ts`**

Create `app/src/hooks/useRoom.ts`:

```ts
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/client';
import type { RoomDocument } from '../types/room';

interface UseRoomResult {
  room: RoomDocument | null;
  loading: boolean;
  notFound: boolean;
}

export function useRoom(roomId: string): UseRoomResult {
  const [room, setRoom] = useState<RoomDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    const unsubscribe = onSnapshot(doc(db, 'rooms', roomId), (snapshot) => {
      if (!snapshot.exists()) {
        setRoom(null);
        setNotFound(true);
        setLoading(false);
        return;
      }
      setRoom(snapshot.data() as RoomDocument);
      setNotFound(false);
      setLoading(false);
    });
    return unsubscribe;
  }, [roomId]);

  return { room, loading, notFound };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run src/hooks/useRoom.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
cd ..
git add app/src/types/room.ts app/src/hooks/useRoom.ts app/src/hooks/useRoom.test.ts
git commit -m "Add client-side room types and the useRoom Firestore subscription hook"
```

---

### Task 11: `useCountdown` hook

**Files:**
- Create: `app/src/hooks/useCountdown.ts`
- Test: `app/src/hooks/useCountdown.test.ts`

**Interfaces:**
- Consumes: nothing beyond `firebase/firestore`'s `Timestamp` type.
- Produces: `useCountdown(turnStartedAt: Timestamp, turnTimeLimitSeconds: number): number` (remaining whole seconds, clamped at 0) — consumed by `OnlineGameScreen` (Task 15).

- [ ] **Step 1: Write the failing tests**

Create `app/src/hooks/useCountdown.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Timestamp } from 'firebase/firestore';
import { useCountdown } from './useCountdown';

function fakeTimestamp(millis: number): Timestamp {
  return { toMillis: () => millis } as Timestamp;
}

describe('useCountdown', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the full limit right after the turn starts', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const { result } = renderHook(() => useCountdown(fakeTimestamp(1_000_000), 30));
    expect(result.current).toBe(30);
  });

  it('counts down as time passes', () => {
    vi.useFakeTimers();
    const start = Date.now();
    const { result } = renderHook(() => useCountdown(fakeTimestamp(start), 30));

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current).toBe(25);
  });

  it('never goes below zero', () => {
    vi.useFakeTimers();
    const start = Date.now();
    const { result } = renderHook(() => useCountdown(fakeTimestamp(start), 30));

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(result.current).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd app
npx vitest run src/hooks/useCountdown.test.ts
```

Expected: FAIL — `Cannot find module './useCountdown'`.

- [ ] **Step 3: Implement `useCountdown.ts`**

Create `app/src/hooks/useCountdown.ts`:

```ts
import { useEffect, useState } from 'react';
import type { Timestamp } from 'firebase/firestore';

function computeRemaining(turnStartedAt: Timestamp, turnTimeLimitSeconds: number): number {
  const elapsedSeconds = (Date.now() - turnStartedAt.toMillis()) / 1000;
  return Math.max(0, Math.ceil(turnTimeLimitSeconds - elapsedSeconds));
}

export function useCountdown(turnStartedAt: Timestamp, turnTimeLimitSeconds: number): number {
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    computeRemaining(turnStartedAt, turnTimeLimitSeconds)
  );

  useEffect(() => {
    setRemainingSeconds(computeRemaining(turnStartedAt, turnTimeLimitSeconds));
    const interval = setInterval(() => {
      setRemainingSeconds(computeRemaining(turnStartedAt, turnTimeLimitSeconds));
    }, 1000);
    return () => clearInterval(interval);
  }, [turnStartedAt, turnTimeLimitSeconds]);

  return remainingSeconds;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/hooks/useCountdown.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd ..
git add app/src/hooks/useCountdown.ts app/src/hooks/useCountdown.test.ts
git commit -m "Add useCountdown hook for the per-turn time limit display"
```

---

### Task 12: `interactive` prop on `DiceTray`, `RollButton`, `ScoreBoard`

**Files:**
- Modify: `app/src/components/DiceTray.tsx`
- Modify: `app/src/components/DiceTray.test.tsx`
- Modify: `app/src/components/RollButton.tsx`
- Modify: `app/src/components/RollButton.test.tsx`
- Modify: `app/src/components/ScoreBoard.tsx`
- Modify: `app/src/components/ScoreBoard.test.tsx`

**Interfaces:**
- Produces: optional `interactive?: boolean` prop (default `true`) on all three components — consumed by `OnlineGameScreen` (Task 15). Local `GameScreen` passes no `interactive` prop and keeps its current behavior unchanged.

- [ ] **Step 1: Write the failing tests**

Modify `app/src/components/DiceTray.test.tsx` — add inside the first `describe('DiceTray', ...)` block:

```ts
  it('disables the dice when interactive is false even after rolling', () => {
    const dice: DiceValue[] = [1, 2, 3, 4, 5];
    render(
      <DiceTray
        dice={dice}
        heldDice={[false, false, false, false, false]}
        onToggleHeld={() => {}}
        interactive={false}
      />
    );
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
  });
```

Modify `app/src/components/RollButton.test.tsx` — add:

```tsx
  it('is disabled when interactive is false even with rolls remaining', () => {
    render(<RollButton rollsLeft={3} onRoll={() => {}} interactive={false} />);
    expect(screen.getByRole('button', { name: 'Rzuć kośćmi' })).toBeDisabled();
  });
```

Modify `app/src/components/ScoreBoard.test.tsx` — add inside the first `describe('ScoreBoard', ...)` block:

```tsx
  it('hides the clickable preview when interactive is false, even for the current player', () => {
    const state = createGameState(['Ola', 'Kuba']);
    const dice: DiceValue[] = [3, 3, 1, 2, 5];
    render(
      <ScoreBoard
        players={state.players}
        scoreCards={state.scoreCards}
        currentPlayerId={state.players[0].id}
        dice={dice}
        rollsLeft={3}
        interactive={false}
        onScore={() => {}}
      />
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd app
npx vitest run src/components/DiceTray.test.tsx src/components/RollButton.test.tsx src/components/ScoreBoard.test.tsx
```

Expected: FAIL — `interactive` prop doesn't exist yet, so all three new tests fail (dice/button remain enabled, or extra buttons render).

- [ ] **Step 3: Add `interactive` to `DiceTray`**

Modify `app/src/components/DiceTray.tsx` — change:

```tsx
interface DiceTrayProps {
  dice: DiceValue[];
  heldDice: boolean[];
  onToggleHeld: (index: number) => void;
}
```

to:

```tsx
interface DiceTrayProps {
  dice: DiceValue[];
  heldDice: boolean[];
  onToggleHeld: (index: number) => void;
  interactive?: boolean;
}
```

Change:

```tsx
function DiceTray({ dice, heldDice, onToggleHeld }: DiceTrayProps) {
```

to:

```tsx
function DiceTray({ dice, heldDice, onToggleHeld, interactive = true }: DiceTrayProps) {
```

Change:

```tsx
            disabled={!hasBeenRolled}
```

to:

```tsx
            disabled={!hasBeenRolled || !interactive}
```

- [ ] **Step 4: Add `interactive` to `RollButton`**

Modify `app/src/components/RollButton.tsx` — replace the full contents:

```tsx
interface RollButtonProps {
  rollsLeft: number;
  onRoll: () => void;
  interactive?: boolean;
}

function RollButton({ rollsLeft, onRoll, interactive = true }: RollButtonProps) {
  return (
    <div className="roll-button">
      <button type="button" disabled={rollsLeft === 0 || !interactive} onClick={onRoll}>
        Rzuć kośćmi
      </button>
      <p>Pozostałe rzuty: {rollsLeft}</p>
    </div>
  );
}

export default RollButton;
```

- [ ] **Step 5: Add `interactive` to `ScoreBoard`**

Modify `app/src/components/ScoreBoard.tsx` — change:

```tsx
interface ScoreBoardProps {
  players: Player[];
  scoreCards: Record<string, PlayerScoreCard>;
  currentPlayerId: string;
  dice: DiceValue[];
  rollsLeft: number;
  onScore: (category: ScoreCategory) => void;
}
```

to:

```tsx
interface ScoreBoardProps {
  players: Player[];
  scoreCards: Record<string, PlayerScoreCard>;
  currentPlayerId: string;
  dice: DiceValue[];
  rollsLeft: number;
  interactive?: boolean;
  onScore: (category: ScoreCategory) => void;
}
```

Change:

```tsx
function ScoreBoard({
  players,
  scoreCards,
  currentPlayerId,
  dice,
  rollsLeft,
  onScore,
}: ScoreBoardProps) {
```

to:

```tsx
function ScoreBoard({
  players,
  scoreCards,
  currentPlayerId,
  dice,
  rollsLeft,
  interactive = true,
  onScore,
}: ScoreBoardProps) {
```

Change:

```tsx
        const clickable =
          isCurrentPlayer && hasRolled && canScoreCategory(scoreCard, category);
```

to:

```tsx
        const clickable =
          isCurrentPlayer &&
          interactive &&
          hasRolled &&
          canScoreCategory(scoreCard, category);
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npx vitest run src/components/DiceTray.test.tsx src/components/RollButton.test.tsx src/components/ScoreBoard.test.tsx
```

Expected: PASS (all pre-existing tests plus the 3 new ones).

- [ ] **Step 7: Verify the whole `app` workspace still builds, lints, and passes (local mode unaffected)**

```bash
npm run build
npm run lint
npm test
cd ..
```

- [ ] **Step 8: Commit**

```bash
git add app/src/components/DiceTray.tsx app/src/components/DiceTray.test.tsx app/src/components/RollButton.tsx app/src/components/RollButton.test.tsx app/src/components/ScoreBoard.tsx app/src/components/ScoreBoard.test.tsx
git commit -m "Add interactive prop to DiceTray, RollButton, and ScoreBoard for turn-gating"
```

---

### Task 13: `OnlineMenuScreen`

**Files:**
- Create: `app/src/components/OnlineMenuScreen.tsx`
- Test: `app/src/components/OnlineMenuScreen.test.tsx`

**Interfaces:**
- Consumes: `createRoom`, `joinRoom` (`../services/roomService`, Task 9).
- Produces: `OnlineMenuScreen({ onRoomJoined: (roomId: string) => void; onOpenProfile: () => void })` — consumed by `App.tsx` (Task 16).

- [ ] **Step 1: Write the failing tests**

Create `app/src/components/OnlineMenuScreen.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OnlineMenuScreen from './OnlineMenuScreen';
import { createRoom, joinRoom } from '../services/roomService';

vi.mock('../services/roomService', () => ({
  createRoom: vi.fn(),
  joinRoom: vi.fn(),
}));

describe('OnlineMenuScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a room with the selected settings and reports the new roomId', async () => {
    const user = userEvent.setup();
    vi.mocked(createRoom).mockResolvedValue('AAAAA');
    const onRoomJoined = vi.fn();
    render(<OnlineMenuScreen onRoomJoined={onRoomJoined} onOpenProfile={() => {}} />);

    await user.selectOptions(screen.getByLabelText('Liczba graczy'), '3');
    await user.selectOptions(screen.getByLabelText('Limit czasu na turę'), '45');
    await user.click(screen.getByRole('button', { name: 'Stwórz pokój' }));

    expect(createRoom).toHaveBeenCalledWith({ maxPlayers: 3, turnTimeLimitSeconds: 45 });
    expect(onRoomJoined).toHaveBeenCalledWith('AAAAA');
  });

  it('joins a room using an uppercased, trimmed room code', async () => {
    const user = userEvent.setup();
    vi.mocked(joinRoom).mockResolvedValue(undefined);
    const onRoomJoined = vi.fn();
    render(<OnlineMenuScreen onRoomJoined={onRoomJoined} onOpenProfile={() => {}} />);

    await user.type(screen.getByLabelText('Kod pokoju'), '  abcde  ');
    await user.click(screen.getByRole('button', { name: 'Dołącz' }));

    expect(joinRoom).toHaveBeenCalledWith('ABCDE');
    expect(onRoomJoined).toHaveBeenCalledWith('ABCDE');
  });

  it('shows the error message when joining fails', async () => {
    const user = userEvent.setup();
    vi.mocked(joinRoom).mockRejectedValue(new Error('Pokój nie istnieje.'));
    render(<OnlineMenuScreen onRoomJoined={() => {}} onOpenProfile={() => {}} />);

    await user.type(screen.getByLabelText('Kod pokoju'), 'ZZZZZ');
    await user.click(screen.getByRole('button', { name: 'Dołącz' }));

    expect(await screen.findByText('Pokój nie istnieje.')).toBeInTheDocument();
  });

  it('calls onOpenProfile when the profile button is clicked', async () => {
    const user = userEvent.setup();
    const onOpenProfile = vi.fn();
    render(<OnlineMenuScreen onRoomJoined={() => {}} onOpenProfile={onOpenProfile} />);

    await user.click(screen.getByRole('button', { name: 'Profil' }));

    expect(onOpenProfile).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd app
npx vitest run src/components/OnlineMenuScreen.test.tsx
```

Expected: FAIL — `Cannot find module './OnlineMenuScreen'`.

- [ ] **Step 3: Implement `OnlineMenuScreen.tsx`**

Create `app/src/components/OnlineMenuScreen.tsx`:

```tsx
import { useState } from 'react';
import { createRoom, joinRoom } from '../services/roomService';

const PLAYER_COUNT_OPTIONS = [2, 3, 4, 5, 6];
const TURN_TIME_LIMIT_OPTIONS = [15, 30, 45, 60] as const;

interface OnlineMenuScreenProps {
  onRoomJoined: (roomId: string) => void;
  onOpenProfile: () => void;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Coś poszło nie tak. Spróbuj ponownie.';
}

function OnlineMenuScreen({ onRoomJoined, onOpenProfile }: OnlineMenuScreenProps) {
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [turnTimeLimitSeconds, setTurnTimeLimitSeconds] = useState<number>(30);
  const [roomCode, setRoomCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateRoom = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const roomId = await createRoom({ maxPlayers, turnTimeLimitSeconds });
      onRoomJoined(roomId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinRoom = async () => {
    const normalizedCode = roomCode.trim().toUpperCase();
    if (normalizedCode.length === 0) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await joinRoom(normalizedCode);
      onRoomJoined(normalizedCode);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="online-menu-screen">
      <h1>Gra online</h1>
      {error && <p className="auth-error">{error}</p>}

      <section>
        <h2>Stwórz pokój</h2>
        <label htmlFor="online-max-players">Liczba graczy</label>
        <select
          id="online-max-players"
          value={maxPlayers}
          onChange={(event) => setMaxPlayers(Number(event.target.value))}
        >
          {PLAYER_COUNT_OPTIONS.map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </select>
        <label htmlFor="online-turn-time-limit">Limit czasu na turę</label>
        <select
          id="online-turn-time-limit"
          value={turnTimeLimitSeconds}
          onChange={(event) => setTurnTimeLimitSeconds(Number(event.target.value))}
        >
          {TURN_TIME_LIMIT_OPTIONS.map((seconds) => (
            <option key={seconds} value={seconds}>
              {seconds} s
            </option>
          ))}
        </select>
        <button type="button" disabled={submitting} onClick={handleCreateRoom}>
          Stwórz pokój
        </button>
      </section>

      <section>
        <h2>Dołącz kodem</h2>
        <label htmlFor="online-room-code">Kod pokoju</label>
        <input
          id="online-room-code"
          type="text"
          value={roomCode}
          onChange={(event) => setRoomCode(event.target.value)}
        />
        <button type="button" disabled={submitting} onClick={handleJoinRoom}>
          Dołącz
        </button>
      </section>

      <button type="button" onClick={onOpenProfile}>
        Profil
      </button>
    </div>
  );
}

export default OnlineMenuScreen;
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/components/OnlineMenuScreen.test.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd ..
git add app/src/components/OnlineMenuScreen.tsx app/src/components/OnlineMenuScreen.test.tsx
git commit -m "Add OnlineMenuScreen for creating and joining rooms"
```

---

### Task 14: `RoomLobbyScreen`

**Files:**
- Create: `app/src/components/RoomLobbyScreen.tsx`
- Test: `app/src/components/RoomLobbyScreen.test.tsx`

**Interfaces:**
- Consumes: `setReady`, `startGame`, `leaveRoom` (`../services/roomService`, Task 9), `avatarSrc` (`./avatarOptions`), `MIN_PLAYERS` (`@bronx-dice/game-engine`), `RoomDocument` (`../types/room`, Task 10).
- Produces: `RoomLobbyScreen({ room: Extract<RoomDocument, {phase:'lobby'}>; roomId: string; ownUid: string; onLeft: () => void })` — consumed by `OnlineRoomScreen` (Task 16).

- [ ] **Step 1: Write the failing tests**

Create `app/src/components/RoomLobbyScreen.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RoomLobbyScreen from './RoomLobbyScreen';
import { setReady, startGame, leaveRoom } from '../services/roomService';
import type { RoomDocument } from '../types/room';

vi.mock('../services/roomService', () => ({
  setReady: vi.fn(),
  startGame: vi.fn(),
  leaveRoom: vi.fn(),
}));

type LobbyRoom = Extract<RoomDocument, { phase: 'lobby' }>;

function lobbyRoom(overrides: Partial<LobbyRoom> = {}): LobbyRoom {
  return {
    phase: 'lobby',
    hostId: 'uid-1',
    maxPlayers: 4,
    turnTimeLimitSeconds: 30,
    players: [
      { id: 'uid-1', name: 'Ola', avatarId: 'avatar01', ready: false },
      { id: 'uid-2', name: 'Kuba', avatarId: 'avatar02', ready: true },
    ],
    createdAt: {} as never,
    updatedAt: {} as never,
    ...overrides,
  };
}

describe('RoomLobbyScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists every player with their name and marks the host', () => {
    render(<RoomLobbyScreen room={lobbyRoom()} roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);
    expect(screen.getByText('Ola')).toBeInTheDocument();
    expect(screen.getByText('Kuba')).toBeInTheDocument();
    expect(screen.getByText('Host')).toBeInTheDocument();
  });

  it('toggles own readiness when the ready button is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(setReady).mockResolvedValue(undefined);
    render(<RoomLobbyScreen room={lobbyRoom()} roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Gotowy' }));
    expect(setReady).toHaveBeenCalledWith('AAAAA', true);
  });

  it('disables Start for the host until every player is ready', () => {
    render(<RoomLobbyScreen room={lobbyRoom()} roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);
    expect(screen.getByRole('button', { name: 'Rozpocznij grę' })).toBeDisabled();
  });

  it('enables Start for the host once every player is ready', () => {
    const room = lobbyRoom({
      players: [
        { id: 'uid-1', name: 'Ola', avatarId: 'avatar01', ready: true },
        { id: 'uid-2', name: 'Kuba', avatarId: 'avatar02', ready: true },
      ],
    });
    render(<RoomLobbyScreen room={room} roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);
    expect(screen.getByRole('button', { name: 'Rozpocznij grę' })).not.toBeDisabled();
  });

  it('does not show a Start button to a non-host player', () => {
    render(<RoomLobbyScreen room={lobbyRoom()} roomId="AAAAA" ownUid="uid-2" onLeft={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Rozpocznij grę' })).not.toBeInTheDocument();
  });

  it('calls startGame when the host clicks Start', async () => {
    const user = userEvent.setup();
    vi.mocked(startGame).mockResolvedValue(undefined);
    const room = lobbyRoom({
      players: [
        { id: 'uid-1', name: 'Ola', avatarId: 'avatar01', ready: true },
        { id: 'uid-2', name: 'Kuba', avatarId: 'avatar02', ready: true },
      ],
    });
    render(<RoomLobbyScreen room={room} roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Rozpocznij grę' }));
    expect(startGame).toHaveBeenCalledWith('AAAAA');
  });

  it('leaves the room and calls onLeft', async () => {
    const user = userEvent.setup();
    vi.mocked(leaveRoom).mockResolvedValue(undefined);
    const onLeft = vi.fn();
    render(<RoomLobbyScreen room={lobbyRoom()} roomId="AAAAA" ownUid="uid-1" onLeft={onLeft} />);
    await user.click(screen.getByRole('button', { name: 'Opuść pokój' }));
    expect(leaveRoom).toHaveBeenCalledWith('AAAAA');
    expect(onLeft).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd app
npx vitest run src/components/RoomLobbyScreen.test.tsx
```

Expected: FAIL — `Cannot find module './RoomLobbyScreen'`.

- [ ] **Step 3: Implement `RoomLobbyScreen.tsx`**

Create `app/src/components/RoomLobbyScreen.tsx`:

```tsx
import { useState } from 'react';
import { MIN_PLAYERS } from '@bronx-dice/game-engine';
import { avatarSrc } from './avatarOptions';
import { setReady, startGame, leaveRoom } from '../services/roomService';
import type { RoomDocument } from '../types/room';

interface RoomLobbyScreenProps {
  room: Extract<RoomDocument, { phase: 'lobby' }>;
  roomId: string;
  ownUid: string;
  onLeft: () => void;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Coś poszło nie tak. Spróbuj ponownie.';
}

function RoomLobbyScreen({ room, roomId, ownUid, onLeft }: RoomLobbyScreenProps) {
  const [error, setError] = useState<string | null>(null);
  const ownPlayer = room.players.find((player) => player.id === ownUid);
  const isHost = room.hostId === ownUid;
  const allReady = room.players.every((player) => player.ready);
  const canStart = isHost && allReady && room.players.length >= MIN_PLAYERS;

  const handleToggleReady = async () => {
    if (!ownPlayer) {
      return;
    }
    setError(null);
    try {
      await setReady(roomId, !ownPlayer.ready);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const handleStart = async () => {
    setError(null);
    try {
      await startGame(roomId);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const handleLeave = async () => {
    setError(null);
    try {
      await leaveRoom(roomId);
      onLeft();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="room-lobby-screen">
      <h1>Pokój {roomId}</h1>
      {error && <p className="auth-error">{error}</p>}
      <ul className="room-player-list">
        {room.players.map((player) => (
          <li key={player.id}>
            <img className="room-player-avatar" src={avatarSrc(player.avatarId)} alt="" />
            <span>{player.name}</span>
            {player.id === room.hostId && <span className="room-host-badge">Host</span>}
            <span>{player.ready ? 'Gotowy' : 'Niegotowy'}</span>
          </li>
        ))}
      </ul>
      {ownPlayer && (
        <button type="button" onClick={handleToggleReady}>
          {ownPlayer.ready ? 'Niegotowy' : 'Gotowy'}
        </button>
      )}
      {isHost && (
        <button type="button" disabled={!canStart} onClick={handleStart}>
          Rozpocznij grę
        </button>
      )}
      <button type="button" onClick={handleLeave}>
        Opuść pokój
      </button>
    </div>
  );
}

export default RoomLobbyScreen;
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/components/RoomLobbyScreen.test.tsx
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
cd ..
git add app/src/components/RoomLobbyScreen.tsx app/src/components/RoomLobbyScreen.test.tsx
git commit -m "Add RoomLobbyScreen with ready-check and host start control"
```

---

### Task 15: `OnlineGameScreen`

**Files:**
- Create: `app/src/components/OnlineGameScreen.tsx`
- Test: `app/src/components/OnlineGameScreen.test.tsx`

**Interfaces:**
- Consumes: `rollDice`, `toggleHeldDie`, `scoreCategory`, `handleTurnTimeout` (`../services/roomService`, Task 9), `useCountdown` (`../hooks/useCountdown`, Task 11), `avatarSrc` (`./avatarOptions`), `DiceTray`/`RollButton`/`ScoreBoard` with `interactive` (Task 12), `RoomDocument`, `RoomPlayer` (`../types/room`, Task 10).
- Produces: `OnlineGameScreen({ room: Extract<RoomDocument, {phase:'playing'}>; roomId: string; ownUid: string })` — consumed by `OnlineRoomScreen` (Task 16).

- [ ] **Step 1: Write the failing tests**

Create `app/src/components/OnlineGameScreen.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createEmptyScoreCard } from '@bronx-dice/game-engine';
import OnlineGameScreen from './OnlineGameScreen';
import {
  rollDice,
  toggleHeldDie,
  scoreCategory,
  handleTurnTimeout,
} from '../services/roomService';
import type { RoomDocument } from '../types/room';

vi.mock('../services/roomService', () => ({
  rollDice: vi.fn().mockResolvedValue(undefined),
  toggleHeldDie: vi.fn().mockResolvedValue(undefined),
  scoreCategory: vi.fn().mockResolvedValue(undefined),
  handleTurnTimeout: vi.fn().mockResolvedValue(undefined),
}));

type PlayingRoom = Extract<RoomDocument, { phase: 'playing' }>;

function playingRoom(overrides: Partial<PlayingRoom> = {}): PlayingRoom {
  return {
    phase: 'playing',
    hostId: 'uid-1',
    maxPlayers: 2,
    turnTimeLimitSeconds: 30,
    turnStartedAt: { toMillis: () => Date.now() } as never,
    players: [
      { id: 'uid-1', name: 'Ola', avatarId: 'avatar01', ready: true },
      { id: 'uid-2', name: 'Kuba', avatarId: 'avatar02', ready: true },
    ],
    scoreCards: {
      'uid-1': createEmptyScoreCard(),
      'uid-2': createEmptyScoreCard(),
    },
    dice: [],
    heldDice: [false, false, false, false, false],
    rollsLeft: 3,
    currentPlayerIndex: 0,
    createdAt: {} as never,
    updatedAt: {} as never,
    ...overrides,
  };
}

describe('OnlineGameScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("shows the current player's name and calls rollDice on their own turn", async () => {
    const user = userEvent.setup();
    render(<OnlineGameScreen room={playingRoom()} roomId="AAAAA" ownUid="uid-1" />);

    expect(screen.getByText(/Tura: Ola/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rzuć kośćmi' }));
    expect(rollDice).toHaveBeenCalledWith('AAAAA');
  });

  it("disables the roll button when it is not the viewer's turn", () => {
    render(<OnlineGameScreen room={playingRoom()} roomId="AAAAA" ownUid="uid-2" />);
    expect(screen.getByRole('button', { name: 'Rzuć kośćmi' })).toBeDisabled();
  });

  it('calls handleTurnTimeout once the countdown reaches zero', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    const room = playingRoom({
      turnStartedAt: { toMillis: () => now } as never,
      turnTimeLimitSeconds: 15,
    });
    render(<OnlineGameScreen room={room} roomId="AAAAA" ownUid="uid-1" />);

    act(() => {
      vi.setSystemTime(now + 16_000);
      vi.advanceTimersByTime(16_000);
    });

    expect(handleTurnTimeout).toHaveBeenCalledWith('AAAAA');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd app
npx vitest run src/components/OnlineGameScreen.test.tsx
```

Expected: FAIL — `Cannot find module './OnlineGameScreen'`.

- [ ] **Step 3: Implement `OnlineGameScreen.tsx`**

Create `app/src/components/OnlineGameScreen.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import type { ScoreCategory } from '@bronx-dice/game-engine';
import DiceTray from './DiceTray';
import RollButton from './RollButton';
import ScoreBoard from './ScoreBoard';
import { avatarSrc } from './avatarOptions';
import { useCountdown } from '../hooks/useCountdown';
import {
  rollDice,
  toggleHeldDie,
  scoreCategory,
  handleTurnTimeout,
} from '../services/roomService';
import type { RoomDocument, RoomPlayer } from '../types/room';

interface OnlineGameScreenProps {
  room: Extract<RoomDocument, { phase: 'playing' }>;
  roomId: string;
  ownUid: string;
}

function OnlineGameScreen({ room, roomId, ownUid }: OnlineGameScreenProps) {
  const currentPlayer = room.players[room.currentPlayerIndex] as RoomPlayer;
  const isOwnTurn = currentPlayer.id === ownUid;
  const remainingSeconds = useCountdown(room.turnStartedAt, room.turnTimeLimitSeconds);
  const timeoutFiredForTurn = useRef<number | null>(null);

  useEffect(() => {
    if (remainingSeconds > 0) {
      return;
    }
    if (timeoutFiredForTurn.current === room.currentPlayerIndex) {
      return;
    }
    timeoutFiredForTurn.current = room.currentPlayerIndex;
    handleTurnTimeout(roomId).catch(() => {
      // Expected when another connected player's client already handled
      // this timeout first — the server rejects the now-stale attempt.
    });
  }, [remainingSeconds, room.currentPlayerIndex, roomId]);

  return (
    <div className="online-game-screen">
      <h2>
        Tura: {currentPlayer.name}
        <img className="online-turn-avatar" src={avatarSrc(currentPlayer.avatarId)} alt="" />
      </h2>
      <p className="online-turn-countdown">Pozostały czas: {remainingSeconds}s</p>
      <DiceTray
        dice={room.dice}
        heldDice={room.heldDice}
        interactive={isOwnTurn}
        onToggleHeld={(index) => {
          void toggleHeldDie(roomId, index);
        }}
      />
      <RollButton
        rollsLeft={room.rollsLeft}
        interactive={isOwnTurn}
        onRoll={() => {
          void rollDice(roomId);
        }}
      />
      <ScoreBoard
        players={room.players}
        scoreCards={room.scoreCards}
        currentPlayerId={currentPlayer.id}
        dice={room.dice}
        rollsLeft={room.rollsLeft}
        interactive={isOwnTurn}
        onScore={(category: ScoreCategory) => {
          void scoreCategory(roomId, category);
        }}
      />
    </div>
  );
}

export default OnlineGameScreen;
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/components/OnlineGameScreen.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd ..
git add app/src/components/OnlineGameScreen.tsx app/src/components/OnlineGameScreen.test.tsx
git commit -m "Add OnlineGameScreen wiring the game board to Firestore"
```

---

### Task 16: `OnlineRoomScreen` + wire `App.tsx` navigation

**Files:**
- Create: `app/src/components/OnlineRoomScreen.tsx`
- Test: `app/src/components/OnlineRoomScreen.test.tsx`
- Modify: `app/src/App.tsx`
- Modify: `app/src/App.test.tsx`

**Interfaces:**
- Consumes: `useRoom` (Task 10), `RoomLobbyScreen` (Task 14), `OnlineGameScreen` (Task 15), `WinnerScreen` (existing), `getWinners` (`@bronx-dice/game-engine`).
- Produces: `OnlineRoomScreen({ roomId: string; ownUid: string; onLeft: () => void })` — consumed by `App.tsx`. `App.tsx`'s `Screen` union gains `'auth-gate'`-resolved online menu/profile and `'online-room'` states, with `roomId` persisted to `localStorage` under the key `bronxDice.onlineRoomId`.

- [ ] **Step 1: Write the failing tests for `OnlineRoomScreen`**

Create `app/src/components/OnlineRoomScreen.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createEmptyScoreCard } from '@bronx-dice/game-engine';
import OnlineRoomScreen from './OnlineRoomScreen';
import { useRoom } from '../hooks/useRoom';

vi.mock('../hooks/useRoom', () => ({
  useRoom: vi.fn(),
}));

vi.mock('../services/roomService', () => ({
  setReady: vi.fn(),
  startGame: vi.fn(),
  leaveRoom: vi.fn(),
  rollDice: vi.fn(),
  toggleHeldDie: vi.fn(),
  scoreCategory: vi.fn(),
  handleTurnTimeout: vi.fn(),
}));

describe('OnlineRoomScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a loading message while the room is loading', () => {
    vi.mocked(useRoom).mockReturnValue({ room: null, loading: true, notFound: false });
    render(<OnlineRoomScreen roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);
    expect(screen.getByText('Ładowanie…')).toBeInTheDocument();
  });

  it('renders the lobby screen when the room is in the lobby phase', () => {
    vi.mocked(useRoom).mockReturnValue({
      room: {
        phase: 'lobby',
        hostId: 'uid-1',
        maxPlayers: 4,
        turnTimeLimitSeconds: 30,
        players: [{ id: 'uid-1', name: 'Ola', avatarId: 'avatar01', ready: false }],
        createdAt: {} as never,
        updatedAt: {} as never,
      },
      loading: false,
      notFound: false,
    });
    render(<OnlineRoomScreen roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);
    expect(screen.getByText('Pokój AAAAA')).toBeInTheDocument();
  });

  it('renders the winner screen when the room has finished', () => {
    const scoreCards = { 'uid-1': createEmptyScoreCard() };
    scoreCards['uid-1'].lower.chance = 20;
    vi.mocked(useRoom).mockReturnValue({
      room: {
        phase: 'finished',
        hostId: 'uid-1',
        maxPlayers: 2,
        turnTimeLimitSeconds: 30,
        turnStartedAt: {} as never,
        players: [{ id: 'uid-1', name: 'Ola', avatarId: 'avatar01', ready: true }],
        scoreCards,
        dice: [],
        heldDice: [false, false, false, false, false],
        rollsLeft: 3,
        currentPlayerIndex: 0,
        createdAt: {} as never,
        updatedAt: {} as never,
      },
      loading: false,
      notFound: false,
    });
    render(<OnlineRoomScreen roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);
    expect(screen.getByText('Zwycięzca: Ola!')).toBeInTheDocument();
  });

  it('calls onLeft when the room is not found', async () => {
    vi.mocked(useRoom).mockReturnValue({ room: null, loading: false, notFound: true });
    const onLeft = vi.fn();
    render(<OnlineRoomScreen roomId="AAAAA" ownUid="uid-1" onLeft={onLeft} />);
    await waitFor(() => expect(onLeft).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd app
npx vitest run src/components/OnlineRoomScreen.test.tsx
```

Expected: FAIL — `Cannot find module './OnlineRoomScreen'`.

- [ ] **Step 3: Implement `OnlineRoomScreen.tsx`**

Create `app/src/components/OnlineRoomScreen.tsx`:

```tsx
import { useEffect } from 'react';
import { getWinners } from '@bronx-dice/game-engine';
import RoomLobbyScreen from './RoomLobbyScreen';
import OnlineGameScreen from './OnlineGameScreen';
import WinnerScreen from './WinnerScreen';
import { useRoom } from '../hooks/useRoom';

interface OnlineRoomScreenProps {
  roomId: string;
  ownUid: string;
  onLeft: () => void;
}

function OnlineRoomScreen({ roomId, ownUid, onLeft }: OnlineRoomScreenProps) {
  const { room, loading, notFound } = useRoom(roomId);

  useEffect(() => {
    if (notFound) {
      onLeft();
    }
  }, [notFound, onLeft]);

  if (notFound) {
    return null;
  }

  if (loading || !room) {
    return <p>Ładowanie…</p>;
  }

  if (room.phase === 'lobby') {
    return <RoomLobbyScreen room={room} roomId={roomId} ownUid={ownUid} onLeft={onLeft} />;
  }

  if (room.phase === 'playing') {
    return <OnlineGameScreen room={room} roomId={roomId} ownUid={ownUid} />;
  }

  return (
    <WinnerScreen winners={getWinners(room)} scoreCards={room.scoreCards} onPlayAgain={onLeft} />
  );
}

export default OnlineRoomScreen;
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/components/OnlineRoomScreen.test.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 5: Rewrite `App.tsx` navigation**

Modify `app/src/App.tsx` — replace the full contents:

```tsx
import { useState } from 'react';
import StartScreen from './components/StartScreen';
import GameScreen from './components/GameScreen';
import LoginScreen from './components/LoginScreen';
import RegisterScreen from './components/RegisterScreen';
import ForgotPasswordScreen from './components/ForgotPasswordScreen';
import ProfileSetupScreen from './components/ProfileSetupScreen';
import ProfileScreen from './components/ProfileScreen';
import OnlineMenuScreen from './components/OnlineMenuScreen';
import OnlineRoomScreen from './components/OnlineRoomScreen';
import { useAuth } from './contexts/AuthContext';

const ONLINE_ROOM_STORAGE_KEY = 'bronxDice.onlineRoomId';

type AuthScreenName = 'login' | 'register' | 'forgot-password';

type Screen =
  | { kind: 'local-start' }
  | { kind: 'local-game'; playerNames: string[] }
  | { kind: 'auth-gate'; authScreen: AuthScreenName }
  | { kind: 'profile' }
  | { kind: 'online-room'; roomId: string };

function initialScreen(): Screen {
  const storedRoomId = localStorage.getItem(ONLINE_ROOM_STORAGE_KEY);
  return storedRoomId
    ? { kind: 'online-room', roomId: storedRoomId }
    : { kind: 'local-start' };
}

function App() {
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const { user, profile, loading } = useAuth();

  const enterRoom = (roomId: string) => {
    localStorage.setItem(ONLINE_ROOM_STORAGE_KEY, roomId);
    setScreen({ kind: 'online-room', roomId });
  };

  const exitRoom = () => {
    localStorage.removeItem(ONLINE_ROOM_STORAGE_KEY);
    setScreen({ kind: 'auth-gate', authScreen: 'login' });
  };

  if (screen.kind === 'local-game') {
    return (
      <GameScreen
        playerNames={screen.playerNames}
        onPlayAgain={() => setScreen({ kind: 'local-start' })}
      />
    );
  }

  if (screen.kind === 'online-room') {
    if (!user) {
      return <p>Ładowanie…</p>;
    }
    return <OnlineRoomScreen roomId={screen.roomId} ownUid={user.uid} onLeft={exitRoom} />;
  }

  if (screen.kind === 'profile') {
    return (
      <ProfileScreen
        onSignedOut={() => setScreen({ kind: 'local-start' })}
        onBackToLocal={() => setScreen({ kind: 'local-start' })}
      />
    );
  }

  if (screen.kind === 'auth-gate') {
    if (loading) {
      return <p>Ładowanie…</p>;
    }

    if (!user) {
      if (screen.authScreen === 'register') {
        return (
          <RegisterScreen
            onSuccess={() => {}}
            onNavigateToLogin={() => setScreen({ kind: 'auth-gate', authScreen: 'login' })}
            onCancel={() => setScreen({ kind: 'local-start' })}
          />
        );
      }
      if (screen.authScreen === 'forgot-password') {
        return (
          <ForgotPasswordScreen
            onNavigateToLogin={() => setScreen({ kind: 'auth-gate', authScreen: 'login' })}
            onCancel={() => setScreen({ kind: 'local-start' })}
          />
        );
      }
      return (
        <LoginScreen
          onSuccess={() => {}}
          onNavigateToRegister={() => setScreen({ kind: 'auth-gate', authScreen: 'register' })}
          onNavigateToForgotPassword={() =>
            setScreen({ kind: 'auth-gate', authScreen: 'forgot-password' })
          }
          onCancel={() => setScreen({ kind: 'local-start' })}
        />
      );
    }

    if (!profile) {
      return (
        <ProfileSetupScreen
          user={user}
          onComplete={() => {}}
          onCancel={() => setScreen({ kind: 'local-start' })}
        />
      );
    }

    return (
      <OnlineMenuScreen
        onRoomJoined={enterRoom}
        onOpenProfile={() => setScreen({ kind: 'profile' })}
      />
    );
  }

  return (
    <StartScreen
      onStart={(playerNames) => setScreen({ kind: 'local-game', playerNames })}
      onOpenAuth={() => setScreen({ kind: 'auth-gate', authScreen: 'login' })}
    />
  );
}

export default App;
```

Note the fallthrough logic mirrors the pre-existing `authOpen` gate exactly (`onSuccess={() => {}}` on `LoginScreen`/`RegisterScreen`, `onComplete={() => {}}` on `ProfileSetupScreen`): a successful login/registration/profile-setup doesn't navigate explicitly — it relies on `useAuth()`'s context update to flip `user`/`profile`, and the same `auth-gate` render re-evaluates its `if (!user)` / `if (!profile)` chain on the next render, falling through to `OnlineMenuScreen` once both are true. This correctly handles a returning user who is authenticated but never finished profile setup, since the chain is re-checked from scratch every time, regardless of entry point.

- [ ] **Step 6: Update `App.test.tsx` for the new navigation and localStorage restore**

Modify `app/src/App.test.tsx` — replace the full contents:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from 'firebase/auth';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { subscribeToAuthState } from './services/authService';
import { getProfile } from './services/profileService';
import { useRoom } from './hooks/useRoom';
import type { PlayerProfile } from './types/auth';

vi.mock('./services/authService', () => ({
  subscribeToAuthState: vi.fn(),
  signInWithEmail: vi.fn(),
  registerWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
  sendPasswordReset: vi.fn(),
  signOutUser: vi.fn(),
}));

vi.mock('./services/profileService', () => ({
  getProfile: vi.fn(),
  createProfile: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('./services/roomService', () => ({
  createRoom: vi.fn(),
  joinRoom: vi.fn(),
  setReady: vi.fn(),
  startGame: vi.fn(),
  leaveRoom: vi.fn(),
  rollDice: vi.fn(),
  toggleHeldDie: vi.fn(),
  scoreCategory: vi.fn(),
  handleTurnTimeout: vi.fn(),
}));

vi.mock('./hooks/useRoom', () => ({
  useRoom: vi.fn(),
}));

function renderApp() {
  return render(
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}

describe('App', () => {
  beforeEach(() => {
    vi.mocked(subscribeToAuthState).mockImplementation((callback: (user: User | null) => void) => {
      callback(null);
      return () => {};
    });
    vi.mocked(getProfile).mockResolvedValue(null);
    vi.mocked(useRoom).mockReturnValue({ room: null, loading: true, notFound: false });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('shows the start screen first', () => {
    renderApp();
    expect(screen.getByAltText('Bronx Dice')).toBeInTheDocument();
    expect(screen.getByLabelText('Liczba graczy')).toBeInTheDocument();
  });

  it('starts the game after entering names and clicking start', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.clear(screen.getByLabelText('Gracz 1'));
    await user.type(screen.getByLabelText('Gracz 1'), 'Ola');
    await user.clear(screen.getByLabelText('Gracz 2'));
    await user.type(screen.getByLabelText('Gracz 2'), 'Kuba');
    await user.click(screen.getByRole('button', { name: 'Rozpocznij grę' }));

    expect(screen.getByText('Tura: Ola')).toBeInTheDocument();
  });

  it('opens the login screen from the start screen', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Zaloguj się' }));

    expect(screen.getByRole('heading', { name: 'Zaloguj się' })).toBeInTheDocument();
  });

  it('shows the online menu once logged in with a complete profile', async () => {
    const fakeUser = { uid: 'uid-1' } as User;
    const fakeProfile: PlayerProfile = {
      displayName: 'Ola',
      avatarId: 'avatar01',
      email: 'ola@example.com',
      createdAt: 1700000000000,
    };
    vi.mocked(subscribeToAuthState).mockImplementation((callback: (user: User | null) => void) => {
      callback(fakeUser);
      return () => {};
    });
    vi.mocked(getProfile).mockResolvedValue(fakeProfile);

    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole('button', { name: 'Profil gracza' }));

    expect(await screen.findByText('Gra online')).toBeInTheDocument();
  });

  it('restores a previously joined online room from localStorage', async () => {
    const fakeUser = { uid: 'uid-1' } as User;
    vi.mocked(subscribeToAuthState).mockImplementation((callback: (user: User | null) => void) => {
      callback(fakeUser);
      return () => {};
    });
    localStorage.setItem('bronxDice.onlineRoomId', 'AAAAA');

    renderApp();

    expect(await screen.findByText('Ładowanie…')).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
npx vitest run src/App.test.tsx src/components/OnlineRoomScreen.test.tsx
```

Expected: PASS (5 tests in `App.test.tsx`, 4 in `OnlineRoomScreen.test.tsx`).

- [ ] **Step 8: Verify the whole `app` workspace builds, lints, and passes end to end**

```bash
npm run build
npm run lint
npm test
cd ..
```

- [ ] **Step 9: Verify the whole repo (all three workspaces) is green**

```bash
npm run build:engine
npm run build --workspace=packages/game-engine
npm test --workspace=packages/game-engine
npm run build --workspace=functions
npm run lint --workspace=functions
npm test --workspace=functions
npm run build --workspace=app
npm run lint --workspace=app
npm test --workspace=app
```

Expected: every command succeeds — Etap 6 is feature-complete for local unit/component testing. (`npm run test:functions-integration` and `npm run test:rules` still require the Firebase Emulator Suite running locally and are exercised separately, as in Etap 5.)

- [ ] **Step 10: Commit**

```bash
git add app/src/components/OnlineRoomScreen.tsx app/src/components/OnlineRoomScreen.test.tsx app/src/App.tsx app/src/App.test.tsx
git commit -m "Wire App.tsx navigation to the online room lifecycle"
```
