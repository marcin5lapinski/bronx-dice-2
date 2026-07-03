// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FirebaseError } from 'firebase/app';
import type { User } from 'firebase/auth';
import LoginScreen from './LoginScreen';
import { signInWithEmail, signInWithGoogle } from '../services/authService';

vi.mock('../services/authService', () => ({
  signInWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
}));

describe('LoginScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('signs in with email and password and reports success', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    vi.mocked(signInWithEmail).mockResolvedValue({} as User);
    render(
      <LoginScreen
        onSuccess={onSuccess}
        onNavigateToRegister={() => {}}
        onNavigateToForgotPassword={() => {}}
        onCancel={() => {}}
      />
    );

    await user.type(screen.getByLabelText('E-mail'), 'ola@example.com');
    await user.type(screen.getByLabelText('Hasło'), 'secret1');
    await user.click(screen.getByRole('button', { name: 'Zaloguj się' }));

    expect(signInWithEmail).toHaveBeenCalledWith('ola@example.com', 'secret1');
    expect(onSuccess).toHaveBeenCalled();
  });

  it('shows a mapped Polish error message when sign-in fails', async () => {
    const user = userEvent.setup();
    vi.mocked(signInWithEmail).mockRejectedValue(
      new FirebaseError('auth/wrong-password', 'Wrong password')
    );
    render(
      <LoginScreen
        onSuccess={() => {}}
        onNavigateToRegister={() => {}}
        onNavigateToForgotPassword={() => {}}
        onCancel={() => {}}
      />
    );

    await user.type(screen.getByLabelText('E-mail'), 'ola@example.com');
    await user.type(screen.getByLabelText('Hasło'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Zaloguj się' }));

    expect(
      await screen.findByText('Nieprawidłowy e-mail lub hasło.')
    ).toBeInTheDocument();
  });

  it('navigates to the register screen', async () => {
    const user = userEvent.setup();
    const onNavigateToRegister = vi.fn();
    render(
      <LoginScreen
        onSuccess={() => {}}
        onNavigateToRegister={onNavigateToRegister}
        onNavigateToForgotPassword={() => {}}
        onCancel={() => {}}
      />
    );
    await user.click(
      screen.getByRole('button', { name: 'Nie masz konta? Zarejestruj się' })
    );
    expect(onNavigateToRegister).toHaveBeenCalled();
  });

  it('signs in with Google', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    vi.mocked(signInWithGoogle).mockResolvedValue({} as User);
    render(
      <LoginScreen
        onSuccess={onSuccess}
        onNavigateToRegister={() => {}}
        onNavigateToForgotPassword={() => {}}
        onCancel={() => {}}
      />
    );
    await user.click(
      screen.getByRole('button', { name: 'Zaloguj się przez Google' })
    );
    expect(signInWithGoogle).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalled();
  });
});
