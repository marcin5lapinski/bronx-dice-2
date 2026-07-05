// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from 'firebase/auth';
import StatsScreen from './StatsScreen';
import { useAuth } from '../contexts/AuthContext';
import { getStats } from '../services/statsService';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../services/statsService', () => ({
  getStats: vi.fn(),
}));

const fakeUser = { uid: 'uid-1' } as User;

describe('StatsScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows local and online stats once loaded', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: fakeUser,
      profile: null,
      loading: false,
      refreshProfile: vi.fn(),
    });
    vi.mocked(getStats).mockImplementation(async (_uid, mode) =>
      mode === 'local'
        ? {
            gamesPlayed: 5,
            wins: 2,
            averageScore: 88.4,
            history: [{ id: 'g1', score: 100, won: true, playedAt: 1700000000000 }],
          }
        : { gamesPlayed: 3, wins: 1, averageScore: 70, history: [] }
    );

    render(<StatsScreen onBack={() => {}} />);

    expect(await screen.findByText('Liczba gier: 5')).toBeInTheDocument();
    expect(screen.getByText('Wygrane: 2')).toBeInTheDocument();
    expect(screen.getByText('Średnia punktów: 88.4')).toBeInTheDocument();
    expect(screen.getByText('Liczba gier: 3')).toBeInTheDocument();
    expect(screen.getByText('Wygrane: 1')).toBeInTheDocument();
    expect(screen.getByText('Średnia punktów: 70.0')).toBeInTheDocument();
    expect(screen.getByText('Brak rozegranych gier.')).toBeInTheDocument();
  });

  it('calls onBack when the back button is clicked', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: fakeUser,
      profile: null,
      loading: false,
      refreshProfile: vi.fn(),
    });
    vi.mocked(getStats).mockResolvedValue({
      gamesPlayed: 0,
      wins: 0,
      averageScore: 0,
      history: [],
    });
    const user = userEvent.setup();
    const onBack = vi.fn();

    render(<StatsScreen onBack={onBack} />);
    await user.click(screen.getByRole('button', { name: 'Wstecz' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows an error message when a stats fetch fails', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: fakeUser,
      profile: null,
      loading: false,
      refreshProfile: vi.fn(),
    });
    vi.mocked(getStats).mockImplementation(async (_uid, mode) => {
      if (mode === 'local') {
        throw new Error('network error');
      }
      return { gamesPlayed: 0, wins: 0, averageScore: 0, history: [] };
    });

    render(<StatsScreen onBack={() => {}} />);

    expect(
      await screen.findByText('Nie udało się wczytać statystyk.')
    ).toBeInTheDocument();
  });
});
