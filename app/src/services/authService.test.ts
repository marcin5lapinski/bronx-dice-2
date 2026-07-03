import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from 'firebase/auth';
import {
  signInWithEmail,
  registerWithEmail,
  signInWithGoogle,
  sendPasswordReset,
  signOutUser,
  subscribeToAuthState,
} from './authService';

const mockSignIn = vi.fn();
const mockCreateUser = vi.fn();
const mockSignInWithPopup = vi.fn();
const mockSendPasswordResetEmail = vi.fn();
const mockSignOut = vi.fn();
const mockOnAuthStateChanged = vi.fn();

vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: (...args: unknown[]) => mockSignIn(...args),
  createUserWithEmailAndPassword: (...args: unknown[]) => mockCreateUser(...args),
  signInWithPopup: (...args: unknown[]) => mockSignInWithPopup(...args),
  GoogleAuthProvider: vi.fn().mockImplementation(function() { return this; }),
  sendPasswordResetEmail: (...args: unknown[]) => mockSendPasswordResetEmail(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
  onAuthStateChanged: (...args: unknown[]) => mockOnAuthStateChanged(...args),
}));

vi.mock('../firebase/client', () => ({
  auth: 'the-auth-instance',
  db: {},
}));

const fakeUser = { uid: 'uid-1' } as User;

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('signInWithEmail signs in and returns the user', async () => {
    mockSignIn.mockResolvedValue({ user: fakeUser });
    const result = await signInWithEmail('ola@example.com', 'secret1');
    expect(mockSignIn).toHaveBeenCalledWith(
      'the-auth-instance',
      'ola@example.com',
      'secret1'
    );
    expect(result).toBe(fakeUser);
  });

  it('registerWithEmail creates the account and returns the user', async () => {
    mockCreateUser.mockResolvedValue({ user: fakeUser });
    const result = await registerWithEmail('ola@example.com', 'secret1');
    expect(mockCreateUser).toHaveBeenCalledWith(
      'the-auth-instance',
      'ola@example.com',
      'secret1'
    );
    expect(result).toBe(fakeUser);
  });

  it('signInWithGoogle opens the Google popup and returns the user', async () => {
    mockSignInWithPopup.mockResolvedValue({ user: fakeUser });
    const result = await signInWithGoogle();
    expect(mockSignInWithPopup).toHaveBeenCalledWith(
      'the-auth-instance',
      expect.any(Object)
    );
    expect(result).toBe(fakeUser);
  });

  it('sendPasswordReset delegates to the Firebase SDK', async () => {
    mockSendPasswordResetEmail.mockResolvedValue(undefined);
    await sendPasswordReset('ola@example.com');
    expect(mockSendPasswordResetEmail).toHaveBeenCalledWith(
      'the-auth-instance',
      'ola@example.com'
    );
  });

  it('signOutUser delegates to the Firebase SDK', async () => {
    mockSignOut.mockResolvedValue(undefined);
    await signOutUser();
    expect(mockSignOut).toHaveBeenCalledWith('the-auth-instance');
  });

  it('subscribeToAuthState wires the callback and returns the unsubscribe function', () => {
    const unsubscribe = vi.fn();
    mockOnAuthStateChanged.mockReturnValue(unsubscribe);
    const callback = vi.fn();
    const result = subscribeToAuthState(callback);
    expect(mockOnAuthStateChanged).toHaveBeenCalledWith('the-auth-instance', callback);
    expect(result).toBe(unsubscribe);
  });
});
