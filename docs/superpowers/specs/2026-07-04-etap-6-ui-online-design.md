# Etap 6 — UI trybu online: lobby i rozgrywka na żywo — design doc

Data: 2026-07-04

## Kontekst

Etap 5 jest ukończony i zmergowany: Firestore (`rooms/{roomId}`) jako źródło stanu pokoju, siedem Cloud Functions (`createRoom`, `joinRoom`, `startGame`, `rollDice`, `toggleHeldDie`, `scoreCategory`, `leaveRoom`) jako jedyna droga zmiany tego stanu, Security Rules blokujące bezpośredni zapis z klienta. Backend nie ma żadnego UI — appka dziś przełącza się tylko między trybem lokalnym (`StartScreen` → `GameScreen`, stan w lokalnym `useState`) a ekranami logowania/profilu (`LoginScreen`/`RegisterScreen`/`ForgotPasswordScreen`/`ProfileSetupScreen`/`ProfileScreen`).

Etap 6 dodaje UI trybu online: tworzenie/dołączanie do pokoju, poczekalnię z ready-checkiem, i podpięcie istniejących komponentów gry (`DiceTray`/`RollButton`/`ScoreBoard`/`WinnerScreen`) do stanu z Firestore zamiast lokalnego stanu. Dorzuca też funkcję nieprzewidzianą w pierwotnej roadmapie: **limit czasu na turę**, wybierany przez hosta przy tworzeniu pokoju, z automatycznym wpisaniem zera po jego upłynięciu. Świadomie **nie budujemy** systemu obecności (kto jest online/offline) — to wymagałoby dodatkowej infrastruktury (np. Realtime Database presence) poza zakresem tego etapu; obsługa "rozłączenia" ogranicza się do płynnego powrotu gracza do trwającej gry po odświeżeniu strony.

## Model danych (Firestore) — rozszerzenie z Etapu 5

```ts
// functions/src/rooms/types.ts
export interface RoomPlayer extends Player {   // z @bronx-dice/game-engine: { id, name }
  avatarId: string;
  ready: boolean;               // NOWE — ready-check w poczekalni
}

interface RoomBase {
  hostId: string;
  maxPlayers: number;
  turnTimeLimitSeconds: 15 | 30 | 45 | 60;   // NOWE — ustalone przy createRoom, stałe przez cały czas trwania pokoju
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type RoomDocument =
  | (RoomBase & { phase: 'lobby'; players: RoomPlayer[] })
  | (RoomBase & { phase: 'playing' | 'finished' } & GameState & { turnStartedAt: Timestamp });
  // turnStartedAt: NOWE — moment rozpoczęcia aktualnej tury, używany do liczenia limitu czasu
```

`GameState.players` jest typu `Player[]`, ale ponieważ `RoomPlayer` strukturalnie rozszerza `Player`, pola `avatarId`/`ready` fizycznie przechodzą przez `createGameStateFromPlayers` bez zmian w silniku (dokładnie jak w Etapie 5) — klient odczytuje je przez rzutowanie na `RoomPlayer[]`.

## Zmiany w `packages/game-engine`

Dwie nowe, czyste funkcje — logika "wymuszonego zera" jest regułą gry (co wolno wpisać i gdzie), nie infrastrukturą Firebase, więc żyje w silniku, tak jak reszta reguł punktacji:

- **`findNextScorableCategory(scoreCard: PlayerScoreCard): ScoreCategory`** (`scoreCard.ts`) — zwraca pierwszą kategorię od góry, którą można teraz wypełnić: pierwszą `null` z `UPPER_CATEGORIES`, a dopiero gdy górna sekcja jest w pełni wypełniona, pierwszą `null` z `LOWER_CATEGORIES` (ta sama blokada co `canScoreCategory`).
- **`applyTimeoutScore(state: GameState, category: ScoreCategory): GameState`** (`turn.ts`) — odpowiednik `applyScore`, ale zapisuje literalne `0` w danej kategorii (bez przeliczania z kości, bez podwojenia przy `rollsLeft === 2`, bez bonusu za Yahtzee — bo to nie jest naturalny wynik rzutu), po czym woła `nextTurn` tak jak `applyScore`.

Zero rule change dla trybu lokalnego i istniejących kategorii punktacji — to czysto dodatkowe funkcje.

## Zmiany w `functions/`

