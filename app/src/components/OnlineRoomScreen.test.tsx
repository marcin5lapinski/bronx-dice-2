// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createEmptyScoreCard } from '@bronx-dice/game-engine';
import OnlineRoomScreen from './OnlineRoomScreen';
import { useRoom } from '../hooks/useRoom';

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
        players: [{ id: 'uid-1', name: 'Ola', avatarId: 'avatar01', ready: false }],
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
    const scoreCards = { 'uid-1': createEmptyScoreCard() };
    scoreCards['uid-1'].lower.chance = 20;
    vi.mocked(useRoom).mockReturnValue({
      room: {
        phase: 'finished',
        hostId: 'uid-1',
        maxPlayers: 2,
        turnTimeLimitSeconds: 30,
        turnStartedAt: {} as never,
        players: [{ id: 'uid-1', name: 'Ola', avatarId: 'avatar01', ready: true }],
        scoreCards,
        dice: [],
        heldDice: [false, false, false, false, false],
        rollsLeft: 3,
        currentPlayerIndex: 0,
        createdAt: {} as never,
        updatedAt: {} as never,
      },
      loading: false,
      notFound: false,
    });
    render(<OnlineRoomScreen roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);
    expect(screen.getByText('Zwycięzca: Ola!')).toBeInTheDocument();
  });

  it('calls onLeft when the room is not found', async () => {
    vi.mocked(useRoom).mockReturnValue({ room: null, loading: false, notFound: true });
    const onLeft = vi.fn();
    render(<OnlineRoomScreen roomId="AAAAA" ownUid="uid-1" onLeft={onLeft} />);
    await waitFor(() => expect(onLeft).toHaveBeenCalled());
  });
});
