// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  createGameState,
  UPPER_CATEGORIES,
  LOWER_CATEGORIES,
  type DiceValue,
  type GameState,
  type PlayerScoreCard,
} from '@bronx-dice/game-engine';
import * as gameEngine from '@bronx-dice/game-engine';
import { useBotTurn, DECISION_WINDOW_MS, HOLD_PAUSE_MS } from './useBotTurn';

vi.mock('@bronx-dice/game-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@bronx-dice/game-engine')>();
  return {
    ...actual,
    chooseBotRollDecision: vi.fn(),
    chooseBotScoreDecision: vi.fn(),
  };
});

function makeState(overrides: Partial<GameState> = {}): GameState {
  return { ...createGameState(['Human', 'Bot']), ...overrides };
}

// A scorecard with every category already filled in, so the EV engine has no
// legal category left and throws.
function makeFullScoreCard(): PlayerScoreCard {
  return {
    upper: Object.fromEntries(UPPER_CATEGORIES.map((category) => [category, 0])) as PlayerScoreCard['upper'],
    lower: Object.fromEntries(LOWER_CATEGORIES.map((category) => [category, 0])) as PlayerScoreCard['lower'],
  };
}

const BOT_IDS = new Set(['player-2']);

describe('useBotTurn', () => {
  afterEach(() => {
    vi.mocked(gameEngine.chooseBotRollDecision).mockReset();
    vi.mocked(gameEngine.chooseBotScoreDecision).mockReset();
    vi.useRealTimers();
  });

  it('auto-rolls at the start of a bot turn without asking the EV engine', () => {
    const onRoll = vi.fn();
    const state = makeState({ currentPlayerIndex: 1 });

    const { result } = renderHook(() =>
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
    expect(gameEngine.chooseBotRollDecision).not.toHaveBeenCalled();
    expect(result.current).toBe(false);
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
    vi.mocked(gameEngine.chooseBotRollDecision).mockReturnValue({
      action: 'reroll',
      hold: [true, true, true, false, false],
    });

    const { result } = renderHook(() =>
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

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DECISION_WINDOW_MS + HOLD_PAUSE_MS + 50);
    });

    expect(gameEngine.chooseBotRollDecision).toHaveBeenCalledWith(
      state.scoreCards['player-2'],
      dice,
      2
    );
    expect(onToggleHeld).toHaveBeenCalledWith(0);
    expect(onToggleHeld).toHaveBeenCalledWith(1);
    expect(onToggleHeld).toHaveBeenCalledWith(2);
    expect(onToggleHeld).not.toHaveBeenCalledWith(3);
    expect(onToggleHeld).not.toHaveBeenCalledWith(4);
    expect(onRoll).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(false);
  });

  it('sets isThinking to true for the decision window, then false once it elapses', async () => {
    vi.useFakeTimers();
    const onToggleHeld = vi.fn();
    const onRoll = vi.fn();
    const dice: DiceValue[] = [1, 1, 1, 4, 5];
    const heldDice = [false, false, false, false, false];
    const state = makeState({ currentPlayerIndex: 1, dice, heldDice, rollsLeft: 2 });
    vi.mocked(gameEngine.chooseBotRollDecision).mockReturnValue({
      action: 'reroll',
      hold: [true, true, true, false, false],
    });

    const { result } = renderHook(() =>
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

    // The artificial decision window is still running, even though the
    // (synchronous, mocked) EV computation itself already resolved.
    expect(result.current).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DECISION_WINDOW_MS + HOLD_PAUSE_MS + 50);
    });

    expect(onRoll).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(false);
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
    vi.mocked(gameEngine.chooseBotRollDecision).mockReturnValue({
      action: 'score',
      category: 'fives',
    });

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
    vi.mocked(gameEngine.chooseBotScoreDecision).mockReturnValue('sixes');

    const { result } = renderHook(() =>
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

    expect(result.current).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DECISION_WINDOW_MS + 50);
    });

    expect(gameEngine.chooseBotScoreDecision).toHaveBeenCalledWith(
      state.scoreCards['player-2'],
      dice,
      0
    );
    expect(onScore).toHaveBeenCalledWith('sixes');
    expect(result.current).toBe(false);
  });

  it('does nothing (no onRoll/onToggleHeld/onScore, no unhandled rejection) when the EV engine has no legal category during a reroll decision', async () => {
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
    vi.mocked(gameEngine.chooseBotRollDecision).mockImplementation(() => {
      throw new Error('No scorable category available');
    });

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
    await Promise.resolve();
    await Promise.resolve();

    expect(onScore).not.toHaveBeenCalled();
    expect(onToggleHeld).not.toHaveBeenCalled();
    expect(onRoll).not.toHaveBeenCalled();
    expect(unhandledRejections).toEqual([]);

    process.off('unhandledRejection', onUnhandledRejection);
    consoleErrorSpy.mockRestore();
  });

  it('does nothing (no onScore, no unhandled rejection) when the EV engine has no legal category during a forced score decision', async () => {
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
    vi.mocked(gameEngine.chooseBotScoreDecision).mockImplementation(() => {
      throw new Error('No scorable category available');
    });

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
