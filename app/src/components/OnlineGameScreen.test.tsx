// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createEmptyScoreCard } from '@bronx-dice/game-engine';
import OnlineGameScreen from './OnlineGameScreen';
import { rollDice, handleTurnTimeout } from '../services/roomService';
import type { RoomDocument } from '../types/room';

vi.mock('../services/roomService', () => ({
  rollDice: vi.fn().mockResolvedValue(undefined),
  toggleHeldDie: vi.fn().mockResolvedValue(undefined),
  scoreCategory: vi.fn().mockResolvedValue(undefined),
  handleTurnTimeout: vi.fn().mockResolvedValue(undefined),
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
      { id: 'uid-1', name: 'Ola', avatarId: 'avatar01', ready: true },
      { id: 'uid-2', name: 'Kuba', avatarId: 'avatar02', ready: true },
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
    render(<OnlineGameScreen room={playingRoom()} roomId="AAAAA" ownUid="uid-1" />);

    expect(screen.getByText(/Tura: Ola/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rzuć kośćmi' }));
    expect(rollDice).toHaveBeenCalledWith('AAAAA');
  });

  it("disables the roll button when it is not the viewer's turn", () => {
    render(<OnlineGameScreen room={playingRoom()} roomId="AAAAA" ownUid="uid-2" />);
    expect(screen.getByRole('button', { name: 'Rzuć kośćmi' })).toBeDisabled();
  });

  it('calls handleTurnTimeout once the countdown reaches zero', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    const room = playingRoom({
      turnStartedAt: { toMillis: () => now } as never,
      turnTimeLimitSeconds: 15,
    });
    render(<OnlineGameScreen room={room} roomId="AAAAA" ownUid="uid-1" />);

    act(() => {
      vi.setSystemTime(now + 16_000);
      vi.advanceTimersByTime(16_000);
    });

    expect(handleTurnTimeout).toHaveBeenCalledWith('AAAAA');
  });
});
