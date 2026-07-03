// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FirebaseError } from 'firebase/app';
import type { User } from 'firebase/auth';
import ProfileSetupScreen from './ProfileSetupScreen';
import { createProfile } from '../services/profileService';
import { useAuth } from '../contexts/AuthContext';
import { AVATAR_OPTIONS } from './avatarOptions';

vi.mock('../services/profileService', () => ({
  createProfile: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

const fakeUser = {
  uid: 'uid-1',
  email: 'ola@example.com',
  displayName: 'Ola G',
} as User;

describe('ProfileSetupScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pre-fills the name from the account display name', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: fakeUser,
      profile: null,
      loading: false,
      refreshProfile: vi.fn(),
    });
    render(<ProfileSetupScreen user={fakeUser} onComplete={() => {}} />);
    expect(screen.getByLabelText('Nazwa wyświetlana')).toHaveValue('Ola G');
  });

  it('creates the profile, refreshes the auth context, and calls onComplete', async () => {
    const user = userEvent.setup();
    const refreshProfile = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useAuth).mockReturnValue({
      user: fakeUser,
      profile: null,
      loading: false,
      refreshProfile,
    });
    vi.mocked(createProfile).mockResolvedValue({
      displayName: 'Ola G',
      avatarId: AVATAR_OPTIONS[0].id,
      email: 'ola@example.com',
      createdAt: 1700000000000,
    });
    const onComplete = vi.fn();

    render(<ProfileSetupScreen user={fakeUser} onComplete={onComplete} />);
    await user.click(screen.getByRole('button', { name: 'Zapisz profil' }));

    expect(createProfile).toHaveBeenCalledWith('uid-1', {
      displayName: 'Ola G',
      avatarId: AVATAR_OPTIONS[0].id,
      email: 'ola@example.com',
    });
    expect(refreshProfile).toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalled();
  });

  it('shows a mapped Polish error message when creation fails', async () => {
    const user = userEvent.setup();
    vi.mocked(useAuth).mockReturnValue({
      user: fakeUser,
      profile: null,
      loading: false,
      refreshProfile: vi.fn(),
    });
    vi.mocked(createProfile).mockRejectedValue(
      new FirebaseError('auth/network-request-failed', 'offline')
    );

    render(<ProfileSetupScreen user={fakeUser} onComplete={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Zapisz profil' }));

    expect(
      await screen.findByText(
        'Brak połączenia. Sprawdź internet i spróbuj ponownie.'
      )
    ).toBeInTheDocument();
  });
});
