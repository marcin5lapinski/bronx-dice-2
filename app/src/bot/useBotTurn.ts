import { useEffect, useRef, useState } from 'react';
import {
  chooseBotRollDecision,
  chooseBotScoreDecision,
  type BotRollDecision,
  type DiceValue,
  type GameState,
  type PlayerScoreCard,
  type ScoreCategory,
} from '@bronx-dice/game-engine';
import { withDecisionWindow } from './timing';

export const DECISION_WINDOW_MS = 2500;
export const HOLD_PAUSE_MS = 400;

interface UseBotTurnOptions {
  state: GameState;
  isRolling: boolean;
  botPlayerIds: Set<string>;
  enabled: boolean;
  onRoll: () => void;
  onToggleHeld: (index: number) => void;
  onScore: (category: ScoreCategory) => void;
}

// Sentinel returned when the EV engine has no legal category available
// (only possible if the scorecard is already fully complete). This should
// never happen along any reachable code path in this app, but these
// functions must never throw/reject, so we surface it as "no-op" instead of
// letting the exception escape.
const NO_OP = Symbol('no-op');

async function getRollDecision(
  scoreCard: PlayerScoreCard,
  dice: DiceValue[],
  rollsLeft: number
): Promise<BotRollDecision | typeof NO_OP> {
  try {
    return chooseBotRollDecision(scoreCard, dice, rollsLeft);
  } catch (error) {
    console.error(
      'useBotTurn: chooseBotRollDecision threw with no legal category available; skipping this turn.',
      error
    );
    return NO_OP;
  }
}

async function getScoreDecision(
  scoreCard: PlayerScoreCard,
  dice: DiceValue[],
  rollsLeft: number
): Promise<ScoreCategory | typeof NO_OP> {
  try {
    return chooseBotScoreDecision(scoreCard, dice, rollsLeft);
  } catch (error) {
    console.error(
      'useBotTurn: chooseBotScoreDecision threw with no legal category available; skipping this turn.',
      error
    );
    return NO_OP;
  }
}

export function useBotTurn({
  state,
  isRolling,
  botPlayerIds,
  enabled,
  onRoll,
  onToggleHeld,
  onScore,
}: UseBotTurnOptions): boolean {
  const lastHandledRef = useRef<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);

  useEffect(() => {
    if (!enabled || isRolling) {
      return;
    }
    const currentPlayer = state.players[state.currentPlayerIndex];
    if (!botPlayerIds.has(currentPlayer.id)) {
      return;
    }

    const signature = `${currentPlayer.id}:${state.rollsLeft}:${state.dice.join(',')}`;
    if (lastHandledRef.current === signature) {
      return;
    }
    lastHandledRef.current = signature;

    if (state.dice.length === 0) {
      onRoll();
      return;
    }

    const scoreCard = state.scoreCards[currentPlayer.id];
    const { dice, heldDice, rollsLeft } = state;

    if (rollsLeft > 0) {
      setIsThinking(true);
      withDecisionWindow(DECISION_WINDOW_MS, () =>
        getRollDecision(scoreCard, dice, rollsLeft)
      ).then((decision) => {
        setIsThinking(false);
        if (decision === NO_OP) {
          return;
        }
        if (decision.action === 'score') {
          onScore(decision.category);
          return;
        }
        decision.hold.forEach((held, index) => {
          if (held !== heldDice[index]) {
            onToggleHeld(index);
          }
        });
        setTimeout(onRoll, HOLD_PAUSE_MS);
      });
    } else {
      setIsThinking(true);
      withDecisionWindow(DECISION_WINDOW_MS, () =>
        getScoreDecision(scoreCard, dice, rollsLeft)
      ).then((category) => {
        setIsThinking(false);
        if (category === NO_OP) {
          return;
        }
        onScore(category);
      });
    }
  }, [state, isRolling, botPlayerIds, enabled, onRoll, onToggleHeld, onScore]);

  return isThinking;
}
