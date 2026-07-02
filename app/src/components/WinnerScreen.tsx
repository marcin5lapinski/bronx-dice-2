import type { Player, PlayerScoreCard } from '../types/game';
import { calculateTotal } from '../engine/scoreCard';

interface WinnerScreenProps {
  winners: Player[];
  scoreCards: Record<string, PlayerScoreCard>;
  onPlayAgain: () => void;
}

function WinnerScreen({ winners, scoreCards, onPlayAgain }: WinnerScreenProps) {
  const winningTotal = calculateTotal(scoreCards[winners[0].id]);
  const names = winners.map((winner) => winner.name).join(' i ');
  const heading =
    winners.length === 1 ? `Zwycięzca: ${names}!` : `Remis: ${names}!`;

  return (
    <div className="winner-screen">
      <h1>{heading}</h1>
      <p>Wynik: {winningTotal}</p>
      <button type="button" onClick={onPlayAgain}>
        Zagraj ponownie
      </button>
    </div>
  );
}

export default WinnerScreen;
