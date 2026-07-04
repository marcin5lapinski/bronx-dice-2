import { useState } from 'react';
import { createRoom, joinRoom } from '../services/roomService';

const PLAYER_COUNT_OPTIONS = [2, 3, 4, 5, 6];
const TURN_TIME_LIMIT_OPTIONS = [15, 30, 45, 60] as const;

interface OnlineMenuScreenProps {
  onRoomJoined: (roomId: string) => void;
  onOpenProfile: () => void;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Coś poszło nie tak. Spróbuj ponownie.';
}

function OnlineMenuScreen({ onRoomJoined, onOpenProfile }: OnlineMenuScreenProps) {
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [turnTimeLimitSeconds, setTurnTimeLimitSeconds] = useState<number>(30);
  const [roomCode, setRoomCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateRoom = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const roomId = await createRoom({ maxPlayers, turnTimeLimitSeconds });
      onRoomJoined(roomId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinRoom = async () => {
    const normalizedCode = roomCode.trim().toUpperCase();
    if (normalizedCode.length === 0) {
      setError('Podaj kod pokoju.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await joinRoom(normalizedCode);
      onRoomJoined(normalizedCode);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="online-menu-screen">
      <h1>Gra online</h1>
      {error && <p className="auth-error">{error}</p>}

      <section>
        <h2>Stwórz pokój</h2>
        <label htmlFor="online-max-players">Liczba graczy</label>
        <select
          id="online-max-players"
          value={maxPlayers}
          onChange={(event) => setMaxPlayers(Number(event.target.value))}
        >
          {PLAYER_COUNT_OPTIONS.map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </select>
        <label htmlFor="online-turn-time-limit">Limit czasu na turę</label>
        <select
          id="online-turn-time-limit"
          value={turnTimeLimitSeconds}
          onChange={(event) => setTurnTimeLimitSeconds(Number(event.target.value))}
        >
          {TURN_TIME_LIMIT_OPTIONS.map((seconds) => (
            <option key={seconds} value={seconds}>
              {seconds} s
            </option>
          ))}
        </select>
        <button type="button" disabled={submitting} onClick={handleCreateRoom}>
          Stwórz pokój
        </button>
      </section>

      <section>
        <h2>Dołącz kodem</h2>
        <label htmlFor="online-room-code">Kod pokoju</label>
        <input
          id="online-room-code"
          type="text"
          value={roomCode}
          onChange={(event) => setRoomCode(event.target.value)}
        />
        <button type="button" disabled={submitting} onClick={handleJoinRoom}>
          Dołącz
        </button>
      </section>

      <button type="button" onClick={onOpenProfile}>
        Profil
      </button>
    </div>
  );
}

export default OnlineMenuScreen;
