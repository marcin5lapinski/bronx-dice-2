# Etap 8 — Wdrożenie i dopracowanie — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare Bronx Dice for real-world use: a working Firebase Hosting config, a banner that tells online players when their connection drops (and clears itself on reconnect), and touch-target fixes for the phone-sized screens most players will actually use.

**Architecture:** Three independent slices, each shippable on its own: (1) a `hosting` block in `firebase.json` plus a `deploy` npm script — no app code changes; (2) a `disconnected: boolean` flag added to the existing `useRoom` hook (combining a Firestore `onSnapshot` error callback with `navigator.onLine`/`online`/`offline` events), surfaced through a new stateless `ConnectionBanner` component rendered by `OnlineRoomScreen` above whichever phase screen (lobby/game/winner) is currently active; (3) CSS-only touch-target fixes in the existing `components.css`, verified manually in a browser at phone width.

**Tech Stack:** React 19 + TypeScript + Vite (`app/`), Firebase Hosting + Firestore/Auth SDK (`firebase` npm package), Vitest + Testing Library, Firebase CLI (`firebase-tools`, hoisted at repo root as `npx firebase`).

## Global Constraints

- Deploy stays manual (`npm run deploy` from repo root) — no CI/CD, no GitHub Actions, in this etap.
- Single Firebase project for everything: `bronx-dice-v2` (from `.firebaserc`) — no separate prod/dev project or hosting target.
- PWA (manifest, service worker, offline mode) is explicitly out of scope for this etap.
- UI copy is Polish, matching the rest of the app.
- Don't touch the `min-width: 640px` (tablet/desktop) breakpoints — only phone-width (≤480px / touch-target) concerns are in scope.
- Don't change error handling for individual write actions (`rollDice`, `scoreCategory`, `toggleHeldDie`) — only the read-side connection state (`useRoom`'s `onSnapshot` subscription) is in scope.
- Never run `firebase deploy` (the real, production-affecting command) as part of this plan — verification uses the local Firebase Hosting emulator only. Actual deployment is a manual step the user runs themselves when ready.

---

### Task 1: Firebase Hosting configuration

**Files:**
- Modify: `firebase.json`
- Modify: `package.json` (repo root)

**Interfaces:**
- Produces: `npm run deploy` script (repo root) — builds `app/` then runs `firebase deploy --only hosting`. No other task depends on this one.

- [ ] **Step 1: Add the `hosting` block and a hosting emulator port to `firebase.json`**

Replace the full file contents with:

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "functions": {
    "source": "functions"
  },
  "hosting": {
    "public": "app/dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  },
  "emulators": {
    "auth": {
      "port": 9099
    },
    "firestore": {
      "port": 8080
    },
    "functions": {
      "port": 5001
    },
    "hosting": {
      "port": 5000
    },
    "ui": {
      "enabled": true
    }
  }
}
```

- [ ] **Step 2: Add the `deploy` script to root `package.json`**

In the `"scripts"` object, add `"deploy"` right after `"build:engine"`:

```json
  "scripts": {
    "build:engine": "npm run build --workspace=packages/game-engine",
    "deploy": "npm run build --workspace=app && firebase deploy --only hosting",
    "emulators": "firebase emulators:start",
    "test:functions-integration": "firebase emulators:exec --only firestore \"npm run test:integration --workspace=functions\"",
    "test:rules": "firebase emulators:exec --only firestore \"npm run test:rules --workspace=app\""
  },
```

- [ ] **Step 3: Build the app and verify the hosting config locally with the emulator (no real deploy)**

Run, from the repo root:

```bash
npm run build --workspace=app
npx firebase emulators:start --only hosting
```

Expected: the emulator log prints `✔  hosting: Local server: http://127.0.0.1:5000`. Leave it running.

In a second terminal, verify the app is served:

```bash
curl -s http://127.0.0.1:5000/ | grep -o '<div id="root">'
```

Expected output: `<div id="root">`

Then verify the SPA rewrite (a client-side route with no matching static file still resolves to `index.html`, not a 404):

```bash
curl -s http://127.0.0.1:5000/some/client/route | grep -o '<div id="root">'
```

Expected output: `<div id="root">` (same as above — proves the `rewrites` rule is working).

