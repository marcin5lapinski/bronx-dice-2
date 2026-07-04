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
      { id: 'uid-1', name: 'Ola', avatarId: 'avatar01', ready: false },
      { id: 'uid-2', name: 'Kuba', avatarId: 'avatar02', ready: true },
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
        { id: 'uid-1', name: 'Ola', avatarId: 'avatar01', ready: true },
        { id: 'uid-2', name: 'Kuba', avatarId: 'avatar02', ready: true },
      ],
    });
    render(<RoomLobbyScreen room={room} roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);
    expect(screen.getByRole('button', { name: 'Rozpocznij grę' })).not.toBeDisabled();
  });

  it('does not show a Start button to a non-host player', () => {
    render(<RoomLobbyScreen room={lobbyRoom()} roomId="AAAAA" ownUid="uid-2" onLeft={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Rozpocznij grę' })).not.toBeInTheDocument();
  });

  it('calls startGame when the host clicks Start', async () => {
    const user = userEvent.setup();
    vi.mocked(startGame).mockResolvedValue(undefined);
    const room = lobbyRoom({
      players: [
        { id: 'uid-1', name: 'Ola', avatarId: 'avatar01', ready: true },
        { id: 'uid-2', name: 'Kuba', avatarId: 'avatar02', ready: true },
      ],
    });
    render(<RoomLobbyScreen room={room} roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Rozpocznij grę' }));
    expect(startGame).toHaveBeenCalledWith('AAAAA');
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
