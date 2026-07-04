export type DiceValue = 1 | 2 | 3 | 4 | 5 | 6;

export type UpperCategory =
  | 'aces'
  | 'twos'
  | 'threes'
  | 'fours'
  | 'fives'
  | 'sixes';

export type LowerCategory =
  | 'pair'
  | 'twoPair'
  | 'threeOfKind'
  | 'fourOfKind'
  | 'smallStraight'
  | 'largeStraight'
  | 'fullHouse'
  | 'chance'
  | 'yahtzee';

export type ScoreCategory = UpperCategory | LowerCategory;

export const UPPER_CATEGORIES: UpperCategory[] = [
  'aces',
  'twos',
  'threes',
  'fours',
  'fives',
  'sixes',
];

export const LOWER_CATEGORIES: LowerCategory[] = [
  'pair',
  'twoPair',
  'threeOfKind',
  'fourOfKind',
  'smallStraight',
  'largeStraight',
  'fullHouse',
  'chance',
  'yahtzee',
];

export interface PlayerScoreCard {
  upper: Record<UpperCategory, number | null>;
  lower: Record<LowerCategory, number | null>;
}

export interface Player {
  id: string;
  name: string;
}

export interface GameState {
  players: Player[];
  scoreCards: Record<string, PlayerScoreCard>;
  dice: DiceValue[];
  heldDice: boolean[];
  rollsLeft: number;
  currentPlayerIndex: number;
}
