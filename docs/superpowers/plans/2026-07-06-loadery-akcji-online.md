# Loadery przy akcjach online — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add low-invasive, visually consistent loading indicators for every online-mode network action that currently gives the player no feedback while waiting (roll, score, create room, join room, start game), reusing the existing "pending" state already added to `OnlineGameScreen` for the roll-button double-click fix.

**Architecture:** A shared CSS foundation (`.pending-glow` pulsing-border animation for frequent in-game actions; a tiny `InlineSpinner` component + spinner CSS for one-shot lobby/menu actions) that individual components opt into via new optional props (`RollButton.pending`, `ScoreBoard.pendingCategory`) or new local state (`OnlineMenuScreen.submitting`, `RoomLobbyScreen.starting`). Local hot-seat mode (`GameScreen`) passes none of these new props, so it renders identically to today.

**Tech Stack:** React 19 + TypeScript (`app/`), Vitest + Testing Library, existing CSS custom properties in `app/src/styles/theme.css`.

## Global Constraints

- Held-die toggling gets **no** loader — it already updates optimistically and instantly; adding one would be redundant or misleading. Don't touch `handleToggleHeld`/`optimisticHeldDice`.
- `setReady`, `leaveRoom`, `removeInactivePlayers`, `returnToLobby` are **out of scope** — no new pending state or loader for these in this plan.
- Local hot-seat `GameScreen` is **not modified** — it must keep rendering `RollButton`/`ScoreBoard` exactly as today (no new props passed), since local mode is synchronous and has nothing to load.
- Frequent in-game actions (roll, score) use the **pulsing-glow** pattern (`.pending-glow`, color `var(--accent-blue)` / `var(--accent-blue-glow)`) — no button text change.
- One-shot lobby/menu actions (create room, join room, start game) use a **text change + `InlineSpinner`** pattern — no `.pending-glow` class on these buttons.
- Every new piece of state guards against double-submission (`if (pending) return;` before setting it), mirroring the existing `rollPending` fix in `OnlineGameScreen.tsx`.
- Test-hygiene rule (learned the hard way while fixing the roll bug): plain `vi.fn()` mocks created inside a `vi.mock()` factory are **not** cleared by `vi.restoreAllMocks()` in `afterEach` — any test asserting `toHaveBeenCalledTimes` on such a mock must have that mock's call history explicitly cleared (and, if a custom `mockImplementation` was set, its default resolved implementation restored) in `afterEach`.

---

### Task 1: CSS foundation + `InlineSpinner` component

**Files:**
- Modify: `app/src/styles/theme.css`
- Modify: `app/src/styles/components.css`
- Create: `app/src/components/InlineSpinner.tsx`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: CSS classes `.pending-glow` and `.inline-spinner` (consumed by Tasks 2, 4, 6, 7), and `InlineSpinner` component, default export, no props (consumed by Tasks 6 and 7).

- [ ] **Step 1: Add the two new keyframes to `theme.css`**

In `app/src/styles/theme.css`, right after the existing `@keyframes dice-spin { ... }` block (currently the last thing in the file), add:

```css

@keyframes pulse-glow {
  0%,
  100% {
    box-shadow: 0 0 6px var(--accent-blue-glow);
  }
  50% {
    box-shadow: 0 0 16px var(--accent-blue-glow);
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
```

- [ ] **Step 2: Append the `.pending-glow` and `.inline-spinner` classes to `components.css`**

Append to the end of `app/src/styles/components.css`:

```css

/* Pending-state indicator for frequent in-game actions (roll, score) */
.pending-glow {
  animation: pulse-glow 1s ease-in-out infinite;
}

button.pending-glow:disabled {
  opacity: 1;
  cursor: wait;
}

.roll-button button.pending-glow:disabled,
.score-board tbody button.pending-glow {
  border-color: var(--accent-blue);
  color: var(--accent-blue);
}

/* InlineSpinner — used inside one-shot lobby/menu action buttons */
.inline-spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-left: 8px;
  vertical-align: middle;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
```

- [ ] **Step 3: Create the `InlineSpinner` component**

Create `app/src/components/InlineSpinner.tsx`:

```tsx
function InlineSpinner() {
  return <span className="inline-spinner" aria-hidden="true" />;
}

export default InlineSpinner;
```

No dedicated test — this is a trivial presentational component (pure CSS, no logic, no conditional rendering); its usage is exercised through the screens that render it (Tasks 6–7).

