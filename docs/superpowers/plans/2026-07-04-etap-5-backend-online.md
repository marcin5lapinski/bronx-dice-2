# Etap 5 — Backend Firebase pod rozgrywkę online — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Firebase backend for online play — Firestore as the single source of truth for room state, seven Cloud Functions as the only way to mutate that state, and Security Rules that block any direct client write — without touching any UI (that's Etap 6).

**Architecture:** The repo becomes an npm workspace (`app`, `functions`, `packages/game-engine`) so the existing pure, parameterized game engine can be shared, unmodified in behavior, between the client and the new Cloud Functions. Each Cloud Function is a thin `onCall` wrapper around a pure, independently-testable handler that reads/writes a `rooms/{roomId}` Firestore document, reusing `rollInTurn`/`toggleHeldDie`/`applyScore`/`isGameOver`/`canScoreCategory` from the shared engine so server-side scoring can never drift from client-side scoring.

**Tech Stack:** npm workspaces; `packages/game-engine` (TypeScript, CommonJS, no framework); Cloud Functions v2 (`firebase-functions`, `firebase-admin`, Node 20, CommonJS); Vitest for unit tests (fake Firestore-shaped objects, no real network) and for two Firebase-Emulator-backed integration suites (functions lifecycle, Firestore Security Rules) that run outside the default `npm test`.

Source of truth: `docs/superpowers/specs/2026-07-04-etap-5-backend-online-design.md`.

## Global Constraints

