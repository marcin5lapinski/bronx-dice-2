// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FirebaseError } from 'firebase/app';
import type { User } from 'firebase/auth';
import RegisterScreen from './RegisterScreen';
import { registerWithEmail } from '../services/authService';

vi.mock('../services/authService', () => ({
  registerWithEmail: vi.fn(),
}));

describe('RegisterScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers with email and password and reports success', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    vi.mocked(registerWithEmail).mockResolvedValue({} as User);
    render(
      <RegisterScreen
        onSuccess={onSuccess}
        onNavigateToLogin={() => {}}
        onCancel={() => {}}
      />
    );

    await user.type(screen.getByLabelText('E-mail'), 'ola@example.com');
    await user.type(screen.getByLabelText('Hasło'), 'secret1');
    await user.type(screen.getByLabelText('Powtórz hasło'), 'secret1');
    await user.click(screen.getByRole('button', { name: 'Zarejestruj się' }));

    expect(registerWithEmail).toHaveBeenCalledWith('ola@example.com', 'secret1');
    expect(onSuccess).toHaveBeenCalled();
  });

  it('shows an error and does not call registerWithEmail when passwords do not match', async () => {
    const user = userEvent.setup();
    render(
      <RegisterScreen
        onSuccess={() => {}}
        onNavigateToLogin={() => {}}
        onCancel={() => {}}
      />
    );

    await user.type(screen.getByLabelText('E-mail'), 'ola@example.com');
    await user.type(screen.getByLabelText('Hasło'), 'secret1');
    await user.type(screen.getByLabelText('Powtórz hasło'), 'inne-haslo');
    await user.click(screen.getByRole('button', { name: 'Zarejestruj się' }));

    expect(screen.getByText('Hasła nie są identyczne.')).toBeInTheDocument();
    expect(registerWithEmail).not.toHaveBeenCalled();
  });

  it('shows a mapped Polish error message when registration fails', async () => {
    const user = userEvent.setup();
    vi.mocked(registerWithEmail).mockRejectedValue(
      new FirebaseError('auth/email-already-in-use', 'in use')
    );
    render(
      <RegisterScreen
        onSuccess={() => {}}
        onNavigateToLogin={() => {}}
        onCancel={() => {}}
      />
    );

    await user.type(screen.getByLabelText('E-mail'), 'ola@example.com');
    await user.type(screen.getByLabelText('Hasło'), 'secret1');
    await user.type(screen.getByLabelText('Powtórz hasło'), 'secret1');
    await user.click(screen.getByRole('button', { name: 'Zarejestruj się' }));

    expect(
      await screen.findByText('Konto z tym adresem e-mail już istnieje.')
    ).toBeInTheDocument();
  });

  it('navigates to the login screen', async () => {
    const user = userEvent.setup();
    const onNavigateToLogin = vi.fn();
    render(
      <RegisterScreen
        onSuccess={() => {}}
        onNavigateToLogin={onNavigateToLogin}
        onCancel={() => {}}
      />
    );
    await user.click(
      screen.getByRole('button', { name: 'Masz już konto? Zaloguj się' })
    );
    expect(onNavigateToLogin).toHaveBeenCalled();
  });
});
