import type { ScoreCategory } from '../types/game';

export type BotRollDecision =
  | { action: 'reroll'; hold: boolean[] }
  | { action: 'score'; category: ScoreCategory };
