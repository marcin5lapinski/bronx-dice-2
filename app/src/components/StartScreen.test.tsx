// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from 'firebase/auth';
import StartScreen from './StartScreen';
import { AuthProvider } from '../contexts/AuthContext';
import { subscribeToAuthState } from '../services/authService';

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
});
