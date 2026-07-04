import { useState } from 'react';
import { MIN_PLAYERS } from '@bronx-dice/game-engine';
import { avatarSrc } from './avatarOptions';
import { setReady, startGame, leaveRoom } from '../services/roomService';
import type { RoomDocument } from '../types/room';

interface RoomLobbyScreenProps {
  room: Extract<RoomDocument, { phase: 'lobby' }>;
  roomId: string;
  ownUid: string;
  onLeft: () => void;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Coś poszło nie tak. Spróbuj ponownie.';
}

function RoomLobbyScreen({ room, roomId, ownUid, onLeft }: RoomLobbyScreenProps) {
  const [error, setError] = useState<string | null>(null);
  const ownPlayer = room.players.find((player) => player.id === ownUid);
  const isHost = room.hostId === ownUid;
  const allReady = room.players.every((player) => player.ready);
  const canStart = isHost && allReady && room.players.length >= MIN_PLAYERS;

  const handleToggleReady = async () => {
    if (!ownPlayer) {
      return;
    }
    setError(null);
    try {
      await setReady(roomId, !ownPlayer.ready);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const handleStart = async () => {
    setError(null);
    try {
      await startGame(roomId);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const handleLeave = async () => {
    setError(null);
    try {
      await leaveRoom(roomId);
      onLeft();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="room-lobby-screen">
      <h1>Pokój {roomId}</h1>
      {error && <p className="auth-error">{error}</p>}
      <ul className="room-player-list">
        {room.players.map((player) => (
          <li key={player.id}>
            <img className="room-player-avatar" src={avatarSrc(player.avatarId)} alt="" />
            <span>{player.name}</span>
            {player.id === room.hostId && <span className="room-host-badge">Host</span>}
            <span>{player.ready ? 'Gotowy' : 'Niegotowy'}</span>
          </li>
        ))}
      </ul>
      {ownPlayer && (
        <button type="button" onClick={handleToggleReady}>
          {ownPlayer.ready ? 'Niegotowy' : 'Gotowy'}
        </button>
      )}
      {isHost && (
        <button type="button" disabled={!canStart} onClick={handleStart}>
          Rozpocznij grę
        </button>
      )}
      <button type="button" onClick={handleLeave}>
        Opuść pokój
      </button>
    </div>
  );
}

export default RoomLobbyScreen;
