import {
  canScoreCategory,
  UPPER_CATEGORIES,
  LOWER_CATEGORIES,
  type PlayerScoreCard,
  type ScoreCategory,
} from '@bronx-dice/game-engine';

export type RollDecision =
  | { action: 'reroll'; hold: boolean[] }
  | { action: 'score'; category: ScoreCategory };

const ALL_CATEGORIES: ScoreCategory[] = [...UPPER_CATEGORIES, ...LOWER_CATEGORIES];

function isScoreCategory(value: unknown): value is ScoreCategory {
  return typeof value === 'string' && (ALL_CATEGORIES as string[]).includes(value);
}

function isHoldArray(value: unknown): value is boolean[] {
  return (
    Array.isArray(value) &&
    value.length === 5 &&
    value.every((entry) => typeof entry === 'boolean')
  );
}

export function parseRollDecision(
  raw: unknown,
  scoreCard: PlayerScoreCard
): RollDecision | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const { action, hold, category } = raw as Record<string, unknown>;
  if (action === 'reroll' && isHoldArray(hold)) {
    return { action: 'reroll', hold };
  }
  if (
    action === 'score' &&
    isScoreCategory(category) &&
    canScoreCategory(scoreCard, category)
  ) {
    return { action: 'score', category };
  }
  return null;
}

export function parseScoreDecision(
  raw: unknown,
  scoreCard: PlayerScoreCard
): ScoreCategory | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const { category } = raw as Record<string, unknown>;
  if (isScoreCategory(category) && canScoreCategory(scoreCard, category)) {
    return category;
  }
  return null;
}
