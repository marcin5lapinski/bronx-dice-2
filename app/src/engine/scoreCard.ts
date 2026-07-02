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
