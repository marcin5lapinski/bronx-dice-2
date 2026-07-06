// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OnlineMenuScreen from './OnlineMenuScreen';
import { createRoom, joinRoom } from '../services/roomService';

vi.mock('../services/roomService', () => ({
  createRoom: vi.fn(),
  joinRoom: vi.fn(),
}));

describe('OnlineMenuScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // `createRoom`/`joinRoom` are plain `vi.fn()`s from the `vi.mock` factory
    // (not `vi.spyOn`), so `restoreAllMocks` alone doesn't clear their call
    // history or any custom `mockImplementation` between tests — reset both
    // explicitly to keep tests isolated.
    vi.clearAllMocks();
    vi.mocked(createRoom).mockReset();
    vi.mocked(joinRoom).mockReset();
  });

  it('creates a room with the selected settings and reports the new roomId', async () => {
    const user = userEvent.setup();
    vi.mocked(createRoom).mockResolvedValue('AAAAA');
    const onRoomJoined = vi.fn();
    render(
      <OnlineMenuScreen onRoomJoined={onRoomJoined} onOpenProfile={() => {}} onBack={() => {}} />
    );

    await user.selectOptions(screen.getByLabelText('Liczba graczy'), '3');
    await user.selectOptions(screen.getByLabelText('Limit czasu na turę'), '45');
    await user.click(screen.getByRole('button', { name: 'Stwórz pokój' }));

    expect(createRoom).toHaveBeenCalledWith({ maxPlayers: 3, turnTimeLimitSeconds: 45 });
    expect(onRoomJoined).toHaveBeenCalledWith('AAAAA');
  });

  it('joins a room using an uppercased, trimmed room code', async () => {
    const user = userEvent.setup();
    vi.mocked(joinRoom).mockResolvedValue(undefined);
    const onRoomJoined = vi.fn();
    render(
      <OnlineMenuScreen onRoomJoined={onRoomJoined} onOpenProfile={() => {}} onBack={() => {}} />
    );

    await user.type(screen.getByLabelText('Kod pokoju'), '  abcde  ');
    await user.click(screen.getByRole('button', { name: 'Dołącz' }));

    expect(joinRoom).toHaveBeenCalledWith('ABCDE');
    expect(onRoomJoined).toHaveBeenCalledWith('ABCDE');
  });

  it('shows the error message when joining fails', async () => {
    const user = userEvent.setup();
    vi.mocked(joinRoom).mockRejectedValue(new Error('Pokój nie istnieje.'));
    render(<OnlineMenuScreen onRoomJoined={() => {}} onOpenProfile={() => {}} onBack={() => {}} />);

    await user.type(screen.getByLabelText('Kod pokoju'), 'ZZZZZ');
    await user.click(screen.getByRole('button', { name: 'Dołącz' }));

    expect(await screen.findByText('Pokój nie istnieje.')).toBeInTheDocument();
  });

  it('shows an error and does not call joinRoom when the room code is blank', async () => {
    const user = userEvent.setup();
    render(<OnlineMenuScreen onRoomJoined={() => {}} onOpenProfile={() => {}} onBack={() => {}} />);

    await user.type(screen.getByLabelText('Kod pokoju'), '   ');
    await user.click(screen.getByRole('button', { name: 'Dołącz' }));

    expect(await screen.findByText('Podaj kod pokoju.')).toBeInTheDocument();
    expect(joinRoom).not.toHaveBeenCalled();
  });

  it('calls onOpenProfile when the profile button is clicked', async () => {
    const user = userEvent.setup();
    const onOpenProfile = vi.fn();
    render(
      <OnlineMenuScreen onRoomJoined={() => {}} onOpenProfile={onOpenProfile} onBack={() => {}} />
    );

    await user.click(screen.getByRole('button', { name: 'Profil' }));

    expect(onOpenProfile).toHaveBeenCalled();
  });

  it('calls onBack when the back button is clicked', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<OnlineMenuScreen onRoomJoined={() => {}} onOpenProfile={() => {}} onBack={onBack} />);

    await user.click(screen.getByRole('button', { name: 'Wstecz' }));

    expect(onBack).toHaveBeenCalled();
  });

  it('shows a pending label on Create and disables both buttons while creating a room', () => {
    let resolveCreate!: (roomId: string) => void;
    vi.mocked(createRoom).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        })
    );
    render(
      <OnlineMenuScreen onRoomJoined={() => {}} onOpenProfile={() => {}} onBack={() => {}} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Stwórz pokój' }));

    expect(screen.getByText('Tworzę pokój…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tworzę pokój/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dołącz' })).toBeDisabled();

    resolveCreate('AAAAA');
  });

  it('shows a pending label on Join and disables both buttons while joining a room', async () => {
    const user = userEvent.setup();
    let resolveJoin!: () => void;
    vi.mocked(joinRoom).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveJoin = () => resolve(undefined);
        })
    );
    render(
      <OnlineMenuScreen onRoomJoined={() => {}} onOpenProfile={() => {}} onBack={() => {}} />
    );

    await user.type(screen.getByLabelText('Kod pokoju'), 'ABCDE');
    fireEvent.click(screen.getByRole('button', { name: 'Dołącz' }));

    expect(screen.getByText('Dołączam…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Dołączam/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Stwórz pokój' })).toBeDisabled();

    resolveJoin();
  });
});