Stop the emulator (Ctrl+C in the first terminal, or `npx firebase emulators:stop` if running in the background).

- [ ] **Step 4: Commit**

```bash
git add firebase.json package.json
git commit -m "Add Firebase Hosting config and manual deploy script"
```

---

### Task 2: `useRoom` connection-state tracking

**Files:**
- Modify: `app/src/hooks/useRoom.ts`
- Modify: `app/src/hooks/useRoom.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `useRoom(roomId: string): { room: RoomDocument | null; loading: boolean; notFound: boolean; disconnected: boolean }` — the `disconnected` field is new and required. Task 4 (wiring into `OnlineRoomScreen`) and Task 4's test-mock updates consume this exact field name and type.

- [ ] **Step 1: Write the failing tests**

Append these three tests to `app/src/hooks/useRoom.test.ts`, inside the existing `describe('useRoom', ...)` block (after the `'unsubscribes on unmount'` test):

```ts
  it('sets disconnected when the onSnapshot listener reports an error', async () => {
    mockDoc.mockReturnValue('room-ref');
    let capturedError: (error: unknown) => void = () => {};
    mockOnSnapshot.mockImplementation((_ref, _onNext, onError) => {
      capturedError = onError;
      return () => {};
    });

    const { result } = renderHook(() => useRoom('AAAAA'));
    capturedError(new Error('unavailable'));

    await waitFor(() => expect(result.current.disconnected).toBe(true));
  });

  it('clears disconnected once a later snapshot succeeds', async () => {
    mockDoc.mockReturnValue('room-ref');
    let capturedNext: (snapshot: unknown) => void = () => {};
    let capturedError: (error: unknown) => void = () => {};
    mockOnSnapshot.mockImplementation((_ref, onNext, onError) => {
      capturedNext = onNext;
      capturedError = onError;
      return () => {};
    });

    const { result } = renderHook(() => useRoom('AAAAA'));
    capturedError(new Error('unavailable'));
    await waitFor(() => expect(result.current.disconnected).toBe(true));

    capturedNext({ exists: () => true, data: () => ({ phase: 'lobby' }) });
    await waitFor(() => expect(result.current.disconnected).toBe(false));
  });

  it('tracks disconnected via browser online/offline events', async () => {
    mockDoc.mockReturnValue('room-ref');
    mockOnSnapshot.mockImplementation(() => () => {});
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);

    const { result } = renderHook(() => useRoom('AAAAA'));
    expect(result.current.disconnected).toBe(false);

    window.dispatchEvent(new Event('offline'));
    await waitFor(() => expect(result.current.disconnected).toBe(true));

    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(result.current.disconnected).toBe(false));
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test --workspace=app -- src/hooks/useRoom.test.ts`
Expected: the 3 new tests FAIL (TypeScript error or `onError`/`disconnected` undefined — `useRoom` doesn't provide them yet). The 3 pre-existing tests still PASS.

- [ ] **Step 3: Implement `disconnected` in `useRoom.ts`**

Replace the full contents of `app/src/hooks/useRoom.ts` with:

```ts
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/client';
import type { RoomDocument } from '../types/room';

interface UseRoomResult {
  room: RoomDocument | null;
  loading: boolean;
  notFound: boolean;
  disconnected: boolean;
}

