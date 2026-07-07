import { useEffect, useRef } from 'react';
import type {
  DiceValue,
  GameState,
  PlayerScoreCard,
  ScoreCategory,
} from '@bronx-dice/game-engine';
import { requestBotMove } from './botClient';
import { buildRollDecisionPrompt, buildScoreDecisionPrompt } from './promptBuilder';
import { parseRollDecision, parseScoreDecision, type RollDecision } from './decision';
import { chooseHeuristicCategory } from './heuristic';
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

// Sentinel returned when even the heuristic fallback has nothing legal to do
// (only possible if the scorecard is already fully complete). This should
// never happen along any reachable code path in this app, but these
// functions must never throw/reject, so we surface it as "no-op" instead of
// letting the exception escape.
const NO_OP = Symbol('no-op');

async function getRollDecision(
  scoreCard: PlayerScoreCard,
  dice: DiceValue[],
  heldDice: boolean[],
  rollsLeft: number
): Promise<RollDecision | typeof NO_OP> {
  try {
    const prompt = buildRollDecisionPrompt(scoreCard, dice, heldDice, rollsLeft);
    const raw = await requestBotMove(prompt);
    const decision = parseRollDecision(raw, scoreCard);
    if (decision) {
      return decision;
    }
  } catch {
    // Any network/CLI/parse failure falls through to the heuristic below.
  }
  try {
    return { action: 'score', category: chooseHeuristicCategory(scoreCard, dice, rollsLeft) };
  } catch (error) {
    console.error(
      'useBotTurn: chooseHeuristicCategory threw with no legal category available; skipping this turn.',
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
    const prompt = buildScoreDecisionPrompt(scoreCard, dice, rollsLeft);
    const raw = await requestBotMove(prompt);
    const category = parseScoreDecision(raw, scoreCard);
    if (category) {
      return category;
    }
  } catch {
    // Any network/CLI/parse failure falls through to the heuristic below.
  }
  try {
    return chooseHeuristicCategory(scoreCard, dice, rollsLeft);
  } catch (error) {
    console.error(
      'useBotTurn: chooseHeuristicCategory threw with no legal category available; skipping this turn.',
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
}: UseBotTurnOptions): void {
  const lastHandledRef = useRef<string | null>(null);

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
      withDecisionWindow(DECISION_WINDOW_MS, () =>
        getRollDecision(scoreCard, dice, heldDice, rollsLeft)
      ).then((decision) => {
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
      withDecisionWindow(DECISION_WINDOW_MS, () =>
        getScoreDecision(scoreCard, dice, rollsLeft)
      ).then((category) => {
        if (category === NO_OP) {
          return;
        }
        onScore(category);
      });
    }
  }, [state, isRolling, botPlayerIds, enabled, onRoll, onToggleHeld, onScore]);
}
