# Etap 1 — Fundament + silnik gry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a clean, fully-tested, pure TypeScript game engine for Bronx Dice (Yahtzee-like) that replaces the buggy, copy-pasted-per-player logic in `pierwowzor/`, supports 2–6 players, and has zero UI — ready for Etap 2 to wire into React components.

**Architecture:** A Vite + React + TypeScript project scaffolded in `app/`. All game logic lives in `app/src/engine/` as pure functions (no React, no side effects beyond an injectable `random` function for dice rolls) operating on plain data types defined in `app/src/types/game.ts`. Every function is unit-tested with Vitest. No UI components are built in this stage — `App.tsx` keeps the Vite default scaffold untouched.

**Tech Stack:** React 18, TypeScript, Vite, Vitest (test runner), ESLint + Prettier (lint/format).

Source of truth for game rules: `docs/superpowers/specs/2026-07-01-bronx-dice-roadmap-design.md`, cross-checked against the existing (buggy) implementation in `pierwowzor/src/components/sub-components/GameTable.js`.

## Global Constraints

- Dice per roll: exactly 5 (`DICE_COUNT = 5`).
- Rolls per turn: exactly 3 (`MAX_ROLLS = 3`).
- Upper section bonus: +50 (`UPPER_BONUS_VALUE = 50`) when the sum of the 6 upper-section categories is ≥ 63 (`UPPER_BONUS_THRESHOLD = 63`).
- Lower-section categories can only be scored once the entire upper section is filled (`isUpperSectionFilled`).
- Doubling rule: any lower-section category scored while `rollsLeft === 2` (i.e. immediately after the first roll of the turn, 2 rolls still remaining) has its raw score doubled (`DOUBLE_SCORE_ROLLS_LEFT = 2`).
- Yahtzee ("Piątka/Generał", 5 matching dice): raw score = sum of the 5 dice; final score = `(doubled ? raw * 2 : raw) + 50` when achieved, `0` otherwise. The `+50` is never doubled (`YAHTZEE_BONUS = 50`).
- Player count: 2–6 (`MIN_PLAYERS = 2`, `MAX_PLAYERS = 6`), stored as a `Player[]` array — never as separate named variables.
- All engine functions are pure (no `Math.random()` calls outside an injectable `random` parameter, no mutation of arguments).
- All new source code lives under `app/`; `pierwowzor/` is read-only reference material and must not be modified.
- No UI/React components in this plan — engine + types only.

---

### Task 1: Project scaffold (Vite + React + TypeScript + Vitest + lint/format)

**Files:**
- Create: `app/` (via `npm create vite@latest`)
- Modify: `app/vite.config.ts`
- Modify: `app/package.json`
- Create: `app/.prettierrc`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a working `app/` project where `npm run build`, `npm run lint`, and `npm run test` all succeed. Later tasks add files under `app/src/types/` and `app/src/engine/`.

- [ ] **Step 1: Scaffold the Vite React+TS app**

Run from the repo root (`H:\My_projects\BronxDice2`):

```bash
npm create vite@latest app -- --template react-ts
```

Expected: a new `app/` directory containing `package.json`, `src/App.tsx`, `tsconfig.json`, `eslint.config.js`, etc.

- [ ] **Step 2: Install dependencies**

```bash
cd app
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 3: Add Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 4: Configure Vitest in `vite.config.ts`**

Replace the contents of `app/vite.config.ts` with:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
  },
})
```

- [ ] **Step 5: Add a `test` script**

In `app/package.json`, add to `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 6: Add Prettier**

```bash
npm install -D prettier
```

Create `app/.prettierrc`:

```json
{
  "singleQuote": true,
  "semi": true,
  "trailingComma": "es5"
}
```

- [ ] **Step 7: Verify build and lint pass**

```bash
npm run build
npm run lint
```

Expected: `npm run build` ends with `✓ built in <time>`, no TypeScript errors. `npm run lint` exits with no errors (the default Vite ESLint config is already wired up by the template).

- [ ] **Step 8: Verify the (currently empty) test command doesn't error**

Since no test files exist yet, skip running `npm run test` here — it will be exercised for real in Task 3. Instead just confirm the script exists:

```bash
npm run test -- --version
```

Expected: prints the Vitest version number, confirming the CLI is wired up correctly.

- [ ] **Step 9: Commit**

```bash
cd ..
git add app/
git commit -m "Scaffold Vite + React + TypeScript app with Vitest and Prettier"
```

---

### Task 2: Domain types

**Files:**
- Create: `app/src/types/game.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `DiceValue` (`1|2|3|4|5|6`)
  - `UpperCategory`, `LowerCategory`, `ScoreCategory`
  - `UPPER_CATEGORIES: UpperCategory[]`, `LOWER_CATEGORIES: LowerCategory[]`
  - `PlayerScoreCard { upper: Record<UpperCategory, number | null>; lower: Record<LowerCategory, number | null> }`
  - `Player { id: string; name: string }`
  - `GameState { players: Player[]; scoreCards: Record<string, PlayerScoreCard>; dice: DiceValue[]; heldDice: boolean[]; rollsLeft: number; currentPlayerIndex: number }`

This task has no runtime logic, so there is no failing-test cycle — it's verified by the TypeScript compiler.

- [ ] **Step 1: Create the types file**

Create `app/src/types/game.ts`:

