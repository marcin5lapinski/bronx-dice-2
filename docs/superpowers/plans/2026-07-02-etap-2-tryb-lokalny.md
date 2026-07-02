# Etap 2 — Tryb lokalny (hot-seat) na nowym silniku — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully playable, offline, hot-seat (2–6 players, one device) version of Bronx Dice in React, wiring React UI components to the pure engine built in Etap 1 — start screen, score board, dice rolling with hold/unhold, turn passing, and a winner screen.

**Architecture:** A thin `app/src/engine/turn.ts` module adds session-level orchestration (rolling within a turn, toggling held dice, scoring-and-advancing, game-over/winner detection) on top of the untouched Etap 1 engine. React components under `app/src/components/` are presentation-only — they receive state and callbacks as props and contain no game-rule logic. `app/src/App.tsx` owns the top-level screen transition (start → playing) as plain `useState`; `GameScreen` owns the `GameState` itself. No backend, no persistence — everything lives in React state for the lifetime of the tab.

**Tech Stack:** React 18/19 + TypeScript (from Etap 1's `app/`), Vitest + `@testing-library/react` + `@testing-library/user-event` + `@testing-library/jest-dom` for component tests (jsdom environment, opt-in per test file).

Source of truth for game rules and UI scope: `docs/superpowers/specs/2026-07-01-bronx-dice-roadmap-design.md` (Etap 2 section: "Ekran startowy, wybór liczby graczy (2–6) i nazw. Plansza wyników, rzucanie kością z zaznaczaniem zatrzymanych kości, przekazywanie tury, ekran zwycięzcy. Stan gry trzymany lokalnie w React (bez backendu).").

## Global Constraints

- **Reuse the Etap 1 engine unchanged.** This plan only ADDS `app/src/engine/turn.ts`. Never modify `app/src/types/game.ts`, `app/src/engine/dice.ts`, `app/src/engine/scoring/combinations.ts`, `app/src/engine/scoring/upperSection.ts`, `app/src/engine/scoreCard.ts`, or `app/src/engine/gameState.ts`.
- Player count: 2–6, via `MIN_PLAYERS`/`MAX_PLAYERS` exported from `app/src/engine/gameState.ts` (do not hardcode these numbers in components).
- Rolls per turn: 3, via `MAX_ROLLS` exported from `app/src/engine/dice.ts`.
- Game state lives in plain React `useState` — no backend, no Firebase, no `localStorage` persistence in this stage.
- All UI copy is in Polish.
- Component tests opt into the DOM environment per file with `// @vitest-environment jsdom` as the first line (the project's global Vitest `environment` stays `node` for the fast pure-engine tests from Etap 1).
- No visual design system or CSS polish is in scope — functional minimal markup only.
- Category labels (Polish), used verbatim in `ScoreBoard` and its tests:

  | Category key | Label |
  |---|---|
  | `aces` | Asy |
  | `twos` | Dwójki |
  | `threes` | Trójki |
  | `fours` | Czwórki |
  | `fives` | Piątki |
  | `sixes` | Szóstki |
  | `pair` | Para |
  | `twoPair` | 2x Para |
  | `threeOfKind` | Trójka |
  | `fourOfKind` | Czwórka |
  | `smallStraight` | Mały strit |
  | `largeStraight` | Duży strit |
  | `fullHouse` | Full |
  | `chance` | Szansa |
  | `yahtzee` | Piątka/Generał |

---

### Task 1: Engine turn/session helpers

**Files:**
- Create: `app/src/engine/turn.ts`
- Test: `app/src/engine/turn.test.ts`

**Interfaces:**
- Consumes:
  - `GameState, ScoreCategory, Player, PlayerScoreCard` from `../types/game` (Etap 1 Task 2)
  - `UPPER_CATEGORIES, LOWER_CATEGORIES` from `../types/game`
  - `rollDice` from `./dice` (Etap 1 Task 3)
  - `scoreCategory, calculateTotal` from `./scoreCard` (Etap 1 Tasks 6-7)
  - `nextTurn` from `./gameState` (Etap 1 Task 8)
- Produces:
  - `rollInTurn(state: GameState, random?: () => number): GameState` — throws if `state.rollsLeft <= 0`; otherwise rolls dice (respecting `heldDice`) and decrements `rollsLeft` by 1
  - `toggleHeldDie(state: GameState, index: number): GameState` — flips `heldDice[index]`, leaves the rest untouched
  - `applyScore(state: GameState, category: ScoreCategory): GameState` — scores `category` for the current player using `state.dice`/`state.rollsLeft`, then advances to the next player via `nextTurn` (resetting dice/held/rollsLeft)
  - `isScoreCardComplete(scoreCard: PlayerScoreCard): boolean` — true once all 6 upper + 9 lower categories are non-null
  - `isGameOver(state: GameState): boolean` — true once every player's score card is complete
  - `getWinners(state: GameState): Player[]` — every player tied for the highest `calculateTotal`; a single-element array when there's one winner

- [ ] **Step 1: Write the failing tests**

Create `app/src/engine/turn.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  rollInTurn,
  toggleHeldDie,
  applyScore,
  isScoreCardComplete,
  isGameOver,
  getWinners,
} from './turn';
import { createGameState } from './gameState';
import { createEmptyScoreCard } from './scoreCard';
import { UPPER_CATEGORIES, LOWER_CATEGORIES } from '../types/game';
import type { DiceValue, PlayerScoreCard } from '../types/game';

describe('rollInTurn', () => {
  it('throws when there are no rolls left', () => {
    const state = createGameState(['Ola', 'Kuba']);
    const noRolls = { ...state, rollsLeft: 0 };
    expect(() => rollInTurn(noRolls)).toThrow();
  });

  it('rolls the dice via the injected random function and decrements rollsLeft', () => {
    const state = createGameState(['Ola', 'Kuba']);
    const sequence = [0, 0.2, 0.4, 0.6, 0.8]; // -> 1,2,3,4,5
    let call = 0;
    const random = () => sequence[call++];

    const result = rollInTurn(state, random);

    expect(result.dice).toEqual([1, 2, 3, 4, 5]);
    expect(result.rollsLeft).toBe(2);
  });
});

describe('toggleHeldDie', () => {
  it('flips only the targeted die, leaving the others unchanged', () => {
    const state = createGameState(['Ola', 'Kuba']);
    const withDice = { ...state, dice: [1, 2, 3, 4, 5] as DiceValue[] };

    const result = toggleHeldDie(withDice, 2);
    expect(result.heldDice).toEqual([false, false, true, false, false]);

    const backAgain = toggleHeldDie(result, 2);
    expect(backAgain.heldDice).toEqual([false, false, false, false, false]);
  });
});

describe('applyScore', () => {
  it("scores the current player's category and advances to the next player", () => {
    const state = createGameState(['Ola', 'Kuba']);
    const withDice = {
      ...state,
      dice: [1, 1, 1, 3, 5] as DiceValue[],
      rollsLeft: 1,
    };

    const result = applyScore(withDice, 'aces');

    const olaId = state.players[0].id;
    expect(result.scoreCards[olaId].upper.aces).toBe(3);
    expect(result.currentPlayerIndex).toBe(1);
    expect(result.dice).toEqual([]);
    expect(result.heldDice).toEqual([false, false, false, false, false]);
    expect(result.rollsLeft).toBe(3);
  });
});

function completeScoreCard(): PlayerScoreCard {
  const card = createEmptyScoreCard();
  for (const category of UPPER_CATEGORIES) {
    card.upper[category] = 3;
  }
  for (const category of LOWER_CATEGORIES) {
    card.lower[category] = 10;
  }
  return card;
}

describe('isScoreCardComplete', () => {
  it('returns false for a fresh score card', () => {
    expect(isScoreCardComplete(createEmptyScoreCard())).toBe(false);
  });

  it('returns true once every category is filled', () => {
    expect(isScoreCardComplete(completeScoreCard())).toBe(true);
  });
});

describe('isGameOver', () => {
  it('returns false while any player still has empty categories', () => {
    const state = createGameState(['Ola', 'Kuba']);
    expect(isGameOver(state)).toBe(false);
  });

  it('returns true once every player has a complete score card', () => {
    const state = createGameState(['Ola', 'Kuba']);
    const finished = {
      ...state,
      scoreCards: {
        [state.players[0].id]: completeScoreCard(),
        [state.players[1].id]: completeScoreCard(),
      },
    };
    expect(isGameOver(finished)).toBe(true);
  });
});

describe('getWinners', () => {
  it('returns the single player with the highest total', () => {
    const state = createGameState(['Ola', 'Kuba']);
    const olaCard = completeScoreCard();
    olaCard.lower.chance = 50;
    const finished = {
      ...state,
      scoreCards: {
        [state.players[0].id]: olaCard,
        [state.players[1].id]: completeScoreCard(),
      },
    };
    expect(getWinners(finished)).toEqual([state.players[0]]);
  });

  it('returns every player tied for the highest total', () => {
    const state = createGameState(['Ola', 'Kuba']);
    const finished = {
      ...state,
      scoreCards: {
        [state.players[0].id]: completeScoreCard(),
        [state.players[1].id]: completeScoreCard(),
      },
    };
    expect(getWinners(finished)).toEqual(state.players);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app
npx vitest run src/engine/turn.test.ts
```

Expected: FAIL — `Cannot find module './turn'`.

- [ ] **Step 3: Implement `turn.ts`**

Create `app/src/engine/turn.ts`:

```ts
import type { GameState, ScoreCategory, Player, PlayerScoreCard } from '../types/game';
import { UPPER_CATEGORIES, LOWER_CATEGORIES } from '../types/game';
import { rollDice } from './dice';
import { scoreCategory, calculateTotal } from './scoreCard';
import { nextTurn } from './gameState';

export function rollInTurn(
  state: GameState,
  random: () => number = Math.random
): GameState {
  if (state.rollsLeft <= 0) {
    throw new Error('No rolls left this turn');
  }
  return {
    ...state,
    dice: rollDice(state.dice, state.heldDice, random),
    rollsLeft: state.rollsLeft - 1,
  };
}

export function toggleHeldDie(state: GameState, index: number): GameState {
  return {
    ...state,
    heldDice: state.heldDice.map((held, i) => (i === index ? !held : held)),
  };
}

export function applyScore(
  state: GameState,
  category: ScoreCategory
): GameState {
  const currentPlayer = state.players[state.currentPlayerIndex];
  const updatedScoreCard = scoreCategory(
    state.scoreCards[currentPlayer.id],
    category,
    state.dice,
    state.rollsLeft
  );
  return nextTurn({
    ...state,
    scoreCards: { ...state.scoreCards, [currentPlayer.id]: updatedScoreCard },
  });
}

export function isScoreCardComplete(scoreCard: PlayerScoreCard): boolean {
  const upperFilled = UPPER_CATEGORIES.every(
    (category) => scoreCard.upper[category] !== null
  );
  const lowerFilled = LOWER_CATEGORIES.every(
    (category) => scoreCard.lower[category] !== null
  );
  return upperFilled && lowerFilled;
}

export function isGameOver(state: GameState): boolean {
  return state.players.every((player) =>
    isScoreCardComplete(state.scoreCards[player.id])
  );
}

export function getWinners(state: GameState): Player[] {
  const totals = state.players.map((player) => ({
    player,
    total: calculateTotal(state.scoreCards[player.id]),
  }));
  const maxTotal = Math.max(...totals.map((entry) => entry.total));
  return totals
    .filter((entry) => entry.total === maxTotal)
    .map((entry) => entry.player);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/engine/turn.test.ts
```

Expected: PASS — 10 tests passed.

- [ ] **Step 5: Commit**

```bash
cd ..
git add app/src/engine/turn.ts app/src/engine/turn.test.ts
git commit -m "Add engine turn/session helpers: roll, hold, score-and-advance, game-over"
```

---

### Task 2: `StartScreen` component (+ React component test environment)

**Files:**
- Create: `app/src/test/setup.ts`
- Modify: `app/vite.config.ts`
- Create: `app/src/components/StartScreen.tsx`
- Test: `app/src/components/StartScreen.test.tsx`

**Interfaces:**
- Consumes: `MIN_PLAYERS, MAX_PLAYERS` from `../engine/gameState` (Etap 1 Task 8)
- Produces: `StartScreen({ onStart }: { onStart: (playerNames: string[]) => void }): JSX.Element` — a form to pick player count (2–6) and names; calls `onStart` with trimmed names when the player clicks "Rozpocznij grę"

This is the first component task, so it also wires up the DOM test environment (jsdom + Testing Library) that every later component task reuses.

- [ ] **Step 1: Install component-testing dependencies**

```bash
cd app
npm install -D @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Add the jest-dom matcher setup file**

Create `app/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 3: Wire the setup file into Vitest**

Modify `app/vite.config.ts` — add `setupFiles` to the existing `test` block:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

- [ ] **Step 4: Write the failing test**

Create `app/src/components/StartScreen.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StartScreen from './StartScreen';

describe('StartScreen', () => {
  it('renders 2 name inputs by default', () => {
    render(<StartScreen onStart={() => {}} />);
    expect(screen.getByLabelText('Gracz 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Gracz 2')).toBeInTheDocument();
    expect(screen.queryByLabelText('Gracz 3')).not.toBeInTheDocument();
  });

  it('adds more name inputs when player count increases, preserving existing names', async () => {
    const user = userEvent.setup();
    render(<StartScreen onStart={() => {}} />);

    await user.clear(screen.getByLabelText('Gracz 1'));
    await user.type(screen.getByLabelText('Gracz 1'), 'Ola');
    await user.selectOptions(screen.getByLabelText('Liczba graczy'), '4');

    expect(screen.getByLabelText('Gracz 1')).toHaveValue('Ola');
    expect(screen.getByLabelText('Gracz 3')).toBeInTheDocument();
    expect(screen.getByLabelText('Gracz 4')).toBeInTheDocument();
  });

  it('disables the start button when a name is blank', async () => {
    const user = userEvent.setup();
    render(<StartScreen onStart={() => {}} />);

    await user.clear(screen.getByLabelText('Gracz 1'));

    expect(
      screen.getByRole('button', { name: 'Rozpocznij grę' })
    ).toBeDisabled();
  });

  it('calls onStart with trimmed player names when clicked', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} />);

    await user.clear(screen.getByLabelText('Gracz 1'));
    await user.type(screen.getByLabelText('Gracz 1'), '  Ola  ');
    await user.clear(screen.getByLabelText('Gracz 2'));
    await user.type(screen.getByLabelText('Gracz 2'), 'Kuba');

    await user.click(screen.getByRole('button', { name: 'Rozpocznij grę' }));

    expect(onStart).toHaveBeenCalledWith(['Ola', 'Kuba']);
  });
});
```

- [ ] **Step 5: Run tests to verify they fail**

```bash
npx vitest run src/components/StartScreen.test.tsx
```

Expected: FAIL — `Cannot find module './StartScreen'`.

- [ ] **Step 6: Implement `StartScreen.tsx`**

Create `app/src/components/StartScreen.tsx`:

```tsx
import { useState } from 'react';
import { MIN_PLAYERS, MAX_PLAYERS } from '../engine/gameState';

interface StartScreenProps {
  onStart: (playerNames: string[]) => void;
}

function defaultName(index: number): string {
  return `Gracz ${index + 1}`;
}

function StartScreen({ onStart }: StartScreenProps) {
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

- [ ] **Step 7: Run tests to verify they pass**

```bash
npx vitest run src/components/StartScreen.test.tsx
```

Expected: PASS — 4 tests passed.

- [ ] **Step 8: Commit**

```bash
cd ..
git add app/package.json app/package-lock.json app/vite.config.ts app/src/test/setup.ts app/src/components/StartScreen.tsx app/src/components/StartScreen.test.tsx
git commit -m "Add StartScreen component and React component test environment"
```

---

### Task 3: `DiceTray` component

**Files:**
- Create: `app/src/components/DiceTray.tsx`
- Test: `app/src/components/DiceTray.test.tsx`

**Interfaces:**
- Consumes: `DiceValue` from `../types/game`
- Produces: `DiceTray({ dice, heldDice, onToggleHeld }: { dice: DiceValue[]; heldDice: boolean[]; onToggleHeld: (index: number) => void }): JSX.Element` — renders 5 dice buttons; disabled placeholders (`–`) before the first roll (`dice.length === 0`), the rolled value once `dice.length === 5`; clicking an enabled die calls `onToggleHeld(index)`; held dice carry `aria-pressed="true"`

- [ ] **Step 1: Write the failing tests**

Create `app/src/components/DiceTray.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DiceTray from './DiceTray';
import type { DiceValue } from '../types/game';

describe('DiceTray', () => {
  it('renders 5 disabled placeholders before the first roll', () => {
    render(
      <DiceTray
        dice={[]}
        heldDice={[false, false, false, false, false]}
        onToggleHeld={() => {}}
      />
    );
    const dice = screen.getAllByRole('button');
    expect(dice).toHaveLength(5);
    for (const die of dice) {
      expect(die).toBeDisabled();
      expect(die).toHaveTextContent('–');
    }
  });

  it('shows the rolled values and enables the dice', () => {
    const dice: DiceValue[] = [1, 2, 3, 4, 5];
    render(
      <DiceTray
        dice={dice}
        heldDice={[false, false, false, false, false]}
        onToggleHeld={() => {}}
      />
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ]);
    for (const button of buttons) {
      expect(button).not.toBeDisabled();
    }
  });

  it('calls onToggleHeld with the clicked die index', async () => {
    const user = userEvent.setup();
    const onToggleHeld = vi.fn();
    const dice: DiceValue[] = [1, 2, 3, 4, 5];
    render(
      <DiceTray
        dice={dice}
        heldDice={[false, false, false, false, false]}
        onToggleHeld={onToggleHeld}
      />
    );
    await user.click(screen.getAllByRole('button')[2]);
    expect(onToggleHeld).toHaveBeenCalledWith(2);
  });

  it('marks held dice with aria-pressed', () => {
    const dice: DiceValue[] = [1, 2, 3, 4, 5];
    render(
      <DiceTray
        dice={dice}
        heldDice={[false, true, false, false, false]}
        onToggleHeld={() => {}}
      />
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'true');
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'false');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app
npx vitest run src/components/DiceTray.test.tsx
```

Expected: FAIL — `Cannot find module './DiceTray'`.

- [ ] **Step 3: Implement `DiceTray.tsx`**

Create `app/src/components/DiceTray.tsx`:

```tsx
import type { DiceValue } from '../types/game';

interface DiceTrayProps {
  dice: DiceValue[];
  heldDice: boolean[];
  onToggleHeld: (index: number) => void;
}

function DiceTray({ dice, heldDice, onToggleHeld }: DiceTrayProps) {
  const hasBeenRolled = dice.length === 5;

  return (
    <div className="dice-tray">
      {Array.from({ length: 5 }, (_, index) => (
        <button
          key={index}
          type="button"
          className={`die${heldDice[index] ? ' held' : ''}`}
          aria-pressed={heldDice[index]}
          disabled={!hasBeenRolled}
          onClick={() => onToggleHeld(index)}
        >
          {hasBeenRolled ? dice[index] : '–'}
        </button>
      ))}
    </div>
  );
}

export default DiceTray;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/DiceTray.test.tsx
```

Expected: PASS — 4 tests passed.

- [ ] **Step 5: Commit**

```bash
cd ..
git add app/src/components/DiceTray.tsx app/src/components/DiceTray.test.tsx
git commit -m "Add DiceTray component"
```

---

### Task 4: `RollButton` component

**Files:**
- Create: `app/src/components/RollButton.tsx`
- Test: `app/src/components/RollButton.test.tsx`

**Interfaces:**
- Produces: `RollButton({ rollsLeft, onRoll }: { rollsLeft: number; onRoll: () => void }): JSX.Element` — shows "Pozostałe rzuty: N"; the "Rzuć kośćmi" button is disabled when `rollsLeft === 0`

- [ ] **Step 1: Write the failing tests**

Create `app/src/components/RollButton.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RollButton from './RollButton';

describe('RollButton', () => {
  it('shows the number of rolls left', () => {
    render(<RollButton rollsLeft={3} onRoll={() => {}} />);
    expect(screen.getByText('Pozostałe rzuty: 3')).toBeInTheDocument();
  });

  it('calls onRoll when clicked and rolls remain', async () => {
    const user = userEvent.setup();
    const onRoll = vi.fn();
    render(<RollButton rollsLeft={2} onRoll={onRoll} />);
    await user.click(screen.getByRole('button', { name: 'Rzuć kośćmi' }));
    expect(onRoll).toHaveBeenCalledTimes(1);
  });

  it('is disabled when no rolls are left', async () => {
    const user = userEvent.setup();
    const onRoll = vi.fn();
    render(<RollButton rollsLeft={0} onRoll={onRoll} />);
    const button = screen.getByRole('button', { name: 'Rzuć kośćmi' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onRoll).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app
npx vitest run src/components/RollButton.test.tsx
```

Expected: FAIL — `Cannot find module './RollButton'`.

- [ ] **Step 3: Implement `RollButton.tsx`**

Create `app/src/components/RollButton.tsx`:

```tsx
interface RollButtonProps {
  rollsLeft: number;
  onRoll: () => void;
}

function RollButton({ rollsLeft, onRoll }: RollButtonProps) {
  return (
    <div className="roll-button">
      <button type="button" disabled={rollsLeft === 0} onClick={onRoll}>
        Rzuć kośćmi
      </button>
      <p>Pozostałe rzuty: {rollsLeft}</p>
    </div>
  );
}

export default RollButton;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/RollButton.test.tsx
```

Expected: PASS — 3 tests passed.

- [ ] **Step 5: Commit**

```bash
cd ..
git add app/src/components/RollButton.tsx app/src/components/RollButton.test.tsx
git commit -m "Add RollButton component"
```

---

### Task 5: `ScoreBoard` component

**Files:**
- Create: `app/src/components/ScoreBoard.tsx`
- Test: `app/src/components/ScoreBoard.test.tsx`

**Interfaces:**
- Consumes:
  - `Player, PlayerScoreCard, ScoreCategory, DiceValue` from `../types/game`
  - `UPPER_CATEGORIES, LOWER_CATEGORIES` from `../types/game`
  - `canScoreCategory, calculateTotal, isUpperCategory, scoreCategory` from `../engine/scoreCard` (Etap 1 Tasks 6-7)
- Produces: `ScoreBoard({ players, scoreCards, currentPlayerId, dice, rollsLeft, onScore }): JSX.Element` — a table with one row per category (Polish labels, see Global Constraints) and one column per player. A cell shows the filled value as plain text once scored; otherwise, for the current player only, once `dice.length === 5` and `canScoreCategory` allows it, shows a clickable button previewing the score that clicking it would record (via `scoreCategory`, without mutating any state) and calling `onScore(category)` on click. A "Suma" footer row shows `calculateTotal` per player.

- [ ] **Step 1: Write the failing tests**

Create `app/src/components/ScoreBoard.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ScoreBoard from './ScoreBoard';
import { createGameState } from '../engine/gameState';
import type { DiceValue } from '../types/game';

describe('ScoreBoard', () => {
  it('renders category labels and one column per player', () => {
    const state = createGameState(['Ola', 'Kuba']);
    render(
      <ScoreBoard
        players={state.players}
        scoreCards={state.scoreCards}
        currentPlayerId={state.players[0].id}
        dice={[]}
        rollsLeft={3}
        onScore={() => {}}
      />
    );
    expect(screen.getByText('Asy')).toBeInTheDocument();
    expect(screen.getByText('Piątka/Generał')).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Ola' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Kuba' })
    ).toBeInTheDocument();
  });

  it('shows a filled score as plain text, not a button', () => {
    const state = createGameState(['Ola', 'Kuba']);
    state.scoreCards[state.players[0].id].upper.aces = 3;
    render(
      <ScoreBoard
        players={state.players}
        scoreCards={state.scoreCards}
        currentPlayerId={state.players[0].id}
        dice={[]}
        rollsLeft={3}
        onScore={() => {}}
      />
    );
    const row = screen.getByText('Asy').closest('tr')!;
    expect(row).toHaveTextContent('3');
    expect(row.querySelector('button')).toBeNull();
  });

  it('shows nothing clickable before the first roll of the turn', () => {
    const state = createGameState(['Ola', 'Kuba']);
    render(
      <ScoreBoard
        players={state.players}
        scoreCards={state.scoreCards}
        currentPlayerId={state.players[0].id}
        dice={[]}
        rollsLeft={3}
        onScore={() => {}}
      />
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('shows a clickable score preview for the current player after rolling', () => {
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
    expect(button).not.toBeNull();
    expect(button.textContent).toBe('6');
  });

  it('does not show a clickable cell for a player whose turn it is not', () => {
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
    const cells = row.querySelectorAll('td');
    expect(cells[2].querySelector('button')).toBeNull();
  });

  it('calls onScore with the category when the preview button is clicked', async () => {
    const user = userEvent.setup();
    const onScore = vi.fn();
    const state = createGameState(['Ola', 'Kuba']);
    const dice: DiceValue[] = [3, 3, 1, 2, 5];
    render(
      <ScoreBoard
        players={state.players}
        scoreCards={state.scoreCards}
        currentPlayerId={state.players[0].id}
        dice={dice}
        rollsLeft={3}
        onScore={onScore}
      />
    );
    const row = screen.getByText('Trójki').closest('tr')!;
    await user.click(row.querySelector('button')!);
    expect(onScore).toHaveBeenCalledWith('threes');
  });

  it('keeps lower-section categories blank until the upper section is filled', () => {
    const state = createGameState(['Ola', 'Kuba']);
    const dice: DiceValue[] = [1, 2, 3, 4, 5];
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
    const row = screen.getByText('Szansa').closest('tr')!;
    expect(row.querySelector('button')).toBeNull();
  });

  it('shows each player total in the Suma row', () => {
    const state = createGameState(['Ola', 'Kuba']);
    state.scoreCards[state.players[0].id].upper.aces = 3;
    render(
      <ScoreBoard
        players={state.players}
        scoreCards={state.scoreCards}
        currentPlayerId={state.players[0].id}
        dice={[]}
        rollsLeft={3}
        onScore={() => {}}
      />
    );
    const row = screen.getByText('Suma').closest('tr')!;
    expect(row).toHaveTextContent('3');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app
npx vitest run src/components/ScoreBoard.test.tsx
```

Expected: FAIL — `Cannot find module './ScoreBoard'`.

- [ ] **Step 3: Implement `ScoreBoard.tsx`**

Create `app/src/components/ScoreBoard.tsx`:

```tsx
import type {
  Player,
  PlayerScoreCard,
  ScoreCategory,
  DiceValue,
} from '../types/game';
import { UPPER_CATEGORIES, LOWER_CATEGORIES } from '../types/game';
import {
  canScoreCategory,
  calculateTotal,
  isUpperCategory,
  scoreCategory,
} from '../engine/scoreCard';

interface ScoreBoardProps {
  players: Player[];
  scoreCards: Record<string, PlayerScoreCard>;
  currentPlayerId: string;
  dice: DiceValue[];
  rollsLeft: number;
  onScore: (category: ScoreCategory) => void;
}

const CATEGORY_LABELS: Record<ScoreCategory, string> = {
  aces: 'Asy',
  twos: 'Dwójki',
  threes: 'Trójki',
  fours: 'Czwórki',
  fives: 'Piątki',
  sixes: 'Szóstki',
  pair: 'Para',
  twoPair: '2x Para',
  threeOfKind: 'Trójka',
  fourOfKind: 'Czwórka',
  smallStraight: 'Mały strit',
  largeStraight: 'Duży strit',
  fullHouse: 'Full',
  chance: 'Szansa',
  yahtzee: 'Piątka/Generał',
};

function scoreValue(
  scoreCard: PlayerScoreCard,
  category: ScoreCategory
): number | null {
  return isUpperCategory(category)
    ? scoreCard.upper[category]
    : scoreCard.lower[category];
}

function previewScore(
  scoreCard: PlayerScoreCard,
  category: ScoreCategory,
  dice: DiceValue[],
  rollsLeft: number
): number {
  const preview = scoreCategory(scoreCard, category, dice, rollsLeft);
  return scoreValue(preview, category) ?? 0;
}

function ScoreBoard({
  players,
  scoreCards,
  currentPlayerId,
  dice,
  rollsLeft,
  onScore,
}: ScoreBoardProps) {
  const categories: ScoreCategory[] = [
    ...UPPER_CATEGORIES,
    ...LOWER_CATEGORIES,
  ];
  const hasRolled = dice.length === 5;

  return (
    <table className="score-board">
      <thead>
        <tr>
          <th>Kategoria</th>
          {players.map((player) => (
            <th key={player.id}>{player.name}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {categories.map((category) => (
          <tr key={category}>
            <td>{CATEGORY_LABELS[category]}</td>
            {players.map((player) => {
              const scoreCard = scoreCards[player.id];
              const value = scoreValue(scoreCard, category);
              const isCurrentPlayer = player.id === currentPlayerId;
              const clickable =
                isCurrentPlayer &&
                hasRolled &&
                canScoreCategory(scoreCard, category);
              return (
                <td key={player.id}>
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
        ))}
        <tr>
          <td>Suma</td>
          {players.map((player) => (
            <td key={player.id}>{calculateTotal(scoreCards[player.id])}</td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

export default ScoreBoard;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/ScoreBoard.test.tsx
```

Expected: PASS — 8 tests passed.

- [ ] **Step 5: Commit**

```bash
cd ..
git add app/src/components/ScoreBoard.tsx app/src/components/ScoreBoard.test.tsx
git commit -m "Add ScoreBoard component with live score preview"
```

---

### Task 6: `WinnerScreen` component

**Files:**
- Create: `app/src/components/WinnerScreen.tsx`
- Test: `app/src/components/WinnerScreen.test.tsx`

**Interfaces:**
- Consumes: `Player, PlayerScoreCard` from `../types/game`; `calculateTotal` from `../engine/scoreCard`
- Produces: `WinnerScreen({ winners, scoreCards, onPlayAgain }: { winners: Player[]; scoreCards: Record<string, PlayerScoreCard>; onPlayAgain: () => void }): JSX.Element` — announces the single winner ("Zwycięzca: {name}!") or a tie ("Remis: {names joined with ' i '}!"), shows the winning total, and a "Zagraj ponownie" button calling `onPlayAgain`

- [ ] **Step 1: Write the failing tests**

Create `app/src/components/WinnerScreen.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WinnerScreen from './WinnerScreen';
import { createEmptyScoreCard } from '../engine/scoreCard';
import type { Player, PlayerScoreCard } from '../types/game';

function scoreCardWithTotal(total: number): PlayerScoreCard {
  const card = createEmptyScoreCard();
  card.lower.chance = total;
  return card;
}

describe('WinnerScreen', () => {
  it('announces the single winner and their total', () => {
    const winners: Player[] = [{ id: 'player-1', name: 'Ola' }];
    const scoreCards = { 'player-1': scoreCardWithTotal(120) };
    render(
      <WinnerScreen
        winners={winners}
        scoreCards={scoreCards}
        onPlayAgain={() => {}}
      />
    );
    expect(screen.getByText('Zwycięzca: Ola!')).toBeInTheDocument();
    expect(screen.getByText('Wynik: 120')).toBeInTheDocument();
  });

  it('announces a tie between multiple winners', () => {
    const winners: Player[] = [
      { id: 'player-1', name: 'Ola' },
      { id: 'player-2', name: 'Kuba' },
    ];
    const scoreCards = {
      'player-1': scoreCardWithTotal(100),
      'player-2': scoreCardWithTotal(100),
    };
    render(
      <WinnerScreen
        winners={winners}
        scoreCards={scoreCards}
        onPlayAgain={() => {}}
      />
    );
    expect(screen.getByText('Remis: Ola i Kuba!')).toBeInTheDocument();
  });

  it('calls onPlayAgain when the button is clicked', async () => {
    const user = userEvent.setup();
    const onPlayAgain = vi.fn();
    const winners: Player[] = [{ id: 'player-1', name: 'Ola' }];
    const scoreCards = { 'player-1': scoreCardWithTotal(50) };
    render(
      <WinnerScreen
        winners={winners}
        scoreCards={scoreCards}
        onPlayAgain={onPlayAgain}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Zagraj ponownie' }));
    expect(onPlayAgain).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app
npx vitest run src/components/WinnerScreen.test.tsx
```

Expected: FAIL — `Cannot find module './WinnerScreen'`.

- [ ] **Step 3: Implement `WinnerScreen.tsx`**

Create `app/src/components/WinnerScreen.tsx`:

```tsx
import type { Player, PlayerScoreCard } from '../types/game';
import { calculateTotal } from '../engine/scoreCard';

interface WinnerScreenProps {
  winners: Player[];
  scoreCards: Record<string, PlayerScoreCard>;
  onPlayAgain: () => void;
}

function WinnerScreen({ winners, scoreCards, onPlayAgain }: WinnerScreenProps) {
  const winningTotal = calculateTotal(scoreCards[winners[0].id]);
  const names = winners.map((winner) => winner.name).join(' i ');
  const heading =
    winners.length === 1 ? `Zwycięzca: ${names}!` : `Remis: ${names}!`;

  return (
    <div className="winner-screen">
      <h1>{heading}</h1>
      <p>Wynik: {winningTotal}</p>
      <button type="button" onClick={onPlayAgain}>
        Zagraj ponownie
      </button>
    </div>
  );
}

export default WinnerScreen;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/WinnerScreen.test.tsx
```

Expected: PASS — 3 tests passed.

- [ ] **Step 5: Commit**

```bash
cd ..
git add app/src/components/WinnerScreen.tsx app/src/components/WinnerScreen.test.tsx
git commit -m "Add WinnerScreen component"
```

---

### Task 7: `GameScreen` component (integration)

**Files:**
- Create: `app/src/components/GameScreen.tsx`
- Test: `app/src/components/GameScreen.test.tsx`

**Interfaces:**
- Consumes:
  - `createGameState` from `../engine/gameState` (Etap 1 Task 8)
  - `rollInTurn, toggleHeldDie, applyScore, isGameOver, getWinners` from `../engine/turn` (Task 1)
  - `GameState, ScoreCategory` from `../types/game`
  - `DiceTray` (Task 3), `RollButton` (Task 4), `ScoreBoard` (Task 5), `WinnerScreen` (Task 6)
- Produces: `GameScreen({ playerNames, onPlayAgain }: { playerNames: string[]; onPlayAgain: () => void }): JSX.Element` — owns the `GameState` (created once from `playerNames`); renders the turn indicator, `DiceTray`, `RollButton`, and `ScoreBoard` wired to the engine helpers while the game is in progress, or `WinnerScreen` once `isGameOver` is true

This task is the cross-component integration point: it is what chains `createGameState` → `rollInTurn` → `applyScore` → `calculateTotal` (via `ScoreBoard`/`WinnerScreen`) together, so its test exercises that full chain through real user interactions rather than mocked pieces.

- [ ] **Step 1: Write the failing tests**

Create `app/src/components/GameScreen.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GameScreen from './GameScreen';

describe('GameScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rolls dice and displays the results when the roll button is clicked', async () => {
    const user = userEvent.setup();
    vi.spyOn(Math, 'random').mockReturnValue(0); // every die shows 1
    render(<GameScreen playerNames={['Ola', 'Kuba']} onPlayAgain={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'Rzuć kośćmi' }));

    expect(screen.getByText('Pozostałe rzuty: 2')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '1' })).toHaveLength(5);
  });

  it('scoring a category records it on the board and advances to the next player', async () => {
    const user = userEvent.setup();
    vi.spyOn(Math, 'random').mockReturnValue(0); // every die = 1 -> aces score = 5
    render(<GameScreen playerNames={['Ola', 'Kuba']} onPlayAgain={() => {}} />);

    expect(screen.getByText('Tura: Ola')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Rzuć kośćmi' }));
    const row = screen.getByText('Asy').closest('tr')!;
    await user.click(row.querySelector('button')!);

    expect(row).toHaveTextContent('5');
    expect(screen.getByText('Tura: Kuba')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app
npx vitest run src/components/GameScreen.test.tsx
```

Expected: FAIL — `Cannot find module './GameScreen'`.

- [ ] **Step 3: Implement `GameScreen.tsx`**

Create `app/src/components/GameScreen.tsx`:

```tsx
import { useState } from 'react';
import { createGameState } from '../engine/gameState';
import {
  rollInTurn,
  toggleHeldDie,
  applyScore,
  isGameOver,
  getWinners,
} from '../engine/turn';
import type { GameState, ScoreCategory } from '../types/game';
import DiceTray from './DiceTray';
import RollButton from './RollButton';
import ScoreBoard from './ScoreBoard';
import WinnerScreen from './WinnerScreen';

interface GameScreenProps {
  playerNames: string[];
  onPlayAgain: () => void;
}

function GameScreen({ playerNames, onPlayAgain }: GameScreenProps) {
  const [state, setState] = useState<GameState>(() =>
    createGameState(playerNames)
  );

  if (isGameOver(state)) {
    return (
      <WinnerScreen
        winners={getWinners(state)}
        scoreCards={state.scoreCards}
        onPlayAgain={onPlayAgain}
      />
    );
  }

  const currentPlayer = state.players[state.currentPlayerIndex];

  return (
    <div className="game-screen">
      <h2>Tura: {currentPlayer.name}</h2>
      <DiceTray
        dice={state.dice}
        heldDice={state.heldDice}
        onToggleHeld={(index) =>
          setState((current) => toggleHeldDie(current, index))
        }
      />
      <RollButton
        rollsLeft={state.rollsLeft}
        onRoll={() => setState((current) => rollInTurn(current))}
      />
      <ScoreBoard
        players={state.players}
        scoreCards={state.scoreCards}
        currentPlayerId={currentPlayer.id}
        dice={state.dice}
        rollsLeft={state.rollsLeft}
        onScore={(category: ScoreCategory) =>
          setState((current) => applyScore(current, category))
        }
      />
    </div>
  );
}

export default GameScreen;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/GameScreen.test.tsx
```

Expected: PASS — 2 tests passed.

- [ ] **Step 5: Commit**

```bash
cd ..
git add app/src/components/GameScreen.tsx app/src/components/GameScreen.test.tsx
git commit -m "Add GameScreen component wiring the engine to the UI"
```

---

### Task 8: `App` — top-level screen routing

**Files:**
- Modify: `app/src/App.tsx` (replace entirely)
- Test: `app/src/App.test.tsx`
- Delete: `app/src/App.css`, `app/src/assets/react.svg`, `app/src/assets/vite.svg`, `app/src/assets/hero.png` (Vite template demo content, no longer referenced by anything once `App.tsx` is replaced)

**Interfaces:**
- Consumes: `StartScreen` (Task 2), `GameScreen` (Task 7)
- Produces: `App(): JSX.Element` — shows `StartScreen` until a game is started; then renders `GameScreen`, whose `onPlayAgain` returns to `StartScreen`

- [ ] **Step 1: Write the failing tests**

Create `app/src/App.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

describe('App', () => {
  it('shows the start screen first', () => {
    render(<App />);
    expect(screen.getByText('Bronx Dice')).toBeInTheDocument();
    expect(screen.getByLabelText('Liczba graczy')).toBeInTheDocument();
  });

  it('starts the game after entering names and clicking start', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.clear(screen.getByLabelText('Gracz 1'));
    await user.type(screen.getByLabelText('Gracz 1'), 'Ola');
    await user.clear(screen.getByLabelText('Gracz 2'));
    await user.type(screen.getByLabelText('Gracz 2'), 'Kuba');
    await user.click(screen.getByRole('button', { name: 'Rozpocznij grę' }));

    expect(screen.getByText('Tura: Ola')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app
npx vitest run src/App.test.tsx
```

Expected: FAIL — the current `App` renders the Vite template demo, so `screen.getByText('Bronx Dice')` throws (element not found).

- [ ] **Step 3: Replace `App.tsx` and delete unused Vite template assets**

Replace the full contents of `app/src/App.tsx`:

```tsx
import { useState } from 'react';
import StartScreen from './components/StartScreen';
import GameScreen from './components/GameScreen';

function App() {
  const [playerNames, setPlayerNames] = useState<string[] | null>(null);

  if (!playerNames) {
    return <StartScreen onStart={setPlayerNames} />;
  }

  return (
    <GameScreen
      playerNames={playerNames}
      onPlayAgain={() => setPlayerNames(null)}
    />
  );
}

export default App;
```

Delete the now-unused Vite template files (nothing imports them once `App.tsx` above is in place). You are still inside `app/` from Step 2, so the paths are relative to it:

```bash
git rm src/App.css src/assets/react.svg src/assets/vite.svg src/assets/hero.png
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/App.test.tsx
```

Expected: PASS — 2 tests passed.

- [ ] **Step 5: Run the full test suite, lint, and type-check**

```bash
npm run test
npm run lint
npx tsc --noEmit
```

Expected: all 13 test files pass (5 from Etap 1 + `turn.test.ts`, `StartScreen.test.tsx`, `DiceTray.test.tsx`, `RollButton.test.tsx`, `ScoreBoard.test.tsx`, `WinnerScreen.test.tsx`, `GameScreen.test.tsx`, `App.test.tsx` — 106 tests total), lint clean, no type errors.

- [ ] **Step 6: Commit**

```bash
cd ..
git add -A app/src/App.tsx app/src/App.test.tsx
git commit -m "Wire App to StartScreen/GameScreen and remove unused Vite template assets"
```

---

## Definition of done for Etap 2

- `npm run test` (inside `app/`) passes with 106 tests across 13 files — the 70 from Etap 1 plus 36 new tests covering the turn/session engine helpers and every UI component.
- `npm run build`, `npm run lint`, and `npx tsc --noEmit` all succeed.
- A player can open the app, pick 2–6 players and names, play a full hot-seat game (roll, hold dice, score every category for every player), see the winner screen (including ties), and start a new game — entirely offline, with no backend.
- The Etap 1 engine files are untouched; all new game-flow logic lives in `app/src/engine/turn.ts`.
