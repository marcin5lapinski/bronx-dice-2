# Bot gracza w grze lokalnej (Claude headless CLI)

## Cel

W trybie lokalnym (hotseat, na jednym urządzeniu) dowolny gracz może zostać
oznaczony jako bot. Bot gra autonomicznie, w tempie zbliżonym do człowieka
(rzut → namysł → decyzja → ...), i stara się grać optymalnie — wybierać
najlepsze dostępne opcje przy trzymaniu kości i punktowaniu. Decyzje bota
podejmuje Claude Code w trybie headless (`claude -p ...`), wywoływany jako
subproces przez mały lokalny serwer.

To funkcja **wyłącznie dla gry lokalnej** i **wyłącznie do użytku lokalnego
u dewelopera** — wymaga zainstalowanego i zalogowanego `claude` CLI na
maszynie, na której odpalona jest gra. Nie dotyczy trybu online i nigdy nie
trafia do hostowanej wersji produkcyjnej (patrz sekcja "Wdrożenie" niżej).

## Architektura

Trzy nowe/zmienione warstwy:

1. **`bot-server/`** — nowy workspace npm (obok `app`, `functions`,
   `packages/*`), mały serwer Node/Express uruchamiany lokalnie równolegle
   z `npm run dev`. Wystawia jeden endpoint (np. `POST /bot-move`), który:
   - przyjmuje gotowy, w pełni zbudowany prompt tekstowy,
   - odpala `claude -p "<prompt>"` w trybie headless/non-interactive jako
     subproces (dokładne flagi CLI, w tym format wyjścia JSON, do
     potwierdzenia przy implementacji przez `claude --help`),
   - parsuje JSON z odpowiedzi modelu,
   - zwraca go do klienta bez żadnej wiedzy o regułach gry (czysty
     "prompt in, JSON out" proxy),
   - ma timeout na subproces (np. 30-60s) — po przekroczeniu zwraca błąd.

2. **`app/src/bot/`** (nowy katalog) — logika po stronie klienta:
   - budowanie promptu z aktualnego `GameState` (patrz "Treść promptu"),
   - wywołanie `fetch` do `bot-server`,
   - walidacja odpowiedzi względem silnika (`canScoreCategory`, kształt
     `hold`),
   - heurystyczny fallback, gdy CLI/serwer zawiedzie lub odpowie czymś
     nielegalnym,
   - orchestracja timingu (patrz "Timing").

3. **`packages/game-engine` pozostaje bez zmian.** "Bycie botem" to czysto
   koncepcja UI — zbiór ID graczy-botów trzymany w `GameScreen`, a nie
   właściwość `GameState`/`Player`. Silnik zostaje pure, bez per-gracza
   specjalnych przypadków, zgodnie z konwencją opisaną w CLAUDE.md.

### Dlaczego cienki serwer, a nie gruby (z walidacją i retry po stronie serwera)

Rozważona i odrzucona alternatywa: serwer z własną kopią silnika, który sam
waliduje ruch i przy nielegalnej odpowiedzi dopytuje CLI jeszcze raz przed
oddaniem się heurystyce. Odrzucona na rzecz cienkiego serwera, bo:
- to hobbystyczna, czysto lokalna funkcja — prostota mostka i jedno źródło
  prawdy dla reguł (w `app/`, które i tak ma zaimportowany
  `@bronx-dice/game-engine`) są warte więcej niż odporność na rzadkie błędy
  modelu, którą i tak łapie heurystyka.

## Sekwencja tury bota

Gdy `currentPlayer` jest botem, nowy hook `useBotTurn` w `GameScreen`
przejmuje sterowanie i woła te same funkcje `turn.ts`, których używają
przyciski (`rollInTurn`, `toggleHeldDie`, `applyScore`) — z punktu widzenia
silnika bot "klika" dokładnie tak jak człowiek. Przez cały czas trwania tury
bota `DiceTray`/`RollButton`/`ScoreBoard` dostają `interactive={false}`
(dokładnie ten sam mechanizm co dziś w trybie online), więc nikt nie może
nic kliknąć za bota.

1. **Rzut** — bot zawsze wykonuje pierwszy rzut tury automatycznie
   (`rollInTurn`).