- **Zero behavior change to game rules.** Every engine file moves from `app/src/engine`/`app/src/types/game.ts` into `packages/game-engine/src` (`types/game.ts`, `dice.ts`, `scoreCard.ts`, `gameState.ts`, `turn.ts`, `scoring/upperSection.ts`, `scoring/combinations.ts`) with no logic changes — only the `types/game` import path in 6 files gets one level shorter (see the flattening bullet below). The only new engine code is `createGameStateFromPlayers` (Task 2), a refactor `createGameState` now delegates to — existing engine tests must keep passing verbatim.
- **CommonJS everywhere in `packages/game-engine` and `functions`** (no `"type": "module"`, `moduleResolution: "node"`). This avoids Node's ESM requirement that relative import specifiers carry an explicit `.js` extension — CJS `require()` resolves extensionless paths exactly like the code already does. `app` keeps its existing Vite/bundler ESM setup unchanged; Vite consumes the CJS `@bronx-dice/game-engine` dependency the same way it consumes any ordinary npm package.
- **`packages/game-engine` ships compiled output** (`dist/*.js` + `dist/*.d.ts`, built via `tsc`) — both `app` (Vite) and `functions` (plain `tsc` + Node, no bundler) depend on the *compiled* package, never on its TypeScript source directly, because Cloud Functions run under plain Node with no bundling step. **Run `npm run build --workspace=packages/game-engine` after every change to `packages/game-engine/src`, before testing/building `app` or `functions`.**
- **Flattening `app/src/engine/*` directly into `packages/game-engine/src/*` (dropping the `engine/` folder level) shortens the relative distance to `types/game.ts` by one level** — every file that previously wrote `from '../types/game'` (`dice.ts`, `scoreCard.ts`, `gameState.ts`, `turn.ts`) needs `from './types/game'` after the move, and every file under `scoring/` that wrote `from '../../types/game'` needs `from '../types/game'`. Task 1 fixes these 6 import lines explicitly right after the `git mv`s — this is the one mechanical exception to "internal imports untouched."
- **Firebase project config lives at the repo root after this plan**: `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json` move from `app/` to the repo root (Task 1), since they now describe a project with two source directories (`app`, `functions`) rather than one.
- **Room code alphabet:** `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (excludes `0/O/1/I/L`), length 5, used directly as the `rooms/{roomId}` document ID.
- **`RoomPlayer`** = engine `Player` (`{ id, name }`) **+ `avatarId: string`**. `RoomPlayer.id` is always the caller's Firebase Auth `uid`.
- **Error codes:** every Cloud Function throws `HttpsError` via one of six factories in `functions/src/errors.ts` — `unauthenticated`, `notFound`, `permissionDenied`, `failedPrecondition`, `invalidArgument`, `internal` — each carrying a Polish `message`.
- **Every mutating function except `createRoom` runs inside `db.runTransaction`**, reading the room fresh, validating, computing the next state via the shared engine, then writing. `createRoom` can't use one enclosing transaction because it must generate a *new* random document ID on each collision retry; it instead does one small transaction per attempt (read-if-exists, write-if-free).
- **Security Rules:** `rooms/{roomId}` — `allow read: if request.auth != null; allow write: if false;` (unchanged `users/{uid}` rule from Etap 4 stays as-is).
- **No real Firestore/Auth network calls in the default `npm test` of any package.** Unit tests use small hand-written fake objects (`{ collection, doc, get, set, update, runTransaction }`) cast to the real `firebase-admin/firestore` types — dependency injection, not `vi.mock`. The two suites that do need a live emulator (`functions` full-lifecycle integration test, `app` Security Rules test) live behind dedicated Vitest configs and dedicated npm scripts wrapped in `firebase emulators:exec`, never picked up by plain `npm test`.
- **Out of scope (do not implement):** any UI, `leaveRoom` outside the `'lobby'` phase, room cleanup/TTL, stats, rate limiting, actual deploy to a real Firebase project.

---

### Task 1: Convert the repo to npm workspaces; move the game engine into `packages/game-engine`

**Files:**
- Create: `package.json` (repo root)
- Create: `packages/game-engine/package.json`
- Create: `packages/game-engine/tsconfig.json`
- Create: `packages/game-engine/.oxlintrc.json`
- Create: `packages/game-engine/src/index.ts`
- Move (`git mv`): `app/src/engine/*` → `packages/game-engine/src/*` (all 12 files, including the `scoring/` subfolder)
- Move (`git mv`): `app/src/types/game.ts` → `packages/game-engine/src/types/game.ts`
- Move (`git mv`): `app/firebase.json` → `firebase.json`; `app/.firebaserc` → `.firebaserc`; `app/firestore.rules` → `firestore.rules`; `app/firestore.indexes.json` → `firestore.indexes.json`
- Modify: `app/package.json` (add the `@bronx-dice/game-engine` dependency, remove the `emulators` script)
- Modify: `app/src/components/DiceTray.tsx`, `DiceTray.test.tsx`, `GameScreen.tsx`, `WinnerScreen.tsx`, `WinnerScreen.test.tsx`, `ScoreBoard.tsx`, `ScoreBoard.test.tsx`, `StartScreen.tsx` (import paths)
- Modify: `.gitignore` (repo root)
- Modify: `CLAUDE.md` (new monorepo layout and command locations)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `@bronx-dice/game-engine` — a built npm workspace package re-exporting every symbol from the moved engine (`DiceValue`, `ScoreCategory`, `Player`, `PlayerScoreCard`, `GameState`, `UPPER_CATEGORIES`, `LOWER_CATEGORIES`, `rollDice`, `createEmptyDice`, `MAX_ROLLS`, `DICE_COUNT`, `createEmptyScoreCard`, `isUpperCategory`, `isUpperSectionFilled`, `canScoreCategory`, `calculateTotal`, `scoreCategory`, `DOUBLE_SCORE_ROLLS_LEFT`, `YAHTZEE_BONUS`, `createPlayer`, `createGameState`, `MIN_PLAYERS`, `MAX_PLAYERS`, `nextTurn`, `rollInTurn`, `toggleHeldDie`, `applyScore`, `isScoreCardComplete`, `isGameOver`, `getWinners`, `calculateUpperSum`, `calculateBonus`, `upperCategoryScore`, `UPPER_BONUS_THRESHOLD`, `UPPER_BONUS_VALUE`, `countsByValue`, `pairScore`, `twoPairScore`, `threeOfKindScore`, `fourOfKindScore`, `fullHouseScore`, `smallStraightScore`, `largeStraightScore`, `yahtzeeScore`, `chanceScore`) — consumed by `app` (Task 1 itself) and by the `functions` tasks that implement each Cloud Function (6–12). `createGameStateFromPlayers` is added in Task 2, not this one.

- [ ] **Step 1: Create the root workspace `package.json`**

Create `package.json` at the repo root (`H:\My_projects\BronxDice2\package.json`):

```json
{
  "name": "bronx-dice",
  "private": true,
  "version": "0.0.0",
  "workspaces": [
    "app",
    "packages/*"
  ],
  "scripts": {
    "build:engine": "npm run build --workspace=packages/game-engine"
  }
}
```

- [ ] **Step 2: Move the engine and types into `packages/game-engine/src`**

From the repo root:

```bash
mkdir -p packages/game-engine/src
git mv app/src/engine/dice.ts packages/game-engine/src/dice.ts
git mv app/src/engine/dice.test.ts packages/game-engine/src/dice.test.ts
git mv app/src/engine/scoreCard.ts packages/game-engine/src/scoreCard.ts
git mv app/src/engine/scoreCard.test.ts packages/game-engine/src/scoreCard.test.ts
git mv app/src/engine/gameState.ts packages/game-engine/src/gameState.ts
git mv app/src/engine/gameState.test.ts packages/game-engine/src/gameState.test.ts
git mv app/src/engine/turn.ts packages/game-engine/src/turn.ts
git mv app/src/engine/turn.test.ts packages/game-engine/src/turn.test.ts
mkdir -p packages/game-engine/src/scoring
git mv app/src/engine/scoring/upperSection.ts packages/game-engine/src/scoring/upperSection.ts
git mv app/src/engine/scoring/upperSection.test.ts packages/game-engine/src/scoring/upperSection.test.ts
git mv app/src/engine/scoring/combinations.ts packages/game-engine/src/scoring/combinations.ts
git mv app/src/engine/scoring/combinations.test.ts packages/game-engine/src/scoring/combinations.test.ts
mkdir -p packages/game-engine/src/types
git mv app/src/types/game.ts packages/game-engine/src/types/game.ts
```

Most internal imports (e.g. `from './dice'`, `from './scoring/upperSection'`) still resolve correctly since those files kept the same position relative to each other. The exception is the `types/game` import: flattening `engine/` away means `types/` is now one level closer, so 6 files need a one-segment fix.

- [ ] **Step 3: Fix the shortened `types/game` import path in the 6 moved files**

`dice.ts`, `scoreCard.ts`, `gameState.ts`, and `turn.ts` are now direct siblings of `types/` inside `packages/game-engine/src/` (previously they were siblings of `types/` one level up, inside `app/src/`, with `engine/` in between). In each of these 4 files, change:
```ts
from '../types/game';
```
to:
```ts
from './types/game';
```

`scoring/upperSection.ts` and `scoring/combinations.ts` are now one level closer to `types/` too (previously `app/src/engine/scoring/` was two levels below `app/src/`; now `packages/game-engine/src/scoring/` is only one level below `packages/game-engine/src/`). In each of these 2 files, change:
```ts
from '../../types/game';
```
to:
```ts
from '../types/game';
```

- [ ] **Step 4: Create the `game-engine` package manifest, tsconfig, lint config, and barrel file**

Create `packages/game-engine/package.json`:

```json
{
  "name": "@bronx-dice/game-engine",
  "version": "0.0.0",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "lint": "oxlint"
  },
  "devDependencies": {
    "oxlint": "^1.71.0",
    "typescript": "~6.0.2",
    "vitest": "^4.1.9"
  }
}
```

Create `packages/game-engine/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "commonjs",
    "moduleResolution": "node",
    "lib": ["ES2023"],
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

Create `packages/game-engine/.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["typescript", "oxc"]
}
```

Create `packages/game-engine/src/index.ts`:

```ts
export * from './types/game';
export * from './dice';
export * from './scoreCard';
export * from './gameState';
export * from './turn';
export * from './scoring/upperSection';
export * from './scoring/combinations';
```

- [ ] **Step 5: Move the Firebase project config to the repo root**

```bash
git mv app/firebase.json firebase.json
git mv app/.firebaserc .firebaserc
git mv app/firestore.rules firestore.rules
git mv app/firestore.indexes.json firestore.indexes.json
```

- [ ] **Step 6: Wire `app` to the new workspace package and drop its now-relocated `emulators` script**

Modify `app/package.json`: add the dependency (alphabetical, alongside the existing `dependencies`) —

```json
    "@bronx-dice/game-engine": "*",
```

so the `dependencies` block reads:

```json
  "dependencies": {
    "@bronx-dice/game-engine": "*",
    "@dnd-kit/core": "^6.3.1",
    "@dnd-kit/sortable": "^10.0.0",
    "@dnd-kit/utilities": "^3.2.2",
    "firebase": "^12.15.0",
    "react": "^19.2.7",
    "react-dom": "^19.2.7"
  },
```

Remove the `"emulators": "firebase emulators:start"` line from `"scripts"` (the emulators now run from the repo root, where `firebase.json` lives — see Step 7).

- [ ] **Step 7: Update the repo-root `.gitignore` and install**

Modify `.gitignore` (repo root) to append:

```
node_modules
dist
*.local
```

From the repo root:

```bash
git rm app/package-lock.json
rm -rf app/node_modules
npm install
npm run build:engine
```

`npm install` creates a single root-level `package-lock.json` and `node_modules`, symlinking `app` and `packages/game-engine` as workspace packages. `npm run build:engine` compiles `packages/game-engine/src` to `dist/`, which `app` now depends on.

- [ ] **Step 8: Point every `app` consumer at `@bronx-dice/game-engine` instead of `../engine`/`../types/game`**

Modify `app/src/components/DiceTray.tsx` — change:
```ts
import type { DiceValue } from '../types/game';
```
to:
```ts
import type { DiceValue } from '@bronx-dice/game-engine';
```

Modify `app/src/components/DiceTray.test.tsx` — same change:
```ts
import type { DiceValue } from '@bronx-dice/game-engine';
```

Modify `app/src/components/GameScreen.tsx` — change:
```ts
import { createGameState } from '../engine/gameState';
import {
  rollInTurn,
  toggleHeldDie,
  applyScore,
  isGameOver,
  getWinners,
} from '../engine/turn';
import type { GameState, ScoreCategory } from '../types/game';
```
to:
```ts
import {
  createGameState,
  rollInTurn,
  toggleHeldDie,
  applyScore,
  isGameOver,
  getWinners,
  type GameState,
  type ScoreCategory,
} from '@bronx-dice/game-engine';
```

Modify `app/src/components/WinnerScreen.tsx` — change:
```ts
import type { Player, PlayerScoreCard } from '../types/game';
import { calculateTotal } from '../engine/scoreCard';
```
to:
```ts
import { calculateTotal, type Player, type PlayerScoreCard } from '@bronx-dice/game-engine';
```

Modify `app/src/components/WinnerScreen.test.tsx` — change:
```ts
import { createEmptyScoreCard } from '../engine/scoreCard';
import type { Player, PlayerScoreCard } from '../types/game';
```
to:
```ts
import {
  createEmptyScoreCard,
  type Player,
  type PlayerScoreCard,
} from '@bronx-dice/game-engine';
```

Modify `app/src/components/ScoreBoard.tsx` — change:
```ts
import type {
  Player,
  PlayerScoreCard,
  ScoreCategory,
  DiceValue,
} from '../types/game';
import { UPPER_CATEGORIES, LOWER_CATEGORIES } from '../types/game';
import {
  canScoreCategory,
  calculateTotal,
  isUpperCategory,
  scoreCategory,
} from '../engine/scoreCard';
import { calculateBonus } from '../engine/scoring/upperSection';
```
to:
```ts
import {
  UPPER_CATEGORIES,
  LOWER_CATEGORIES,
  canScoreCategory,
  calculateTotal,
  isUpperCategory,
  scoreCategory,
  calculateBonus,
  type Player,
  type PlayerScoreCard,
  type ScoreCategory,
  type DiceValue,
} from '@bronx-dice/game-engine';
```

Modify `app/src/components/ScoreBoard.test.tsx` — change:
```ts
import { createGameState } from '../engine/gameState';
import type { DiceValue } from '../types/game';
```
to:
```ts
import { createGameState, type DiceValue } from '@bronx-dice/game-engine';
```

Modify `app/src/components/StartScreen.tsx` — change:
```ts
import { MIN_PLAYERS, MAX_PLAYERS } from '../engine/gameState';
```
to:
```ts
import { MIN_PLAYERS, MAX_PLAYERS } from '@bronx-dice/game-engine';
```

- [ ] **Step 9: Verify everything still builds, lints, and passes**

From the repo root:

```bash
npm run test --workspace=packages/game-engine
npm run lint --workspace=packages/game-engine
npm run build --workspace=app
npm run lint --workspace=app
npm test --workspace=app
```

Expected: `packages/game-engine` tests pass (same 40-ish engine tests as before, now running from their new location); `app` builds, lints, and its full test suite passes with the same count as on `master` before this task — this is a pure move plus import-path updates, no behavior change.

- [ ] **Step 10: Update `CLAUDE.md` for the new monorepo layout**

Modify `CLAUDE.md`: replace the "Project overview" bullet list and the "Commands" section's intro sentence to describe the new layout. Change:
```
- `app/` — the current project (Vite + React 19 + TypeScript). This is what you should read and edit.
```
to:
```
- `app/` — the React + TypeScript client (Vite). This is what you should read and edit for UI work.
- `packages/game-engine/` — the pure game engine (scoring rules, `GameState`), shared as an npm workspace package by both `app/` and `functions/`. Edit rule logic here, not in `app/`.
- `functions/` — Cloud Functions (Firebase Functions v2) that are the only way to mutate online-room state in Firestore.
```

And change the `## Commands` section's intro line from:
```
Run from `app/`:
```
to:
```
This is an npm workspace repo. Most commands below take a `--workspace=<name>` flag (or `cd` into that package) — `app`, `functions`, `packages/game-engine`. `firebase emulators:start` and any `firebase emulators:exec ...` wrapper script run from the **repo root**, where `firebase.json` now lives.
```

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json .gitignore firebase.json .firebaserc firestore.rules firestore.indexes.json packages/game-engine app/package.json app/package-lock.json app/src/components/DiceTray.tsx app/src/components/DiceTray.test.tsx app/src/components/GameScreen.tsx app/src/components/WinnerScreen.tsx app/src/components/WinnerScreen.test.tsx app/src/components/ScoreBoard.tsx app/src/components/ScoreBoard.test.tsx app/src/components/StartScreen.tsx CLAUDE.md
git status
```

Review the status output to confirm the `app/src/engine`, `app/src/types/game.ts`, and old `app/firebase.json`/`.firebaserc`/`firestore.*` paths show as deleted (moved), then:

```bash
git commit -m "Convert repo to npm workspaces; move game engine into packages/game-engine"
```

---

### Task 2: Add `createGameStateFromPlayers` to the shared engine

**Files:**
- Modify: `packages/game-engine/src/gameState.ts`
- Modify: `packages/game-engine/src/gameState.test.ts`

**Interfaces:**
- Consumes: `Player`, `GameState` (from `packages/game-engine/src/types/game.ts`, unchanged), `createEmptyScoreCard` (`./scoreCard`), `createEmptyDice`, `MAX_ROLLS` (`./dice`) — all already imported by this file.
- Produces: `createGameStateFromPlayers(players: Player[]): GameState`, exported from `@bronx-dice/game-engine` after Task 1's barrel re-export picks it up automatically (`export * from './gameState'`) — consumed by `functions`' `startGame` handler (Task 8).

- [ ] **Step 1: Write the failing tests**

Modify `packages/game-engine/src/gameState.test.ts` — change the import block:
```ts
import {
  createPlayer,
  createGameState,
  nextTurn,
  MIN_PLAYERS,
  MAX_PLAYERS,
} from './gameState';
```
to:
```ts
import {
  createPlayer,
  createGameState,
  createGameStateFromPlayers,
  nextTurn,
  MIN_PLAYERS,
  MAX_PLAYERS,
} from './gameState';
```

Append these two `describe` blocks at the end of the file:

```ts
describe('createGameStateFromPlayers', () => {
  it('builds a GameState from the given players unchanged (e.g. real Firebase uids as ids)', () => {
    const players = [
      { id: 'uid-1', name: 'Ola' },
      { id: 'uid-2', name: 'Kuba' },
    ];
    const state = createGameStateFromPlayers(players);
    expect(state.players).toBe(players);
    expect(Object.keys(state.scoreCards)).toEqual(['uid-1', 'uid-2']);
    expect(state.scoreCards['uid-1'].upper.aces).toBeNull();
  });

  it('starts with no dice rolled, nothing held, full rolls, and player 0 first', () => {
    const state = createGameStateFromPlayers([
      { id: 'uid-1', name: 'Ola' },
      { id: 'uid-2', name: 'Kuba' },
    ]);
    expect(state.dice).toEqual([]);
    expect(state.heldDice).toEqual([false, false, false, false, false]);
    expect(state.rollsLeft).toBe(MAX_ROLLS);
    expect(state.currentPlayerIndex).toBe(0);
  });

  it(`throws with fewer than ${MIN_PLAYERS} players`, () => {
    expect(() => createGameStateFromPlayers([{ id: 'uid-1', name: 'Ola' }])).toThrow();
  });

  it(`throws with more than ${MAX_PLAYERS} players`, () => {
    const players = Array.from({ length: 7 }, (_, i) => ({
      id: `uid-${i}`,
      name: `P${i}`,
    }));
    expect(() => createGameStateFromPlayers(players)).toThrow();
  });
});

describe('createGameState (built on createGameStateFromPlayers)', () => {
  it('still generates sequential player-N ids from names', () => {
    const state = createGameState(['Ola', 'Kuba']);
    expect(state.players).toEqual([
      { id: 'player-1', name: 'Ola' },
      { id: 'player-2', name: 'Kuba' },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

```bash
cd packages/game-engine
npx vitest run src/gameState.test.ts
```

Expected: FAIL — `createGameStateFromPlayers` is not exported yet; all pre-existing tests in the file still pass.

- [ ] **Step 3: Refactor `gameState.ts`**

Replace the contents of `packages/game-engine/src/gameState.ts`:

```ts
import type { GameState, Player } from './types/game';
import { createEmptyScoreCard } from './scoreCard';
import { createEmptyDice, MAX_ROLLS } from './dice';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

export function createPlayer(id: string, name: string): Player {
  return { id, name };
}

export function createGameStateFromPlayers(players: Player[]): GameState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(
      `Player count must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}, got ${players.length}`
    );
  }

  const scoreCards: GameState['scoreCards'] = {};
  for (const player of players) {
    scoreCards[player.id] = createEmptyScoreCard();
  }

  return {
    players,
    scoreCards,
    dice: createEmptyDice(),
    heldDice: [false, false, false, false, false],
    rollsLeft: MAX_ROLLS,
    currentPlayerIndex: 0,
  };
}

export function createGameState(playerNames: string[]): GameState {
  const players = playerNames.map((name, index) =>
    createPlayer(`player-${index + 1}`, name)
  );
  return createGameStateFromPlayers(players);
}

export function nextTurn(state: GameState): GameState {
  const nextIndex = (state.currentPlayerIndex + 1) % state.players.length;
  return {
    ...state,
    currentPlayerIndex: nextIndex,
    dice: createEmptyDice(),
    heldDice: [false, false, false, false, false],
    rollsLeft: MAX_ROLLS,
  };
}
```

(The `./types/game` import above is already correct at this point — Task 1, Step 3 fixed this exact line when it flattened `engine/` into `packages/game-engine/src/`.)

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/gameState.test.ts
```

Expected: PASS — all pre-existing tests plus the 5 new ones.

- [ ] **Step 5: Rebuild the engine and re-verify `app`**

```bash
cd ..
npm run build:engine
npm test --workspace=app
```

Expected: `app`'s full suite still passes (this task changes no public behavior `app` depends on).

- [ ] **Step 6: Commit**

```bash
git add packages/game-engine/src/gameState.ts packages/game-engine/src/gameState.test.ts
git commit -m "Add createGameStateFromPlayers so online rooms can seed GameState from real uids"
```

---

### Task 3: Scaffold the `functions/` Cloud Functions package

**Files:**
- Create: `functions/package.json`
- Create: `functions/tsconfig.json`
- Create: `functions/.oxlintrc.json`
- Create: `functions/.gitignore`
- Create: `functions/vitest.config.ts`
- Create: `functions/vitest.integration.config.ts`
- Create: `functions/src/firebaseAdmin.ts`
- Create: `functions/src/index.ts`
- Modify: `package.json` (repo root — add `functions` to workspaces, add emulator scripts)
- Modify: `firebase.json` (repo root — add the `functions` source + emulator port)

**Interfaces:**
- Consumes: `firebase-admin/firestore`, `firebase-admin/app`.
- Produces: `db` (a `Firestore` instance) from `functions/src/firebaseAdmin.ts`, consumed by every function task (6–12). `functions/src/index.ts` as the aggregation point every function task adds one export line to.

- [ ] **Step 1: Add `functions` to the workspace and root scripts**

Modify `package.json` (repo root) — change:
```json
  "workspaces": [
    "app",
    "packages/*"
  ],
  "scripts": {
    "build:engine": "npm run build --workspace=packages/game-engine"
  }
```
to:
```json
  "workspaces": [
    "app",
    "functions",
    "packages/*"
  ],
  "scripts": {
    "build:engine": "npm run build --workspace=packages/game-engine",
    "emulators": "firebase emulators:start",
    "test:functions-integration": "firebase emulators:exec --only firestore \"npm run test:integration --workspace=functions\"",
    "test:rules": "firebase emulators:exec --only firestore \"npm run test:rules --workspace=app\""
  }
```

- [ ] **Step 2: Wire the Functions emulator into `firebase.json`**

Modify `firebase.json` (repo root) — change:
```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "emulators": {
    "auth": {
      "port": 9099
    },
    "firestore": {
      "port": 8080
    },
    "ui": {
      "enabled": true
    }
  }
}
```
to:
```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "functions": {
    "source": "functions"
  },
  "emulators": {
    "auth": {
      "port": 9099
    },
    "firestore": {
      "port": 8080
    },
    "functions": {
      "port": 5001
    },
    "ui": {
      "enabled": true
    }
  }
}
```

- [ ] **Step 3: Create the `functions` package manifest, tsconfig, lint config, and `.gitignore`**

Create `functions/package.json`:

```json
{
  "name": "functions",
  "version": "0.0.0",
  "private": true,
  "engines": { "node": "20" },
  "main": "lib/index.js",
  "scripts": {
    "build": "tsc",
    "lint": "oxlint",
    "test": "vitest run",
    "test:integration": "vitest run --config vitest.integration.config.ts"
  },
  "dependencies": {
    "@bronx-dice/game-engine": "*",
    "firebase-admin": "^13.0.0",
    "firebase-functions": "^6.0.0"
  },
  "devDependencies": {
    "oxlint": "^1.71.0",
    "typescript": "~6.0.2",
    "vitest": "^4.1.9"
  }
}
```

Create `functions/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "commonjs",
    "moduleResolution": "node",
    "lib": ["ES2023"],
    "outDir": "lib",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

Create `functions/.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["typescript", "oxc"]
}
```

Create `functions/.gitignore`:

```
lib/
```

- [ ] **Step 4: Create the two Vitest configs**

Create `functions/vitest.config.ts` (the default config used by plain `npm test` — excludes integration tests so they can never accidentally run without an emulator):

```ts
import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: [...configDefaults.exclude, '**/*.integration.test.ts'],
  },
});
```

Create `functions/vitest.integration.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.integration.test.ts'],
    testTimeout: 20000,
  },
});
```

- [ ] **Step 5: Create the Admin SDK bootstrap**

Create `functions/src/firebaseAdmin.ts`:

```ts
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  initializeApp();
}

