// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  createGameState,
  UPPER_CATEGORIES,
  LOWER_CATEGORIES,
  type DiceValue,
  type GameState,
  type PlayerScoreCard,
} from '@bronx-dice/game-engine';
import { useBotTurn, DECISION_WINDOW_MS, HOLD_PAUSE_MS } from './useBotTurn';
import { requestBotMove } from './botClient';
import { chooseHeuristicCategory } from './heuristic';

vi.mock('./botClient', () => ({
  requestBotMove: vi.fn(),
}));

function makeState(overrides: Partial<GameState> = {}): GameState {
  return { ...createGameState(['Human', 'Bot']), ...overrides };
}

// A scorecard with every category already filled in, so that
// chooseHeuristicCategory has no legal category left and throws.
function makeFullScoreCard(): PlayerScoreCard {
  return {
    upper: Object.fromEntries(UPPER_CATEGORIES.map((category) => [category, 0])) as PlayerScoreCard['upper'],
    lower: Object.fromEntries(LOWER_CATEGORIES.map((category) => [category, 0])) as PlayerScoreCard['lower'],
  };
}

const BOT_IDS = new Set(['player-2']);

describe('useBotTurn', () => {
  afterEach(() => {
    vi.mocked(requestBotMove).mockReset();
    vi.useRealTimers();
  });

  it('auto-rolls at the start of a bot turn without asking the bot server', () => {
    const onRoll = vi.fn();
    const state = makeState({ currentPlayerIndex: 1 });

    renderHook(() =>
      useBotTurn({
        state,
        isRolling: false,
        botPlayerIds: BOT_IDS,
        enabled: true,
        onRoll,
        onToggleHeld: vi.fn(),
        onScore: vi.fn(),
      })
    );

    expect(onRoll).toHaveBeenCalledTimes(1);
    expect(requestBotMove).not.toHaveBeenCalled();
  });

  it('does nothing while the roll animation is in progress', () => {
    const onRoll = vi.fn();
    const state = makeState({ currentPlayerIndex: 1 });

    renderHook(() =>
      useBotTurn({
        state,
        isRolling: true,
        botPlayerIds: BOT_IDS,
        enabled: true,
        onRoll,
        onToggleHeld: vi.fn(),
        onScore: vi.fn(),
      })
    );

    expect(onRoll).not.toHaveBeenCalled();
  });

  it('does nothing on a human turn', () => {
    const onRoll = vi.fn();
    const state = makeState({ currentPlayerIndex: 0 });

    renderHook(() =>
      useBotTurn({
        state,
        isRolling: false,
        botPlayerIds: BOT_IDS,
        enabled: true,
        onRoll,
        onToggleHeld: vi.fn(),
        onScore: vi.fn(),
      })
    );

    expect(onRoll).not.toHaveBeenCalled();
  });

  it('does nothing once the game is over (enabled=false), even mid-bot-turn', () => {
    const onRoll = vi.fn();
    const state = makeState({ currentPlayerIndex: 1 });

    renderHook(() =>
      useBotTurn({
        state,
        isRolling: false,
        botPlayerIds: BOT_IDS,
        enabled: false,
        onRoll,
        onToggleHeld: vi.fn(),
        onScore: vi.fn(),
      })
    );

    expect(onRoll).not.toHaveBeenCalled();
  });

  it('does not re-roll twice for the exact same state (e.g. StrictMode double-render)', () => {
    const onRoll = vi.fn();
    const state = makeState({ currentPlayerIndex: 1 });

    const { rerender } = renderHook(
      (props: { state: GameState }) =>
        useBotTurn({
          state: props.state,
          isRolling: false,
          botPlayerIds: BOT_IDS,
          enabled: true,
          onRoll,
          onToggleHeld: vi.fn(),
          onScore: vi.fn(),
        }),
      { initialProps: { state } }
    );
    rerender({ state: { ...state } });

    expect(onRoll).toHaveBeenCalledTimes(1);
  });

  it('applies a reroll decision: toggles the right dice, then rolls again', async () => {
    vi.useFakeTimers();
    const onToggleHeld = vi.fn();
    const onRoll = vi.fn();
    const dice: DiceValue[] = [1, 1, 1, 4, 5];
    const heldDice = [false, false, false, false, false];
    const state = makeState({ currentPlayerIndex: 1, dice, heldDice, rollsLeft: 2 });
    vi.mocked(requestBotMove).mockResolvedValue({
      action: 'reroll',
      hold: [true, true, true, false, false],
    });

    renderHook(() =>
      useBotTurn({
        state,
        isRolling: false,
        botPlayerIds: BOT_IDS,
        enabled: true,
        onRoll,
        onToggleHeld,
        onScore: vi.fn(),
      })
    );

    await vi.advanceTimersByTimeAsync(DECISION_WINDOW_MS + HOLD_PAUSE_MS + 50);

    expect(onToggleHeld).toHaveBeenCalledWith(0);
    expect(onToggleHeld).toHaveBeenCalledWith(1);
    expect(onToggleHeld).toHaveBeenCalledWith(2);
    expect(onToggleHeld).not.toHaveBeenCalledWith(3);
    expect(onToggleHeld).not.toHaveBeenCalledWith(4);
    expect(onRoll).toHaveBeenCalledTimes(1);
  });

  it('applies a score decision when the roll decision says to stop', async () => {
    vi.useFakeTimers();
    const onScore = vi.fn();
    const dice: DiceValue[] = [1, 1, 1, 4, 5];
    const state = makeState({
      currentPlayerIndex: 1,
      dice,
      heldDice: [false, false, false, false, false],
      rollsLeft: 2,
    });
    vi.mocked(requestBotMove).mockResolvedValue({ action: 'score', category: 'fives' });

    renderHook(() =>
      useBotTurn({
        state,
        isRolling: false,
        botPlayerIds: BOT_IDS,
        enabled: true,
        onRoll: vi.fn(),
        onToggleHeld: vi.fn(),
        onScore,
      })
    );

    await vi.advanceTimersByTimeAsync(DECISION_WINDOW_MS + 50);

    expect(onScore).toHaveBeenCalledWith('fives');
  });

  it('forces a category choice when rollsLeft is 0', async () => {
    vi.useFakeTimers();
    const onScore = vi.fn();
    const dice: DiceValue[] = [6, 6, 6, 6, 6];
    const state = makeState({
      currentPlayerIndex: 1,
      dice,
      heldDice: [true, true, true, true, true],
      rollsLeft: 0,
    });
    vi.mocked(requestBotMove).mockResolvedValue({ category: 'sixes' });

    renderHook(() =>
      useBotTurn({
        state,
        isRolling: false,
        botPlayerIds: BOT_IDS,
        enabled: true,
        onRoll: vi.fn(),
        onToggleHeld: vi.fn(),
        onScore,
      })
    );

    await vi.advanceTimersByTimeAsync(DECISION_WINDOW_MS + 50);

    expect(onScore).toHaveBeenCalledWith('sixes');
  });

  it('falls back to the heuristic when the bot server call fails', async () => {
    vi.useFakeTimers();
    const onScore = vi.fn();
    const dice: DiceValue[] = [1, 1, 1, 4, 5];
    const state = makeState({
      currentPlayerIndex: 1,
      dice,
      heldDice: [false, false, false, false, false],
      rollsLeft: 2,
    });
    vi.mocked(requestBotMove).mockRejectedValue(new Error('network down'));
    const expectedCategory = chooseHeuristicCategory(
      state.scoreCards['player-2'],
      dice,
      2
    );

    renderHook(() =>
      useBotTurn({
        state,
        isRolling: false,
        botPlayerIds: BOT_IDS,
        enabled: true,
        onRoll: vi.fn(),
        onToggleHeld: vi.fn(),
        onScore,
      })
    );

    await vi.advanceTimersByTimeAsync(DECISION_WINDOW_MS + 50);

    expect(onScore).toHaveBeenCalledWith(expectedCategory);
  });

  it('does nothing (no onRoll/onToggleHeld/onScore, no unhandled rejection) when both the bot server and the heuristic fallback fail during a reroll decision', async () => {
    vi.useFakeTimers();
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason);
    process.on('unhandledRejection', onUnhandledRejection);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const onScore = vi.fn();
    const onToggleHeld = vi.fn();
    const onRoll = vi.fn();
    const dice: DiceValue[] = [1, 1, 1, 4, 5];
    const fullScoreCard = makeFullScoreCard();
    const state = makeState({
      currentPlayerIndex: 1,
      dice,
      heldDice: [false, false, false, false, false],
      rollsLeft: 2,
      scoreCards: { 'player-1': fullScoreCard, 'player-2': fullScoreCard },
    });
    vi.mocked(requestBotMove).mockRejectedValue(new Error('network down'));

    renderHook(() =>
      useBotTurn({
        state,
        isRolling: false,
        botPlayerIds: BOT_IDS,
        enabled: true,
        onRoll,
        onToggleHeld,
        onScore,
      })
    );

    await vi.advanceTimersByTimeAsync(DECISION_WINDOW_MS + HOLD_PAUSE_MS + 50);
    // Flush any microtasks that would surface an unhandled rejection.
    await Promise.resolve();
    await Promise.resolve();

    expect(onScore).not.toHaveBeenCalled();
    expect(onToggleHeld).not.toHaveBeenCalled();
    expect(onRoll).not.toHaveBeenCalled();
    expect(unhandledRejections).toEqual([]);

    process.off('unhandledRejection', onUnhandledRejection);
    consoleErrorSpy.mockRestore();
  });

  it('does nothing (no onScore, no unhandled rejection) when both the bot server and the heuristic fallback fail during a forced score decision', async () => {
    vi.useFakeTimers();
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason);
    process.on('unhandledRejection', onUnhandledRejection);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const onScore = vi.fn();
    const dice: DiceValue[] = [6, 6, 6, 6, 6];
    const fullScoreCard = makeFullScoreCard();
    const state = makeState({
      currentPlayerIndex: 1,
      dice,
      heldDice: [true, true, true, true, true],
      rollsLeft: 0,
      scoreCards: { 'player-1': fullScoreCard, 'player-2': fullScoreCard },
    });
    vi.mocked(requestBotMove).mockRejectedValue(new Error('network down'));

    renderHook(() =>
      useBotTurn({
        state,
        isRolling: false,
        botPlayerIds: BOT_IDS,
        enabled: true,
        onRoll: vi.fn(),
        onToggleHeld: vi.fn(),
        onScore,
      })
    );

    await vi.advanceTimersByTimeAsync(DECISION_WINDOW_MS + 50);
    await Promise.resolve();
    await Promise.resolve();

    expect(onScore).not.toHaveBeenCalled();
    expect(unhandledRejections).toEqual([]);

    process.off('unhandledRejection', onUnhandledRejection);
    consoleErrorSpy.mockRestore();
  });
});
