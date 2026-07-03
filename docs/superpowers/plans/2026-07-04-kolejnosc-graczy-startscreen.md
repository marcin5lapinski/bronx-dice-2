# Kolejność graczy na StartScreen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add drag & drop reordering of player-name rows, a "Losuj kolejność" checkbox that randomizes turn order at game start, and auto-fill of the first name field with the signed-in player's nickname, all on `StartScreen`.

**Architecture:** `StartScreen`'s `names: string[]` state becomes `rows: PlayerNameRow[]` (`{ id, value }`, stable `id` per row via a monotonic counter) so `@dnd-kit/sortable` can track drag position independently of the row's displayed "Gracz N" label (which stays purely position-derived, exactly as today). All new ordering logic (`reorderNames`, `shufflePlayerOrder`) is extracted into pure, independently-tested functions in a new `app/src/utils/playerOrder.ts`, consumed by thin event handlers in `StartScreen.tsx`.

**Tech Stack:** `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` (new dependencies) for drag & drop with built-in touch and keyboard support. React 19 + TypeScript (unchanged). Vitest + Testing Library, following the existing injectable-RNG pattern from `app/src/engine/dice.ts`/`dice.test.ts` for deterministic randomness tests.

Source of truth: `docs/superpowers/specs/2026-07-04-kolejnosc-graczy-startscreen-design.md`.

## Global Constraints

- **`PlayerNameRow` shape:** `{ id: string; value: string }`. `id` generated once per row via a monotonic counter (`player-row-${n}`, incremented in a `useRef`), **never** regenerated on re-render.
- **Labels stay position-derived:** the visible "Gracz N" label is always `Gracz ${index + 1}` computed from the row's *current array position*, never tied to its `id`. After a drag, whatever row now sits at position 0 is labeled "Gracz 1".
- **Checkbox "Losuj kolejność" is a pure flag:** toggling it never changes the visible input order. Shuffling happens exactly once, inside the "Rozpocznij grę" click handler, via `shufflePlayerOrder`.
- **Drag handles are disabled (not hidden/removed) while the checkbox is checked.**
- **Nick auto-fill targets exactly one row** — the row created first at mount — tracked by a `syncedRowId` ref (`string | null`), matched by `id` not position, so it survives that row being dragged elsewhere. The row's value tracks `profile.displayName` reactively until that row's input is edited by hand, which clears `syncedRowId.current` to `null` permanently.
- **No changes to `app/src/engine/*`, `app/src/types/game.ts`, or `onStart`'s signature** (`(playerNames: string[]) => void`) — this plan is scoped to `StartScreen` and its new supporting utility module only.
- **New dependencies (exact versions):** `@dnd-kit/core@^6.3.1`, `@dnd-kit/sortable@^10.0.0`, `@dnd-kit/utilities@^3.2.2`.
- **Testing scope for drag & drop:** the reorder *algorithm* (`reorderNames`) gets full unit-test coverage with plain data, following the injectable-RNG pattern already used by `rollDice`/`dice.test.ts` for `shufflePlayerOrder`. Component-level tests verify drag handles exist and become `disabled` when appropriate — simulating a real pointer-drag gesture through `@dnd-kit` in jsdom is not attempted (jsdom has no real layout geometry, making this fragile/unsupported); that correctness is what Task 2's unit tests are for. A live check of the actual drag gesture in a real browser happens once after implementation, outside the automated suite.
- **All existing tests in `StartScreen.test.tsx` must keep passing unchanged** — they query by label text (`getByLabelText('Gracz 1')` etc.), which stays stable across this refactor since labels remain position-derived text, even though the underlying `id` attributes change from index-based to row-id-based.

---

### Task 1: Add `@dnd-kit` dependencies

