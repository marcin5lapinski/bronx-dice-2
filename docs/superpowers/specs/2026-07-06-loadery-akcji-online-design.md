# Loadery przy akcjach online — design doc

Data: 2026-07-06

## Kontekst

Etap 8 dodał baner rozłączenia i podstawową responsywność, ale w trybie online nadal brakuje jakiegokolwiek wizualnego feedbacku podczas oczekiwania na odpowiedź Cloud Function (`rollDice`, `scoreCategory`, `createRoom`, `joinRoom`, `startGame`). Brak feedbacku przy rzucie kośćmi już spowodował realny bug (naprawiony osobno): użytkownik przy wolnym połączeniu klikał "Rzuć kośćmi" drugi raz, bo nic się nie działo wizualnie, co skutkowało utratą dodatkowego rzutu. Ten dokument opisuje spójny zestaw "loaderów" — wizualnych sygnałów oczekiwania — dla wszystkich akcji sieciowych w trybie online, w stylu spójnym z istniejącą neonowo-terminalową estetyką appki (`--accent-blue-glow` itd.).

Held-die (trzymanie kości) **celowo pozostaje bez loadera** — działa już optymistycznie (kość przełącza się wizualnie natychmiast, przed odpowiedzią serwera), więc dodatkowy loader byłby zbędny albo mylący.

## 1. Fundament wizualny (CSS)

Nowa klasa `.pending-glow` + `@keyframes pulse-glow` w `app/src/styles/theme.css` / `app/src/styles/components.css`:

- Pulsujące `box-shadow` w kolorze `--accent-blue-glow` (niebieski to już istniejący akcent "aktywny/wyróżniony" w appce — kolumna aktualnego gracza, focus itp. — więc semantycznie pasuje do "trwa akcja").
- Klasa nadpisuje domyślne przyciemnienie `button:disabled { opacity: 0.4 }` z powrotem na pełną nieprzezroczystość (`button.pending-glow:disabled { opacity: 1; }`), żeby pulsowanie było czytelne, a nie wyglądało jak zwykłe wyłączenie przycisku.
- Mały reużywalny komponent `InlineSpinner` (`app/src/components/InlineSpinner.tsx`) — czysto CSS-owy obracający się pierścień (`border` trick + `@keyframes spin`), używany w przyciskach "jednorazowych" akcji (create/join/start), gdzie sama poświata nie wystarcza bez zmiany tekstu.

## 2. Rzut kośćmi (`RollButton`)

- `RollButton` dostaje nowy opcjonalny prop `pending?: boolean` — gdy `true`, przycisk renderuje się z klasą `.pending-glow`.
- `OnlineGameScreen` przekazuje istniejący stan `rollPending` (dodany przy naprawie bugu z podwójnym rzutem) jako `pending` — zero nowej logiki stanu, tylko wizualne podłączenie już istniejącego mechanizmu ochrony przed podwójnym kliknięciem.
- Tryb lokalny (`GameScreen`) nie przekazuje `pending` (domyślnie `undefined`/`false`) — bez zmian wizualnych, bo tam wywołania są synchroniczne.

## 3. Wpisywanie wyniku (`ScoreBoard`)

- `ScoreBoard` dostaje nowy opcjonalny prop `pendingCategory?: ScoreCategory | null` (domyślnie `null` — tryb lokalny w ogóle go nie przekazuje).
- Kliknięta komórka (`category === pendingCategory`) renderuje się jako disabled `<button>` z klasą `.pending-glow` zamiast zwykłego klikalnego przycisku.
- Dopóki `pendingCategory` jest ustawiony, pozostałe kategorie tego samego gracza przestają być klikalne (`clickable = ... && pendingCategory === null`) — zapobiega równoległemu wysłaniu drugiego `scoreCategory` zanim pierwszy się zakończy. Te komórki chwilowo pokazują puste pole, dokładnie tak jak dziś wygląda "niekliknalna" kategoria (np. gdy nie jest Twoja tura) — brak nowego stanu wizualnego do zaprojektowania.
- `OnlineGameScreen` dostaje nowy stan `pendingScoreCategory: ScoreCategory | null`, ustawiany przed wywołaniem `scoreCategory(roomId, category)` i czyszczony w `.finally()` (ten sam wzorzec co `rollPending`).

