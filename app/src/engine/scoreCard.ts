import type {
  PlayerScoreCard,
  ScoreCategory,
  UpperCategory,
  LowerCategory,
  DiceValue,
} from '../types/game';
import { UPPER_CATEGORIES, LOWER_CATEGORIES } from '../types/game';
import { calculateUpperSum, calculateBonus } from './scoring/upperSection';
import { upperCategoryScore } from './scoring/upperSection';
import {
  pairScore,
  twoPairScore,
  threeOfKindScore,
  fourOfKindScore,
  smallStraightScore,
  largeStraightScore,
  fullHouseScore,
  chanceScore,
  yahtzeeScore,
} from './scoring/combinations';

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

export const DOUBLE_SCORE_ROLLS_LEFT = 2;
export const YAHTZEE_BONUS = 50;

const LOWER_SCORERS: Record<LowerCategory, (dice: DiceValue[]) => number> = {
  pair: pairScore,
  twoPair: twoPairScore,
  threeOfKind: threeOfKindScore,
  fourOfKind: fourOfKindScore,
  smallStraight: smallStraightScore,
  largeStraight: largeStraightScore,
  fullHouse: fullHouseScore,
  chance: chanceScore,
  yahtzee: yahtzeeScore,
};

export function scoreCategory(
  scoreCard: PlayerScoreCard,
  category: ScoreCategory,
  dice: DiceValue[],
  rollsLeft: number
): PlayerScoreCard {
  if (!canScoreCategory(scoreCard, category)) {
    throw new Error(`Category "${category}" cannot be scored right now`);
  }

  if (isUpperCategory(category)) {
    const value = upperCategoryScore(category, dice);
    return { ...scoreCard, upper: { ...scoreCard.upper, [category]: value } };
  }

  const raw = LOWER_SCORERS[category](dice);
  const doubled = rollsLeft === DOUBLE_SCORE_ROLLS_LEFT;
  let value = doubled ? raw * 2 : raw;
  if (category === 'yahtzee' && raw > 0) {
    value += YAHTZEE_BONUS;
  }
  return { ...scoreCard, lower: { ...scoreCard.lower, [category]: value } };
}