**Files:**
- Modify: `app/package.json`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` available as dependencies for every later task.

No automated test — pure dependency scaffolding, verified by build/lint/existing-suite per Step 3.

- [ ] **Step 1: Install the dependencies**

Run:
```bash
cd app
npm install @dnd-kit/core@^6.3.1 @dnd-kit/sortable@^10.0.0 @dnd-kit/utilities@^3.2.2
```

- [ ] **Step 2: Verify nothing imports them yet, and the app still builds**

Run:
```bash
npm run build
npm run lint
npm test
```
Expected: `tsc -b`/`vite build` succeed, no lint issues, all existing tests (168 as of this plan) still pass — nothing in `src/` imports `@dnd-kit/*` yet, so this step only proves the install itself didn't break anything.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add @dnd-kit dependencies for player-order drag & drop"
```

---

### Task 2: `playerOrder.ts` — reorder and shuffle utilities

**Files:**
- Create: `app/src/utils/playerOrder.ts`
- Test: `app/src/utils/playerOrder.test.ts`

**Interfaces:**
- Consumes: `arrayMove` from `@dnd-kit/sortable` (Task 1).
- Produces: `interface PlayerNameRow { id: string; value: string }`, `reorderNames(rows: PlayerNameRow[], activeId: string, overId: string | null): PlayerNameRow[]`, `shufflePlayerOrder(names: string[], random?: () => number): string[]` — consumed by Task 3 (`reorderNames`, `PlayerNameRow`) and Task 4 (`shufflePlayerOrder`).

- [ ] **Step 1: Write the failing tests**

Create `app/src/utils/playerOrder.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  reorderNames,
  shufflePlayerOrder,
  type PlayerNameRow,
} from './playerOrder';

describe('reorderNames', () => {
  const rows: PlayerNameRow[] = [
    { id: 'a', value: 'Ola' },
    { id: 'b', value: 'Kuba' },
    { id: 'c', value: 'Ala' },
  ];

  it('moves a row to a new position', () => {
    const result = reorderNames(rows, 'c', 'a');
    expect(result.map((row) => row.id)).toEqual(['c', 'a', 'b']);
  });

  it('returns the same array when activeId equals overId', () => {
    const result = reorderNames(rows, 'b', 'b');
    expect(result).toEqual(rows);
  });

  it('returns the same array when overId is null', () => {
    const result = reorderNames(rows, 'b', null);
    expect(result).toEqual(rows);
  });

  it('returns the same array when an id is not found', () => {
    const result = reorderNames(rows, 'does-not-exist', 'a');
    expect(result).toEqual(rows);
  });
});

describe('shufflePlayerOrder', () => {
  it('returns a new array containing the same elements', () => {
    const names = ['Ola', 'Kuba', 'Ala'];
    const result = shufflePlayerOrder(names, () => 0);
    expect(result).not.toBe(names);
    expect(result.slice().sort()).toEqual(names.slice().sort());
  });

  it('produces a deterministic order for a fixed random sequence', () => {
    const names = ['A', 'B', 'C', 'D'];
    const random = () => 0; // always picks index 0 as the swap target
    const result = shufflePlayerOrder(names, random);
    // Fisher-Yates from i=3 down to i=1, j=floor(0*(i+1))=0 each step:
    // i=3: swap(3,0) -> [D,B,C,A]
    // i=2: swap(2,0) -> [C,B,D,A]
    // i=1: swap(1,0) -> [B,C,D,A]
    expect(result).toEqual(['B', 'C', 'D', 'A']);
  });

  it('defaults to Math.random when no random function is passed', () => {
    const names = ['A', 'B', 'C'];
    const result = shufflePlayerOrder(names);
    expect(result.slice().sort()).toEqual(names.slice().sort());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/playerOrder.test.ts`
Expected: FAIL — `Cannot find module './playerOrder'`.

- [ ] **Step 3: Implement `playerOrder.ts`**

Create `app/src/utils/playerOrder.ts`:

```ts
import { arrayMove } from '@dnd-kit/sortable';

export interface PlayerNameRow {
  id: string;
  value: string;
}

export function reorderNames(
  rows: PlayerNameRow[],
  activeId: string,
  overId: string | null
): PlayerNameRow[] {
  if (!overId || activeId === overId) {
    return rows;
  }
  const oldIndex = rows.findIndex((row) => row.id === activeId);
  const newIndex = rows.findIndex((row) => row.id === overId);
  if (oldIndex === -1 || newIndex === -1) {
    return rows;
  }
  return arrayMove(rows, oldIndex, newIndex);
}

export function shufflePlayerOrder(
  names: string[],
  random: () => number = Math.random
): string[] {
  const shuffled = [...names];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/utils/playerOrder.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/playerOrder.ts src/utils/playerOrder.test.ts
git commit -m "Add reorderNames and shufflePlayerOrder utilities"
```

---

### Task 3: Migrate `StartScreen` to `PlayerNameRow[]` and wire drag & drop

**Files:**
- Modify: `app/src/components/StartScreen.tsx`
- Modify: `app/src/components/StartScreen.test.tsx`
- Modify: `app/src/styles/components.css`

**Interfaces:**
- Consumes: `PlayerNameRow`, `reorderNames` from `app/src/utils/playerOrder.ts` (Task 2); `DndContext`, `PointerSensor`, `KeyboardSensor`, `useSensor`, `useSensors`, `DragEndEvent` from `@dnd-kit/core`; `SortableContext`, `useSortable`, `sortableKeyboardCoordinates`, `verticalListSortingStrategy` from `@dnd-kit/sortable`; `CSS` from `@dnd-kit/utilities` (all Task 1).
- Produces: the migrated `StartScreen` component — Task 4 adds the checkbox on top of this, Task 5 adds the nick-sync effect on top of this. No new exports beyond the existing default export.

This task is a refactor of existing behavior (no new user-facing feature yet beyond the drag handles) — it's verified by keeping all pre-existing `StartScreen.test.tsx` assertions green, plus new tests for the drag handles' presence.

- [ ] **Step 1: Read the current files**

Read `app/src/components/StartScreen.tsx` and `app/src/components/StartScreen.test.tsx` in full before editing — you need their exact current content to edit correctly, since this step rewrites large parts of both.

- [ ] **Step 2: Add the drag-handle CSS**

Modify `app/src/styles/components.css`, adding at the end of the file:

```css

/* StartScreen player rows (drag & drop) */
.player-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.player-row-field {
  flex: 1;
  text-align: left;
}

