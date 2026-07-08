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
