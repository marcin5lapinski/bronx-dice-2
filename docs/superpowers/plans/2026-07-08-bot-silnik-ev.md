# Silnik EV dla bota Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the local bot's LLM-based decision path (`bot-server` proxy to `claude -p`) with a pure, deterministic TypeScript engine in `packages/game-engine` that computes the exact expected value (EV) of every hold/reroll/score choice within the current turn, so the bot plays optimally within a turn with no network dependency.

**Architecture:** A new `packages/game-engine/src/bot/` module exports `chooseBotRollDecision` (called when `rollsLeft > 0`) and `chooseBotScoreDecision` (called when `rollsLeft === 0`). Internally, a memoized recursion (`valueAtRollsLeft`) computes, for every dice multiset and every `rollsLeft`, the best achievable value — where "value" is defined as the delta in `calculateTotal(scoreCard)` (so the +50 upper-section bonus at ≥63 is automatically included, not just the raw category score). `app/src/bot/useBotTurn.ts` is rewired to call this engine directly instead of `requestBotMove`/`parseRollDecision`/`chooseHeuristicCategory`. `bot-server/` and the rest of the old LLM path (`botClient.ts`, `promptBuilder.ts`, `houseRules.ts`, `decision.ts`, `heuristic.ts` + their tests) are left in the repo untouched but unreferenced.

**Tech Stack:** TypeScript (existing `packages/game-engine` workspace package), Vitest.

## Global Constraints

- Scope is **local (hotseat) play only** — this plan does not touch `functions/` or online play; the engine lands in `packages/game-engine` specifically so a future online-bot etap can import it without restructuring.
- `bot-server/` and the old LLM path in `app/src/bot/` (`botClient.ts`, `promptBuilder.ts`, `houseRules.ts`, `decision.ts`, `heuristic.ts`, and their `*.test.ts` files) are **not deleted** — they stay in the repo, unimported, in case the LLM approach is revisited later.
- `DICE_COUNT = 5` (from `packages/game-engine/src/dice.ts`) — the reroll-outcome table and the 32 hold masks are sized to this constant.
- `DOUBLE_SCORE_ROLLS_LEFT = 2` (from `packages/game-engine/src/scoreCard.ts`) — a lower-section category scored while `rollsLeft === 2` is doubled; this is already handled inside `scoreCategory`, so the new engine gets it for free by always going through `scoreCategory` rather than the raw per-category scorer functions.
- The upper-section bonus (+50 at upperSum ≥ 63, `UPPER_BONUS_THRESHOLD`/`UPPER_BONUS_VALUE` in `packages/game-engine/src/scoring/upperSection.ts`) must be reflected in every value comparison — this is why "value" is defined as `calculateTotal(after) - calculateTotal(before)`, not the raw per-category score.
- Ties between "reroll" and "score now" are resolved in favor of "score now" (the bot never rerolls unless some option is *strictly* better).
- After any change to `packages/game-engine/src/`, `npm run build:engine` (from the repo root) must be run before `app/`'s tests or build will see the new exports — `@bronx-dice/game-engine` resolves through the workspace symlink to `packages/game-engine/dist`, not to `src` directly (confirmed via `app/package.json`'s `"@bronx-dice/game-engine": "*"` dependency and the package's `main`/`module` fields pointing at `dist/`).

**Deliberate deviation from the design spec:** the spec (`docs/superpowers/specs/2026-07-07-bot-silnik-ev-design.md`) lists `chooseBotRollDecision(scoreCard, dice, heldDice, rollsLeft)` with a `heldDice` parameter. This plan drops `heldDice` — the bot picks a fresh optimal hold mask from the 32 possibilities on every physical `dice` array it's given, regardless of what was held before (nothing in the game engine forces previously-held dice to stay held), so `heldDice` would be unused. `packages/game-engine/tsconfig.json` has `"noUnusedParameters": true`, so keeping it would fail the build unless artificially referenced. If you disagree with this call, flag it before starting Task 2 rather than silently reintroducing an unused parameter.

---

## Task 1: Reroll outcome probability table

**Files:**
- Create: `packages/game-engine/src/bot/rerollOutcomes.ts`
- Test: `packages/game-engine/src/bot/rerollOutcomes.test.ts`

**Interfaces:**
- Produces: `interface RerollOutcome { values: DiceValue[]; probability: number }` and `REROLL_OUTCOMES_BY_K: RerollOutcome[][]` (index `k` = number of dice being rerolled, `0..5`; each entry is every unique sorted-ascending multiset of length `k` over faces 1-6, with its probability of occurring). Task 2 imports `REROLL_OUTCOMES_BY_K` and `RerollOutcome` from this file.

- [ ] **Step 1: Write the failing test**

