import { useEffect, useRef } from 'react';
import { getWinners } from '@bronx-dice/game-engine';
import RoomLobbyScreen from './RoomLobbyScreen';
import OnlineGameScreen from './OnlineGameScreen';
import WinnerScreen from './WinnerScreen';
import { useRoom } from '../hooks/useRoom';
import { usePresenceHeartbeat } from '../hooks/usePresenceHeartbeat';
import { returnToLobby } from '../services/roomService';
import { playSound } from '../utils/sound';

interface OnlineRoomScreenProps {
  roomId: string;
  ownUid: string;
  onLeft: () => void;
}

function OnlineRoomScreen({ roomId, ownUid, onLeft }: OnlineRoomScreenProps) {
  const { room, loading, notFound } = useRoom(roomId);
  usePresenceHeartbeat(roomId);
  const previousPhaseRef = useRef<string | null>(null);

  useEffect(() => {
    if (notFound) {
      onLeft();
    }
  }, [notFound, onLeft]);

  // Plays for every connected player the moment the host starts the game —
  // gated on the actual lobby->playing transition (not on mount), so joining
  // or refreshing mid-game never replays it.
  useEffect(() => {
    const phase = room?.phase ?? null;
    if (previousPhaseRef.current === 'lobby' && phase === 'playing') {
      playSound('start-game');
    }
    previousPhaseRef.current = phase;
  }, [room?.phase]);

  if (notFound) {
    return null;
  }

  if (loading || !room) {
    return <p>Ładowanie…</p>;
  }

  if (room.phase === 'lobby') {
    return <RoomLobbyScreen room={room} roomId={roomId} ownUid={ownUid} onLeft={onLeft} />;
  }

  if (room.phase === 'playing') {
    return <OnlineGameScreen room={room} roomId={roomId} ownUid={ownUid} onExit={onLeft} />;
  }

  const isHost = room.hostId === ownUid;
  return (
    <WinnerScreen
      winners={getWinners(room)}
      players={room.players}
      scoreCards={room.scoreCards}
      onPlayAgain={isHost ? () => { void returnToLobby(roomId); } : undefined}
      onExit={onLeft}
    />
  );
}

export default OnlineRoomScreen;
