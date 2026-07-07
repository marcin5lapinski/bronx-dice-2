# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Bronx Dice — a Yahtzee-style dice game with custom house rules. This repo is a from-scratch rewrite (React + TypeScript + Vite) of an old Create React App prototype, now structured as an npm workspace monorepo with three packages: the `app/` client, the shared `packages/game-engine/` scoring engine, and (from Etap 5 onward) `functions/` for online play.

- `app/` — the React + TypeScript client (Vite). This is what you should read and edit for UI work.
- `packages/game-engine/` — the pure game engine (scoring rules, `GameState`), shared as an npm workspace package by both `app/` and `functions/`. Edit rule logic here, not in `app/`.
- `functions/` — Cloud Functions (Firebase Functions v2) that are the only way to mutate online-room state in Firestore.
- `bot-server/` — a small local-only Node/Express server that proxies bot-turn decisions to the `claude` CLI in headless mode (`claude -p`). It powers the "Bot" checkbox in local (hotseat) games — see `app/src/bot/`. It knows nothing about game rules (that validation lives in `app/`), is never deployed (`npm run deploy` only touches Firebase Hosting), and must be run manually alongside the app in a second terminal (`npm run dev --workspace=bot-server`) with the `claude` CLI installed and logged in — otherwise bots fall back to a simple heuristic.
- `pierwowzor/` — the original Create React App prototype ("pierwowzor" = "prototype" in Polish). It is **untracked** in this git repo (not a submodule, just kept locally for reference) and has its own nested `.git`. Its game logic is known to be buggy (copy-pasted per-player instead of parameterized, and Pair/Two Pair/Three of a Kind/Full House detection is broken). Do not edit it; consult it only if you need to check what the old behavior was.
- `docs/superpowers/specs/2026-07-01-bronx-dice-roadmap-design.md` — the design doc with the full game rules and the stage-by-stage roadmap (in Polish). `docs/superpowers/plans/` holds per-stage implementation plans ("etap" = stage). Read the roadmap doc before making rule changes — it's the source of truth for scoring rules.

## Commands

This is an npm workspace repo. Most commands below take a `--workspace=<name>` flag (or `cd` into that package) — `app`, `functions`, `packages/game-engine`. `firebase emulators:start` and any `firebase emulators:exec ...` wrapper script run from the **repo root**, where `firebase.json` now lives.

```
npm run dev       # start Vite dev server
npm run build      # tsc -b (project references) + vite build
npm run lint        # oxlint
npm test              # vitest run (all tests, single run)
npx vitest              # vitest in watch mode
npx vitest run src/dice.test.ts   # run a single test file (from packages/game-engine/)
npx vitest run -t "test name"            # run tests matching a name
```

There is no separate typecheck script; `npm run build` type-checks via `tsc -b` before bundling.

## Architecture

### Engine layer (`packages/game-engine/src/`) — pure logic, no React

The engine is a set of pure, parameterized functions operating on a single `GameState` (types in `packages/game-engine/src/types/game.ts`). There is no per-player duplication — every function takes state/dice/category as arguments. It's built as the `@bronx-dice/game-engine` npm workspace package (run `npm run build:engine` from the repo root after changing it) and imported by `app/` and, from later Etap 5 tasks onward, by `functions/`.

- `dice.ts` — `rollDice(currentDice, held, random)` takes an injectable RNG (defaults to `Math.random`) so it's deterministic in tests. `DICE_COUNT = 5`, `MAX_ROLLS = 3`.
- `scoreCard.ts` — `canScoreCategory` enforces that the **lower section can only be filled once the entire upper section is filled** (`isUpperSectionFilled`). `scoreCategory` is the single orchestrator for writing a score: it dispatches to `scoring/upperSection.ts` or `scoring/combinations.ts`, then applies the house rules below.
- `scoring/upperSection.ts` — per-face upper section scoring, upper sum, and the ≥63 bonus.
- `scoring/combinations.ts` — lower-section combination detection (pair, two pair, three/four of a kind, full house, straights, yahtzee, chance). Uses `countsByValue` as the shared building block rather than ad hoc duplicate-checking.
- `gameState.ts` — `createGameState(playerNames)` (2–6 players, throws outside that range) and `nextTurn` (resets dice/holds/rolls and advances `currentPlayerIndex`).
- `turn.ts` — the per-turn API used by the UI: `rollInTurn`, `toggleHeldDie`, `applyScore` (scores then calls `nextTurn`), `isGameOver`, `getWinners`.

Custom house rules (deliberately different from classic Yahtzee — see the roadmap doc for the Polish rationale):
- Upper section bonus is **+50** at ≥63 (not classic Yahtzee's +35).
- Lower section is locked until the upper section is completely filled.
- **Doubling rule**: if a lower-section category is scored while `rollsLeft === 2` (i.e., right after the first roll of the turn, two rolls still remaining), its raw score is doubled (`DOUBLE_SCORE_ROLLS_LEFT` in `scoreCard.ts`). This rewards fast/bold decisions.
- Yahtzee (5 of a kind) scores sum-of-dice, +50 bonus on top, and is itself subject to the doubling rule above (doubling applies to the base score before the flat +50 in the current implementation — check `scoreCard.ts` `scoreCategory` if changing this).

### UI layer (`app/src/components/`)

Screen flow is driven by `App.tsx` holding `playerNames` in `useState`: `null` → `StartScreen`, otherwise `GameScreen`. `GameScreen` owns the single `GameState` in `useState` and is the only place that calls the `turn.ts` API; it renders `DiceTray`, `RollButton`, `ScoreBoard`, and — once `isGameOver` — `WinnerScreen`. There is no external state management library; all state is local `useState` in `GameScreen`/`App`. UI copy is in Polish.

### Testing conventions

- Vitest's default `test.environment` is `'node'`. `packages/game-engine` has no vite/vitest config and relies on that default; `app/vite.config.ts` sets it explicitly too — either way, engine tests run fast with no DOM.
- Component tests that need a DOM must opt in per-file with a `// @vitest-environment jsdom` pragma as the first line (see `App.test.tsx`), and use `@testing-library/react` / `@testing-library/user-event`.
- Every engine module has a co-located `*.test.ts`; keep this pairing when adding engine code.

### Roadmap / stage workflow

Work is organized into numbered "etapy" (stages) tracked in the roadmap doc (Etap 1: engine, Etap 2: local hot-seat UI — both merged to `master`; later stages add visual styling, Firebase auth, and online multiplayer via Firestore + Cloud Functions). Stage work is done via `superpowers` skills (`writing-plans`, git worktrees under `.claude/worktrees/`) — check `docs/superpowers/plans/` for the current stage's plan before starting new feature work, and don't assume online/Firebase features exist yet — they're future stages.
