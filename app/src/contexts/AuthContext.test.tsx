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

  it('sets loading back to true when a new signed-in user is detected mid-fetch', async () => {
    let capturedCallback: ((user: User | null) => void) | undefined;
    mockSubscribeToAuthState.mockImplementation((callback) => {
      capturedCallback = callback;
      return () => {};
    });

    const profileA: PlayerProfile = {
      displayName: 'Ala',
      avatarId: 'fox',
      email: 'ala@example.com',
      createdAt: 1700000000000,
    };
    const profileB: PlayerProfile = {
      displayName: 'Basia',
      avatarId: 'owl',
      email: 'basia@example.com',
      createdAt: 1700000001000,
    };

    let resolveSecond: ((profile: PlayerProfile) => void) | undefined;
    mockGetProfile.mockImplementationOnce(() => Promise.resolve(profileA));
    mockGetProfile.mockImplementationOnce(
      () =>
        new Promise<PlayerProfile>((resolve) => {
          resolveSecond = resolve;
        })
    );

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    capturedCallback!({ uid: 'uid-a' } as User);

    await waitFor(() =>
      expect(screen.getByText('Zalogowano jako Ala')).toBeInTheDocument()
    );

    capturedCallback!({ uid: 'uid-b' } as User);

    await waitFor(() =>
      expect(screen.getByText('Ładowanie…')).toBeInTheDocument()
    );

    resolveSecond!(profileB);

    await waitFor(() =>
      expect(screen.getByText('Zalogowano jako Basia')).toBeInTheDocument()
    );
  });

  it('ignores a stale profile fetch that resolves after a newer one', async () => {
    let capturedCallback: ((user: User | null) => void) | undefined;
    mockSubscribeToAuthState.mockImplementation((callback) => {
      capturedCallback = callback;
      return () => {};
    });

    const staleProfile: PlayerProfile = {
      displayName: 'Stary',
      avatarId: 'fox',
      email: 'stary@example.com',
      createdAt: 1700000000000,
    };
    const freshProfile: PlayerProfile = {
      displayName: 'Nowy',
      avatarId: 'owl',
      email: 'nowy@example.com',
      createdAt: 1700000001000,
    };

    let resolveStale: ((profile: PlayerProfile) => void) | undefined;
    let resolveFresh: ((profile: PlayerProfile) => void) | undefined;

    mockGetProfile.mockImplementationOnce(
      () =>
        new Promise<PlayerProfile>((resolve) => {
          resolveStale = resolve;
        })
    );
    mockGetProfile.mockImplementationOnce(
      () =>
        new Promise<PlayerProfile>((resolve) => {
          resolveFresh = resolve;
        })
    );

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    // Two signed-in users detected in quick succession (e.g. rapid account
    // switch or two auth events during session restore).
    capturedCallback!({ uid: 'uid-old' } as User);
    capturedCallback!({ uid: 'uid-new' } as User);

    // The newer request resolves first...
    resolveFresh!(freshProfile);
    await waitFor(() =>
      expect(screen.getByText('Zalogowano jako Nowy')).toBeInTheDocument()
    );

    // ...then the older, stale request resolves after it. It must not
    // overwrite the newer profile that is already displayed.
    resolveStale!(staleProfile);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByText('Zalogowano jako Nowy')).toBeInTheDocument();
    expect(
      screen.queryByText('Zalogowano jako Stary')
    ).not.toBeInTheDocument();
  });

  it('stops loading (without hanging) when the profile fetch rejects', async () => {
    let capturedCallback: ((user: User | null) => void) | undefined;
    mockSubscribeToAuthState.mockImplementation((callback) => {
      capturedCallback = callback;
      return () => {};
    });

    mockGetProfile.mockRejectedValue(new Error('permission-denied'));

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    capturedCallback!({ uid: 'uid-1' } as User);

    await waitFor(() =>
      expect(
        screen.getByText('Zalogowano jako (brak profilu)')
      ).toBeInTheDocument()
    );
    expect(screen.queryByText('Ładowanie…')).not.toBeInTheDocument();
  });

  it('ignores a stale profile fetch that rejects after a newer one resolved', async () => {
    let capturedCallback: ((user: User | null) => void) | undefined;
    mockSubscribeToAuthState.mockImplementation((callback) => {
      capturedCallback = callback;
      return () => {};
    });

    const freshProfile: PlayerProfile = {
      displayName: 'Nowy',
      avatarId: 'owl',
      email: 'nowy@example.com',
      createdAt: 1700000001000,
    };

    let rejectStale: ((error: Error) => void) | undefined;
    let resolveFresh: ((profile: PlayerProfile) => void) | undefined;

    mockGetProfile.mockImplementationOnce(
      () =>
        new Promise<PlayerProfile>((_resolve, reject) => {
          rejectStale = reject;
        })
    );
    mockGetProfile.mockImplementationOnce(
      () =>
        new Promise<PlayerProfile>((resolve) => {
          resolveFresh = resolve;
        })
    );

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    capturedCallback!({ uid: 'uid-old' } as User);
    capturedCallback!({ uid: 'uid-new' } as User);

    resolveFresh!(freshProfile);
    await waitFor(() =>
      expect(screen.getByText('Zalogowano jako Nowy')).toBeInTheDocument()
    );

    // The stale request rejects after the newer one already resolved. It
    // must not clear the profile that is currently displayed.
    rejectStale!(new Error('permission-denied'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByText('Zalogowano jako Nowy')).toBeInTheDocument();
  });

  it('useAuth throws when used outside an AuthProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow(
      'useAuth must be used within an AuthProvider'
    );
    consoleError.mockRestore();
  });
});
