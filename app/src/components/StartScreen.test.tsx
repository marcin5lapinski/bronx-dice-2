// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from 'firebase/auth';
import StartScreen from './StartScreen';
import { AuthProvider } from '../contexts/AuthContext';
import { subscribeToAuthState } from '../services/authService';
import { getProfile } from '../services/profileService';

vi.mock('../services/authService', () => ({
  subscribeToAuthState: vi
    .fn()
    .mockImplementation((callback: (user: User | null) => void) => {
      callback(null);
      return () => {};
    }),
}));

vi.mock('../services/profileService', () => ({
  getProfile: vi.fn().mockResolvedValue(null),
}));

function renderStartScreen(
  props: { onStart?: (names: string[]) => void; onOpenAuth?: () => void } = {}
) {
  return render(
    <AuthProvider>
      <StartScreen
        onStart={props.onStart ?? (() => {})}
        onOpenAuth={props.onOpenAuth ?? (() => {})}
      />
    </AuthProvider>
  );
}

describe('StartScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders 2 name inputs by default', () => {
    renderStartScreen();
    expect(screen.getByLabelText('Gracz 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Gracz 2')).toBeInTheDocument();
    expect(screen.queryByLabelText('Gracz 3')).not.toBeInTheDocument();
  });

  it('adds more name inputs when player count increases, preserving existing names', async () => {
    const user = userEvent.setup();
    renderStartScreen();

    await user.clear(screen.getByLabelText('Gracz 1'));
    await user.type(screen.getByLabelText('Gracz 1'), 'Ola');
    await user.selectOptions(screen.getByLabelText('Liczba graczy'), '4');

    expect(screen.getByLabelText('Gracz 1')).toHaveValue('Ola');
    expect(screen.getByLabelText('Gracz 3')).toBeInTheDocument();
    expect(screen.getByLabelText('Gracz 4')).toBeInTheDocument();
  });

  it('disables the start button when a name is blank', async () => {
    const user = userEvent.setup();
    renderStartScreen();

    await user.clear(screen.getByLabelText('Gracz 1'));

    expect(
      screen.getByRole('button', { name: 'Rozpocznij grę' })
    ).toBeDisabled();
  });

  it('calls onStart with trimmed player names when clicked', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    renderStartScreen({ onStart });

    await user.clear(screen.getByLabelText('Gracz 1'));
    await user.type(screen.getByLabelText('Gracz 1'), '  Ola  ');
    await user.clear(screen.getByLabelText('Gracz 2'));
    await user.type(screen.getByLabelText('Gracz 2'), 'Kuba');

    await user.click(screen.getByRole('button', { name: 'Rozpocznij grę' }));

    expect(onStart).toHaveBeenCalledWith(['Ola', 'Kuba']);
  });

  it('shows "Zaloguj się" and calls onOpenAuth when signed out', async () => {
    const user = userEvent.setup();
    const onOpenAuth = vi.fn();
    renderStartScreen({ onOpenAuth });

    const button = screen.getByRole('button', { name: 'Zaloguj się' });
    await user.click(button);

    expect(onOpenAuth).toHaveBeenCalled();
  });

  it('shows "Profil gracza" instead of "Zaloguj się" when signed in', () => {
    vi.mocked(subscribeToAuthState).mockImplementationOnce((callback) => {
      callback({ uid: 'uid-1' } as User);
      return () => {};
    });

    renderStartScreen();

    expect(
      screen.getByRole('button', { name: 'Profil gracza' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Zaloguj się' })
    ).not.toBeInTheDocument();
  });

  it('renders a drag handle for each player row, labeled by position', () => {
    renderStartScreen();

    expect(
      screen.getByRole('button', { name: 'Zmień kolejność: Gracz 1' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Zmień kolejność: Gracz 2' })
    ).toBeInTheDocument();
  });

  it('reorders rows and their labels when the underlying order changes', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    renderStartScreen({ onStart });

    await user.clear(screen.getByLabelText('Gracz 1'));
    await user.type(screen.getByLabelText('Gracz 1'), 'Ola');
    await user.clear(screen.getByLabelText('Gracz 2'));
    await user.type(screen.getByLabelText('Gracz 2'), 'Kuba');
    await user.selectOptions(screen.getByLabelText('Liczba graczy'), '3');
    await user.clear(screen.getByLabelText('Gracz 3'));
    await user.type(screen.getByLabelText('Gracz 3'), 'Ala');

    await user.click(screen.getByRole('button', { name: 'Rozpocznij grę' }));

    expect(onStart).toHaveBeenCalledWith(['Ola', 'Kuba', 'Ala']);
  });

  it('disables the drag handles when "Losuj kolejność" is checked', async () => {
    const user = userEvent.setup();
    renderStartScreen();

    await user.click(screen.getByLabelText('Losuj kolejność'));

    expect(
      screen.getByRole('button', { name: 'Zmień kolejność: Gracz 1' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Zmień kolejność: Gracz 2' })
    ).toBeDisabled();
  });

  it('does not change the visible input order when the checkbox is checked', async () => {
    const user = userEvent.setup();
    renderStartScreen();

    await user.clear(screen.getByLabelText('Gracz 1'));
    await user.type(screen.getByLabelText('Gracz 1'), 'Ola');
    await user.clear(screen.getByLabelText('Gracz 2'));
    await user.type(screen.getByLabelText('Gracz 2'), 'Kuba');
    await user.click(screen.getByLabelText('Losuj kolejność'));

    expect(screen.getByLabelText('Gracz 1')).toHaveValue('Ola');
    expect(screen.getByLabelText('Gracz 2')).toHaveValue('Kuba');
  });

  it('shuffles the names before starting when "Losuj kolejność" is checked', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    renderStartScreen({ onStart });

    await user.clear(screen.getByLabelText('Gracz 1'));
    await user.type(screen.getByLabelText('Gracz 1'), 'Ola');
    await user.clear(screen.getByLabelText('Gracz 2'));
    await user.type(screen.getByLabelText('Gracz 2'), 'Kuba');
    await user.click(screen.getByLabelText('Losuj kolejność'));
    await user.click(screen.getByRole('button', { name: 'Rozpocznij grę' }));

    // Fisher-Yates on 2 items with random()=0: i=1, j=floor(0*2)=0, swap(1,0)
    expect(onStart).toHaveBeenCalledWith(['Kuba', 'Ola']);
  });

  it('does not shuffle when "Losuj kolejność" is left unchecked', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    renderStartScreen({ onStart });

    await user.clear(screen.getByLabelText('Gracz 1'));
    await user.type(screen.getByLabelText('Gracz 1'), 'Ola');
    await user.clear(screen.getByLabelText('Gracz 2'));
    await user.type(screen.getByLabelText('Gracz 2'), 'Kuba');
    await user.click(screen.getByRole('button', { name: 'Rozpocznij grę' }));

    expect(onStart).toHaveBeenCalledWith(['Ola', 'Kuba']);
  });

  it('auto-fills "Gracz 1" with the signed-in player\'s display name', async () => {
    vi.mocked(subscribeToAuthState).mockImplementationOnce((callback) => {
      callback({ uid: 'uid-1' } as User);
      return () => {};
    });
    vi.mocked(getProfile).mockResolvedValueOnce({
      displayName: 'Ola Nick',
      avatarId: 'avatar01',
      email: 'ola@example.com',
      createdAt: 1700000000000,
    });

    renderStartScreen();

    await waitFor(() =>
      expect(screen.getByLabelText('Gracz 1')).toHaveValue('Ola Nick')
    );
  });

  it('stops syncing "Gracz 1" once the player edits it by hand', async () => {
    vi.mocked(subscribeToAuthState).mockImplementationOnce((callback) => {
      callback({ uid: 'uid-1' } as User);
      return () => {};
    });
    vi.mocked(getProfile).mockResolvedValueOnce({
      displayName: 'Ola Nick',
      avatarId: 'avatar01',
      email: 'ola@example.com',
      createdAt: 1700000000000,
    });

    const user = userEvent.setup();
    renderStartScreen();

    await waitFor(() =>
      expect(screen.getByLabelText('Gracz 1')).toHaveValue('Ola Nick')
    );

    await user.clear(screen.getByLabelText('Gracz 1'));
    await user.type(screen.getByLabelText('Gracz 1'), 'Custom');

    expect(screen.getByLabelText('Gracz 1')).toHaveValue('Custom');
  });

  it('does not touch "Gracz 1" when signed out', () => {
    renderStartScreen();

    expect(screen.getByLabelText('Gracz 1')).toHaveValue('Gracz 1');
  });
});
