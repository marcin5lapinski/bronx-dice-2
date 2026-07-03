# Etap 4 — Uwierzytelnianie i profil gracza — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Firebase Authentication (Google + email/password) and a Firestore-backed player profile (display name + preset-icon avatar) to the app, reachable via a new "Zaloguj się" entry point on `StartScreen`, while leaving the existing local hot-seat flow completely untouched and login-free.

**Architecture:** A service layer (`src/services/authService.ts`, `src/services/profileService.ts`, `src/services/authErrors.ts`) wraps the Firebase SDK with plain async functions, mirroring the existing `engine/` vs `components/` split so auth/profile logic is unit-testable by mocking the SDK, never by hitting real Firebase. A React Context (`src/contexts/AuthContext.tsx`) subscribes to Firebase's auth-state listener once and exposes `{ user, profile, loading, refreshProfile }` via `useAuth()`. Five new screen components (`LoginScreen`, `RegisterScreen`, `ForgotPasswordScreen`, `ProfileSetupScreen`, `ProfileScreen`) are switched by local state in `App.tsx`, the same pattern already used for `StartScreen` ↔ `GameScreen` — no router.

**Tech Stack:** `firebase` (JS SDK v12, modular API: `firebase/app`, `firebase/auth`, `firebase/firestore`) for the client; `firebase-tools` (dev dependency) for the local Emulator Suite. React 19 + TypeScript, Vitest + Testing Library (unchanged from Etap 1–3). No new UI libraries, no router.

Source of truth: `docs/superpowers/specs/2026-07-03-etap-4-uwierzytelnianie-design.md`.

## Global Constraints

- **Tryb lokalny pozostaje bez logowania.** Nic w `GameScreen`, `DiceTray`, `RollButton`, `ScoreBoard`, `WinnerScreen`, or the engine (`app/src/engine/*`, `app/src/types/game.ts`) changes in this plan.
- **All 117 existing tests keep passing** after every task. `App.test.tsx` and `StartScreen.test.tsx` gain the minimum changes needed to accommodate the new `onOpenAuth` prop and `AuthProvider` wrapper — no existing assertion's expected value changes.
- **No real network/Firebase calls in `npm test`.** Every test that touches `firebase/auth`, `firebase/firestore`, or `../firebase/client` mocks them with `vi.mock`.
- **Firebase config via env vars**, never hardcoded: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, plus `VITE_USE_FIREBASE_EMULATORS` (`'true'`/`'false'`) to toggle the local Emulator Suite.
- **Avatar is a preset-icon picker, not an upload.** Firestore only ever stores an `avatarId` string key (see `AVATAR_OPTIONS` in Task 2) — no Firebase Storage.
- **Firestore document shape (`users/{uid}`):** `{ displayName: string, avatarId: string, email: string, createdAt: Timestamp }`.
- **Error-code → message mapping (Polish, `authErrorMessage` from Task 3):**
  | Firebase code | Message |
  |---|---|
  | `auth/invalid-email` | Nieprawidłowy adres e-mail. |
  | `auth/user-not-found`, `auth/wrong-password`, `auth/invalid-credential` | Nieprawidłowy e-mail lub hasło. |
  | `auth/email-already-in-use` | Konto z tym adresem e-mail już istnieje. |
  | `auth/weak-password` | Hasło musi mieć co najmniej 6 znaków. |
  | `auth/too-many-requests` | Zbyt wiele prób. Spróbuj ponownie za chwilę. |
  | `auth/network-request-failed` | Brak połączenia. Sprawdź internet i spróbuj ponownie. |
  | anything else | Coś poszło nie tak. Spróbuj ponownie. |
