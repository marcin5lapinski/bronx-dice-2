import {
  isUpperCategory,
  scoreCategory,
  type DiceValue,
  type PlayerScoreCard,
  type ScoreCategory,
} from '@bronx-dice/game-engine';

export function scoreValue(
  scoreCard: PlayerScoreCard,
  category: ScoreCategory
): number | null {
  return isUpperCategory(category)
    ? scoreCard.upper[category]
    : scoreCard.lower[category];
}

export function previewScore(
  scoreCard: PlayerScoreCard,
  category: ScoreCategory,
  dice: DiceValue[],
  rollsLeft: number
): number {
  const preview = scoreCategory(scoreCard, category, dice, rollsLeft);
  return scoreValue(preview, category) ?? 0;
}
