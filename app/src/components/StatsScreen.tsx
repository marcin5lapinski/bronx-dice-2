import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getStats, type GameStats } from '../services/statsService';

interface StatsScreenProps {
  onBack: () => void;
}

function formatDate(millis: number): string {
  return new Date(millis).toLocaleDateString('pl-PL');
}

interface StatsSectionProps {
  title: string;
  stats: GameStats | null;
}

function StatsSection({ title, stats }: StatsSectionProps) {
  return (
    <section>
      <h2>{title}</h2>
      {stats ? (
        <>
          <p>Liczba gier: {stats.gamesPlayed}</p>
          <p>Wygrane: {stats.wins}</p>
          <p>Średnia punktów: {stats.averageScore.toFixed(1)}</p>
          {stats.history.length > 0 ? (
            <ul className="stats-history">
              {stats.history.map((entry) => (
                <li key={entry.id}>
                  <span>{formatDate(entry.playedAt)}</span>
                  <span>{entry.score}</span>
                  <span>{entry.won ? 'Wygrana' : 'Przegrana'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>Brak rozegranych gier.</p>
          )}
        </>
      ) : (
        <p>Ładowanie…</p>
      )}
    </section>
  );
}

function StatsScreen({ onBack }: StatsScreenProps) {
  const { user } = useAuth();
  const [localStats, setLocalStats] = useState<GameStats | null>(null);
  const [onlineStats, setOnlineStats] = useState<GameStats | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }
    getStats(user.uid, 'local').then(setLocalStats);
    getStats(user.uid, 'online').then(setOnlineStats);
  }, [user]);

  return (
    <div className="auth-screen">
      <h1>Statystyki</h1>
      <StatsSection title="Lokalne" stats={localStats} />
      <StatsSection title="Online" stats={onlineStats} />
      <button type="button" className="back-button" onClick={onBack}>
        Wstecz
      </button>
    </div>
  );
}

export default StatsScreen;
