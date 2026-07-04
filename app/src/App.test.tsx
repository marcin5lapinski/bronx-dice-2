// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from 'firebase/auth';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { subscribeToAuthState } from './services/authService';
import { getProfile } from './services/profileService';
import { useRoom } from './hooks/useRoom';
import type { PlayerProfile } from './types/auth';

vi.mock('./services/authService', () => ({
  subscribeToAuthState: vi.fn(),
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

vi.mock('./services/roomService', () => ({
  createRoom: vi.fn(),
  joinRoom: vi.fn(),
  setReady: vi.fn(),
  startGame: vi.fn(),
  leaveRoom: vi.fn(),
  rollDice: vi.fn(),
  toggleHeldDie: vi.fn(),
  scoreCategory: vi.fn(),
  handleTurnTimeout: vi.fn(),
}));

vi.mock('./hooks/useRoom', () => ({
  useRoom: vi.fn(),
}));

function renderApp() {
  return render(
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}

describe('App', () => {
  beforeEach(() => {
    vi.mocked(subscribeToAuthState).mockImplementation((callback: (user: User | null) => void) => {
      callback(null);
      return () => {};
    });
    vi.mocked(getProfile).mockResolvedValue(null);
    vi.mocked(useRoom).mockReturnValue({ room: null, loading: true, notFound: false });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('shows the start screen first', () => {
    renderApp();
    expect(screen.getByAltText('Bronx Dice')).toBeInTheDocument();
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

    expect(screen.getByRole('heading', { name: 'Zaloguj się' })).toBeInTheDocument();
  });

  it('shows the online menu once logged in with a complete profile', async () => {
    const fakeUser = { uid: 'uid-1' } as User;
    const fakeProfile: PlayerProfile = {
      displayName: 'Ola',
      avatarId: 'avatar01',
      email: 'ola@example.com',
      createdAt: 1700000000000,
    };
    vi.mocked(subscribeToAuthState).mockImplementation((callback: (user: User | null) => void) => {
      callback(fakeUser);
      return () => {};
    });
    vi.mocked(getProfile).mockResolvedValue(fakeProfile);

    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole('button', { name: 'Profil gracza' }));

    expect(await screen.findByText('Gra online')).toBeInTheDocument();
  });

  it('restores a previously joined online room from localStorage', async () => {
    const fakeUser = { uid: 'uid-1' } as User;
    vi.mocked(subscribeToAuthState).mockImplementation((callback: (user: User | null) => void) => {
      callback(fakeUser);
      return () => {};
    });
    // Keep auth "loading" indefinitely so this test deterministically observes
    // the interim loading placeholder instead of racing the profile fetch's
    // resolution against the assertion (which would otherwise unmount this
    // exact paragraph node in favor of OnlineRoomScreen's own loading state).
    vi.mocked(getProfile).mockReturnValue(new Promise(() => {}));
    localStorage.setItem('bronxDice.onlineRoomId', 'AAAAA');

    renderApp();

    expect(await screen.findByText('Ładowanie…')).toBeInTheDocument();
  });

  it('clears a stored room and exits to login when auth resolves with no user', async () => {
    localStorage.setItem('bronxDice.onlineRoomId', 'AAAAA');
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Zaloguj się' })).toBeInTheDocument();
    expect(localStorage.getItem('bronxDice.onlineRoomId')).toBeNull();
  });
});