```ts
export type DiceValue = 1 | 2 | 3 | 4 | 5 | 6;

export type UpperCategory =
  | 'aces'
  | 'twos'
  | 'threes'
  | 'fours'
  | 'fives'
  | 'sixes';

export type LowerCategory =
  | 'pair'
  | 'twoPair'
  | 'threeOfKind'
  | 'fourOfKind'
  | 'smallStraight'
  | 'largeStraight'
  | 'fullHouse'
  | 'chance'
  | 'yahtzee';

export type ScoreCategory = UpperCategory | LowerCategory;

export const UPPER_CATEGORIES: UpperCategory[] = [
  'aces',
  'twos',
  'threes',
  'fours',
  'fives',
  'sixes',
];

export const LOWER_CATEGORIES: LowerCategory[] = [
  'pair',
  'twoPair',
  'threeOfKind',
  'fourOfKind',
  'smallStraight',
  'largeStraight',
  'fullHouse',
  'chance',
  'yahtzee',
];

export interface PlayerScoreCard {
  upper: Record<UpperCategory, number | null>;
  lower: Record<LowerCategory, number | null>;
}

export interface Player {
  id: string;
  name: string;
}

export interface GameState {
  players: Player[];
  scoreCards: Record<string, PlayerScoreCard>;
  dice: DiceValue[];
  heldDice: boolean[];
  rollsLeft: number;
  currentPlayerIndex: number;
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd app
npx tsc --noEmit
```

Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
cd ..
git add app/src/types/game.ts
git commit -m "Add domain types for Bronx Dice game engine"
```

---

### Task 3: Dice rolling

**Files:**
- Create: `app/src/engine/dice.ts`
- Test: `app/src/engine/dice.test.ts`

**Interfaces:**
- Consumes: `DiceValue` from `../types/game`.
- Produces:
  - `DICE_COUNT: number` (= 5)
  - `MAX_ROLLS: number` (= 3)
  - `createEmptyDice(): DiceValue[]` — returns `[]`, representing "not rolled yet this turn"
  - `rollDice(currentDice: DiceValue[], held: boolean[], random?: () => number): DiceValue[]` — returns exactly `DICE_COUNT` dice; a die is kept from `currentDice[i]` when `held[i]` is true and `currentDice[i]` exists, otherwise a fresh value is generated via `random`

- [ ] **Step 1: Write the failing tests**

Create `app/src/engine/dice.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { rollDice, createEmptyDice, DICE_COUNT, MAX_ROLLS } from './dice';
import type { DiceValue } from '../types/game';

describe('constants', () => {
  it('DICE_COUNT is 5', () => {
    expect(DICE_COUNT).toBe(5);
  });

  it('MAX_ROLLS is 3', () => {
    expect(MAX_ROLLS).toBe(3);
  });
});

describe('createEmptyDice', () => {
  it('returns an empty array', () => {
    expect(createEmptyDice()).toEqual([]);
  });
});