- **Every screen with an auth flow can return to `StartScreen`** via an explicit `onCancel`/`onBackToLocal` prop — logging in is a side door, not a replacement for local play.
- **Registration never collects the display name/avatar directly** — every new account (email/password registration, or a Google account's first ever sign-in) is routed through `ProfileSetupScreen` once `AuthContext` reports a signed-in user with no Firestore profile yet.

---

### Task 1: Firebase SDK dependency, env config, and the client module

**Files:**
- Modify: `app/package.json`
- Create: `app/.env.example`
- Create: `app/src/vite-env.d.ts`
- Create: `app/src/firebase/client.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `app/src/firebase/client.ts` exporting `auth` (Firebase `Auth` instance) and `db` (Firebase `Firestore` instance), consumed by Task 4 (`authService.ts`) and Task 5 (`profileService.ts`). Also produces the `ImportMetaEnv` typing every later env-var read relies on.

No automated test — this is SDK/config scaffolding, verified by typecheck, lint, and the full existing suite. The emulator connection this task wires up can only be exercised manually once Task 15 adds `firebase.json` (the emulator server config); that's expected and not a blocker here.

- [ ] **Step 1: Add the `firebase` dependency**

Run:
```bash
cd app
npm install firebase@^12.15.0
```

- [ ] **Step 2: Document the required env vars**

Create `app/.env.example`:

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_USE_FIREBASE_EMULATORS=true
```

Copy it to `app/.env.local` (already gitignored via the existing `*.local` pattern in `app/.gitignore`) and leave the values blank for now — Task 15 explains how to run the Emulator Suite, which doesn't require real values.

- [ ] **Step 3: Type the custom env vars**

Create `app/src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_USE_FIREBASE_EMULATORS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 4: Create the Firebase client module**

Create `app/src/firebase/client.ts`:

```ts
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
```

- [ ] **Step 5: Verify typecheck, lint, and the existing suite still pass**

Run:
```bash
npm run build
npm run lint
npm test
```
Expected: `tsc -b` succeeds, `oxlint` reports no issues, all 117 existing tests still pass (nothing imports `firebase/client.ts` yet, so it has no runtime effect).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .env.example src/vite-env.d.ts src/firebase/client.ts
git commit -m "Add Firebase SDK dependency, env-based config, and client module"
```

---

### Task 2: Player profile type and avatar options

**Files:**
- Create: `app/src/types/auth.ts`
- Create: `app/src/components/avatarOptions.ts`
- Test: `app/src/components/avatarOptions.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `PlayerProfile` interface (`{ displayName: string; avatarId: string; email: string; createdAt: number }`) from `app/src/types/auth.ts`, consumed by Task 5 (`profileService.ts`), Task 6 (`AuthContext.tsx`), Task 13 (`ProfileScreen.tsx`). Produces `AVATAR_OPTIONS: AvatarOption[]` and `avatarEmoji(avatarId: string): string` from `app/src/components/avatarOptions.ts`, consumed by Task 8 (`ProfileForm.tsx`), Task 12 (`ProfileSetupScreen.tsx`), Task 13 (`ProfileScreen.tsx`).

- [ ] **Step 1: Create the `PlayerProfile` type**

Create `app/src/types/auth.ts`:

```ts
export interface PlayerProfile {
  displayName: string;
  avatarId: string;
  email: string;
  createdAt: number;
}
```

- [ ] **Step 2: Write the failing test for avatar options**

Create `app/src/components/avatarOptions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { AVATAR_OPTIONS, avatarEmoji } from './avatarOptions';

describe('avatarOptions', () => {
  it('has at least 12 distinct avatar options with unique ids', () => {
    expect(AVATAR_OPTIONS.length).toBeGreaterThanOrEqual(12);
    const ids = AVATAR_OPTIONS.map((option) => option.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('avatarEmoji returns the emoji for a known id', () => {
    expect(avatarEmoji('fox')).toBe('🦊');
  });

  it('avatarEmoji falls back to a placeholder for an unknown id', () => {
    expect(avatarEmoji('does-not-exist')).toBe('❓');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/components/avatarOptions.test.ts`
Expected: FAIL — `Cannot find module './avatarOptions'`.

- [ ] **Step 4: Implement the avatar options**

Create `app/src/components/avatarOptions.ts`:

```ts
export interface AvatarOption {
  id: string;
  emoji: string;
}

export const AVATAR_OPTIONS: AvatarOption[] = [
  { id: 'fox', emoji: '🦊' },
  { id: 'wolf', emoji: '🐺' },
  { id: 'owl', emoji: '🦉' },
  { id: 'cat', emoji: '🐱' },
  { id: 'dog', emoji: '🐶' },
  { id: 'lion', emoji: '🦁' },
  { id: 'tiger', emoji: '🐯' },
  { id: 'panda', emoji: '🐼' },
  { id: 'koala', emoji: '🐨' },
  { id: 'frog', emoji: '🐸' },
  { id: 'octopus', emoji: '🐙' },
  { id: 'dragon', emoji: '🐉' },
];

export function avatarEmoji(avatarId: string): string {
  return AVATAR_OPTIONS.find((option) => option.id === avatarId)?.emoji ?? '❓';
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/avatarOptions.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/types/auth.ts src/components/avatarOptions.ts src/components/avatarOptions.test.ts
git commit -m "Add PlayerProfile type and preset avatar options"
```

---

### Task 3: Firebase Auth error message mapping

**Files:**
- Create: `app/src/services/authErrors.ts`
- Test: `app/src/services/authErrors.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `authErrorMessage(error: unknown): string`, consumed by every screen task (9–13).

- [ ] **Step 1: Write the failing test**

Create `app/src/services/authErrors.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/services/authErrors.test.ts`
Expected: FAIL — `Cannot find module './authErrors'`.

- [ ] **Step 3: Implement the mapping**

Create `app/src/services/authErrors.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/services/authErrors.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/authErrors.ts src/services/authErrors.test.ts
git commit -m "Add Firebase Auth error code to Polish message mapping"
```

---

### Task 4: `authService` — thin wrapper around Firebase Auth

**Files:**
- Create: `app/src/services/authService.ts`
- Test: `app/src/services/authService.test.ts`

**Interfaces:**
- Consumes: `auth` from `app/src/firebase/client.ts` (Task 1).
- Produces: `signInWithEmail(email: string, password: string): Promise<User>`, `registerWithEmail(email: string, password: string): Promise<User>`, `signInWithGoogle(): Promise<User>`, `sendPasswordReset(email: string): Promise<void>`, `signOutUser(): Promise<void>`, `subscribeToAuthState(callback: (user: User | null) => void): () => void` (all from `firebase/auth`'s `User` type) — consumed by Task 6 (`subscribeToAuthState`), Task 9 (`signInWithEmail`, `signInWithGoogle`), Task 10 (`registerWithEmail`), Task 11 (`sendPasswordReset`), Task 13 (`signOutUser`).

- [ ] **Step 1: Write the failing test**

Create `app/src/services/authService.test.ts`:

```ts
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
  GoogleAuthProvider: vi.fn().mockImplementation(() => ({})),
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/services/authService.test.ts`
Expected: FAIL — `Cannot find module './authService'`.

- [ ] **Step 3: Implement `authService`**

Create `app/src/services/authService.ts`:

```ts
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth } from '../firebase/client';

export async function signInWithEmail(
  email: string,
  password: string
): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function registerWithEmail(
  email: string,
  password: string
): Promise<User> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  const credential = await signInWithPopup(auth, provider);
  return credential.user;
}

export function sendPasswordReset(email: string): Promise<void> {
  return sendPasswordResetEmail(auth, email);
}

export function signOutUser(): Promise<void> {
  return signOut(auth);
}

export function subscribeToAuthState(
  callback: (user: User | null) => void
): () => void {
  return onAuthStateChanged(auth, callback);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/services/authService.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/authService.ts src/services/authService.test.ts
git commit -m "Add authService wrapping Firebase Auth sign-in/out/reset"
```

---

### Task 5: `profileService` — Firestore reads/writes for `users/{uid}`

**Files:**
- Create: `app/src/services/profileService.ts`
- Test: `app/src/services/profileService.test.ts`

**Interfaces:**
- Consumes: `db` from `app/src/firebase/client.ts` (Task 1), `PlayerProfile` from `app/src/types/auth.ts` (Task 2).
- Produces: `getProfile(uid: string): Promise<PlayerProfile | null>`, `createProfile(uid: string, data: { displayName: string; avatarId: string; email: string }): Promise<PlayerProfile>`, `updateProfile(uid: string, data: { displayName: string; avatarId: string }): Promise<void>` — consumed by Task 6 (`getProfile`), Task 12 (`createProfile`), Task 13 (`updateProfile`).

- [ ] **Step 1: Write the failing test**

Create `app/src/services/profileService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getProfile, createProfile, updateProfile } from './profileService';

const mockDoc = vi.fn();
const mockGetDoc = vi.fn();
const mockSetDoc = vi.fn();
const mockUpdateDoc = vi.fn();
const mockTimestampNow = vi.fn();

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  Timestamp: { now: () => mockTimestampNow() },
}));

vi.mock('../firebase/client', () => ({
  auth: {},
  db: 'the-db-instance',
}));

describe('profileService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockReturnValue('doc-ref');
  });

  it('getProfile returns null when the document does not exist', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false });
    const result = await getProfile('uid-1');
    expect(result).toBeNull();
    expect(mockDoc).toHaveBeenCalledWith('the-db-instance', 'users', 'uid-1');
  });

  it('getProfile maps the stored document to a PlayerProfile', async () => {
    const toMillis = vi.fn().mockReturnValue(1700000000000);
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        displayName: 'Ola',
        avatarId: 'fox',
        email: 'ola@example.com',
        createdAt: { toMillis },
      }),
    });
    const result = await getProfile('uid-1');
    expect(result).toEqual({
      displayName: 'Ola',
      avatarId: 'fox',
      email: 'ola@example.com',
      createdAt: 1700000000000,
    });
  });

  it('createProfile writes the profile with a client-generated timestamp', async () => {
    const toMillis = vi.fn().mockReturnValue(1700000000000);
    mockTimestampNow.mockReturnValue({ toMillis });
    mockSetDoc.mockResolvedValue(undefined);

    const result = await createProfile('uid-1', {
      displayName: 'Ola',
      avatarId: 'fox',
      email: 'ola@example.com',
    });

    expect(mockSetDoc).toHaveBeenCalledWith('doc-ref', {
      displayName: 'Ola',
      avatarId: 'fox',
      email: 'ola@example.com',
      createdAt: { toMillis },
    });
    expect(result).toEqual({
      displayName: 'Ola',
      avatarId: 'fox',
      email: 'ola@example.com',
      createdAt: 1700000000000,
    });
  });

  it('updateProfile updates only displayName and avatarId', async () => {
    mockUpdateDoc.mockResolvedValue(undefined);
    await updateProfile('uid-1', { displayName: 'Nowa', avatarId: 'owl' });
    expect(mockUpdateDoc).toHaveBeenCalledWith('doc-ref', {
      displayName: 'Nowa',
      avatarId: 'owl',
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/services/profileService.test.ts`
Expected: FAIL — `Cannot find module './profileService'`.

- [ ] **Step 3: Implement `profileService`**

Create `app/src/services/profileService.ts`:

```ts
import { doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/client';
import type { PlayerProfile } from '../types/auth';

function profileRef(uid: string) {
  return doc(db, 'users', uid);
}

export async function getProfile(uid: string): Promise<PlayerProfile | null> {
  const snapshot = await getDoc(profileRef(uid));
  if (!snapshot.exists()) {
    return null;
  }
  const data = snapshot.data();
  return {
    displayName: data.displayName,
    avatarId: data.avatarId,
    email: data.email,
    createdAt: (data.createdAt as Timestamp).toMillis(),
  };
}

export async function createProfile(
  uid: string,
  data: { displayName: string; avatarId: string; email: string }
): Promise<PlayerProfile> {
  const createdAt = Timestamp.now();
  await setDoc(profileRef(uid), { ...data, createdAt });
  return { ...data, createdAt: createdAt.toMillis() };
}

export async function updateProfile(
  uid: string,
  data: { displayName: string; avatarId: string }
): Promise<void> {
  await updateDoc(profileRef(uid), data);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/services/profileService.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/profileService.ts src/services/profileService.test.ts
git commit -m "Add profileService reading/writing users/{uid} in Firestore"
```

---

### Task 6: `AuthContext` — global auth/profile state

**Files:**
- Create: `app/src/contexts/AuthContext.tsx`
- Test: `app/src/contexts/AuthContext.test.tsx`

**Interfaces:**
- Consumes: `subscribeToAuthState` from `app/src/services/authService.ts` (Task 4), `getProfile` from `app/src/services/profileService.ts` (Task 5), `PlayerProfile` from `app/src/types/auth.ts` (Task 2).
- Produces: `AuthProvider` (component, prop `children: ReactNode`) and `useAuth(): { user: User | null; profile: PlayerProfile | null; loading: boolean; refreshProfile: () => Promise<void> }` — consumed by Task 12, Task 13, Task 14.

- [ ] **Step 1: Write the failing test**

Create `app/src/contexts/AuthContext.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { User } from 'firebase/auth';
import { AuthProvider, useAuth } from './AuthContext';
import type { PlayerProfile } from '../types/auth';

const mockSubscribeToAuthState = vi.fn();
const mockGetProfile = vi.fn();

vi.mock('../services/authService', () => ({
  subscribeToAuthState: (callback: (user: User | null) => void) =>
    mockSubscribeToAuthState(callback),
}));

vi.mock('../services/profileService', () => ({
  getProfile: (uid: string) => mockGetProfile(uid),
}));

function Consumer() {
  const { user, profile, loading } = useAuth();
  if (loading) {
    return <p>Ładowanie…</p>;
  }
  if (!user) {
    return <p>Brak użytkownika</p>;
  }
  return <p>Zalogowano jako {profile?.displayName ?? '(brak profilu)'}</p>;
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts in a loading state', () => {
    mockSubscribeToAuthState.mockReturnValue(() => {});
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );
    expect(screen.getByText('Ładowanie…')).toBeInTheDocument();
  });

  it('loads the profile once the auth state reports a signed-in user', async () => {
    let capturedCallback: ((user: User | null) => void) | undefined;
    mockSubscribeToAuthState.mockImplementation((callback) => {
      capturedCallback = callback;
      return () => {};
    });
    const profile: PlayerProfile = {
      displayName: 'Ola',
      avatarId: 'fox',
      email: 'ola@example.com',
      createdAt: 1700000000000,
    };
    mockGetProfile.mockResolvedValue(profile);

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    capturedCallback!({ uid: 'uid-1' } as User);

    await waitFor(() =>
      expect(screen.getByText('Zalogowano jako Ola')).toBeInTheDocument()
    );
    expect(mockGetProfile).toHaveBeenCalledWith('uid-1');
  });

  it('clears the profile and stops loading when signed out', async () => {
    let capturedCallback: ((user: User | null) => void) | undefined;
    mockSubscribeToAuthState.mockImplementation((callback) => {
      capturedCallback = callback;
      return () => {};
    });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    capturedCallback!(null);

    await waitFor(() =>
      expect(screen.getByText('Brak użytkownika')).toBeInTheDocument()
    );
    expect(mockGetProfile).not.toHaveBeenCalled();
  });

  it('useAuth throws when used outside an AuthProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow(
      'useAuth must be used within an AuthProvider'
    );
    consoleError.mockRestore();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/contexts/AuthContext.test.tsx`
Expected: FAIL — `Cannot find module './AuthContext'`.

- [ ] **Step 3: Implement `AuthContext`**

Create `app/src/contexts/AuthContext.tsx`:

```tsx
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { User } from 'firebase/auth';
import { subscribeToAuthState } from '../services/authService';
import { getProfile } from '../services/profileService';
import type { PlayerProfile } from '../types/auth';

interface AuthContextValue {
  user: User | null;
  profile: PlayerProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToAuthState((nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        setLoading(true);
        getProfile(nextUser.uid)
          .then(setProfile)
          .finally(() => setLoading(false));
      } else {
        setProfile(null);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const refreshProfile = async () => {
    if (user) {
      const loaded = await getProfile(user.uid);
      setProfile(loaded);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/contexts/AuthContext.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/contexts/AuthContext.tsx src/contexts/AuthContext.test.tsx
git commit -m "Add AuthContext exposing user/profile/loading via useAuth"
```

---

### Task 7: Shared auth-screen styling

**Files:**
- Modify: `app/src/styles/components.css`

**Interfaces:**
- Consumes: design tokens from `app/src/styles/theme.css` (`--panel-bg`, `--panel-border`, `--text`, `--text-dim`, `--accent-blue`, `--accent-blue-glow`, `--accent-green`, `--accent-green-bg`, `--accent-green-glow`) — already defined in Etap 3.
- Produces: `.auth-screen`, `.auth-error`, `.profile-form`, `.avatar-grid`, `.avatar-option`, `.avatar-option.selected`, `.profile-avatar` classes, consumed by every screen in Tasks 8–13.

No automated test (pure CSS) — verified by lint, the full existing suite, and a manual visual check once Task 14 wires a screen up to actually render it.

- [ ] **Step 1: Append the auth-screen styles**

Modify `app/src/styles/components.css`, adding at the end of the file:

```css

/* Auth screens (Login/Register/ForgotPassword/ProfileSetup/Profile) */
.auth-screen {
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: center;
  padding: 20px 0;
}

.auth-screen label {
  display: block;
  color: var(--text-dim);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 4px;
  text-align: left;
}

.auth-screen input {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  color: var(--text);
  font-family: inherit;
  font-size: 14px;
  padding: 8px 10px;
  border-radius: 4px;
  width: 100%;
}

.auth-screen input:focus {
  outline: none;
  border-color: var(--accent-blue);
  box-shadow: 0 0 8px var(--accent-blue-glow);
}

.auth-screen button {
  background: var(--accent-green-bg);
  color: var(--accent-green);
  border: 1px solid var(--accent-green);
  box-shadow: 0 0 10px var(--accent-green-glow);
  border-radius: 4px;
  padding: 10px 20px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  font-size: 13px;
}

.auth-screen button:disabled {
  border-color: var(--panel-border);
  color: var(--text-dim);
  box-shadow: none;
  background: transparent;
}

.auth-error {
  color: #ff6161;
  font-size: 13px;
}

.profile-form fieldset {
  border: none;
  padding: 0;
  margin: 0;
}

.profile-form legend {
  color: var(--text-dim);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 8px;
  padding: 0;
}

.avatar-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.avatar-option {
  font-size: 24px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--panel-border);
  border-radius: 4px;
}

.avatar-option.selected {
  border: 2px solid var(--accent-blue);
  box-shadow: 0 0 10px var(--accent-blue-glow);
}

.profile-avatar {
  font-size: 48px;
}
```

- [ ] **Step 2: Verify lint and the existing suite still pass**

Run:
```bash
npm run lint
npm test
```
Expected: no lint issues, all 117 existing tests still pass (no component references these classes yet).

- [ ] **Step 3: Commit**

```bash
git add src/styles/components.css
git commit -m "Add shared auth-screen styling (Electric HUD theme)"
```

---

### Task 8: `ProfileForm` — shared name + avatar picker

**Files:**
- Create: `app/src/components/ProfileForm.tsx`
- Test: `app/src/components/ProfileForm.test.tsx`

**Interfaces:**
- Consumes: `AVATAR_OPTIONS` from `app/src/components/avatarOptions.ts` (Task 2).
- Produces: `ProfileForm` component, props `{ initialDisplayName: string; initialAvatarId: string; submitLabel: string; submitting: boolean; error: string | null; onSubmit: (data: { displayName: string; avatarId: string }) => void }` — consumed by Task 12 (`ProfileSetupScreen`) and Task 13 (`ProfileScreen`).

- [ ] **Step 1: Write the failing test**

Create `app/src/components/ProfileForm.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProfileForm from './ProfileForm';
import { AVATAR_OPTIONS } from './avatarOptions';

describe('ProfileForm', () => {
  it('pre-fills the name and selected avatar from initial props', () => {
    render(
      <ProfileForm
        initialDisplayName="Ola"
        initialAvatarId={AVATAR_OPTIONS[1].id}
        submitLabel="Zapisz"
        submitting={false}
        error={null}
        onSubmit={() => {}}
      />
    );
    expect(screen.getByLabelText('Nazwa wyświetlana')).toHaveValue('Ola');
    expect(
      screen.getByRole('button', { name: AVATAR_OPTIONS[1].emoji })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('selecting a different avatar updates aria-pressed', async () => {
    const user = userEvent.setup();
    render(
      <ProfileForm
        initialDisplayName="Ola"
        initialAvatarId={AVATAR_OPTIONS[0].id}
        submitLabel="Zapisz"
        submitting={false}
        error={null}
        onSubmit={() => {}}
      />
    );
    await user.click(
      screen.getByRole('button', { name: AVATAR_OPTIONS[2].emoji })
    );
    expect(
      screen.getByRole('button', { name: AVATAR_OPTIONS[2].emoji })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: AVATAR_OPTIONS[0].emoji })
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('submits the trimmed name and selected avatar', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <ProfileForm
        initialDisplayName=""
        initialAvatarId={AVATAR_OPTIONS[0].id}
        submitLabel="Zapisz"
        submitting={false}
        error={null}
        onSubmit={onSubmit}
      />
    );
    await user.type(screen.getByLabelText('Nazwa wyświetlana'), '  Ola  ');
    await user.click(
      screen.getByRole('button', { name: AVATAR_OPTIONS[3].emoji })
    );
    await user.click(screen.getByRole('button', { name: 'Zapisz' }));
    expect(onSubmit).toHaveBeenCalledWith({
      displayName: 'Ola',
      avatarId: AVATAR_OPTIONS[3].id,
    });
  });

  it('disables submit when the name is blank', () => {
    render(
      <ProfileForm
        initialDisplayName=""
        initialAvatarId={AVATAR_OPTIONS[0].id}
        submitLabel="Zapisz"
        submitting={false}
        error={null}
        onSubmit={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: 'Zapisz' })).toBeDisabled();
  });

  it('shows the error message when provided', () => {
    render(
      <ProfileForm
        initialDisplayName="Ola"
        initialAvatarId={AVATAR_OPTIONS[0].id}
        submitLabel="Zapisz"
        submitting={false}
        error="Coś poszło nie tak. Spróbuj ponownie."
        onSubmit={() => {}}
      />
    );
    expect(
      screen.getByText('Coś poszło nie tak. Spróbuj ponownie.')
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/ProfileForm.test.tsx`
Expected: FAIL — `Cannot find module './ProfileForm'`.

- [ ] **Step 3: Implement `ProfileForm`**

Create `app/src/components/ProfileForm.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { AVATAR_OPTIONS } from './avatarOptions';

interface ProfileFormProps {
  initialDisplayName: string;
  initialAvatarId: string;
  submitLabel: string;
  submitting: boolean;
  error: string | null;
  onSubmit: (data: { displayName: string; avatarId: string }) => void;
}

function ProfileForm({
  initialDisplayName,
  initialAvatarId,
  submitLabel,
  submitting,
  error,
  onSubmit,
}: ProfileFormProps) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [avatarId, setAvatarId] = useState(initialAvatarId);

  const trimmedName = displayName.trim();
  const canSubmit = trimmedName.length > 0 && avatarId.length > 0;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({ displayName: trimmedName, avatarId });
  };

  return (
    <form className="profile-form" onSubmit={handleSubmit}>
      <label htmlFor="profile-display-name">Nazwa wyświetlana</label>
      <input
        id="profile-display-name"
        type="text"
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        required
      />
      <fieldset>
        <legend>Avatar</legend>
        <div className="avatar-grid">
          {AVATAR_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={
                'avatar-option' + (option.id === avatarId ? ' selected' : '')
              }
              aria-pressed={option.id === avatarId}
              onClick={() => setAvatarId(option.id)}
            >
              {option.emoji}
            </button>
          ))}
        </div>
      </fieldset>
      {error && <p className="auth-error">{error}</p>}
      <button type="submit" disabled={submitting || !canSubmit}>
        {submitLabel}
      </button>
    </form>
  );
}

export default ProfileForm;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/ProfileForm.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ProfileForm.tsx src/components/ProfileForm.test.tsx
git commit -m "Add ProfileForm: shared display-name and avatar picker"
```

---

### Task 9: `LoginScreen`

**Files:**
- Create: `app/src/components/LoginScreen.tsx`
- Test: `app/src/components/LoginScreen.test.tsx`

**Interfaces:**
- Consumes: `signInWithEmail`, `signInWithGoogle` from `app/src/services/authService.ts` (Task 4), `authErrorMessage` from `app/src/services/authErrors.ts` (Task 3).
- Produces: `LoginScreen` component, props `{ onSuccess: () => void; onNavigateToRegister: () => void; onNavigateToForgotPassword: () => void; onCancel: () => void }` — consumed by Task 14 (`App.tsx`).

- [ ] **Step 1: Write the failing test**

Create `app/src/components/LoginScreen.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/LoginScreen.test.tsx`
Expected: FAIL — `Cannot find module './LoginScreen'`.

- [ ] **Step 3: Implement `LoginScreen`**

Create `app/src/components/LoginScreen.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { signInWithEmail, signInWithGoogle } from '../services/authService';
import { authErrorMessage } from '../services/authErrors';

interface LoginScreenProps {
  onSuccess: () => void;
  onNavigateToRegister: () => void;
  onNavigateToForgotPassword: () => void;
  onCancel: () => void;
}

function LoginScreen({
  onSuccess,
  onNavigateToRegister,
  onNavigateToForgotPassword,
  onCancel,
}: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmailLogin = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signInWithEmail(email, password);
      onSuccess();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await signInWithGoogle();
      onSuccess();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-screen">
      <h1>Zaloguj się</h1>
      <form onSubmit={handleEmailLogin}>
        <label htmlFor="login-email">E-mail</label>
        <input
          id="login-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <label htmlFor="login-password">Hasło</label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" disabled={submitting}>
          Zaloguj się
        </button>
      </form>
      <button type="button" disabled={submitting} onClick={handleGoogleLogin}>
        Zaloguj się przez Google
      </button>
      <button type="button" onClick={onNavigateToForgotPassword}>
        Zapomniałem hasła
      </button>
      <button type="button" onClick={onNavigateToRegister}>
        Nie masz konta? Zarejestruj się
      </button>
      <button type="button" onClick={onCancel}>
        Wróć do gry lokalnej
      </button>
    </div>
  );
}

export default LoginScreen;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/LoginScreen.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/LoginScreen.tsx src/components/LoginScreen.test.tsx
git commit -m "Add LoginScreen (email/password + Google)"
```

---

### Task 10: `RegisterScreen`

**Files:**
- Create: `app/src/components/RegisterScreen.tsx`
- Test: `app/src/components/RegisterScreen.test.tsx`

**Interfaces:**
- Consumes: `registerWithEmail` from `app/src/services/authService.ts` (Task 4), `authErrorMessage` from `app/src/services/authErrors.ts` (Task 3).
- Produces: `RegisterScreen` component, props `{ onSuccess: () => void; onNavigateToLogin: () => void; onCancel: () => void }` — consumed by Task 14.

- [ ] **Step 1: Write the failing test**

Create `app/src/components/RegisterScreen.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/RegisterScreen.test.tsx`
Expected: FAIL — `Cannot find module './RegisterScreen'`.

- [ ] **Step 3: Implement `RegisterScreen`**

Create `app/src/components/RegisterScreen.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { registerWithEmail } from '../services/authService';
import { authErrorMessage } from '../services/authErrors';

interface RegisterScreenProps {
  onSuccess: () => void;
  onNavigateToLogin: () => void;
  onCancel: () => void;
}

function RegisterScreen({
  onSuccess,
  onNavigateToLogin,
  onCancel,
}: RegisterScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError('Hasła nie są identyczne.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await registerWithEmail(email, password);
      onSuccess();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-screen">
      <h1>Zarejestruj się</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="register-email">E-mail</label>
        <input
          id="register-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <label htmlFor="register-password">Hasło</label>
        <input
          id="register-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <label htmlFor="register-confirm-password">Powtórz hasło</label>
        <input
          id="register-confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
        />
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" disabled={submitting}>
          Zarejestruj się
        </button>
      </form>
      <button type="button" onClick={onNavigateToLogin}>
        Masz już konto? Zaloguj się
      </button>
      <button type="button" onClick={onCancel}>
        Wróć do gry lokalnej
      </button>
    </div>
  );
}

export default RegisterScreen;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/RegisterScreen.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/RegisterScreen.tsx src/components/RegisterScreen.test.tsx
git commit -m "Add RegisterScreen (email/password sign-up)"
```

---

### Task 11: `ForgotPasswordScreen`

**Files:**
- Create: `app/src/components/ForgotPasswordScreen.tsx`
- Test: `app/src/components/ForgotPasswordScreen.test.tsx`

**Interfaces:**
- Consumes: `sendPasswordReset` from `app/src/services/authService.ts` (Task 4), `authErrorMessage` from `app/src/services/authErrors.ts` (Task 3).
- Produces: `ForgotPasswordScreen` component, props `{ onNavigateToLogin: () => void; onCancel: () => void }` — consumed by Task 14.

- [ ] **Step 1: Write the failing test**

Create `app/src/components/ForgotPasswordScreen.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FirebaseError } from 'firebase/app';
import ForgotPasswordScreen from './ForgotPasswordScreen';
import { sendPasswordReset } from '../services/authService';

vi.mock('../services/authService', () => ({
  sendPasswordReset: vi.fn(),
}));

describe('ForgotPasswordScreen', () => {
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/ForgotPasswordScreen.test.tsx`
Expected: FAIL — `Cannot find module './ForgotPasswordScreen'`.

- [ ] **Step 3: Implement `ForgotPasswordScreen`**

Create `app/src/components/ForgotPasswordScreen.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { sendPasswordReset } from '../services/authService';
import { authErrorMessage } from '../services/authErrors';

interface ForgotPasswordScreenProps {
  onNavigateToLogin: () => void;
  onCancel: () => void;
}

function ForgotPasswordScreen({
  onNavigateToLogin,
  onCancel,
}: ForgotPasswordScreenProps) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="auth-screen">
        <h1>Sprawdź skrzynkę e-mail</h1>
        <p>
          Jeśli konto o podanym adresie istnieje, wysłaliśmy na nie link do
          zresetowania hasła.
        </p>
        <button type="button" onClick={onNavigateToLogin}>
          Wróć do logowania
        </button>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <h1>Zresetuj hasło</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="forgot-password-email">E-mail</label>
        <input
          id="forgot-password-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" disabled={submitting}>
          Wyślij link resetujący
        </button>
      </form>
      <button type="button" onClick={onNavigateToLogin}>
        Wróć do logowania
      </button>
      <button type="button" onClick={onCancel}>
        Wróć do gry lokalnej
      </button>
    </div>
  );
}

export default ForgotPasswordScreen;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/ForgotPasswordScreen.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ForgotPasswordScreen.tsx src/components/ForgotPasswordScreen.test.tsx
git commit -m "Add ForgotPasswordScreen (password reset email)"
```

---

### Task 12: `ProfileSetupScreen` — first-login profile creation

**Files:**
- Create: `app/src/components/ProfileSetupScreen.tsx`
- Test: `app/src/components/ProfileSetupScreen.test.tsx`

**Interfaces:**
- Consumes: `ProfileForm` (Task 8), `createProfile` from `app/src/services/profileService.ts` (Task 5), `authErrorMessage` from `app/src/services/authErrors.ts` (Task 3), `AVATAR_OPTIONS` from `app/src/components/avatarOptions.ts` (Task 2), `useAuth` from `app/src/contexts/AuthContext.tsx` (Task 6).
- Produces: `ProfileSetupScreen` component, props `{ user: User; onComplete: () => void }` — consumed by Task 14.

- [ ] **Step 1: Write the failing test**

Create `app/src/components/ProfileSetupScreen.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/ProfileSetupScreen.test.tsx`
Expected: FAIL — `Cannot find module './ProfileSetupScreen'`.

- [ ] **Step 3: Implement `ProfileSetupScreen`**

Create `app/src/components/ProfileSetupScreen.tsx`:

```tsx
import { useState } from 'react';
import type { User } from 'firebase/auth';
import ProfileForm from './ProfileForm';
import { createProfile } from '../services/profileService';
import { authErrorMessage } from '../services/authErrors';
import { AVATAR_OPTIONS } from './avatarOptions';
import { useAuth } from '../contexts/AuthContext';

interface ProfileSetupScreenProps {
  user: User;
  onComplete: () => void;
}

function ProfileSetupScreen({ user, onComplete }: ProfileSetupScreenProps) {
  const { refreshProfile } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (data: {
    displayName: string;
    avatarId: string;
  }) => {
    setSubmitting(true);
    setError(null);
    try {
      await createProfile(user.uid, {
        displayName: data.displayName,
        avatarId: data.avatarId,
        email: user.email ?? '',
      });
      await refreshProfile();
      onComplete();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-screen">
      <h1>Uzupełnij profil</h1>
      <ProfileForm
        initialDisplayName={user.displayName ?? ''}
        initialAvatarId={AVATAR_OPTIONS[0].id}
        submitLabel="Zapisz profil"
        submitting={submitting}
        error={error}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

export default ProfileSetupScreen;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/ProfileSetupScreen.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ProfileSetupScreen.tsx src/components/ProfileSetupScreen.test.tsx
git commit -m "Add ProfileSetupScreen for first-login profile creation"
```

---

### Task 13: `ProfileScreen` — view, edit, sign out

**Files:**
- Create: `app/src/components/ProfileScreen.tsx`
- Test: `app/src/components/ProfileScreen.test.tsx`

**Interfaces:**
- Consumes: `useAuth` from `app/src/contexts/AuthContext.tsx` (Task 6), `updateProfile` from `app/src/services/profileService.ts` (Task 5), `signOutUser` from `app/src/services/authService.ts` (Task 4), `authErrorMessage` from `app/src/services/authErrors.ts` (Task 3), `avatarEmoji` from `app/src/components/avatarOptions.ts` (Task 2), `ProfileForm` (Task 8).
- Produces: `ProfileScreen` component, props `{ onSignedOut: () => void; onBackToLocal: () => void }` — consumed by Task 14.

- [ ] **Step 1: Write the failing test**

Create `app/src/components/ProfileScreen.test.tsx`:

```tsx
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
  avatarId: 'fox',
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
    expect(screen.getByText('🦊')).toBeInTheDocument();
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
      avatarId: 'fox',
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/ProfileScreen.test.tsx`
Expected: FAIL — `Cannot find module './ProfileScreen'`.

- [ ] **Step 3: Implement `ProfileScreen`**

Create `app/src/components/ProfileScreen.tsx`:

```tsx
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { updateProfile } from '../services/profileService';
import { signOutUser } from '../services/authService';
import { authErrorMessage } from '../services/authErrors';
import { avatarEmoji } from './avatarOptions';
import ProfileForm from './ProfileForm';

interface ProfileScreenProps {
  onSignedOut: () => void;
  onBackToLocal: () => void;
}

function ProfileScreen({ onSignedOut, onBackToLocal }: ProfileScreenProps) {
  const { user, profile, refreshProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user || !profile) {
    return null;
  }

  const handleUpdate = async (data: {
    displayName: string;
    avatarId: string;
  }) => {
    setSubmitting(true);
    setError(null);
    try {
      await updateProfile(user.uid, data);
      await refreshProfile();
      setEditing(false);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await signOutUser();
    onSignedOut();
  };

  if (editing) {
    return (
      <div className="auth-screen">
        <h1>Edytuj profil</h1>
        <ProfileForm
          initialDisplayName={profile.displayName}
          initialAvatarId={profile.avatarId}
          submitLabel="Zapisz zmiany"
          submitting={submitting}
          error={error}
          onSubmit={handleUpdate}
        />
        <button type="button" onClick={() => setEditing(false)}>
          Anuluj
        </button>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <h1>Profil gracza</h1>
      <p className="profile-avatar">{avatarEmoji(profile.avatarId)}</p>
      <p>{profile.displayName}</p>
      <p>{profile.email}</p>
      <button type="button" onClick={() => setEditing(true)}>
        Edytuj profil
      </button>
      <button type="button" onClick={handleSignOut}>
        Wyloguj
      </button>
      <button type="button" onClick={onBackToLocal}>
        Graj lokalnie
      </button>
    </div>
  );
}

export default ProfileScreen;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/ProfileScreen.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ProfileScreen.tsx src/components/ProfileScreen.test.tsx
git commit -m "Add ProfileScreen (view, edit, sign out)"
```

---

### Task 14: Wire it all into `App.tsx`

**Files:**
- Modify: `app/src/main.tsx`
- Modify: `app/src/components/StartScreen.tsx`
- Modify: `app/src/components/StartScreen.test.tsx`
- Modify: `app/src/App.tsx`
- Modify: `app/src/App.test.tsx`

**Interfaces:**
- Consumes: `AuthProvider`, `useAuth` (Task 6), `LoginScreen` (Task 9), `RegisterScreen` (Task 10), `ForgotPasswordScreen` (Task 11), `ProfileSetupScreen` (Task 12), `ProfileScreen` (Task 13).
- Produces: the wired app — no further tasks consume this one.

- [ ] **Step 1: Wrap the app in `AuthProvider`**

Modify `app/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/theme.css'
import './styles/components.css'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
```

- [ ] **Step 2: Add the "Zaloguj się" entry point to `StartScreen`**

Modify `app/src/components/StartScreen.tsx` — add `onOpenAuth` to the props interface and render a button for it:

```tsx
import { useState } from 'react';
import { MIN_PLAYERS, MAX_PLAYERS } from '../engine/gameState';

interface StartScreenProps {
  onStart: (playerNames: string[]) => void;
  onOpenAuth: () => void;
}

function defaultName(index: number): string {
  return `Gracz ${index + 1}`;
}

function StartScreen({ onStart, onOpenAuth }: StartScreenProps) {
  const [playerCount, setPlayerCount] = useState(MIN_PLAYERS);
  const [names, setNames] = useState<string[]>(
    Array.from({ length: MIN_PLAYERS }, (_, index) => defaultName(index))
  );

  const handlePlayerCountChange = (count: number) => {
    setPlayerCount(count);
    setNames((current) =>
      Array.from(
        { length: count },
        (_, index) => current[index] ?? defaultName(index)
      )
    );
  };

  const handleNameChange = (index: number, value: string) => {
    setNames((current) =>
      current.map((name, i) => (i === index ? value : name))
    );
  };

  const trimmedNames = names.slice(0, playerCount).map((name) => name.trim());
  const canStart = trimmedNames.every((name) => name.length > 0);

  return (
    <div className="start-screen">
      <h1>Bronx Dice</h1>
      <button type="button" onClick={onOpenAuth}>
        Zaloguj się
      </button>
      <label htmlFor="player-count">Liczba graczy</label>
      <select
        id="player-count"
        value={playerCount}
        onChange={(event) =>
          handlePlayerCountChange(Number(event.target.value))
        }
      >
        {Array.from(
          { length: MAX_PLAYERS - MIN_PLAYERS + 1 },
          (_, i) => MIN_PLAYERS + i
        ).map((count) => (
          <option key={count} value={count}>
            {count}
          </option>
        ))}
      </select>

      {trimmedNames.map((_, index) => (
        <div key={index}>
          <label htmlFor={`player-name-${index}`}>{defaultName(index)}</label>
          <input
            id={`player-name-${index}`}
            type="text"
            value={names[index]}
            onChange={(event) => handleNameChange(index, event.target.value)}
          />
        </div>
      ))}

      <button
        type="button"
        disabled={!canStart}
        onClick={() => onStart(trimmedNames)}
      >
        Rozpocznij grę
      </button>
    </div>
  );
}

export default StartScreen;
```

- [ ] **Step 3: Update `StartScreen.test.tsx` for the new prop**

Modify `app/src/components/StartScreen.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StartScreen from './StartScreen';

describe('StartScreen', () => {
  it('renders 2 name inputs by default', () => {
    render(<StartScreen onStart={() => {}} onOpenAuth={() => {}} />);
    expect(screen.getByLabelText('Gracz 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Gracz 2')).toBeInTheDocument();
    expect(screen.queryByLabelText('Gracz 3')).not.toBeInTheDocument();
  });

  it('adds more name inputs when player count increases, preserving existing names', async () => {
    const user = userEvent.setup();
    render(<StartScreen onStart={() => {}} onOpenAuth={() => {}} />);

    await user.clear(screen.getByLabelText('Gracz 1'));
    await user.type(screen.getByLabelText('Gracz 1'), 'Ola');
    await user.selectOptions(screen.getByLabelText('Liczba graczy'), '4');

    expect(screen.getByLabelText('Gracz 1')).toHaveValue('Ola');
    expect(screen.getByLabelText('Gracz 3')).toBeInTheDocument();
    expect(screen.getByLabelText('Gracz 4')).toBeInTheDocument();
  });

  it('disables the start button when a name is blank', async () => {
    const user = userEvent.setup();
    render(<StartScreen onStart={() => {}} onOpenAuth={() => {}} />);

    await user.clear(screen.getByLabelText('Gracz 1'));

    expect(
      screen.getByRole('button', { name: 'Rozpocznij grę' })
    ).toBeDisabled();
  });

  it('calls onStart with trimmed player names when clicked', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} onOpenAuth={() => {}} />);

    await user.clear(screen.getByLabelText('Gracz 1'));
    await user.type(screen.getByLabelText('Gracz 1'), '  Ola  ');
    await user.clear(screen.getByLabelText('Gracz 2'));
    await user.type(screen.getByLabelText('Gracz 2'), 'Kuba');

    await user.click(screen.getByRole('button', { name: 'Rozpocznij grę' }));

    expect(onStart).toHaveBeenCalledWith(['Ola', 'Kuba']);
  });

  it('calls onOpenAuth when the login button is clicked', async () => {
    const user = userEvent.setup();
    const onOpenAuth = vi.fn();
    render(<StartScreen onStart={() => {}} onOpenAuth={onOpenAuth} />);

    await user.click(screen.getByRole('button', { name: 'Zaloguj się' }));

    expect(onOpenAuth).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run the `StartScreen` tests to verify they pass**

Run: `npx vitest run src/components/StartScreen.test.tsx`
Expected: PASS (5 tests). (This is expected to already pass at this point since Step 2 already added the button — this step just confirms it before moving on.)

- [ ] **Step 5: Wire the screen-switching logic into `App.tsx`**

Modify `app/src/App.tsx`:

```tsx
import { useState } from 'react';
import StartScreen from './components/StartScreen';
import GameScreen from './components/GameScreen';
import LoginScreen from './components/LoginScreen';
import RegisterScreen from './components/RegisterScreen';
import ForgotPasswordScreen from './components/ForgotPasswordScreen';
import ProfileSetupScreen from './components/ProfileSetupScreen';
import ProfileScreen from './components/ProfileScreen';
import { useAuth } from './contexts/AuthContext';

type AuthScreen = 'login' | 'register' | 'forgot-password';

function App() {
  const [playerNames, setPlayerNames] = useState<string[] | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login');
  const { user, profile, loading } = useAuth();

  if (playerNames) {
    return (
      <GameScreen
        playerNames={playerNames}
        onPlayAgain={() => setPlayerNames(null)}
      />
    );
  }

  if (authOpen) {
    if (loading) {
      return <p>Ładowanie…</p>;
    }

    if (!user) {
      if (authScreen === 'register') {
        return (
          <RegisterScreen
            onSuccess={() => {}}
            onNavigateToLogin={() => setAuthScreen('login')}
            onCancel={() => setAuthOpen(false)}
          />
        );
      }
      if (authScreen === 'forgot-password') {
        return (
          <ForgotPasswordScreen
            onNavigateToLogin={() => setAuthScreen('login')}
            onCancel={() => setAuthOpen(false)}
          />
        );
      }
      return (
        <LoginScreen
          onSuccess={() => {}}
          onNavigateToRegister={() => setAuthScreen('register')}
          onNavigateToForgotPassword={() => setAuthScreen('forgot-password')}
          onCancel={() => setAuthOpen(false)}
        />
      );
    }

    if (!profile) {
      return <ProfileSetupScreen user={user} onComplete={() => {}} />;
    }

    return (
      <ProfileScreen
        onSignedOut={() => setAuthOpen(false)}
        onBackToLocal={() => setAuthOpen(false)}
      />
    );
  }

  return (
    <StartScreen onStart={setPlayerNames} onOpenAuth={() => setAuthOpen(true)} />
  );
}

export default App;
```

- [ ] **Step 6: Update `App.test.tsx` to wrap in `AuthProvider` and mock the auth services**

Modify `app/src/App.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from 'firebase/auth';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';

vi.mock('./services/authService', () => ({
  subscribeToAuthState: vi
    .fn()
    .mockImplementation((callback: (user: User | null) => void) => {
      callback(null);
      return () => {};
    }),
  signInWithEmail: vi.fn(),
  registerWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
  sendPasswordReset: vi.fn(),
  signOutUser: vi.fn(),
}));

vi.mock('./services/profileService', () => ({
  getProfile: vi.fn(),
  createProfile: vi.fn(),
  updateProfile: vi.fn(),
}));

function renderApp() {
  return render(
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}

describe('App', () => {
  it('shows the start screen first', () => {
    renderApp();
    expect(screen.getByText('Bronx Dice')).toBeInTheDocument();
    expect(screen.getByLabelText('Liczba graczy')).toBeInTheDocument();
  });

  it('starts the game after entering names and clicking start', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.clear(screen.getByLabelText('Gracz 1'));
    await user.type(screen.getByLabelText('Gracz 1'), 'Ola');
    await user.clear(screen.getByLabelText('Gracz 2'));
    await user.type(screen.getByLabelText('Gracz 2'), 'Kuba');
    await user.click(screen.getByRole('button', { name: 'Rozpocznij grę' }));

    expect(screen.getByText('Tura: Ola')).toBeInTheDocument();
  });

  it('opens the login screen from the start screen', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Zaloguj się' }));

    expect(
      screen.getByRole('heading', { name: 'Zaloguj się' })
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS — all previous tests plus the new ones (App, StartScreen, and every file from Tasks 1–13). No regressions in the 117 tests that existed before this plan.

- [ ] **Step 8: Commit**

```bash
git add src/main.tsx src/components/StartScreen.tsx src/components/StartScreen.test.tsx src/App.tsx src/App.test.tsx
git commit -m "Wire auth/profile screens into App via a Zaloguj się entry point"
```

---

### Task 15: Firestore security rules and Emulator Suite config

**Files:**
- Create: `app/firestore.rules`
- Create: `app/firestore.indexes.json`
- Create: `app/firebase.json`
- Modify: `app/package.json`

**Interfaces:**
- Consumes: nothing (config only).
- Produces: nothing consumed by other tasks — this is the last task.

No automated test — Firestore rules testing needs `@firebase/rules-unit-testing`, explicitly out of scope per the design doc (the Emulator Suite is for manual end-to-end verification only, not part of `npm test`). Verified manually as described in Step 4.

- [ ] **Step 1: Write the security rules**

Create `app/firestore.rules`:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

- [ ] **Step 2: Add empty Firestore indexes config**

Create `app/firestore.indexes.json`:

```json
{
  "indexes": [],
  "fieldOverrides": []
}
```

- [ ] **Step 3: Add the Firebase project/emulator config**

Create `app/firebase.json`:

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "emulators": {
    "auth": {
      "port": 9099
    },
    "firestore": {
      "port": 8080
    },
    "ui": {
      "enabled": true
    }
  }
}
```

- [ ] **Step 4: Add the emulator dev dependency and an npm script**

Run:
```bash
cd app
npm install --save-dev firebase-tools@^15.22.4
```

Modify `app/package.json` — add an `emulators` script next to the existing ones:

```json
{
  "name": "app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "oxlint",
    "preview": "vite preview",
    "test": "vitest run",
    "emulators": "firebase emulators:start"
  },
  "dependencies": {
    "firebase": "^12.15.0",
    "react": "^19.2.7",
    "react-dom": "^19.2.7"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.1",
    "@types/node": "^24.13.2",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.3",
    "firebase-tools": "^15.22.4",
    "jsdom": "^29.1.1",
    "oxlint": "^1.71.0",
    "prettier": "^3.9.4",
    "typescript": "~6.0.2",
    "vite": "^8.1.1",
    "vitest": "^4.1.9"
  }
}
```

(`dependencies`/`devDependencies` above show the full expected end state after Tasks 1 and 15 — only the `firebase-tools` line and the `emulators` script are new in this step; `firebase` and its version were already added in Task 1.)

- [ ] **Step 5: Manually verify the emulator flow end-to-end**

With `VITE_USE_FIREBASE_EMULATORS=true` in `app/.env.local` (from Task 1):

```bash
npm run emulators &
npm run dev
```

In the browser: open the app, click "Zaloguj się" → "Nie masz konta? Zarejestruj się", register with a test e-mail/password, confirm you land on "Uzupełnij profil", pick a name and avatar, confirm you land on "Profil gracza" showing them. Check the Emulator Suite UI (printed in the `firebase emulators:start` output, typically `http://127.0.0.1:4000`) to confirm the `users/{uid}` document was written with the right fields. Stop both processes (`kill %1` for the backgrounded emulator, `Ctrl+C` for `vite`).

- [ ] **Step 6: Run the full suite one last time**

Run:
```bash
npm run build
npm run lint
npm test
```
Expected: `tsc -b`/`vite build` succeed, no lint issues, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add firestore.rules firestore.indexes.json firebase.json package.json package-lock.json
git commit -m "Add Firestore security rules and Emulator Suite config"
```

---

## Self-Review

**Spec coverage:** SDK config via env vars + Emulator Suite (Task 1, 15), Firebase Auth Google + email/password (Task 4, 9, 10), login/register/forgot-password screens (Task 9–11), profile setup on first login incl. Google `displayName` prefill (Task 12), profile with name + preset avatar in Firestore `users/{uid}` (Task 2, 5, 12, 13), `StartScreen` entry point + every auth screen can return to local play (Task 14, and `onCancel`/`onBackToLocal` props throughout Tasks 9–13), session persistence (native Firebase behavior + `AuthContext`, Task 6), error-message mapping table (Task 3), Firestore security rules (Task 15), mocked-SDK testing strategy throughout — every requirement in the design doc has a task.

**Placeholder scan:** no TBD/TODO; every step has complete, runnable code; no "similar to Task N" references.

**Type consistency:** `PlayerProfile` (Task 2) fields match what `profileService` (Task 5) reads/writes and what `ProfileScreen`/`ProfileSetupScreen` (Task 12–13) consume. `ProfileForm`'s `onSubmit` payload shape (`{ displayName, avatarId }`, Task 8) matches exactly what `ProfileSetupScreen.handleSubmit` and `ProfileScreen.handleUpdate` expect. `AuthContextValue` (`user`, `profile`, `loading`, `refreshProfile`) is identical across Task 6's implementation, its test, and every consumer's mock in Tasks 12–14. Screen prop names (`onCancel`, `onNavigateToLogin`, `onNavigateToRegister`, `onNavigateToForgotPassword`, `onSuccess`, `onComplete`, `onSignedOut`, `onBackToLocal`) are used consistently between each component's definition and `App.tsx`'s wiring in Task 14.