**Istniejące funkcje:**
- `createRoomHandler` — przyjmuje dodatkowy parametr `turnTimeLimitSeconds`; waliduje że to jedna z wartości `{15, 30, 45, 60}` (`invalidArgument` inaczej); host zapisany z `ready: false`.
- `joinRoomHandler` — nowy gracz dołącza z `ready: false`.
- `startGameHandler` — dodatkowy warunek przed startem: `room.players.every(p => p.ready)` (inaczej `failedPrecondition`, komunikat np. "Nie wszyscy gracze są gotowi."); przy zapisie startu dopisuje `turnStartedAt: now()`.
- `scoreCategoryHandler` — po udanym zapisie (tura się zmienia przez `applyScore` → `nextTurn`) dopisuje `turnStartedAt: now()`.

**Nowe funkcje:**
- **`setReady`** — `onCall<{ roomId: string; ready: boolean }>`. W transakcji: `phase === 'lobby'` (inaczej `failedPrecondition`), wołający musi być na liście `players` (inaczej `notFound`/`permissionDenied`), aktualizuje `ready` tylko we własnym wpisie.
- **`handleTurnTimeout`** — `onCall<{ roomId: string }>`. Może wywołać dowolny gracz z pokoju, nie tylko aktualny (bo przy braku systemu obecności to dowolna otwarta karta wykrywa upływ czasu). W transakcji: `phase === 'playing'` (inaczej `failedPrecondition`); wołający musi być na liście `players` (inaczej `permissionDenied`); serwer sam przelicza `now() - turnStartedAt >= turnTimeLimitSeconds * 1000` i rzuca `failedPrecondition` jeśli czas jeszcze nie minął (klient traktuje to jako spodziewany wyścig i ignoruje błąd, bo zwykle oznacza, że inny klient już obsłużył ten timeout) — dopiero po weryfikacji serwerowej woła `findNextScorableCategory` + `applyTimeoutScore` na aktualnym graczu, zapisuje `turnStartedAt: now()` i `phase: 'finished'`, jeśli to była ostatnia kategoria.

**Security Rules:** bez zmian. Wszystkie nowe pola nadal piszą wyłącznie Cloud Functions przez Admin SDK; reguła `allow read: if request.auth != null; allow write: if false;` na `rooms/{roomId}` już to pokrywa.

## Nawigacja w `app/` (`App.tsx`)

Dziś `App.tsx` przełącza ekrany przez kilka niezależnych `useState` (`playerNames`, `authOpen`, `authScreen`). Dodanie trybu online zamiast kolejnych booleanów dostaje jeden typowany stan:

```ts
type Screen =
  | { kind: 'local-start' }
  | { kind: 'local-game'; playerNames: string[] }
  | { kind: 'auth'; screen: 'login' | 'register' | 'forgot-password' }
  | { kind: 'profile' }
  | { kind: 'online-menu' }
  | { kind: 'online-room'; roomId: string };
```

`online-room` obejmuje i lobby, i rozgrywkę, i ekran zwycięzcy jednocześnie — to, co się faktycznie renderuje, zależy od `room.phase` odczytanego przez `useRoom(roomId)`, nie od osobnego stanu w `App.tsx`.

**Persistencja i powrót do gry:** po wejściu do pokoju (`createRoom`/`joinRoom`) `roomId` jest zapisywany w `localStorage`. Przy starcie appki, jeśli użytkownik jest zalogowany i w `localStorage` jest zapisany `roomId`, `App.tsx` od razu ustawia `{ kind: 'online-room', roomId }` zamiast pokazywać menu. Jeśli `useRoom` zwróci "dokument nie istnieje" (pokój usunięty/nieprawidłowy), czyścimy `localStorage` i wracamy do `online-menu`.

## Nowe ekrany

- **`OnlineMenuScreen`** — widoczny tylko gdy `user && profile`. Trzy akcje: „Stwórz pokój" (formularz: liczba graczy 2–6, limit czasu na turę: 15/30/45/60 s), „Dołącz kodem" (pole tekstowe, normalizacja `trim().toUpperCase()` przed wywołaniem `joinRoom`), „Profil" (przejście do `ProfileScreen`).
- **`RoomLobbyScreen`** (renderowany gdy `room.phase === 'lobby'`) — lista graczy: avatar (`avatarSrc` z `avatarOptions.ts`) + nazwa + odznaka hosta; przycisk „Gotowy" / „Niegotowy" (woła `setReady`) dla własnego wiersza, statyczny checkmark dla pozostałych; „Rozpocznij grę" widoczny tylko dla hosta, aktywny gdy `players.length >= MIN_PLAYERS && players.every(p => p.ready)`; „Opuść pokój" (woła `leaveRoom`, czyści `localStorage`, wraca do `online-menu`).
- **`OnlineGameScreen`** (gdy `room.phase === 'playing'`) — reużywa `DiceTray`/`RollButton`/`ScoreBoard` zasilane stanem z Firestore zamiast lokalnego `useState`; nagłówek pokazuje, czyja jest tura (imię + avatar); widoczny odliczający licznik czasu tury.
- **finished** (gdy `room.phase === 'finished'`) — reużywa istniejący `WinnerScreen` bez zmian; `onPlayAgain` czyści `localStorage`, wraca do `online-menu` (bez wywołania backendu — `leaveRoom` odrzuca poza fazą `lobby`, a sprzątanie zakończonych pokoi jest świadomie poza zakresem, tak jak w Etapie 5).

