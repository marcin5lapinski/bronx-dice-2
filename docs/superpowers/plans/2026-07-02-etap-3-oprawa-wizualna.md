# Etap 3 — Oprawa wizualna — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved "Electric HUD" futuristic visual theme to the Etap 2 UI (`StartScreen`, `DiceTray`, `RollButton`, `ScoreBoard`, `WinnerScreen`, `GameScreen`) — dark HUD palette, glow accents, a new "Bonus" table row, a CSS roll-spin animation on unrolled dice, and a responsive layout that works on both phone and desktop widths from the start.

**Architecture:** Two new global stylesheets (`app/src/styles/theme.css` for design tokens/reset/animation keyframes, `app/src/styles/components.css` for per-component rules) replace the Vite-template `index.css`. Styling targets the `className`s components already expose (`start-screen`, `dice-tray`/`die`/`held`, `roll-button`, `score-board`, `winner-screen`, `game-screen`) — most of this plan is additive CSS with no component code changes. The two exceptions with real logic (and their own tests) are: the new "Bonus" row + current-player column highlight in `ScoreBoard`, and a local rolling-animation flag in `DiceTray`.

**Tech Stack:** Plain CSS (custom properties, media queries, `@keyframes`) — no CSS-in-JS, no new dependencies. React 18/19 + TypeScript (unchanged from Etap 1/2). Vitest + Testing Library for the two components that gain testable logic.

Source of truth: `docs/superpowers/specs/2026-07-02-etap-3-oprawa-wizualna-design.md`.

## Global Constraints

- **Zero changes to the engine or types.** Never modify `app/src/types/game.ts`, `app/src/engine/dice.ts`, `app/src/engine/scoring/*.ts`, `app/src/engine/scoreCard.ts`, `app/src/engine/gameState.ts`, or `app/src/engine/turn.ts`.
- **Zero changes to existing component props/callbacks.** Every component keeps the exact same props interface it has today — this plan only adds CSS classes, a new derived "Bonus" table row, and local UI-only animation state.
- **All 106 existing tests keep passing.** Only `DiceTray.test.tsx` and `ScoreBoard.test.tsx` gain new test cases (for the two pieces of new logic); no existing assertion's expected value changes.
- **Color tokens (exact hex values):**
  - Background: `#060b14`
  - Accent blue (interactive/active): `#00e5ff`
  - Accent green (confirmed/total values): `#39ff14`
  - Panel border: `#1d3a4a`
  - Text: `#cfe8ee`; dim text: `#4a6a7a`
- **Font:** `ui-monospace, Consolas, monospace` throughout (HUD/terminal feel).
- **Dice highlight convention (intentionally inverted):** held die (`held === true`, will NOT be rerolled) → no glow, dim colors. Unheld die (`held === false`, WILL be rerolled) → blue glow border.
- **Roll animation:** purely visual CSS rotation, `ROLL_ANIMATION_MS = 1000` (1 second), `transform: rotate(740deg)` with an ease-out timing function, applied only to dice that are not held. The true dice value must still appear in the DOM immediately when the `dice` prop changes — the animation never delays or hides the value, only rotates the element visually.
- **"Bonus" row:** new row in `ScoreBoard`, positioned between "Szóstki" (last upper category) and "Para" (first lower category). Blank when `calculateBonus(scoreCard) === 0`; exact number `50` (not text) with the green accent when `calculateBonus(scoreCard) === 50`. Purely derived/presentational — never calls `onScore`, has no `ScoreCategory` counterpart.
- **Current player's table column** gets a subtle highlighted background across every row (header, every category, the Bonus row, the Suma row) via a `current-player-col` class.
- **Responsive from the start:** the same component structure works at phone width (~380px) and wider (tablet/desktop) via CSS media queries — no separate layout branches in JSX.

---

### Task 1: Design system foundation (tokens, reset, animation keyframe)

**Files:**
- Create: `app/src/styles/theme.css`
- Create: `app/src/styles/components.css`
- Modify: `app/src/main.tsx`
- Delete: `app/src/index.css`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: CSS custom properties consumed by every later task's component CSS: `--bg`, `--panel-bg`, `--panel-border`, `--text`, `--text-dim`, `--accent-blue`, `--accent-blue-glow`, `--accent-blue-bg`, `--accent-green`, `--accent-green-glow`, `--accent-green-bg`, `--font-mono`, `--die-size`. Also produces the `@keyframes dice-spin` animation used by Task 2's `.die.rolling` rule, and the empty `app/src/styles/components.css` file that Tasks 2–5 append to.

