# Jak grać? modal + Kopiuj kod pokoju Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Jak grać?" button to the main menu that opens a modal explaining the full game rules (including holding dice), and add a copy-room-code button next to the room heading in the online lobby.

**Architecture:** Two new, independent, presentational React components (`HowToPlayModal`, `CopyRoomCodeButton`) under `app/src/components/`, each with a co-located Vitest+jsdom test. `StartScreen` gains a trigger button + conditional render of the modal. `RoomLobbyScreen` gains the copy button next to its existing `<h1>`. All styling is plain CSS added to `app/src/styles/components.css`, following the existing per-component-section convention. No changes to `packages/game-engine` or `functions/`.

**Tech Stack:** React + TypeScript (Vite), Vitest + `@testing-library/react` + `@testing-library/user-event` (jsdom via `// @vitest-environment jsdom` pragma), plain global CSS (no CSS modules).

## Global Constraints

- Upper section bonus: **+50** at sum ≥ **63** (from spec, matches `scoreCard.ts`).
- Doubling rule: doubles a lower-section category's raw score when scored right after the first roll (`rollsLeft === 2`); the Yahtzee (5X) +50 bonus is **never** doubled.
- Copy-button reset delay: **1500ms** after a successful copy, label reverts from "Skopiowano!" to "Kopiuj kod".
- "Jak grać?" modal closes via: **"Zamknij" button** and **Escape key**. Clicking the overlay background must **NOT** close it (spec: user may want to select/copy rule text).
- "Jak grać?" trigger button: blue accent (`--accent-blue` family, not `--accent-green`), narrower than other `.start-screen` buttons, `align-self: flex-end` so it sits at the right edge of the `.start-screen` flex column, placed as the first element inside `.start-screen` (above the "Zagraj online"/"Zaloguj się" button regardless of auth state).
- No clipboard-unavailable fallback, no i18n — all copy is hardcoded Polish, matching existing app conventions.
- All new UI copy strings are fixed by the approved spec/design doc (`docs/superpowers/specs/2026-07-08-jak-grac-modal-kopiuj-kod-design.md`) — use them verbatim, they appear in full in Task 1 below.

---

## Task 1: `HowToPlayModal` component

**Files:**
- Create: `app/src/components/HowToPlayModal.tsx`
- Create: `app/src/components/HowToPlayModal.test.tsx`
- Modify: `app/src/styles/components.css` (append new section, no existing section touched)

**Interfaces:**
- Produces: `HowToPlayModal({ onClose: () => void })` — default export, renders a `role="dialog"` panel with `aria-modal="true"` and `aria-labelledby` pointing at its own "Jak grać?" heading id. Calls `onClose` when its "Zamknij" button is clicked or when Escape is pressed anywhere in the document. Does NOT call `onClose` on overlay-background clicks.
- CSS classes introduced: `.how-to-play-overlay` (fixed full-screen backdrop), `.how-to-play-modal` (the panel).

- [ ] **Step 1: Write the failing test**

Create `app/src/components/HowToPlayModal.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HowToPlayModal from './HowToPlayModal';

describe('HowToPlayModal', () => {
  it('renders as a labeled dialog', () => {
    render(<HowToPlayModal onClose={() => {}} />);

    expect(screen.getByRole('dialog', { name: 'Jak grać?' })).toBeInTheDocument();
  });

  it('calls onClose when "Zamknij" is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<HowToPlayModal onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Zamknij' }));

    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<HowToPlayModal onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  it('does not call onClose when clicking the overlay background', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(<HowToPlayModal onClose={onClose} />);

    const overlay = container.querySelector('.how-to-play-overlay');
    expect(overlay).not.toBeNull();
    await user.click(overlay as Element);

    expect(onClose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/HowToPlayModal.test.tsx` (from `app/`)