2. **Namysł + decyzja "rzucać dalej czy punktować"** — po ustaniu animacji
   rzutu (`ROLL_ANIMATION_MS`) hook buduje prompt typu "roll decision" i
   woła `bot-server`. Podczas oczekiwania widoczny jest wskaźnik "bot
   myśli" (np. `pending-glow` na `RollButton`, spójnie z istniejącym
   wzorcem `pending`/`pendingCategory`).
3. **Zastosowanie decyzji:**
   - "rzuć dalej z tym trzymaniem": hook ustawia całą maskę `heldDice` na
     raz (bot nie symuluje pojedynczych kliknięć), krótka pauza (300-500ms)
     żeby było widać zmianę, potem `rollInTurn`, powrót do kroku 2 — chyba
     że `rollsLeft` doszło do 0, wtedy pomijamy dalsze rzucanie i idziemy
     do kroku 4.
   - "punktuj teraz": przechodzimy do kroku 4.
4. **Namysł + wybór kategorii** — prompt typu "score decision", spośród
   kategorii legalnych teraz (`canScoreCategory`). Po odpowiedzi hook woła
   `applyScore(category)`, co w silniku automatycznie kończy turę
   (`nextTurn`).

### Timing "namysłu"

Docelowe okno decyzji to ok. 2.5s, a wywołanie CLI liczy się do niego:
jeśli CLI odpowie szybciej, hook czeka do ~2.5s zanim zastosuje wynik;
jeśli CLI jest wolniejsze, wynik pokazuje się od razu po odpowiedzi (bez
dodatkowej sztucznej pauzy). Dzięki temu tury bota trzymają się bliżej
tempa człowieka, niezależnie od realnej latencji CLI.

## Konfiguracja w StartScreen

- `PlayerNameRow` (`utils/playerOrder.ts`) zyskuje pole `isBot: boolean`
  (domyślnie `false`). `reorderNames`/`shufflePlayerOrder` przenoszą je
  razem z resztą wiersza bez zmian w logice.
- `PlayerRowField` dostaje checkbox "Bot" obok pola nazwy — **z wyjątkiem
  wiersza 0** (Twój śledzony slot, auto-wypełniany nickiem zalogowanego
  konta): tam checkbox się nie renderuje, bo Twój własny slot nigdy nie
  może być botem.
- `StartScreen.onStart` zmienia sygnaturę z
  `(playerNames: string[], accountPlayerIndex) => void` na
  `(players: { name: string; isBot: boolean }[], accountPlayerIndex) => void`.
  `App.tsx` (`Screen` union, wariant `local-game`) i `GameScreen` propsy
  aktualizują się analogicznie.
- W `GameScreen`: `createGameState` dalej dostaje samą tablicę imion
  (silnik się nie zmienia); `botPlayerIds: Set<string>` budujemy raz przy
  starcie, mapując po indeksie — `createGameState` przydziela ID
  deterministycznie jako `player-${index+1}`, więc `players[i].isBot`
  odpowiada 1:1 `state.players[i].id`.

## Wskaźniki podczas gry

- Nagłówek "Tura: {currentPlayer.name}" dostaje dopisek/ikonę, gdy
  aktualny gracz to bot (np. "Tura: Kuba 🤖").
- To samo oznaczenie w nagłówku kolumny `ScoreBoard`, żeby zawsze było
  widać, kto jest botem, nie tylko w danej turze.

## Statystyki konta

Bez zmian w `statsService`/`recordLocalGameResult` — skoro slot 0 (Twój
śledzony `accountPlayerIndex`) nigdy nie jest botem, istniejący mechanizm
działa dokładnie jak dziś, niezależnie ilu botów siedzi przy stole. Wynik
zalogowanego gracza zapisuje się normalnie, tak jak w każdej innej grze
lokalnej.

## Treść promptu i schemat odpowiedzi

Serwer jest "głupi", więc prompt musi być samowystarczalny — zawiera:

- Zwięzły opis reguł domowych na sztywno (bonus +50 przy sumie górnej
  sekcji ≥63, blokada dolnej sekcji do czasu wypełnienia górnej, podwojenie
  wyniku gdy kategoria jest punktowana przy `rollsLeft === 2` [zaraz po
  pierwszym rzucie tury], yahtzee = suma oczek + 50 bonus, też podlega
  podwojeniu).
