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

// The counts of each face actually present, sorted descending — e.g. a full
// house is [3, 2], a four-of-a-kind is [4, 1]. Categories below match on this
// exact shape rather than a "count >= N" threshold, so a hand only scores in
// the one category it truly is: three-of-a-kind doesn't also score as a
// pair, four-of-a-kind doesn't also score as two pair, a full house doesn't
// also score as three-of-a-kind, etc.
function shapeCounts(dice: DiceValue[]): number[] {
  const counts = countsByValue(dice);
  return ALL_FACES.map((value) => counts[value])
    .filter((count) => count > 0)
    .sort((a, b) => b - a);
}

function hasShape(dice: DiceValue[], shape: number[]): boolean {
  const actual = shapeCounts(dice);
  return (
    actual.length === shape.length && actual.every((c, i) => c === shape[i])
  );
}

export function pairScore(dice: DiceValue[]): number {
  if (!hasShape(dice, [2, 1, 1, 1])) {
    return 0;
  }
  const counts = countsByValue(dice);
  const pairValue = ALL_FACES.find((value) => counts[value] === 2)!;
  return pairValue * 2;
}

export function twoPairScore(dice: DiceValue[]): number {
  if (!hasShape(dice, [2, 2, 1])) {
    return 0;
  }
  const counts = countsByValue(dice);
  const pairValues = ALL_FACES.filter((value) => counts[value] === 2);
  return pairValues.reduce((total, value) => total + value * 2, 0);
}

export function threeOfKindScore(dice: DiceValue[]): number {
  if (!hasShape(dice, [3, 1, 1])) {
    return 0;
  }
  const counts = countsByValue(dice);
  const value = ALL_FACES.find((face) => counts[face] === 3)!;
  return value * 3;
}

export function fourOfKindScore(dice: DiceValue[]): number {
  if (!hasShape(dice, [4, 1])) {
    return 0;
  }
  const counts = countsByValue(dice);
  const value = ALL_FACES.find((face) => counts[face] === 4)!;
  return value * 4;
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