.player-row-handle {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  background: transparent;
  border: 1px solid var(--panel-border);
  color: var(--text-dim);
  border-radius: 4px;
  font-size: 16px;
  cursor: grab;
  touch-action: none;
}

.player-row-handle:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
```

`touch-action: none` is required so mobile browsers don't intercept the drag gesture as a page scroll before `@dnd-kit`'s `PointerSensor` sees it.

- [ ] **Step 3: Rewrite `StartScreen.tsx`**

Replace the full content of `app/src/components/StartScreen.tsx` with:

```tsx
import { useRef, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MIN_PLAYERS, MAX_PLAYERS } from '../engine/gameState';
import { useAuth } from '../contexts/AuthContext';
import { reorderNames, type PlayerNameRow } from '../utils/playerOrder';

interface StartScreenProps {
  onStart: (playerNames: string[]) => void;
  onOpenAuth: () => void;
}

function defaultName(index: number): string {
  return `Gracz ${index + 1}`;
}

interface PlayerRowFieldProps {
  row: PlayerNameRow;
  label: string;
  dragDisabled: boolean;
  onChange: (id: string, value: string) => void;
}

function PlayerRowField({
  row,
  label,
  dragDisabled,
  onChange,
}: PlayerRowFieldProps) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: row.id, disabled: dragDisabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div className="player-row" ref={setNodeRef} style={style}>
      <button
        type="button"
        className="player-row-handle"
        aria-label={`Zmień kolejność: ${label}`}
        disabled={dragDisabled}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <div className="player-row-field">
        <label htmlFor={`player-name-${row.id}`}>{label}</label>
        <input
          id={`player-name-${row.id}`}
          type="text"
          value={row.value}
          onChange={(event) => onChange(row.id, event.target.value)}
        />
      </div>
    </div>
  );
}

