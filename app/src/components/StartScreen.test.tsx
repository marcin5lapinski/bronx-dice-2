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
  props: {
    onStart?: (
      names: string[],
      accountPlayerIndex: number | null,
      botFlags: boolean[]
    ) => void;
    onOpenAuth?: () => void;
    onOpenProfile?: () => void;
  } = {}
) {
  return render(
    <AuthProvider>
      <StartScreen
        onStart={props.onStart ?? (() => {})}
        onOpenAuth={props.onOpenAuth ?? (() => {})}
        onOpenProfile={props.onOpenProfile ?? (() => {})}
      />
    </AuthProvider>
  );
}

async function openLocalForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Zagraj lokalnie' }));
}

describe('StartScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hides the local game form until "Zagraj lokalnie" is clicked', () => {
    renderStartScreen();

    expect(screen.queryByLabelText('Gracz 1')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Rozpocznij grę' })
    ).not.toBeInTheDocument();
  });

  it('reveals the local game form when "Zagraj lokalnie" is clicked', async () => {
    const user = userEvent.setup();
    renderStartScreen();

    await openLocalForm(user);

    expect(screen.getByLabelText('Gracz 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rozpocznij grę' })).toBeInTheDocument();
  });

  it('hides the local game form again when "Zagraj lokalnie" is clicked twice', async () => {
    const user = userEvent.setup();
    renderStartScreen();

    await openLocalForm(user);
    await openLocalForm(user);

    expect(screen.queryByLabelText('Gracz 1')).not.toBeInTheDocument();
  });

  it('renders 2 name inputs by default', async () => {
    const user = userEvent.setup();
    renderStartScreen();
    await openLocalForm(user);

    expect(screen.getByLabelText('Gracz 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Gracz 2')).toBeInTheDocument();
    expect(screen.queryByLabelText('Gracz 3')).not.toBeInTheDocument();
  });

  it('adds more name inputs when player count increases, preserving existing names', async () => {
    const user = userEvent.setup();
    renderStartScreen();
    await openLocalForm(user);

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
    await openLocalForm(user);

    await user.clear(screen.getByLabelText('Gracz 1'));

    expect(
      screen.getByRole('button', { name: 'Rozpocznij grę' })
    ).toBeDisabled();
  });

  it('calls onStart with trimmed player names when clicked', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    renderStartScreen({ onStart });
    await openLocalForm(user);

    await user.clear(screen.getByLabelText('Gracz 1'));
    await user.type(screen.getByLabelText('Gracz 1'), '  Ola  ');
    await user.clear(screen.getByLabelText('Gracz 2'));
    await user.type(screen.getByLabelText('Gracz 2'), 'Kuba');

    await user.click(screen.getByRole('button', { name: 'Rozpocznij grę' }));

    expect(onStart).toHaveBeenCalledWith(['Ola', 'Kuba'], null, [false, false]);
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

  it('does not show "Zagraj online" when signed out', () => {
    renderStartScreen();

    expect(
      screen.queryByRole('button', { name: 'Zagraj online' })
    ).not.toBeInTheDocument();
  });

  it('shows "Zagraj online" and calls onOpenAuth when signed in', async () => {
    vi.mocked(subscribeToAuthState).mockImplementationOnce((callback) => {
      callback({ uid: 'uid-1' } as User);
      return () => {};
    });

    const user = userEvent.setup();
    const onOpenAuth = vi.fn();
    renderStartScreen({ onOpenAuth });

    await user.click(screen.getByRole('button', { name: 'Zagraj online' }));

    expect(onOpenAuth).toHaveBeenCalled();
  });

  it('calls onOpenProfile instead of onOpenAuth when "Profil gracza" is clicked', async () => {
    vi.mocked(subscribeToAuthState).mockImplementationOnce((callback) => {
      callback({ uid: 'uid-1' } as User);
      return () => {};
    });

    const user = userEvent.setup();
    const onOpenAuth = vi.fn();
    const onOpenProfile = vi.fn();
    renderStartScreen({ onOpenAuth, onOpenProfile });

    await user.click(screen.getByRole('button', { name: 'Profil gracza' }));

    expect(onOpenProfile).toHaveBeenCalled();
    expect(onOpenAuth).not.toHaveBeenCalled();
  });

  it('renders a drag handle for each player row, labeled by position', async () => {
    const user = userEvent.setup();
    renderStartScreen();
    await openLocalForm(user);

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
    await openLocalForm(user);

    await user.clear(screen.getByLabelText('Gracz 1'));
    await user.type(screen.getByLabelText('Gracz 1'), 'Ola');
    await user.clear(screen.getByLabelText('Gracz 2'));
    await user.type(screen.getByLabelText('Gracz 2'), 'Kuba');
    await user.selectOptions(screen.getByLabelText('Liczba graczy'), '3');
    await user.clear(screen.getByLabelText('Gracz 3'));
    await user.type(screen.getByLabelText('Gracz 3'), 'Ala');

    await user.click(screen.getByRole('button', { name: 'Rozpocznij grę' }));

    expect(onStart).toHaveBeenCalledWith(['Ola', 'Kuba', 'Ala'], null, [false, false, false]);
  });

  it('disables the drag handles when "Losuj kolejność" is checked', async () => {
    const user = userEvent.setup();
    renderStartScreen();
    await openLocalForm(user);

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
    await openLocalForm(user);

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
    await openLocalForm(user);

    await user.clear(screen.getByLabelText('Gracz 1'));
    await user.type(screen.getByLabelText('Gracz 1'), 'Ola');
    await user.clear(screen.getByLabelText('Gracz 2'));
    await user.type(screen.getByLabelText('Gracz 2'), 'Kuba');
    await user.click(screen.getByLabelText('Losuj kolejność'));
    await user.click(screen.getByRole('button', { name: 'Rozpocznij grę' }));

    // Fisher-Yates on 2 items with random()=0: i=1, j=floor(0*2)=0, swap(1,0)
    expect(onStart).toHaveBeenCalledWith(['Kuba', 'Ola'], null, [false, false]);
  });

  it('does not shuffle when "Losuj kolejność" is left unchecked', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    renderStartScreen({ onStart });
    await openLocalForm(user);

    await user.clear(screen.getByLabelText('Gracz 1'));
    await user.type(screen.getByLabelText('Gracz 1'), 'Ola');
    await user.clear(screen.getByLabelText('Gracz 2'));
    await user.type(screen.getByLabelText('Gracz 2'), 'Kuba');
    await user.click(screen.getByRole('button', { name: 'Rozpocznij grę' }));

    expect(onStart).toHaveBeenCalledWith(['Ola', 'Kuba'], null, [false, false]);
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

    const user = userEvent.setup();
    renderStartScreen();
    await openLocalForm(user);

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
    await openLocalForm(user);

    await waitFor(() =>
      expect(screen.getByLabelText('Gracz 1')).toHaveValue('Ola Nick')
    );

    await user.clear(screen.getByLabelText('Gracz 1'));
    await user.type(screen.getByLabelText('Gracz 1'), 'Custom');

    expect(screen.getByLabelText('Gracz 1')).toHaveValue('Custom');
  });

  it('does not touch "Gracz 1" when signed out', async () => {
    const user = userEvent.setup();
    renderStartScreen();
    await openLocalForm(user);

    expect(screen.getByLabelText('Gracz 1')).toHaveValue('Gracz 1');
  });

  it("passes the signed-in player's row index as accountPlayerIndex", async () => {
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
    const onStart = vi.fn();
    renderStartScreen({ onStart });
    await openLocalForm(user);

    await waitFor(() =>
      expect(screen.getByLabelText('Gracz 1')).toHaveValue('Ola Nick')
    );
    await user.clear(screen.getByLabelText('Gracz 2'));
    await user.type(screen.getByLabelText('Gracz 2'), 'Kuba');
    await user.click(screen.getByRole('button', { name: 'Rozpocznij grę' }));

    expect(onStart).toHaveBeenCalledWith(['Ola Nick', 'Kuba'], 0, [false, false]);
  });

  it('keeps tracking the account row after it is manually renamed', async () => {
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
    const onStart = vi.fn();
    renderStartScreen({ onStart });
    await openLocalForm(user);

    await waitFor(() =>
      expect(screen.getByLabelText('Gracz 1')).toHaveValue('Ola Nick')
    );
    await user.clear(screen.getByLabelText('Gracz 1'));
    await user.type(screen.getByLabelText('Gracz 1'), 'Pseudonim');
    await user.clear(screen.getByLabelText('Gracz 2'));
    await user.type(screen.getByLabelText('Gracz 2'), 'Kuba');
    await user.click(screen.getByRole('button', { name: 'Rozpocznij grę' }));

    expect(onStart).toHaveBeenCalledWith(['Pseudonim', 'Kuba'], 0, [false, false]);
  });

  it('keeps tracking the account row through "Losuj kolejność"', async () => {
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
    const onStart = vi.fn();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    renderStartScreen({ onStart });
    await openLocalForm(user);

    await waitFor(() =>
      expect(screen.getByLabelText('Gracz 1')).toHaveValue('Ola Nick')
    );
    await user.clear(screen.getByLabelText('Gracz 2'));
    await user.type(screen.getByLabelText('Gracz 2'), 'Kuba');
    await user.click(screen.getByLabelText('Losuj kolejność'));
    await user.click(screen.getByRole('button', { name: 'Rozpocznij grę' }));

    // Fisher-Yates on 2 items with random()=0: i=1, j=0, swap(1,0) -> ['Kuba', 'Ola Nick']
    expect(onStart).toHaveBeenCalledWith(['Kuba', 'Ola Nick'], 1, [false, false]);
  });

  it('shows a Bot checkbox for every row except the tracked account row', async () => {
    const user = userEvent.setup();
    renderStartScreen();
    await openLocalForm(user);

    // Row 0 ("Gracz 1") is always the tracked account row (accountRowId is
    // fixed to row 0 at mount, regardless of sign-in state), so with the
    // default 2 rows only row 1 shows a Bot checkbox.
    expect(screen.getAllByRole('checkbox', { name: 'Bot' })).toHaveLength(1);

    await user.selectOptions(screen.getByLabelText('Liczba graczy'), '3');

    expect(screen.getAllByRole('checkbox', { name: 'Bot' })).toHaveLength(2);
  });

  it('passes botFlags matching which rows are checked as Bot', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    renderStartScreen({ onStart });
    await openLocalForm(user);

    await user.clear(screen.getByLabelText('Gracz 1'));
    await user.type(screen.getByLabelText('Gracz 1'), 'Ola');
    await user.clear(screen.getByLabelText('Gracz 2'));
    await user.type(screen.getByLabelText('Gracz 2'), 'Kuba');
    // Row 0 ("Ola") never shows a Bot checkbox (it's the tracked account
    // row), so the only checkbox present belongs to row 1 ("Kuba").
    await user.click(screen.getAllByRole('checkbox', { name: 'Bot' })[0]);
    await user.click(screen.getByRole('button', { name: 'Rozpocznij grę' }));

    expect(onStart).toHaveBeenCalledWith(['Ola', 'Kuba'], null, [false, true]);
  });

  it('opens the how-to-play modal when "Jak grać?" is clicked', async () => {
    const user = userEvent.setup();
    renderStartScreen();

    await user.click(screen.getByRole('button', { name: 'Jak grać?' }));

    expect(screen.getByRole('dialog', { name: 'Jak grać?' })).toBeInTheDocument();
  });

  it('closes the how-to-play modal when "Zamknij" is clicked', async () => {
    const user = userEvent.setup();
    renderStartScreen();

    await user.click(screen.getByRole('button', { name: 'Jak grać?' }));
    await user.click(screen.getByRole('button', { name: 'Zamknij' }));

    expect(screen.queryByRole('dialog', { name: 'Jak grać?' })).not.toBeInTheDocument();
  });
});
