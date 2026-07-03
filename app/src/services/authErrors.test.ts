import { describe, it, expect } from 'vitest';
import { FirebaseError } from 'firebase/app';
import { authErrorMessage } from './authErrors';

function firebaseError(code: string): FirebaseError {
  return new FirebaseError(code, 'message');
}

describe('authErrorMessage', () => {
  it('maps known Firebase error codes to Polish messages', () => {
    expect(authErrorMessage(firebaseError('auth/invalid-email'))).toBe(
      'Nieprawidłowy adres e-mail.'
    );
    expect(authErrorMessage(firebaseError('auth/user-not-found'))).toBe(
      'Nieprawidłowy e-mail lub hasło.'
    );
    expect(authErrorMessage(firebaseError('auth/wrong-password'))).toBe(
      'Nieprawidłowy e-mail lub hasło.'
    );
    expect(authErrorMessage(firebaseError('auth/invalid-credential'))).toBe(
      'Nieprawidłowy e-mail lub hasło.'
    );
    expect(authErrorMessage(firebaseError('auth/email-already-in-use'))).toBe(
      'Konto z tym adresem e-mail już istnieje.'
    );
    expect(authErrorMessage(firebaseError('auth/weak-password'))).toBe(
      'Hasło musi mieć co najmniej 6 znaków.'
    );
    expect(authErrorMessage(firebaseError('auth/too-many-requests'))).toBe(
      'Zbyt wiele prób. Spróbuj ponownie za chwilę.'
    );
    expect(authErrorMessage(firebaseError('auth/network-request-failed'))).toBe(
      'Brak połączenia. Sprawdź internet i spróbuj ponownie.'
    );
  });

  it('falls back to a generic message for unknown Firebase error codes', () => {
    expect(authErrorMessage(firebaseError('auth/mystery-error'))).toBe(
      'Coś poszło nie tak. Spróbuj ponownie.'
    );
  });

  it('falls back to a generic message for non-Firebase errors', () => {
    expect(authErrorMessage(new Error('boom'))).toBe(
      'Coś poszło nie tak. Spróbuj ponownie.'
    );
    expect(authErrorMessage('a string')).toBe('Coś poszło nie tak. Spróbuj ponownie.');
  });
});