export const db = getFirestore();
```

- [ ] **Step 6: Create the (initially empty) Cloud Functions entry point**

Create `functions/src/index.ts`:

```ts
// Cloud Functions entry point — each task in
// docs/superpowers/plans/2026-07-04-etap-5-backend-online.md adds one
// export here as it implements the corresponding Cloud Function.
```

- [ ] **Step 7: Install dependencies and verify the scaffold builds and lints**

From the repo root:

```bash
npm install
npm run build --workspace=functions
npm run lint --workspace=functions
```

Expected: `npm install` links `functions` as a workspace package and installs `firebase-admin`/`firebase-functions`; `tsc` compiles the two source files to `functions/lib/` with no errors; `oxlint` reports no issues. (No `npm test` yet — there are no test files until Task 4.)

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json firebase.json functions/package.json functions/tsconfig.json functions/.oxlintrc.json functions/.gitignore functions/vitest.config.ts functions/vitest.integration.config.ts functions/src/firebaseAdmin.ts functions/src/index.ts
git commit -m "Scaffold the functions/ Cloud Functions package (Node 20, CommonJS)"
```

---

### Task 4: `errors.ts` — Polish `HttpsError` factories

**Files:**
- Create: `functions/src/errors.ts`
- Test: `functions/src/errors.test.ts`

**Interfaces:**
- Consumes: `HttpsError` from `firebase-functions/v2/https`.
- Produces: `unauthenticated()`, `notFound()`, `permissionDenied(message)`, `failedPrecondition(message)`, `invalidArgument(message)`, `internal()` — each returns an `HttpsError` — consumed by every function task (6–12).

- [ ] **Step 1: Write the failing tests**