Create `packages/game-engine/src/bot/rerollOutcomes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { REROLL_OUTCOMES_BY_K } from './rerollOutcomes';

const EXPECTED_UNIQUE_COUNTS = [1, 6, 21, 56, 126, 252];

describe('REROLL_OUTCOMES_BY_K', () => {
  it('has one entry per k = 0..5', () => {
    expect(REROLL_OUTCOMES_BY_K).toHaveLength(6);
  });

  EXPECTED_UNIQUE_COUNTS.forEach((expectedCount, k) => {
    it(`k=${k}: has C(${k}+5,5)=${expectedCount} unique multisets`, () => {
      expect(REROLL_OUTCOMES_BY_K[k]).toHaveLength(expectedCount);
    });

    it(`k=${k}: probabilities sum to 1`, () => {
      const total = REROLL_OUTCOMES_BY_K[k].reduce(
        (sum, outcome) => sum + outcome.probability,
        0
      );
      expect(total).toBeCloseTo(1, 10);
    });

    it(`k=${k}: every outcome has exactly k sorted-ascending values`, () => {
      for (const outcome of REROLL_OUTCOMES_BY_K[k]) {
        expect(outcome.values).toHaveLength(k);
        const sorted = [...outcome.values].sort((a, b) => a - b);
        expect(outcome.values).toEqual(sorted);
      }
    });
  });

  it('k=1: each face has probability 1/6', () => {
    for (const outcome of REROLL_OUTCOMES_BY_K[1]) {
      expect(outcome.probability).toBeCloseTo(1 / 6, 10);
    }
  });

  it('k=5: an all-sixes outcome has probability 1/6^5', () => {
    const allSixes = REROLL_OUTCOMES_BY_K[5].find((outcome) =>
      outcome.values.every((value) => value === 6)
    );
    expect(allSixes?.probability).toBeCloseTo(1 / 6 ** 5, 10);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `packages/game-engine/`): `npx vitest run src/bot/rerollOutcomes.test.ts`
Expected: FAIL — `Cannot find module './rerollOutcomes'`.

- [ ] **Step 3: Implement `rerollOutcomes.ts`**

Create `packages/game-engine/src/bot/rerollOutcomes.ts`:

```ts
import type { DiceValue } from '../types/game';
import { DICE_COUNT } from '../dice';

export interface RerollOutcome {
  values: DiceValue[];
  probability: number;
}

function factorial(n: number): number {
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}

function generateMultisets(k: number): DiceValue[][] {
  const results: DiceValue[][] = [];
  const current: DiceValue[] = [];

  function recurse(start: DiceValue) {
    if (current.length === k) {
      results.push([...current]);
      return;
    }
    for (let face = start; face <= 6; face++) {
      current.push(face as DiceValue);
      recurse(face as DiceValue);
      current.pop();
    }
  }

  recurse(1);
  return results;
}

function probabilityOf(values: DiceValue[]): number {
  const counts = new Map<DiceValue, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let denominator = 1;
  for (const count of counts.values()) {
    denominator *= factorial(count);
  }
  const orderings = factorial(values.length) / denominator;
  return orderings / 6 ** values.length;
}

function computeOutcomes(k: number): RerollOutcome[] {
  return generateMultisets(k).map((values) => ({
    values,
    probability: probabilityOf(values),
  }));
}

export const REROLL_OUTCOMES_BY_K: RerollOutcome[][] = Array.from(
  { length: DICE_COUNT + 1 },
  (_, k) => computeOutcomes(k)
);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/bot/rerollOutcomes.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/src/bot/rerollOutcomes.ts packages/game-engine/src/bot/rerollOutcomes.test.ts
git commit -m "Add precomputed reroll-outcome probability table for the bot EV engine"
```

---

## Task 2: EV strategy engine (`chooseBotRollDecision` / `chooseBotScoreDecision`)

**Files:**
- Create: `packages/game-engine/src/bot/types.ts`
- Create: `packages/game-engine/src/bot/strategy.ts`
- Test: `packages/game-engine/src/bot/strategy.test.ts`
- Modify: `packages/game-engine/src/index.ts`

**Interfaces:**
- Consumes: `REROLL_OUTCOMES_BY_K`, `RerollOutcome` from `./rerollOutcomes` (Task 1); `canScoreCategory`, `scoreCategory`, `calculateTotal` from `../scoreCard`; `UPPER_CATEGORIES`, `LOWER_CATEGORIES`, `ScoreCategory`, `DiceValue`, `PlayerScoreCard` from `../types/game`.
- Produces: `type BotRollDecision = { action: 'reroll'; hold: boolean[] } | { action: 'score'; category: ScoreCategory }` from `./types`; `chooseBotRollDecision(scoreCard: PlayerScoreCard, dice: DiceValue[], rollsLeft: number): BotRollDecision` and `chooseBotScoreDecision(scoreCard: PlayerScoreCard, dice: DiceValue[], rollsLeft: number): ScoreCategory` from `./strategy`, both re-exported from the package's `index.ts`. Task 3 imports both plus `BotRollDecision` from `@bronx-dice/game-engine`.

- [ ] **Step 1: Create the decision type**

Create `packages/game-engine/src/bot/types.ts`:

```ts
import type { ScoreCategory } from '../types/game';

