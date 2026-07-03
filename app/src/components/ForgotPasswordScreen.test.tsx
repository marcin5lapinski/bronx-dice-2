// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FirebaseError } from 'firebase/app';
import ForgotPasswordScreen from './ForgotPasswordScreen';
import { sendPasswordReset } from '../services/authService';

vi.mock('../services/authService', () => ({
  sendPasswordReset: vi.fn(),
}));

describe('ForgotPasswordScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the reset email and shows a confirmation', async () => {
    const user = userEvent.setup();
    vi.mocked(sendPasswordReset).mockResolvedValue(undefined);
    render(
      <ForgotPasswordScreen onNavigateToLogin={() => {}} onCancel={() => {}} />
    );

    await user.type(screen.getByLabelText('E-mail'), 'ola@example.com');
    await user.click(
      screen.getByRole('button', { name: 'Wyślij link resetujący' })
    );

    expect(sendPasswordReset).toHaveBeenCalledWith('ola@example.com');
    expect(
      await screen.findByText(
        'Jeśli konto o podanym adresie istnieje, wysłaliśmy na nie link do zresetowania hasła.'
      )
    ).toBeInTheDocument();
  });

  it('shows a mapped Polish error message when sending fails', async () => {
    const user = userEvent.setup();
    vi.mocked(sendPasswordReset).mockRejectedValue(
      new FirebaseError('auth/invalid-email', 'invalid')
    );
    render(
      <ForgotPasswordScreen onNavigateToLogin={() => {}} onCancel={() => {}} />
    );

    await user.type(screen.getByLabelText('E-mail'), 'not-an-email');
    await user.click(
      screen.getByRole('button', { name: 'Wyślij link resetujący' })
    );

    expect(
      await screen.findByText('Nieprawidłowy adres e-mail.')
    ).toBeInTheDocument();
  });

  it('navigates back to login', async () => {
    const user = userEvent.setup();
    const onNavigateToLogin = vi.fn();
    render(
      <ForgotPasswordScreen
        onNavigateToLogin={onNavigateToLogin}
        onCancel={() => {}}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Wróć do logowania' }));
    expect(onNavigateToLogin).toHaveBeenCalled();
  });
});