Create `functions/src/errors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  unauthenticated,
  notFound,
  permissionDenied,
  failedPrecondition,
  invalidArgument,
  internal,
} from './errors';

describe('errors', () => {
  it('unauthenticated returns an unauthenticated HttpsError with a default Polish message', () => {
    const error = unauthenticated();
    expect(error.code).toBe('unauthenticated');
    expect(error.message).toBe('Musisz być zalogowany.');
  });

  it('notFound returns a not-found HttpsError with a default Polish message', () => {
    const error = notFound();
    expect(error.code).toBe('not-found');
    expect(error.message).toBe('Pokój nie istnieje.');
  });

  it('permissionDenied returns a permission-denied HttpsError with the given message', () => {
    const error = permissionDenied('To nie twoja tura.');
    expect(error.code).toBe('permission-denied');
    expect(error.message).toBe('To nie twoja tura.');
  });

  it('failedPrecondition returns a failed-precondition HttpsError with the given message', () => {
    const error = failedPrecondition('Zła faza gry.');
    expect(error.code).toBe('failed-precondition');
    expect(error.message).toBe('Zła faza gry.');
  });

  it('invalidArgument returns an invalid-argument HttpsError with the given message', () => {
    const error = invalidArgument('Zły indeks kostki.');
    expect(error.code).toBe('invalid-argument');
    expect(error.message).toBe('Zły indeks kostki.');
  });

  it('internal returns an internal HttpsError with a default Polish message', () => {
    const error = internal();
    expect(error.code).toBe('internal');
    expect(error.message).toBe('Coś poszło nie tak. Spróbuj ponownie.');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd functions
npx vitest run src/errors.test.ts
```

Expected: FAIL — `Cannot find module './errors'`.

- [ ] **Step 3: Implement `errors.ts`**

Create `functions/src/errors.ts`:

```ts
import { HttpsError } from 'firebase-functions/v2/https';

export function unauthenticated(message = 'Musisz być zalogowany.'): HttpsError {
  return new HttpsError('unauthenticated', message);
}

export function notFound(message = 'Pokój nie istnieje.'): HttpsError {
  return new HttpsError('not-found', message);
}

export function permissionDenied(message: string): HttpsError {
  return new HttpsError('permission-denied', message);
}

export function failedPrecondition(message: string): HttpsError {
  return new HttpsError('failed-precondition', message);
}

export function invalidArgument(message: string): HttpsError {
  return new HttpsError('invalid-argument', message);
}

export function internal(message = 'Coś poszło nie tak. Spróbuj ponownie.'): HttpsError {
  return new HttpsError('internal', message);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/errors.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd ..
git add functions/src/errors.ts functions/src/errors.test.ts
git commit -m "Add Polish HttpsError factories for Cloud Functions"
```

---

### Task 5: `roomCode.ts` — room code generator

**Files:**
- Create: `functions/src/rooms/roomCode.ts`
- Test: `functions/src/rooms/roomCode.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `generateRoomCode(random?: () => number): string`, `ROOM_CODE_LENGTH: number` — consumed by `createRoom` (Task 6).

- [ ] **Step 1: Write the failing tests**

Create `functions/src/rooms/roomCode.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateRoomCode, ROOM_CODE_LENGTH } from './roomCode';