export function useRoom(roomId: string): UseRoomResult {
  const [room, setRoom] = useState<RoomDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [offline, setOffline] = useState(() => navigator.onLine === false);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    setConnectionError(false);
    const unsubscribe = onSnapshot(
      doc(db, 'rooms', roomId),
      (snapshot) => {
        setConnectionError(false);
        if (!snapshot.exists()) {
          setRoom(null);
          setNotFound(true);
          setLoading(false);
          return;
        }
        setRoom(snapshot.data() as RoomDocument);
        setNotFound(false);
        setLoading(false);
      },
      () => {
        setConnectionError(true);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [roomId]);

  useEffect(() => {
    const handleOnline = () => setOffline(false);
    const handleOffline = () => setOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { room, loading, notFound, disconnected: connectionError || offline };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test --workspace=app -- src/hooks/useRoom.test.ts`
Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/hooks/useRoom.ts app/src/hooks/useRoom.test.ts
git commit -m "Track connection state in useRoom (onSnapshot errors + online/offline)"
```

---

### Task 3: `ConnectionBanner` component

**Files:**
- Create: `app/src/components/ConnectionBanner.tsx`
- Create: `app/src/components/ConnectionBanner.test.tsx`
- Modify: `app/src/styles/theme.css`
- Modify: `app/src/styles/components.css`

**Interfaces:**
- Consumes: nothing from Task 2 directly (takes a plain `visible: boolean` prop — Task 4 is the one that wires `useRoom`'s `disconnected` into this prop).
- Produces: `ConnectionBanner({ visible: boolean }): JSX.Element | null`, exported as the default export. Task 4 imports and renders it as `<ConnectionBanner visible={disconnected} />`. CSS class `.connection-banner` and tokens `--accent-warn` / `--accent-warn-glow` are also produced here and consumed only by this component.

- [ ] **Step 1: Write the failing test**

Create `app/src/components/ConnectionBanner.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConnectionBanner from './ConnectionBanner';

describe('ConnectionBanner', () => {
  it('renders the disconnected message when visible', () => {
    render(<ConnectionBanner visible={true} />);
    expect(
      screen.getByText('Utracono połączenie — próbuję ponownie…')
    ).toBeInTheDocument();
  });

  it('renders nothing when not visible', () => {
    const { container } = render(<ConnectionBanner visible={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --workspace=app -- src/components/ConnectionBanner.test.tsx`
Expected: FAIL — `Failed to resolve import "./ConnectionBanner"` (file doesn't exist yet).

- [ ] **Step 3: Implement the component**

Create `app/src/components/ConnectionBanner.tsx`:

```tsx
interface ConnectionBannerProps {
  visible: boolean;
}

function ConnectionBanner({ visible }: ConnectionBannerProps) {
  if (!visible) {
    return null;
  }

  return <p className="connection-banner">Utracono połączenie — próbuję ponownie…</p>;
}

export default ConnectionBanner;
```

- [ ] **Step 4: Add the warning color tokens to `theme.css`**

In `app/src/styles/theme.css`, in the `:root` block, add two new lines right after `--accent-green-bg: rgba(57, 255, 20, 0.06);` and before `--font-mono`:

```css
  --accent-green-bg: rgba(57, 255, 20, 0.06);
  --accent-warn: #ffb300;
  --accent-warn-glow: rgba(255, 179, 0, 0.6);
  --font-mono: ui-monospace, Consolas, monospace;
```

- [ ] **Step 5: Add the `.connection-banner` style to `components.css`**

Append to the end of `app/src/styles/components.css`:

```css

/* ConnectionBanner */
.connection-banner {
  color: var(--accent-warn);
  border: 1px solid var(--accent-warn);
  box-shadow: 0 0 8px var(--accent-warn-glow);
  border-radius: 4px;
  padding: 8px 12px;
  font-size: 12px;
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 1px;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test --workspace=app -- src/components/ConnectionBanner.test.tsx`
Expected: both tests PASS.

- [ ] **Step 7: Commit**

```bash
git add app/src/components/ConnectionBanner.tsx app/src/components/ConnectionBanner.test.tsx app/src/styles/theme.css app/src/styles/components.css
git commit -m "Add ConnectionBanner component and warning color tokens"
```

---

### Task 4: Wire the banner into `OnlineRoomScreen`

**Files:**
- Modify: `app/src/components/OnlineRoomScreen.tsx`
- Modify: `app/src/components/OnlineRoomScreen.test.tsx`

**Interfaces:**
- Consumes: `useRoom`'s `disconnected: boolean` (Task 2) and `ConnectionBanner` (Task 3), exactly as they exist after those tasks.
- Produces: nothing further consumed by later tasks — this is the last task that touches online-room connection UX.

- [ ] **Step 1: Write the failing tests**

In `app/src/components/OnlineRoomScreen.test.tsx`, every existing `vi.mocked(useRoom).mockReturnValue({...})` call needs a `disconnected: false` field added (the mocked return type now requires it), and two new tests need to be added. Replace the full file contents with:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createEmptyScoreCard } from '@bronx-dice/game-engine';
import OnlineRoomScreen from './OnlineRoomScreen';
import { useRoom } from '../hooks/useRoom';
import { returnToLobby } from '../services/roomService';
import { playSound } from '../utils/sound';
import type { RoomDocument } from '../types/room';

function lobbyRoom(): Extract<RoomDocument, { phase: 'lobby' }> {
  return {
    phase: 'lobby',
    hostId: 'uid-1',
    maxPlayers: 4,
    turnTimeLimitSeconds: 30,
    players: [
      { id: 'uid-1', name: 'Ola', avatarId: 'avatar01', ready: false, lastActiveAt: {} as never },
    ],
    createdAt: {} as never,
    updatedAt: {} as never,
  };
}

function playingRoom(): Extract<RoomDocument, { phase: 'playing' }> {
  return {
    phase: 'playing',
    hostId: 'uid-1',
    maxPlayers: 2,
    turnTimeLimitSeconds: 30,
    turnStartedAt: { toMillis: () => Date.now() } as never,
    players: [
      {
        id: 'uid-1',
        name: 'Ola',
        avatarId: 'avatar01',
        ready: true,
        lastActiveAt: { toMillis: () => Date.now() } as never,
      },
      {
        id: 'uid-2',
        name: 'Kuba',
        avatarId: 'avatar02',
        ready: true,
        lastActiveAt: { toMillis: () => Date.now() } as never,
      },
    ],
    scoreCards: {
      'uid-1': createEmptyScoreCard(),
      'uid-2': createEmptyScoreCard(),
    },
    dice: [],
    heldDice: [false, false, false, false, false],
    rollsLeft: 3,
    currentPlayerIndex: 0,
    createdAt: {} as never,
    updatedAt: {} as never,
  };
}

function finishedRoom(): Extract<RoomDocument, { phase: 'finished' }> {
  const scoreCards = { 'uid-1': createEmptyScoreCard() };
  scoreCards['uid-1'].lower.chance = 20;
  return {
    phase: 'finished',
    hostId: 'uid-1',
    maxPlayers: 2,
    turnTimeLimitSeconds: 30,
    turnStartedAt: {} as never,
    players: [
      { id: 'uid-1', name: 'Ola', avatarId: 'avatar01', ready: true, lastActiveAt: {} as never },
    ],
    scoreCards,
    dice: [],
    heldDice: [false, false, false, false, false],
    rollsLeft: 3,
    currentPlayerIndex: 0,
    createdAt: {} as never,
    updatedAt: {} as never,
  };
}

vi.mock('../hooks/useRoom', () => ({
  useRoom: vi.fn(),
}));

vi.mock('../services/roomService', () => ({
  setReady: vi.fn(),
  startGame: vi.fn(),
  leaveRoom: vi.fn(),
  rollDice: vi.fn(),
  toggleHeldDie: vi.fn(),
  scoreCategory: vi.fn(),
  handleTurnTimeout: vi.fn(),
  heartbeat: vi.fn().mockResolvedValue(undefined),
  removeInactivePlayers: vi.fn(),
  returnToLobby: vi.fn(),
}));

vi.mock('../utils/sound', () => ({
  playSound: vi.fn(),
  isSoundMuted: vi.fn().mockReturnValue(false),
  setSoundMuted: vi.fn(),
}));

describe('OnlineRoomScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // vi.restoreAllMocks() only resets vi.spyOn spies, not the call history
    // of a plain vi.fn() created inside a vi.mock() factory — clear it
    // explicitly so the start-game sound assertions don't leak across tests.
    vi.mocked(playSound).mockClear();
  });

  it('shows a loading message while the room is loading', () => {
    vi.mocked(useRoom).mockReturnValue({
      room: null,
      loading: true,
      notFound: false,
      disconnected: false,
    });
    render(<OnlineRoomScreen roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);
    expect(screen.getByText('Ładowanie…')).toBeInTheDocument();
  });

  it('renders the lobby screen when the room is in the lobby phase', () => {
    vi.mocked(useRoom).mockReturnValue({
      room: {
        phase: 'lobby',
        hostId: 'uid-1',
        maxPlayers: 4,
        turnTimeLimitSeconds: 30,
        players: [
          { id: 'uid-1', name: 'Ola', avatarId: 'avatar01', ready: false, lastActiveAt: {} as never },
        ],
        createdAt: {} as never,
        updatedAt: {} as never,
      },
      loading: false,
      notFound: false,
      disconnected: false,
    });
    render(<OnlineRoomScreen roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);
    expect(screen.getByText('Pokój AAAAA')).toBeInTheDocument();
  });

  it('renders the winner screen when the room has finished', () => {
    vi.mocked(useRoom).mockReturnValue({
      room: finishedRoom(),
      loading: false,
      notFound: false,
      disconnected: false,
    });
    render(<OnlineRoomScreen roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);
    expect(screen.getByText('Zwycięzca: Ola!')).toBeInTheDocument();
  });

  it("lets the host stay in the room and start a new round from the winner screen", async () => {
    const user = userEvent.setup();
    vi.mocked(useRoom).mockReturnValue({
      room: finishedRoom(),
      loading: false,
      notFound: false,
      disconnected: false,
    });
    render(<OnlineRoomScreen roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'Zagraj ponownie' }));
    expect(returnToLobby).toHaveBeenCalledWith('AAAAA');
  });

  it('shows a waiting message (no "Zagraj ponownie") to a non-host on the winner screen', () => {
    vi.mocked(useRoom).mockReturnValue({
      room: finishedRoom(),
      loading: false,
      notFound: false,
      disconnected: false,
    });
    render(<OnlineRoomScreen roomId="AAAAA" ownUid="uid-2" onLeft={() => {}} />);

    expect(
      screen.queryByRole('button', { name: 'Zagraj ponownie' })
    ).not.toBeInTheDocument();
    expect(screen.getByText('Oczekiwanie na hosta…')).toBeInTheDocument();
  });

  it('exits the room when "Wyjdź z pokoju" is clicked on the winner screen', async () => {
    const user = userEvent.setup();
    const onLeft = vi.fn();
    vi.mocked(useRoom).mockReturnValue({
      room: finishedRoom(),
      loading: false,
      notFound: false,
      disconnected: false,
    });
    render(<OnlineRoomScreen roomId="AAAAA" ownUid="uid-1" onLeft={onLeft} />);

    await user.click(screen.getByRole('button', { name: 'Wyjdź z pokoju' }));
    expect(onLeft).toHaveBeenCalledTimes(1);
  });

  it('calls onLeft when the room is not found', async () => {
    vi.mocked(useRoom).mockReturnValue({
      room: null,
      loading: false,
      notFound: true,
      disconnected: false,
    });
    const onLeft = vi.fn();
    render(<OnlineRoomScreen roomId="AAAAA" ownUid="uid-1" onLeft={onLeft} />);
    await waitFor(() => expect(onLeft).toHaveBeenCalled());
  });

  it('plays the start-game sound when the room transitions from lobby to playing', () => {
    vi.mocked(useRoom).mockReturnValue({
      room: lobbyRoom(),
      loading: false,
      notFound: false,
      disconnected: false,
    });
    const { rerender } = render(
      <OnlineRoomScreen roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />
    );

    vi.mocked(useRoom).mockReturnValue({
      room: playingRoom(),
      loading: false,
      notFound: false,
      disconnected: false,
    });
    rerender(<OnlineRoomScreen roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);

    expect(playSound).toHaveBeenCalledWith('start-game');
    expect(playSound).toHaveBeenCalledTimes(1);
  });

  it('does not play the start-game sound when mounting directly into an already-playing room', () => {
    vi.mocked(useRoom).mockReturnValue({
      room: playingRoom(),
      loading: false,
      notFound: false,
      disconnected: false,
    });
    render(<OnlineRoomScreen roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);

    expect(playSound).not.toHaveBeenCalled();
  });

  it('does not replay the start-game sound on later playing-phase updates', () => {
    vi.mocked(useRoom).mockReturnValue({
      room: lobbyRoom(),
      loading: false,
      notFound: false,
      disconnected: false,
    });
    const { rerender } = render(
      <OnlineRoomScreen roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />
    );

    vi.mocked(useRoom).mockReturnValue({
      room: playingRoom(),
      loading: false,
      notFound: false,
      disconnected: false,
    });
    rerender(<OnlineRoomScreen roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);

    // A later snapshot update while still 'playing' (e.g. a roll) must not
    // replay the sound.
    vi.mocked(useRoom).mockReturnValue({
      room: { ...playingRoom(), dice: [1, 2, 3, 4, 5] },
      loading: false,
      notFound: false,
      disconnected: false,
    });
    rerender(<OnlineRoomScreen roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);

    expect(playSound).toHaveBeenCalledTimes(1);
  });

  it('shows the connection banner when disconnected, regardless of room phase', () => {
    vi.mocked(useRoom).mockReturnValue({
      room: lobbyRoom(),
      loading: false,
      notFound: false,
      disconnected: true,
    });
    render(<OnlineRoomScreen roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);
    expect(
      screen.getByText('Utracono połączenie — próbuję ponownie…')
    ).toBeInTheDocument();
  });

  it('does not show the connection banner when connected', () => {
    vi.mocked(useRoom).mockReturnValue({
      room: lobbyRoom(),
      loading: false,
      notFound: false,
      disconnected: false,
    });
    render(<OnlineRoomScreen roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);
    expect(
      screen.queryByText('Utracono połączenie — próbuję ponownie…')
    ).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npm test --workspace=app -- src/components/OnlineRoomScreen.test.tsx`
Expected: the 2 new banner tests FAIL (`ConnectionBanner` not rendered yet); all other tests still PASS (they only gained an extra `disconnected: false` field, which the current component ignores harmlessly).

- [ ] **Step 3: Wire the banner into `OnlineRoomScreen.tsx`**

Replace the full contents of `app/src/components/OnlineRoomScreen.tsx` with:

```tsx
import { useEffect, useRef, type ReactNode } from 'react';
import { getWinners } from '@bronx-dice/game-engine';
import RoomLobbyScreen from './RoomLobbyScreen';
import OnlineGameScreen from './OnlineGameScreen';
import WinnerScreen from './WinnerScreen';
import ConnectionBanner from './ConnectionBanner';
import { useRoom } from '../hooks/useRoom';
import { usePresenceHeartbeat } from '../hooks/usePresenceHeartbeat';
import { returnToLobby } from '../services/roomService';
import { playSound } from '../utils/sound';

interface OnlineRoomScreenProps {
  roomId: string;
  ownUid: string;
  onLeft: () => void;
}

function OnlineRoomScreen({ roomId, ownUid, onLeft }: OnlineRoomScreenProps) {
  const { room, loading, notFound, disconnected } = useRoom(roomId);
  usePresenceHeartbeat(roomId);
  const previousPhaseRef = useRef<string | null>(null);

  useEffect(() => {
    if (notFound) {
      onLeft();
    }
  }, [notFound, onLeft]);

  // Plays for every connected player the moment the host starts the game —
  // gated on the actual lobby->playing transition (not on mount), so joining
  // or refreshing mid-game never replays it.
  useEffect(() => {
    const phase = room?.phase ?? null;
    if (previousPhaseRef.current === 'lobby' && phase === 'playing') {
      playSound('start-game');
    }
    previousPhaseRef.current = phase;
  }, [room?.phase]);

  if (notFound) {
    return null;
  }

  let content: ReactNode;
  if (loading || !room) {
    content = <p>Ładowanie…</p>;
  } else if (room.phase === 'lobby') {
    content = <RoomLobbyScreen room={room} roomId={roomId} ownUid={ownUid} onLeft={onLeft} />;
  } else if (room.phase === 'playing') {
    content = <OnlineGameScreen room={room} roomId={roomId} ownUid={ownUid} onExit={onLeft} />;
  } else {
    const isHost = room.hostId === ownUid;
    content = (
      <WinnerScreen
        winners={getWinners(room)}
        players={room.players}
        scoreCards={room.scoreCards}
        onPlayAgain={isHost ? () => { void returnToLobby(roomId); } : undefined}
        onExit={onLeft}
      />
    );
  }

  return (
    <>
      <ConnectionBanner visible={disconnected} />
      {content}
    </>
  );
}

export default OnlineRoomScreen;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test --workspace=app -- src/components/OnlineRoomScreen.test.tsx`
Expected: all 13 tests PASS.

- [ ] **Step 5: Run the full app test suite to check for regressions**

Run: `npm test --workspace=app`
Expected: all test files PASS (219 + 5 new tests across Tasks 2–4 = 224).

- [ ] **Step 6: Commit**

```bash
git add app/src/components/OnlineRoomScreen.tsx app/src/components/OnlineRoomScreen.test.tsx
git commit -m "Show the connection banner in OnlineRoomScreen across all room phases"
```

---

### Task 5: Phone touch-target hardening

**Files:**
- Modify: `app/src/styles/components.css`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing consumed by later tasks — this is the last task in the plan.

This task is CSS-only and has no automated test (per the design doc, responsiveness is verified manually). It fixes three specific, measurable touch-target sizes that fall under the ~44×44px minimum recommended by WCAG 2.5.5 / Apple HIG, on controls used on the phone-first online-game and start screens.

- [ ] **Step 1: Bump `.player-row-handle` (StartScreen drag handle) from 32×32px to 44×44px**

In `app/src/styles/components.css`, find the `.player-row-handle` rule (in the "StartScreen player rows (drag & drop)" section) and change:

```css
.player-row-handle {
  width: 32px;
  height: 32px;
```

to:

```css
.player-row-handle {
  width: 44px;
  height: 44px;
```

(leave every other property in that rule unchanged).

- [ ] **Step 2: Give `.back-button` a 44px minimum tap height**

Find the `.back-button` rule (in the "Back/exit buttons" section) and replace it with:

```css
.back-button {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  background: transparent;
  color: var(--text-dim);
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  padding: 4px 10px;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
  font-size: 11px;
}
```

- [ ] **Step 3: Give `.host-presence-controls button` a 44px minimum tap height**

Find the `.host-presence-controls button` rule (in the "GameScreen" section) and replace it with:

```css
.host-presence-controls button {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  background: transparent;
  color: var(--text-dim);
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  padding: 4px 10px;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
  font-size: 11px;
}
```

- [ ] **Step 4: Run the full app test suite**

Run: `npm test --workspace=app`
Expected: all tests still PASS (this task changes only CSS geometry, not markup or behavior).

- [ ] **Step 5: Manually verify at phone width in the browser**

Start the dev server:

```bash
npm run dev --workspace=app
```

Open the printed local URL in a browser, open DevTools, switch to responsive/device-toolbar mode, and set the viewport to 375×667 (a common phone size) and then 320×568 (the smallest common phone size). Walk through:

- `StartScreen` — confirm the drag handles (☰ icons in the player rows) are now visibly larger and easy to tap, and the row still fits without wrapping awkwardly.
- `GameScreen` / an `OnlineGameScreen` (join or host a local/online game to reach it) — confirm "Wyjdź z gry" and the sound-toggle button are comfortably tappable, and (as host) the "Usuń nieaktywnych graczy" / "Przerwij grę" buttons too.
- `ScoreBoard` — confirm it still scrolls horizontally without clipping (pre-existing `@media (max-width: 480px)` rule) rather than overflowing the page.
- `RoomLobbyScreen`, `OnlineMenuScreen`, `ProfileScreen`/`StatsScreen`, and the auth screens (`LoginScreen`/`RegisterScreen`) — confirm no text is clipped and no element overflows the viewport horizontally.

If anything else looks visibly broken at these widths, fix it in `components.css` following the same pattern (adjust the specific rule, don't introduce new breakpoints unless a rule truly needs one), then re-run `npm test --workspace=app` and repeat this manual check before moving on.

- [ ] **Step 6: Commit**

```bash
git add app/src/styles/components.css
git commit -m "Increase touch targets on phone-width screens to ~44px minimum"
```

---

## Self-Review Notes

- **Spec coverage:** Section 1 (Hosting) → Task 1. Section 2 (Responsywność) → Task 5. Section 3 (baner + auto-reconnect) → Tasks 2–4. Section 4 (Testowanie) → covered inline in each task's test steps. "Poza zakresem" items (PWA, CI/CD, action-level error handling, tablet/desktop breakpoints) are called out in Global Constraints so no task drifts into them.
- **Type consistency:** `UseRoomResult`'s `disconnected: boolean` (Task 2) is the exact field name/type used in `ConnectionBanner`'s `visible` prop wiring and in every `OnlineRoomScreen.test.tsx` mock (Task 4). `ConnectionBanner`'s `visible: boolean` prop (Task 3) matches its one call site in Task 4.
- **No placeholders:** every step has literal, complete code or an exact runnable command with an expected output — including the manual verification in Task 5, which is explicit about which screens and viewport sizes to check rather than saying "verify it looks good."
