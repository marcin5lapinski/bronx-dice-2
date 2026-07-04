import type { DiceValue } from './types/game';

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