describe('rollDice', () => {
  it('rolls all 5 dice fresh when nothing is held and no dice exist yet', () => {
    const sequence = [0, 0.2, 0.4, 0.6, 0.8]; // floor(x*6)+1 -> 1,2,3,4,5
    let call = 0;
    const random = () => sequence[call++];
    const result = rollDice([], [false, false, false, false, false], random);
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });

  it('keeps held dice unchanged and rerolls the rest', () => {
    const current: DiceValue[] = [6, 6, 6, 6, 6];
    const held = [true, false, true, false, true];
    const random = () => 0; // floor(0*6)+1 -> 1
    const result = rollDice(current, held, random);
    expect(result).toEqual([6, 1, 6, 1, 6]);
  });

  it('always returns DICE_COUNT dice', () => {
    const result = rollDice(
      [],
      [false, false, false, false, false],
      () => 0.99
    );
    expect(result).toHaveLength(DICE_COUNT);
  });

  it('defaults to Math.random when no random function is passed', () => {
    const result = rollDice([], [false, false, false, false, false]);
    expect(result).toHaveLength(DICE_COUNT);
    for (const value of result) {
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(6);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app
npx vitest run src/engine/dice.test.ts
```

Expected: FAIL — `Cannot find module './dice'` (file doesn't exist yet).

- [ ] **Step 3: Implement `dice.ts`**

Create `app/src/engine/dice.ts`:

```ts
import type { DiceValue } from '../types/game';

export const DICE_COUNT = 5;
export const MAX_ROLLS = 3;

export function createEmptyDice(): DiceValue[] {
  return [];
}

export function rollDice(
  currentDice: DiceValue[],
  held: boolean[],
  random: () => number = Math.random
): DiceValue[] {
  const next: DiceValue[] = [];
  for (let i = 0; i < DICE_COUNT; i++) {
    const shouldKeep = held[i] && currentDice[i] !== undefined;
    next.push(
      shouldKeep
        ? currentDice[i]
        : ((Math.floor(random() * 6) + 1) as DiceValue)
    );
  }
  return next;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/engine/dice.test.ts
```

Expected: PASS — 7 tests passed.

- [ ] **Step 5: Commit**

```bash
cd ..
git add app/src/engine/dice.ts app/src/engine/dice.test.ts
git commit -m "Add pure dice rolling function with injectable randomness"
```

---

### Task 4: Combination detection (fixes the known Pair/Two Pair/Three/Four of a Kind/Full House bug)

**Files:**
- Create: `app/src/engine/scoring/combinations.ts`
- Test: `app/src/engine/scoring/combinations.test.ts`

**Interfaces:**
- Consumes: `DiceValue` from `../../types/game`.
- Produces (all `(dice: DiceValue[]) => number`, each returning the *raw* score before any doubling/bonus is applied):
  - `countsByValue(dice: DiceValue[]): Record<DiceValue, number>`
  - `pairScore`
  - `twoPairScore`
  - `threeOfKindScore`
  - `fourOfKindScore`
  - `fullHouseScore`
  - `smallStraightScore`
  - `largeStraightScore`
  - `yahtzeeScore` (sum of dice only — the `+50` bonus is applied later by `scoreCategory` in Task 7, never here)
  - `chanceScore`

The prototype (`pierwowzor/src/components/sub-components/GameTable.js`) detects Pair/Two Pair/Three of a Kind/Four of a Kind/Full House by reusing one generic "any die with a duplicate anywhere" filter (`diceArray.filter((el) => diceArray.indexOf(el) !== diceArray.lastIndexOf(el))`), which cannot correctly tell these hand shapes apart (e.g. `[2,2,3,3,3]` produces the same filtered set for every one of those categories). This task replaces that with per-category counting logic driven by `countsByValue`.

- [ ] **Step 1: Write the failing tests**

Create `app/src/engine/scoring/combinations.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  countsByValue,
  pairScore,
  twoPairScore,
  threeOfKindScore,
  fourOfKindScore,
  fullHouseScore,
  smallStraightScore,
  largeStraightScore,
  yahtzeeScore,
  chanceScore,
} from './combinations';
import type { DiceValue } from '../../types/game';

describe('countsByValue', () => {
  it('counts occurrences of each face value', () => {
    const dice: DiceValue[] = [2, 2, 3, 5, 5];
    expect(countsByValue(dice)).toEqual({
      1: 0,
      2: 2,
      3: 1,
      4: 0,
      5: 2,
      6: 0,
    });
  });
});

describe('pairScore', () => {
  it('scores the highest pair when only one pair exists', () => {
    expect(pairScore([2, 2, 1, 3, 6])).toBe(4); // 2+2
  });

  it('picks the higher pair when two pairs exist', () => {
    expect(pairScore([2, 2, 3, 3, 4])).toBe(6); // highest pair is 3+3
  });

  it('returns 0 when there is no pair', () => {
    expect(pairScore([1, 2, 3, 4, 5])).toBe(0);
  });
});

describe('twoPairScore', () => {
  it('sums both pairs when two distinct pairs exist', () => {
    expect(twoPairScore([2, 2, 3, 3, 4])).toBe(10); // 2+2+3+3
  });

  it('returns 0 for four of a kind (not two distinct pairs)', () => {
    expect(twoPairScore([3, 3, 3, 3, 5])).toBe(0);
  });

  it('returns 0 when there is only one pair', () => {
    expect(twoPairScore([2, 2, 1, 3, 6])).toBe(0);
  });
});

describe('threeOfKindScore', () => {
  it('scores three matching dice', () => {
    expect(threeOfKindScore([3, 3, 3, 5, 5])).toBe(9);
  });

  it('returns 0 when nothing has three of a kind', () => {
    expect(threeOfKindScore([2, 2, 3, 3, 4])).toBe(0);
  });
});

describe('fourOfKindScore', () => {
  it('scores four matching dice', () => {
    expect(fourOfKindScore([4, 4, 4, 4, 2])).toBe(16);
  });

  it('returns 0 for a full house (three + two, not four)', () => {
    expect(fourOfKindScore([2, 2, 2, 5, 5])).toBe(0);
  });
});

describe('fullHouseScore', () => {
  it('sums all dice for a true full house (3 + 2)', () => {
    expect(fullHouseScore([2, 2, 2, 5, 5])).toBe(16);
  });

  it('returns 0 for four of a kind', () => {
    expect(fullHouseScore([4, 4, 4, 4, 5])).toBe(0);
  });

  it('returns 0 for five of a kind', () => {
    expect(fullHouseScore([6, 6, 6, 6, 6])).toBe(0);
  });

  it('returns 0 when there is no pairing at all', () => {
    expect(fullHouseScore([1, 2, 3, 4, 5])).toBe(0);
  });
});

describe('smallStraightScore', () => {
  it('scores 15 for 1-2-3-4-5 in any order', () => {
    expect(smallStraightScore([3, 1, 4, 5, 2])).toBe(15);
  });

  it('returns 0 when the straight is broken', () => {
    expect(smallStraightScore([1, 2, 2, 4, 5])).toBe(0);
  });
});

describe('largeStraightScore', () => {
  it('scores 20 for 2-3-4-5-6 in any order', () => {
    expect(largeStraightScore([6, 4, 2, 5, 3])).toBe(20);
  });

  it('returns 0 when the straight is broken', () => {
    expect(largeStraightScore([1, 2, 3, 4, 5])).toBe(0);
  });
});

describe('yahtzeeScore', () => {
  it('returns the sum of the dice when all five match', () => {
    expect(yahtzeeScore([5, 5, 5, 5, 5])).toBe(25);
  });

  it('returns 0 when not all dice match (bonus is applied elsewhere, not here)', () => {
    expect(yahtzeeScore([5, 5, 5, 5, 4])).toBe(0);
  });
});

describe('chanceScore', () => {
  it('sums all five dice regardless of combination', () => {
    expect(chanceScore([1, 2, 3, 4, 5])).toBe(15);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app
npx vitest run src/engine/scoring/combinations.test.ts
```

Expected: FAIL — `Cannot find module './combinations'`.

- [ ] **Step 3: Implement `combinations.ts`**

Create `app/src/engine/scoring/combinations.ts`:

```ts
import type { DiceValue } from '../../types/game';

const ALL_FACES: DiceValue[] = [1, 2, 3, 4, 5, 6];

export function countsByValue(dice: DiceValue[]): Record<DiceValue, number> {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 } as Record<
    DiceValue,
    number
  >;
  for (const value of dice) {
    counts[value] += 1;
  }
  return counts;
}

function sum(dice: DiceValue[]): number {
  return dice.reduce((total, value) => total + value, 0);
}

export function pairScore(dice: DiceValue[]): number {
  const counts = countsByValue(dice);
  for (let value = 6; value >= 1; value--) {
    if (counts[value as DiceValue] >= 2) {
      return value * 2;
    }
  }
  return 0;
}

export function twoPairScore(dice: DiceValue[]): number {
  const counts = countsByValue(dice);
  const pairValues = ALL_FACES.filter((value) => counts[value] >= 2).sort(
    (a, b) => b - a
  );
  if (pairValues.length < 2) {
    return 0;
  }
  const [high, low] = pairValues;
  return high * 2 + low * 2;
}

export function threeOfKindScore(dice: DiceValue[]): number {
  const counts = countsByValue(dice);
  for (let value = 6; value >= 1; value--) {
    if (counts[value as DiceValue] >= 3) {
      return value * 3;
    }
  }
  return 0;
}

export function fourOfKindScore(dice: DiceValue[]): number {
  const counts = countsByValue(dice);
  for (let value = 6; value >= 1; value--) {
    if (counts[value as DiceValue] >= 4) {
      return value * 4;
    }
  }
  return 0;
}

export function fullHouseScore(dice: DiceValue[]): number {
  if (dice.length !== 5) {
    return 0;
  }
  const counts = countsByValue(dice);
  const usedCounts = ALL_FACES.map((value) => counts[value])
    .filter((count) => count > 0)
    .sort((a, b) => a - b);
  const isFullHouse =
    usedCounts.length === 2 && usedCounts[0] === 2 && usedCounts[1] === 3;
  return isFullHouse ? sum(dice) : 0;
}

export function smallStraightScore(dice: DiceValue[]): number {
  const unique = new Set(dice);
  const hasSmallStraight = [1, 2, 3, 4, 5].every((value) =>
    unique.has(value as DiceValue)
  );
  return hasSmallStraight ? 15 : 0;
}

export function largeStraightScore(dice: DiceValue[]): number {
  const unique = new Set(dice);
  const hasLargeStraight = [2, 3, 4, 5, 6].every((value) =>
    unique.has(value as DiceValue)
  );
  return hasLargeStraight ? 20 : 0;
}

export function yahtzeeScore(dice: DiceValue[]): number {
  if (dice.length !== 5) {
    return 0;
  }
  const allMatch = dice.every((value) => value === dice[0]);
  return allMatch ? sum(dice) : 0;
}

export function chanceScore(dice: DiceValue[]): number {
  return sum(dice);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/engine/scoring/combinations.test.ts
```

Expected: PASS — 22 tests passed.

- [ ] **Step 5: Commit**

```bash
cd ..
git add app/src/engine/scoring/combinations.ts app/src/engine/scoring/combinations.test.ts
git commit -m "Add combination detection with correct Pair/Two Pair/Three/Four/Full House disambiguation"
```

---

### Task 5: Upper section scoring

**Files:**
- Create: `app/src/engine/scoring/upperSection.ts`
- Test: `app/src/engine/scoring/upperSection.test.ts`

**Interfaces:**
- Consumes: `DiceValue`, `UpperCategory`, `PlayerScoreCard` from `../../types/game`.
- Produces:
  - `UPPER_BONUS_THRESHOLD: number` (= 63)
  - `UPPER_BONUS_VALUE: number` (= 50)
  - `upperCategoryScore(category: UpperCategory, dice: DiceValue[]): number`
  - `calculateUpperSum(scoreCard: PlayerScoreCard): number` (nulls count as 0)
  - `calculateBonus(scoreCard: PlayerScoreCard): number` (0 or `UPPER_BONUS_VALUE`)

- [ ] **Step 1: Write the failing tests**

Create `app/src/engine/scoring/upperSection.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  upperCategoryScore,
  calculateUpperSum,
  calculateBonus,
  UPPER_BONUS_THRESHOLD,
  UPPER_BONUS_VALUE,
} from './upperSection';
import type { DiceValue, PlayerScoreCard } from '../../types/game';

describe('upperCategoryScore', () => {
  it('sums only the dice matching the category face value', () => {
    const dice: DiceValue[] = [3, 3, 1, 5, 3];
    expect(upperCategoryScore('threes', dice)).toBe(9);
  });

  it('returns 0 when no dice match', () => {
    const dice: DiceValue[] = [1, 2, 3, 4, 5];
    expect(upperCategoryScore('sixes', dice)).toBe(0);
  });

  it('handles aces (value 1)', () => {
    const dice: DiceValue[] = [1, 1, 1, 2, 3];
    expect(upperCategoryScore('aces', dice)).toBe(3);
  });
});

function emptyScoreCard(): PlayerScoreCard {
  return {
    upper: {
      aces: null,
      twos: null,
      threes: null,
      fours: null,
      fives: null,
      sixes: null,
    },
    lower: {
      pair: null,
      twoPair: null,
      threeOfKind: null,
      fourOfKind: null,
      smallStraight: null,
      largeStraight: null,
      fullHouse: null,
      chance: null,
      yahtzee: null,
    },
  };
}

describe('calculateUpperSum', () => {
  it('treats unfilled (null) categories as 0', () => {
    const card = emptyScoreCard();
    card.upper.aces = 3;
    card.upper.twos = 4;
    expect(calculateUpperSum(card)).toBe(7);
  });

  it('returns 0 for a fully empty upper section', () => {
    expect(calculateUpperSum(emptyScoreCard())).toBe(0);
  });
});

describe('calculateBonus', () => {
  it(`returns ${UPPER_BONUS_VALUE} when the upper sum is exactly the threshold`, () => {
    const card = emptyScoreCard();
    card.upper.sixes = UPPER_BONUS_THRESHOLD;
    expect(calculateBonus(card)).toBe(UPPER_BONUS_VALUE);
  });

  it('returns 0 when the upper sum is one below the threshold', () => {
    const card = emptyScoreCard();
    card.upper.sixes = UPPER_BONUS_THRESHOLD - 1;
    expect(calculateBonus(card)).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app
npx vitest run src/engine/scoring/upperSection.test.ts
```

Expected: FAIL — `Cannot find module './upperSection'`.

- [ ] **Step 3: Implement `upperSection.ts`**

Create `app/src/engine/scoring/upperSection.ts`:

```ts
import type { DiceValue, UpperCategory, PlayerScoreCard } from '../../types/game';
import { UPPER_CATEGORIES } from '../../types/game';

export const UPPER_BONUS_THRESHOLD = 63;
export const UPPER_BONUS_VALUE = 50;

const FACE_VALUE_BY_CATEGORY: Record<UpperCategory, DiceValue> = {
  aces: 1,
  twos: 2,
  threes: 3,
  fours: 4,
  fives: 5,
  sixes: 6,
};

export function upperCategoryScore(
  category: UpperCategory,
  dice: DiceValue[]
): number {
  const faceValue = FACE_VALUE_BY_CATEGORY[category];
  return dice.filter((value) => value === faceValue).length * faceValue;
}

export function calculateUpperSum(scoreCard: PlayerScoreCard): number {
  return UPPER_CATEGORIES.reduce(
    (total, category) => total + (scoreCard.upper[category] ?? 0),
    0
  );
}

export function calculateBonus(scoreCard: PlayerScoreCard): number {
  return calculateUpperSum(scoreCard) >= UPPER_BONUS_THRESHOLD
    ? UPPER_BONUS_VALUE
    : 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/engine/scoring/upperSection.test.ts
```

Expected: PASS — 7 tests passed.

- [ ] **Step 5: Commit**

```bash
cd ..
git add app/src/engine/scoring/upperSection.ts app/src/engine/scoring/upperSection.test.ts
git commit -m "Add upper section scoring, sum, and bonus calculation"
```

---

### Task 6: Score card structure (create / query / total)

**Files:**
- Create: `app/src/engine/scoreCard.ts`
- Test: `app/src/engine/scoreCard.test.ts`

**Interfaces:**
- Consumes:
  - `PlayerScoreCard`, `ScoreCategory`, `UpperCategory`, `LowerCategory`, `UPPER_CATEGORIES`, `LOWER_CATEGORIES` from `../types/game`
  - `calculateUpperSum`, `calculateBonus` from `./scoring/upperSection`
- Produces:
  - `createEmptyScoreCard(): PlayerScoreCard` (every category `null`)
  - `isUpperCategory(category: ScoreCategory): category is UpperCategory`
  - `isUpperSectionFilled(scoreCard: PlayerScoreCard): boolean`
  - `canScoreCategory(scoreCard: PlayerScoreCard, category: ScoreCategory): boolean`
  - `calculateTotal(scoreCard: PlayerScoreCard): number` (upper sum + bonus + lower sum, nulls as 0)

- [ ] **Step 1: Write the failing tests**

Create `app/src/engine/scoreCard.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  createEmptyScoreCard,
  isUpperCategory,
  isUpperSectionFilled,
  canScoreCategory,
  calculateTotal,
} from './scoreCard';

describe('createEmptyScoreCard', () => {
  it('creates a score card with every category set to null', () => {
    const card = createEmptyScoreCard();
    expect(card.upper.aces).toBeNull();
    expect(card.upper.sixes).toBeNull();
    expect(card.lower.pair).toBeNull();
    expect(card.lower.yahtzee).toBeNull();
  });
});

describe('isUpperCategory', () => {
  it('returns true for upper categories', () => {
    expect(isUpperCategory('aces')).toBe(true);
  });

  it('returns false for lower categories', () => {
    expect(isUpperCategory('pair')).toBe(false);
  });
});

describe('isUpperSectionFilled', () => {
  it('returns false when any upper category is still null', () => {
    const card = createEmptyScoreCard();
    card.upper.aces = 3;
    expect(isUpperSectionFilled(card)).toBe(false);
  });

  it('returns true when all 6 upper categories are filled', () => {
    const card = createEmptyScoreCard();
    card.upper = {
      aces: 1,
      twos: 2,
      threes: 3,
      fours: 4,
      fives: 5,
      sixes: 6,
    };
    expect(isUpperSectionFilled(card)).toBe(true);
  });
});

describe('canScoreCategory', () => {
  it('allows an unfilled upper category at any time', () => {
    const card = createEmptyScoreCard();
    expect(canScoreCategory(card, 'aces')).toBe(true);
  });

  it('disallows an already-filled upper category', () => {
    const card = createEmptyScoreCard();
    card.upper.aces = 3;
    expect(canScoreCategory(card, 'aces')).toBe(false);
  });

  it('disallows a lower category before the upper section is filled', () => {
    const card = createEmptyScoreCard();
    expect(canScoreCategory(card, 'pair')).toBe(false);
  });

  it('allows an unfilled lower category once the upper section is filled', () => {
    const card = createEmptyScoreCard();
    card.upper = {
      aces: 1,
      twos: 2,
      threes: 3,
      fours: 4,
      fives: 5,
      sixes: 6,
    };
    expect(canScoreCategory(card, 'pair')).toBe(true);
  });

  it('disallows an already-filled lower category', () => {
    const card = createEmptyScoreCard();
    card.upper = {
      aces: 1,
      twos: 2,
      threes: 3,
      fours: 4,
      fives: 5,
      sixes: 6,
    };
    card.lower.pair = 8;
    expect(canScoreCategory(card, 'pair')).toBe(false);
  });
});

describe('calculateTotal', () => {
  it('sums upper (with bonus) and lower sections, treating null as 0', () => {
    const card = createEmptyScoreCard();
    card.upper = {
      aces: 3,
      twos: 6,
      threes: 9,
      fours: 12,
      fives: 15,
      sixes: 18,
    }; // sum = 63 -> bonus 50
    card.lower.chance = 20;
    expect(calculateTotal(card)).toBe(63 + 50 + 20);
  });

  it('returns 0 for a fully empty score card', () => {
    expect(calculateTotal(createEmptyScoreCard())).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app
npx vitest run src/engine/scoreCard.test.ts
```

Expected: FAIL — `Cannot find module './scoreCard'`.

- [ ] **Step 3: Implement `scoreCard.ts`**

Create `app/src/engine/scoreCard.ts`:

```ts
import type {
  PlayerScoreCard,
  ScoreCategory,
  UpperCategory,
  LowerCategory,
} from '../types/game';
import { UPPER_CATEGORIES, LOWER_CATEGORIES } from '../types/game';
import { calculateUpperSum, calculateBonus } from './scoring/upperSection';

export function createEmptyScoreCard(): PlayerScoreCard {
  const upper = {} as Record<UpperCategory, number | null>;
  for (const category of UPPER_CATEGORIES) {
    upper[category] = null;
  }
  const lower = {} as Record<LowerCategory, number | null>;
  for (const category of LOWER_CATEGORIES) {
    lower[category] = null;
  }
  return { upper, lower };
}

export function isUpperCategory(
  category: ScoreCategory
): category is UpperCategory {
  return (UPPER_CATEGORIES as string[]).includes(category);
}

export function isUpperSectionFilled(scoreCard: PlayerScoreCard): boolean {
  return UPPER_CATEGORIES.every(
    (category) => scoreCard.upper[category] !== null
  );
}

export function canScoreCategory(
  scoreCard: PlayerScoreCard,
  category: ScoreCategory
): boolean {
  if (isUpperCategory(category)) {
    return scoreCard.upper[category] === null;
  }
  return (
    scoreCard.lower[category] === null && isUpperSectionFilled(scoreCard)
  );
}

export function calculateTotal(scoreCard: PlayerScoreCard): number {
  const upperSum = calculateUpperSum(scoreCard);
  const bonus = calculateBonus(scoreCard);
  const lowerSum = LOWER_CATEGORIES.reduce(
    (total, category) => total + (scoreCard.lower[category] ?? 0),
    0
  );
  return upperSum + bonus + lowerSum;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/engine/scoreCard.test.ts
```

Expected: PASS — 12 tests passed.

- [ ] **Step 5: Commit**

```bash
cd ..
git add app/src/engine/scoreCard.ts app/src/engine/scoreCard.test.ts
git commit -m "Add score card creation, category eligibility, and total calculation"
```

---

### Task 7: `scoreCategory` — the scoring orchestrator (upper + lower + doubling rule)

**Files:**
- Modify: `app/src/engine/scoreCard.ts`
- Modify: `app/src/engine/scoreCard.test.ts`

**Interfaces:**
- Consumes:
  - `canScoreCategory`, `isUpperCategory` (this file, Task 6)
  - `upperCategoryScore` from `./scoring/upperSection` (Task 5)
  - `pairScore, twoPairScore, threeOfKindScore, fourOfKindScore, smallStraightScore, largeStraightScore, fullHouseScore, chanceScore, yahtzeeScore` from `./scoring/combinations` (Task 4)
  - `DiceValue, PlayerScoreCard, ScoreCategory, LowerCategory` from `../types/game`
- Produces:
  - `DOUBLE_SCORE_ROLLS_LEFT: number` (= 2)
  - `YAHTZEE_BONUS: number` (= 50)
  - `scoreCategory(scoreCard: PlayerScoreCard, category: ScoreCategory, dice: DiceValue[], rollsLeft: number): PlayerScoreCard` — throws if `!canScoreCategory(...)`; otherwise returns a **new** score card with the category filled in (immutable, does not mutate the input)

- [ ] **Step 1: Write the failing tests**

Append to `app/src/engine/scoreCard.test.ts` (add this import to the existing import line and add the new `describe` block at the end of the file):

```ts
// Add `scoreCategory`, `DOUBLE_SCORE_ROLLS_LEFT`, and `YAHTZEE_BONUS` to the
// existing `import { ... } from './scoreCard';` line at the top of the file:
//   import {
//     createEmptyScoreCard,
//     isUpperCategory,
//     isUpperSectionFilled,
//     canScoreCategory,
//     calculateTotal,
//     scoreCategory,
//     DOUBLE_SCORE_ROLLS_LEFT,
//     YAHTZEE_BONUS,
//   } from './scoreCard';
// Then append this block:

describe('scoreCategory', () => {
  function filledUpperCard() {
    const card = createEmptyScoreCard();
    card.upper = {
      aces: 1,
      twos: 2,
      threes: 3,
      fours: 4,
      fives: 5,
      sixes: 6,
    };
    return card;
  }

  it('scores an upper category using the dice face value sum', () => {
    const card = createEmptyScoreCard();
    const result = scoreCategory(card, 'threes', [3, 3, 1, 2, 5], 3);
    expect(result.upper.threes).toBe(6);
  });

  it('does not mutate the input score card', () => {
    const card = createEmptyScoreCard();
    scoreCategory(card, 'threes', [3, 3, 1, 2, 5], 3);
    expect(card.upper.threes).toBeNull();
  });

  it('throws when the category cannot be scored', () => {
    const card = createEmptyScoreCard();
    card.upper.aces = 1;
    expect(() => scoreCategory(card, 'aces', [1, 1, 1, 1, 1], 3)).toThrow();
  });

  it('throws when scoring a lower category before the upper section is filled', () => {
    const card = createEmptyScoreCard();
    expect(() =>
      scoreCategory(card, 'chance', [1, 2, 3, 4, 5], 3)
    ).toThrow();
  });

  it(`doubles a lower category score when rollsLeft is ${DOUBLE_SCORE_ROLLS_LEFT}`, () => {
    const card = filledUpperCard();
    const result = scoreCategory(
      card,
      'chance',
      [1, 2, 3, 4, 5],
      DOUBLE_SCORE_ROLLS_LEFT
    );
    expect(result.lower.chance).toBe(30); // (1+2+3+4+5) * 2
  });

  it('does not double a lower category score when rollsLeft is not 2', () => {
    const card = filledUpperCard();
    const result = scoreCategory(card, 'chance', [1, 2, 3, 4, 5], 1);
    expect(result.lower.chance).toBe(15);
  });

  it(`applies the yahtzee +${YAHTZEE_BONUS} bonus without doubling it`, () => {
    const card = filledUpperCard();
    const result = scoreCategory(
      card,
      'yahtzee',
      [4, 4, 4, 4, 4],
      DOUBLE_SCORE_ROLLS_LEFT
    );
    expect(result.lower.yahtzee).toBe(4 * 5 * 2 + YAHTZEE_BONUS); // 40 + 50 = 90
  });

  it('scores yahtzee as 0 with no bonus when the dice do not match', () => {
    const card = filledUpperCard();
    const result = scoreCategory(
      card,
      'yahtzee',
      [4, 4, 4, 4, 5],
      DOUBLE_SCORE_ROLLS_LEFT
    );
    expect(result.lower.yahtzee).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app
npx vitest run src/engine/scoreCard.test.ts
```

Expected: FAIL — `scoreCategory is not defined` / `does not provide an export named 'scoreCategory'`.

- [ ] **Step 3: Implement `scoreCategory` in `scoreCard.ts`**

Add these imports to the top of `app/src/engine/scoreCard.ts` (alongside the existing ones) and append the new code at the end of the file:

```ts
import type { DiceValue } from '../types/game';
import { upperCategoryScore } from './scoring/upperSection';
import {
  pairScore,
  twoPairScore,
  threeOfKindScore,
  fourOfKindScore,
  smallStraightScore,
  largeStraightScore,
  fullHouseScore,
  chanceScore,
  yahtzeeScore,
} from './scoring/combinations';

export const DOUBLE_SCORE_ROLLS_LEFT = 2;
export const YAHTZEE_BONUS = 50;

const LOWER_SCORERS: Record<LowerCategory, (dice: DiceValue[]) => number> = {
  pair: pairScore,
  twoPair: twoPairScore,
  threeOfKind: threeOfKindScore,
  fourOfKind: fourOfKindScore,
  smallStraight: smallStraightScore,
  largeStraight: largeStraightScore,
  fullHouse: fullHouseScore,
  chance: chanceScore,
  yahtzee: yahtzeeScore,
};

export function scoreCategory(
  scoreCard: PlayerScoreCard,
  category: ScoreCategory,
  dice: DiceValue[],
  rollsLeft: number
): PlayerScoreCard {
  if (!canScoreCategory(scoreCard, category)) {
    throw new Error(`Category "${category}" cannot be scored right now`);
  }

  if (isUpperCategory(category)) {
    const value = upperCategoryScore(category, dice);
    return { ...scoreCard, upper: { ...scoreCard.upper, [category]: value } };
  }

  const raw = LOWER_SCORERS[category](dice);
  const doubled = rollsLeft === DOUBLE_SCORE_ROLLS_LEFT;
  let value = doubled ? raw * 2 : raw;
  if (category === 'yahtzee' && raw > 0) {
    value += YAHTZEE_BONUS;
  }
  return { ...scoreCard, lower: { ...scoreCard.lower, [category]: value } };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/engine/scoreCard.test.ts
```

Expected: PASS — 20 tests passed.

- [ ] **Step 5: Commit**

```bash
cd ..
git add app/src/engine/scoreCard.ts app/src/engine/scoreCard.test.ts
git commit -m "Add scoreCategory orchestrator with first-roll doubling and yahtzee bonus"
```

---

### Task 8: Game state — players (2–6) and turn management

**Files:**
- Create: `app/src/engine/gameState.ts`
- Test: `app/src/engine/gameState.test.ts`

**Interfaces:**
- Consumes:
  - `Player, GameState` from `../types/game`
  - `createEmptyScoreCard` from `./scoreCard` (Task 6)
  - `createEmptyDice, MAX_ROLLS` from `./dice` (Task 3)
- Produces:
  - `MIN_PLAYERS: number` (= 2), `MAX_PLAYERS: number` (= 6)
  - `createPlayer(id: string, name: string): Player`
  - `createGameState(playerNames: string[]): GameState` — throws if `playerNames.length` is outside `[MIN_PLAYERS, MAX_PLAYERS]`; assigns deterministic ids `player-1`, `player-2`, ...
  - `nextTurn(state: GameState): GameState` — advances `currentPlayerIndex` (wrapping), resets `dice` to `[]`, `heldDice` to all-`false`, `rollsLeft` to `MAX_ROLLS`

- [ ] **Step 1: Write the failing tests**

Create `app/src/engine/gameState.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  createPlayer,
  createGameState,
  nextTurn,
  MIN_PLAYERS,
  MAX_PLAYERS,
} from './gameState';
import { MAX_ROLLS } from './dice';

describe('createPlayer', () => {
  it('creates a player with the given id and name', () => {
    expect(createPlayer('player-1', 'Ola')).toEqual({
      id: 'player-1',
      name: 'Ola',
    });
  });
});

describe('createGameState', () => {
  it('creates a player array (not separate variables) from the given names', () => {
    const state = createGameState(['Ola', 'Kuba', 'Zosia']);
    expect(state.players).toEqual([
      { id: 'player-1', name: 'Ola' },
      { id: 'player-2', name: 'Kuba' },
      { id: 'player-3', name: 'Zosia' },
    ]);
  });

  it('creates an empty score card for every player', () => {
    const state = createGameState(['Ola', 'Kuba']);
    expect(Object.keys(state.scoreCards)).toEqual(['player-1', 'player-2']);
    expect(state.scoreCards['player-1'].upper.aces).toBeNull();
  });

  it('starts with no dice rolled, nothing held, full rolls, and player 0 first', () => {
    const state = createGameState(['Ola', 'Kuba']);
    expect(state.dice).toEqual([]);
    expect(state.heldDice).toEqual([false, false, false, false, false]);
    expect(state.rollsLeft).toBe(MAX_ROLLS);
    expect(state.currentPlayerIndex).toBe(0);
  });

  it(`throws with fewer than ${MIN_PLAYERS} players`, () => {
    expect(() => createGameState(['Ola'])).toThrow();
  });

  it(`throws with more than ${MAX_PLAYERS} players`, () => {
    expect(() =>
      createGameState(['A', 'B', 'C', 'D', 'E', 'F', 'G'])
    ).toThrow();
  });

  it(`allows exactly ${MAX_PLAYERS} players`, () => {
    const state = createGameState(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(state.players).toHaveLength(6);
  });
});

describe('nextTurn', () => {
  it('advances to the next player', () => {
    const state = createGameState(['Ola', 'Kuba', 'Zosia']);
    const next = nextTurn(state);
    expect(next.currentPlayerIndex).toBe(1);
  });

  it('wraps around from the last player back to the first', () => {
    let state = createGameState(['Ola', 'Kuba']);
    state = nextTurn(state); // player 1
    state = nextTurn(state); // wraps to player 0
    expect(state.currentPlayerIndex).toBe(0);
  });

  it('resets dice, held dice, and rolls left', () => {
    const state = createGameState(['Ola', 'Kuba']);
    const midTurn = {
      ...state,
      dice: [1, 2, 3, 4, 5] as GameState['dice'],
      heldDice: [true, true, false, false, false],
      rollsLeft: 1,
    };
    const next = nextTurn(midTurn);
    expect(next.dice).toEqual([]);
    expect(next.heldDice).toEqual([false, false, false, false, false]);
    expect(next.rollsLeft).toBe(MAX_ROLLS);
  });
});
```

Note: this test file imports the `GameState` type for the cast in the last test — add `import type { GameState } from '../types/game';` to the top of the file alongside the other imports.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app
npx vitest run src/engine/gameState.test.ts
```

Expected: FAIL — `Cannot find module './gameState'`.

- [ ] **Step 3: Implement `gameState.ts`**

Create `app/src/engine/gameState.ts`:

```ts
import type { GameState, Player } from '../types/game';
import { createEmptyScoreCard } from './scoreCard';
import { createEmptyDice, MAX_ROLLS } from './dice';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

export function createPlayer(id: string, name: string): Player {
  return { id, name };
}

export function createGameState(playerNames: string[]): GameState {
  if (playerNames.length < MIN_PLAYERS || playerNames.length > MAX_PLAYERS) {
    throw new Error(
      `Player count must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}, got ${playerNames.length}`
    );
  }

  const players = playerNames.map((name, index) =>
    createPlayer(`player-${index + 1}`, name)
  );

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

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/engine/gameState.test.ts
```

Expected: PASS — 10 tests passed.

- [ ] **Step 5: Run the full test suite and lint**

```bash
npm run test
npm run lint
npx tsc --noEmit
```

Expected: all test files pass (`dice.test.ts`, `scoring/combinations.test.ts`, `scoring/upperSection.test.ts`, `scoreCard.test.ts`, `gameState.test.ts` — 66 tests total), lint clean, no type errors.

- [ ] **Step 6: Commit**

```bash
cd ..
git add app/src/engine/gameState.ts app/src/engine/gameState.test.ts
git commit -m "Add game state creation for 2-6 players and turn advancement"
```

---

## Definition of done for Etap 1

- `npm run test` (inside `app/`) passes with every category's scoring logic covered, including the disambiguation cases that were broken in `pierwowzor/` (Pair vs Two Pair vs Three/Four of a Kind vs Full House).
- `npm run build`, `npm run lint`, and `npx tsc --noEmit` all succeed.
- No React UI exists yet beyond the untouched Vite template — Etap 2 will consume `app/src/engine/*` to build the hot-seat board.