This task has no automated test (pure CSS/build scaffolding) — verified by build, lint, the full existing test suite, and a manual visual check, same pattern as Etap 1's Task 1.

- [ ] **Step 1: Create the design tokens and global reset**

Create `app/src/styles/theme.css`:

```css
:root {
  --bg: #060b14;
  --panel-bg: rgba(255, 255, 255, 0.03);
  --panel-border: #1d3a4a;
  --text: #cfe8ee;
  --text-dim: #4a6a7a;
  --accent-blue: #00e5ff;
  --accent-blue-glow: rgba(0, 229, 255, 0.6);
  --accent-blue-bg: rgba(0, 229, 255, 0.08);
  --accent-green: #39ff14;
  --accent-green-glow: rgba(57, 255, 20, 0.6);
  --accent-green-bg: rgba(57, 255, 20, 0.06);
  --font-mono: ui-monospace, Consolas, monospace;
  --die-size: 48px;
}

@media (min-width: 640px) {
  :root {
    --die-size: 60px;
  }
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-mono);
  min-height: 100vh;
}

#root {
  max-width: 640px;
  margin: 0 auto;
  padding: 20px;
  min-height: 100vh;
}

@media (min-width: 640px) {
  #root {
    padding: 32px;
  }
}

h1,
h2 {
  text-transform: uppercase;
  letter-spacing: 2px;
  color: var(--accent-green);
  text-shadow: 0 0 8px var(--accent-green-glow);
  font-weight: 700;
  margin: 0 0 16px;
}

p {
  margin: 0;
}

button {
  font-family: inherit;
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

@keyframes dice-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(740deg);
  }
}
```

- [ ] **Step 2: Create the (initially empty) component styles file**

Create `app/src/styles/components.css`:

```css
/* Component-specific styles. Each section below is added by its own task
   in docs/superpowers/plans/2026-07-02-etap-3-oprawa-wizualna.md. */
```

- [ ] **Step 3: Wire the new stylesheets into the app, remove the old one**

Modify `app/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/theme.css'
import './styles/components.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 4: Delete the old Vite-template stylesheet**

From `app/`:

```bash
git rm src/index.css
```

- [ ] **Step 5: Verify build, lint, and the full existing test suite**

From `app/`:

```bash
npm run build
npm run lint
npx tsc --noEmit
npm run test
```

Expected: build succeeds, lint clean, no type errors, all 106 tests still pass (this task touches no component logic).

- [ ] **Step 6: Manual visual check**

```bash
npm run dev
```

Open the printed local URL. Expected: the start screen background is now near-black (`#060b14`), the "Bronx Dice" heading is green with a glow, body text is monospace. (The form controls and buttons won't be themed yet — that's Task 4. Just confirm the base page loads with the new dark background and no console errors, then stop the dev server.)

- [ ] **Step 7: Commit**

```bash
cd ..
git add app/src/styles/theme.css app/src/styles/components.css app/src/main.tsx app/src/index.css
git commit -m "Add Electric HUD design tokens, reset, and animation keyframe; remove Vite template stylesheet"
```

(`app/src/index.css` was already deleted and staged by `git rm` in Step 4 — `git add`ing its path here is safe and just confirms the staged deletion is included.)

---

### Task 2: `DiceTray` — held/unheld glow + roll-spin animation

**Files:**
- Modify: `app/src/components/DiceTray.tsx`
- Modify: `app/src/components/DiceTray.test.tsx`
- Modify: `app/src/styles/components.css`