## Gating akcji względem tury (zmiana w istniejących komponentach)

`ScoreBoard` dziś uznaje kolumnę gracza za klikalną, gdy `player.id === currentPlayerId` — w hot-seat to wystarcza, bo wszyscy gracze dzielą jedno urządzenie. Online każdy podłączony gracz widziałby przyciski aktywnego gracza jako klikalne, mimo że serwer i tak odrzuci wywołanie od niewłaściwego `uid` (`permissionDenied`) — myląca desynchronizacja UI/backendu.

Dodaję do `DiceTray`, `RollButton`, `ScoreBoard` opcjonalny prop `interactive?: boolean` (domyślnie `true`, więc lokalny `GameScreen` nie wymaga żadnej zmiany wywołania):
- `DiceTray`: `onClick`/`disabled` na kościach dodatkowo zależy od `interactive`.
- `RollButton`: przycisk dodatkowo `disabled` gdy `!interactive`.
- `ScoreBoard`: `clickable` dodatkowo wymaga `interactive`.

`OnlineGameScreen` przekazuje `interactive={ownUid === currentPlayerId}` do wszystkich trzech.

## Warstwa klienta

- **`firebase/client.ts`** — dodaję `getFunctions`/`connectFunctionsEmulator` (dziś eksportuje tylko `auth`/`db`), pod tym samym przełącznikiem `VITE_USE_FIREBASE_EMULATORS`.
- **`app/src/services/roomService.ts`** — cienki wrapper na `httpsCallable`: `createRoom`, `joinRoom`, `startGame`, `setReady`, `rollDice`, `toggleHeldDie`, `scoreCategory`, `leaveRoom`, `handleTurnTimeout`. Błędy przepuszczane jak są — `FirebaseError.message` już niesie gotowy polski komunikat z `functions/src/errors.ts`, więc (w przeciwieństwie do `authErrors.ts`) nie potrzeba osobnej tabeli tłumaczeń kodów.
- **`app/src/hooks/useRoom.ts`** — `onSnapshot(doc(db, 'rooms', roomId), ...)`, zwraca `{ room: RoomDocument | null; loading: boolean; notFound: boolean }`.
- **`app/src/hooks/useCountdown.ts`** — licznik `setInterval` co 1 s liczący `turnTimeLimitSeconds - (Date.now() - turnStartedAt.toMillis()) / 1000`; gdy dojdzie do 0, `OnlineGameScreen` woła `handleTurnTimeout` i po cichu ignoruje `failed-precondition` (spodziewany wyścig, gdy inny klient już obsłużył timeout).

## Testowanie

- **Silnik:** `findNextScorableCategory`/`applyTimeoutScore` — nowe przypadki w istniejących `scoreCard.test.ts`/`turn.test.ts`.
- **`functions/`:** nowe `setReady.test.ts`, `handleTurnTimeout.test.ts` na fałszywej transakcji (wzorzec z `joinRoom.test.ts`); aktualizacja istniejących testów (`createRoom.test.ts`, `joinRoom.test.ts`, `startGame.test.ts`, `scoreCategory.test.ts`) o pola `ready`/`turnTimeLimitSeconds`/`turnStartedAt`; rozszerzenie `rooms.integration.test.ts` (Etap 5, emulator) o pełny przepływ ready → start → timeout.
- **`app/`:** `roomService.test.ts` (mock `firebase/functions`, wzorzec z `profileService.test.ts`), `useRoom.test.ts`/`useCountdown.test.ts` (mock `onSnapshot`/timery), testy komponentów `OnlineMenuScreen`/`RoomLobbyScreen`/`OnlineGameScreen` z pragmą `// @vitest-environment jsdom`; dopisanie przypadków `interactive={false}` do istniejących `DiceTray.test.tsx`/`ScoreBoard.test.tsx`.

## Poza zakresem

- System obecności (online/offline) graczy.
- Rematch / tworzenie nowego pokoju z tych samych graczy jednym kliknięciem.
- Sprzątanie/TTL zakończonych lub porzuconych pokoi.
- Zmiana `turnTimeLimitSeconds` po utworzeniu pokoju (ustalany raz, przy `createRoom`).
- `leaveRoom` poza fazą `lobby` (dziedziczone ograniczenie z Etapu 5).
