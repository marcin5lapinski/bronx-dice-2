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
