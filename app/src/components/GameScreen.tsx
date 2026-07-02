import { useState } from 'react';
import { createGameState } from '../engine/gameState';
import {
  rollInTurn,
  toggleHeldDie,
  applyScore,
  isGameOver,
  getWinners,
} from '../engine/turn';
import type { GameState, ScoreCategory } from '../types/game';
import DiceTray from './DiceTray';
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
        onRoll={() => setState((current) => rollInTurn(current))}
      />
      <ScoreBoard
        players={state.players}
        scoreCards={state.scoreCards}
        currentPlayerId={currentPlayer.id}
        dice={state.dice}
        rollsLeft={state.rollsLeft}
        onScore={(category: ScoreCategory) =>
          setState((current) => applyScore(current, category))
        }
      />
    </div>
  );
}

export default GameScreen;
