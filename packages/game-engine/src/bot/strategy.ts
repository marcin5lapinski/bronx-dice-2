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
