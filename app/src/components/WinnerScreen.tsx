import { calculateTotal, type Player, type PlayerScoreCard } from '@bronx-dice/game-engine';

interface WinnerScreenProps {
  winners: Player[];
  players: Player[];
  scoreCards: Record<string, PlayerScoreCard>;
  onPlayAgain?: () => void;
  onExit?: () => void;
}

function WinnerScreen({ winners, players, scoreCards, onPlayAgain, onExit }: WinnerScreenProps) {
  const names = winners.map((winner) => winner.name).join(' i ');
  const heading =
    winners.length === 1 ? `Zwycięzca: ${names}!` : `Remis: ${names}!`;

  const rankedPlayers = [...players].sort(
    (a, b) => calculateTotal(scoreCards[b.id]) - calculateTotal(scoreCards[a.id])
  );

  return (
    <div className="winner-screen">
      <h1>{heading}</h1>
      <ol className="winner-results">
        {rankedPlayers.map((player) => (
          <li key={player.id}>
            <span>{player.name}</span>
            <span>{calculateTotal(scoreCards[player.id])}</span>
          </li>
        ))}
      </ol>
      {onPlayAgain ? (
        <button type="button" onClick={onPlayAgain}>
          Zagraj ponownie
        </button>
      ) : (
        onExit && <p>Oczekiwanie na hosta…</p>
      )}
      {onExit && (
        <button type="button" className="back-button" onClick={onExit}>
          Wyjdź z pokoju
        </button>
      )}
    </div>
  );
}

export default WinnerScreen;
