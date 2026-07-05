// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RoomLobbyScreen from './RoomLobbyScreen';
import { setReady, startGame, leaveRoom } from '../services/roomService';
import type { RoomDocument } from '../types/room';

vi.mock('../services/roomService', () => ({
  setReady: vi.fn(),
  startGame: vi.fn(),
  leaveRoom: vi.fn(),
}));

type LobbyRoom = Extract<RoomDocument, { phase: 'lobby' }>;

function lobbyRoom(overrides: Partial<LobbyRoom> = {}): LobbyRoom {
  return {
    phase: 'lobby',
    hostId: 'uid-1',
    maxPlayers: 4,
    turnTimeLimitSeconds: 30,
    players: [
      { id: 'uid-1', name: 'Ola', avatarId: 'avatar01', ready: false, lastActiveAt: {} as never },
      { id: 'uid-2', name: 'Kuba', avatarId: 'avatar02', ready: true, lastActiveAt: {} as never },
    ],
    createdAt: {} as never,
    updatedAt: {} as never,
    ...overrides,
  };
}

describe('RoomLobbyScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists every player with their name and marks the host', () => {
    render(<RoomLobbyScreen room={lobbyRoom()} roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);
    expect(screen.getByText('Ola')).toBeInTheDocument();
    expect(screen.getByText('Kuba')).toBeInTheDocument();
    expect(screen.getByText('Host')).toBeInTheDocument();
  });

  it('toggles own readiness when the ready button is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(setReady).mockResolvedValue(undefined);
    render(<RoomLobbyScreen room={lobbyRoom()} roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Gotowy' }));
    expect(setReady).toHaveBeenCalledWith('AAAAA', true);
  });

  it('disables Start for the host until every player is ready', () => {
    render(<RoomLobbyScreen room={lobbyRoom()} roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);
    expect(screen.getByRole('button', { name: 'Rozpocznij grę' })).toBeDisabled();
  });

  it('enables Start for the host once every player is ready', () => {
    const room = lobbyRoom({
      players: [
        { id: 'uid-1', name: 'Ola', avatarId: 'avatar01', ready: true, lastActiveAt: {} as never },
        { id: 'uid-2', name: 'Kuba', avatarId: 'avatar02', ready: true, lastActiveAt: {} as never },
      ],
    });
    render(<RoomLobbyScreen room={room} roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);
    expect(screen.getByRole('button', { name: 'Rozpocznij grę' })).not.toBeDisabled();
  });

  it('does not show a Start button to a non-host player', () => {
    render(<RoomLobbyScreen room={lobbyRoom()} roomId="AAAAA" ownUid="uid-2" onLeft={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Rozpocznij grę' })).not.toBeInTheDocument();
  });

  it('calls startGame with the current player order when the host clicks Start', async () => {
    const user = userEvent.setup();
    vi.mocked(startGame).mockResolvedValue(undefined);
    const room = lobbyRoom({
      players: [
        { id: 'uid-1', name: 'Ola', avatarId: 'avatar01', ready: true, lastActiveAt: {} as never },
        { id: 'uid-2', name: 'Kuba', avatarId: 'avatar02', ready: true, lastActiveAt: {} as never },
      ],
    });
    render(<RoomLobbyScreen room={room} roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Rozpocznij grę' }));
    expect(startGame).toHaveBeenCalledWith('AAAAA', ['uid-1', 'uid-2']);
  });

  it('renders a drag handle for each player row for the host', () => {
    render(<RoomLobbyScreen room={lobbyRoom()} roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);
    expect(screen.getByRole('button', { name: 'Zmień kolejność: Ola' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zmień kolejność: Kuba' })).toBeInTheDocument();
  });

  it('does not render drag handles or the randomize checkbox for a non-host', () => {
    render(<RoomLobbyScreen room={lobbyRoom()} roomId="AAAAA" ownUid="uid-2" onLeft={() => {}} />);
    expect(
      screen.queryByRole('button', { name: 'Zmień kolejność: Ola' })
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Losuj kolejność')).not.toBeInTheDocument();
  });

  it('disables the drag handles when "Losuj kolejność" is checked', async () => {
    const user = userEvent.setup();
    render(<RoomLobbyScreen room={lobbyRoom()} roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);

    await user.click(screen.getByLabelText('Losuj kolejność'));

    expect(screen.getByRole('button', { name: 'Zmień kolejność: Ola' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Zmień kolejność: Kuba' })).toBeDisabled();
  });

  it('starts the game with a shuffled player order when "Losuj kolejność" is checked', async () => {
    const user = userEvent.setup();
    vi.mocked(startGame).mockResolvedValue(undefined);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const room = lobbyRoom({
      players: [
        { id: 'uid-1', name: 'Ola', avatarId: 'avatar01', ready: true, lastActiveAt: {} as never },
        { id: 'uid-2', name: 'Kuba', avatarId: 'avatar02', ready: true, lastActiveAt: {} as never },
      ],
    });
    render(<RoomLobbyScreen room={room} roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);

    await user.click(screen.getByLabelText('Losuj kolejność'));
    await user.click(screen.getByRole('button', { name: 'Rozpocznij grę' }));

    // Fisher-Yates on 2 items with random()=0: i=1, j=floor(0*2)=0, swap(1,0)
    expect(startGame).toHaveBeenCalledWith('AAAAA', ['uid-2', 'uid-1']);
  });

  it('leaves the room and calls onLeft', async () => {
    const user = userEvent.setup();
    vi.mocked(leaveRoom).mockResolvedValue(undefined);
    const onLeft = vi.fn();
    render(<RoomLobbyScreen room={lobbyRoom()} roomId="AAAAA" ownUid="uid-1" onLeft={onLeft} />);
    await user.click(screen.getByRole('button', { name: 'Opuść pokój' }));
    expect(leaveRoom).toHaveBeenCalledWith('AAAAA');
    expect(onLeft).toHaveBeenCalled();
  });
});
