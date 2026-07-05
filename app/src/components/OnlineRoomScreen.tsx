import { useEffect } from 'react';
import { getWinners } from '@bronx-dice/game-engine';
import RoomLobbyScreen from './RoomLobbyScreen';
import OnlineGameScreen from './OnlineGameScreen';
import WinnerScreen from './WinnerScreen';
import { useRoom } from '../hooks/useRoom';

interface OnlineRoomScreenProps {
  roomId: string;
  ownUid: string;
  onLeft: () => void;
}

function OnlineRoomScreen({ roomId, ownUid, onLeft }: OnlineRoomScreenProps) {
  const { room, loading, notFound } = useRoom(roomId);

  useEffect(() => {
    if (notFound) {
      onLeft();
    }
  }, [notFound, onLeft]);

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

  return (
    <WinnerScreen
      winners={getWinners(room)}
      players={room.players}
      scoreCards={room.scoreCards}
      onPlayAgain={onLeft}
    />
  );
}

export default OnlineRoomScreen;
