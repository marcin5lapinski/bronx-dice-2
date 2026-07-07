# Bot gracza lokalnego (Claude headless CLI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any non-tracked player slot in a local (hotseat) game be marked as a bot that plays its own turns autonomously, at human-like pacing, by asking Claude Code (headless CLI) for each decision.

**Architecture:** A new `bot-server` npm workspace is a thin Node/Express proxy that shells out to `claude -p` and returns whatever JSON the model replies with — it knows nothing about game rules. `app/src/bot/` builds the prompts (embedding house rules + preview scores from the engine), calls that proxy over `fetch`, validates the response against `@bronx-dice/game-engine`, and falls back to a simple "pick the highest-scoring open category" heuristic on any failure. `packages/game-engine` is untouched; "being a bot" is a UI-only concept — a `Set<string>` of player IDs computed in `GameScreen` from a new `botFlags: boolean[]` prop.

**Tech Stack:** React 19 + TypeScript + Vite (existing `app/`), Node + Express + `tsx` (new `bot-server/`), Vitest for all tests, `supertest` for the new server's HTTP tests.

## Global Constraints

- This feature is **local-hotseat-only** and **local-machine-only** — it must never be wired into the online/Firestore flow, and `bot-server` must never be touched by `firebase deploy` (only `hosting` is deployed today).
- `bot-server` is a "cienki serwer": it has **no** dependency on `@bronx-dice/game-engine` and does no rule validation — that lives entirely in `app/`.
- On any failure (network error, timeout, unparseable JSON, illegal move) the bot falls back to a heuristic that stops rolling and scores the open category with the highest preview score — it never retries the CLI and never blocks the game.
- The decision "window" is ~2500ms: if the CLI responds faster, pad the wait to ~2500ms; if slower, don't add extra delay on top.
- Upper-section bonus is +50 at a sum of ≥63; doubling (raw score ×2) applies **only to lower-section categories** scored while `rollsLeft === 2`; Yahtzee scores sum-of-dice + 50 bonus and is itself subject to that same doubling. (Copied from `packages/game-engine/src/scoreCard.ts` — the bot's prompt must state these exactly, since `bot-server` has no other way to convey them.)
- The checkbox that marks a player as a bot must never appear on the tracked "account" row (the row whose `id` matches `accountRowId.current` in `StartScreen.tsx`).
- Games involving bots still record the signed-in player's stats exactly as today — no changes to `statsService`/`recordLocalGameResult` call sites.

---

## Task 1: Extract a shared `previewScore` util from ScoreBoard

`ScoreBoard.tsx` already computes "what would this category score right now" for its clickable preview buttons. The bot needs the exact same computation (for prompts and for the heuristic fallback), so it must move to a shared, tested location instead of being duplicated.

**Files:**
- Create: `app/src/utils/previewScore.ts`
- Create: `app/src/utils/previewScore.test.ts`
- Modify: `app/src/components/ScoreBoard.tsx`

**Interfaces:**
- Produces: `scoreValue(scoreCard: PlayerScoreCard, category: ScoreCategory): number | null` and `previewScore(scoreCard: PlayerScoreCard, category: ScoreCategory, dice: DiceValue[], rollsLeft: number): number`, both from `app/src/utils/previewScore.ts`. Later tasks (heuristic, prompt builder) import `previewScore` from here.

- [ ] **Step 1: Write the failing test**

Create `app/src/utils/previewScore.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createEmptyScoreCard, type DiceValue } from '@bronx-dice/game-engine';
import { previewScore, scoreValue } from './previewScore';

describe('scoreValue', () => {
  it('reads the upper section value for an upper category', () => {
    const card = createEmptyScoreCard();
    const filled = { ...card, upper: { ...card.upper, aces: 3 } };
    expect(scoreValue(filled, 'aces')).toBe(3);
  });

  it('reads the lower section value for a lower category', () => {
    const card = createEmptyScoreCard();
    const filled = { ...card, lower: { ...card.lower, chance: 20 } };
    expect(scoreValue(filled, 'chance')).toBe(20);
  });

  it('returns null for an unfilled category', () => {
    const card = createEmptyScoreCard();
    expect(scoreValue(card, 'aces')).toBeNull();
  });
});

describe('previewScore', () => {
  it('computes the score for an upper category from the current dice', () => {
    const card = createEmptyScoreCard();
    const dice: DiceValue[] = [1, 1, 3, 4, 5];
    expect(previewScore(card, 'aces', dice, 2)).toBe(2);
  });

  it('does not mutate the passed-in score card', () => {
    const card = createEmptyScoreCard();
    const dice: DiceValue[] = [1, 1, 3, 4, 5];
    previewScore(card, 'aces', dice, 2);
    expect(card.upper.aces).toBeNull();
  });

  it('doubles a lower-section category scored with rollsLeft 2, but not otherwise', () => {
    const card = createEmptyScoreCard();
    const dice: DiceValue[] = [2, 2, 2, 4, 5];
    expect(previewScore(card, 'chance', dice, 2)).toBe(30);
    expect(previewScore(card, 'chance', dice, 1)).toBe(15);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `app/`): `npx vitest run src/utils/previewScore.test.ts`
Expected: FAIL — `Cannot find module './previewScore'`.

- [ ] **Step 3: Write the implementation**

Create `app/src/utils/previewScore.ts`:

```ts
import {
  isUpperCategory,
  scoreCategory,
  type DiceValue,
  type PlayerScoreCard,
  type ScoreCategory,
} from '@bronx-dice/game-engine';

export function scoreValue(
  scoreCard: PlayerScoreCard,
  category: ScoreCategory
): number | null {
  return isUpperCategory(category)
    ? scoreCard.upper[category]
    : scoreCard.lower[category];
}

export function previewScore(
  scoreCard: PlayerScoreCard,
  category: ScoreCategory,
  dice: DiceValue[],
  rollsLeft: number
): number {
  const preview = scoreCategory(scoreCard, category, dice, rollsLeft);
  return scoreValue(preview, category) ?? 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/previewScore.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Update ScoreBoard.tsx to use the shared util**

In `app/src/components/ScoreBoard.tsx`, replace the import block and delete the local definitions:

Find:
```ts
import {
  UPPER_CATEGORIES,
  LOWER_CATEGORIES,
  canScoreCategory,
  calculateTotal,
  isUpperCategory,
  scoreCategory,
  calculateBonus,
  type Player,
  type PlayerScoreCard,
  type ScoreCategory,
  type DiceValue,
} from '@bronx-dice/game-engine';
```
Replace with:
```ts
import {
  UPPER_CATEGORIES,
  LOWER_CATEGORIES,
  canScoreCategory,
  calculateTotal,
  calculateBonus,
  type Player,
  type PlayerScoreCard,
  type ScoreCategory,
  type DiceValue,
} from '@bronx-dice/game-engine';
import { previewScore, scoreValue } from '../utils/previewScore';
```

Find (and delete entirely):
```ts
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

```

- [ ] **Step 6: Run the full app test suite to confirm nothing broke**

Run: `npx vitest run`
Expected: PASS, same total test count as before minus none removed (ScoreBoard's own tests are behavior-based and don't reference these functions directly).

- [ ] **Step 7: Commit**

```bash
git add app/src/utils/previewScore.ts app/src/utils/previewScore.test.ts app/src/components/ScoreBoard.tsx
git commit -m "Extract previewScore/scoreValue into a shared util"
```

---

## Task 2: Bot flag plumbing — StartScreen checkbox, App/GameScreen props, visual indicators

This lands the whole "mark a slot as a bot, see it labeled as one" slice end-to-end, without any autonomous play yet (a bot-marked slot behaves like a human slot until Task 10 wires the actual automation). It must land as one task because `StartScreen`'s `onStart` signature, `App.tsx`'s `Screen` type, and `GameScreen`'s props all change together — an intermediate state would not type-check.

**Files:**
- Modify: `app/src/utils/playerOrder.ts`
- Modify: `app/src/components/StartScreen.tsx`
- Modify: `app/src/components/StartScreen.test.tsx`
- Modify: `app/src/App.tsx`
- Modify: `app/src/components/GameScreen.tsx`
- Modify: `app/src/components/GameScreen.test.tsx`
- Modify: `app/src/components/ScoreBoard.tsx`
- Modify: `app/src/components/ScoreBoard.test.tsx`

**Interfaces:**
- Produces: `PlayerNameRow` gains `isBot: boolean`. `StartScreenProps.onStart` becomes `(playerNames: string[], accountPlayerIndex: number | null, botFlags: boolean[]) => void`. `GameScreenProps` gains `botFlags?: boolean[]` (default `[]`, parallel to `playerNames` by index). `ScoreBoardProps` gains `botPlayerIds?: Set<string>` (default empty `Set`). Later tasks (the bot hook, Task 10's GameScreen wiring) consume `botFlags`/`botPlayerIds` computed the same way.

- [ ] **Step 1: Add `isBot` to `PlayerNameRow`**

In `app/src/utils/playerOrder.ts`, find:
```ts
export interface PlayerNameRow {
  id: string;
  value: string;
}
```
Replace with:
```ts
export interface PlayerNameRow {
  id: string;
  value: string;
  isBot: boolean;
}
```

(`reorderNames`/`shufflePlayerOrder` are generic over the row shape and need no changes.)

- [ ] **Step 2: Write the failing StartScreen tests for the Bot checkbox**

In `app/src/components/StartScreen.test.tsx`, add these tests inside the existing `describe('StartScreen', ...)` block (anywhere after the other tests):

```ts
  it('shows a Bot checkbox for every row except the tracked account row', async () => {
    const user = userEvent.setup();
    renderStartScreen();
    await openLocalForm(user);

    expect(
      screen.queryByRole('checkbox', { name: 'Bot' })
    ).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Liczba graczy'), '3');

    expect(screen.getAllByRole('checkbox', { name: 'Bot' })).toHaveLength(2);
  });

  it('passes botFlags matching which rows are checked as Bot', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    renderStartScreen({ onStart });
    await openLocalForm(user);

    await user.clear(screen.getByLabelText('Gracz 1'));
    await user.type(screen.getByLabelText('Gracz 1'), 'Ola');
    await user.clear(screen.getByLabelText('Gracz 2'));
    await user.type(screen.getByLabelText('Gracz 2'), 'Kuba');
    await user.click(screen.getAllByRole('checkbox', { name: 'Bot' })[0]);
    await user.click(screen.getByRole('button', { name: 'Rozpocznij grę' }));

    expect(onStart).toHaveBeenCalledWith(['Ola', 'Kuba'], null, [true, false]);
  });
```

Update the `renderStartScreen` helper's prop type and every existing `toHaveBeenCalledWith(...)` assertion to add the third `botFlags` argument (all `false` since none of these tests check any Bot box):

Find:
```ts
function renderStartScreen(
  props: {
    onStart?: (names: string[], accountPlayerIndex: number | null) => void;
    onOpenAuth?: () => void;
    onOpenProfile?: () => void;
  } = {}
) {
```
Replace with:
```ts
function renderStartScreen(
  props: {
    onStart?: (
      names: string[],
      accountPlayerIndex: number | null,
      botFlags: boolean[]
    ) => void;
    onOpenAuth?: () => void;
    onOpenProfile?: () => void;
  } = {}
) {
```

Then update each existing assertion (7 call sites) from two arguments to three:
- `expect(onStart).toHaveBeenCalledWith(['Ola', 'Kuba'], null);` → `expect(onStart).toHaveBeenCalledWith(['Ola', 'Kuba'], null, [false, false]);`
- `expect(onStart).toHaveBeenCalledWith(['Ola', 'Kuba', 'Ala'], null);` → `expect(onStart).toHaveBeenCalledWith(['Ola', 'Kuba', 'Ala'], null, [false, false, false]);`
- `expect(onStart).toHaveBeenCalledWith(['Kuba', 'Ola'], null);` → `expect(onStart).toHaveBeenCalledWith(['Kuba', 'Ola'], null, [false, false]);`
- the second `expect(onStart).toHaveBeenCalledWith(['Ola', 'Kuba'], null);` (in `'does not shuffle...'`) → add `, [false, false]`
- `expect(onStart).toHaveBeenCalledWith(['Ola Nick', 'Kuba'], 0);` → add `, [false, false]`
- `expect(onStart).toHaveBeenCalledWith(['Pseudonim', 'Kuba'], 0);` → add `, [false, false]`
- `expect(onStart).toHaveBeenCalledWith(['Kuba', 'Ola Nick'], 1);` → add `, [false, false]`

- [ ] **Step 3: Run tests to verify the new ones fail**

Run (from `app/`): `npx vitest run src/components/StartScreen.test.tsx`
Expected: FAIL — no `Bot` checkbox is rendered yet, and `onStart` is called with only 2 arguments.

- [ ] **Step 4: Implement the Bot checkbox in StartScreen.tsx**

In `app/src/components/StartScreen.tsx`, update `PlayerRowFieldProps`/`PlayerRowField`:

Find:
```tsx
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
```
Replace with:
```tsx
interface PlayerRowFieldProps {
  row: PlayerNameRow;
  label: string;
  dragDisabled: boolean;
  showBotCheckbox: boolean;
  onChange: (id: string, value: string) => void;
  onToggleBot: (id: string) => void;
}

function PlayerRowField({
  row,
  label,
  dragDisabled,
  showBotCheckbox,
  onChange,
  onToggleBot,
}: PlayerRowFieldProps) {
```

Find:
```tsx
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
```
Replace with:
```tsx
      <div className="player-row-field">
        <label htmlFor={`player-name-${row.id}`}>{label}</label>
        <input
          id={`player-name-${row.id}`}
          type="text"
          value={row.value}
          onChange={(event) => onChange(row.id, event.target.value)}
        />
      </div>
      {showBotCheckbox && (
        <label className="player-row-bot-label">
          <input
            type="checkbox"
            checked={row.isBot}
            onChange={() => onToggleBot(row.id)}
          />
          Bot
        </label>
      )}
    </div>
  );
}
```

Update `StartScreenProps`:

Find:
```ts
interface StartScreenProps {
  onStart: (playerNames: string[], accountPlayerIndex: number | null) => void;
  onOpenAuth: () => void;
  onOpenProfile: () => void;
}
```
Replace with:
```ts
interface StartScreenProps {
  onStart: (
    playerNames: string[],
    accountPlayerIndex: number | null,
    botFlags: boolean[]
  ) => void;
  onOpenAuth: () => void;
  onOpenProfile: () => void;
}
```

Update the initial rows and the player-count-change fallback to include `isBot: false`:

Find:
```ts
  const [rows, setRows] = useState<PlayerNameRow[]>(() =>
    Array.from({ length: MIN_PLAYERS }, (_, index) => ({
      id: createRowId(),
      value: defaultName(index),
    }))
  );
```
Replace with:
```ts
  const [rows, setRows] = useState<PlayerNameRow[]>(() =>
    Array.from({ length: MIN_PLAYERS }, (_, index) => ({
      id: createRowId(),
      value: defaultName(index),
      isBot: false,
    }))
  );
```

Find:
```ts
  const handlePlayerCountChange = (count: number) => {
    setPlayerCount(count);
    setRows((current) =>
      Array.from({ length: count }, (_, index) => {
        const existing = current[index];
        return existing ?? { id: createRowId(), value: defaultName(index) };
      })
    );
  };
```
Replace with:
```ts
  const handlePlayerCountChange = (count: number) => {
    setPlayerCount(count);
    setRows((current) =>
      Array.from({ length: count }, (_, index) => {
        const existing = current[index];
        return (
          existing ?? { id: createRowId(), value: defaultName(index), isBot: false }
        );
      })
    );
  };
```

Add a toggle handler next to `handleNameChange`:

Find:
```ts
  const handleNameChange = (id: string, value: string) => {
    if (id === syncedRowId.current) {
      syncedRowId.current = null;
    }
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, value } : row))
    );
  };
```
Replace with:
```ts
  const handleNameChange = (id: string, value: string) => {
    if (id === syncedRowId.current) {
      syncedRowId.current = null;
    }
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, value } : row))
    );
  };

  const handleToggleBot = (id: string) => {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, isBot: !row.isBot } : row))
    );
  };
```

Update `handleStart` to compute and pass `botFlags`:

Find:
```ts
  const handleStart = () => {
    const orderedRows = randomizeOrder
      ? shufflePlayerOrder(visibleRows)
      : visibleRows;
    const finalNames = orderedRows.map((row) => row.value.trim());
    const accountPlayerIndex = user
      ? orderedRows.findIndex((row) => row.id === accountRowId.current)
      : -1;
    onStart(finalNames, accountPlayerIndex === -1 ? null : accountPlayerIndex);
  };
```
Replace with:
```ts
  const handleStart = () => {
    const orderedRows = randomizeOrder
      ? shufflePlayerOrder(visibleRows)
      : visibleRows;
    const finalNames = orderedRows.map((row) => row.value.trim());
    const botFlags = orderedRows.map((row) => row.isBot);
    const accountPlayerIndex = user
      ? orderedRows.findIndex((row) => row.id === accountRowId.current)
      : -1;
    onStart(
      finalNames,
      accountPlayerIndex === -1 ? null : accountPlayerIndex,
      botFlags
    );
  };
```

Finally, update the row rendering to pass the new props:

Find:
```tsx
              {visibleRows.map((row, index) => (
                <PlayerRowField
                  key={row.id}
                  row={row}
                  label={defaultName(index)}
                  dragDisabled={randomizeOrder}
                  onChange={handleNameChange}
                />
              ))}
```
Replace with:
```tsx
              {visibleRows.map((row, index) => (
                <PlayerRowField
                  key={row.id}
                  row={row}
                  label={defaultName(index)}
                  dragDisabled={randomizeOrder}
                  showBotCheckbox={row.id !== accountRowId.current}
                  onChange={handleNameChange}
                  onToggleBot={handleToggleBot}
                />
              ))}
```

- [ ] **Step 5: Run StartScreen tests to verify they pass**

Run: `npx vitest run src/components/StartScreen.test.tsx`
Expected: PASS (all tests, including the 2 new ones).

- [ ] **Step 6: Update App.tsx's `Screen` type and wiring**

In `app/src/App.tsx`, find:
```ts
type Screen =
  | { kind: 'local-start' }
  | { kind: 'local-game'; playerNames: string[]; accountPlayerIndex: number | null }
  | { kind: 'auth-gate'; authScreen: AuthScreenName }
  | { kind: 'profile' }
  | { kind: 'online-room'; roomId: string };
```
Replace with:
```ts
type Screen =
  | { kind: 'local-start' }
  | {
      kind: 'local-game';
      playerNames: string[];
      botFlags: boolean[];
      accountPlayerIndex: number | null;
    }
  | { kind: 'auth-gate'; authScreen: AuthScreenName }
  | { kind: 'profile' }
  | { kind: 'online-room'; roomId: string };
```

Find:
```tsx
  if (screen.kind === 'local-game') {
    return (
      <GameScreen
        playerNames={screen.playerNames}
        accountPlayerIndex={screen.accountPlayerIndex}
        onPlayAgain={() => setScreen({ kind: 'local-start' })}
        onExit={() => setScreen({ kind: 'local-start' })}
      />
    );
  }
```
Replace with:
```tsx
  if (screen.kind === 'local-game') {
    return (
      <GameScreen
        playerNames={screen.playerNames}
        botFlags={screen.botFlags}
        accountPlayerIndex={screen.accountPlayerIndex}
        onPlayAgain={() => setScreen({ kind: 'local-start' })}
        onExit={() => setScreen({ kind: 'local-start' })}
      />
    );
  }
```

Find:
```tsx
  return (
    <StartScreen
      onStart={(playerNames, accountPlayerIndex) =>
        setScreen({ kind: 'local-game', playerNames, accountPlayerIndex })
      }
      onOpenAuth={() => setScreen({ kind: 'auth-gate', authScreen: 'login' })}
      onOpenProfile={() => setScreen({ kind: 'profile' })}
    />
  );
```
Replace with:
```tsx
  return (
    <StartScreen
      onStart={(playerNames, accountPlayerIndex, botFlags) =>
        setScreen({ kind: 'local-game', playerNames, accountPlayerIndex, botFlags })
      }
      onOpenAuth={() => setScreen({ kind: 'auth-gate', authScreen: 'login' })}
      onOpenProfile={() => setScreen({ kind: 'profile' })}
    />
  );
```

- [ ] **Step 7: Add `botFlags` and `botPlayerIds` to GameScreen, with a header indicator**

In `app/src/components/GameScreen.tsx`, find:
```ts
interface GameScreenProps {
  playerNames: string[];
  accountPlayerIndex: number | null;
  onPlayAgain: () => void;
  onExit: () => void;
}

function GameScreen({
  playerNames,
  accountPlayerIndex,
  onPlayAgain,
  onExit,
}: GameScreenProps) {
  const { user } = useAuth();
  const [state, setState] = useState<GameState>(() =>
    createGameState(playerNames)
  );
```
Replace with:
```ts
interface GameScreenProps {
  playerNames: string[];
  botFlags?: boolean[];
  accountPlayerIndex: number | null;
  onPlayAgain: () => void;
  onExit: () => void;
}

function GameScreen({
  playerNames,
  botFlags = [],
  accountPlayerIndex,
  onPlayAgain,
  onExit,
}: GameScreenProps) {
  const { user } = useAuth();
  const [state, setState] = useState<GameState>(() =>
    createGameState(playerNames)
  );
  const botPlayerIds = new Set(
    state.players
      .filter((_, index) => botFlags[index] === true)
      .map((player) => player.id)
  );
```

Find:
```tsx
  const currentPlayer = state.players[state.currentPlayerIndex];

  const handleExit = () => {
```
Replace with:
```tsx
  const currentPlayer = state.players[state.currentPlayerIndex];
  const isBotTurn = botPlayerIds.has(currentPlayer.id);

  const handleExit = () => {
```

Find:
```tsx
      <h2>Tura: {currentPlayer.name}</h2>
```
Replace with:
```tsx
      <h2>
        Tura: {currentPlayer.name}
        {isBotTurn ? ' 🤖' : ''}
      </h2>
```

Find:
```tsx
      <ScoreBoard
        players={state.players}
        scoreCards={state.scoreCards}
        currentPlayerId={currentPlayer.id}
        dice={isRolling ? [] : state.dice}
        rollsLeft={state.rollsLeft}
        onScore={(category: ScoreCategory) =>
          setState((current) => applyScore(current, category))
        }
      />
```
Replace with:
```tsx
      <ScoreBoard
        players={state.players}
        scoreCards={state.scoreCards}
        currentPlayerId={currentPlayer.id}
        dice={isRolling ? [] : state.dice}
        rollsLeft={state.rollsLeft}
        botPlayerIds={botPlayerIds}
        onScore={(category: ScoreCategory) =>
          setState((current) => applyScore(current, category))
        }
      />
```

- [ ] **Step 8: Add `botPlayerIds` to ScoreBoard with a header indicator**

In `app/src/components/ScoreBoard.tsx`, find:
```ts
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
Replace with:
```ts
interface ScoreBoardProps {
  players: Player[];
  scoreCards: Record<string, PlayerScoreCard>;
  currentPlayerId: string;
  dice: DiceValue[];
  rollsLeft: number;
  interactive?: boolean;
  pendingCategory?: ScoreCategory | null;
  botPlayerIds?: Set<string>;
  onScore: (category: ScoreCategory) => void;
}
```

Find:
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
```
Replace with:
```tsx
function ScoreBoard({
  players,
  scoreCards,
  currentPlayerId,
  dice,
  rollsLeft,
  interactive = true,
  pendingCategory = null,
  botPlayerIds = new Set(),
  onScore,
}: ScoreBoardProps) {
```

Find:
```tsx
            {players.map((player) => (
              <th
                key={player.id}
                className={playerColClass(player.id, currentPlayerId)}
                title={player.name}
              >
                {truncateName(player.name)}
              </th>
            ))}
```
Replace with:
```tsx
            {players.map((player) => (
              <th
                key={player.id}
                className={playerColClass(player.id, currentPlayerId)}
                title={player.name}
              >
                {truncateName(player.name)}
                {botPlayerIds.has(player.id) ? ' 🤖' : ''}
              </th>
            ))}
```

- [ ] **Step 9: Write a failing test for the ScoreBoard bot indicator**

In `app/src/components/ScoreBoard.test.tsx`, add (checking existing imports/fixtures first and reusing whatever player/scoreCard fixtures that file already has for its header tests):

```ts
  it('shows a bot indicator next to a bot player name', () => {
    render(
      <ScoreBoard
        players={[
          { id: 'p1', name: 'Ola' },
          { id: 'p2', name: 'Kuba' },
        ]}
        scoreCards={{
          p1: createEmptyScoreCard(),
          p2: createEmptyScoreCard(),
        }}
        currentPlayerId="p1"
        dice={[]}
        rollsLeft={3}
        botPlayerIds={new Set(['p2'])}
        onScore={() => {}}
      />
    );

    expect(screen.getByText('Kuba 🤖')).toBeInTheDocument();
    expect(screen.queryByText('Ola 🤖')).not.toBeInTheDocument();
  });
```

(Import `createEmptyScoreCard` from `@bronx-dice/game-engine` at the top of the file if it isn't already imported there.)

- [ ] **Step 10: Run test to verify it fails, then passes**

Run: `npx vitest run src/components/ScoreBoard.test.tsx`
Expected first: FAIL (no indicator rendered without Step 8's change — but Step 8 already applied above, so really this should already PASS; if you're executing steps strictly in order, apply Step 9 before Step 8 to see the intended red-green cycle, then confirm green after Step 8's edit is in place).
Expected after Step 8: PASS.

- [ ] **Step 11: Run the full app suite**

Run (from `app/`): `npx vitest run`
Expected: PASS, all tests green (no existing `GameScreen`/`StartScreen`/`ScoreBoard` test needed further changes, since `botFlags`/`botPlayerIds` default to "no bots" and are backward-compatible).

- [ ] **Step 12: Commit**

```bash
git add app/src/utils/playerOrder.ts app/src/components/StartScreen.tsx app/src/components/StartScreen.test.tsx app/src/App.tsx app/src/components/GameScreen.tsx app/src/components/GameScreen.test.tsx app/src/components/ScoreBoard.tsx app/src/components/ScoreBoard.test.tsx
git commit -m "Add Bot checkbox, plumb botFlags through to a bot indicator"
```

---

## Task 3: Heuristic fallback (`chooseHeuristicCategory`)

**Files:**
- Create: `app/src/bot/heuristic.ts`
- Create: `app/src/bot/heuristic.test.ts`

**Interfaces:**
- Consumes: `previewScore` from `app/src/utils/previewScore.ts` (Task 1).
- Produces: `chooseHeuristicCategory(scoreCard: PlayerScoreCard, dice: DiceValue[], rollsLeft: number): ScoreCategory` — always returns a category that is currently legal (`canScoreCategory` is true for it). Used directly by Task 10's `useBotTurn` as the error/invalid-response fallback.

- [ ] **Step 1: Write the failing test**

Create `app/src/bot/heuristic.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createEmptyScoreCard, type DiceValue } from '@bronx-dice/game-engine';
import { chooseHeuristicCategory } from './heuristic';

describe('chooseHeuristicCategory', () => {
  it('picks the open category with the highest preview score', () => {
    const card = createEmptyScoreCard();
    // Only upper categories are open on a fresh card (lower section is
    // locked until the upper section is filled). Counts: three 1s, one 4,
    // one 5 -> aces=3, fours=4, fives=5 is the best.
    const dice: DiceValue[] = [1, 1, 1, 4, 5];
    expect(chooseHeuristicCategory(card, dice, 2)).toBe('fives');
  });

  it('never returns an already-filled category', () => {
    const card = createEmptyScoreCard();
    const filled = { ...card, upper: { ...card.upper, fives: 10 } };
    const dice: DiceValue[] = [5, 5, 1, 4, 3];
    expect(chooseHeuristicCategory(filled, dice, 2)).not.toBe('fives');
  });

  it('only considers lower-section categories once the upper section is full', () => {
    const upperFilled = {
      upper: {
        aces: 1,
        twos: 2,
        threes: 3,
        fours: 4,
        fives: 5,
        sixes: 6,
      },
      lower: createEmptyScoreCard().lower,
    };
    const dice: DiceValue[] = [6, 6, 6, 6, 6];
    // Everything upper is filled, so the best legal option is yahtzee.
    expect(chooseHeuristicCategory(upperFilled, dice, 1)).toBe('yahtzee');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `app/`): `npx vitest run src/bot/heuristic.test.ts`
Expected: FAIL — `Cannot find module './heuristic'`.

- [ ] **Step 3: Write the implementation**

Create `app/src/bot/heuristic.ts`:

```ts
import {
  canScoreCategory,
  UPPER_CATEGORIES,
  LOWER_CATEGORIES,
  type DiceValue,
  type PlayerScoreCard,
  type ScoreCategory,
} from '@bronx-dice/game-engine';
import { previewScore } from '../utils/previewScore';

const ALL_CATEGORIES: ScoreCategory[] = [...UPPER_CATEGORIES, ...LOWER_CATEGORIES];

export function chooseHeuristicCategory(
  scoreCard: PlayerScoreCard,
  dice: DiceValue[],
  rollsLeft: number
): ScoreCategory {
  const candidates = ALL_CATEGORIES.filter((category) =>
    canScoreCategory(scoreCard, category)
  );
  if (candidates.length === 0) {
    throw new Error('No scorable category available');
  }
  return candidates.reduce((best, category) => {
    const bestScore = previewScore(scoreCard, best, dice, rollsLeft);
    const score = previewScore(scoreCard, category, dice, rollsLeft);
    return score > bestScore ? category : best;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/bot/heuristic.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/bot/heuristic.ts app/src/bot/heuristic.test.ts
git commit -m "Add heuristic fallback for choosing a score category"
```

---

## Task 4: House rules text + prompt builder

**Files:**
- Create: `app/src/bot/houseRules.ts`
- Create: `app/src/bot/promptBuilder.ts`
- Create: `app/src/bot/promptBuilder.test.ts`

**Interfaces:**
- Consumes: `previewScore` (Task 1).
- Produces: `buildRollDecisionPrompt(scoreCard, dice, heldDice, rollsLeft): string` and `buildScoreDecisionPrompt(scoreCard, dice, rollsLeft): string`, both from `app/src/bot/promptBuilder.ts`. Task 10's `useBotTurn` calls these to build the `prompt` string it sends via `requestBotMove`.

- [ ] **Step 1: Write the house rules text**

Create `app/src/bot/houseRules.ts`:

```ts
export const HOUSE_RULES_TEXT = `Zasady punktacji (dokładnie te reguły obowiązują w tej grze):
- Gra ma sekcję górną (aces, twos, threes, fours, fives, sixes) i dolną (pair, twoPair, threeOfKind, fourOfKind, smallStraight, largeStraight, fullHouse, chance, yahtzee).
- Sekcję dolną można zacząć wypełniać dopiero, gdy cała sekcja górna jest już wypełniona.
- Jeśli suma sekcji górnej wynosi co najmniej 63, gracz dostaje bonus +50 punktów (nie wpływa to na Twoją bieżącą decyzję, tylko informacyjnie).
- Jeśli kategoria z sekcji dolnej jest punktowana zaraz po pierwszym rzucie w turze (czyli z dwoma rzutami jeszcze do wykorzystania), jej wynik jest podwajany.
- "yahtzee" (5 tych samych) daje sumę oczek + 50 punktów bonusu, i również podlega podwojeniu opisanemu wyżej.
- Każdą kategorię można wybrać tylko raz na całą grę.`;
```

- [ ] **Step 2: Write the failing prompt builder test**

Create `app/src/bot/promptBuilder.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createEmptyScoreCard, type DiceValue } from '@bronx-dice/game-engine';
import { buildRollDecisionPrompt, buildScoreDecisionPrompt } from './promptBuilder';

describe('buildRollDecisionPrompt', () => {
  it('includes the dice, held state, rollsLeft, and open category previews', () => {
    const card = createEmptyScoreCard();
    const dice: DiceValue[] = [1, 1, 1, 4, 5];
    const heldDice = [true, true, true, false, false];
    const prompt = buildRollDecisionPrompt(card, dice, heldDice, 2);

    expect(prompt).toContain('1, 1, 1, 4, 5');
    expect(prompt).toContain('Pozostałe rzuty w tej turze: 2');
    expect(prompt).toContain('aces: 3 pkt');
    expect(prompt).toContain('fives: 5 pkt');
    expect(prompt).toContain('"action":"reroll"');
    expect(prompt).toContain('"action":"score"');
  });

  it('omits already-filled categories from the preview list', () => {
    const card = createEmptyScoreCard();
    const filled = { ...card, upper: { ...card.upper, fives: 10 } };
    const dice: DiceValue[] = [1, 1, 1, 4, 5];
    const prompt = buildRollDecisionPrompt(filled, dice, [false, false, false, false, false], 2);

    expect(prompt).not.toContain('fives:');
  });
});

describe('buildScoreDecisionPrompt', () => {
  it('includes the dice and open category previews, without a reroll option', () => {
    const card = createEmptyScoreCard();
    const dice: DiceValue[] = [6, 6, 6, 6, 6];
    const prompt = buildScoreDecisionPrompt(card, dice, 0);

    expect(prompt).toContain('6, 6, 6, 6, 6');
    expect(prompt).toContain('sixes: 30 pkt');
    expect(prompt).not.toContain('"action"');
    expect(prompt).toContain('"category"');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run (from `app/`): `npx vitest run src/bot/promptBuilder.test.ts`
Expected: FAIL — `Cannot find module './promptBuilder'`.

- [ ] **Step 4: Write the implementation**

Create `app/src/bot/promptBuilder.ts`:

```ts
import {
  UPPER_CATEGORIES,
  LOWER_CATEGORIES,
  canScoreCategory,
  type DiceValue,
  type PlayerScoreCard,
} from '@bronx-dice/game-engine';
import { previewScore } from '../utils/previewScore';
import { HOUSE_RULES_TEXT } from './houseRules';

const ALL_CATEGORIES = [...UPPER_CATEGORIES, ...LOWER_CATEGORIES];

function openCategoryLines(
  scoreCard: PlayerScoreCard,
  dice: DiceValue[],
  rollsLeft: number
): string {
  return ALL_CATEGORIES.filter((category) => canScoreCategory(scoreCard, category))
    .map(
      (category) =>
        `- ${category}: ${previewScore(scoreCard, category, dice, rollsLeft)} pkt jeśli wybierzesz teraz`
    )
    .join('\n');
}

export function buildRollDecisionPrompt(
  scoreCard: PlayerScoreCard,
  dice: DiceValue[],
  heldDice: boolean[],
  rollsLeft: number
): string {
  return `${HOUSE_RULES_TEXT}

Grasz w kości. Aktualny stan Twojej tury:
- Kości: ${dice.join(', ')}
- Aktualnie trzymane kości (index:trzymana): ${heldDice
    .map((held, index) => `${index}:${held}`)
    .join(', ')}
- Pozostałe rzuty w tej turze: ${rollsLeft}

Dostępne (jeszcze niewypełnione) kategorie i ich wynik, gdyby wybrać je teraz:
${openCategoryLines(scoreCard, dice, rollsLeft)}

Zdecyduj: czy rzucić ponownie kośćmi, które NIE są trzymane (podaj które kości trzymać przy kolejnym rzucie), czy zakończyć turę i zapunktować teraz najlepszą dostępną kategorią.
Odpowiedz WYŁĄCZNIE jednym obiektem JSON, bez żadnego dodatkowego tekstu, w jednym z dwóch formatów:
{"action":"reroll","hold":[bool,bool,bool,bool,bool]}
{"action":"score","category":"<jedna z nazw kategorii powyżej>"}`;
}

export function buildScoreDecisionPrompt(
  scoreCard: PlayerScoreCard,
  dice: DiceValue[],
  rollsLeft: number
): string {
  return `${HOUSE_RULES_TEXT}

Grasz w kości. To już ostatni rzut w tej turze, musisz teraz zapunktować.
- Kości: ${dice.join(', ')}

Dostępne (jeszcze niewypełnione) kategorie i ich wynik, gdyby wybrać je teraz:
${openCategoryLines(scoreCard, dice, rollsLeft)}

Wybierz najlepszą dostępną kategorię do zapunktowania.
Odpowiedz WYŁĄCZNIE jednym obiektem JSON, bez żadnego dodatkowego tekstu, w formacie:
{"category":"<jedna z nazw kategorii powyżej>"}`;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/bot/promptBuilder.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add app/src/bot/houseRules.ts app/src/bot/promptBuilder.ts app/src/bot/promptBuilder.test.ts
git commit -m "Add house rules text and bot prompt builder"
```

---

## Task 5: Response parsing/validation (`decision.ts`)

**Files:**
- Create: `app/src/bot/decision.ts`
- Create: `app/src/bot/decision.test.ts`

**Interfaces:**
- Consumes: `canScoreCategory`, `UPPER_CATEGORIES`, `LOWER_CATEGORIES`, `ScoreCategory`, `PlayerScoreCard` from `@bronx-dice/game-engine`.
- Produces: `type RollDecision = { action: 'reroll'; hold: boolean[] } | { action: 'score'; category: ScoreCategory }`; `parseRollDecision(raw: unknown, scoreCard: PlayerScoreCard): RollDecision | null`; `parseScoreDecision(raw: unknown, scoreCard: PlayerScoreCard): ScoreCategory | null`. Both return `null` for anything malformed or illegal — Task 10's `useBotTurn` treats `null` as "fall back to heuristic".

- [ ] **Step 1: Write the failing test**

Create `app/src/bot/decision.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createEmptyScoreCard } from '@bronx-dice/game-engine';
import { parseRollDecision, parseScoreDecision } from './decision';

describe('parseRollDecision', () => {
  it('accepts a valid reroll decision', () => {
    const card = createEmptyScoreCard();
    const raw = { action: 'reroll', hold: [true, false, false, false, false] };
    expect(parseRollDecision(raw, card)).toEqual({
      action: 'reroll',
      hold: [true, false, false, false, false],
    });
  });

  it('accepts a valid score decision for an open category', () => {
    const card = createEmptyScoreCard();
    const raw = { action: 'score', category: 'fives' };
    expect(parseRollDecision(raw, card)).toEqual({
      action: 'score',
      category: 'fives',
    });
  });

  it('rejects a score decision for an already-filled category', () => {
    const card = createEmptyScoreCard();
    const filled = { ...card, upper: { ...card.upper, fives: 10 } };
    const raw = { action: 'score', category: 'fives' };
    expect(parseRollDecision(raw, filled)).toBeNull();
  });

  it('rejects a score decision for a lower category before the upper section is full', () => {
    const card = createEmptyScoreCard();
    const raw = { action: 'score', category: 'chance' };
    expect(parseRollDecision(raw, card)).toBeNull();
  });

  it('rejects a reroll decision with a malformed hold array', () => {
    const card = createEmptyScoreCard();
    expect(parseRollDecision({ action: 'reroll', hold: [true, false] }, card)).toBeNull();
    expect(
      parseRollDecision({ action: 'reroll', hold: [1, 0, 0, 0, 0] }, card)
    ).toBeNull();
  });

  it('rejects an unrecognized shape', () => {
    const card = createEmptyScoreCard();
    expect(parseRollDecision({ action: 'give-up' }, card)).toBeNull();
    expect(parseRollDecision(null, card)).toBeNull();
    expect(parseRollDecision('not an object', card)).toBeNull();
  });
});

describe('parseScoreDecision', () => {
  it('accepts a valid category', () => {
    const card = createEmptyScoreCard();
    expect(parseScoreDecision({ category: 'sixes' }, card)).toBe('sixes');
  });

  it('rejects an already-filled category', () => {
    const card = createEmptyScoreCard();
    const filled = { ...card, upper: { ...card.upper, sixes: 12 } };
    expect(parseScoreDecision({ category: 'sixes' }, filled)).toBeNull();
  });

  it('rejects a malformed response', () => {
    const card = createEmptyScoreCard();
    expect(parseScoreDecision({ category: 'not-a-category' }, card)).toBeNull();
    expect(parseScoreDecision(null, card)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `app/`): `npx vitest run src/bot/decision.test.ts`
Expected: FAIL — `Cannot find module './decision'`.

- [ ] **Step 3: Write the implementation**

Create `app/src/bot/decision.ts`:

```ts
import {
  canScoreCategory,
  UPPER_CATEGORIES,
  LOWER_CATEGORIES,
  type PlayerScoreCard,
  type ScoreCategory,
} from '@bronx-dice/game-engine';

export type RollDecision =
  | { action: 'reroll'; hold: boolean[] }
  | { action: 'score'; category: ScoreCategory };

const ALL_CATEGORIES: ScoreCategory[] = [...UPPER_CATEGORIES, ...LOWER_CATEGORIES];

function isScoreCategory(value: unknown): value is ScoreCategory {
  return typeof value === 'string' && (ALL_CATEGORIES as string[]).includes(value);
}

function isHoldArray(value: unknown): value is boolean[] {
  return (
    Array.isArray(value) &&
    value.length === 5 &&
    value.every((entry) => typeof entry === 'boolean')
  );
}

export function parseRollDecision(
  raw: unknown,
  scoreCard: PlayerScoreCard
): RollDecision | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const { action, hold, category } = raw as Record<string, unknown>;
  if (action === 'reroll' && isHoldArray(hold)) {
    return { action: 'reroll', hold };
  }
  if (
    action === 'score' &&
    isScoreCategory(category) &&
    canScoreCategory(scoreCard, category)
  ) {
    return { action: 'score', category };
  }
  return null;
}

export function parseScoreDecision(
  raw: unknown,
  scoreCard: PlayerScoreCard
): ScoreCategory | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const { category } = raw as Record<string, unknown>;
  if (isScoreCategory(category) && canScoreCategory(scoreCard, category)) {
    return category;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/bot/decision.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/bot/decision.ts app/src/bot/decision.test.ts
git commit -m "Add bot decision parsing/validation against the engine's rules"
```

---

## Task 6: Decision-window timing helper

**Files:**
- Create: `app/src/bot/timing.ts`
- Create: `app/src/bot/timing.test.ts`

**Interfaces:**
- Produces: `withDecisionWindow<T>(targetMs: number, task: () => Promise<T>): Promise<T>`. Task 10's `useBotTurn` wraps every CLI round-trip with this.

- [ ] **Step 1: Write the failing test**

Create `app/src/bot/timing.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { withDecisionWindow } from './timing';

describe('withDecisionWindow', () => {
  it('pads out to the target window when the task finishes early', async () => {
    const start = Date.now();
    const result = await withDecisionWindow(80, async () => 'done-fast');
    const elapsed = Date.now() - start;

    expect(result).toBe('done-fast');
    expect(elapsed).toBeGreaterThanOrEqual(75);
  });

  it('does not add extra delay when the task already exceeds the window', async () => {
    const start = Date.now();
    const result = await withDecisionWindow(
      20,
      () => new Promise<string>((resolve) => setTimeout(() => resolve('done-slow'), 60))
    );
    const elapsed = Date.now() - start;

    expect(result).toBe('done-slow');
    expect(elapsed).toBeGreaterThanOrEqual(60);
    expect(elapsed).toBeLessThan(150);
  });

  it('propagates a rejection from the task without waiting out the window', async () => {
    await expect(
      withDecisionWindow(80, async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `app/`): `npx vitest run src/bot/timing.test.ts`
Expected: FAIL — `Cannot find module './timing'`.

- [ ] **Step 3: Write the implementation**

Create `app/src/bot/timing.ts`:

```ts
export async function withDecisionWindow<T>(
  targetMs: number,
  task: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  const result = await task();
  const elapsed = Date.now() - start;
  const remaining = targetMs - elapsed;
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/bot/timing.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/bot/timing.ts app/src/bot/timing.test.ts
git commit -m "Add decision-window timing helper for bot pacing"
```

---

## Task 7: `bot-server` workspace scaffold + Claude CLI client

**Files:**
- Create: `bot-server/package.json`
- Create: `bot-server/tsconfig.json`
- Create: `bot-server/vitest.config.ts`
- Create: `bot-server/src/claudeClient.ts`
- Create: `bot-server/src/claudeClient.test.ts`
- Create: `bot-server/src/extractJson.ts`
- Create: `bot-server/src/extractJson.test.ts`
- Modify: `package.json` (root — add `bot-server` to `workspaces`)

**Interfaces:**
- Produces: `runClaudeHeadless(prompt: string): Promise<string>` (raw stdout) and `extractJson(rawOutput: string): unknown` (throws if no JSON object is found or it doesn't parse), both consumed by Task 8's Express route.

- [ ] **Step 1: Scaffold the workspace**

Create `bot-server/package.json`:

```json
{
  "name": "bot-server",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "tsc",
    "test": "vitest run",
    "lint": "oxlint"
  },
  "dependencies": {
    "express": "^4.21.2"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^24.13.2",
    "@types/supertest": "^6.0.2",
    "oxlint": "^1.71.0",
    "supertest": "^7.0.0",
    "tsx": "^4.19.2",
    "typescript": "~6.0.2",
    "vitest": "^4.1.9"
  }
}
```

Create `bot-server/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2023"],
    "outDir": "lib",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

Create `bot-server/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

In root `package.json`, find:
```json
  "workspaces": [
    "app",
    "functions",
    "packages/*"
  ],
```
Replace with:
```json
  "workspaces": [
    "app",
    "functions",
    "bot-server",
    "packages/*"
  ],
```

Run (from repo root): `npm install`
Expected: installs `bot-server`'s dependencies and links the workspace, no errors.

- [ ] **Step 2: Write the failing `extractJson` test**

Create `bot-server/src/extractJson.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractJson } from './extractJson';

describe('extractJson', () => {
  it('parses a raw JSON object', () => {
    expect(extractJson('{"category":"chance"}')).toEqual({ category: 'chance' });
  });

  it('extracts JSON surrounded by extra text', () => {
    const output =
      'Here is my answer:\n{"action":"reroll","hold":[true,false,false,false,false]}\nDone.';
    expect(extractJson(output)).toEqual({
      action: 'reroll',
      hold: [true, false, false, false, false],
    });
  });

  it('throws when no JSON object is present', () => {
    expect(() => extractJson('no json here')).toThrow(
      'No JSON object found in Claude output'
    );
  });

  it('throws when the extracted text is not valid JSON', () => {
    expect(() => extractJson('{not valid json}')).toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run (from `bot-server/`): `npx vitest run src/extractJson.test.ts`
Expected: FAIL — `Cannot find module './extractJson'`.

- [ ] **Step 4: Implement `extractJson`**

Create `bot-server/src/extractJson.ts`:

```ts
export function extractJson(rawOutput: string): unknown {
  const match = rawOutput.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('No JSON object found in Claude output');
  }
  return JSON.parse(match[0]);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/extractJson.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Write the failing `claudeClient` test**

Create `bot-server/src/claudeClient.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import { runClaudeHeadless } from './claudeClient';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

describe('runClaudeHeadless', () => {
  afterEach(() => {
    vi.mocked(execFile).mockReset();
  });

  it('resolves with stdout when the claude CLI succeeds', async () => {
    (vi.mocked(execFile) as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (
        _file: string,
        _args: string[],
        _options: unknown,
        callback: (error: Error | null, stdout: string, stderr: string) => void
      ) => {
        callback(null, '{"action":"score","category":"chance"}', '');
      }
    );

    const stdout = await runClaudeHeadless('some prompt');

    expect(stdout).toBe('{"action":"score","category":"chance"}');
    expect(execFile).toHaveBeenCalledWith(
      'claude',
      ['-p', 'some prompt'],
      expect.objectContaining({ timeout: expect.any(Number) }),
      expect.any(Function)
    );
  });

  it('rejects when the claude CLI errors', async () => {
    (vi.mocked(execFile) as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (
        _file: string,
        _args: string[],
        _options: unknown,
        callback: (error: Error | null, stdout: string, stderr: string) => void
      ) => {
        callback(new Error('boom'), '', '');
      }
    );

    await expect(runClaudeHeadless('some prompt')).rejects.toThrow('boom');
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run (from `bot-server/`): `npx vitest run src/claudeClient.test.ts`
Expected: FAIL — `Cannot find module './claudeClient'`.

- [ ] **Step 8: Implement `claudeClient`**

Create `bot-server/src/claudeClient.ts`:

```ts
import { execFile } from 'node:child_process';

const CLAUDE_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

export function runClaudeHeadless(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'claude',
      ['-p', prompt],
      { timeout: CLAUDE_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout);
      }
    );
  });
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npx vitest run src/claudeClient.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json bot-server/package.json bot-server/tsconfig.json bot-server/vitest.config.ts bot-server/src/extractJson.ts bot-server/src/extractJson.test.ts bot-server/src/claudeClient.ts bot-server/src/claudeClient.test.ts
git commit -m "Scaffold bot-server workspace with a Claude headless CLI client"
```

---

## Task 8: `bot-server` HTTP endpoint

**Files:**
- Create: `bot-server/src/server.ts`
- Create: `bot-server/src/server.test.ts`
- Create: `bot-server/src/main.ts`

**Interfaces:**
- Consumes: `runClaudeHeadless` and `extractJson` (Task 7).
- Produces: `createApp(): Express` (an unstarted Express app, used directly by tests via `supertest`) and `startServer(): void` (calls `createApp().listen(PORT)`). `PORT = 4100`. Task 9's `app/src/bot/botClient.ts` calls `POST http://localhost:4100/bot-move` with `{ prompt: string }` and expects the parsed JSON decision back, or a non-2xx status on failure.

- [ ] **Step 1: Write the failing test**

Create `bot-server/src/server.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from './server';
import { runClaudeHeadless } from './claudeClient';

vi.mock('./claudeClient', () => ({
  runClaudeHeadless: vi.fn(),
}));

describe('POST /bot-move', () => {
  afterEach(() => {
    vi.mocked(runClaudeHeadless).mockReset();
  });

  it('returns the parsed JSON decision from Claude', async () => {
    vi.mocked(runClaudeHeadless).mockResolvedValue('{"category":"chance"}');

    const response = await request(createApp())
      .post('/bot-move')
      .send({ prompt: 'decide something' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ category: 'chance' });
  });

  it('rejects a request without a prompt', async () => {
    const response = await request(createApp()).post('/bot-move').send({});

    expect(response.status).toBe(400);
    expect(runClaudeHeadless).not.toHaveBeenCalled();
  });

  it('returns a 502 when the claude CLI call fails', async () => {
    vi.mocked(runClaudeHeadless).mockRejectedValue(new Error('CLI timed out'));

    const response = await request(createApp())
      .post('/bot-move')
      .send({ prompt: 'decide something' });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: 'CLI timed out' });
  });

  it('returns a 502 when the claude output has no parseable JSON', async () => {
    vi.mocked(runClaudeHeadless).mockResolvedValue('no json here');

    const response = await request(createApp())
      .post('/bot-move')
      .send({ prompt: 'decide something' });

    expect(response.status).toBe(502);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `bot-server/`): `npx vitest run src/server.test.ts`
Expected: FAIL — `Cannot find module './server'`.

- [ ] **Step 3: Implement the server**

Create `bot-server/src/server.ts`:

```ts
import express, { type Express } from 'express';
import { runClaudeHeadless } from './claudeClient';
import { extractJson } from './extractJson';

export const PORT = 4100;

export function createApp(): Express {
  const app = express();
  app.use(express.json());

  app.post('/bot-move', async (req, res) => {
    const { prompt } = req.body as { prompt?: unknown };
    if (typeof prompt !== 'string' || prompt.length === 0) {
      res.status(400).json({ error: 'prompt must be a non-empty string' });
      return;
    }
    try {
      const stdout = await runClaudeHeadless(prompt);
      const decision = extractJson(stdout);
      res.json(decision);
    } catch (err) {
      res
        .status(502)
        .json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  return app;
}

export function startServer(): void {
  createApp().listen(PORT, () => {
    console.log(`bot-server listening on http://localhost:${PORT}`);
  });
}
```

Create `bot-server/src/main.ts`:

```ts
import { startServer } from './server';

startServer();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Manually smoke-test the server (requires the `claude` CLI installed and logged in)**

Run (from `bot-server/`): `npm run dev`
Expected: logs `bot-server listening on http://localhost:4100`.

In another terminal:
```bash
curl -X POST http://localhost:4100/bot-move \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Reply with exactly this JSON and nothing else: {\"category\":\"chance\"}"}'
```
Expected: `{"category":"chance"}` (or close to it, depending on how literally the model follows the instruction — this is a manual sanity check, not an automated test, since it depends on a real, authenticated `claude` CLI).

Stop the dev server (Ctrl+C) once confirmed.

- [ ] **Step 6: Commit**

```bash
git add bot-server/src/server.ts bot-server/src/server.test.ts bot-server/src/main.ts
git commit -m "Add bot-server's /bot-move HTTP endpoint"
```

---

## Task 9: App-side bot client (`botClient.ts`)

**Files:**
- Create: `app/src/bot/botClient.ts`
- Create: `app/src/bot/botClient.test.ts`

**Interfaces:**
- Produces: `requestBotMove(prompt: string): Promise<unknown>` — POSTs to `bot-server` and returns the parsed JSON, or throws on a non-2xx response or network failure. Task 10's `useBotTurn` calls this and treats any thrown error as "fall back to heuristic".

- [ ] **Step 1: Write the failing test**

Create `app/src/bot/botClient.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { requestBotMove } from './botClient';

describe('requestBotMove', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the prompt and returns the parsed JSON response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ category: 'chance' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await requestBotMove('what should I do?');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4100/bot-move',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ prompt: 'what should I do?' }),
      })
    );
    expect(result).toEqual({ category: 'chance' });
  });

  it('throws when the response is not ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 502 });
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestBotMove('what should I do?')).rejects.toThrow(
      'bot-server responded with status 502'
    );
  });

  it('propagates a network failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestBotMove('what should I do?')).rejects.toThrow('network down');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `app/`): `npx vitest run src/bot/botClient.test.ts`
Expected: FAIL — `Cannot find module './botClient'`.

- [ ] **Step 3: Implement `botClient`**

Create `app/src/bot/botClient.ts`:

```ts
const BOT_SERVER_URL = 'http://localhost:4100/bot-move';

export async function requestBotMove(prompt: string): Promise<unknown> {
  const response = await fetch(BOT_SERVER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!response.ok) {
    throw new Error(`bot-server responded with status ${response.status}`);
  }
  return response.json();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/bot/botClient.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/bot/botClient.ts app/src/bot/botClient.test.ts
git commit -m "Add app-side client for bot-server's /bot-move endpoint"
```

---

## Task 10: `useBotTurn` hook

This is where everything from Tasks 3-6 and 9 comes together into the actual turn-driving logic, decoupled from `GameState`'s `setState` — it drives the exact same callback shape (`onRoll`/`onToggleHeld`/`onScore`) that `GameScreen` already wires to `RollButton`/`DiceTray`/`ScoreBoard`.

**Files:**
- Create: `app/src/bot/useBotTurn.ts`
- Create: `app/src/bot/useBotTurn.test.ts`

**Interfaces:**
- Consumes: `chooseHeuristicCategory` (Task 3), `buildRollDecisionPrompt`/`buildScoreDecisionPrompt` (Task 4), `parseRollDecision`/`parseScoreDecision`/`type RollDecision` (Task 5), `withDecisionWindow` (Task 6), `requestBotMove` (Task 9).
- Produces: `useBotTurn(options: UseBotTurnOptions): void` where
  ```ts
  interface UseBotTurnOptions {
    state: GameState;
    isRolling: boolean;
    botPlayerIds: Set<string>;
    enabled: boolean;
    onRoll: () => void;
    onToggleHeld: (index: number) => void;
    onScore: (category: ScoreCategory) => void;
  }
  ```
  Also exports `DECISION_WINDOW_MS` and `HOLD_PAUSE_MS` (for tests). Task 11's `GameScreen` calls this hook directly.

- [ ] **Step 1: Write the failing tests**

Create `app/src/bot/useBotTurn.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  createGameState,
  type DiceValue,
  type GameState,
} from '@bronx-dice/game-engine';
import { useBotTurn, DECISION_WINDOW_MS, HOLD_PAUSE_MS } from './useBotTurn';
import { requestBotMove } from './botClient';
import { chooseHeuristicCategory } from './heuristic';

vi.mock('./botClient', () => ({
  requestBotMove: vi.fn(),
}));

function makeState(overrides: Partial<GameState> = {}): GameState {
  return { ...createGameState(['Human', 'Bot']), ...overrides };
}

const BOT_IDS = new Set(['player-2']);

describe('useBotTurn', () => {
  afterEach(() => {
    vi.mocked(requestBotMove).mockReset();
    vi.useRealTimers();
  });

  it('auto-rolls at the start of a bot turn without asking the bot server', () => {
    const onRoll = vi.fn();
    const state = makeState({ currentPlayerIndex: 1 });

    renderHook(() =>
      useBotTurn({
        state,
        isRolling: false,
        botPlayerIds: BOT_IDS,
        enabled: true,
        onRoll,
        onToggleHeld: vi.fn(),
        onScore: vi.fn(),
      })
    );

    expect(onRoll).toHaveBeenCalledTimes(1);
    expect(requestBotMove).not.toHaveBeenCalled();
  });

  it('does nothing while the roll animation is in progress', () => {
    const onRoll = vi.fn();
    const state = makeState({ currentPlayerIndex: 1 });

    renderHook(() =>
      useBotTurn({
        state,
        isRolling: true,
        botPlayerIds: BOT_IDS,
        enabled: true,
        onRoll,
        onToggleHeld: vi.fn(),
        onScore: vi.fn(),
      })
    );

    expect(onRoll).not.toHaveBeenCalled();
  });

  it('does nothing on a human turn', () => {
    const onRoll = vi.fn();
    const state = makeState({ currentPlayerIndex: 0 });

    renderHook(() =>
      useBotTurn({
        state,
        isRolling: false,
        botPlayerIds: BOT_IDS,
        enabled: true,
        onRoll,
        onToggleHeld: vi.fn(),
        onScore: vi.fn(),
      })
    );

    expect(onRoll).not.toHaveBeenCalled();
  });

  it('does nothing once the game is over (enabled=false), even mid-bot-turn', () => {
    const onRoll = vi.fn();
    const state = makeState({ currentPlayerIndex: 1 });

    renderHook(() =>
      useBotTurn({
        state,
        isRolling: false,
        botPlayerIds: BOT_IDS,
        enabled: false,
        onRoll,
        onToggleHeld: vi.fn(),
        onScore: vi.fn(),
      })
    );

    expect(onRoll).not.toHaveBeenCalled();
  });

  it('does not re-roll twice for the exact same state (e.g. StrictMode double-render)', () => {
    const onRoll = vi.fn();
    const state = makeState({ currentPlayerIndex: 1 });

    const { rerender } = renderHook(
      (props: { state: GameState }) =>
        useBotTurn({
          state: props.state,
          isRolling: false,
          botPlayerIds: BOT_IDS,
          enabled: true,
          onRoll,
          onToggleHeld: vi.fn(),
          onScore: vi.fn(),
        }),
      { initialProps: { state } }
    );
    rerender({ state: { ...state } });

    expect(onRoll).toHaveBeenCalledTimes(1);
  });

  it('applies a reroll decision: toggles the right dice, then rolls again', async () => {
    vi.useFakeTimers();
    const onToggleHeld = vi.fn();
    const onRoll = vi.fn();
    const dice: DiceValue[] = [1, 1, 1, 4, 5];
    const heldDice = [false, false, false, false, false];
    const state = makeState({ currentPlayerIndex: 1, dice, heldDice, rollsLeft: 2 });
    vi.mocked(requestBotMove).mockResolvedValue({
      action: 'reroll',
      hold: [true, true, true, false, false],
    });

    renderHook(() =>
      useBotTurn({
        state,
        isRolling: false,
        botPlayerIds: BOT_IDS,
        enabled: true,
        onRoll,
        onToggleHeld,
        onScore: vi.fn(),
      })
    );

    await vi.advanceTimersByTimeAsync(DECISION_WINDOW_MS + HOLD_PAUSE_MS + 50);

    expect(onToggleHeld).toHaveBeenCalledWith(0);
    expect(onToggleHeld).toHaveBeenCalledWith(1);
    expect(onToggleHeld).toHaveBeenCalledWith(2);
    expect(onToggleHeld).not.toHaveBeenCalledWith(3);
    expect(onToggleHeld).not.toHaveBeenCalledWith(4);
    expect(onRoll).toHaveBeenCalledTimes(1);
  });

  it('applies a score decision when the roll decision says to stop', async () => {
    vi.useFakeTimers();
    const onScore = vi.fn();
    const dice: DiceValue[] = [1, 1, 1, 4, 5];
    const state = makeState({
      currentPlayerIndex: 1,
      dice,
      heldDice: [false, false, false, false, false],
      rollsLeft: 2,
    });
    vi.mocked(requestBotMove).mockResolvedValue({ action: 'score', category: 'fives' });

    renderHook(() =>
      useBotTurn({
        state,
        isRolling: false,
        botPlayerIds: BOT_IDS,
        enabled: true,
        onRoll: vi.fn(),
        onToggleHeld: vi.fn(),
        onScore,
      })
    );

    await vi.advanceTimersByTimeAsync(DECISION_WINDOW_MS + 50);

    expect(onScore).toHaveBeenCalledWith('fives');
  });

  it('forces a category choice when rollsLeft is 0', async () => {
    vi.useFakeTimers();
    const onScore = vi.fn();
    const dice: DiceValue[] = [6, 6, 6, 6, 6];
    const state = makeState({
      currentPlayerIndex: 1,
      dice,
      heldDice: [true, true, true, true, true],
      rollsLeft: 0,
    });
    vi.mocked(requestBotMove).mockResolvedValue({ category: 'sixes' });

    renderHook(() =>
      useBotTurn({
        state,
        isRolling: false,
        botPlayerIds: BOT_IDS,
        enabled: true,
        onRoll: vi.fn(),
        onToggleHeld: vi.fn(),
        onScore,
      })
    );

    await vi.advanceTimersByTimeAsync(DECISION_WINDOW_MS + 50);

    expect(onScore).toHaveBeenCalledWith('sixes');
  });

  it('falls back to the heuristic when the bot server call fails', async () => {
    vi.useFakeTimers();
    const onScore = vi.fn();
    const dice: DiceValue[] = [1, 1, 1, 4, 5];
    const state = makeState({
      currentPlayerIndex: 1,
      dice,
      heldDice: [false, false, false, false, false],
      rollsLeft: 2,
    });
    vi.mocked(requestBotMove).mockRejectedValue(new Error('network down'));
    const expectedCategory = chooseHeuristicCategory(
      state.scoreCards['player-2'],
      dice,
      2
    );

    renderHook(() =>
      useBotTurn({
        state,
        isRolling: false,
        botPlayerIds: BOT_IDS,
        enabled: true,
        onRoll: vi.fn(),
        onToggleHeld: vi.fn(),
        onScore,
      })
    );

    await vi.advanceTimersByTimeAsync(DECISION_WINDOW_MS + 50);

    expect(onScore).toHaveBeenCalledWith(expectedCategory);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `app/`): `npx vitest run src/bot/useBotTurn.test.ts`
Expected: FAIL — `Cannot find module './useBotTurn'`.

- [ ] **Step 3: Implement the hook**

Create `app/src/bot/useBotTurn.ts`:

```ts
import { useEffect, useRef } from 'react';
import type {
  DiceValue,
  GameState,
  PlayerScoreCard,
  ScoreCategory,
} from '@bronx-dice/game-engine';
import { requestBotMove } from './botClient';
import { buildRollDecisionPrompt, buildScoreDecisionPrompt } from './promptBuilder';
import { parseRollDecision, parseScoreDecision, type RollDecision } from './decision';
import { chooseHeuristicCategory } from './heuristic';
import { withDecisionWindow } from './timing';

export const DECISION_WINDOW_MS = 2500;
export const HOLD_PAUSE_MS = 400;

interface UseBotTurnOptions {
  state: GameState;
  isRolling: boolean;
  botPlayerIds: Set<string>;
  enabled: boolean;
  onRoll: () => void;
  onToggleHeld: (index: number) => void;
  onScore: (category: ScoreCategory) => void;
}

async function getRollDecision(
  scoreCard: PlayerScoreCard,
  dice: DiceValue[],
  heldDice: boolean[],
  rollsLeft: number
): Promise<RollDecision> {
  try {
    const prompt = buildRollDecisionPrompt(scoreCard, dice, heldDice, rollsLeft);
    const raw = await requestBotMove(prompt);
    const decision = parseRollDecision(raw, scoreCard);
    if (decision) {
      return decision;
    }
  } catch {
    // Any network/CLI/parse failure falls through to the heuristic below.
  }
  return { action: 'score', category: chooseHeuristicCategory(scoreCard, dice, rollsLeft) };
}

async function getScoreDecision(
  scoreCard: PlayerScoreCard,
  dice: DiceValue[],
  rollsLeft: number
): Promise<ScoreCategory> {
  try {
    const prompt = buildScoreDecisionPrompt(scoreCard, dice, rollsLeft);
    const raw = await requestBotMove(prompt);
    const category = parseScoreDecision(raw, scoreCard);
    if (category) {
      return category;
    }
  } catch {
    // Any network/CLI/parse failure falls through to the heuristic below.
  }
  return chooseHeuristicCategory(scoreCard, dice, rollsLeft);
}

export function useBotTurn({
  state,
  isRolling,
  botPlayerIds,
  enabled,
  onRoll,
  onToggleHeld,
  onScore,
}: UseBotTurnOptions): void {
  const lastHandledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || isRolling) {
      return;
    }
    const currentPlayer = state.players[state.currentPlayerIndex];
    if (!botPlayerIds.has(currentPlayer.id)) {
      return;
    }

    const signature = `${currentPlayer.id}:${state.rollsLeft}:${state.dice.join(',')}`;
    if (lastHandledRef.current === signature) {
      return;
    }
    lastHandledRef.current = signature;

    if (state.dice.length === 0) {
      onRoll();
      return;
    }

    const scoreCard = state.scoreCards[currentPlayer.id];
    const { dice, heldDice, rollsLeft } = state;

    if (rollsLeft > 0) {
      withDecisionWindow(DECISION_WINDOW_MS, () =>
        getRollDecision(scoreCard, dice, heldDice, rollsLeft)
      ).then((decision) => {
        if (decision.action === 'score') {
          onScore(decision.category);
          return;
        }
        decision.hold.forEach((held, index) => {
          if (held !== heldDice[index]) {
            onToggleHeld(index);
          }
        });
        setTimeout(onRoll, HOLD_PAUSE_MS);
      });
    } else {
      withDecisionWindow(DECISION_WINDOW_MS, () =>
        getScoreDecision(scoreCard, dice, rollsLeft)
      ).then(onScore);
    }
  }, [state, isRolling, botPlayerIds, enabled, onRoll, onToggleHeld, onScore]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/bot/useBotTurn.test.ts`
Expected: PASS (9 tests). If the timing-based tests are flaky, double-check that `vi.advanceTimersByTimeAsync` is available in the installed Vitest version (`vitest` `^4.1.9` per `app/package.json` supports it); if not, replace those `await vi.advanceTimersByTimeAsync(ms)` calls with `await vi.advanceTimersByTimeAsync` polyfill via repeated `await Promise.resolve(); vi.advanceTimersByTime(ms);` loops.

- [ ] **Step 5: Commit**

```bash
git add app/src/bot/useBotTurn.ts app/src/bot/useBotTurn.test.ts
git commit -m "Add useBotTurn hook orchestrating bot turns"
```

---

## Task 11: Wire `useBotTurn` into GameScreen

**Files:**
- Modify: `app/src/components/GameScreen.tsx`
- Modify: `app/src/components/GameScreen.test.tsx`

**Interfaces:**
- Consumes: `useBotTurn` (Task 10), `botPlayerIds`/`isBotTurn` already computed in Task 2.

- [ ] **Step 1: Write failing tests for automated bot turns**

Add to `app/src/components/GameScreen.test.tsx` (mock `../bot/botClient` at the top of the file alongside the other `vi.mock` calls, and add these tests inside the `describe('GameScreen', ...)` block):

```ts
vi.mock('../bot/botClient', () => ({
  requestBotMove: vi.fn(),
}));
```

```ts
  it('auto-plays a bot turn: rolls, decides, and scores without any clicks', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0); // every die shows 1
    const { requestBotMove } = await import('../bot/botClient');
    vi.mocked(requestBotMove).mockResolvedValue({ action: 'score', category: 'aces' });

    render(
      <GameScreen
        playerNames={['Ola', 'Kuba']}
        botFlags={[false, true]}
        accountPlayerIndex={null}
        onPlayAgain={() => {}}
        onExit={() => {}}
      />
    );

    expect(screen.getByText('Tura: Ola')).toBeInTheDocument();

    // Ola (human) takes her turn manually and scores the first open category,
    // handing the turn to Kuba, the bot.
    fireEvent.click(screen.getByRole('button', { name: 'Rzuć kośćmi' }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.click(document.querySelectorAll('.score-board tbody button')[0]);

    expect(screen.getByText('Tura: Kuba 🤖')).toBeInTheDocument();

    // Kuba's turn should now play out on its own: auto-roll, roll animation,
    // decision window, and score — with nobody clicking anything.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000); // roll animation
      await vi.advanceTimersByTimeAsync(3000); // decision window
    });

    expect(screen.getByText('Tura: Ola')).toBeInTheDocument();
  });

  it('does not let a human click for the bot during its turn', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { requestBotMove } = await import('../bot/botClient');
    vi.mocked(requestBotMove).mockResolvedValue({ action: 'score', category: 'aces' });

    render(
      <GameScreen
        playerNames={['Ola', 'Kuba']}
        botFlags={[true, false]}
        accountPlayerIndex={null}
        onPlayAgain={() => {}}
        onExit={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: 'Rzuć kośćmi' })).toBeDisabled();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `app/`): `npx vitest run src/components/GameScreen.test.tsx`
Expected: FAIL — the bot's turn never advances (no automation wired up yet), and the roll button isn't disabled during a bot's turn.

- [ ] **Step 3: Wire the hook and interactive gating into GameScreen.tsx**

In `app/src/components/GameScreen.tsx`, add the import:

Find:
```ts
import { useAuth } from '../contexts/AuthContext';
import { recordLocalGameResult } from '../services/statsService';
```
Replace with:
```ts
import { useAuth } from '../contexts/AuthContext';
import { recordLocalGameResult } from '../services/statsService';
import { useBotTurn } from '../bot/useBotTurn';
```

The hook must run before any early `return` (Rules of Hooks: all hooks run unconditionally, in the same order, every render), so this single edit moves the `isGameOver` early return down, below the new `useBotTurn` call. Find the entire block from the early return through the end of the component's `return` statement:
```tsx
  if (isGameOver(state)) {
    return (
      <WinnerScreen
        winners={getWinners(state)}
        players={state.players}
        scoreCards={state.scoreCards}
        onPlayAgain={onPlayAgain}
      />
    );
  }

  const currentPlayer = state.players[state.currentPlayerIndex];
  const isBotTurn = botPlayerIds.has(currentPlayer.id);

  const handleExit = () => {
    if (window.confirm('Czy na pewno chcesz zakończyć grę?')) {
      onExit();
    }
  };

  return (
    <div className="game-screen">
      <button type="button" className="back-button" onClick={handleExit}>
        Wyjdź z gry
      </button>
      <h2>
        Tura: {currentPlayer.name}
        {isBotTurn ? ' 🤖' : ''}
      </h2>
      <DiceTray
        dice={state.dice}
        heldDice={state.heldDice}
        onToggleHeld={(index) =>
          setState((current) => toggleHeldDie(current, index))
        }
      />
      <RollButton
        rollsLeft={state.rollsLeft}
        onRoll={() => {
          setState((current) => rollInTurn(current));
          setIsRolling(true);
        }}
      />
      <ScoreBoard
        players={state.players}
        scoreCards={state.scoreCards}
        currentPlayerId={currentPlayer.id}
        dice={isRolling ? [] : state.dice}
        rollsLeft={state.rollsLeft}
        botPlayerIds={botPlayerIds}
        onScore={(category: ScoreCategory) =>
          setState((current) => applyScore(current, category))
        }
      />
    </div>
  );
```
Replace the whole block above with:
```tsx
  const handleRoll = () => {
    setState((current) => rollInTurn(current));
    setIsRolling(true);
  };

  const handleToggleHeld = (index: number) => {
    setState((current) => toggleHeldDie(current, index));
  };

  const handleScore = (category: ScoreCategory) => {
    setState((current) => applyScore(current, category));
  };

  useBotTurn({
    state,
    isRolling,
    botPlayerIds,
    enabled: !isGameOver(state),
    onRoll: handleRoll,
    onToggleHeld: handleToggleHeld,
    onScore: handleScore,
  });

  if (isGameOver(state)) {
    return (
      <WinnerScreen
        winners={getWinners(state)}
        players={state.players}
        scoreCards={state.scoreCards}
        onPlayAgain={onPlayAgain}
      />
    );
  }

  const currentPlayer = state.players[state.currentPlayerIndex];
  const isBotTurn = botPlayerIds.has(currentPlayer.id);

  const handleExit = () => {
    if (window.confirm('Czy na pewno chcesz zakończyć grę?')) {
      onExit();
    }
  };

  return (
    <div className="game-screen">
      <button type="button" className="back-button" onClick={handleExit}>
        Wyjdź z gry
      </button>
      <h2>
        Tura: {currentPlayer.name}
        {isBotTurn ? ' 🤖' : ''}
      </h2>
      <DiceTray
        dice={state.dice}
        heldDice={state.heldDice}
        onToggleHeld={handleToggleHeld}
        interactive={!isBotTurn}
      />
      <RollButton rollsLeft={state.rollsLeft} onRoll={handleRoll} interactive={!isBotTurn} />
      <ScoreBoard
        players={state.players}
        scoreCards={state.scoreCards}
        currentPlayerId={currentPlayer.id}
        dice={isRolling ? [] : state.dice}
        rollsLeft={state.rollsLeft}
        interactive={!isBotTurn}
        botPlayerIds={botPlayerIds}
        onScore={handleScore}
      />
    </div>
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/GameScreen.test.tsx`
Expected: PASS (all tests, including the 2 new ones). If the bot-turn test is flaky on timing, increase the `vi.advanceTimersByTimeAsync` amounts generously (e.g. `4000` instead of `3000` for the decision window) — the goal is "comfortably past `DECISION_WINDOW_MS` (2500ms)", not an exact match.

- [ ] **Step 5: Run the full app suite**

Run (from `app/`): `npx vitest run`
Expected: PASS, all tests green.

- [ ] **Step 6: Run the app build**

Run (from `app/`): `npm run build`
Expected: type-checks and builds successfully.

- [ ] **Step 7: Commit**

```bash
git add app/src/components/GameScreen.tsx app/src/components/GameScreen.test.tsx
git commit -m "Wire useBotTurn into GameScreen: bots play their turns automatically"
```

---

## Task 12: Root workspace wiring and local-dev instructions

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:** none (documentation/tooling only).

- [ ] **Step 1: Document the new workspace and local dev flow in CLAUDE.md**

In `CLAUDE.md`, find the bullet list describing the top-level packages (the one starting with `- \`app/\` — the React + TypeScript client...`) and add a new bullet after the `functions/` line:

Find:
```
- `functions/` — Cloud Functions (Firebase Functions v2) that are the only way to mutate online-room state in Firestore.
```
Replace with:
```
- `functions/` — Cloud Functions (Firebase Functions v2) that are the only way to mutate online-room state in Firestore.
- `bot-server/` — a small local-only Node/Express server that proxies bot-turn decisions to the `claude` CLI in headless mode (`claude -p`). It powers the "Bot" checkbox in local (hotseat) games — see `app/src/bot/`. It knows nothing about game rules (that validation lives in `app/`), is never deployed (`npm run deploy` only touches Firebase Hosting), and must be run manually alongside the app in a second terminal (`npm run dev --workspace=bot-server`) with the `claude` CLI installed and logged in — otherwise bots fall back to a simple heuristic.
```

- [ ] **Step 2: Verify the doc change reads correctly**

Run: `cat CLAUDE.md` (or open it in an editor) and confirm the new bullet sits between the `functions/` and `pierwowzor/` bullets, matching the surrounding style.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Document the bot-server workspace and local dev flow"
```

- [ ] **Step 4: Final full verification across all touched workspaces**

Run each of the following from the repo root and confirm all pass:
```bash
npm test --workspace=app
npm run build --workspace=app
npm test --workspace=bot-server
npm run build --workspace=bot-server
npm test --workspace=packages/game-engine
```
Expected: all green — `packages/game-engine` should be unaffected (Global Constraints: it was never touched by this plan).
