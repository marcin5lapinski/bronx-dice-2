import { useEffect, useRef, useState } from 'react';
import {
  createGameState,
  rollInTurn,
  toggleHeldDie,
  applyScore,
  isGameOver,
  getWinners,
  calculateTotal,
  type GameState,
  type ScoreCategory,
} from '@bronx-dice/game-engine';
import DiceTray, { ROLL_ANIMATION_MS } from './DiceTray';
import RollButton from './RollButton';
import ScoreBoard from './ScoreBoard';
import WinnerScreen from './WinnerScreen';
import { useAuth } from '../contexts/AuthContext';
import { recordLocalGameResult } from '../services/statsService';
import { useBotTurn } from '../bot/useBotTurn';

interface GameScreenProps {
  playerNames: string[];
  botFlags?: boolean[];
  accountPlayerIndex: number | null;
  onPlayAgain: () => void;
  onExit: () => void;
}

function GameScreen({
  playerNames,
  botFlags = [],
  accountPlayerIndex,
  onPlayAgain,
  onExit,
}: GameScreenProps) {
  const { user } = useAuth();
  const [state, setState] = useState<GameState>(() =>
    createGameState(playerNames)
  );
  const botPlayerIds = new Set(
    state.players
      .filter((_, index) => botFlags[index] === true)
      .map((player) => player.id)
  );
  // While true, the dice are still mid-animation: ScoreBoard's clickable
  // score previews are hidden so the player can't read the roll's outcome
  // in the table before the dice visually settle.
  const [isRolling, setIsRolling] = useState(false);
  const resultRecorded = useRef(false);

  useEffect(() => {
    if (!isRolling) {
      return;
    }
    const timer = setTimeout(() => setIsRolling(false), ROLL_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [isRolling]);

  // Records the tracked account slot's result exactly once, the first time
  // the game ends. Best-effort: a failed write must never disrupt the
  // winner screen. Guarded by a ref (not just the isGameOver check) so
  // StrictMode's double-invoked effects in dev can't record it twice.
  useEffect(() => {
    if (!isGameOver(state) || resultRecorded.current) {
      return;
    }
    resultRecorded.current = true;
    if (accountPlayerIndex === null || !user) {
      return;
    }
    const player = state.players[accountPlayerIndex];
    if (!player) {
      return;
    }
    const score = calculateTotal(state.scoreCards[player.id]);
    const won = getWinners(state).some((winner) => winner.id === player.id);
    recordLocalGameResult(user.uid, { score, won }).catch(() => {
      // Best-effort — a failed write must never disrupt the winner screen.
    });
  }, [state, accountPlayerIndex, user]);

  const handleRoll = () => {
    setState((current) => rollInTurn(current));
    setIsRolling(true);
  };

  const handleToggleHeld = (index: number) => {
    setState((current) => toggleHeldDie(current, index));
  };

  const handleScore = (category: ScoreCategory) => {
    setState((current) => applyScore(current, category));
  };

  useBotTurn({
    state,
    isRolling,
    botPlayerIds,
    enabled: !isGameOver(state),
    onRoll: handleRoll,
    onToggleHeld: handleToggleHeld,
    onScore: handleScore,
  });

  if (isGameOver(state)) {
    return (
      <WinnerScreen
        winners={getWinners(state)}
        players={state.players}
        scoreCards={state.scoreCards}
        onPlayAgain={onPlayAgain}
      />
    );
  }

  const currentPlayer = state.players[state.currentPlayerIndex];
  const isBotTurn = botPlayerIds.has(currentPlayer.id);

  const handleExit = () => {
    if (window.confirm('Czy na pewno chcesz zakończyć grę?')) {
      onExit();
    }
  };

  return (
    <div className="game-screen">
      <button type="button" className="back-button" onClick={handleExit}>
        Wyjdź z gry
      </button>
      <h2>
        Tura: {currentPlayer.name}
        {isBotTurn ? ' 🤖' : ''}
      </h2>
      <DiceTray
        dice={state.dice}
        heldDice={state.heldDice}
        onToggleHeld={handleToggleHeld}
        interactive={!isBotTurn}
      />
      <RollButton rollsLeft={state.rollsLeft} onRoll={handleRoll} interactive={!isBotTurn} />
      <ScoreBoard
        players={state.players}
        scoreCards={state.scoreCards}
        currentPlayerId={currentPlayer.id}
        dice={isRolling ? [] : state.dice}
        rollsLeft={state.rollsLeft}
        interactive={!isBotTurn}
        botPlayerIds={botPlayerIds}
        onScore={handleScore}
      />
    </div>
  );
}

export default GameScreen;
