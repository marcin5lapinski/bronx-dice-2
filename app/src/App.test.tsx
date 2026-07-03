// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from 'firebase/auth';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';

vi.mock('./services/authService', () => ({
  subscribeToAuthState: vi
    .fn()
    .mockImplementation((callback: (user: User | null) => void) => {
      callback(null);
      return () => {};
    }),
  signInWithEmail: vi.fn(),
  registerWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
  sendPasswordReset: vi.fn(),
  signOutUser: vi.fn(),
}));

vi.mock('./services/profileService', () => ({
  getProfile: vi.fn(),
  createProfile: vi.fn(),
  updateProfile: vi.fn(),
}));

function renderApp() {
  return render(
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}

describe('App', () => {
  it('shows the start screen first', () => {
    renderApp();
    expect(screen.getByText('Bronx Dice')).toBeInTheDocument();
    expect(screen.getByLabelText('Liczba graczy')).toBeInTheDocument();
  });

  it('starts the game after entering names and clicking start', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.clear(screen.getByLabelText('Gracz 1'));
    await user.type(screen.getByLabelText('Gracz 1'), 'Ola');
    await user.clear(screen.getByLabelText('Gracz 2'));
    await user.type(screen.getByLabelText('Gracz 2'), 'Kuba');
    await user.click(screen.getByRole('button', { name: 'Rozpocznij grę' }));

    expect(screen.getByText('Tura: Ola')).toBeInTheDocument();
  });

  it('opens the login screen from the start screen', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Zaloguj się' }));

    expect(
      screen.getByRole('heading', { name: 'Zaloguj się' })
    ).toBeInTheDocument();
  });
});
