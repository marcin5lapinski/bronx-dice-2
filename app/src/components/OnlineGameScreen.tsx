import { useEffect, useRef } from 'react';
import type { ScoreCategory } from '@bronx-dice/game-engine';
import DiceTray from './DiceTray';
import RollButton from './RollButton';
import ScoreBoard from './ScoreBoard';
import { avatarSrc } from './avatarOptions';
import { useCountdown } from '../hooks/useCountdown';
import {
  rollDice,
  toggleHeldDie,
  scoreCategory,
  handleTurnTimeout,
} from '../services/roomService';
import type { RoomDocument, RoomPlayer } from '../types/room';

interface OnlineGameScreenProps {
  room: Extract<RoomDocument, { phase: 'playing' }>;
  roomId: string;
  ownUid: string;
}

function OnlineGameScreen({ room, roomId, ownUid }: OnlineGameScreenProps) {
  const currentPlayer = room.players[room.currentPlayerIndex] as RoomPlayer;
  const isOwnTurn = currentPlayer.id === ownUid;
  const remainingSeconds = useCountdown(room.turnStartedAt, room.turnTimeLimitSeconds);
  const timeoutFiredForTurn = useRef<number | null>(null);

  useEffect(() => {
    if (remainingSeconds > 0) {
      return;
    }
    if (timeoutFiredForTurn.current === room.currentPlayerIndex) {
      return;
    }
    timeoutFiredForTurn.current = room.currentPlayerIndex;
    handleTurnTimeout(roomId).catch(() => {
      // Expected when another connected player's client already handled
      // this timeout first — the server rejects the now-stale attempt.
    });
  }, [remainingSeconds, room.currentPlayerIndex, roomId]);

  return (
    <div className="online-game-screen">
      <h2>
        Tura: {currentPlayer.name}
        <img className="online-turn-avatar" src={avatarSrc(currentPlayer.avatarId)} alt="" />
      </h2>
      <p className="online-turn-countdown">Pozostały czas: {remainingSeconds}s</p>
      <DiceTray
        dice={room.dice}
        heldDice={room.heldDice}
        interactive={isOwnTurn}
        onToggleHeld={(index) => {
          void toggleHeldDie(roomId, index);
        }}
      />
      <RollButton
        rollsLeft={room.rollsLeft}
        interactive={isOwnTurn}
        onRoll={() => {
          void rollDice(roomId);
        }}
      />
      <ScoreBoard
        players={room.players}
        scoreCards={room.scoreCards}
        currentPlayerId={currentPlayer.id}
        dice={room.dice}
        rollsLeft={room.rollsLeft}
        interactive={isOwnTurn}
        onScore={(category: ScoreCategory) => {
          void scoreCategory(roomId, category);
        }}
      />
    </div>
  );
}

export default OnlineGameScreen;
