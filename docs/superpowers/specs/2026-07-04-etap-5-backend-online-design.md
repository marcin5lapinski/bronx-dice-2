# Etap 5 — Backend Firebase pod rozgrywkę online — design doc

Data: 2026-07-04

## Kontekst

Etapy 1–4 są ukończone i zmergowane do `master`: parametryzowany silnik gry (`app/src/engine/`), tryb lokalny hot-seat, oprawa wizualna "Electric HUD", uwierzytelnianie (Firebase Auth) i profil gracza (`users/{uid}` w Firestore, projekt Firebase `bronx-dice-v2` z Emulator Suite już skonfigurowany).

Etap 5 dodaje **backend rozgrywki online**: Firestore jako źródło stanu pokoju gry, Cloud Functions jako jedyną drogę zmiany tego stanu, i Security Rules blokujące bezpośredni zapis z klienta. To etap czysto backendowy — **żadnego UI lobby/rozgrywki online** (to Etap 6). Weryfikacja odbywa się przez testy jednostkowe/integracyjne i ręczne wywołania funkcji z Emulator Suite, nie przez nowy ekran w aplikacji.

## Architektura: npm workspaces i wspólny silnik

Repo staje się npm workspace z trzema pakietami:

```
package.json                 — root, "workspaces": ["app", "functions", "packages/*"]
packages/game-engine/         — przeniesiona zawartość app/src/engine/ + app/src/types/game.ts
  src/
    dice.ts, scoreCard.ts, gameState.ts, turn.ts, scoring/upperSection.ts, scoring/combinations.ts
    types/game.ts
  package.json                — nazwa "@bronx-dice/game-engine"
app/                           — bez zmian w strukturze, importuje z "@bronx-dice/game-engine"
                                 zamiast "../engine"/"../types/game"
functions/                     — nowy pakiet Cloud Functions (Node 20, TypeScript)
  src/
    index.ts                  — eksport onCall wrapperów
    errors.ts                 — fabryki HttpsError z polskimi komunikatami
    rooms/
      roomCode.ts              — generateRoomCode(random?)
      createRoom.ts / joinRoom.ts / startGame.ts / rollDice.ts /
      toggleHeldDie.ts / scoreCategory.ts / leaveRoom.ts
      types.ts                 — RoomPlayer, RoomDocument
  package.json                — zależy od "@bronx-dice/game-engine"
```

Przenosiny silnika do `packages/game-engine` to **czysty przenos plików + jeden drobny, zgodny wstecz refaktor**: `createGameState(playerNames: string[])` w `gameState.ts` jest rozbijane na dwie funkcje —

```ts
export function createGameState(playerNames: string[]): GameState {
  const players = playerNames.map((name, index) => createPlayer(`player-${index + 1}`, name));
  return createGameStateFromPlayers(players);
}

export function createGameStateFromPlayers(players: Player[]): GameState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`Player count must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}, got ${players.length}`);
  }
  const scoreCards: GameState['scoreCards'] = {};
  for (const player of players) {
    scoreCards[player.id] = createEmptyScoreCard();
  }
  return { players, scoreCards, dice: createEmptyDice(), heldDice: [false, false, false, false, false], rollsLeft: MAX_ROLLS, currentPlayerIndex: 0 };
}
```

Tryb lokalny (`createGameState(names)`) zachowuje się identycznie i jego istniejące testy przechodzą bez zmian. `createGameStateFromPlayers` jest tym, czego potrzebuje `startGame` w Cloud Functions — bo online gracz ma `Player.id` równe jego Firebase `uid` (nie wygenerowane `player-1`, `player-2`...), więc nie może przejść przez `createGameState(names)`.

Cała reszta silnika (`rollInTurn`, `toggleHeldDie`, `applyScore`, `isGameOver`, `getWinners`, `canScoreCategory`, ...) jest używana przez Cloud Functions bez żadnych zmian — to właśnie ich sparametryzowana, bezstanowa natura z Etapu 1 czyni je bezpośrednio nadającymi się do współdzielenia klient/serwer.

## Model danych (Firestore)

```ts
// functions/src/rooms/types.ts (re-eksportowane do testów jednostkowych w functions/)
interface RoomPlayer extends Player {   // z @bronx-dice/game-engine: { id: string; name: string }
  avatarId: string;
}

interface RoomBase {
  hostId: string;        // uid hosta; zawsze równy id jednego z RoomPlayer
  maxPlayers: number;    // 2-6, ustalone przy createRoom
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

type RoomDocument =
  | (RoomBase & { phase: 'lobby'; players: RoomPlayer[] })
  | (RoomBase & { phase: 'playing' | 'finished' } & GameState);
  // GameState = { players, scoreCards, dice, heldDice, rollsLeft, currentPlayerIndex }
  // GameState.players jest typu Player[]; w praktyce zawiera obiekty RoomPlayer
  // (RoomPlayer strukturalnie rozszerza Player), więc pole "players" istnieje
  // dokładnie raz w każdej z dwóch wersji dokumentu, tylko z węższym typem w fazie lobby.
```