export type BotRollDecision =
  | { action: 'reroll'; hold: boolean[] }
  | { action: 'score'; category: ScoreCategory };
```

- [ ] **Step 2: Write the failing tests**

Create `packages/game-engine/src/bot/strategy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  UPPER_CATEGORIES,
  LOWER_CATEGORIES,
  type DiceValue,
  type PlayerScoreCard,
} from '../types/game';
import { chooseBotRollDecision, chooseBotScoreDecision } from './strategy';

function emptyLowerFilledUpper(upperValue: number): PlayerScoreCard {
  return {
    upper: Object.fromEntries(
      UPPER_CATEGORIES.map((category) => [category, upperValue])
    ) as PlayerScoreCard['upper'],
    lower: Object.fromEntries(
      LOWER_CATEGORIES.map((category) => [category, null])
    ) as PlayerScoreCard['lower'],
  };
}

describe('chooseBotRollDecision', () => {
  it('holds four matching dice and rerolls the fifth when that beats stopping now', () => {
    const scoreCard = emptyLowerFilledUpper(0);
    const dice: DiceValue[] = [6, 6, 6, 6, 1];

    const decision = chooseBotRollDecision(scoreCard, dice, 1);

    expect(decision).toEqual({
      action: 'reroll',
      hold: [true, true, true, true, false],
    });
  });

  it('favors scoring now over rerolling when doubling (rollsLeft === 2) makes it pay off', () => {
    const scoreCard = emptyLowerFilledUpper(0);
    const dice: DiceValue[] = [5, 5, 5, 5, 5];

    const decision = chooseBotRollDecision(scoreCard, dice, 2);

    expect(decision).toEqual({ action: 'score', category: 'yahtzee' });
  });
});

