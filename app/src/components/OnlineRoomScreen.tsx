import { useEffect, useRef, type ReactNode } from 'react';
import { getWinners } from '@bronx-dice/game-engine';
import RoomLobbyScreen from './RoomLobbyScreen';
import OnlineGameScreen from './OnlineGameScreen';
import WinnerScreen from './WinnerScreen';
import ConnectionBanner from './ConnectionBanner';
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
  const { room, loading, notFound, disconnected } = useRoom(roomId);
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

  let content: ReactNode;
  if (loading || !room) {
    content = <p>Ładowanie…</p>;
  } else if (room.phase === 'lobby') {
    content = <RoomLobbyScreen room={room} roomId={roomId} ownUid={ownUid} onLeft={onLeft} />;
  } else if (room.phase === 'playing') {
    content = <OnlineGameScreen room={room} roomId={roomId} ownUid={ownUid} onExit={onLeft} />;
  } else {
    const isHost = room.hostId === ownUid;
    content = (
      <WinnerScreen
        winners={getWinners(room)}
        players={room.players}
        scoreCards={room.scoreCards}
        onPlayAgain={isHost ? () => { void returnToLobby(roomId); } : undefined}
        onExit={onLeft}
      />
    );
  }

  return (
    <>
      <ConnectionBanner visible={disconnected} />
      {content}
    </>
  );
}

export default OnlineRoomScreen;