function StartScreen({ onStart, onOpenAuth }: StartScreenProps) {
  const { user } = useAuth();
  const nextRowId = useRef(0);
  const createRowId = () => `player-row-${nextRowId.current++}`;

  const [playerCount, setPlayerCount] = useState(MIN_PLAYERS);
  const [rows, setRows] = useState<PlayerNameRow[]>(() =>
    Array.from({ length: MIN_PLAYERS }, (_, index) => ({
      id: createRowId(),
      value: defaultName(index),
    }))
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handlePlayerCountChange = (count: number) => {
    setPlayerCount(count);
    setRows((current) =>
      Array.from({ length: count }, (_, index) => {
        const existing = current[index];
        return existing ?? { id: createRowId(), value: defaultName(index) };
      })
    );
  };

  const handleNameChange = (id: string, value: string) => {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, value } : row))
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setRows((current) =>
      reorderNames(current, String(active.id), over ? String(over.id) : null)
    );
  };

  const visibleRows = rows.slice(0, playerCount);
  const trimmedNames = visibleRows.map((row) => row.value.trim());
  const canStart = trimmedNames.every((name) => name.length > 0);

  const handleStart = () => {
    onStart(trimmedNames);
  };

  return (
    <div className="start-screen">
      <img
        className="app-logo"
        src="/dice/logos/logo-bd2-2-header.png"
        alt="Bronx Dice"
      />
      <button type="button" onClick={onOpenAuth}>
        {user ? 'Profil gracza' : 'Zaloguj się'}
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

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext
          items={visibleRows.map((row) => row.id)}
          strategy={verticalListSortingStrategy}
        >
          {visibleRows.map((row, index) => (
            <PlayerRowField
              key={row.id}
              row={row}
              label={defaultName(index)}
              dragDisabled={false}
              onChange={handleNameChange}
            />
          ))}
        </SortableContext>
      </DndContext>

      <button
        type="button"
        disabled={!canStart}
        onClick={handleStart}
      >
        Rozpocznij grę
      </button>
    </div>
  );
}

export default StartScreen;
```

- [ ] **Step 4: Add a test for the drag handles**

Modify `app/src/components/StartScreen.test.tsx` — add this test inside the existing `describe('StartScreen', ...)` block (after the last existing `it(...)`, before the closing `});`):

```tsx
  it('renders a drag handle for each player row, labeled by position', () => {
    renderStartScreen();

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

    await user.clear(screen.getByLabelText('Gracz 1'));
    await user.type(screen.getByLabelText('Gracz 1'), 'Ola');
    await user.clear(screen.getByLabelText('Gracz 2'));
    await user.type(screen.getByLabelText('Gracz 2'), 'Kuba');
    await user.selectOptions(screen.getByLabelText('Liczba graczy'), '3');
    await user.type(screen.getByLabelText('Gracz 3'), 'Ala');

    await user.click(screen.getByRole('button', { name: 'Rozpocznij grę' }));

    expect(onStart).toHaveBeenCalledWith(['Ola', 'Kuba', 'Ala']);
  });
```

The second test doesn't exercise an actual drag gesture (that's covered by `reorderNames`'s own unit tests in Task 2, plus a manual real-browser check after this plan finishes) — it re-confirms the existing name-collection behavior still works after the `PlayerNameRow[]` migration, growing to 3 players.

- [ ] **Step 5: Run the `StartScreen` tests to verify everything passes**

Run: `npx vitest run src/components/StartScreen.test.tsx`
Expected: PASS (all pre-existing tests plus the 2 new ones — 9 total).

- [ ] **Step 6: Run the full suite and lint**

Run:
```bash
npm test
npm run lint
```
Expected: all tests pass, no lint issues (the drag handle button's `⠿` glyph and `aria-label` give it an accessible name — no missing-label warnings).

- [ ] **Step 7: Commit**

```bash
git add src/components/StartScreen.tsx src/components/StartScreen.test.tsx src/styles/components.css
git commit -m "Migrate StartScreen to PlayerNameRow[] and add drag & drop reordering"
```

---

### Task 4: "Losuj kolejność" checkbox

**Files:**
- Modify: `app/src/components/StartScreen.tsx`
- Modify: `app/src/components/StartScreen.test.tsx`
- Modify: `app/src/styles/components.css`

**Interfaces:**
- Consumes: `shufflePlayerOrder` from `app/src/utils/playerOrder.ts` (Task 2); the `StartScreen` structure from Task 3 (adds a `randomizeOrder` state and wires it into `PlayerRowField`'s `dragDisabled` prop and into `handleStart`).
- Produces: no new exports — this task completes the checkbox behavior on top of Task 3.

- [ ] **Step 1: Add the checkbox CSS**

Modify `app/src/styles/components.css`, adding at the end of the file:

```css