- Aktualne kości, maskę `held`, `rollsLeft`.
- Własną tablicę kart bota: listę otwartych kategorii wraz z
  `previewScore` — ile punktów dałoby wybranie danej kategorii **teraz**,
  tym samym mechanizmem co dzisiejsze lokalne `previewScore` w
  `ScoreBoard.tsx` (woła czysty `scoreCategory` z silnika na kopii karty).
  Model dostaje gotowe liczby zamiast liczyć kombinacje kości samodzielnie,
  co zmniejsza ryzyko błędu.
- Celowo **bez** kart pozostałych graczy w wersji 1 — nie zmienia to
  istotnie "optymalnego EV" wyboru, a upraszcza prompt (YAGNI; można
  dorzucić później, jeśli okaże się potrzebne).

Dwa typy zapytań do `bot-server`:

1. Po każdym rzucie, gdy `rollsLeft > 0` ("roll decision"): oczekiwana
   odpowiedź to `{"action":"reroll","hold":[bool×5]}` albo
   `{"action":"score","category":"..."}`.
2. Gdy `rollsLeft === 0` ("score decision", ostatni rzut wykonany):
   wymuszony wybór `{"category":"..."}` spośród kategorii legalnych teraz.

## Obsługa błędów i fallback

Na dowolnym etapie: błąd sieci/serwera, timeout CLI, niesparsowalny JSON,
albo odpowiedź wskazująca nielegalny ruch (kategoria już zajęta/zablokowana,
zła długość `hold`) → heurystyka:

- w kroku "roll decision" → traktuj jak "zatrzymaj się i punktuj" (zawsze
  bezpieczne, bo pierwszy rzut w turze już się odbył),
- w kroku "score decision" → wybierz kategorię o najwyższym `previewScore`
  spośród aktualnie legalnych.

Ta sama funkcja heurystyki jest używana w obu miejscach (różni się tylko
zbiorem kategorii do przejrzenia).

## Testowanie

- `app/src/bot/*.test.ts` — czysto jednostkowe: budowanie promptu z
  fixture'a `GameState` (czy zawiera właściwe `previewScore` i otwarte
  kategorie), walidacja/parsowanie odpowiedzi (poprawne/niepoprawne JSON,
  nielegalny ruch), heurystyka fallback (zawsze zwraca legalną kategorię o
  max `previewScore`).
- `useBotTurn` (hook) — zamockowany klient bota (analogicznie do
  dzisiejszego mockowania `services/roomService` w testach komponentów):
  pełna sekwencja rzut→hold→rzut→punktacja, oraz scenariusz błędu/nielegalnej
  odpowiedzi → ścieżka heurystyki zamiast zawieszenia gry.
- `StartScreen.test.tsx` — checkbox "Bot" widoczny dla wierszy >0, ukryty
  dla wiersza 0; `onStart` przekazuje poprawne flagi `isBot`.
- `GameScreen` — `interactive={false}` na wszystkich trzech komponentach i
  wskaźnik bota widoczny podczas tury bota.
- `bot-server` — testy z zamockowanym `child_process` (bez realnego
  wywołania `claude` w automatyce — zbyt wolne, niedeterministyczne,
  wymaga zalogowanego CLI). Realne end-to-end sprawdzenie z prawdziwym
  `claude` CLI jest manualne, lokalne, poza zakresem zautomatyzowanych
  testów.

## Wdrożenie

`bot-server` to nowy workspace, którego istniejący `deploy` (obecnie tylko
`firebase deploy --only hosting`) nigdy nie dotyka — funkcja z założenia
działa tylko lokalnie u dewelopera, nie w hostowanej wersji produkcyjnej.

## Poza zakresem (YAGNI)

- Karty pozostałych graczy w prompcie (patrz wyżej).
- Tryb online z botami — funkcja jest wyłącznie dla gry lokalnej.
- Retry/dopytywanie CLI po nielegalnej odpowiedzi po stronie serwera
  (rozważone i odrzucone — patrz "Dlaczego cienki serwer").
- Konfigurowalny poziom trudności bota — bot zawsze celuje w najlepszą
  dostępną opcję.