- [ ] **Step 4: Verify nothing broke**

Run: `npm run build --workspace=app`
Expected: builds successfully (this step only added CSS/a new unused-so-far component, so nothing can fail functionally — this just catches a TypeScript/JSX typo in `InlineSpinner.tsx`).

- [ ] **Step 5: Commit**

```bash
git add app/src/styles/theme.css app/src/styles/components.css app/src/components/InlineSpinner.tsx
git commit -m "Add pending-glow CSS and InlineSpinner for online-action loaders"
```

---

### Task 2: `RollButton` pending prop

**Files:**
- Modify: `app/src/components/RollButton.tsx`
- Modify: `app/src/components/RollButton.test.tsx`

**Interfaces:**
- Consumes: `.pending-glow` CSS class (Task 1).
- Produces: `RollButton({ rollsLeft, onRoll, interactive?, pending? })` — the `pending?: boolean` prop (default `false`) is new and consumed by Task 3.

- [ ] **Step 1: Write the failing test**

Append to `app/src/components/RollButton.test.tsx`, inside the existing `describe('RollButton', ...)` block:

```tsx
  it('shows the pending-glow indicator when pending is true', () => {
    render(<RollButton rollsLeft={3} onRoll={() => {}} pending={true} />);
    expect(screen.getByRole('button', { name: 'Rzuć kośćmi' })).toHaveClass(
      'pending-glow'
    );
  });

  it('does not show the pending-glow indicator by default', () => {
    render(<RollButton rollsLeft={3} onRoll={() => {}} />);
    expect(screen.getByRole('button', { name: 'Rzuć kośćmi' })).not.toHaveClass(
      'pending-glow'
    );
  });
```

- [ ] **Step 2: Run the tests to verify the new one fails**