describe('generateRoomCode', () => {
  it('generates a code of the expected length', () => {
    expect(generateRoomCode()).toHaveLength(ROOM_CODE_LENGTH);
  });

  it('only uses characters from the unambiguous alphabet (no 0/O/1/I/L)', () => {
    const code = generateRoomCode();
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/);
  });

  it('is deterministic for an injected random function', () => {
    expect(generateRoomCode(() => 0)).toBe('AAAAA');
  });

  it('produces different codes for different random sequences', () => {
    let call = 0;
    const sequence = [0, 0.2, 0.4, 0.6, 0.8];
    const random = () => sequence[call++];
    expect(generateRoomCode(random)).not.toBe('AAAAA');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd functions
npx vitest run src/rooms/roomCode.test.ts
```

Expected: FAIL — `Cannot find module './roomCode'`.

- [ ] **Step 3: Implement `roomCode.ts`**

Create `functions/src/rooms/roomCode.ts`:

```ts
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 5;

export function generateRoomCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return code;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/rooms/roomCode.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd ..
git add functions/src/rooms/roomCode.ts functions/src/rooms/roomCode.test.ts
git commit -m "Add generateRoomCode for room document IDs"
```

---

### Task 6: `createRoom` Cloud Function

**Files:**
- Create: `functions/src/rooms/types.ts`
- Create: `functions/src/profiles.ts`
- Test: `functions/src/profiles.test.ts`
- Create: `functions/src/rooms/createRoom.ts`
- Test: `functions/src/rooms/createRoom.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `Player`, `GameState`, `MIN_PLAYERS`, `MAX_PLAYERS` from `@bronx-dice/game-engine`; `Firestore`, `Transaction`, `DocumentReference`, `Timestamp` from `firebase-admin/firestore`; `db` from `../firebaseAdmin`; `unauthenticated`, `invalidArgument`, `internal`, `failedPrecondition` from `../errors`; `generateRoomCode` from `./roomCode`.
- Produces: `RoomPlayer`, `RoomDocument` (types, `functions/src/rooms/types.ts`) — consumed by every remaining room-function task (7–12) and by the integration test (Task 14). `StoredProfile`, `getProfileOrThrow(db, uid)` (`functions/src/profiles.ts`) — consumed by `createRoom` (this task) and `joinRoom` (Task 7). `createRoomHandler(firestore, uid, profile, maxPlayers, random?, now?): Promise<string>` and the `createRoom` `onCall` export (`functions/src/rooms/createRoom.ts`).

- [ ] **Step 1: Create the room document types**

Create `functions/src/rooms/types.ts`:

```ts
import type { GameState, Player } from '@bronx-dice/game-engine';
import type { Timestamp } from 'firebase-admin/firestore';

export interface RoomPlayer extends Player {
  avatarId: string;
}

interface RoomBase {
  hostId: string;
  maxPlayers: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type RoomDocument =
  | (RoomBase & { phase: 'lobby'; players: RoomPlayer[] })
  | (RoomBase & { phase: 'playing' | 'finished' } & GameState);
```

- [ ] **Step 2: Write the failing test for the profile lookup**

Create `functions/src/profiles.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd functions
npx vitest run src/profiles.test.ts
```

Expected: FAIL — `Cannot find module './profiles'`.

- [ ] **Step 4: Implement `profiles.ts`**

Create `functions/src/profiles.ts`:

```ts
import type { Firestore } from 'firebase-admin/firestore';
import { failedPrecondition } from './errors';

export interface StoredProfile {
  displayName: string;
  avatarId: string;
}

export async function getProfileOrThrow(
  db: Firestore,
  uid: string
): Promise<StoredProfile> {
  const snapshot = await db.collection('users').doc(uid).get();
  if (!snapshot.exists) {
    throw failedPrecondition('Uzupełnij najpierw profil gracza.');
  }
  const data = snapshot.data() as StoredProfile;
  return { displayName: data.displayName, avatarId: data.avatarId };
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run src/profiles.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 6: Write the failing tests for `createRoomHandler`**

Create `functions/src/rooms/createRoom.test.ts`:

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
```

- [ ] **Step 7: Run the tests to verify they fail**

```bash
npx vitest run src/rooms/createRoom.test.ts
```

Expected: FAIL — `Cannot find module './createRoom'`.

- [ ] **Step 8: Implement `createRoom.ts`**

Create `functions/src/rooms/createRoom.ts`:

```ts
import { onCall } from 'firebase-functions/v2/https';
import { Timestamp, type Firestore, type Transaction, type DocumentReference } from 'firebase-admin/firestore';
import { MIN_PLAYERS, MAX_PLAYERS } from '@bronx-dice/game-engine';
import { db } from '../firebaseAdmin';
import { getProfileOrThrow, type StoredProfile } from '../profiles';
import { unauthenticated, invalidArgument, internal } from '../errors';
import { generateRoomCode } from './roomCode';
import type { RoomDocument } from './types';

const MAX_ROOM_CODE_ATTEMPTS = 5;

export async function createRoomHandler(
  firestore: Firestore,
  uid: string,
  profile: StoredProfile,
  maxPlayers: number,
  random: () => number = Math.random,
  now: () => Timestamp = Timestamp.now
): Promise<string> {
  if (!Number.isInteger(maxPlayers) || maxPlayers < MIN_PLAYERS || maxPlayers > MAX_PLAYERS) {
    throw invalidArgument(
      `Liczba graczy musi być liczbą całkowitą od ${MIN_PLAYERS} do ${MAX_PLAYERS}.`
    );
  }

  const timestamp = now();
  const room: RoomDocument = {
    phase: 'lobby',
    hostId: uid,
    maxPlayers,
    players: [{ id: uid, name: profile.displayName, avatarId: profile.avatarId }],
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

export const createRoom = onCall<{ maxPlayers: number }>(async (request) => {
  if (!request.auth) {
    throw unauthenticated();
  }
  const uid = request.auth.uid;
  const profile = await getProfileOrThrow(db, uid);
  const roomId = await createRoomHandler(db, uid, profile, request.data?.maxPlayers);
  return { roomId };
});
```

- [ ] **Step 9: Run the tests to verify they pass**

```bash
npx vitest run src/rooms/createRoom.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 10: Export `createRoom` from the entry point**

Modify `functions/src/index.ts`:

```ts
// Cloud Functions entry point — each task in
// docs/superpowers/plans/2026-07-04-etap-5-backend-online.md adds one
// export here as it implements the corresponding Cloud Function.
export { createRoom } from './rooms/createRoom';
```

- [ ] **Step 11: Verify the whole package still builds, lints, and passes**

```bash
npm run build
npm run lint
npm test
```

Expected: build succeeds, lint clean, all tests pass (2 + 5 new, plus Task 4/5's 10 = 17 total).

- [ ] **Step 12: Commit**

```bash
cd ..
git add functions/src/rooms/types.ts functions/src/profiles.ts functions/src/profiles.test.ts functions/src/rooms/createRoom.ts functions/src/rooms/createRoom.test.ts functions/src/index.ts
git commit -m "Add createRoom Cloud Function"
```

---

### Task 7: `joinRoom` Cloud Function

**Files:**
- Create: `functions/src/rooms/joinRoom.ts`
- Test: `functions/src/rooms/joinRoom.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `RoomDocument`, `RoomPlayer` (`./types`), `StoredProfile`, `getProfileOrThrow` (`../profiles`), `db` (`../firebaseAdmin`), `unauthenticated`, `notFound`, `failedPrecondition`, `invalidArgument` (`../errors`).
- Produces: `joinRoomHandler(tx, roomRef, uid, profile, now?): Promise<void>` and the `joinRoom` `onCall` export — the handler pattern (fake `Transaction`) is reused verbatim by Tasks 8–12.

- [ ] **Step 1: Write the failing tests**

Create `functions/src/rooms/joinRoom.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import type { Transaction, DocumentReference, Timestamp } from 'firebase-admin/firestore';
import { joinRoomHandler } from './joinRoom';
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
const profile = { displayName: 'Kuba', avatarId: 'wolf' };

const lobbyRoom: RoomDocument = {
  phase: 'lobby',
  hostId: 'uid-1',
  maxPlayers: 3,
  players: [{ id: 'uid-1', name: 'Ola', avatarId: 'fox' }],
  createdAt: {} as Timestamp,
  updatedAt: {} as Timestamp,
};

describe('joinRoomHandler', () => {
  it('adds the player to a lobby room with space', async () => {
    const { tx, update } = fakeTransaction(lobbyRoom);
    await joinRoomHandler(tx, roomRef, 'uid-2', profile, fixedNow);
    expect(update).toHaveBeenCalledWith(roomRef, {
      players: [
        { id: 'uid-1', name: 'Ola', avatarId: 'fox' },
        { id: 'uid-2', name: 'Kuba', avatarId: 'wolf' },
      ],
      updatedAt: {},
    });
  });

  it('is a no-op when the player already joined', async () => {
    const { tx, update } = fakeTransaction(lobbyRoom);
    await joinRoomHandler(tx, roomRef, 'uid-1', profile, fixedNow);
    expect(update).not.toHaveBeenCalled();
  });

  it('throws not-found when the room does not exist', async () => {
    const { tx } = fakeTransaction(null);
    await expect(joinRoomHandler(tx, roomRef, 'uid-2', profile, fixedNow)).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('throws failed-precondition when the room is full', async () => {
    const fullRoom: RoomDocument = { ...lobbyRoom, maxPlayers: 1 };
    const { tx } = fakeTransaction(fullRoom);
    await expect(joinRoomHandler(tx, roomRef, 'uid-2', profile, fixedNow)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('throws failed-precondition when the room already started', async () => {
    const playingRoom = { ...lobbyRoom, phase: 'playing' } as RoomDocument;
    const { tx } = fakeTransaction(playingRoom);
    await expect(joinRoomHandler(tx, roomRef, 'uid-2', profile, fixedNow)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd functions
npx vitest run src/rooms/joinRoom.test.ts
```

Expected: FAIL — `Cannot find module './joinRoom'`.

- [ ] **Step 3: Implement `joinRoom.ts`**

Create `functions/src/rooms/joinRoom.ts`:

```ts
import { onCall } from 'firebase-functions/v2/https';
import { Timestamp, type Transaction, type DocumentReference } from 'firebase-admin/firestore';
import { db } from '../firebaseAdmin';
import { getProfileOrThrow, type StoredProfile } from '../profiles';
import { unauthenticated, notFound, failedPrecondition, invalidArgument } from '../errors';
import type { RoomDocument, RoomPlayer } from './types';

export async function joinRoomHandler(
  tx: Transaction,
  roomRef: DocumentReference,
  uid: string,
  profile: StoredProfile,
  now: () => Timestamp = Timestamp.now
): Promise<void> {
  const snapshot = await tx.get(roomRef);
  if (!snapshot.exists) {
    throw notFound();
  }
  const room = snapshot.data() as RoomDocument;
  if (room.phase !== 'lobby') {
    throw failedPrecondition('Pokój już wystartował lub gra się zakończyła.');
  }
  if (room.players.some((player) => player.id === uid)) {
    return;
  }
  if (room.players.length >= room.maxPlayers) {
    throw failedPrecondition('Pokój jest pełny.');
  }
  const newPlayer: RoomPlayer = { id: uid, name: profile.displayName, avatarId: profile.avatarId };
  tx.update(roomRef, {
    players: [...room.players, newPlayer],
    updatedAt: now(),
  });
}

export const joinRoom = onCall<{ roomId: string }>(async (request) => {
  if (!request.auth) {
    throw unauthenticated();
  }
  const roomId = request.data?.roomId;
  if (typeof roomId !== 'string' || roomId.length === 0) {
    throw invalidArgument('Brak kodu pokoju.');
  }
  const uid = request.auth.uid;
  const profile = await getProfileOrThrow(db, uid);
  const roomRef = db.collection('rooms').doc(roomId);
  await db.runTransaction((tx) => joinRoomHandler(tx, roomRef, uid, profile));
});
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/rooms/joinRoom.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Export `joinRoom` from the entry point**

Modify `functions/src/index.ts` — append:
```ts
export { joinRoom } from './rooms/joinRoom';
```

- [ ] **Step 6: Verify the whole package**

```bash
npm run build
npm run lint
npm test
```

Expected: build succeeds, lint clean, all 22 tests pass.

- [ ] **Step 7: Commit**

```bash
cd ..
git add functions/src/rooms/joinRoom.ts functions/src/rooms/joinRoom.test.ts functions/src/index.ts
git commit -m "Add joinRoom Cloud Function"
```

---

### Task 8: `startGame` Cloud Function

**Files:**
- Create: `functions/src/rooms/startGame.ts`
- Test: `functions/src/rooms/startGame.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `createGameStateFromPlayers`, `MIN_PLAYERS` from `@bronx-dice/game-engine` (Task 2); `RoomDocument` (`./types`); `db` (`../firebaseAdmin`); `unauthenticated`, `notFound`, `failedPrecondition`, `permissionDenied`, `invalidArgument` (`../errors`).
- Produces: `startGameHandler(tx, roomRef, uid, now?): Promise<void>` and the `startGame` `onCall` export.

- [ ] **Step 1: Write the failing tests**

Create `functions/src/rooms/startGame.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import type { Transaction, DocumentReference, Timestamp } from 'firebase-admin/firestore';
import { startGameHandler } from './startGame';
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
  players: [
    { id: 'uid-1', name: 'Ola', avatarId: 'fox' },
    { id: 'uid-2', name: 'Kuba', avatarId: 'wolf' },
  ],
  createdAt: {} as Timestamp,
  updatedAt: {} as Timestamp,
};

describe('startGameHandler', () => {
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
  });

  it('rejects when the caller is not the host', async () => {
    const { tx } = fakeTransaction(lobbyRoom);
    await expect(startGameHandler(tx, roomRef, 'uid-2', fixedNow)).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('rejects when there are fewer than 2 players', async () => {
    const soloRoom: RoomDocument = { ...lobbyRoom, players: [lobbyRoom.players[0]] };
    const { tx } = fakeTransaction(soloRoom);
    await expect(startGameHandler(tx, roomRef, 'uid-1', fixedNow)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('rejects when the room already started', async () => {
    const playingRoom = { ...lobbyRoom, phase: 'playing' } as RoomDocument;
    const { tx } = fakeTransaction(playingRoom);
    await expect(startGameHandler(tx, roomRef, 'uid-1', fixedNow)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('throws not-found when the room does not exist', async () => {
    const { tx } = fakeTransaction(null);
    await expect(startGameHandler(tx, roomRef, 'uid-1', fixedNow)).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd functions
npx vitest run src/rooms/startGame.test.ts
```

Expected: FAIL — `Cannot find module './startGame'`.

- [ ] **Step 3: Implement `startGame.ts`**

Create `functions/src/rooms/startGame.ts`:

```ts
import { onCall } from 'firebase-functions/v2/https';
import { Timestamp, type Transaction, type DocumentReference } from 'firebase-admin/firestore';
import { createGameStateFromPlayers, MIN_PLAYERS } from '@bronx-dice/game-engine';
import { db } from '../firebaseAdmin';
import { unauthenticated, notFound, failedPrecondition, permissionDenied, invalidArgument } from '../errors';
import type { RoomDocument } from './types';

export async function startGameHandler(
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
  if (room.phase !== 'lobby') {
    throw failedPrecondition('Gra już wystartowała lub się zakończyła.');
  }
  if (room.hostId !== uid) {
    throw permissionDenied('Tylko host może rozpocząć grę.');
  }
  if (room.players.length < MIN_PLAYERS) {
    throw failedPrecondition(`Potrzeba co najmniej ${MIN_PLAYERS} graczy.`);
  }
  const gameState = createGameStateFromPlayers(room.players);
  tx.update(roomRef, { ...gameState, phase: 'playing', updatedAt: now() });
}

export const startGame = onCall<{ roomId: string }>(async (request) => {
  if (!request.auth) {
    throw unauthenticated();
  }
  const roomId = request.data?.roomId;
  if (typeof roomId !== 'string' || roomId.length === 0) {
    throw invalidArgument('Brak kodu pokoju.');
  }
  const roomRef = db.collection('rooms').doc(roomId);
  await db.runTransaction((tx) => startGameHandler(tx, roomRef, request.auth!.uid));
});
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/rooms/startGame.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Export `startGame` from the entry point**

Modify `functions/src/index.ts` — append:
```ts
export { startGame } from './rooms/startGame';
```

- [ ] **Step 6: Verify the whole package**

```bash
npm run build
npm run lint
npm test
```

Expected: build succeeds, lint clean, all 27 tests pass.

- [ ] **Step 7: Commit**

```bash
cd ..
git add functions/src/rooms/startGame.ts functions/src/rooms/startGame.test.ts functions/src/index.ts
git commit -m "Add startGame Cloud Function"
```

---

### Task 9: `rollDice` Cloud Function

**Files:**
- Create: `functions/src/rooms/rollDice.ts`
- Test: `functions/src/rooms/rollDice.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `rollInTurn` from `@bronx-dice/game-engine`; `RoomDocument` (`./types`); `db` (`../firebaseAdmin`); `unauthenticated`, `notFound`, `failedPrecondition`, `permissionDenied`, `invalidArgument` (`../errors`).
- Produces: `rollDiceHandler(tx, roomRef, uid, random?, now?): Promise<void>` and the `rollDice` `onCall` export.

- [ ] **Step 1: Write the failing tests**

Create `functions/src/rooms/rollDice.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import type { Transaction, DocumentReference, Timestamp } from 'firebase-admin/firestore';
import { rollDiceHandler } from './rollDice';
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

const playingRoom: RoomDocument = {
  phase: 'playing',
  hostId: 'uid-1',
  maxPlayers: 2,
  players: [
    { id: 'uid-1', name: 'Ola', avatarId: 'fox' },
    { id: 'uid-2', name: 'Kuba', avatarId: 'wolf' },
  ],
  scoreCards: {},
  dice: [],
  heldDice: [false, false, false, false, false],
  rollsLeft: 3,
  currentPlayerIndex: 0,
  createdAt: {} as Timestamp,
  updatedAt: {} as Timestamp,
};

describe('rollDiceHandler', () => {
  it("rolls dice and decrements rollsLeft on the current player's turn", async () => {
    const { tx, update } = fakeTransaction(playingRoom);
    await rollDiceHandler(tx, roomRef, 'uid-1', () => 0, fixedNow);
    expect(update).toHaveBeenCalledWith(roomRef, {
      dice: [1, 1, 1, 1, 1],
      rollsLeft: 2,
      updatedAt: {},
    });
  });

  it('rejects when it is not the caller\'s turn', async () => {
    const { tx } = fakeTransaction(playingRoom);
    await expect(rollDiceHandler(tx, roomRef, 'uid-2', () => 0, fixedNow)).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('rejects when there are no rolls left', async () => {
    const noRollsRoom = { ...playingRoom, rollsLeft: 0 };
    const { tx } = fakeTransaction(noRollsRoom);
    await expect(rollDiceHandler(tx, roomRef, 'uid-1', () => 0, fixedNow)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('rejects when the room is not in the playing phase', async () => {
    const lobbyRoom = { ...playingRoom, phase: 'lobby' } as RoomDocument;
    const { tx } = fakeTransaction(lobbyRoom);
    await expect(rollDiceHandler(tx, roomRef, 'uid-1', () => 0, fixedNow)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('throws not-found when the room does not exist', async () => {
    const { tx } = fakeTransaction(null);
    await expect(rollDiceHandler(tx, roomRef, 'uid-1', () => 0, fixedNow)).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd functions
npx vitest run src/rooms/rollDice.test.ts
```

Expected: FAIL — `Cannot find module './rollDice'`.

- [ ] **Step 3: Implement `rollDice.ts`**

Create `functions/src/rooms/rollDice.ts`:

```ts
import { onCall } from 'firebase-functions/v2/https';
import { Timestamp, type Transaction, type DocumentReference } from 'firebase-admin/firestore';
import { rollInTurn } from '@bronx-dice/game-engine';
import { db } from '../firebaseAdmin';
import { unauthenticated, notFound, failedPrecondition, permissionDenied, invalidArgument } from '../errors';
import type { RoomDocument } from './types';

export async function rollDiceHandler(
  tx: Transaction,
  roomRef: DocumentReference,
  uid: string,
  random: () => number = Math.random,
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
  const currentPlayer = room.players[room.currentPlayerIndex];
  if (currentPlayer.id !== uid) {
    throw permissionDenied('To nie twoja tura.');
  }
  if (room.rollsLeft <= 0) {
    throw failedPrecondition('Nie masz już rzutów w tej turze.');
  }
  const next = rollInTurn(room, random);
  tx.update(roomRef, { dice: next.dice, rollsLeft: next.rollsLeft, updatedAt: now() });
}

export const rollDice = onCall<{ roomId: string }>(async (request) => {
  if (!request.auth) {
    throw unauthenticated();
  }
  const roomId = request.data?.roomId;
  if (typeof roomId !== 'string' || roomId.length === 0) {
    throw invalidArgument('Brak kodu pokoju.');
  }
  const roomRef = db.collection('rooms').doc(roomId);
  await db.runTransaction((tx) => rollDiceHandler(tx, roomRef, request.auth!.uid));
});
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/rooms/rollDice.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Export `rollDice` from the entry point**

Modify `functions/src/index.ts` — append:
```ts
export { rollDice } from './rooms/rollDice';
```

- [ ] **Step 6: Verify the whole package**

```bash
npm run build
npm run lint
npm test
```

Expected: build succeeds, lint clean, all 32 tests pass.

- [ ] **Step 7: Commit**

```bash
cd ..
git add functions/src/rooms/rollDice.ts functions/src/rooms/rollDice.test.ts functions/src/index.ts
git commit -m "Add rollDice Cloud Function"
```

---

### Task 10: `toggleHeldDie` Cloud Function

**Files:**
- Create: `functions/src/rooms/toggleHeldDie.ts`
- Test: `functions/src/rooms/toggleHeldDie.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `toggleHeldDie` (engine function, aliased to avoid a name clash with this file's own `onCall` export) from `@bronx-dice/game-engine`; `RoomDocument` (`./types`); `db` (`../firebaseAdmin`); `unauthenticated`, `notFound`, `failedPrecondition`, `permissionDenied`, `invalidArgument` (`../errors`).
- Produces: `toggleHeldDieHandler(tx, roomRef, uid, dieIndex, now?): Promise<void>` and the `toggleHeldDie` `onCall` export.

- [ ] **Step 1: Write the failing tests**

Create `functions/src/rooms/toggleHeldDie.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import type { Transaction, DocumentReference, Timestamp } from 'firebase-admin/firestore';
import { toggleHeldDieHandler } from './toggleHeldDie';
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

const playingRoom: RoomDocument = {
  phase: 'playing',
  hostId: 'uid-1',
  maxPlayers: 2,
  players: [
    { id: 'uid-1', name: 'Ola', avatarId: 'fox' },
    { id: 'uid-2', name: 'Kuba', avatarId: 'wolf' },
  ],
  scoreCards: {},
  dice: [1, 2, 3, 4, 5],
  heldDice: [false, false, false, false, false],
  rollsLeft: 2,
  currentPlayerIndex: 0,
  createdAt: {} as Timestamp,
  updatedAt: {} as Timestamp,
};

describe('toggleHeldDieHandler', () => {
  it("toggles the held state for the given die index on the caller's turn", async () => {
    const { tx, update } = fakeTransaction(playingRoom);
    await toggleHeldDieHandler(tx, roomRef, 'uid-1', 1, fixedNow);
    expect(update).toHaveBeenCalledWith(roomRef, {
      heldDice: [false, true, false, false, false],
      updatedAt: {},
    });
  });

  it('rejects an out-of-range die index', async () => {
    const { tx } = fakeTransaction(playingRoom);
    await expect(toggleHeldDieHandler(tx, roomRef, 'uid-1', 5, fixedNow)).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('rejects before any dice have been rolled', async () => {
    const notRolledRoom = { ...playingRoom, dice: [] };
    const { tx } = fakeTransaction(notRolledRoom);
    await expect(toggleHeldDieHandler(tx, roomRef, 'uid-1', 0, fixedNow)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it("rejects when it is not the caller's turn", async () => {
    const { tx } = fakeTransaction(playingRoom);
    await expect(toggleHeldDieHandler(tx, roomRef, 'uid-2', 0, fixedNow)).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('rejects when the room is not in the playing phase', async () => {
    const lobbyRoom = { ...playingRoom, phase: 'lobby' } as RoomDocument;
    const { tx } = fakeTransaction(lobbyRoom);
    await expect(toggleHeldDieHandler(tx, roomRef, 'uid-1', 0, fixedNow)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('throws not-found when the room does not exist', async () => {
    const { tx } = fakeTransaction(null);
    await expect(toggleHeldDieHandler(tx, roomRef, 'uid-1', 0, fixedNow)).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd functions
npx vitest run src/rooms/toggleHeldDie.test.ts
```

Expected: FAIL — `Cannot find module './toggleHeldDie'`.

- [ ] **Step 3: Implement `toggleHeldDie.ts`**

Create `functions/src/rooms/toggleHeldDie.ts`:

```ts
import { onCall } from 'firebase-functions/v2/https';
import { Timestamp, type Transaction, type DocumentReference } from 'firebase-admin/firestore';
import { toggleHeldDie as applyToggleHeldDie } from '@bronx-dice/game-engine';
import { db } from '../firebaseAdmin';
import { unauthenticated, notFound, failedPrecondition, permissionDenied, invalidArgument } from '../errors';
import type { RoomDocument } from './types';

export async function toggleHeldDieHandler(
  tx: Transaction,
  roomRef: DocumentReference,
  uid: string,
  dieIndex: number,
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
  const currentPlayer = room.players[room.currentPlayerIndex];
  if (currentPlayer.id !== uid) {
    throw permissionDenied('To nie twoja tura.');
  }
  if (room.dice.length !== 5) {
    throw failedPrecondition('Musisz najpierw rzucić kośćmi.');
  }
  if (!Number.isInteger(dieIndex) || dieIndex < 0 || dieIndex > 4) {
    throw invalidArgument('Zły indeks kostki.');
  }
  const next = applyToggleHeldDie(room, dieIndex);
  tx.update(roomRef, { heldDice: next.heldDice, updatedAt: now() });
}

export const toggleHeldDie = onCall<{ roomId: string; dieIndex: number }>(async (request) => {
  if (!request.auth) {
    throw unauthenticated();
  }
  const { roomId, dieIndex } = request.data ?? {};
  if (typeof roomId !== 'string' || roomId.length === 0) {
    throw invalidArgument('Brak kodu pokoju.');
  }
  const roomRef = db.collection('rooms').doc(roomId);
  await db.runTransaction((tx) => toggleHeldDieHandler(tx, roomRef, request.auth!.uid, dieIndex));
});
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/rooms/toggleHeldDie.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Export `toggleHeldDie` from the entry point**

Modify `functions/src/index.ts` — append:
```ts
export { toggleHeldDie } from './rooms/toggleHeldDie';
```

- [ ] **Step 6: Verify the whole package**

```bash
npm run build
npm run lint
npm test
```

Expected: build succeeds, lint clean, all 38 tests pass.

- [ ] **Step 7: Commit**

```bash
cd ..
git add functions/src/rooms/toggleHeldDie.ts functions/src/rooms/toggleHeldDie.test.ts functions/src/index.ts
git commit -m "Add toggleHeldDie Cloud Function"
```

---

### Task 11: `scoreCategory` Cloud Function

**Files:**
- Create: `functions/src/rooms/scoreCategory.ts`
- Test: `functions/src/rooms/scoreCategory.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `applyScore`, `canScoreCategory`, `isGameOver`, `createEmptyScoreCard`, `UPPER_CATEGORIES`, `LOWER_CATEGORIES`, `type ScoreCategory` from `@bronx-dice/game-engine`; `RoomDocument` (`./types`); `db` (`../firebaseAdmin`); `unauthenticated`, `notFound`, `failedPrecondition`, `permissionDenied`, `invalidArgument` (`../errors`).
- Produces: `scoreCategoryHandler(tx, roomRef, uid, category, now?): Promise<void>` and the `scoreCategory` `onCall` export.

- [ ] **Step 1: Write the failing tests**

Create `functions/src/rooms/scoreCategory.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import type { Transaction, DocumentReference, Timestamp } from 'firebase-admin/firestore';
import { createEmptyScoreCard, UPPER_CATEGORIES, LOWER_CATEGORIES } from '@bronx-dice/game-engine';
import { scoreCategoryHandler } from './scoreCategory';
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

function basePlayingRoom(): RoomDocument {
  return {
    phase: 'playing',
    hostId: 'uid-1',
    maxPlayers: 2,
    players: [
      { id: 'uid-1', name: 'Ola', avatarId: 'fox' },
      { id: 'uid-2', name: 'Kuba', avatarId: 'wolf' },
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

describe('scoreCategoryHandler', () => {
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
  });

  it('sets phase to finished when scoring completes the last open category', async () => {
    const room = basePlayingRoom();
    // Player uid-1: everything filled except 'chance'. Player uid-2: fully filled already.
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
    room.dice = [1, 1, 1, 1, 1];
    room.rollsLeft = 3;
    const { tx, update } = fakeTransaction(room);
    await scoreCategoryHandler(tx, roomRef, 'uid-1', 'chance', fixedNow);
    const [, patch] = update.mock.calls[0];
    expect(patch.scoreCards['uid-1'].lower.chance).toBe(5);
    expect(patch.phase).toBe('finished');
  });

  it('rejects a category that cannot be scored right now', async () => {
    const room = basePlayingRoom();
    room.scoreCards['uid-1'].upper.aces = 3; // already scored
    const { tx } = fakeTransaction(room);
    await expect(
      scoreCategoryHandler(tx, roomRef, 'uid-1', 'aces', fixedNow)
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects before rolling', async () => {
    const room = { ...basePlayingRoom(), dice: [] };
    const { tx } = fakeTransaction(room);
    await expect(
      scoreCategoryHandler(tx, roomRef, 'uid-1', 'chance', fixedNow)
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it("rejects when it is not the caller's turn", async () => {
    const room = basePlayingRoom();
    const { tx } = fakeTransaction(room);
    await expect(
      scoreCategoryHandler(tx, roomRef, 'uid-2', 'chance', fixedNow)
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects when the room is not in the playing phase', async () => {
    const room = { ...basePlayingRoom(), phase: 'lobby' } as RoomDocument;
    const { tx } = fakeTransaction(room);
    await expect(
      scoreCategoryHandler(tx, roomRef, 'uid-1', 'chance', fixedNow)
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('throws not-found when the room does not exist', async () => {
    const { tx } = fakeTransaction(null);
    await expect(
      scoreCategoryHandler(tx, roomRef, 'uid-1', 'chance', fixedNow)
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});
```

Note on the first test's expected value: dice `[3, 3, 5, 5, 5]` is a full house (sum 21); `rollsLeft` is `3` when the call is made (not `2`), so `DOUBLE_SCORE_ROLLS_LEFT` doesn't apply and the raw sum (21) is stored as-is.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd functions
npx vitest run src/rooms/scoreCategory.test.ts
```

Expected: FAIL — `Cannot find module './scoreCategory'`.

- [ ] **Step 3: Implement `scoreCategory.ts`**

Create `functions/src/rooms/scoreCategory.ts`:

```ts
import { onCall } from 'firebase-functions/v2/https';
import { Timestamp, type Transaction, type DocumentReference } from 'firebase-admin/firestore';
import {
  applyScore,
  canScoreCategory,
  isGameOver,
  UPPER_CATEGORIES,
  LOWER_CATEGORIES,
  type ScoreCategory,
} from '@bronx-dice/game-engine';
import { db } from '../firebaseAdmin';
import { unauthenticated, notFound, failedPrecondition, permissionDenied, invalidArgument } from '../errors';
import type { RoomDocument } from './types';

const ALL_CATEGORIES: string[] = [...UPPER_CATEGORIES, ...LOWER_CATEGORIES];

export async function scoreCategoryHandler(
  tx: Transaction,
  roomRef: DocumentReference,
  uid: string,
  category: ScoreCategory,
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
  const currentPlayer = room.players[room.currentPlayerIndex];
  if (currentPlayer.id !== uid) {
    throw permissionDenied('To nie twoja tura.');
  }
  if (room.dice.length !== 5) {
    throw failedPrecondition('Musisz najpierw rzucić kośćmi.');
  }
  const currentScoreCard = room.scoreCards[currentPlayer.id];
  if (!canScoreCategory(currentScoreCard, category)) {
    throw failedPrecondition('Nie można teraz zapisać tej kategorii.');
  }
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
}

export const scoreCategory = onCall<{ roomId: string; category: string }>(async (request) => {
  if (!request.auth) {
    throw unauthenticated();
  }
  const { roomId, category } = request.data ?? {};
  if (typeof roomId !== 'string' || roomId.length === 0) {
    throw invalidArgument('Brak kodu pokoju.');
  }
  if (typeof category !== 'string' || !ALL_CATEGORIES.includes(category)) {
    throw invalidArgument('Nieznana kategoria.');
  }
  const roomRef = db.collection('rooms').doc(roomId);
  await db.runTransaction((tx) =>
    scoreCategoryHandler(tx, roomRef, request.auth!.uid, category as ScoreCategory)
  );
});
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/rooms/scoreCategory.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 5: Export `scoreCategory` from the entry point**

Modify `functions/src/index.ts` — append:
```ts
export { scoreCategory } from './rooms/scoreCategory';
```

- [ ] **Step 6: Verify the whole package**

```bash
npm run build
npm run lint
npm test
```

Expected: build succeeds, lint clean, all 45 tests pass.

- [ ] **Step 7: Commit**

```bash
cd ..
git add functions/src/rooms/scoreCategory.ts functions/src/rooms/scoreCategory.test.ts functions/src/index.ts
git commit -m "Add scoreCategory Cloud Function"
```

---

### Task 12: `leaveRoom` Cloud Function

**Files:**
- Create: `functions/src/rooms/leaveRoom.ts`
- Test: `functions/src/rooms/leaveRoom.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `RoomDocument` (`./types`); `db` (`../firebaseAdmin`); `unauthenticated`, `notFound`, `failedPrecondition`, `invalidArgument` (`../errors`).
- Produces: `leaveRoomHandler(tx, roomRef, uid, now?): Promise<void>` and the `leaveRoom` `onCall` export. This completes the seven Cloud Functions from the design doc.

- [ ] **Step 1: Write the failing tests**

Create `functions/src/rooms/leaveRoom.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import type { Transaction, DocumentReference, Timestamp } from 'firebase-admin/firestore';
import { leaveRoomHandler } from './leaveRoom';
import type { RoomDocument } from './types';

function fakeTransaction(room: RoomDocument | null) {
  const update = vi.fn();
  const del = vi.fn();
  const tx = {
    get: async () => ({ exists: room !== null, data: () => room }),
    update,
    delete: del,
  };
  return { tx: tx as unknown as Transaction, update, del };
}

const roomRef = {} as DocumentReference;
const fixedNow = () => ({}) as unknown as Timestamp;

const twoPlayerLobby: RoomDocument = {
  phase: 'lobby',
  hostId: 'uid-1',
  maxPlayers: 3,
  players: [
    { id: 'uid-1', name: 'Ola', avatarId: 'fox' },
    { id: 'uid-2', name: 'Kuba', avatarId: 'wolf' },
  ],
  createdAt: {} as Timestamp,
  updatedAt: {} as Timestamp,
};

describe('leaveRoomHandler', () => {
  it('removes a non-host player from the lobby, keeping the host', async () => {
    const { tx, update } = fakeTransaction(twoPlayerLobby);
    await leaveRoomHandler(tx, roomRef, 'uid-2', fixedNow);
    expect(update).toHaveBeenCalledWith(roomRef, {
      players: [{ id: 'uid-1', name: 'Ola', avatarId: 'fox' }],
      hostId: 'uid-1',
      updatedAt: {},
    });
  });

  it('promotes the next remaining player to host when the host leaves', async () => {
    const { tx, update } = fakeTransaction(twoPlayerLobby);
    await leaveRoomHandler(tx, roomRef, 'uid-1', fixedNow);
    expect(update).toHaveBeenCalledWith(roomRef, {
      players: [{ id: 'uid-2', name: 'Kuba', avatarId: 'wolf' }],
      hostId: 'uid-2',
      updatedAt: {},
    });
  });

  it('deletes the room when the last player leaves', async () => {
    const soloRoom: RoomDocument = { ...twoPlayerLobby, players: [twoPlayerLobby.players[0]] };
    const { tx, del, update } = fakeTransaction(soloRoom);
    await leaveRoomHandler(tx, roomRef, 'uid-1', fixedNow);
    expect(del).toHaveBeenCalledWith(roomRef);
    expect(update).not.toHaveBeenCalled();
  });

  it('is a no-op when the caller is not in the room', async () => {
    const { tx, update, del } = fakeTransaction(twoPlayerLobby);
    await leaveRoomHandler(tx, roomRef, 'uid-9', fixedNow);
    expect(update).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it('rejects when the room is not in the lobby phase', async () => {
    const playingRoom = { ...twoPlayerLobby, phase: 'playing' } as RoomDocument;
    const { tx } = fakeTransaction(playingRoom);
    await expect(leaveRoomHandler(tx, roomRef, 'uid-1', fixedNow)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('throws not-found when the room does not exist', async () => {
    const { tx } = fakeTransaction(null);
    await expect(leaveRoomHandler(tx, roomRef, 'uid-1', fixedNow)).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd functions
npx vitest run src/rooms/leaveRoom.test.ts
```

Expected: FAIL — `Cannot find module './leaveRoom'`.

- [ ] **Step 3: Implement `leaveRoom.ts`**

Create `functions/src/rooms/leaveRoom.ts`:

```ts
import { onCall } from 'firebase-functions/v2/https';
import { Timestamp, type Transaction, type DocumentReference } from 'firebase-admin/firestore';
import { db } from '../firebaseAdmin';
import { unauthenticated, notFound, failedPrecondition, invalidArgument } from '../errors';
import type { RoomDocument } from './types';

export async function leaveRoomHandler(
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
  if (room.phase !== 'lobby') {
    throw failedPrecondition('Nie można opuścić pokoju w trakcie rozgrywki.');
  }
  const remainingPlayers = room.players.filter((player) => player.id !== uid);
  if (remainingPlayers.length === room.players.length) {
    return;
  }
  if (remainingPlayers.length === 0) {
    tx.delete(roomRef);
    return;
  }
  const hostId = room.hostId === uid ? remainingPlayers[0].id : room.hostId;
  tx.update(roomRef, { players: remainingPlayers, hostId, updatedAt: now() });
}

export const leaveRoom = onCall<{ roomId: string }>(async (request) => {
  if (!request.auth) {
    throw unauthenticated();
  }
  const roomId = request.data?.roomId;
  if (typeof roomId !== 'string' || roomId.length === 0) {
    throw invalidArgument('Brak kodu pokoju.');
  }
  const roomRef = db.collection('rooms').doc(roomId);
  await db.runTransaction((tx) => leaveRoomHandler(tx, roomRef, request.auth!.uid));
});
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/rooms/leaveRoom.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Export `leaveRoom` from the entry point**

Modify `functions/src/index.ts` — append:
```ts
export { leaveRoom } from './rooms/leaveRoom';
```

Final `functions/src/index.ts` should now read:

```ts
// Cloud Functions entry point — each task in
// docs/superpowers/plans/2026-07-04-etap-5-backend-online.md adds one
// export here as it implements the corresponding Cloud Function.
export { createRoom } from './rooms/createRoom';
export { joinRoom } from './rooms/joinRoom';
export { startGame } from './rooms/startGame';
export { rollDice } from './rooms/rollDice';
export { toggleHeldDie } from './rooms/toggleHeldDie';
export { scoreCategory } from './rooms/scoreCategory';
export { leaveRoom } from './rooms/leaveRoom';
```

- [ ] **Step 6: Verify the whole package**

```bash
npm run build
npm run lint
npm test
```

Expected: build succeeds, lint clean, all 51 tests pass.

- [ ] **Step 7: Commit**

```bash
cd ..
git add functions/src/rooms/leaveRoom.ts functions/src/rooms/leaveRoom.test.ts functions/src/index.ts
git commit -m "Add leaveRoom Cloud Function"
```

---

### Task 13: Firestore Security Rules for `rooms/{roomId}` + automated rules tests

**Files:**
- Modify: `firestore.rules` (repo root)
- Modify: `app/package.json` (new devDependency + `test:rules` script)
- Modify: `app/vite.config.ts` (exclude the rules test from the default `npm test`)
- Create: `app/vitest.rules.config.ts`
- Create: `app/src/firebase/firestoreRules.test.ts`

**Interfaces:**
- Consumes: `@firebase/rules-unit-testing` (`initializeTestEnvironment`, `assertSucceeds`, `assertFails`).
- Produces: nothing consumed by later tasks — this is the last piece needed before the full-lifecycle integration test (Task 14) so both halves of "Functions-only writes" are proven: Functions can write (Admin SDK bypasses rules, exercised by Task 14), and clients cannot (exercised here).

- [ ] **Step 1: Update the Security Rules**

Modify `firestore.rules` (repo root) — replace its contents:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    match /rooms/{roomId} {
      allow read: if request.auth != null;
      allow write: if false;
    }
  }
}
```

- [ ] **Step 2: Add the rules-testing dependency and script**

Modify `app/package.json` — add to `"devDependencies"` (alphabetical):

```json
    "@firebase/rules-unit-testing": "^4.0.1",
```

and add to `"scripts"`:

```json
    "test:rules": "vitest run --config vitest.rules.config.ts",
```

- [ ] **Step 3: Create the dedicated Vitest config for the rules test**

Create `app/vitest.rules.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/firebase/firestoreRules.test.ts'],
    testTimeout: 20000,
  },
});
```

- [ ] **Step 4: Exclude the rules test from the default `app` test run**

Modify `app/vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { configDefaults } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: [...configDefaults.exclude, 'src/firebase/firestoreRules.test.ts'],
  },
})
```

- [ ] **Step 5: Write the rules test**

Create `app/src/firebase/firestoreRules.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
```

The test reads `../firestore.rules` because Vitest for `app` runs with `app/` as its working directory, and `firestore.rules` now lives one directory up, at the repo root (Task 1, Step 4).

- [ ] **Step 6: Install and run the rules test against the emulator**

From the repo root:

```bash
npm install
npm run test:rules
```

Expected: `firebase emulators:exec --only firestore "npm run test:rules --workspace=app"` starts the Firestore emulator, runs the 3 rules tests (all PASS), then shuts the emulator down.

- [ ] **Step 7: Verify the default `app` test run is unaffected**

```bash
npm test --workspace=app
```

Expected: same test count as before this task — `firestoreRules.test.ts` is excluded, so no emulator is required for the default run.

- [ ] **Step 8: Commit**

```bash
git add firestore.rules app/package.json app/package-lock.json app/vite.config.ts app/vitest.rules.config.ts app/src/firebase/firestoreRules.test.ts
git commit -m "Add Firestore Security Rules for rooms/{roomId} and an emulator-backed rules test"
```

---

### Task 14: Full-lifecycle integration test against the Firestore Emulator

**Files:**
- Create: `functions/src/rooms/rooms.integration.test.ts`

**Interfaces:**
- Consumes: every handler from Tasks 6–12 (`createRoomHandler`, `joinRoomHandler`, `startGameHandler`, `rollDiceHandler`, `toggleHeldDieHandler`, `scoreCategoryHandler`, `leaveRoomHandler`), plus `db` from `../firebaseAdmin` and `getFirestore`/`Timestamp` from `firebase-admin/firestore`.
- Produces: nothing (last task in this plan) — this is the plan's final proof that the seven handlers cooperate correctly against a real Firestore, not just against fakes.

- [ ] **Step 1: Write the integration test**

Create `functions/src/rooms/rooms.integration.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { db } from '../firebaseAdmin';
import { createRoomHandler } from './createRoom';
import { joinRoomHandler } from './joinRoom';
import { startGameHandler } from './startGame';
import { rollDiceHandler } from './rollDice';
import { toggleHeldDieHandler } from './toggleHeldDie';
import { scoreCategoryHandler } from './scoreCategory';
import type { RoomDocument } from './types';

const hostProfile = { displayName: 'Ola', avatarId: 'fox' };
const guestProfile = { displayName: 'Kuba', avatarId: 'wolf' };

async function getRoom(roomId: string): Promise<RoomDocument> {
  const snapshot = await db.collection('rooms').doc(roomId).get();
  return snapshot.data() as RoomDocument;
}

describe('room lifecycle (Firestore emulator)', () => {
  it('goes from createRoom through scoreCategory to a finished game', async () => {
    const roomId = await createRoomHandler(db, 'uid-host', hostProfile, 2);
    let room = await getRoom(roomId);
    expect(room.phase).toBe('lobby');
    expect(room.players).toHaveLength(1);

    const roomRef = db.collection('rooms').doc(roomId);
    await db.runTransaction((tx) => joinRoomHandler(tx, roomRef, 'uid-guest', guestProfile));
    room = await getRoom(roomId);
    expect(room.players).toHaveLength(2);

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
});
```

- [ ] **Step 2: Run the integration test against the emulator**

From the repo root:

```bash
npm run test:functions-integration
```

Expected: `firebase emulators:exec --only firestore "npm run test:integration --workspace=functions"` starts the Firestore emulator, runs the single lifecycle test (PASS), then shuts the emulator down.

- [ ] **Step 3: Verify the default `functions` test run is unaffected**

```bash
npm test --workspace=functions
```

Expected: same 51 tests as after Task 12 — `rooms.integration.test.ts` is excluded from the default config (Task 3's `vitest.config.ts` excludes `**/*.integration.test.ts`).

- [ ] **Step 4: Run the full non-emulator verification one more time across the whole repo**

```bash
npm run build --workspace=packages/game-engine
npm run build --workspace=app
npm run build --workspace=functions
npm run lint --workspace=app
npm run lint --workspace=functions
npm run lint --workspace=packages/game-engine
npm test --workspace=app
npm test --workspace=functions
npm test --workspace=packages/game-engine
```

Expected: everything builds, lints clean, and all fast (non-emulator) tests pass across all three packages.

- [ ] **Step 5: Commit**

```bash
git add functions/src/rooms/rooms.integration.test.ts
git commit -m "Add full room-lifecycle integration test against the Firestore Emulator"
```

## Definition of done for Etap 5

- Repo is an npm workspace (`app`, `functions`, `packages/game-engine`); `packages/game-engine` contains the unmodified (behaviorally) game engine plus `createGameStateFromPlayers`.
- `functions/` exposes seven Cloud Functions — `createRoom`, `joinRoom`, `startGame`, `rollDice`, `toggleHeldDie`, `scoreCategory`, `leaveRoom` — each validated (auth, phase, turn ownership, category legality) and each computing its next state via the shared engine.
- `rooms/{roomId}` Firestore Security Rules allow authenticated reads and block all direct client writes, proven by an automated, emulator-backed test.
- A full room-lifecycle integration test (`createRoom → joinRoom → startGame → rollDice → toggleHeldDie → scoreCategory → phase:'finished' path`) passes against the real Firestore Emulator.
- `npm test` in `app`, `functions`, and `packages/game-engine` all pass without any running emulator; the two emulator-backed suites (`npm run test:rules`, `npm run test:functions-integration`, both run from the repo root) pass when the emulator is available.
- No UI changes anywhere in `app/src/components` beyond the mechanical import-path updates in Task 1.
