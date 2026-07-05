import { useEffect, useMemo, useRef, useState } from 'react';
import type { ScoreCategory } from '@bronx-dice/game-engine';
import DiceTray, { ROLL_ANIMATION_MS } from './DiceTray';
import RollButton from './RollButton';
import ScoreBoard from './ScoreBoard';
import { avatarSrc } from './avatarOptions';
import { useCountdown } from '../hooks/useCountdown';
import { useNow } from '../hooks/useNow';
import { isPlayerInactive } from '../utils/presence';
import {
  rollDice,
  toggleHeldDie,
  scoreCategory,
  handleTurnTimeout,
  removeInactivePlayers,
  returnToLobby,
} from '../services/roomService';
import type { RoomDocument, RoomPlayer } from '../types/room';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Coś poszło nie tak. Spróbuj ponownie.';
}

interface OnlineGameScreenProps {
  room: Extract<RoomDocument, { phase: 'playing' }>;
  roomId: string;
  ownUid: string;
  onExit: () => void;
}

function OnlineGameScreen({ room, roomId, ownUid, onExit }: OnlineGameScreenProps) {
  const currentPlayer = room.players[room.currentPlayerIndex] as RoomPlayer;
  const isOwnTurn = currentPlayer.id === ownUid;
  const remainingSeconds = useCountdown(room.turnStartedAt, room.turnTimeLimitSeconds);
  const timeoutFiredForTurn = useRef<number | null>(null);
  const now = useNow();
  const [presenceError, setPresenceError] = useState<string | null>(null);

  // toggleHeldDie is a Cloud Function call: the click only becomes visible
  // once the round trip (call -> Firestore write -> our own snapshot
  // listener) completes. That's a full network latency the local hot-seat
  // mode never pays (there it's a synchronous setState). Held-die toggling
  // therefore optimistically flips the pressed die immediately, then
  // reconciles with (or reverts to) the server's own heldDice once it lands.
  const [optimisticHeldDice, setOptimisticHeldDice] = useState<boolean[] | null>(null);
  const displayedHeldDice = optimisticHeldDice ?? room.heldDice;

  useEffect(() => {
    setOptimisticHeldDice(null);
  }, [room.currentPlayerIndex]);

  useEffect(() => {
    if (optimisticHeldDice?.every((held, i) => held === room.heldDice[i])) {
      setOptimisticHeldDice(null);
    }
  }, [room.heldDice, optimisticHeldDice]);

  const isHost = room.hostId === ownUid;
  const otherPlayers = (room.players as RoomPlayer[]).filter((player) => player.id !== ownUid);
  const inactiveOthers = otherPlayers.filter((player) => isPlayerInactive(player.lastActiveAt, now));
  const canRemoveInactive = isHost && inactiveOthers.length > 0;
  const canAbort =
    isHost && otherPlayers.every((player) => isPlayerInactive(player.lastActiveAt, now));

  // Every Firestore snapshot deserializes a brand-new `room` object, so
  // `room.dice` gets a fresh array reference even when only `heldDice`
  // changed (e.g. toggling a held die). DiceTray's roll-animation effect
  // deliberately keys off the `dice` reference to avoid replaying on a
  // held-toggle, so we stabilize it here to only change when the dice
  // values themselves actually change.
  const diceKey = JSON.stringify(room.dice);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableDice = useMemo(() => room.dice, [diceKey]);

  // While true, the dice are still mid-animation: ScoreBoard's clickable
  // score previews are hidden so the player can't read the roll's outcome
  // in the table before the dice visually settle. Mirrors GameScreen's
  // local-mode isRolling flag; here it's driven by the stabilized dice
  // reference actually changing to a fresh 5-value roll, not a local click.
  const [isRolling, setIsRolling] = useState(false);

  useEffect(() => {
    if (stableDice.length !== 5) {
      return;
    }
    setIsRolling(true);
    const timer = setTimeout(() => setIsRolling(false), ROLL_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [stableDice]);

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

  const handleExit = () => {
    if (window.confirm('Czy na pewno chcesz opuścić grę? Twoje tury będą pomijane po czasie.')) {
      onExit();
    }
  };

  const handleRemoveInactive = () => {
    if (!window.confirm('Usunąć nieaktywnych graczy z rozgrywki?')) {
      return;
    }
    setPresenceError(null);
    removeInactivePlayers(roomId).catch((err: unknown) => setPresenceError(errorMessage(err)));
  };

  const handleToggleHeld = (index: number) => {
    const base = optimisticHeldDice ?? room.heldDice;
    setOptimisticHeldDice(base.map((held, i) => (i === index ? !held : held)));
    toggleHeldDie(roomId, index).catch(() => {
      setOptimisticHeldDice(null);
    });
  };

  const handleAbort = () => {
    if (!window.confirm('Przerwać rozgrywkę i wrócić do pokoju?')) {
      return;
    }
    setPresenceError(null);
    returnToLobby(roomId).catch((err: unknown) => setPresenceError(errorMessage(err)));
  };

  return (
    <div className="online-game-screen">
      <button type="button" className="back-button" onClick={handleExit}>
        Wyjdź z gry
      </button>
      {isHost && (
        <div className="host-presence-controls">
          <button type="button" disabled={!canRemoveInactive} onClick={handleRemoveInactive}>
            Usuń nieaktywnych graczy
          </button>
          <button type="button" disabled={!canAbort} onClick={handleAbort}>
            Przerwij grę i wróć do pokoju
          </button>
        </div>
      )}
      {presenceError && <p className="auth-error">{presenceError}</p>}
      <h2>
        Tura: {currentPlayer.name}
        <img className="online-turn-avatar" src={avatarSrc(currentPlayer.avatarId)} alt="" />
      </h2>
      <p className="online-turn-countdown">Pozostały czas: {remainingSeconds}s</p>
      <DiceTray
        dice={stableDice}
        heldDice={displayedHeldDice}
        interactive={isOwnTurn}
        onToggleHeld={handleToggleHeld}
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
        dice={isRolling ? [] : stableDice}
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
