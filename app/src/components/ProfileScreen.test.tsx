// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from 'firebase/auth';
import ProfileScreen from './ProfileScreen';
import { updateProfile } from '../services/profileService';
import { signOutUser } from '../services/authService';
import { useAuth } from '../contexts/AuthContext';
import type { PlayerProfile } from '../types/auth';

vi.mock('../services/profileService', () => ({
  updateProfile: vi.fn(),
}));

vi.mock('../services/authService', () => ({
  signOutUser: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

const fakeUser = { uid: 'uid-1' } as User;
const fakeProfile: PlayerProfile = {
  displayName: 'Ola',
  avatarId: 'avatar01',
  email: 'ola@example.com',
  createdAt: 1700000000000,
};

describe('ProfileScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the profile summary', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: fakeUser,
      profile: fakeProfile,
      loading: false,
      refreshProfile: vi.fn(),
    });
    render(<ProfileScreen onSignedOut={() => {}} onBackToLocal={() => {}} />);
    expect(screen.getByText('Ola')).toBeInTheDocument();
    expect(screen.getByText('ola@example.com')).toBeInTheDocument();
    expect(screen.getByAltText('Avatar gracza')).toHaveAttribute(
      'src',
      '/dice/avatars/avatar01.png'
    );
  });

  it('renders nothing when there is no signed-in user or profile', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      profile: null,
      loading: false,
      refreshProfile: vi.fn(),
    });
    const { container } = render(
      <ProfileScreen onSignedOut={() => {}} onBackToLocal={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('switches to edit mode and saves changes', async () => {
    const user = userEvent.setup();
    const refreshProfile = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useAuth).mockReturnValue({
      user: fakeUser,
      profile: fakeProfile,
      loading: false,
      refreshProfile,
    });
    vi.mocked(updateProfile).mockResolvedValue(undefined);

    render(<ProfileScreen onSignedOut={() => {}} onBackToLocal={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Edytuj profil' }));

    const nameInput = screen.getByLabelText('Nazwa wyświetlana');
    await user.clear(nameInput);
    await user.type(nameInput, 'Nowa Ola');
    await user.click(screen.getByRole('button', { name: 'Zapisz zmiany' }));

    expect(updateProfile).toHaveBeenCalledWith('uid-1', {
      displayName: 'Nowa Ola',
      avatarId: 'avatar01',
    });
    expect(refreshProfile).toHaveBeenCalled();
  });

  it('signs out and calls onSignedOut', async () => {
    const user = userEvent.setup();
    const onSignedOut = vi.fn();
    vi.mocked(useAuth).mockReturnValue({
      user: fakeUser,
      profile: fakeProfile,
      loading: false,
      refreshProfile: vi.fn(),
    });
    vi.mocked(signOutUser).mockResolvedValue(undefined);

    render(
      <ProfileScreen onSignedOut={onSignedOut} onBackToLocal={() => {}} />
    );
    await user.click(screen.getByRole('button', { name: 'Wyloguj' }));

    expect(signOutUser).toHaveBeenCalled();
    expect(onSignedOut).toHaveBeenCalled();
  });
});
