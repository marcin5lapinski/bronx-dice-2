import type {
  Player,
  PlayerScoreCard,
  ScoreCategory,
  DiceValue,
} from '../types/game';
import { UPPER_CATEGORIES, LOWER_CATEGORIES } from '../types/game';
import {
  canScoreCategory,
  calculateTotal,
  isUpperCategory,
  scoreCategory,
} from '../engine/scoreCard';
import { calculateBonus } from '../engine/scoring/upperSection';

interface ScoreBoardProps {
  players: Player[];
  scoreCards: Record<string, PlayerScoreCard>;
  currentPlayerId: string;
  dice: DiceValue[];
  rollsLeft: number;
  onScore: (category: ScoreCategory) => void;
}

const CATEGORY_LABELS: Record<ScoreCategory, string> = {
  aces: 'Asy',
  twos: 'Dwójki',
  threes: 'Trójki',
  fours: 'Czwórki',
  fives: 'Piątki',
  sixes: 'Szóstki',
  pair: 'Para',
  twoPair: '2x Para',
  threeOfKind: 'Trójka',
  fourOfKind: 'Czwórka',
  smallStraight: 'Mały strit',
  largeStraight: 'Duży strit',
  fullHouse: 'Full',
  chance: 'Szansa',
  yahtzee: 'Piątka/Generał',
};

function scoreValue(
  scoreCard: PlayerScoreCard,
  category: ScoreCategory
): number | null {
  return isUpperCategory(category)
    ? scoreCard.upper[category]
    : scoreCard.lower[category];
}

function previewScore(
  scoreCard: PlayerScoreCard,
  category: ScoreCategory,
  dice: DiceValue[],
  rollsLeft: number
): number {
  const preview = scoreCategory(scoreCard, category, dice, rollsLeft);
  return scoreValue(preview, category) ?? 0;
}

function playerColClass(
  playerId: string,
  currentPlayerId: string
): string | undefined {
  return playerId === currentPlayerId ? 'current-player-col' : undefined;
}

function ScoreBoard({
  players,
  scoreCards,
  currentPlayerId,
  dice,
  rollsLeft,
  onScore,
}: ScoreBoardProps) {
  const hasRolled = dice.length === 5;

  const renderCategoryRow = (category: ScoreCategory) => (
    <tr key={category}>
      <td>{CATEGORY_LABELS[category]}</td>
      {players.map((player) => {
        const scoreCard = scoreCards[player.id];
        const value = scoreValue(scoreCard, category);
        const isCurrentPlayer = player.id === currentPlayerId;
        const clickable =
          isCurrentPlayer && hasRolled && canScoreCategory(scoreCard, category);
        return (
          <td
            key={player.id}
            className={playerColClass(player.id, currentPlayerId)}
          >
            {value !== null ? (
              value
            ) : clickable ? (
              <button type="button" onClick={() => onScore(category)}>
                {previewScore(scoreCard, category, dice, rollsLeft)}
              </button>
            ) : (
              ''
            )}
          </td>
        );
      })}
    </tr>
  );

  return (
    <table className="score-board">
      <thead>
        <tr>
          <th>Kategoria</th>
          {players.map((player) => (
            <th
              key={player.id}
              className={playerColClass(player.id, currentPlayerId)}
            >
              {player.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {UPPER_CATEGORIES.map(renderCategoryRow)}
        <tr className="bonus-row">
          <td>Bonus</td>
          {players.map((player) => {
            const bonus = calculateBonus(scoreCards[player.id]);
            const classes = [
              playerColClass(player.id, currentPlayerId),
              bonus > 0 ? 'bonus-earned' : null,
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <td key={player.id} className={classes || undefined}>
                {bonus > 0 ? bonus : ''}
              </td>
            );
          })}
        </tr>
        {LOWER_CATEGORIES.map(renderCategoryRow)}
        <tr className="total-row">
          <td>Suma</td>
          {players.map((player) => (
            <td
              key={player.id}
              className={playerColClass(player.id, currentPlayerId)}
            >
              {calculateTotal(scoreCards[player.id])}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

export default ScoreBoard;
