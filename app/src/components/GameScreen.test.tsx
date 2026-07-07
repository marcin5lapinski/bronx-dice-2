// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from 'firebase/auth';
import { UPPER_CATEGORIES, LOWER_CATEGORIES } from '@bronx-dice/game-engine';
import GameScreen from './GameScreen';
import { useAuth } from '../contexts/AuthContext';
import { recordLocalGameResult } from '../services/statsService';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../services/statsService', () => ({
  recordLocalGameResult: vi.fn(),
}));

vi.mock('../bot/botClient', () => ({
  requestBotMove: vi.fn(),
}));

// The engine enforces MIN_PLAYERS = 2 (createGameState throws below that),
// so these tests use 2 players even though only player 0's result matters.
// Every roll is mocked to always show [1,1,1,1,1] (Math.random -> 0), and
// both players fill categories via "click the first available button" in
// the same order, so they end up with identical scorecards — a tie, which
// getWinners() (and this feature's "a tie counts as a win" rule) reports as
// both players winning. That's why accountPlayerIndex 0's result is always
// `won: true` below. With 2 players alternating turns, the game needs
// (UPPER_CATEGORIES.length + LOWER_CATEGORIES.length) * playerCount turns
// total to fill every category for every player.
async function playGameToCompletion(playerCount: number) {
  const totalTurns = (UPPER_CATEGORIES.length + LOWER_CATEGORIES.length) * playerCount;
  for (let turn = 0; turn < totalTurns; turn++) {
    fireEvent.click(screen.getByRole('button', { name: 'Rzuć kośćmi' }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const scoreButtons = document.querySelectorAll('.score-board tbody button');
    fireEvent.click(scoreButtons[0]);
  }
}

describe('GameScreen', () => {
  beforeEach(() => {
    // vi.restoreAllMocks() (below, in afterEach) only restores vi.spyOn
    // spies to their original implementation — it does NOT clear call
    // history on a plain vi.fn() like this module mock, so without an
    // explicit mockClear() here, recordLocalGameResult's calls from one
    // test leak into the next test's assertions.
    vi.mocked(recordLocalGameResult).mockClear();
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      profile: null,
      loading: false,
      refreshProfile: vi.fn(),
    });
    vi.mocked(recordLocalGameResult).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('rolls dice and displays the results when the roll button is clicked', async () => {
    const user = userEvent.setup();
    vi.spyOn(Math, 'random').mockReturnValue(0); // every die shows 1
    render(
      <GameScreen
        playerNames={['Ola', 'Kuba']}
        accountPlayerIndex={null}
        onPlayAgain={() => {}}
        onExit={() => {}}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Rzuć kośćmi' }));

    expect(screen.getByText('Pozostałe rzuty: 2')).toBeInTheDocument();
    // The real result is masked behind a placeholder face while the dice
    // are mid-animation...
    expect(screen.getAllByRole('button', { name: '5' })).toHaveLength(5);

    // ...and revealed once the roll animation settles.
    await waitFor(
      () =>
        expect(screen.getAllByRole('button', { name: '1' })).toHaveLength(5),
      { timeout: 2000 }
    );
  });

  it('hides the score board preview while the roll animation is in progress', async () => {
    const user = userEvent.setup();
    vi.spyOn(Math, 'random').mockReturnValue(0); // every die = 1 -> aces score = 5
    render(
      <GameScreen
        playerNames={['Ola', 'Kuba']}
        accountPlayerIndex={null}
        onPlayAgain={() => {}}
        onExit={() => {}}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Rzuć kośćmi' }));

    const row = screen.getByText('Jedynki').closest('tr')!;
    expect(row.querySelector('button')).not.toBeInTheDocument();
  });

  it('scoring a category records it on the board and advances to the next player', async () => {
    const user = userEvent.setup();
    vi.spyOn(Math, 'random').mockReturnValue(0); // every die = 1 -> aces score = 5
    render(
      <GameScreen
        playerNames={['Ola', 'Kuba']}
        accountPlayerIndex={null}
        onPlayAgain={() => {}}
        onExit={() => {}}
      />
    );

    expect(screen.getByText('Tura: Ola')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Rzuć kośćmi' }));
    const row = screen.getByText('Jedynki').closest('tr')!;
    await waitFor(
      () => expect(row.querySelector('button')).toBeInTheDocument(),
      { timeout: 2000 }
    );
    await user.click(row.querySelector('button')!);

    expect(row).toHaveTextContent('5');
    expect(screen.getByText('Tura: Kuba')).toBeInTheDocument();
  });

  it('calls onExit after confirming when the exit button is clicked', async () => {
    const user = userEvent.setup();
    const onExit = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <GameScreen
        playerNames={['Ola', 'Kuba']}
        accountPlayerIndex={null}
        onPlayAgain={() => {}}
        onExit={onExit}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Wyjdź z gry' }));

    expect(window.confirm).toHaveBeenCalled();
    expect(onExit).toHaveBeenCalled();
  });

  it('does not call onExit when the exit confirmation is declined', async () => {
    const user = userEvent.setup();
    const onExit = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <GameScreen
        playerNames={['Ola', 'Kuba']}
        accountPlayerIndex={null}
        onPlayAgain={() => {}}
        onExit={onExit}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Wyjdź z gry' }));

    expect(onExit).not.toHaveBeenCalled();
  });

  it("records the account player's result once the game ends, when logged in with a tracked slot", async () => {
    vi.useFakeTimers();
    vi.mocked(useAuth).mockReturnValue({
      user: { uid: 'uid-1' } as User,
      profile: null,
      loading: false,
      refreshProfile: vi.fn(),
    });
    vi.spyOn(Math, 'random').mockReturnValue(0);

    render(
      <GameScreen
        playerNames={['Ola', 'Kuba']}
        accountPlayerIndex={0}
        onPlayAgain={() => {}}
        onExit={() => {}}
      />
    );

    await playGameToCompletion(2);

    expect(recordLocalGameResult).toHaveBeenCalledTimes(1);
    expect(recordLocalGameResult).toHaveBeenCalledWith(
      'uid-1',
      expect.objectContaining({ won: true })
    );
  });

  it('does not record a result when accountPlayerIndex is null', async () => {
    vi.useFakeTimers();
    vi.mocked(useAuth).mockReturnValue({
      user: { uid: 'uid-1' } as User,
      profile: null,
      loading: false,
      refreshProfile: vi.fn(),
    });
    vi.spyOn(Math, 'random').mockReturnValue(0);

    render(
      <GameScreen
        playerNames={['Ola', 'Kuba']}
        accountPlayerIndex={null}
        onPlayAgain={() => {}}
        onExit={() => {}}
      />
    );

    await playGameToCompletion(2);

    expect(recordLocalGameResult).not.toHaveBeenCalled();
  });

  it('does not record a result when signed out, even with a tracked slot', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);

    render(
      <GameScreen
        playerNames={['Ola', 'Kuba']}
        accountPlayerIndex={0}
        onPlayAgain={() => {}}
        onExit={() => {}}
      />
    );

    await playGameToCompletion(2);

    expect(recordLocalGameResult).not.toHaveBeenCalled();
  });

  it('auto-plays a bot turn: rolls, decides, and scores without any clicks', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0); // every die shows 1
    const { requestBotMove } = await import('../bot/botClient');
    let resolveBotMove!: (value: { action: 'score'; category: 'aces' }) => void;
    vi.mocked(requestBotMove).mockReturnValue(
      new Promise((resolve) => {
        resolveBotMove = resolve;
      })
    );

    render(
      <GameScreen
        playerNames={['Ola', 'Kuba']}
        botFlags={[false, true]}
        accountPlayerIndex={null}
        onPlayAgain={() => {}}
        onExit={() => {}}
      />
    );

    expect(screen.getByText('Tura: Ola')).toBeInTheDocument();

    // Ola (human) takes her turn manually and scores the first open category,
    // handing the turn to Kuba, the bot.
    fireEvent.click(screen.getByRole('button', { name: 'Rzuć kośćmi' }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.click(document.querySelectorAll('.score-board tbody button')[0]);

    expect(screen.getByText('Tura: Kuba 🤖')).toBeInTheDocument();

    // Kuba's turn now auto-rolls, then its roll animation settles, then it
    // asks the (mocked, still-pending) bot server for a decision. While that
    // request is in flight, the roll button should show the "bot is
    // thinking" pending-glow indicator — the whole point of this feature is
    // that the bot appears to be thinking rather than the board looking
    // frozen.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000); // auto-roll + roll animation
    });

    expect(screen.getByRole('button', { name: 'Rzuć kośćmi' })).toHaveClass(
      'pending-glow'
    );

    resolveBotMove({ action: 'score', category: 'aces' });

    // Kuba's turn should now play out on its own: decision window and score
    // — with nobody clicking anything. Each hop of the bot's async chain
    // (state update -> effect -> promise -> timer -> state update -> ...)
    // needs its own `act` boundary to flush React's passive effects, so a
    // single big `advanceTimersByTimeAsync` call isn't enough here — advance
    // in small steps, stopping once the turn hands back to Ola.
    for (
      let i = 0;
      i < 30 && screen.queryByText('Tura: Ola') === null;
      i++
    ) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
    }

    expect(screen.getByText('Tura: Ola')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rzuć kośćmi' })).not.toHaveClass(
      'pending-glow'
    );
  });

  it('does not let a human click for the bot during its turn', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { requestBotMove } = await import('../bot/botClient');
    vi.mocked(requestBotMove).mockResolvedValue({ action: 'score', category: 'aces' });

    render(
      <GameScreen
        playerNames={['Ola', 'Kuba']}
        botFlags={[true, false]}
        accountPlayerIndex={null}
        onPlayAgain={() => {}}
        onExit={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: 'Rzuć kośćmi' })).toBeDisabled();
  });
});