Expected: FAIL — `Failed to resolve import "./HowToPlayModal"` (module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `app/src/components/HowToPlayModal.tsx`:

```tsx
import { useEffect } from 'react';

interface HowToPlayModalProps {
  onClose: () => void;
}

function HowToPlayModal({ onClose }: HowToPlayModalProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="how-to-play-overlay">
      <div
        className="how-to-play-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-to-play-title"
      >
        <h2 id="how-to-play-title">Jak grać?</h2>

        <h3>Cel gry</h3>
        <p>
          Bronx Dice to gra w kości podobna do Yahtzee, z własnymi zasadami
          domowymi. W każdej turze rzucasz kośćmi i próbujesz zapełnić jak
          najlepiej tabelę wyników — wygrywa gracz z najwyższą sumą punktów po
          zapełnieniu całej tabeli.
        </p>

        <h3>Przebieg tury</h3>
        <p>
          Masz do 3 rzutów wszystkimi 5 kośćmi. Po każdym rzucie możesz
          zdecydować: rzucić ponownie (tylko kośćmi, które nie są zatrzymane)
          albo zakończyć turę, wpisując wynik w jedną z wolnych kategorii w
          tabeli.
        </p>

        <h3>Trzymanie kości (holdowanie)</h3>
        <p>
          Kliknięcie kości zatrzymuje ją ("hold") — przy kolejnym rzucie
          zatrzymane kości zachowują swoją wartość, rzucane są tylko te
          odznaczone. Dzięki temu możesz np. zatrzymać parę szóstek licząc na
          czwórkę tej samej wartości, albo zatrzymać cztery kolejne wartości,
          dobijając piąty rzut do strita. Trzymanie to główne narzędzie
          strategiczne — pozwala zachować dobre kości i ryzykować tylko
          resztą, zamiast rzucać wszystkim od nowa.
        </p>

        <h3>Sekcja górna</h3>
        <p>
          Jedynki, Dwójki, Trójki, Czwórki, Piątki, Szóstki. Wynik = liczba
          kości danej wartości × wartość ścianki (np. trzy szóstki w
          kategorii "Szóstki" = 18 pkt). Jeśli suma całej sekcji górnej
          osiągnie 63 punkty lub więcej, dostajesz premię +50 punktów.
        </p>

        <h3>Sekcja dolna</h3>
        <p>Odblokowuje się dopiero, gdy cała sekcja górna jest zapełniona:</p>
        <ul>
          <li>Para — dwie takie same kości: wartość × 2</li>
          <li>2× Para — dwie różne pary: suma wartości obu par × 2</li>
          <li>3X (trójka) — trzy takie same: wartość × 3</li>
          <li>4X (czwórka) — cztery takie same: wartość × 4</li>
          <li>Mały strit — kości 1-2-3-4-5: zawsze 15 pkt</li>
          <li>Duży strit — kości 2-3-4-5-6: zawsze 20 pkt</li>
          <li>Full — trójka + para (wszystkie 5 kości): suma wszystkich kości</li>
          <li>Szansa — dowolny układ: suma wszystkich kości</li>
          <li>
            5X (Generał/Yahtzee) — wszystkie 5 kości takie same: suma kości +
            premia 50 punktów
          </li>
        </ul>

        <h3>Zasada podwajania</h3>
        <p>
          Jeśli zdecydujesz się wpisać wynik w kategorię z sekcji dolnej od
          razu po pierwszym rzucie (czyli zostały jeszcze 2 rzuty do
          wykorzystania), Twój wynik w tej kategorii zostaje podwojony. To
          nagroda za szybkie, śmiałe decyzje zamiast zawsze dobijania kości do
          ideału. (Premia +50 za 5X nie jest podwajana — dotyczy to tylko
          surowego wyniku bazowego.)
        </p>

        <button type="button" onClick={onClose}>
          Zamknij
        </button>
      </div>
    </div>
  );
}

export default HowToPlayModal;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/HowToPlayModal.test.tsx` (from `app/`)
Expected: PASS (4 tests).

- [ ] **Step 5: Add CSS**

In `app/src/styles/components.css`, find this exact existing block (end of the `/* StartScreen */` section):

```css
.start-screen button:disabled {
  border-color: var(--panel-border);
  color: var(--text-dim);
  box-shadow: none;
  background: transparent;
}
```

Insert a new section directly after it:

```css

/* HowToPlayModal */
.how-to-play-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 100;
}

.how-to-play-modal {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  max-width: 480px;
  max-height: 80vh;
  overflow-y: auto;
  padding: 24px;
  text-align: left;
}

.how-to-play-modal h3 {
  color: var(--accent-blue);
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin: 16px 0 6px;
}

.how-to-play-modal p,
.how-to-play-modal li {
  color: var(--text);
  font-size: 14px;
  line-height: 1.5;
}

.how-to-play-modal ul {
  margin: 4px 0;
  padding-left: 20px;
}

.how-to-play-modal button {
  background: var(--accent-blue-bg);
  color: var(--accent-blue);
  border: 1px solid var(--accent-blue);
  box-shadow: 0 0 10px var(--accent-blue-glow);
  border-radius: 4px;
  padding: 10px 20px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  font-size: 13px;
  margin-top: 16px;
  display: block;
  margin-left: auto;
  margin-right: auto;
}
```

- [ ] **Step 6: Re-run the test suite to confirm CSS changes didn't break anything**

Run: `npx vitest run src/components/HowToPlayModal.test.tsx` (from `app/`)
Expected: PASS (4 tests) — CSS doesn't affect jsdom test assertions, this is a sanity check.

- [ ] **Step 7: Commit**

```bash
git add app/src/components/HowToPlayModal.tsx app/src/components/HowToPlayModal.test.tsx app/src/styles/components.css
git commit -m "Add HowToPlayModal component with full game rules"
```

---

## Task 2: `CopyRoomCodeButton` component

**Files:**
- Create: `app/src/components/CopyRoomCodeButton.tsx`
- Create: `app/src/components/CopyRoomCodeButton.test.tsx`
- Modify: `app/src/styles/components.css` (append new rule to the existing `/* RoomLobbyScreen (Etap 6) */` section)

**Interfaces:**
- Produces: `CopyRoomCodeButton({ roomId: string })` — default export. Renders a `<button type="button" className="copy-room-code-button">` whose label is `"Kopiuj kod"` by default, switches to `"Skopiowano!"` for 1500ms after a successful `navigator.clipboard.writeText(roomId)` call, then reverts.

- [ ] **Step 1: Write the failing test**

Create `app/src/components/CopyRoomCodeButton.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CopyRoomCodeButton from './CopyRoomCodeButton';

describe('CopyRoomCodeButton', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('copies the room id to the clipboard when clicked', async () => {
    const user = userEvent.setup();
    render(<CopyRoomCodeButton roomId="AAAAA" />);

    await user.click(screen.getByRole('button', { name: 'Kopiuj kod' }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('AAAAA');
  });

  it('shows "Skopiowano!" after copying, then reverts after 1500ms', async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ delay: null });
    render(<CopyRoomCodeButton roomId="AAAAA" />);

    await user.click(screen.getByRole('button', { name: 'Kopiuj kod' }));
    expect(screen.getByRole('button', { name: 'Skopiowano!' })).toBeInTheDocument();

    vi.advanceTimersByTime(1500);

    expect(screen.getByRole('button', { name: 'Kopiuj kod' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/CopyRoomCodeButton.test.tsx` (from `app/`)
Expected: FAIL — `Failed to resolve import "./CopyRoomCodeButton"` (module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `app/src/components/CopyRoomCodeButton.tsx`:

```tsx
import { useState } from 'react';

interface CopyRoomCodeButtonProps {
  roomId: string;
}

const RESET_DELAY_MS = 1500;

function CopyRoomCodeButton({ roomId }: CopyRoomCodeButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = () => {
    navigator.clipboard.writeText(roomId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), RESET_DELAY_MS);
    });
  };

  return (
    <button type="button" className="copy-room-code-button" onClick={handleClick}>
      {copied ? 'Skopiowano!' : 'Kopiuj kod'}
    </button>
  );
}

export default CopyRoomCodeButton;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/CopyRoomCodeButton.test.tsx` (from `app/`)
Expected: PASS (2 tests).

- [ ] **Step 5: Add CSS**

In `app/src/styles/components.css`, find this exact existing block:

```css
.room-player-list li > span:last-child {
  margin-left: auto;
  color: var(--text-dim);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
}
```

Insert directly after it:

```css

.room-lobby-screen .copy-room-code-button {
  padding: 4px 10px;
  font-size: 11px;
  margin: 0;
}
```

- [ ] **Step 6: Re-run the test suite to confirm CSS changes didn't break anything**

Run: `npx vitest run src/components/CopyRoomCodeButton.test.tsx` (from `app/`)
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add app/src/components/CopyRoomCodeButton.tsx app/src/components/CopyRoomCodeButton.test.tsx app/src/styles/components.css
git commit -m "Add CopyRoomCodeButton component"
```

---

## Task 3: Wire "Jak grać?" into `StartScreen`

**Files:**
- Modify: `app/src/components/StartScreen.tsx`
- Modify: `app/src/components/StartScreen.test.tsx`
- Modify: `app/src/styles/components.css` (append new rule to the `/* StartScreen */` section)

**Interfaces:**
- Consumes: `HowToPlayModal` from Task 1 (`{ onClose: () => void }` prop, renders `role="dialog"` named `"Jak grać?"`, has a `"Zamknij"` button).
- No new interfaces produced — this task only wires an existing component into `StartScreen`'s local state.

- [ ] **Step 1: Write the failing tests**

In `app/src/components/StartScreen.test.tsx`, add two new `it` blocks at the end of the `describe('StartScreen', ...)` block, right before the final closing `});`:

```tsx
  it('opens the how-to-play modal when "Jak grać?" is clicked', async () => {
    const user = userEvent.setup();
    renderStartScreen();

    await user.click(screen.getByRole('button', { name: 'Jak grać?' }));

    expect(screen.getByRole('dialog', { name: 'Jak grać?' })).toBeInTheDocument();
  });

  it('closes the how-to-play modal when "Zamknij" is clicked', async () => {
    const user = userEvent.setup();
    renderStartScreen();

    await user.click(screen.getByRole('button', { name: 'Jak grać?' }));
    await user.click(screen.getByRole('button', { name: 'Zamknij' }));

    expect(screen.queryByRole('dialog', { name: 'Jak grać?' })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/StartScreen.test.tsx` (from `app/`)
Expected: FAIL — no element found with role `button` and name `Jak grać?` (button doesn't exist yet).

- [ ] **Step 3: Wire the button and modal into `StartScreen.tsx`**

Add the import at the top of `app/src/components/StartScreen.tsx`, alongside the other relative imports:

```tsx
import HowToPlayModal from './HowToPlayModal';
```

Add a new state declaration next to `showLocalForm`:

```tsx
  const [showLocalForm, setShowLocalForm] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
```

Change the returned JSX from:

```tsx
  return (
    <div className="start-screen">
      <img
        className="app-logo"
        src="/dice/logos/logo-bd2-2-header.png"
        alt="Bronx Dice"
      />
      {user && (
```

to:

```tsx
  return (
    <div className="start-screen">
      <img
        className="app-logo"
        src="/dice/logos/logo-bd2-2-header.png"
        alt="Bronx Dice"
      />
      <button
        type="button"
        className="how-to-play-button"
        onClick={() => setShowHowToPlay(true)}
      >
        Jak grać?
      </button>
      {user && (
```

Then find the exact end of the component (the closing of the `{showLocalForm && ( ... )}` block followed by the closing `</div>`):

```tsx
        </>
      )}
    </div>
  );
}

export default StartScreen;
```

and replace it with:

```tsx
        </>
      )}

      {showHowToPlay && (
        <HowToPlayModal onClose={() => setShowHowToPlay(false)} />
      )}
    </div>
  );
}

export default StartScreen;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/StartScreen.test.tsx` (from `app/`)
Expected: PASS (all tests in the file, including the 2 new ones).

- [ ] **Step 5: Add CSS**

In `app/src/styles/components.css`, find this exact block (the one added in Task 1, at the start of the `/* HowToPlayModal */` section):

```css
/* HowToPlayModal */
.how-to-play-overlay {
```

Insert a new rule directly before it (i.e. still inside/at the end of the `/* StartScreen */` section, before the `/* HowToPlayModal */` comment):

```css
.start-screen .how-to-play-button {
  align-self: flex-end;
  width: fit-content;
  background: var(--accent-blue-bg);
  color: var(--accent-blue);
  border: 1px solid var(--accent-blue);
  box-shadow: 0 0 10px var(--accent-blue-glow);
  padding: 8px 14px;
  margin-top: 0;
}

```

- [ ] **Step 6: Run the full app test suite**

Run: `npm test --workspace=app`
Expected: PASS (all tests, including `StartScreen.test.tsx`).

- [ ] **Step 7: Commit**

```bash
git add app/src/components/StartScreen.tsx app/src/components/StartScreen.test.tsx app/src/styles/components.css
git commit -m "Add Jak grac button and modal to StartScreen"
```

---

## Task 4: Wire copy-room-code button into `RoomLobbyScreen`

**Files:**
- Modify: `app/src/components/RoomLobbyScreen.tsx`
- Modify: `app/src/components/RoomLobbyScreen.test.tsx`
- Modify: `app/src/styles/components.css` (append new rule to the `/* RoomLobbyScreen (Etap 6) */` section)

**Interfaces:**
- Consumes: `CopyRoomCodeButton` from Task 2 (`{ roomId: string }` prop, renders `<button>` labeled `"Kopiuj kod"`).
- No new interfaces produced.

- [ ] **Step 1: Write the failing test**

In `app/src/components/RoomLobbyScreen.test.tsx`, add a new `it` block at the end of the `describe('RoomLobbyScreen', ...)` block, right before the final closing `});`:

```tsx
  it('renders a copy-room-code button next to the room heading', () => {
    render(<RoomLobbyScreen room={lobbyRoom()} roomId="AAAAA" ownUid="uid-1" onLeft={() => {}} />);
    expect(screen.getByRole('button', { name: 'Kopiuj kod' })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/RoomLobbyScreen.test.tsx` (from `app/`)
Expected: FAIL — no element found with role `button` and name `Kopiuj kod`.

- [ ] **Step 3: Wire the button into `RoomLobbyScreen.tsx`**

Add the import at the top of `app/src/components/RoomLobbyScreen.tsx`, alongside the other relative imports:

```tsx
import CopyRoomCodeButton from './CopyRoomCodeButton';
```

Change:

```tsx
    <div className="room-lobby-screen">
      <h1>Pokój {roomId}</h1>
```

to:

```tsx
    <div className="room-lobby-screen">
      <div className="room-code-row">
        <h1>Pokój {roomId}</h1>
        <CopyRoomCodeButton roomId={roomId} />
      </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/RoomLobbyScreen.test.tsx` (from `app/`)
Expected: PASS (all tests in the file, including the new one).

- [ ] **Step 5: Add CSS**

In `app/src/styles/components.css`, find this exact block (from the existing `/* RoomLobbyScreen (Etap 6) */` section):

```css
.room-lobby-screen .copy-room-code-button {
  padding: 4px 10px;
  font-size: 11px;
  margin: 0;
}
```

Insert directly after it:

```css

.room-lobby-screen .room-code-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.room-lobby-screen .room-code-row h1 {
  margin: 0;
}
```

- [ ] **Step 6: Run the full app test suite**

Run: `npm test --workspace=app`
Expected: PASS (all tests).

- [ ] **Step 7: Run the full build to type-check everything**

Run: `npm run build`
Expected: PASS — no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add app/src/components/RoomLobbyScreen.tsx app/src/components/RoomLobbyScreen.test.tsx app/src/styles/components.css
git commit -m "Add copy-room-code button to RoomLobbyScreen"
```