**Interfaces:**
- Consumes: CSS custom properties and `@keyframes dice-spin` from Task 1.
- Produces: no new props (component's public interface — `dice`, `heldDice`, `onToggleHeld` — is unchanged). Internally adds a `rolling` CSS class to non-held dice for `ROLL_ANIMATION_MS` (1000ms) after the `dice` prop changes to a rolled (5-element) array. Later tasks do not depend on any new export from this file.

The held/unheld color difference needs NO component code change — it's a pure CSS selector on the existing `held` class and `disabled` attribute (already present from Etap 2). Only the rolling animation requires new component logic + tests.

- [ ] **Step 1: Write the failing tests for the roll animation**

Add to `app/src/components/DiceTray.test.tsx` (add `act` to the existing `@testing-library/react` import, and `afterEach` to the existing `vitest` import; then append this `describe` block at the end of the file):

```tsx
// Update the top imports to:
// import { describe, it, expect, vi, afterEach } from 'vitest';
// import { act, render, screen } from '@testing-library/react';

describe('roll animation', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds the rolling class only to dice that are not held when dice change', () => {
    vi.useFakeTimers();
    const dice: DiceValue[] = [1, 2, 3, 4, 5];
    const { rerender } = render(
      <DiceTray
        dice={[]}
        heldDice={[false, false, false, false, false]}
        onToggleHeld={() => {}}
      />
    );

    rerender(
      <DiceTray
        dice={dice}
        heldDice={[false, true, false, false, false]}
        onToggleHeld={() => {}}
      />
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveClass('rolling');
    expect(buttons[1]).not.toHaveClass('rolling');
    expect(buttons[2]).toHaveClass('rolling');
  });

  it('removes the rolling class after the animation duration elapses', () => {
    vi.useFakeTimers();
    const dice: DiceValue[] = [1, 2, 3, 4, 5];
    const { rerender } = render(
      <DiceTray
        dice={[]}
        heldDice={[false, false, false, false, false]}
        onToggleHeld={() => {}}
      />
    );

    rerender(
      <DiceTray
        dice={dice}
        heldDice={[false, false, false, false, false]}
        onToggleHeld={() => {}}
      />
    );
    expect(screen.getAllByRole('button')[0]).toHaveClass('rolling');

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getAllByRole('button')[0]).not.toHaveClass('rolling');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app
npx vitest run src/components/DiceTray.test.tsx
```

Expected: FAIL — the two new tests fail because no button ever gets a `rolling` class yet (existing 4 tests still pass).

- [ ] **Step 3: Implement the rolling animation state**

Replace the contents of `app/src/components/DiceTray.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { DiceValue } from '../types/game';

const ROLL_ANIMATION_MS = 1000;

interface DiceTrayProps {
  dice: DiceValue[];
  heldDice: boolean[];
  onToggleHeld: (index: number) => void;
}

function DiceTray({ dice, heldDice, onToggleHeld }: DiceTrayProps) {
  const hasBeenRolled = dice.length === 5;
  const [rollingIndices, setRollingIndices] = useState<number[]>([]);

  useEffect(() => {
    if (dice.length !== 5) {
      return;
    }
    const indices = heldDice
      .map((held, index) => (held ? -1 : index))
      .filter((index) => index !== -1);
    setRollingIndices(indices);
    const timer = setTimeout(() => setRollingIndices([]), ROLL_ANIMATION_MS);
    return () => clearTimeout(timer);
    // Intentionally depends only on `dice`: the animation should replay when
    // a new roll happens, not when the player toggles which dice are held.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dice]);

  return (
    <div className="dice-tray">
      {Array.from({ length: 5 }, (_, index) => {
        const classes = ['die'];
        if (heldDice[index]) {
          classes.push('held');
        }
        if (rollingIndices.includes(index)) {
          classes.push('rolling');
        }
        return (
          <button
            key={index}
            type="button"
            className={classes.join(' ')}
            aria-pressed={heldDice[index]}
            disabled={!hasBeenRolled}
            onClick={() => onToggleHeld(index)}
          >
            {hasBeenRolled ? dice[index] : '–'}
          </button>
        );
      })}
    </div>
  );
}

export default DiceTray;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/DiceTray.test.tsx
```

Expected: PASS — 6 tests passed (4 original + 2 new).

- [ ] **Step 5: Add the dice CSS**

Append to `app/src/styles/components.css`:

```css
/* DiceTray */
.dice-tray {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}

.die {
  width: var(--die-size);
  height: var(--die-size);
  border-radius: 6px;
  background: rgba(0, 229, 255, 0.04);
  border: 1px solid var(--panel-border);
  color: var(--text-dim);
  font-weight: 800;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.die:not(.held):not(:disabled) {
  background: var(--accent-blue-bg);
  border: 2px solid var(--accent-blue);
  box-shadow:
    0 0 14px var(--accent-blue-glow),
    inset 0 0 8px rgba(0, 229, 255, 0.15);
  color: var(--accent-blue);
}

.die.held {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--panel-border);
  color: var(--text-dim);
}

.die.rolling {
  animation: dice-spin 1s ease-out;
}
```

- [ ] **Step 6: Run the full test suite to confirm no regression**

```bash
npm run test
npm run lint
npx tsc --noEmit
```

Expected: all tests pass (106 + 2 = 108), lint clean, no type errors.

- [ ] **Step 7: Commit**

```bash
cd ..
git add app/src/components/DiceTray.tsx app/src/components/DiceTray.test.tsx app/src/styles/components.css
git commit -m "Add dice held/unheld glow and CSS roll-spin animation"
```

---

### Task 3: `ScoreBoard` — "Bonus" row, current-player column, and table styling

**Files:**
- Modify: `app/src/components/ScoreBoard.tsx`
- Modify: `app/src/components/ScoreBoard.test.tsx`
- Modify: `app/src/styles/components.css`

**Interfaces:**
- Consumes: `calculateBonus` from `../engine/scoring/upperSection` (Etap 1, exported, unchanged — returns `0` or `50`). CSS custom properties from Task 1.
- Produces: no new props (component's public interface is unchanged). The "Bonus" row and `current-player-col`/`bonus-earned`/`bonus-row`/`total-row` classes are internal rendering details later tasks don't need to know about.

- [ ] **Step 1: Write the failing tests**

Append to `app/src/components/ScoreBoard.test.tsx` (inside the existing `describe('ScoreBoard', ...)` block, or as sibling `describe` blocks after it — either is fine, shown here as siblings at the end of the file):

```tsx
describe('bonus row', () => {
  it('shows nothing when the bonus has not been earned', () => {
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
    const row = screen.getByText('Bonus').closest('tr')!;
    const cells = row.querySelectorAll('td');
    expect(cells[1]).toHaveTextContent('');
    expect(cells[2]).toHaveTextContent('');
  });

  it('shows 50 with the bonus-earned class when the upper section bonus is achieved', () => {
    const state = createGameState(['Ola', 'Kuba']);
    state.scoreCards[state.players[0].id].upper = {
      aces: 3,
      twos: 6,
      threes: 9,
      fours: 12,
      fives: 15,
      sixes: 18,
    }; // sum = 63 -> bonus earned
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
    const row = screen.getByText('Bonus').closest('tr')!;
    const cells = row.querySelectorAll('td');
    expect(cells[1]).toHaveTextContent('50');
    expect(cells[1]).toHaveClass('bonus-earned');
    expect(cells[2]).toHaveTextContent('');
  });
});

describe('current player column', () => {
  it("marks the current player's header cell with current-player-col", () => {
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
    expect(screen.getByRole('columnheader', { name: 'Ola' })).toHaveClass(
      'current-player-col'
    );
    expect(
      screen.getByRole('columnheader', { name: 'Kuba' })
    ).not.toHaveClass('current-player-col');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app
npx vitest run src/components/ScoreBoard.test.tsx
```

Expected: FAIL — `screen.getByText('Bonus')` throws (no such row yet); the current-player-col test fails because no header has that class.

- [ ] **Step 3: Implement the Bonus row and current-player column**

Replace the contents of `app/src/components/ScoreBoard.tsx`:

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
import { calculateBonus } from '../engine/scoring/upperSection';

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

function playerColClass(
  playerId: string,
  currentPlayerId: string
): string | undefined {
  return playerId === currentPlayerId ? 'current-player-col' : undefined;
}

function ScoreBoard({
  players,
  scoreCards,
  currentPlayerId,
  dice,
  rollsLeft,
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
          isCurrentPlayer && hasRolled && canScoreCategory(scoreCard, category);
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

  return (
    <table className="score-board">
      <thead>
        <tr>
          <th>Kategoria</th>
          {players.map((player) => (
            <th
              key={player.id}
              className={playerColClass(player.id, currentPlayerId)}
            >
              {player.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {UPPER_CATEGORIES.map(renderCategoryRow)}
        <tr className="bonus-row">
          <td>Bonus</td>
          {players.map((player) => {
            const bonus = calculateBonus(scoreCards[player.id]);
            const classes = [
              playerColClass(player.id, currentPlayerId),
              bonus > 0 ? 'bonus-earned' : null,
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <td key={player.id} className={classes || undefined}>
                {bonus > 0 ? bonus : ''}
              </td>
            );
          })}
        </tr>
        {LOWER_CATEGORIES.map(renderCategoryRow)}
        <tr className="total-row">
          <td>Suma</td>
          {players.map((player) => (
            <td
              key={player.id}
              className={playerColClass(player.id, currentPlayerId)}
            >
              {calculateTotal(scoreCards[player.id])}
            </td>
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

Expected: PASS — 11 tests passed (8 original + 3 new).

- [ ] **Step 5: Add the score board CSS**

Append to `app/src/styles/components.css`:

```css
/* ScoreBoard */
.score-board {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.score-board th,
.score-board td {
  padding: 7px 8px;
  text-align: left;
  border-bottom: 1px solid var(--panel-border);
}

.score-board th {
  color: var(--text-dim);
  font-weight: 600;
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 1px;
}

.score-board th:not(:first-child),
.score-board td:not(:first-child) {
  text-align: center;
}

.score-board .current-player-col {
  background: rgba(0, 229, 255, 0.03);
}

.score-board tbody button {
  color: var(--accent-blue);
  border: 1px solid var(--accent-blue);
  border-radius: 4px;
  box-shadow: 0 0 8px var(--accent-blue-glow);
  font-weight: 800;
  background: transparent;
  padding: 2px 8px;
  font-family: inherit;
}

.score-board .bonus-row td {
  background: rgba(57, 255, 20, 0.03);
}

.score-board .bonus-earned {
  color: var(--accent-green);
  font-weight: 800;
  text-shadow: 0 0 6px var(--accent-green-glow);
}

.score-board .total-row td {
  border-top: 2px solid var(--panel-border);
  border-bottom: none;
  color: var(--accent-green);
  font-weight: 800;
  padding-top: 10px;
}

@media (max-width: 480px) {
  .score-board {
    display: block;
    overflow-x: auto;
    white-space: nowrap;
  }
}
```

- [ ] **Step 6: Run the full test suite to confirm no regression**

```bash
npm run test
npm run lint
npx tsc --noEmit
```

Expected: all tests pass (108 + 3 = 111), lint clean, no type errors.

- [ ] **Step 7: Commit**

```bash
cd ..
git add app/src/components/ScoreBoard.tsx app/src/components/ScoreBoard.test.tsx app/src/styles/components.css
git commit -m "Add Bonus row, current-player column highlight, and score board styling"
```

---

### Task 4: `StartScreen` + `RollButton` styling

**Files:**
- Modify: `app/src/styles/components.css`

**Interfaces:**
- Consumes: CSS custom properties from Task 1; targets the existing `start-screen` and `roll-button` classNames already present in `app/src/components/StartScreen.tsx` and `app/src/components/RollButton.tsx` (Etap 2 — unchanged by this task).
- Produces: nothing consumed by later tasks (independent, CSS-only).

No component code changes and no new tests — both components' markup is already complete from Etap 2. This is a pure-CSS task, verified by lint/build/full test suite (unchanged) plus manual visual inspection.

- [ ] **Step 1: Add the start screen and roll button CSS**

Append to `app/src/styles/components.css`:

```css
/* StartScreen */
.start-screen {
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: center;
  padding: 20px 0;
}

.start-screen label {
  display: block;
  color: var(--text-dim);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 4px;
  text-align: left;
}

.start-screen select,
.start-screen input {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  color: var(--text);
  font-family: inherit;
  font-size: 14px;
  padding: 8px 10px;
  border-radius: 4px;
  width: 100%;
}

.start-screen select:focus,
.start-screen input:focus {
  outline: none;
  border-color: var(--accent-blue);
  box-shadow: 0 0 8px var(--accent-blue-glow);
}

.start-screen button {
  background: var(--accent-green-bg);
  color: var(--accent-green);
  border: 1px solid var(--accent-green);
  box-shadow: 0 0 10px var(--accent-green-glow);
  border-radius: 4px;
  padding: 12px 20px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  font-size: 13px;
  margin-top: 8px;
}

.start-screen button:disabled {
  border-color: var(--panel-border);
  color: var(--text-dim);
  box-shadow: none;
  background: transparent;
}

/* RollButton */
.roll-button {
  display: flex;
  align-items: center;
  gap: 12px;
}

.roll-button button {
  background: var(--accent-green-bg);
  color: var(--accent-green);
  border: 1px solid var(--accent-green);
  box-shadow: 0 0 10px var(--accent-green-glow);
  border-radius: 4px;
  padding: 10px 20px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  font-size: 13px;
}

.roll-button button:disabled {
  border-color: var(--panel-border);
  color: var(--text-dim);
  box-shadow: none;
  background: transparent;
}

.roll-button p {
  color: var(--text-dim);
  font-size: 12px;
  letter-spacing: 1px;
  text-transform: uppercase;
}
```

- [ ] **Step 2: Verify the full test suite, lint, and types are unaffected**

From `app/`:

```bash
npm run test
npm run lint
npx tsc --noEmit
```

Expected: all 111 tests still pass (no component code touched this task), lint clean, no type errors.

- [ ] **Step 3: Manual visual check**

```bash
npm run dev
```

Open the printed URL. Expected: the start screen now shows a themed dropdown and text inputs (dark panel background, glowing blue focus ring) and a glowing green "Rozpocznij grę" button, disabled state visibly dimmed when a name is blank. Start a game and confirm the "Rzuć kośćmi" button and rolls-left label are themed the same way. Then stop the dev server.

- [ ] **Step 4: Commit**

```bash
cd ..
git add app/src/styles/components.css
git commit -m "Style StartScreen and RollButton with the Electric HUD theme"
```

---

### Task 5: `WinnerScreen` + `GameScreen` layout, and responsive verification pass

**Files:**
- Modify: `app/src/styles/components.css`

**Interfaces:**
- Consumes: CSS custom properties from Task 1; targets the existing `winner-screen` and `game-screen` classNames already present in `app/src/components/WinnerScreen.tsx` and `app/src/components/GameScreen.tsx` (Etap 2 — unchanged by this task).
- Produces: nothing (last task in this plan).

Pure-CSS task, no component or test changes. This task also does the end-to-end responsive verification called for by the design doc (phone width and wider, across every screen), since it's the last piece and can exercise the complete, fully-themed app.

- [ ] **Step 1: Add the winner screen and game screen CSS**

Append to `app/src/styles/components.css`:

```css
/* WinnerScreen */
.winner-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;
  padding: 40px 20px;
}

.winner-screen p {
  color: var(--accent-blue);
  font-size: 18px;
  text-shadow: 0 0 8px var(--accent-blue-glow);
}

.winner-screen button {
  background: var(--accent-green-bg);
  color: var(--accent-green);
  border: 1px solid var(--accent-green);
  box-shadow: 0 0 10px var(--accent-green-glow);
  border-radius: 4px;
  padding: 12px 24px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  font-size: 13px;
}

/* GameScreen */
.game-screen {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
```

- [ ] **Step 2: Verify the full test suite, lint, build, and types**

From `app/`:

```bash
npm run test
npm run lint
npx tsc --noEmit
npm run build
```

Expected: all 111 tests pass, lint clean, no type errors, build succeeds.

- [ ] **Step 3: Manual responsive verification across the whole app**

```bash
npm run dev
```

Open the printed URL in a browser. Using the browser's device toolbar (or by resizing the window), check the app at roughly **380px wide** (phone) and at **1024px+ wide** (desktop) for each screen:

- **Start screen:** form is usable and readable at both widths (no overflow, no overlapping text).
- **Game screen:** dice row, roll button, and score table are all visible and usable at both widths; at 380px the score table may scroll horizontally (per the `@media (max-width: 480px)` rule from Task 3) — confirm it scrolls smoothly rather than clipping content.
- **Roll a few times, hold/unhold dice:** confirm unheld dice show the blue glow, held dice look dim, and clicking "Rzuć kośćmi" visibly spins the unheld dice for about a second while the number is already correct throughout.
- **Score a full game to the winner screen** (or manually verify visually that the layout looks right): winner/tie heading and "Zagraj ponownie" button are themed and centered at both widths.

Stop the dev server when done. If anything looks broken at either width, fix the specific CSS rule before committing (this step is exploratory verification, not a scripted list of exact fixes — use judgment based on what the browser shows).

- [ ] **Step 4: Commit**

```bash
cd ..
git add app/src/styles/components.css
git commit -m "Style WinnerScreen and GameScreen layout; verify responsive layout end-to-end"
```

---

## Definition of done for Etap 3

- `npm run test` (inside `app/`) passes with 111 tests across 13 files — the 106 from Etap 1–2 plus 5 new (2 for `DiceTray`'s roll animation, 3 for `ScoreBoard`'s Bonus row / current-player column).
- `npm run build`, `npm run lint`, and `npx tsc --noEmit` all succeed.
- The entire app (start screen, game screen, dice, score table, winner screen) uses the Electric HUD theme: dark background, blue/green glow accents, monospace font.
- The "Bonus" row appears in the score table, blank until earned, showing `50` in green once `calculateBonus` returns `50`.
- Unheld dice glow blue; held dice are dim; rolling (non-held) dice visibly spin for ~1 second when "Rzuć kośćmi" is clicked, without delaying the displayed value.
- The app is usable at both phone width (~380px) and desktop width (1024px+) without layout breakage, verified manually in Task 5.
- No changes to `app/src/engine/*`, `app/src/types/*`, or any component's props/callbacks.
