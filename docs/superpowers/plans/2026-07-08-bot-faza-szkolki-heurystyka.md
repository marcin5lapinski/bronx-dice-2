# Heurystyka fazy "szkółki" dla bota EV Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** During the upper-section ("szkółka") phase of a turn, replace the bot's exhaustive 32-hold-mask EV search with a single, cheap, deterministic candidate hold that targets whichever still-open upper category's face value has the most duplicates in the current dice (ties broken toward the higher face value) — correcting the exhaustive search's structural bias toward always chasing high-face categories first, which otherwise leaves low-face categories to be filled last and often weakly.

**Architecture:** One function, `chooseBotRollDecision` in `packages/game-engine/src/bot/strategy.ts`, gains a phase branch: while `isUpperSectionFilled(scoreCard)` is `false`, the only reroll candidate considered is the new rule's hold array (evaluated through the *existing* fast dice-level EV machinery, so the stop-vs-reroll decision and the eventual scored category still correctly account for the +50 upper-section bonus). Once the upper section is complete, behavior is byte-for-byte identical to today: the full 32-mask exhaustive search. `chooseBotScoreDecision` is untouched in both phases — it never holds dice. No other file changes: `app/src/bot/useBotTurn.ts` calls `chooseBotRollDecision`/`chooseBotScoreDecision` by the same signatures as before, so it needs no changes at all.

**Tech Stack:** TypeScript (`packages/game-engine` workspace package), Vitest.

## Global Constraints

- Scope is the upper-section ("szkółka") phase only. The lower-section ("poker") phase — i.e. any decision where `isUpperSectionFilled(scoreCard) === true` — must remain **byte-for-byte unchanged**: same 32 candidate masks, same order of evaluation, same tie-breaking (first mask in `mask = 0..31` order wins strict ties). The existing `strategy.test.ts` tests for that phase (four-of-a-kind reroll, doubling-favors-stopping) must keep passing unmodified — they are the regression guard for this constraint.
- `chooseBotScoreDecision` (the `rollsLeft === 0` forced-choice function) is not touched in this plan — it has no dice to hold, and its behavior (pick the legal category with the highest `turnValue`) is already correct and unaffected by this change.
- The new hold rule, given the current 5 `dice` and `scoreCard`:
  1. Filter the dice to only those whose face value corresponds to a *still-open* upper category (`canScoreCategory(scoreCard, categoryForThatFace)`).
  2. If nothing survives the filter, hold nothing (`[false, false, false, false, false]`) — reroll everything.
  3. Otherwise, pick the face value with the highest count among the filtered dice; ties broken by the higher face value.
  4. Hold every physical die (from the original, unfiltered `dice`) showing that chosen value; reroll the rest.
- The stop-vs-reroll decision and the +50 upper-section bonus accounting must **not** be reimplemented — reuse the existing `bestStopChoice`/`turnValue`/`calculateTotal` machinery exactly as today, just fed a single candidate hold instead of 32 during the szkółka phase.
- `packages/game-engine/tsconfig.json` has `strict`, `noUnusedLocals`, `noUnusedParameters` — all must remain clean.
- After this change, `npm run build:engine` (from the repo root) must be run before relying on `app/`'s tests seeing the new behavior — though no `app/` source file needs editing, since `chooseBotRollDecision`'s public signature is unchanged.

