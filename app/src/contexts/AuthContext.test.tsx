// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { User } from 'firebase/auth';
import { AuthProvider, useAuth } from './AuthContext';
import type { PlayerProfile } from '../types/auth';

const mockSubscribeToAuthState = vi.fn();
const mockGetProfile = vi.fn();

vi.mock('../services/authService', () => ({
  subscribeToAuthState: (callback: (user: User | null) => void) =>
    mockSubscribeToAuthState(callback),
}));

vi.mock('../services/profileService', () => ({
  getProfile: (uid: string) => mockGetProfile(uid),
}));

function Consumer() {
  const { user, profile, loading } = useAuth();
  if (loading) {
    return <p>Ładowanie…</p>;
  }
  if (!user) {
    return <p>Brak użytkownika</p>;
  }
  return <p>Zalogowano jako {profile?.displayName ?? '(brak profilu)'}</p>;
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts in a loading state', () => {
    mockSubscribeToAuthState.mockReturnValue(() => {});
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );
    expect(screen.getByText('Ładowanie…')).toBeInTheDocument();
  });

  it('loads the profile once the auth state reports a signed-in user', async () => {
    let capturedCallback: ((user: User | null) => void) | undefined;
    mockSubscribeToAuthState.mockImplementation((callback) => {
      capturedCallback = callback;
      return () => {};
    });
    const profile: PlayerProfile = {
      displayName: 'Ola',
      avatarId: 'fox',
      email: 'ola@example.com',
      createdAt: 1700000000000,
    };
    mockGetProfile.mockResolvedValue(profile);

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    capturedCallback!({ uid: 'uid-1' } as User);

    await waitFor(() =>
      expect(screen.getByText('Zalogowano jako Ola')).toBeInTheDocument()
    );
    expect(mockGetProfile).toHaveBeenCalledWith('uid-1');
  });

  it('clears the profile and stops loading when signed out', async () => {
    let capturedCallback: ((user: User | null) => void) | undefined;
    mockSubscribeToAuthState.mockImplementation((callback) => {
      capturedCallback = callback;
      return () => {};
    });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    capturedCallback!(null);

    await waitFor(() =>
      expect(screen.getByText('Brak użytkownika')).toBeInTheDocument()
    );
    expect(mockGetProfile).not.toHaveBeenCalled();
  });

  it('useAuth throws when used outside an AuthProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow(
      'useAuth must be used within an AuthProvider'
    );
    consoleError.mockRestore();
  });
});