## 4. Tworzenie / dołączanie do pokoju (`OnlineMenuScreen`)

- `submitting: boolean` zmienia się na `submitting: 'create' | 'join' | null`, żeby tylko klikany przycisk pokazywał stan ładowania — drugi przycisk zostaje po prostu przyciemniony (`disabled`), bez mylącego komunikatu dotyczącego innej akcji.
- Przycisk "Stwórz pokój" podczas `submitting === 'create'`: tekst zmienia się na "Tworzę pokój…" + `<InlineSpinner />` obok tekstu.
- Przycisk "Dołącz" podczas `submitting === 'join'`: tekst zmienia się na "Dołączam…" + `<InlineSpinner />`.

## 5. Start gry i ochrona przed podwójnym kliknięciem (`RoomLobbyScreen`)

`handleStart` dziś **nie ma żadnej ochrony przed podwójnym kliknięciem** — to ta sama klasa bugów co naprawiony wcześniej podwójny rzut kośćmi (brak stanu pending, przycisk pozostaje aktywny przez cały czas trwania wywołania `startGame`), tylko że jeszcze niezgłoszona. Naprawiamy to przy okazji tego samego zestawu zmian:

- Nowy stan `starting: boolean` w `RoomLobbyScreen`.
- `handleStart` na wejściu sprawdza `if (starting) return;`, ustawia `setStarting(true)`, i czyści w `.finally(() => setStarting(false))` — dokładnie ten sam wzorzec ochrony co `rollPending` w `OnlineGameScreen`.
- Przycisk "Rozpocznij grę" jest `disabled` gdy `starting`, tekst zmienia się na "Startuję…" + `<InlineSpinner />`.

## Poza zakresem (świadomie pomijane)

- **Held-die** — zostaje bez loadera (patrz Kontekst).
- **`setReady`/`leaveRoom`/`removeInactivePlayers`/`returnToLobby`** — te akcje nie zostały zgłoszone jako problem i nie dostają nowej ochrony/loadera w tym zadaniu, żeby nie rozszerzać zakresu poza to, o co poproszono.
- **Ujednolicenie stylu loadera globalnie poza online mode** — tryb lokalny/hot-seat pozostaje bez zmian (jest synchroniczny, nie ma czego "ładować").

## Testowanie

- `RollButton.test.tsx` — nowy test: `pending={true}` renderuje przycisk z klasą `.pending-glow`.
- `ScoreBoard.test.tsx` — nowy test: gdy `pendingCategory` wskazuje na konkretną kategorię, ta komórka ma klasę `.pending-glow` i jest `disabled`, a inne klikalne dotąd kategorie tego gracza przestają być klikalne.
- `OnlineGameScreen.test.tsx` — rozszerzenie istniejących testów o sprawdzenie, że `rollPending`/`pendingScoreCategory` przekładają się na odpowiednie propsy przekazywane do `RollButton`/`ScoreBoard`.
- `OnlineMenuScreen.test.tsx` — nowe testy: klik "Stwórz pokój" pokazuje "Tworzę pokój…" i blokuje oba przyciski; klik "Dołącz" analogicznie dla "Dołączam…".
- `RoomLobbyScreen.test.tsx` — nowy test: dwukrotne kliknięcie "Rozpocznij grę" przed odpowiedzią serwera wywołuje `startGame` tylko raz (mirror testu z `OnlineGameScreen` dla rzutu kośćmi).
- `InlineSpinner` — trywialny komponent prezentacyjny, bez dedykowanego testu jednostkowego (czysto CSS/markup, bez logiki).
