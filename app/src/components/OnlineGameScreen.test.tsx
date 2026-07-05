// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createEmptyScoreCard } from '@bronx-dice/game-engine';
import OnlineGameScreen from './OnlineGameScreen';
import {
  rollDice,
  handleTurnTimeout,
  removeInactivePlayers,
  returnToLobby,
} from '../services/roomService';
import type { RoomDocument } from '../types/room';

vi.mock('../services/roomService', () => ({
  rollDice: vi.fn().mockResolvedValue(undefined),
  toggleHeldDie: vi.fn().mockResolvedValue(undefined),
  scoreCategory: vi.fn().mockResolvedValue(undefined),
  handleTurnTimeout: vi.fn().mockResolvedValue(undefined),
  removeInactivePlayers: vi.fn().mockResolvedValue(undefined),
  returnToLobby: vi.fn().mockResolvedValue(undefined),
}));

type PlayingRoom = Extract<RoomDocument, { phase: 'playing' }>;

function playingRoom(overrides: Partial<PlayingRoom> = {}): PlayingRoom {
  return {
    phase: 'playing',
    hostId: 'uid-1',
    maxPlayers: 2,
    turnTimeLimitSeconds: 30,
    turnStartedAt: { toMillis: () => Date.now() } as never,
    players: [
      {
        id: 'uid-1',
        name: 'Ola',
        avatarId: 'avatar01',
        ready: true,
        lastActiveAt: { toMillis: () => Date.now() } as never,
      },
      {
        id: 'uid-2',
        name: 'Kuba',
        avatarId: 'avatar02',
        ready: true,
        lastActiveAt: { toMillis: () => Date.now() } as never,
      },
    ],
    scoreCards: {
      'uid-1': createEmptyScoreCard(),
      'uid-2': createEmptyScoreCard(),
    },
    dice: [],
    heldDice: [false, false, false, false, false],
    rollsLeft: 3,
    currentPlayerIndex: 0,
    createdAt: {} as never,
    updatedAt: {} as never,
    ...overrides,
  };
}

