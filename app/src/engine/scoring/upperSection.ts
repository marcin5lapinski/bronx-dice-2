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
