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
