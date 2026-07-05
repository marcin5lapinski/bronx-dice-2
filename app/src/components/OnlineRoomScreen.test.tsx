// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createEmptyScoreCard } from '@bronx-dice/game-engine';
import OnlineRoomScreen from './OnlineRoomScreen';
import { useRoom } from '../hooks/useRoom';
import { returnToLobby } from '../services/roomService';
import type { RoomDocument } from '../types/room';

function finishedRoom(): Extract<RoomDocument, { phase: 'finished' }> {
  const scoreCards = { 'uid-1': createEmptyScoreCard() };
  scoreCards['uid-1'].lower.chance = 20;
  return {
    phase: 'finished',
    hostId: 'uid-1',
    maxPlayers: 2,
    turnTimeLimitSeconds: 30,
    turnStartedAt: {} as never,
    players: [
      { id: 'uid-1', name: 'Ola', avatarId: 'avatar01', ready: true, lastActiveAt: {} as never },
    ],
    scoreCards,
    dice: [],
    heldDice: [false, false, false, false, false],
    rollsLeft: 3,
    currentPlayerIndex: 0,
    createdAt: {} as never,
    updatedAt: {} as never,
  };
}

vi.mock('../hooks/useRoom', () => ({
  useRoom: vi.fn(),
}));

vi.mock('../services/roomService', () => ({
  setReady: vi.fn(),
  startGame: vi.fn(),
  leaveRoom: vi.fn(),
  rollDice: vi.fn(),
  toggleHeldDie: vi.fn(),
  scoreCategory: vi.fn(),
  handleTurnTimeout: vi.fn(),
  heartbeat: vi.fn().mockResolvedValue(undefined),
  removeInactivePlayers: vi.fn(),
  returnToLobby: vi.fn(),
}));

describe('OnlineRoomScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a loading message while the room is loading', () => {
    vi.mocked(useRoom).mockReturnValue({ room: null, loading: true, notFound: false });
    render(<OnlineRoomScreen roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);
    expect(screen.getByText('Ładowanie…')).toBeInTheDocument();
  });

  it('renders the lobby screen when the room is in the lobby phase', () => {
    vi.mocked(useRoom).mockReturnValue({
      room: {
        phase: 'lobby',
        hostId: 'uid-1',
        maxPlayers: 4,
        turnTimeLimitSeconds: 30,
        players: [
          { id: 'uid-1', name: 'Ola', avatarId: 'avatar01', ready: false, lastActiveAt: {} as never },
        ],
        createdAt: {} as never,
        updatedAt: {} as never,
      },
      loading: false,
      notFound: false,
    });
    render(<OnlineRoomScreen roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);
    expect(screen.getByText('Pokój AAAAA')).toBeInTheDocument();
  });

  it('renders the winner screen when the room has finished', () => {
    vi.mocked(useRoom).mockReturnValue({
      room: finishedRoom(),
      loading: false,
      notFound: false,
    });
    render(<OnlineRoomScreen roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);
    expect(screen.getByText('Zwycięzca: Ola!')).toBeInTheDocument();
  });

  it("lets the host stay in the room and start a new round from the winner screen", async () => {
    const user = userEvent.setup();
    vi.mocked(useRoom).mockReturnValue({
      room: finishedRoom(),
      loading: false,
      notFound: false,
    });
    render(<OnlineRoomScreen roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'Zagraj ponownie' }));
    expect(returnToLobby).toHaveBeenCalledWith('AAAAA');
  });

  it('shows a waiting message (no "Zagraj ponownie") to a non-host on the winner screen', () => {
    vi.mocked(useRoom).mockReturnValue({
      room: finishedRoom(),
      loading: false,
      notFound: false,
    });
    render(<OnlineRoomScreen roomId="AAAAA" ownUid="uid-2" onLeft={() => {}} />);

    expect(
      screen.queryByRole('button', { name: 'Zagraj ponownie' })
    ).not.toBeInTheDocument();
    expect(screen.getByText('Oczekiwanie na hosta…')).toBeInTheDocument();
  });

  it('exits the room when "Wyjdź z pokoju" is clicked on the winner screen', async () => {
    const user = userEvent.setup();
    const onLeft = vi.fn();
    vi.mocked(useRoom).mockReturnValue({
      room: finishedRoom(),
      loading: false,
      notFound: false,
    });
    render(<OnlineRoomScreen roomId="AAAAA" ownUid="uid-1" onLeft={onLeft} />);

    await user.click(screen.getByRole('button', { name: 'Wyjdź z pokoju' }));
    expect(onLeft).toHaveBeenCalledTimes(1);
  });

  it('calls onLeft when the room is not found', async () => {
    vi.mocked(useRoom).mockReturnValue({ room: null, loading: false, notFound: true });
    const onLeft = vi.fn();
    render(<OnlineRoomScreen roomId="AAAAA" ownUid="uid-1" onLeft={onLeft} />);
    await waitFor(() => expect(onLeft).toHaveBeenCalled());
  });
});
