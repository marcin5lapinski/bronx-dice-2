import { useEffect, useState } from 'react';
import {
  createGameState,
  rollInTurn,
  toggleHeldDie,
  applyScore,
  isGameOver,
  getWinners,
  type GameState,
  type ScoreCategory,
} from '@bronx-dice/game-engine';
import DiceTray, { ROLL_ANIMATION_MS } from './DiceTray';
import RollButton from './RollButton';
import ScoreBoard from './ScoreBoard';
import WinnerScreen from './WinnerScreen';

interface GameScreenProps {
  playerNames: string[];
  onPlayAgain: () => void;
}

function GameScreen({ playerNames, onPlayAgain }: GameScreenProps) {
  const [state, setState] = useState<GameState>(() =>
    createGameState(playerNames)
  );
  // While true, the dice are still mid-animation: ScoreBoard's clickable
  // score previews are hidden so the player can't read the roll's outcome
  // in the table before the dice visually settle.
  const [isRolling, setIsRolling] = useState(false);

  useEffect(() => {
    if (!isRolling) {
      return;
    }
    const timer = setTimeout(() => setIsRolling(false), ROLL_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [isRolling]);

  if (isGameOver(state)) {
    return (
      <WinnerScreen
        winners={getWinners(state)}
        scoreCards={state.scoreCards}
        onPlayAgain={onPlayAgain}
      />
    );
  }

  const currentPlayer = state.players[state.currentPlayerIndex];

  return (
    <div className="game-screen">
      <h2>Tura: {currentPlayer.name}</h2>
      <DiceTray
        dice={state.dice}
        heldDice={state.heldDice}
        onToggleHeld={(index) =>
          setState((current) => toggleHeldDie(current, index))
        }
      />
      <RollButton
        rollsLeft={state.rollsLeft}
        onRoll={() => {
          setState((current) => rollInTurn(current));
          setIsRolling(true);
        }}
      />
      <ScoreBoard
        players={state.players}
        scoreCards={state.scoreCards}
        currentPlayerId={currentPlayer.id}
        dice={isRolling ? [] : state.dice}
        rollsLeft={state.rollsLeft}
        onScore={(category: ScoreCategory) =>
          setState((current) => applyScore(current, category))
        }
      />
    </div>
  );
}

export default GameScreen;