Run: `npm test --workspace=app -- src/components/RollButton.test.tsx`
Expected: `shows the pending-glow indicator when pending is true` FAILS (`pending` prop doesn't exist yet, class never applied); the other 4 tests still PASS.

- [ ] **Step 3: Add the `pending` prop**

Replace the full contents of `app/src/components/RollButton.tsx` with:

```tsx
interface RollButtonProps {
  rollsLeft: number;
  onRoll: () => void;
  interactive?: boolean;
  pending?: boolean;
}

function RollButton({
  rollsLeft,
  onRoll,
  interactive = true,
  pending = false,
}: RollButtonProps) {
  return (
    <div className="roll-button">
      <button
        type="button"
        className={pending ? 'pending-glow' : undefined}
        disabled={rollsLeft === 0 || !interactive}
        onClick={onRoll}
      >
        Rzuć kośćmi
      </button>
      <p>Pozostałe rzuty: {rollsLeft}</p>
    </div>
  );
}

export default RollButton;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test --workspace=app -- src/components/RollButton.test.tsx`
Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/RollButton.tsx app/src/components/RollButton.test.tsx
git commit -m "Add pending prop to RollButton for the roll-in-flight indicator"
```

---

### Task 3: Wire `rollPending` into `RollButton` in `OnlineGameScreen`

**Files:**
- Modify: `app/src/components/OnlineGameScreen.tsx`
- Modify: `app/src/components/OnlineGameScreen.test.tsx`

**Interfaces:**
- Consumes: `RollButton`'s `pending` prop (Task 2); the existing `rollPending` state (already present in `OnlineGameScreen.tsx` from the double-click fix).
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Add to `app/src/components/OnlineGameScreen.test.tsx`, right after the existing `it('does not call rollDice a second time when clicked again before the first call resolves', ...)` test:

```tsx
  it('shows the pending-glow indicator on the roll button while a roll is in flight', () => {
    let resolveRoll!: () => void;
    vi.mocked(rollDice).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRoll = () => resolve(undefined);
        })
    );
    render(
      <OnlineGameScreen room={playingRoom()} roomId="AAAAA" ownUid="uid-1" onExit={() => {}} />
    );

    const button = screen.getByRole('button', { name: 'Rzuć kośćmi' });
    fireEvent.click(button);

    expect(button).toHaveClass('pending-glow');

    resolveRoll();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --workspace=app -- src/components/OnlineGameScreen.test.tsx -t "pending-glow indicator on the roll button"`
Expected: FAILS — the button has no `pending-glow` class yet (`RollButton` is not receiving a `pending` prop from `OnlineGameScreen`).

- [ ] **Step 3: Pass `pending={rollPending}` to `RollButton`**

In `app/src/components/OnlineGameScreen.tsx`, find:

```tsx
      <RollButton
        rollsLeft={room.rollsLeft}
        interactive={isOwnTurn && !rollPending}
        onRoll={() => {
```

Replace with:

```tsx
      <RollButton
        rollsLeft={room.rollsLeft}
        interactive={isOwnTurn && !rollPending}
        pending={rollPending}
        onRoll={() => {
```

- [ ] **Step 4: Run the full file to verify it passes with no regressions**

Run: `npm test --workspace=app -- src/components/OnlineGameScreen.test.tsx`
Expected: all tests PASS (19 total: 18 existing + 1 new).

- [ ] **Step 5: Commit**

```bash
git add app/src/components/OnlineGameScreen.tsx app/src/components/OnlineGameScreen.test.tsx
git commit -m "Show the pending-glow indicator on the roll button in OnlineGameScreen"
```

---

### Task 4: `ScoreBoard` pendingCategory prop

**Files:**
- Modify: `app/src/components/ScoreBoard.tsx`
- Modify: `app/src/components/ScoreBoard.test.tsx`

**Interfaces:**
- Consumes: `.pending-glow` CSS class (Task 1).
- Produces: `ScoreBoard`'s new optional prop `pendingCategory?: ScoreCategory | null` (default `null`), consumed by Task 5. While `pendingCategory` is non-null, only the matching cell renders as a disabled `.pending-glow` button; every other cell that would otherwise be clickable renders blank (same as any other non-clickable cell today) until it clears.

- [ ] **Step 1: Write the failing tests**

Append to `app/src/components/ScoreBoard.test.tsx`, inside the existing `describe('ScoreBoard', ...)` block (after the `'calls onScore with the category when the preview button is clicked'` test):

```tsx
  it('shows the pending category as a disabled pending-glow button, still showing its preview value', () => {
    const state = createGameState(['Ola', 'Kuba']);
    const dice: DiceValue[] = [3, 3, 1, 2, 5];
    render(
      <ScoreBoard
        players={state.players}
        scoreCards={state.scoreCards}
        currentPlayerId={state.players[0].id}
        dice={dice}
        rollsLeft={3}
        pendingCategory="threes"
        onScore={() => {}}
      />
    );
    const row = screen.getByText('Trójki').closest('tr')!;
    const button = row.querySelector('button')!;
    expect(button).not.toBeNull();
    expect(button).toBeDisabled();
    expect(button).toHaveClass('pending-glow');
    expect(button.textContent).toBe('6');
  });

  it('disables other otherwise-clickable categories while one category is pending', () => {
    const state = createGameState(['Ola', 'Kuba']);
    const dice: DiceValue[] = [3, 3, 1, 2, 5];
    render(
      <ScoreBoard
        players={state.players}
        scoreCards={state.scoreCards}
        currentPlayerId={state.players[0].id}
        dice={dice}
        rollsLeft={3}
        pendingCategory="threes"
        onScore={() => {}}
      />
    );
    const acesRow = screen.getByText('Jedynki').closest('tr')!;
    expect(acesRow.querySelector('button')).toBeNull();
  });

  it('has no pending styling when pendingCategory is not provided', () => {
    const state = createGameState(['Ola', 'Kuba']);
    const dice: DiceValue[] = [3, 3, 1, 2, 5];
    render(
      <ScoreBoard
        players={state.players}
        scoreCards={state.scoreCards}
        currentPlayerId={state.players[0].id}
        dice={dice}
        rollsLeft={3}
        onScore={() => {}}
      />
    );
    const row = screen.getByText('Trójki').closest('tr')!;
    const button = row.querySelector('button')!;
    expect(button).not.toBeDisabled();
    expect(button).not.toHaveClass('pending-glow');
  });
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npm test --workspace=app -- src/components/ScoreBoard.test.tsx`
Expected: the first two new tests FAIL (`pendingCategory` prop doesn't exist yet — the "threes" cell renders as a normal clickable button, and the "Jedynki" cell still renders its own clickable button too); the third new test and all pre-existing tests PASS.

- [ ] **Step 3: Implement `pendingCategory` in `ScoreBoard.tsx`**

In `app/src/components/ScoreBoard.tsx`, replace:

```tsx
interface ScoreBoardProps {
  players: Player[];
  scoreCards: Record<string, PlayerScoreCard>;
  currentPlayerId: string;
  dice: DiceValue[];
  rollsLeft: number;
  interactive?: boolean;
  onScore: (category: ScoreCategory) => void;
}
```

with:

```tsx
interface ScoreBoardProps {
  players: Player[];
  scoreCards: Record<string, PlayerScoreCard>;
  currentPlayerId: string;
  dice: DiceValue[];
  rollsLeft: number;
  interactive?: boolean;
  pendingCategory?: ScoreCategory | null;
  onScore: (category: ScoreCategory) => void;
}
```

Then replace:

```tsx
function ScoreBoard({
  players,
  scoreCards,
  currentPlayerId,
  dice,
  rollsLeft,
  interactive = true,
  onScore,
}: ScoreBoardProps) {
  const hasRolled = dice.length === 5;

  const renderCategoryRow = (category: ScoreCategory) => (
    <tr key={category}>
      <td>{CATEGORY_LABELS[category]}</td>
      {players.map((player) => {
        const scoreCard = scoreCards[player.id];
        const value = scoreValue(scoreCard, category);
        const isCurrentPlayer = player.id === currentPlayerId;
        const clickable =
          isCurrentPlayer &&
          interactive &&
          hasRolled &&
          canScoreCategory(scoreCard, category);
        return (
          <td
            key={player.id}
            className={playerColClass(player.id, currentPlayerId)}
          >
            {value !== null ? (
              value
            ) : clickable ? (
              <button type="button" onClick={() => onScore(category)}>
                {previewScore(scoreCard, category, dice, rollsLeft)}
              </button>
            ) : (
              ''
            )}
          </td>
        );
      })}
    </tr>
  );
```

with:

```tsx
function ScoreBoard({
  players,
  scoreCards,
  currentPlayerId,
  dice,
  rollsLeft,
  interactive = true,
  pendingCategory = null,
  onScore,
}: ScoreBoardProps) {
  const hasRolled = dice.length === 5;

  const renderCategoryRow = (category: ScoreCategory) => (
    <tr key={category}>
      <td>{CATEGORY_LABELS[category]}</td>
      {players.map((player) => {
        const scoreCard = scoreCards[player.id];
        const value = scoreValue(scoreCard, category);
        const isCurrentPlayer = player.id === currentPlayerId;
        const wouldBeClickable =
          isCurrentPlayer &&
          interactive &&
          hasRolled &&
          canScoreCategory(scoreCard, category);
        const isPending = wouldBeClickable && category === pendingCategory;
        const clickable = wouldBeClickable && pendingCategory === null;
        return (
          <td
            key={player.id}
            className={playerColClass(player.id, currentPlayerId)}
          >
            {value !== null ? (
              value
            ) : isPending ? (
              <button type="button" className="pending-glow" disabled>
                {previewScore(scoreCard, category, dice, rollsLeft)}
              </button>
            ) : clickable ? (
              <button type="button" onClick={() => onScore(category)}>
                {previewScore(scoreCard, category, dice, rollsLeft)}
              </button>
            ) : (
              ''
            )}
          </td>
        );
      })}
    </tr>
  );
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test --workspace=app -- src/components/ScoreBoard.test.tsx`
Expected: all tests PASS (17 total: 14 existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add app/src/components/ScoreBoard.tsx app/src/components/ScoreBoard.test.tsx
git commit -m "Add pendingCategory prop to ScoreBoard for the score-in-flight indicator"
```

---

### Task 5: Wire `pendingScoreCategory` into `OnlineGameScreen`

**Files:**
- Modify: `app/src/components/OnlineGameScreen.tsx`
- Modify: `app/src/components/OnlineGameScreen.test.tsx`

**Interfaces:**
- Consumes: `ScoreBoard`'s `pendingCategory` prop (Task 4).
- Produces: nothing new consumed by later tasks — this is the last task touching `OnlineGameScreen`.

- [ ] **Step 1: Add `scoreCategory` to the test file's imports and mock-hygiene cleanup**

In `app/src/components/OnlineGameScreen.test.tsx`, replace the import line:

```tsx
import {
  rollDice,
  toggleHeldDie,
  handleTurnTimeout,
  removeInactivePlayers,
  returnToLobby,
} from '../services/roomService';
```

with:

```tsx
import {
  rollDice,
  toggleHeldDie,
  scoreCategory,
  handleTurnTimeout,
  removeInactivePlayers,
  returnToLobby,
} from '../services/roomService';
```

Then, in the `afterEach` block, replace:

```tsx
    vi.mocked(rollDice).mockClear();
    vi.mocked(rollDice).mockResolvedValue(undefined);
```

with:

```tsx
    vi.mocked(rollDice).mockClear();
    vi.mocked(rollDice).mockResolvedValue(undefined);
    vi.mocked(scoreCategory).mockClear();
    vi.mocked(scoreCategory).mockResolvedValue(undefined);
```

- [ ] **Step 2: Write the failing tests**

Add after the `'shows the pending-glow indicator on the roll button while a roll is in flight'` test (Task 3):

```tsx
  it('does not call scoreCategory a second time for another category while one is pending', () => {
    let resolveScore!: () => void;
    vi.mocked(scoreCategory).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveScore = () => resolve(undefined);
        })
    );
    const room = playingRoom({ dice: [1, 2, 3, 4, 5] });
    const { container } = render(
      <OnlineGameScreen room={room} roomId="AAAAA" ownUid="uid-1" onExit={() => {}} />
    );

    const button = container.querySelector(
      '.score-board tbody button'
    ) as HTMLButtonElement;
    fireEvent.click(button);
    fireEvent.click(button);

    expect(scoreCategory).toHaveBeenCalledTimes(1);

    resolveScore();
  });

  it('shows the pending-glow indicator on the score cell being submitted', () => {
    let resolveScore!: () => void;
    vi.mocked(scoreCategory).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveScore = () => resolve(undefined);
        })
    );
    const room = playingRoom({ dice: [1, 2, 3, 4, 5] });
    const { container } = render(
      <OnlineGameScreen room={room} roomId="AAAAA" ownUid="uid-1" onExit={() => {}} />
    );

    const button = container.querySelector(
      '.score-board tbody button'
    ) as HTMLButtonElement;
    fireEvent.click(button);

    expect(button).toHaveClass('pending-glow');

    resolveScore();
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test --workspace=app -- src/components/OnlineGameScreen.test.tsx -t "scoreCategory"`
Expected: both FAIL — `scoreCategory` is currently called unconditionally on every click (`void scoreCategory(roomId, category)`), so the double-click test sees 2 calls, and `ScoreBoard` never receives a `pendingCategory` prop so the button never gets `.pending-glow`.

- [ ] **Step 4: Add `pendingScoreCategory` state and wire it into `ScoreBoard`**

In `app/src/components/OnlineGameScreen.tsx`, replace:

```tsx
  const [rollPending, setRollPending] = useState(false);
```

with:

```tsx
  const [rollPending, setRollPending] = useState(false);
  const [pendingScoreCategory, setPendingScoreCategory] = useState<ScoreCategory | null>(
    null
  );
```

Then replace:

```tsx
      <ScoreBoard
        players={room.players}
        scoreCards={room.scoreCards}
        currentPlayerId={currentPlayer.id}
        dice={isRolling ? [] : stableDice}
        rollsLeft={room.rollsLeft}
        interactive={isOwnTurn}
        onScore={(category: ScoreCategory) => {
          void scoreCategory(roomId, category);
        }}
      />
```

with:

```tsx
      <ScoreBoard
        players={room.players}
        scoreCards={room.scoreCards}
        currentPlayerId={currentPlayer.id}
        dice={isRolling ? [] : stableDice}
        rollsLeft={room.rollsLeft}
        interactive={isOwnTurn}
        pendingCategory={pendingScoreCategory}
        onScore={(category: ScoreCategory) => {
          if (pendingScoreCategory !== null) {
            return;
          }
          setPendingScoreCategory(category);
          scoreCategory(roomId, category).finally(() => setPendingScoreCategory(null));
        }}
      />
```

- [ ] **Step 5: Run the full file to verify it passes with no regressions**

Run: `npm test --workspace=app -- src/components/OnlineGameScreen.test.tsx`
Expected: all tests PASS (21 total: 19 from Task 3 + 2 new).

- [ ] **Step 6: Commit**

```bash
git add app/src/components/OnlineGameScreen.tsx app/src/components/OnlineGameScreen.test.tsx
git commit -m "Prevent double score submissions and show the pending-glow indicator"
```

---

### Task 6: `OnlineMenuScreen` create/join pending labels

**Files:**
- Modify: `app/src/components/OnlineMenuScreen.tsx`
- Modify: `app/src/components/OnlineMenuScreen.test.tsx`

**Interfaces:**
- Consumes: `InlineSpinner` component (Task 1).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add `fireEvent` to the test file's imports and mock-hygiene cleanup**

In `app/src/components/OnlineMenuScreen.test.tsx`, replace:

```tsx
import { render, screen } from '@testing-library/react';
```

with:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
```

Then, in `afterEach`, replace:

```tsx
  afterEach(() => {
    vi.restoreAllMocks();
    // `createRoom`/`joinRoom` are plain `vi.fn()`s from the `vi.mock` factory
    // (not `vi.spyOn`), so `restoreAllMocks` alone doesn't clear their call
    // history between tests — do that explicitly to keep tests isolated.
    vi.clearAllMocks();
  });
```

with:

```tsx
  afterEach(() => {
    vi.restoreAllMocks();
    // `createRoom`/`joinRoom` are plain `vi.fn()`s from the `vi.mock` factory
    // (not `vi.spyOn`), so `restoreAllMocks` alone doesn't clear their call
    // history or any custom `mockImplementation` between tests — reset both
    // explicitly to keep tests isolated.
    vi.clearAllMocks();
    vi.mocked(createRoom).mockReset();
    vi.mocked(joinRoom).mockReset();
  });
```

- [ ] **Step 2: Write the failing tests**

Append to `app/src/components/OnlineMenuScreen.test.tsx`, inside the `describe('OnlineMenuScreen', ...)` block:

```tsx
  it('shows a pending label on Create and disables both buttons while creating a room', () => {
    let resolveCreate!: (roomId: string) => void;
    vi.mocked(createRoom).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        })
    );
    render(
      <OnlineMenuScreen onRoomJoined={() => {}} onOpenProfile={() => {}} onBack={() => {}} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Stwórz pokój' }));

    expect(screen.getByText('Tworzę pokój…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tworzę pokój/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dołącz' })).toBeDisabled();

    resolveCreate('AAAAA');
  });

  it('shows a pending label on Join and disables both buttons while joining a room', async () => {
    const user = userEvent.setup();
    let resolveJoin!: () => void;
    vi.mocked(joinRoom).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveJoin = () => resolve(undefined);
        })
    );
    render(
      <OnlineMenuScreen onRoomJoined={() => {}} onOpenProfile={() => {}} onBack={() => {}} />
    );

    await user.type(screen.getByLabelText('Kod pokoju'), 'ABCDE');
    fireEvent.click(screen.getByRole('button', { name: 'Dołącz' }));

    expect(screen.getByText('Dołączam…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Dołączam/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Stwórz pokój' })).toBeDisabled();

    resolveJoin();
  });