describe('OnlineGameScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("shows the current player's name and calls rollDice on their own turn", async () => {
    const user = userEvent.setup();
    render(
      <OnlineGameScreen room={playingRoom()} roomId="AAAAA" ownUid="uid-1" onExit={() => {}} />
    );

    expect(screen.getByText(/Tura: Ola/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rzuć kośćmi' }));
    expect(rollDice).toHaveBeenCalledWith('AAAAA');
  });

  it("disables the roll button when it is not the viewer's turn", () => {
    render(
      <OnlineGameScreen room={playingRoom()} roomId="AAAAA" ownUid="uid-2" onExit={() => {}} />
    );
    expect(screen.getByRole('button', { name: 'Rzuć kośćmi' })).toBeDisabled();
  });

  it('calls handleTurnTimeout once the countdown reaches zero', () => {
    vi.useFakeTimers();
    const now = Date.now();
    const room = playingRoom({
      turnStartedAt: { toMillis: () => now } as never,
      turnTimeLimitSeconds: 15,
    });
    render(<OnlineGameScreen room={room} roomId="AAAAA" ownUid="uid-1" onExit={() => {}} />);

    act(() => {
      vi.advanceTimersByTime(16_000);
    });

    expect(handleTurnTimeout).toHaveBeenCalledWith('AAAAA');
  });

  it('does not replay the roll animation when a new snapshot only changes heldDice', () => {
    vi.useFakeTimers();
    const initialRoom = playingRoom({ dice: [1, 2, 3, 4, 5] });
    const { container, rerender } = render(
      <OnlineGameScreen room={initialRoom} roomId="AAAAA" ownUid="uid-1" onExit={() => {}} />
    );

    // Let the initial mount's roll animation (if any) fully settle.
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Simulate the Firestore snapshot that arrives after toggling a held
    // die: a brand-new `dice` array reference with identical values, only
    // `heldDice` actually differs.
    const updatedRoom = playingRoom({
      dice: [1, 2, 3, 4, 5],
      heldDice: [true, false, false, false, false],
    });
    rerender(
      <OnlineGameScreen room={updatedRoom} roomId="AAAAA" ownUid="uid-1" onExit={() => {}} />
    );

    const diceButtons = container.querySelectorAll('.dice-tray .die');
    expect(diceButtons).toHaveLength(5);
    for (const button of diceButtons) {
      expect(button).not.toHaveClass('rolling');
    }
  });

  it('hides the score board preview until the roll animation settles', () => {
    vi.useFakeTimers();
    const initialRoom = playingRoom({ dice: [] });
    const { rerender } = render(
      <OnlineGameScreen room={initialRoom} roomId="AAAAA" ownUid="uid-1" onExit={() => {}} />
    );

    const rolledRoom = playingRoom({ dice: [1, 1, 1, 3, 5] });
    rerender(
      <OnlineGameScreen room={rolledRoom} roomId="AAAAA" ownUid="uid-1" onExit={() => {}} />
    );

    // Immediately after the dice values arrive, the preview must still be hidden.
    const row = screen.getByText('Jedynki').closest('tr')!;
    expect(row.querySelector('button')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(row.querySelector('button')).not.toBeNull();
  });

  it('calls onExit after confirming when the exit button is clicked', async () => {
    const user = userEvent.setup();
    const onExit = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <OnlineGameScreen room={playingRoom()} roomId="AAAAA" ownUid="uid-1" onExit={onExit} />
    );

    await user.click(screen.getByRole('button', { name: 'Wyjdź z gry' }));

    expect(window.confirm).toHaveBeenCalled();
    expect(onExit).toHaveBeenCalled();
  });

  it('does not show host presence controls to a non-host player', () => {
    render(
      <OnlineGameScreen room={playingRoom()} roomId="AAAAA" ownUid="uid-2" onExit={() => {}} />
    );
    expect(
      screen.queryByRole('button', { name: 'Usuń nieaktywnych graczy' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Przerwij grę i wróć do pokoju' })
    ).not.toBeInTheDocument();
  });

  it('disables both presence buttons for the host while every other player is still active', () => {
    render(
      <OnlineGameScreen room={playingRoom()} roomId="AAAAA" ownUid="uid-1" onExit={() => {}} />
    );
    expect(screen.getByRole('button', { name: 'Usuń nieaktywnych graczy' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Przerwij grę i wróć do pokoju' })
    ).toBeDisabled();
  });

  it('enables "Usuń nieaktywnych graczy" once another player goes inactive and calls it after confirming', () => {
    vi.useFakeTimers();
    const start = Date.now();
    const room = playingRoom({
      players: [
        {
          id: 'uid-1',
          name: 'Ola',
          avatarId: 'avatar01',
          ready: true,
          lastActiveAt: { toMillis: () => start } as never,
        },
        {
          id: 'uid-2',
          name: 'Kuba',
          avatarId: 'avatar02',
          ready: true,
          lastActiveAt: { toMillis: () => start } as never,
        },
      ],
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<OnlineGameScreen room={room} roomId="AAAAA" ownUid="uid-1" onExit={() => {}} />);

    act(() => {
      vi.advanceTimersByTime(46_000);
    });

    const button = screen.getByRole('button', { name: 'Usuń nieaktywnych graczy' });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);

    expect(removeInactivePlayers).toHaveBeenCalledWith('AAAAA');
  });

  it('enables "Przerwij grę i wróć do pokoju" only once every other player is inactive', () => {
    vi.useFakeTimers();
    const start = Date.now();
    const room = playingRoom({
      players: [
        {
          id: 'uid-1',
          name: 'Ola',
          avatarId: 'avatar01',
          ready: true,
          lastActiveAt: { toMillis: () => Date.now() } as never,
        },
        {
          id: 'uid-2',
          name: 'Kuba',
          avatarId: 'avatar02',
          ready: true,
          lastActiveAt: { toMillis: () => start } as never,
        },
      ],
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<OnlineGameScreen room={room} roomId="AAAAA" ownUid="uid-1" onExit={() => {}} />);

    act(() => {
      vi.advanceTimersByTime(46_000);
    });

    const button = screen.getByRole('button', { name: 'Przerwij grę i wróć do pokoju' });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);

    expect(returnToLobby).toHaveBeenCalledWith('AAAAA');
  });
});
