import { useState } from 'react';
import { MIN_PLAYERS, MAX_PLAYERS } from '../engine/gameState';
import { useAuth } from '../contexts/AuthContext';

interface StartScreenProps {
  onStart: (playerNames: string[]) => void;
  onOpenAuth: () => void;
}

function defaultName(index: number): string {
  return `Gracz ${index + 1}`;
}

function StartScreen({ onStart, onOpenAuth }: StartScreenProps) {
  const { user } = useAuth();
  const [playerCount, setPlayerCount] = useState(MIN_PLAYERS);
  const [names, setNames] = useState<string[]>(
    Array.from({ length: MIN_PLAYERS }, (_, index) => defaultName(index))
  );

  const handlePlayerCountChange = (count: number) => {
    setPlayerCount(count);
    setNames((current) =>
      Array.from(
        { length: count },
        (_, index) => current[index] ?? defaultName(index)
      )
    );
  };

  const handleNameChange = (index: number, value: string) => {
    setNames((current) =>
      current.map((name, i) => (i === index ? value : name))
    );
  };

  const trimmedNames = names.slice(0, playerCount).map((name) => name.trim());
  const canStart = trimmedNames.every((name) => name.length > 0);

  return (
    <div className="start-screen">
      <img
        className="app-logo"
        src="/dice/logos/logo-bd2-2-header.png"
        alt="Bronx Dice"
      />
      <button type="button" onClick={onOpenAuth}>
        {user ? 'Profil gracza' : 'Zaloguj się'}
      </button>
      <label htmlFor="player-count">Liczba graczy</label>
      <select
        id="player-count"
        value={playerCount}
        onChange={(event) =>
          handlePlayerCountChange(Number(event.target.value))
        }
      >
        {Array.from(
          { length: MAX_PLAYERS - MIN_PLAYERS + 1 },
          (_, i) => MIN_PLAYERS + i
        ).map((count) => (
          <option key={count} value={count}>
            {count}
          </option>
        ))}
      </select>

      {trimmedNames.map((_, index) => (
        <div key={index}>
          <label htmlFor={`player-name-${index}`}>{defaultName(index)}</label>
          <input
            id={`player-name-${index}`}
            type="text"
            value={names[index]}
            onChange={(event) => handleNameChange(index, event.target.value)}
          />
        </div>
      ))}

      <button
        type="button"
        disabled={!canStart}
        onClick={() => onStart(trimmedNames)}
      >
        Rozpocznij grę
      </button>
    </div>
  );
}

export default StartScreen;
