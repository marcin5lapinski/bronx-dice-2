import {
  canScoreCategory,
  UPPER_CATEGORIES,
  LOWER_CATEGORIES,
  type DiceValue,
  type PlayerScoreCard,
  type ScoreCategory,
} from '@bronx-dice/game-engine';
import { previewScore } from '../utils/previewScore';

const ALL_CATEGORIES: ScoreCategory[] = [...UPPER_CATEGORIES, ...LOWER_CATEGORIES];

export function chooseHeuristicCategory(
  scoreCard: PlayerScoreCard,
  dice: DiceValue[],
  rollsLeft: number
): ScoreCategory {
  const candidates = ALL_CATEGORIES.filter((category) =>
    canScoreCategory(scoreCard, category)
  );
  if (candidates.length === 0) {
    throw new Error('No scorable category available');
  }
  return candidates.reduce((best, category) => {
    const bestScore = previewScore(scoreCard, best, dice, rollsLeft);
    const score = previewScore(scoreCard, category, dice, rollsLeft);
    return score > bestScore ? category : best;
  });
}
