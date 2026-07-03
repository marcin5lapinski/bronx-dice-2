import { FirebaseError } from 'firebase/app';

const MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'Nieprawidłowy adres e-mail.',
  'auth/user-not-found': 'Nieprawidłowy e-mail lub hasło.',
  'auth/wrong-password': 'Nieprawidłowy e-mail lub hasło.',
  'auth/invalid-credential': 'Nieprawidłowy e-mail lub hasło.',
  'auth/email-already-in-use': 'Konto z tym adresem e-mail już istnieje.',
  'auth/weak-password': 'Hasło musi mieć co najmniej 6 znaków.',
  'auth/too-many-requests': 'Zbyt wiele prób. Spróbuj ponownie za chwilę.',
  'auth/network-request-failed':
    'Brak połączenia. Sprawdź internet i spróbuj ponownie.',
};

const FALLBACK_MESSAGE = 'Coś poszło nie tak. Spróbuj ponownie.';

export function authErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    return MESSAGES[error.code] ?? FALLBACK_MESSAGE;
  }
  return FALLBACK_MESSAGE;
}