describe('chooseBotScoreDecision', () => {
  it('returns the legal category with the highest turn value when forced to score', () => {
    const scoreCard = emptyLowerFilledUpper(0);
    const dice: DiceValue[] = [3, 3, 3, 3, 3];

    expect(chooseBotScoreDecision(scoreCard, dice, 0)).toBe('yahtzee');
  });

  it('reflects the upper-section +50 bonus when picking between two open upper categories', () => {
    const scoreCard: PlayerScoreCard = {
      upper: { aces: 5, twos: 10, threes: 15, fours: 20, fives: null, sixes: null },
      lower: Object.fromEntries(
        LOWER_CATEGORIES.map((category) => [category, null])
      ) as PlayerScoreCard['lower'],
    };
    // Filled upper sum is 50. 'sixes' (raw 18) pushes the sum to 68, crossing
    // the 63 bonus threshold; 'fives' (raw 5) does not (55 < 63).
    const dice: DiceValue[] = [6, 6, 6, 5, 2];

    expect(chooseBotScoreDecision(scoreCard, dice, 0)).toBe('sixes');
  });

  it('throws when no legal category is available', () => {
    const fullCard: PlayerScoreCard = {
      upper: Object.fromEntries(
        UPPER_CATEGORIES.map((category) => [category, 0])
      ) as PlayerScoreCard['upper'],
      lower: Object.fromEntries(
        LOWER_CATEGORIES.map((category) => [category, 0])
      ) as PlayerScoreCard['lower'],
    };

    expect(() => chooseBotScoreDecision(fullCard, [1, 2, 3, 4, 5], 0)).toThrow();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run (from `packages/game-engine/`): `npx vitest run src/bot/strategy.test.ts`
Expected: FAIL — `Cannot find module './strategy'`.

- [ ] **Step 4: Implement `strategy.ts`**

Create `packages/game-engine/src/bot/strategy.ts`:

```ts
import type { DiceValue, PlayerScoreCard, ScoreCategory } from '../types/game';
import { UPPER_CATEGORIES, LOWER_CATEGORIES } from '../types/game';
import { canScoreCategory, scoreCategory, calculateTotal } from '../scoreCard';
import { REROLL_OUTCOMES_BY_K } from './rerollOutcomes';
import type { BotRollDecision } from './types';

const ALL_CATEGORIES: ScoreCategory[] = [...UPPER_CATEGORIES, ...LOWER_CATEGORIES];

function turnValue(
  scoreCard: PlayerScoreCard,
  category: ScoreCategory,
  dice: DiceValue[],
  rollsLeft: number
): number {
  const updated = scoreCategory(scoreCard, category, dice, rollsLeft);
  return calculateTotal(updated) - calculateTotal(scoreCard);
}

function legalCategories(scoreCard: PlayerScoreCard): ScoreCategory[] {
  return ALL_CATEGORIES.filter((category) => canScoreCategory(scoreCard, category));
}

function bestStopChoice(
  scoreCard: PlayerScoreCard,
  dice: DiceValue[],
  rollsLeft: number
): { category: ScoreCategory; value: number } {
  const candidates = legalCategories(scoreCard);
  if (candidates.length === 0) {
    throw new Error('No scorable category available');
  }
  let best = candidates[0];
  let bestValue = turnValue(scoreCard, best, dice, rollsLeft);
  for (let i = 1; i < candidates.length; i++) {
    const value = turnValue(scoreCard, candidates[i], dice, rollsLeft);
    if (value > bestValue) {
      best = candidates[i];
      bestValue = value;
    }
  }
  return { category: best, value: bestValue };
}

function sortedMerge(a: DiceValue[], b: DiceValue[]): DiceValue[] {
  return [...a, ...b].sort((x, y) => x - y);
}

function valueAtRollsLeft(
  scoreCard: PlayerScoreCard,
  dice: DiceValue[],
  rollsLeft: number,
  cache: Map<string, number>
): number {
  const sortedDice = [...dice].sort((a, b) => a - b);
  const key = `${rollsLeft}:${sortedDice.join(',')}`;
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  let value = bestStopChoice(scoreCard, sortedDice, rollsLeft).value;

  if (rollsLeft > 0) {
    for (let mask = 0; mask < 32; mask++) {
      const held: DiceValue[] = [];
      for (let i = 0; i < 5; i++) {
        if (mask & (1 << i)) {
          held.push(sortedDice[i]);
        }
      }
      const k = 5 - held.length;
      let expected = 0;
      for (const outcome of REROLL_OUTCOMES_BY_K[k]) {
        const resulting = sortedMerge(held, outcome.values);
        expected +=
          outcome.probability * valueAtRollsLeft(scoreCard, resulting, rollsLeft - 1, cache);
      }
      if (expected > value) {
        value = expected;
      }
    }
  }

  cache.set(key, value);
  return value;
}

export function chooseBotRollDecision(
  scoreCard: PlayerScoreCard,
  dice: DiceValue[],
  rollsLeft: number
): BotRollDecision {
  const cache = new Map<string, number>();
  const { category: stopCategory, value: stopValue } = bestStopChoice(scoreCard, dice, rollsLeft);

  let bestValue = stopValue;
  let bestMask: number | null = null;

  for (let mask = 0; mask < 32; mask++) {
    const held: DiceValue[] = [];
    for (let i = 0; i < 5; i++) {
      if (mask & (1 << i)) {
        held.push(dice[i]);
      }
    }
    const k = 5 - held.length;
    let expected = 0;
    for (const outcome of REROLL_OUTCOMES_BY_K[k]) {
      const resulting = sortedMerge(held, outcome.values);
      expected +=
        outcome.probability * valueAtRollsLeft(scoreCard, resulting, rollsLeft - 1, cache);
    }
    if (expected > bestValue) {
      bestValue = expected;
      bestMask = mask;
    }
  }

  if (bestMask === null) {
    return { action: 'score', category: stopCategory };
  }
  const hold = [0, 1, 2, 3, 4].map((i) => (bestMask! & (1 << i)) !== 0);
  return { action: 'reroll', hold };
}

export function chooseBotScoreDecision(
  scoreCard: PlayerScoreCard,
  dice: DiceValue[],
  rollsLeft: number
): ScoreCategory {
  return bestStopChoice(scoreCard, dice, rollsLeft).category;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/bot/strategy.test.ts`
Expected: PASS (all 5 cases green). If a specific expectation is wrong (e.g. the exact hold mask in the four-of-a-kind test), trust the algorithm over the hand-derived expectation in this plan — inspect the actual returned decision, sanity-check it against the "Algorytm" section of `docs/superpowers/specs/2026-07-07-bot-silnik-ev-design.md`, and fix the test's expected value rather than changing the algorithm to match a mistaken guess.

- [ ] **Step 6: Export the new module from the package**

Edit `packages/game-engine/src/index.ts`, adding after the existing exports:

```ts
export * from './bot/rerollOutcomes';
export * from './bot/types';
export * from './bot/strategy';
```

- [ ] **Step 7: Rebuild the package and run its full test suite**

Run (from repo root): `npm run build:engine`
Expected: no TypeScript errors (this also exercises `noUnusedLocals`/`noUnusedParameters`).

Run (from `packages/game-engine/`): `npx vitest run`
Expected: PASS — all existing engine tests plus the two new files.

- [ ] **Step 8: Commit**

```bash
git add packages/game-engine/src/bot/types.ts packages/game-engine/src/bot/strategy.ts packages/game-engine/src/bot/strategy.test.ts packages/game-engine/src/index.ts
git commit -m "Add EV-based bot strategy engine to game-engine"
```

---

## Task 3: Rewire `useBotTurn` to the EV engine

**Files:**
- Modify: `app/src/bot/useBotTurn.ts`
- Modify: `app/src/bot/useBotTurn.test.ts`

**Interfaces:**
- Consumes: `chooseBotRollDecision`, `chooseBotScoreDecision`, `BotRollDecision` from `@bronx-dice/game-engine` (Task 2, requires `npm run build:engine` to have been run).
- No new exports — `useBotTurn`'s own signature (`UseBotTurnOptions`, return type `boolean`) is unchanged.

- [ ] **Step 1: Rewrite the test file's mocks and decision-producing tests**

Replace the contents of `app/src/bot/useBotTurn.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  createGameState,
  UPPER_CATEGORIES,
  LOWER_CATEGORIES,
  type DiceValue,
  type GameState,
  type PlayerScoreCard,
} from '@bronx-dice/game-engine';
import * as gameEngine from '@bronx-dice/game-engine';
import { useBotTurn, DECISION_WINDOW_MS, HOLD_PAUSE_MS } from './useBotTurn';

vi.mock('@bronx-dice/game-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@bronx-dice/game-engine')>();
  return {
    ...actual,
    chooseBotRollDecision: vi.fn(),
    chooseBotScoreDecision: vi.fn(),
  };
});

function makeState(overrides: Partial<GameState> = {}): GameState {
  return { ...createGameState(['Human', 'Bot']), ...overrides };
}

// A scorecard with every category already filled in, so the EV engine has no
// legal category left and throws.
function makeFullScoreCard(): PlayerScoreCard {
  return {
    upper: Object.fromEntries(UPPER_CATEGORIES.map((category) => [category, 0])) as PlayerScoreCard['upper'],
    lower: Object.fromEntries(LOWER_CATEGORIES.map((category) => [category, 0])) as PlayerScoreCard['lower'],
  };
}

const BOT_IDS = new Set(['player-2']);

describe('useBotTurn', () => {
  afterEach(() => {
    vi.mocked(gameEngine.chooseBotRollDecision).mockReset();
    vi.mocked(gameEngine.chooseBotScoreDecision).mockReset();
    vi.useRealTimers();
  });

  it('auto-rolls at the start of a bot turn without asking the EV engine', () => {
    const onRoll = vi.fn();
    const state = makeState({ currentPlayerIndex: 1 });

    const { result } = renderHook(() =>
      useBotTurn({
        state,
        isRolling: false,
        botPlayerIds: BOT_IDS,
        enabled: true,
        onRoll,
        onToggleHeld: vi.fn(),
        onScore: vi.fn(),
      })
    );

    expect(onRoll).toHaveBeenCalledTimes(1);
    expect(gameEngine.chooseBotRollDecision).not.toHaveBeenCalled();
    expect(result.current).toBe(false);
  });

  it('does nothing while the roll animation is in progress', () => {
    const onRoll = vi.fn();
    const state = makeState({ currentPlayerIndex: 1 });

    renderHook(() =>
      useBotTurn({
        state,
        isRolling: true,
        botPlayerIds: BOT_IDS,
        enabled: true,
        onRoll,
        onToggleHeld: vi.fn(),
        onScore: vi.fn(),
      })
    );

    expect(onRoll).not.toHaveBeenCalled();
  });

  it('does nothing on a human turn', () => {
    const onRoll = vi.fn();
    const state = makeState({ currentPlayerIndex: 0 });

    renderHook(() =>
      useBotTurn({
        state,
        isRolling: false,
        botPlayerIds: BOT_IDS,
        enabled: true,
        onRoll,
        onToggleHeld: vi.fn(),
        onScore: vi.fn(),
      })
    );

    expect(onRoll).not.toHaveBeenCalled();
  });

  it('does nothing once the game is over (enabled=false), even mid-bot-turn', () => {
    const onRoll = vi.fn();
    const state = makeState({ currentPlayerIndex: 1 });

    renderHook(() =>
      useBotTurn({
        state,
        isRolling: false,
        botPlayerIds: BOT_IDS,
        enabled: false,
        onRoll,
        onToggleHeld: vi.fn(),
        onScore: vi.fn(),
      })
    );

    expect(onRoll).not.toHaveBeenCalled();
  });

  it('does not re-roll twice for the exact same state (e.g. StrictMode double-render)', () => {
    const onRoll = vi.fn();
    const state = makeState({ currentPlayerIndex: 1 });

    const { rerender } = renderHook(
      (props: { state: GameState }) =>
        useBotTurn({
          state: props.state,
          isRolling: false,
          botPlayerIds: BOT_IDS,
          enabled: true,
          onRoll,
          onToggleHeld: vi.fn(),
          onScore: vi.fn(),
        }),
      { initialProps: { state } }
    );
    rerender({ state: { ...state } });

    expect(onRoll).toHaveBeenCalledTimes(1);
  });

  it('applies a reroll decision: toggles the right dice, then rolls again', async () => {
    vi.useFakeTimers();
    const onToggleHeld = vi.fn();
    const onRoll = vi.fn();
    const dice: DiceValue[] = [1, 1, 1, 4, 5];
    const heldDice = [false, false, false, false, false];
    const state = makeState({ currentPlayerIndex: 1, dice, heldDice, rollsLeft: 2 });
    vi.mocked(gameEngine.chooseBotRollDecision).mockReturnValue({
      action: 'reroll',
      hold: [true, true, true, false, false],
    });

    const { result } = renderHook(() =>
      useBotTurn({
        state,
        isRolling: false,
        botPlayerIds: BOT_IDS,
        enabled: true,
        onRoll,
        onToggleHeld,
        onScore: vi.fn(),
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DECISION_WINDOW_MS + HOLD_PAUSE_MS + 50);
    });

    expect(gameEngine.chooseBotRollDecision).toHaveBeenCalledWith(
      state.scoreCards['player-2'],
      dice,
      2
    );
    expect(onToggleHeld).toHaveBeenCalledWith(0);
    expect(onToggleHeld).toHaveBeenCalledWith(1);
    expect(onToggleHeld).toHaveBeenCalledWith(2);
    expect(onToggleHeld).not.toHaveBeenCalledWith(3);
    expect(onToggleHeld).not.toHaveBeenCalledWith(4);
    expect(onRoll).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(false);
  });

  it('sets isThinking to true for the decision window, then false once it elapses', async () => {
    vi.useFakeTimers();
    const onToggleHeld = vi.fn();
    const onRoll = vi.fn();
    const dice: DiceValue[] = [1, 1, 1, 4, 5];
    const heldDice = [false, false, false, false, false];
    const state = makeState({ currentPlayerIndex: 1, dice, heldDice, rollsLeft: 2 });
    vi.mocked(gameEngine.chooseBotRollDecision).mockReturnValue({
      action: 'reroll',
      hold: [true, true, true, false, false],
    });

    const { result } = renderHook(() =>
      useBotTurn({
        state,
        isRolling: false,
        botPlayerIds: BOT_IDS,
        enabled: true,
        onRoll,
        onToggleHeld,
        onScore: vi.fn(),
      })
    );

    // The artificial decision window is still running, even though the
    // (synchronous, mocked) EV computation itself already resolved.
    expect(result.current).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DECISION_WINDOW_MS + HOLD_PAUSE_MS + 50);
    });

    expect(onRoll).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(false);
  });

  it('applies a score decision when the roll decision says to stop', async () => {
    vi.useFakeTimers();
    const onScore = vi.fn();
    const dice: DiceValue[] = [1, 1, 1, 4, 5];
    const state = makeState({
      currentPlayerIndex: 1,
      dice,
      heldDice: [false, false, false, false, false],
      rollsLeft: 2,
    });
    vi.mocked(gameEngine.chooseBotRollDecision).mockReturnValue({
      action: 'score',
      category: 'fives',
    });

    renderHook(() =>
      useBotTurn({
        state,
        isRolling: false,
        botPlayerIds: BOT_IDS,
        enabled: true,
        onRoll: vi.fn(),
        onToggleHeld: vi.fn(),
        onScore,
      })
    );

    await vi.advanceTimersByTimeAsync(DECISION_WINDOW_MS + 50);

    expect(onScore).toHaveBeenCalledWith('fives');
  });

  it('forces a category choice when rollsLeft is 0', async () => {
    vi.useFakeTimers();
    const onScore = vi.fn();
    const dice: DiceValue[] = [6, 6, 6, 6, 6];
    const state = makeState({
      currentPlayerIndex: 1,
      dice,
      heldDice: [true, true, true, true, true],
      rollsLeft: 0,
    });
    vi.mocked(gameEngine.chooseBotScoreDecision).mockReturnValue('sixes');

    const { result } = renderHook(() =>
      useBotTurn({
        state,
        isRolling: false,
        botPlayerIds: BOT_IDS,
        enabled: true,
        onRoll: vi.fn(),
        onToggleHeld: vi.fn(),
        onScore,
      })
    );

    expect(result.current).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DECISION_WINDOW_MS + 50);
    });

    expect(gameEngine.chooseBotScoreDecision).toHaveBeenCalledWith(
      state.scoreCards['player-2'],
      dice,
      0
    );
    expect(onScore).toHaveBeenCalledWith('sixes');
    expect(result.current).toBe(false);
  });

  it('does nothing (no onRoll/onToggleHeld/onScore, no unhandled rejection) when the EV engine has no legal category during a reroll decision', async () => {
    vi.useFakeTimers();
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason);
    process.on('unhandledRejection', onUnhandledRejection);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const onScore = vi.fn();
    const onToggleHeld = vi.fn();
    const onRoll = vi.fn();
    const dice: DiceValue[] = [1, 1, 1, 4, 5];
    const fullScoreCard = makeFullScoreCard();
    const state = makeState({
      currentPlayerIndex: 1,
      dice,
      heldDice: [false, false, false, false, false],
      rollsLeft: 2,
      scoreCards: { 'player-1': fullScoreCard, 'player-2': fullScoreCard },
    });
    vi.mocked(gameEngine.chooseBotRollDecision).mockImplementation(() => {
      throw new Error('No scorable category available');
    });

    renderHook(() =>
      useBotTurn({
        state,
        isRolling: false,
        botPlayerIds: BOT_IDS,
        enabled: true,
        onRoll,
        onToggleHeld,
        onScore,
      })
    );

    await vi.advanceTimersByTimeAsync(DECISION_WINDOW_MS + HOLD_PAUSE_MS + 50);
    await Promise.resolve();
    await Promise.resolve();

    expect(onScore).not.toHaveBeenCalled();
    expect(onToggleHeld).not.toHaveBeenCalled();
    expect(onRoll).not.toHaveBeenCalled();
    expect(unhandledRejections).toEqual([]);

    process.off('unhandledRejection', onUnhandledRejection);
    consoleErrorSpy.mockRestore();
  });

  it('does nothing (no onScore, no unhandled rejection) when the EV engine has no legal category during a forced score decision', async () => {
    vi.useFakeTimers();
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason);
    process.on('unhandledRejection', onUnhandledRejection);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const onScore = vi.fn();
    const dice: DiceValue[] = [6, 6, 6, 6, 6];
    const fullScoreCard = makeFullScoreCard();
    const state = makeState({
      currentPlayerIndex: 1,
      dice,
      heldDice: [true, true, true, true, true],
      rollsLeft: 0,
      scoreCards: { 'player-1': fullScoreCard, 'player-2': fullScoreCard },
    });
    vi.mocked(gameEngine.chooseBotScoreDecision).mockImplementation(() => {
      throw new Error('No scorable category available');
    });

    renderHook(() =>
      useBotTurn({
        state,
        isRolling: false,
        botPlayerIds: BOT_IDS,
        enabled: true,
        onRoll: vi.fn(),
        onToggleHeld: vi.fn(),
        onScore,
      })
    );

    await vi.advanceTimersByTimeAsync(DECISION_WINDOW_MS + 50);
    await Promise.resolve();
    await Promise.resolve();

    expect(onScore).not.toHaveBeenCalled();
    expect(unhandledRejections).toEqual([]);

    process.off('unhandledRejection', onUnhandledRejection);
    consoleErrorSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `app/`): `npx vitest run src/bot/useBotTurn.test.ts`
Expected: FAIL — assertions on `gameEngine.chooseBotRollDecision`/`chooseBotScoreDecision` mismatch, since `useBotTurn.ts` still calls the old LLM path.

- [ ] **Step 3: Rewrite `useBotTurn.ts`**

Replace the contents of `app/src/bot/useBotTurn.ts`:

```ts
import { useEffect, useRef, useState } from 'react';
import {
  chooseBotRollDecision,
  chooseBotScoreDecision,
  type BotRollDecision,
  type DiceValue,
  type GameState,
  type PlayerScoreCard,
  type ScoreCategory,
} from '@bronx-dice/game-engine';
import { withDecisionWindow } from './timing';

export const DECISION_WINDOW_MS = 2500;
export const HOLD_PAUSE_MS = 400;

interface UseBotTurnOptions {
  state: GameState;
  isRolling: boolean;
  botPlayerIds: Set<string>;
  enabled: boolean;
  onRoll: () => void;
  onToggleHeld: (index: number) => void;
  onScore: (category: ScoreCategory) => void;
}

// Sentinel returned when the EV engine has no legal category available
// (only possible if the scorecard is already fully complete). This should
// never happen along any reachable code path in this app, but these
// functions must never throw/reject, so we surface it as "no-op" instead of
// letting the exception escape.
const NO_OP = Symbol('no-op');

async function getRollDecision(
  scoreCard: PlayerScoreCard,
  dice: DiceValue[],
  rollsLeft: number
): Promise<BotRollDecision | typeof NO_OP> {
  try {
    return chooseBotRollDecision(scoreCard, dice, rollsLeft);
  } catch (error) {
    console.error(
      'useBotTurn: chooseBotRollDecision threw with no legal category available; skipping this turn.',
      error
    );
    return NO_OP;
  }
}

async function getScoreDecision(
  scoreCard: PlayerScoreCard,
  dice: DiceValue[],
  rollsLeft: number
): Promise<ScoreCategory | typeof NO_OP> {
  try {
    return chooseBotScoreDecision(scoreCard, dice, rollsLeft);
  } catch (error) {
    console.error(
      'useBotTurn: chooseBotScoreDecision threw with no legal category available; skipping this turn.',
      error
    );
    return NO_OP;
  }
}

export function useBotTurn({
  state,
  isRolling,
  botPlayerIds,
  enabled,
  onRoll,
  onToggleHeld,
  onScore,
}: UseBotTurnOptions): boolean {
  const lastHandledRef = useRef<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);

  useEffect(() => {
    if (!enabled || isRolling) {
      return;
    }
    const currentPlayer = state.players[state.currentPlayerIndex];
    if (!botPlayerIds.has(currentPlayer.id)) {
      return;
    }

    const signature = `${currentPlayer.id}:${state.rollsLeft}:${state.dice.join(',')}`;
    if (lastHandledRef.current === signature) {
      return;
    }
    lastHandledRef.current = signature;

    if (state.dice.length === 0) {
      onRoll();
      return;
    }

    const scoreCard = state.scoreCards[currentPlayer.id];
    const { dice, heldDice, rollsLeft } = state;

    if (rollsLeft > 0) {
      setIsThinking(true);
      withDecisionWindow(DECISION_WINDOW_MS, () =>
        getRollDecision(scoreCard, dice, rollsLeft)
      ).then((decision) => {
        setIsThinking(false);
        if (decision === NO_OP) {
          return;
        }
        if (decision.action === 'score') {
          onScore(decision.category);
          return;
        }
        decision.hold.forEach((held, index) => {
          if (held !== heldDice[index]) {
            onToggleHeld(index);
          }
        });
        setTimeout(onRoll, HOLD_PAUSE_MS);
      });
    } else {
      setIsThinking(true);
      withDecisionWindow(DECISION_WINDOW_MS, () =>
        getScoreDecision(scoreCard, dice, rollsLeft)
      ).then((category) => {
        setIsThinking(false);
        if (category === NO_OP) {
          return;
        }
        onScore(category);
      });
    }
  }, [state, isRolling, botPlayerIds, enabled, onRoll, onToggleHeld, onScore]);

  return isThinking;
}
```

- [ ] **Step 4: Rebuild the engine package (if not already done in Task 2) and run the app test**

Run (from repo root, only if you skipped Task 2's Step 7 or pulled in changes since): `npm run build:engine`

Run (from `app/`): `npx vitest run src/bot/useBotTurn.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Type-check the whole `app` workspace**

Run (from `app/`): `npx tsc -b`
Expected: no errors — confirms the now-unused old bot files (`botClient.ts`, `promptBuilder.ts`, `decision.ts`, `heuristic.ts`, `houseRules.ts`) still compile standalone even though nothing imports them anymore.

- [ ] **Step 6: Commit**

```bash
git add app/src/bot/useBotTurn.ts app/src/bot/useBotTurn.test.ts
git commit -m "Rewire useBotTurn to the EV strategy engine, dropping the LLM decision path"
```

---

## Verification

1. `npm run build:engine` (repo root) — engine package builds clean.
2. `npx vitest run` from `packages/game-engine/` — all engine tests pass, including the new `bot/` suite.
3. `npx vitest run` from `app/` — all app tests pass, including `useBotTurn.test.ts`.
4. `npm run build` from `app/` — full `tsc -b && vite build` succeeds (confirms no stray references to removed imports anywhere else in the app).
5. Manual smoke test: `npm run dev` (from `app/`, no need to also run `bot-server` anymore), start a local game with the "Bot" checkbox on for one player, and play a few turns — the bot should now decide instantly (still paced by the ~2.5s `DECISION_WINDOW_MS` for UX) with no `bot-server` process running and no `claude` CLI involved.