.randomize-order-label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-dim);
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 1px;
}
```

- [ ] **Step 2: Write the failing tests**

Modify `app/src/components/StartScreen.test.tsx` — add these tests inside the existing `describe('StartScreen', ...)` block:

```tsx
  it('disables the drag handles when "Losuj kolejność" is checked', async () => {
    const user = userEvent.setup();
    renderStartScreen();

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

    await user.clear(screen.getByLabelText('Gracz 1'));
    await user.type(screen.getByLabelText('Gracz 1'), 'Ola');
    await user.clear(screen.getByLabelText('Gracz 2'));
    await user.type(screen.getByLabelText('Gracz 2'), 'Kuba');
    await user.click(screen.getByLabelText('Losuj kolejność'));
    await user.click(screen.getByRole('button', { name: 'Rozpocznij grę' }));

    // Fisher-Yates on 2 items with random()=0: i=1, j=floor(0*2)=0, swap(1,0)
    expect(onStart).toHaveBeenCalledWith(['Kuba', 'Ola']);

    vi.restoreAllMocks();
  });

  it('does not shuffle when "Losuj kolejność" is left unchecked', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    renderStartScreen({ onStart });

    await user.clear(screen.getByLabelText('Gracz 1'));
    await user.type(screen.getByLabelText('Gracz 1'), 'Ola');
    await user.clear(screen.getByLabelText('Gracz 2'));
    await user.type(screen.getByLabelText('Gracz 2'), 'Kuba');
    await user.click(screen.getByRole('button', { name: 'Rozpocznij grę' }));

    expect(onStart).toHaveBeenCalledWith(['Ola', 'Kuba']);
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/components/StartScreen.test.tsx`
Expected: FAIL — `screen.getByLabelText('Losuj kolejność')` throws (no such checkbox exists yet); the "unchecked" shuffle test may already pass since it matches current behavior, but the other three must fail.

- [ ] **Step 4: Add the checkbox and wire it up**

Modify `app/src/components/StartScreen.tsx`:

Add the import (alongside the existing `playerOrder` import):
```tsx
import { reorderNames, shufflePlayerOrder, type PlayerNameRow } from '../utils/playerOrder';
```

Add state, right after the `rows` state declaration:
```tsx
  const [randomizeOrder, setRandomizeOrder] = useState(false);
```

Change the drag handle's `dragDisabled` prop from the hardcoded `false` to the checkbox state:
```tsx
              dragDisabled={randomizeOrder}
```

Add the checkbox markup between the player-count `<select>` and the `<DndContext>` block:
```tsx
      <label className="randomize-order-label">
        <input
          type="checkbox"
          checked={randomizeOrder}
          onChange={(event) => setRandomizeOrder(event.target.checked)}
        />
        Losuj kolejność
      </label>
```

Update `handleStart` to shuffle when the checkbox is checked:
```tsx
  const handleStart = () => {
    const finalNames = randomizeOrder
      ? shufflePlayerOrder(trimmedNames)
      : trimmedNames;
    onStart(finalNames);
  };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/components/StartScreen.test.tsx`
Expected: PASS (all previous tests plus the 4 new ones — 13 total).

- [ ] **Step 6: Run the full suite and lint**

Run:
```bash
npm test
npm run lint
```
Expected: all tests pass, no lint issues.

- [ ] **Step 7: Commit**

```bash
git add src/components/StartScreen.tsx src/components/StartScreen.test.tsx src/styles/components.css
git commit -m "Add \"Losuj kolejność\" checkbox that shuffles turn order at game start"
```

---

### Task 5: Auto-fill "Gracz 1" with the signed-in player's nickname

**Files:**
- Modify: `app/src/components/StartScreen.tsx`
- Modify: `app/src/components/StartScreen.test.tsx`

**Interfaces:**
- Consumes: `profile` from `useAuth()` (`app/src/contexts/AuthContext.tsx`, already in scope); the `StartScreen` structure from Tasks 3–4.
- Produces: no new exports — this task completes the feature set for this plan.

- [ ] **Step 1: Write the failing tests**

Modify `app/src/components/StartScreen.test.tsx`:

Add `getProfile` to the existing `profileService` mock and import `waitFor`:
```tsx
import { render, screen, waitFor } from '@testing-library/react';
```
```tsx
import { getProfile } from '../services/profileService';
```
```tsx
vi.mock('../services/profileService', () => ({
  getProfile: vi.fn().mockResolvedValue(null),
}));
```
(This mock already exists from the earlier StartScreen auth-button work — just confirm `getProfile` is imported into the test file so it can be referenced with `vi.mocked(getProfile)` below; the `vi.mock` factory itself is unchanged.)

Add these tests inside `describe('StartScreen', ...)`:

```tsx
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

    renderStartScreen();

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

    await waitFor(() =>
      expect(screen.getByLabelText('Gracz 1')).toHaveValue('Ola Nick')
    );

    await user.clear(screen.getByLabelText('Gracz 1'));
    await user.type(screen.getByLabelText('Gracz 1'), 'Custom');

    expect(screen.getByLabelText('Gracz 1')).toHaveValue('Custom');
  });

  it('does not touch "Gracz 1" when signed out', () => {
    renderStartScreen();

    expect(screen.getByLabelText('Gracz 1')).toHaveValue('Gracz 1');
  });
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run src/components/StartScreen.test.tsx`
Expected: the two new signed-in tests FAIL (`Gracz 1` still shows the literal default `"Gracz 1"`, not `"Ola Nick"`); the signed-out test already passes since it matches current behavior.

- [ ] **Step 3: Implement the nick-sync effect**

Modify `app/src/components/StartScreen.tsx`:

Add `useEffect` to the React import:
```tsx
import { useEffect, useRef, useState } from 'react';
```

Add a ref tracking which row is still syncing, initialized to the first row's `id` right after the `rows` state is created:
```tsx
  const [rows, setRows] = useState<PlayerNameRow[]>(() =>
    Array.from({ length: MIN_PLAYERS }, (_, index) => ({
      id: createRowId(),
      value: defaultName(index),
    }))
  );
  const syncedRowId = useRef<string | null>(rows[0].id);