```

- [ ] **Step 3: Run the tests to verify the new ones fail**

Run: `npm test --workspace=app -- src/components/OnlineMenuScreen.test.tsx`
Expected: both new tests FAIL (button text never changes today); all pre-existing tests PASS.

- [ ] **Step 4: Implement the pending labels**

Replace the full contents of `app/src/components/OnlineMenuScreen.tsx` with:

```tsx
import { useState } from 'react';
import { createRoom, joinRoom } from '../services/roomService';
import InlineSpinner from './InlineSpinner';

const PLAYER_COUNT_OPTIONS = [2, 3, 4, 5, 6];
const TURN_TIME_LIMIT_OPTIONS = [15, 30, 45, 60] as const;

interface OnlineMenuScreenProps {
  onRoomJoined: (roomId: string) => void;
  onOpenProfile: () => void;
  onBack: () => void;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Coś poszło nie tak. Spróbuj ponownie.';
}

function OnlineMenuScreen({ onRoomJoined, onOpenProfile, onBack }: OnlineMenuScreenProps) {
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [turnTimeLimitSeconds, setTurnTimeLimitSeconds] = useState<number>(30);
  const [roomCode, setRoomCode] = useState('');
  const [submitting, setSubmitting] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCreateRoom = async () => {
    setSubmitting('create');
    setError(null);
    try {
      const roomId = await createRoom({ maxPlayers, turnTimeLimitSeconds });
      onRoomJoined(roomId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  };

  const handleJoinRoom = async () => {
    const normalizedCode = roomCode.trim().toUpperCase();
    if (normalizedCode.length === 0) {
      setError('Podaj kod pokoju.');
      return;
    }
    setSubmitting('join');
    setError(null);
    try {
      await joinRoom(normalizedCode);
      onRoomJoined(normalizedCode);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="online-menu-screen">
      <button type="button" className="back-button" onClick={onBack}>
        Wstecz
      </button>
      <h1>Gra online</h1>
      {error && <p className="auth-error">{error}</p>}

      <section>
        <h2>Stwórz pokój</h2>
        <label htmlFor="online-max-players">Liczba graczy</label>
        <select
          id="online-max-players"
          value={maxPlayers}
          onChange={(event) => setMaxPlayers(Number(event.target.value))}
        >
          {PLAYER_COUNT_OPTIONS.map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </select>
        <label htmlFor="online-turn-time-limit">Limit czasu na turę</label>
        <select
          id="online-turn-time-limit"
          value={turnTimeLimitSeconds}
          onChange={(event) => setTurnTimeLimitSeconds(Number(event.target.value))}
        >
          {TURN_TIME_LIMIT_OPTIONS.map((seconds) => (
            <option key={seconds} value={seconds}>
              {seconds} s
            </option>
          ))}
        </select>
        <button type="button" disabled={submitting !== null} onClick={handleCreateRoom}>
          {submitting === 'create' ? (
            <>
              Tworzę pokój…
              <InlineSpinner />
            </>
          ) : (
            'Stwórz pokój'
          )}
        </button>
      </section>

      <section>
        <h2>Dołącz kodem</h2>
        <label htmlFor="online-room-code">Kod pokoju</label>
        <input
          id="online-room-code"
          type="text"
          value={roomCode}
          onChange={(event) => setRoomCode(event.target.value)}
        />
        <button type="button" disabled={submitting !== null} onClick={handleJoinRoom}>
          {submitting === 'join' ? (
            <>
              Dołączam…
              <InlineSpinner />
            </>
          ) : (
            'Dołącz'
          )}
        </button>
      </section>

      <button type="button" onClick={onOpenProfile}>
        Profil
      </button>
    </div>
  );
}

export default OnlineMenuScreen;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test --workspace=app -- src/components/OnlineMenuScreen.test.tsx`
Expected: all tests PASS (8 total: 6 existing + 2 new).

- [ ] **Step 6: Commit**

```bash
git add app/src/components/OnlineMenuScreen.tsx app/src/components/OnlineMenuScreen.test.tsx
git commit -m "Show pending labels while creating or joining an online room"
```

---

### Task 7: `RoomLobbyScreen` start-game pending guard + label

**Files:**
- Modify: `app/src/components/RoomLobbyScreen.tsx`
- Modify: `app/src/components/RoomLobbyScreen.test.tsx`

**Interfaces:**
- Consumes: `InlineSpinner` component (Task 1).
- Produces: nothing consumed by later tasks — this is the last task in the plan.

- [ ] **Step 1: Add `fireEvent` to the test file's imports and mock-hygiene cleanup**

In `app/src/components/RoomLobbyScreen.test.tsx`, replace:

```tsx
import { render, screen } from '@testing-library/react';
```

with:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
```

Then replace the `afterEach` block:

```tsx
  afterEach(() => {
    vi.restoreAllMocks();
  });
```

with:

```tsx
  afterEach(() => {
    vi.restoreAllMocks();
    // `startGame` is a plain `vi.fn()` from the `vi.mock` factory (not
    // `vi.spyOn`), so `restoreAllMocks` alone doesn't clear its call history
    // or any custom `mockImplementation` between tests — reset explicitly.
    vi.mocked(startGame).mockReset();
  });
```

- [ ] **Step 2: Write the failing test**

Append to `app/src/components/RoomLobbyScreen.test.tsx`, inside the `describe('RoomLobbyScreen', ...)` block, right after the `'calls startGame with the current player order when the host clicks Start'` test:

```tsx
  it('does not call startGame a second time when clicked again before the first call resolves', () => {
    let resolveStart!: () => void;
    vi.mocked(startGame).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStart = () => resolve(undefined);
        })
    );
    const room = lobbyRoom({
      players: [
        { id: 'uid-1', name: 'Ola', avatarId: 'avatar01', ready: true, lastActiveAt: {} as never },
        { id: 'uid-2', name: 'Kuba', avatarId: 'avatar02', ready: true, lastActiveAt: {} as never },
      ],
    });
    render(<RoomLobbyScreen room={room} roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);

    const button = screen.getByRole('button', { name: 'Rozpocznij grę' });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(startGame).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Startuję…')).toBeInTheDocument();

    resolveStart();
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test --workspace=app -- src/components/RoomLobbyScreen.test.tsx -t "does not call startGame a second time"`
Expected: FAILS — `startGame` is called twice (no guard exists today) and the button text never changes to "Startuję…".

- [ ] **Step 4: Add the `starting` guard and pending label**

In `app/src/components/RoomLobbyScreen.tsx`, replace:

```tsx
import { avatarSrc } from './avatarOptions';
import { setReady, startGame, leaveRoom } from '../services/roomService';
```

with:

```tsx
import { avatarSrc } from './avatarOptions';
import InlineSpinner from './InlineSpinner';
import { setReady, startGame, leaveRoom } from '../services/roomService';
```

Then replace:

```tsx
function RoomLobbyScreen({ room, roomId, ownUid, onLeft }: RoomLobbyScreenProps) {
  const [error, setError] = useState<string | null>(null);
  const [orderedIds, setOrderedIds] = useState<string[]>(() => room.players.map((p) => p.id));
  const [randomizeOrder, setRandomizeOrder] = useState(false);
```

with:

```tsx
function RoomLobbyScreen({ room, roomId, ownUid, onLeft }: RoomLobbyScreenProps) {
  const [error, setError] = useState<string | null>(null);
  const [orderedIds, setOrderedIds] = useState<string[]>(() => room.players.map((p) => p.id));
  const [randomizeOrder, setRandomizeOrder] = useState(false);
  const [starting, setStarting] = useState(false);
```

Replace:

```tsx
  const handleStart = async () => {
    setError(null);
    try {
      const finalOrder = randomizeOrder ? shufflePlayerOrder(orderedIds) : orderedIds;
      await startGame(roomId, finalOrder);
    } catch (err) {
      setError(errorMessage(err));
    }
  };
```

with:

```tsx
  const handleStart = () => {
    if (starting) {
      return;
    }
    setError(null);
    setStarting(true);
    const finalOrder = randomizeOrder ? shufflePlayerOrder(orderedIds) : orderedIds;
    startGame(roomId, finalOrder)
      .catch((err: unknown) => setError(errorMessage(err)))
      .finally(() => setStarting(false));
  };
```

Replace:

```tsx
      {isHost && (
        <button type="button" disabled={!canStart} onClick={handleStart}>
          Rozpocznij grę
        </button>
      )}
```

with:

```tsx
      {isHost && (
        <button type="button" disabled={!canStart || starting} onClick={handleStart}>
          {starting ? (
            <>
              Startuję…
              <InlineSpinner />
            </>
          ) : (
            'Rozpocznij grę'
          )}
        </button>
      )}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test --workspace=app -- src/components/RoomLobbyScreen.test.tsx`
Expected: all tests PASS (12 total: 11 existing + 1 new).

- [ ] **Step 6: Run the full app test suite to check for regressions**

Run: `npm test --workspace=app`
Expected: all test files PASS (230 existing + 2 (Task 2) + 1 (Task 3) + 3 (Task 4) + 2 (Task 5) + 2 (Task 6) + 1 (Task 7) = 241).

- [ ] **Step 7: Commit**

```bash
git add app/src/components/RoomLobbyScreen.tsx app/src/components/RoomLobbyScreen.test.tsx
git commit -m "Prevent double game-start submissions and show a pending label"
```

---

## Self-Review Notes

- **Spec coverage:** Section 1 (fundament CSS) → Task 1. Section 2 (rzut) → Tasks 2–3. Section 3 (wynik) → Tasks 4–5. Section 4 (create/join) → Task 6. Section 5 (start gry + ochrona przed podwójnym kliknięciem) → Task 7. "Poza zakresem" items (held-die, setReady/leaveRoom/removeInactivePlayers/returnToLobby, local hot-seat) are called out in Global Constraints so no task drifts into them.
- **Type consistency:** `RollButton`'s `pending?: boolean` (Task 2) matches the `pending={rollPending}` wiring in Task 3. `ScoreBoard`'s `pendingCategory?: ScoreCategory | null` (Task 4) matches the `pendingCategory={pendingScoreCategory}` wiring and `ScoreCategory | null` state type in Task 5. `InlineSpinner` (Task 1, no props) matches its parameterless usage in Tasks 6 and 7.
- **Test-hygiene rule applied consistently:** every task that adds a `mockImplementation`-based pending test also updates that file's `afterEach` to clear/reset the relevant mock's call history and default implementation (Tasks 5, 6, 7), per the Global Constraints note.
- **No placeholders:** every step has literal, complete code or an exact runnable command with an expected output.