Kolekcja: `rooms/{roomId}`. `roomId` to **5-znakowy kod pokoju** (alfabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789` — bez mylących `0/O/1/I/L`), generowany przez `generateRoomCode(random?)` w `createRoom` i użyty wprost jako ID dokumentu. Kolizja przy tworzeniu: do 5 prób generowania + sprawdzenia `exists()`, po wyczerpaniu prób — `internal` `HttpsError` (w praktyce nieosiągalne przy tej przestrzeni kodów i skali gry towarzyskiej).

`RoomPlayer` strukturalnie spełnia interfejs `Player` z silnika (ma dodatkowe pole `avatarId`, którego silnik nie zna i nie potrzebuje) — dzięki temu `room.players` można przekazać bezpośrednio do `applyScore`, `rollInTurn`, `isGameOver`, `getWinners` bez mapowania.

## Cloud Functions

Wszystkie funkcje to **callable (Functions v2, `onCall`, Node 20)**, wymagają `request.auth` (brak ⇒ `unauthenticated`). Każda mutująca funkcja działa w `db.runTransaction(...)`: świeży odczyt dokumentu → walidacja → wyliczenie nowego stanu przez czystą funkcję z `@bronx-dice/game-engine` → zapis. To eliminuje race'y (np. dwa równoczesne `rollDice`, dwóch graczy zajmujących ostatnie miejsce).

| Funkcja | Wejście | Walidacja i logika | Błędy (`HttpsError` code) |
|---|---|---|---|
| `createRoom` | `{ maxPlayers: number }` (2–6) | Czyta `users/{uid}` (musi istnieć); generuje unikalny `roomId`; zapisuje `phase:'lobby'`, `hostId=uid`, `players=[{id:uid, name:profile.displayName, avatarId:profile.avatarId}]` | `failed-precondition` (brak profilu), `invalid-argument` (maxPlayers poza 2–6) |
| `joinRoom` | `{ roomId }` | `phase==='lobby'`; jeśli `uid` już w `players` → no-op (idempotentne, obsługuje odświeżenie karty); jeśli pełny → błąd; inaczej dopisuje `RoomPlayer` z profilu | `not-found`, `failed-precondition` (pełny lub już wystartowany) |
| `startGame` | `{ roomId }` | tylko `uid===hostId`; `phase==='lobby'`; `players.length>=2` → `createGameStateFromPlayers(players)`, `phase:'playing'` | `permission-denied` (nie host), `failed-precondition` (za mało graczy / zła faza) |
| `rollDice` | `{ roomId }` | `phase==='playing'`; `uid===players[currentPlayerIndex].id`; `rollsLeft>0` → `rollInTurn(state)` (prawdziwy `Math.random`, losowanie po stronie serwera zgodnie z roadmapą) | `permission-denied` (nie twoja tura), `failed-precondition` (brak rzutów) |
| `toggleHeldDie` | `{ roomId, dieIndex: 0-4 }` | jw. + `dice.length===5` (kości już rzucone) → `toggleHeldDie(state, dieIndex)` | `permission-denied`, `failed-precondition`, `invalid-argument` (zły indeks) |
| `scoreCategory` | `{ roomId, category: ScoreCategory }` | jw. + `canScoreCategory(scoreCard, category)` → `applyScore(state, category)`; jeśli `isGameOver(next)` ⇒ `phase:'finished'`, inaczej zostaje `'playing'` | `permission-denied`, `failed-precondition` (kategoria niedostępna / złe dane) |
| `leaveRoom` | `{ roomId }` | tylko `phase==='lobby'`; usuwa `uid` z `players`; jeśli to był host → hostem zostaje pierwszy pozostały gracz; jeśli lista pusta → dokument pokoju jest usuwany; jeśli `uid` nie było w pokoju → no-op | `failed-precondition` (poza fazą lobby) |

**Obsługa błędów:** `functions/src/errors.ts` eksportuje małe fabryki (`notFound()`, `notYourTurn()`, `roomFull()`, ...) zwracające `HttpsError` z polskim `message` — ten sam duch co `authErrorMessage` z Etapu 4, ale tu wiadomość jedzie wprost w `HttpsError.message` (Etap 6 wyświetli ją bez własnego mapowania kodów).

**Struktura pliku per funkcja** (pod testy jednostkowe): każdy plik w `rooms/` eksportuje czysty `xHandler(tx, roomRef, uid, ...inne argumenty)`, operujący na obiekcie transakcji (`tx.get`, `tx.set`/`tx.update`) — to jest jednostka testowana z zamockowanym `firebase-admin/firestore`. `functions/src/index.ts` zawiera tylko cienkie `onCall` wrappery: wyciągają `uid` z `request.auth`, otwierają `db.runTransaction`, wołają handler.

## Firestore Security Rules

Rozszerzenie `app/firestore.rules` (reguła `users/{uid}` z Etapu 4 bez zmian):

```
match /rooms/{roomId} {
  allow read: if request.auth != null;
  allow write: if false; // wyłącznie przez Cloud Functions (Admin SDK omija Security Rules)
}
```

Każdy zalogowany użytkownik może odczytać dowolny pokój — kod pokoju sam w sobie jest sekretem potrzebnym do dołączenia, a klient i tak subskrybuje dokument przez `onSnapshot` po dołączeniu (Etap 6). Zapis jest całkowicie zablokowany dla klienta; jedyna droga zmiany stanu to wywołania Cloud Functions.

## Konfiguracja projektu

`app/firebase.json` zyskuje sekcję dla Functions i ich emulatora, obok istniejących `auth`/`firestore`:

```json
{
  "firestore": { "rules": "firestore.rules", "indexes": "firestore.indexes.json" },
  "functions": { "source": "../functions" },
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "functions": { "port": 5001 },
    "ui": { "enabled": true }
  }
}
```

`functions/` to osobny pakiet npm (workspace) z własnym `package.json`, `tsconfig.json` i `.oxlintrc.json` spójnym z `app/`.

## Testowanie

Dwie warstwy, zgodnie z decyzją podjętą podczas brainstormingu:

1. **Jednostkowe (`npm test` w `functions/`, szybkie, domyślne)** — po jednym pliku testowym na funkcję (`createRoom.test.ts`, `joinRoom.test.ts`, ...), z `firebase-admin/firestore` zamockowanym przez `vi.mock` (ten sam wzorzec co `app/src/services/profileService.test.ts` z Etapu 4). Sprawdzają: poprawność walidacji (kto/kiedy może wywołać), dokładny kształt zapisywanych danych, poprawne kody `HttpsError` dla każdej ścieżki błędu. `roomCode.test.ts` testuje `generateRoomCode` jako czystą funkcję (długość, alfabet, determinizm przy wstrzykniętym `random`).
2. **Integracyjne (`npm run test:integration` w `functions/`, wymaga Emulator Suite)** — uruchamiane przez `firebase emulators:exec --only firestore,auth "vitest run --config vitest.integration.config.ts"`. Jeden test przechodzi pełny cykl życia pokoju: `createRoom → joinRoom (drugi gracz) → startGame → rollDice → toggleHeldDie → scoreCategory (kilka kategorii, w tym ścieżka do `phase:'finished'`)`, wywołując handlery bezpośrednio przez `firebase-admin` podłączony do prawdziwego Firestore Emulatora — bez owijania w HTTP/callable transport, żeby nie komplikować testu.

Testy integracyjne nie wchodzą w skład domyślnego `npm test` (żeby nie wymagać emulatora do zwykłego uruchamiania testów silnika/komponentów), ale muszą przechodzić przed połączeniem brancha `etap-5-backend-online` z `master`.

## Zakres i granice

**W zakresie Etapu 5:**
- Restrukturyzacja repo do npm workspaces, wydzielenie `packages/game-engine`.
- Drobny, zgodny wstecz refaktor `gameState.ts` (`createGameStateFromPlayers`).
- Pakiet `functions/` z siedmioma Cloud Functions: `createRoom`, `joinRoom`, `startGame`, `rollDice`, `toggleHeldDie`, `scoreCategory`, `leaveRoom`.
- Model danych `rooms/{roomId}` w Firestore, generator kodów pokoi.
- Firestore Security Rules blokujące bezpośredni zapis do `rooms`.
- Testy jednostkowe (mockowany SDK) i integracyjne (Emulator Suite) dla wszystkich funkcji.
- Konfiguracja `firebase.json`/workspace pod lokalny dev i przyszły deploy.

**Poza zakresem Etapu 5:**
- Jakikolwiek UI lobby/rozgrywki online (ekran tworzenia/dołączania do pokoju, podpięcie `onSnapshot`, renderowanie stanu pokoju w istniejących komponentach gry) — to Etap 6.
- Obsługa rozłączenia i ponownego dołączenia gracza w trakcie gry (`leaveRoom` w fazie `'playing'`) — Etap 6.
- Sprzątanie/TTL porzuconych pokoi — świadomie odłożone (naturalnie pasuje do Etapu 8 albo do dodania później bez wpływu na ten projekt).
- Statystyki/historia gier — Etap 7 (opcjonalny).
- Rate limiting / ochrona przed nadużyciami wywołań Cloud Functions.
- Faktyczny deploy na produkcyjny projekt Firebase — ten etap zostawia to jako ręczny krok później (Etap 8), kod ma działać identycznie na emulatorze i w chmurze.

## Kolejne kroki

Po zatwierdzeniu tego dokumentu: szczegółowy plan implementacyjny (`writing-plans`) dla Etapu 5.