**Deliberate deviation from the design spec:** the spec's "Testowanie" section suggests a new co-located file, `packages/game-engine/src/bot/schoolPhaseHold.test.ts`, for the hold-selection rule. This plan instead adds the new cases directly to the existing `strategy.test.ts`, because the rule (`chooseUpperSectionHold`) is implemented as a private, unexported helper — exactly like every other internal helper in `strategy.ts` (`bestStopChoice`, `turnValue`, `valueAtRollsLeft`, etc.), all of which are already tested only indirectly through the two public functions in the existing `strategy.test.ts`, per this codebase's established pattern (one test file co-located with the module, testing its public surface — see `CLAUDE.md`'s testing conventions). Introducing a second test file for one private helper inside an already-tested module would break that pattern for no benefit. If you disagree with this call, flag it before starting Task 1.

---

## Task 1: Phase-aware hold selection in `chooseBotRollDecision`

**Files:**
- Modify: `packages/game-engine/src/bot/strategy.ts`
- Modify (tests): `packages/game-engine/src/bot/strategy.test.ts`

**Interfaces:**
- Consumes: `isUpperSectionFilled(scoreCard: PlayerScoreCard): boolean` and `canScoreCategory` from `../scoreCard` (both already exported); `UPPER_CATEGORIES`, `UpperCategory`, `DiceValue`, `PlayerScoreCard` from `../types/game`.
- Produces: no new exports. `chooseBotRollDecision`'s and `chooseBotScoreDecision`'s public signatures are unchanged — this task only changes internal behavior during the szkółka phase.

- [ ] **Step 1: Write the failing tests**

Insert the following five `it(...)` blocks into `packages/game-engine/src/bot/strategy.test.ts`, inside the existing `describe('chooseBotRollDecision', () => { ... })` block, immediately after the existing `'favors scoring now over rerolling when doubling (rollsLeft === 2) makes it pay off'` test (i.e. right before the block's closing `});` at what is currently line 42). Also add `createEmptyScoreCard` to the existing `import { chooseBotRollDecision, chooseBotScoreDecision } from './strategy';` line's neighboring import — add a new import line `import { createEmptyScoreCard } from '../scoreCard';` right after the `'./strategy'` import.

```ts
  it('szkółka phase: targets the value with the most duplicates among still-open categories', () => {
    const scoreCard = createEmptyScoreCard();
    const dice: DiceValue[] = [1, 1, 1, 4, 5];

    const decision = chooseBotRollDecision(scoreCard, dice, 2);

    expect(decision).toEqual({
      action: 'reroll',
      hold: [true, true, true, false, false],
    });
  });

  it('szkółka phase: ignores dice matching an already-filled category', () => {
    const scoreCard: PlayerScoreCard = {
      upper: { aces: null, twos: null, threes: null, fours: null, fives: null, sixes: 18 },
      lower: Object.fromEntries(
        LOWER_CATEGORIES.map((category) => [category, null])
      ) as PlayerScoreCard['lower'],
    };
    const dice: DiceValue[] = [1, 2, 3, 6, 6];

    const decision = chooseBotRollDecision(scoreCard, dice, 2);

    expect(decision).toEqual({
      action: 'reroll',
      hold: [false, false, true, false, false],
    });
  });

  it('szkółka phase: breaks a tie in duplicate count toward the higher face value', () => {
    const scoreCard: PlayerScoreCard = {
      upper: { aces: 0, twos: null, threes: null, fours: 0, fives: 0, sixes: 0 },
      lower: Object.fromEntries(
        LOWER_CATEGORIES.map((category) => [category, null])
      ) as PlayerScoreCard['lower'],
    };
    const dice: DiceValue[] = [2, 2, 3, 3, 6];

    const decision = chooseBotRollDecision(scoreCard, dice, 2);

    expect(decision).toEqual({
      action: 'reroll',
      hold: [false, false, true, true, false],
    });
  });

  it('szkółka phase: rerolls everything when no die matches a still-open category', () => {
    const scoreCard: PlayerScoreCard = {
      upper: { aces: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: null },
      lower: Object.fromEntries(
        LOWER_CATEGORIES.map((category) => [category, null])
      ) as PlayerScoreCard['lower'],
    };
    const dice: DiceValue[] = [1, 1, 2, 3, 4];

    const decision = chooseBotRollDecision(scoreCard, dice, 2);

    expect(decision).toEqual({
      action: 'reroll',
      hold: [false, false, false, false, false],
    });
  });

  it('szkółka phase: stops instead of rerolling when the targeted value is already maxed out', () => {
    const scoreCard: PlayerScoreCard = {
      upper: { aces: 0, twos: 0, threes: null, fours: 0, fives: 0, sixes: 0 },
      lower: Object.fromEntries(
        LOWER_CATEGORIES.map((category) => [category, null])
      ) as PlayerScoreCard['lower'],
    };
    const dice: DiceValue[] = [3, 3, 3, 3, 3];

    const decision = chooseBotRollDecision(scoreCard, dice, 2);

    expect(decision).toEqual({ action: 'score', category: 'threes' });
  });
```

The last test (`'stops instead of rerolling when the targeted value is already maxed out'`) is exactly derivable by hand with integer arithmetic, not just a plausible guess: with only `threes` open and dice `[3,3,3,3,3]`, the rule's only candidate is "hold all five" (`k = 0` rerolled dice), which recurses into the *identical* dice state one `rollsLeft` lower — an exact tie with stopping now (both equal `15`, the max raw `threes` score), and the code's strict `expected > bestValue` comparison means an exact tie always favors stopping. This one is safe to trust outright.

For the other four (all expected to reroll): the *hold array* is 100% certain by construction (the rule is a deterministic, non-probabilistic function of the dice and scoreCard — there is no EV arithmetic involved in producing the candidate itself). The only thing not hand-verified here is whether that candidate's expected value strictly beats stopping now, which determines `action: 'reroll'` vs `action: 'score'`. In every one of these four cases the candidate holds at least one die that's currently worth something and opens up two more rolls to improve on it (or, in the "rerolls everything" case, current dice are worth strictly `0`, so any real chance of improvement beats that trivially) — directionally this should reroll with a wide margin, consistent with similar large margins already measured in this codebase's existing four-of-a-kind test. If any of these four fails with an `action: 'score'` result instead, do not force the test to pass by changing `strategy.ts` — read the actual returned decision, sanity-check it against the "Reguła wyboru maski trzymania" section of `docs/superpowers/specs/2026-07-08-bot-faza-szkolki-heurystyka-design.md`, and if the algorithm is genuinely implemented as specified, fix the test's expected value to match reality (this mirrors how the original `strategy.ts` was built — trust a correctly-implemented exhaustive/deterministic algorithm over a hand guess).

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `packages/game-engine/`): `npx vitest run src/bot/strategy.test.ts`
Expected: the 5 new tests FAIL (current `chooseBotRollDecision` always does the exhaustive 32-mask search regardless of phase, so it won't match the new tests' hand-derived hold arrays in general — e.g. the "targets the value with the most duplicates" test's dice `[1,1,1,4,5]` on today's code most likely holds different dice than `[true,true,true,false,false]`, since the old code doesn't apply this rule at all). The 2 pre-existing tests in this `describe` block, and everything in `describe('chooseBotScoreDecision', ...)`, must still PASS (they don't touch the szkółka phase).

- [ ] **Step 3: Implement the phase-aware hold selection**

Replace the entire contents of `packages/game-engine/src/bot/strategy.ts` with:

```ts
import type { DiceValue, PlayerScoreCard, ScoreCategory, UpperCategory } from '../types/game';
import { UPPER_CATEGORIES, LOWER_CATEGORIES } from '../types/game';
import {
  canScoreCategory,
  scoreCategory,
  calculateTotal,
  isUpperSectionFilled,
} from '../scoreCard';
import { REROLL_OUTCOMES_BY_K } from './rerollOutcomes';
import type { BotRollDecision } from './types';

const ALL_CATEGORIES: ScoreCategory[] = [...UPPER_CATEGORIES, ...LOWER_CATEGORIES];

const ALL_HOLD_MASKS: boolean[][] = Array.from({ length: 32 }, (_, mask) =>
  [0, 1, 2, 3, 4].map((i) => (mask & (1 << i)) !== 0)
);

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

function upperCategoryForFace(face: DiceValue): UpperCategory {
  return UPPER_CATEGORIES[face - 1];
}

// Used only while the upper section is still incomplete ("szkółka" phase):
// replaces the exhaustive 32-mask search with a single, cheap candidate —
// target whichever still-open upper category's face value appears most
// often in the current dice, breaking ties toward the higher face value.
// This counteracts the exhaustive EV search's structural bias toward always
// chasing high-value upper categories first (a single die of value 4 always
// outscores a single die of value 1, even at equal or lower count), which
// otherwise tends to leave low-value categories to be filled last and often
// weakly — see docs/superpowers/specs/2026-07-08-bot-faza-szkolki-heurystyka-design.md.
function chooseUpperSectionHold(scoreCard: PlayerScoreCard, dice: DiceValue[]): boolean[] {
  const relevant = dice.filter((value) =>
    canScoreCategory(scoreCard, upperCategoryForFace(value))
  );
  if (relevant.length === 0) {
    return [false, false, false, false, false];
  }

  const counts = new Map<DiceValue, number>();
  for (const value of relevant) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  let targetValue = relevant[0];
  let targetCount = counts.get(targetValue)!;
  for (const [value, count] of counts) {
    if (count > targetCount || (count === targetCount && value > targetValue)) {
      targetValue = value;
      targetCount = count;
    }
  }

  return dice.map((value) => value === targetValue);
}

function candidateHoldsFor(scoreCard: PlayerScoreCard, dice: DiceValue[]): boolean[][] {
  return isUpperSectionFilled(scoreCard)
    ? ALL_HOLD_MASKS
    : [chooseUpperSectionHold(scoreCard, dice)];
}

function expectedHoldValue(
  scoreCard: PlayerScoreCard,
  dice: DiceValue[],
  hold: boolean[],
  rollsLeft: number,
  cache: Map<string, number>
): number {
  const held: DiceValue[] = [];
  for (let i = 0; i < 5; i++) {
    if (hold[i]) {
      held.push(dice[i]);
    }
  }
  const k = 5 - held.length;
  let expected = 0;
  for (const outcome of REROLL_OUTCOMES_BY_K[k]) {
    const resulting = sortedMerge(held, outcome.values);
    expected += outcome.probability * valueAtRollsLeft(scoreCard, resulting, rollsLeft - 1, cache);
  }
  return expected;
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
    for (const hold of candidateHoldsFor(scoreCard, sortedDice)) {
      const expected = expectedHoldValue(scoreCard, sortedDice, hold, rollsLeft, cache);
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
  let bestHold: boolean[] | null = null;

  for (const hold of candidateHoldsFor(scoreCard, dice)) {
    const expected = expectedHoldValue(scoreCard, dice, hold, rollsLeft, cache);
    if (expected > bestValue) {
      bestValue = expected;
      bestHold = hold;
    }
  }

  if (bestHold === null) {
    return { action: 'score', category: stopCategory };
  }
  return { action: 'reroll', hold: bestHold };
}

export function chooseBotScoreDecision(
  scoreCard: PlayerScoreCard,
  dice: DiceValue[],
  rollsLeft: number
): ScoreCategory {
  return bestStopChoice(scoreCard, dice, rollsLeft).category;
}
```

Notes on this refactor versus the current file:
- `ALL_HOLD_MASKS` replaces the inline `for (let mask = 0; mask < 32; mask++) { ... }` bit-unpacking that both `chooseBotRollDecision` and `valueAtRollsLeft` used to do separately — now computed once at module load and shared, in the same `mask = 0..31` iteration order as before (so tie-breaking for the poker phase is unchanged).
- `expectedHoldValue` is the old inline "build `held` from a mask, sum `REROLL_OUTCOMES_BY_K[k]` weighted recursion" logic, extracted so both `chooseBotRollDecision` and `valueAtRollsLeft` can call it with either `ALL_HOLD_MASKS` (poker phase) or the single szkółka-phase candidate.
- `candidateHoldsFor` is the only new branch point: it returns `ALL_HOLD_MASKS` when `isUpperSectionFilled(scoreCard)` is `true` (poker phase, unchanged behavior) and a single-element array wrapping `chooseUpperSectionHold(...)`'s result otherwise (szkółka phase).
- `valueAtRollsLeft`'s own internal reroll search now also goes through `candidateHoldsFor` — this matters: without this, only the *top-level* decision would use the new rule, but every recursive "what if I reroll again" evaluation inside the EV computation would still silently do the old exhaustive search, which is both wrong (violates the design's "reguła ma pierwszeństwo" intent for every reroll within the phase, not just the first) and defeats the performance benefit at deeper recursion levels.
- `bestStopChoice`, `turnValue`, `legalCategories`, `sortedMerge`, `chooseBotScoreDecision` are unchanged from the current file.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/bot/strategy.test.ts`
Expected: PASS — all 5 new szkółka-phase tests, plus the 2 existing `chooseBotRollDecision` tests (four-of-a-kind, doubling) and all 3 existing `chooseBotScoreDecision` tests, for a total of 10 passing tests in this file. The 2 existing `chooseBotRollDecision` tests passing unmodified is the direct regression check that the poker phase is untouched.

- [ ] **Step 5: Rebuild the package and run its full test suite**

Run (from repo root): `npm run build:engine`
Expected: no TypeScript errors.

Run (from `packages/game-engine/`): `npx vitest run`
Expected: PASS — every test file in the package, not just `strategy.test.ts` (confirms `rerollOutcomes.test.ts`, `scoreCard.test.ts`, etc. are all unaffected).

- [ ] **Step 6: Confirm `app/` needs no changes and still passes**

`app/src/bot/useBotTurn.ts` calls `chooseBotRollDecision(scoreCard, dice, rollsLeft)` and `chooseBotScoreDecision(scoreCard, dice, rollsLeft)` — identical signatures to before this change, so no edit is needed there. Confirm this by running (from `app/`): `npx vitest run` and `npx tsc -b`.
Expected: both PASS/clean, with no changes made to any file under `app/`. (`app`'s own bot tests mock `chooseBotRollDecision`/`chooseBotScoreDecision` directly, so they don't exercise the real algorithm — this step is purely a compile/regression safety check, not new coverage.)

- [ ] **Step 7: Commit**

```bash
git add packages/game-engine/src/bot/strategy.ts packages/game-engine/src/bot/strategy.test.ts
git commit -m "Add szkółka-phase hold heuristic to counteract the bot's high-face-category bias"
```

---

## Verification

1. `npx vitest run` from `packages/game-engine/` — all tests pass (existing suite + 5 new szkółka-phase tests).
2. `npm run build:engine` (repo root) — clean build.
3. `npx vitest run` and `npx tsc -b` from `app/` — unaffected, both clean (no `app/` files changed).
4. Manual smoke test: `npm run dev` (from `app/`), start a local game with a bot player, and play through several of the bot's turns during the upper section. Confirm low-value categories (aces/twos/threes) are no longer consistently left for last — the bot should now visibly hold onto whichever value has duplicates (or the single highest still-open value with no duplicates), including low ones, rather than always chasing high-face dice.