```

Destructure `profile` alongside `user` from `useAuth()`:
```tsx
  const { user, profile } = useAuth();
```

Add the sync effect, right after the `sensors` declaration:
```tsx
  useEffect(() => {
    if (!syncedRowId.current || !user || !profile) {
      return;
    }
    const rowId = syncedRowId.current;
    const nickname = profile.displayName;
    setRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, value: nickname } : row))
    );
  }, [user, profile]);
```

Update `handleNameChange` to clear the sync flag on the first manual edit of the synced row:
```tsx
  const handleNameChange = (id: string, value: string) => {
    if (id === syncedRowId.current) {
      syncedRowId.current = null;
    }
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, value } : row))
    );
  };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/StartScreen.test.tsx`
Expected: PASS (all previous tests plus the 3 new ones — 16 total).

- [ ] **Step 5: Run the full suite, lint, and build**

Run:
```bash
npm test
npm run lint
npm run build
```
Expected: all tests pass, no lint issues, `tsc -b`/`vite build` succeed (confirms `PlayerNameRow`/effect typing is sound end-to-end).

- [ ] **Step 6: Commit**

```bash
git add src/components/StartScreen.tsx src/components/StartScreen.test.tsx
git commit -m "Auto-fill Gracz 1 with the signed-in player's nickname until edited"
```

---

## Self-Review

**Spec coverage:** drag & drop reordering with a dedicated handle and `PlayerNameRow[]`/stable-`id` model (Task 3), `reorderNames`/`shufflePlayerOrder` pure functions with injectable RNG (Task 2), "Losuj kolejność" checkbox as a pure flag that disables handles and shuffles only at start (Task 4), nick auto-fill targeting the first row by `id` with edit-to-stop semantics (Task 5), new `@dnd-kit` dependency (Task 1) — every section of the design doc has a task. Manual real-browser drag verification is explicitly called out as a post-plan step, not a task, since jsdom can't exercise it.

**Placeholder scan:** no TBD/TODO; every step has complete code; no "similar to Task N" references.

**Type consistency:** `PlayerNameRow` (Task 2) is used identically in Task 3's `useState<PlayerNameRow[]>`, `PlayerRowFieldProps`, and `reorderNames`'s signature. `shufflePlayerOrder(names: string[], random?: () => number)` (Task 2) is called in Task 4 exactly as `shufflePlayerOrder(trimmedNames)`, matching its signature (optional second arg defaults to `Math.random`). `syncedRowId`/`handleNameChange`/`rows` names introduced in Task 3 are reused unchanged in Tasks 4–5 — no renames across tasks.
