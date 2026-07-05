# Etap 7 — Statystyki graczy — design doc

Data: 2026-07-05

## Kontekst

Etapy 1–6 są ukończone i zmergowane do `master`: parametryzowany silnik gry (`packages/game-engine/`), tryb lokalny hot-seat, oprawa wizualna, uwierzytelnianie (Firebase Auth + profil w `users/{uid}`), oraz pełny tryb online (Firestore + Cloud Functions jako jedyna droga zmiany stanu pokoju, UI lobby/rozgrywki na żywo). Po Etapie 6 dodano też ponad plan: obsługę obecności graczy (heartbeat), możliwość usuwania nieaktywnych graczy i przerywania rozgrywki przez hosta, oraz zostawanie w tym samym pokoju po zakończonej grze.

Etap 7 (opcjonalny wg roadmapy, ale realizowany na życzenie) dodaje **statystyki gracza**: osobno dla trybu lokalnego i online, każda z liczbą gier, liczbą wygranych, średnią punktów oraz historią ostatnich wyników. Statystyki dotyczą wyłącznie zalogowanego konta — tryb lokalny nadal nie wymaga logowania, ale bez konta jego wyniki po prostu nie są nigdzie zapisywane.

## Kluczowy problem: atrybucja gry lokalnej do konta

Gra lokalna (hot-seat) nie ma pojęcia kont — gracze to tylko wpisane na starcie nazwy, a `Player.id` w `GameState` to syntetyczne `player-1`, `player-2`, ... Żeby zapisać "Twój" wynik z gry lokalnej, trzeba wiedzieć, który z wpisanych graczy to Ty.

**Rozwiązanie:** `StartScreen` już dziś auto-uzupełnia pierwszy wiersz (`Gracz 1`) nazwą wyświetlaną z profilu, gdy jesteś zalogowany (istniejąca funkcja z Etapu 4/6). Dodajemy nowy, trwały znacznik `accountRowId` — `id` tego wiersza, ustawiany raz przy pierwszym pojawieniu się `user`+`profile` i **niezależny** od późniejszej edycji nazwy (w odróżnieniu od istniejącego `syncedRowId`, który celowo zeruje się po edycji, żeby przestać nadpisywać wpisaną nazwę). `accountRowId` jest śledzony przez cały przepływ startu gry — również przez "Losuj kolejność" (Fisher–Yates shuffle działa na wierszach z `id`, nie na gołych stringach, więc tożsamość przetrwa przetasowanie).

`onStart` (StartScreen → App.tsx → GameScreen) dostaje dodatkowy parametr `accountPlayerIndex: number | null` — indeks w finalnej (ew. przetasowanej) tablicy graczy, który odpowiada Twojemu kontu, albo `null` jeśli nie byłeś zalogowany przy starcie gry.

## Model danych (Firestore)

Dwie równoległe struktury, w tym samym kształcie, dla lokalnych i online:

```
users/{uid}                          — istniejący dokument profilu (Etap 4), rozszerzony o:
  localStats:  { gamesPlayed: number, wins: number, totalScore: number }
  onlineStats: { gamesPlayed: number, wins: number, totalScore: number }

users/{uid}/localGames/{gameId}      — jeden dokument na zakończoną grę lokalną
  { score: number, won: boolean, playedAt: Timestamp }

users/{uid}/onlineGames/{gameId}     — jeden dokument na zakończoną grę online
  { score: number, won: boolean, playedAt: Timestamp }
```

- **Liczba gier / wygrane** — czytane wprost z `localStats`/`onlineStats` na dokumencie `users/{uid}` (jeden odczyt, bez przeliczania). Aktualizowane atomowo przez `increment()` przy każdym zakończeniu gry.
- **Średnia punktów** — liczona w locie jako `totalScore / gamesPlayed` przy wyświetlaniu (nic nie jest przechowywane osobno, brak ryzyka rozjazdu).
- **Historia wyników** — zapytanie do podkolekcji, `orderBy('playedAt', 'desc').limit(20)`. Bez TTL/czyszczenia — Firestore kosztuje za odczyt, nie za przechowywanie, więc kolekcja może rosnąć bez ograniczeń, a limit działa tylko na wyświetlanie.
- **Remis liczy się jako wygrana** dla każdego remisującego gracza — spójne z istniejącym `getWinners()`, który już zwraca wszystkich remisujących jako zwycięzców.
- **Gra przerwana się nie liczy.** Jedyne ścieżki, które ustawiają `phase: 'finished'`, to dokończenie ostatniej kategorii (`scoreCategory`) i wymuszone zero po timeoucie (`handleTurnTimeout`) — obie już istnieją z Etapu 6. `returnToLobby` (przerwanie rozgrywki przez hosta, dodane po Etapie 6) nigdy nie ustawia `'finished'`, więc przerwane gry nigdy nie trafiają do statystyk. To samo dotyczy gry lokalnej porzuconej przez przycisk "Wyjdź z gry" — licznik zapisuje się tylko przy faktycznym dojściu do ekranu zwycięzcy.

## Przepływ zapisu

### Gra lokalna (klient, best-effort)

1. `GameScreen` dostaje `accountPlayerIndex: number | null` jako prop.
2. Gdy `isGameOver(state)` staje się `true` i `accountPlayerIndex !== null` i użytkownik jest zalogowany (`useAuth()`), `GameScreen` w tle (bez blokowania UI) liczy `score = calculateTotal(state.scoreCards[playerId])` i `won = getWinners(state).some(w => w.id === playerId)` — obie funkcje już istnieją w silniku, bez zmian.
3. Nowy `statsService.recordLocalGameResult(uid, { score, won })` wykonuje dwa zapisy do Firestore (nie w transakcji — świadome uproszczenie, patrz "Poza zakresem"): `updateDoc` z `increment()` na `users/{uid}` (pola `localStats.*`) i `addDoc` do `users/{uid}/localGames`.
4. Błąd zapisu (np. offline) jest cicho połykany — nie przerywa ani nie opóźnia rozgrywki/ekranu zwycięzcy.

### Gra online (Cloud Functions, autorytatywnie)

1. Dokładnie w momencie, gdy `scoreCategoryHandler` lub `handleTurnTimeoutHandler` (obie w `functions/src/rooms/`) obliczają `phase = isGameOver(next) ? 'finished' : 'playing'` i `phase === 'finished'`, ta sama transakcja Firestore, która zapisuje przejście pokoju do `'finished'`, dopisuje też wynik dla **każdego** gracza z `next.players` (nie tylko wywołującego).
2. Nowa funkcja pomocnicza `functions/src/stats/recordGameResults.ts` — `recordGameResults(tx, players, scoreCards, now)` — dla każdego gracza robi `tx.update` z `increment()` na `users/{uid}` (`onlineStats.*`) i `tx.set` nowego dokumentu w `users/{uid}/onlineGames`.
3. Ponieważ to jedna transakcja Admin SDK, zapis stanu pokoju i zapis statystyk commitują się razem albo wcale — pełna atomowość, w odróżnieniu od ścieżki lokalnej.

## Reguły bezpieczeństwa Firestore

```
match /users/{uid} {
  allow read, write: if request.auth != null && request.auth.uid == uid;

  match /localGames/{gameId} {
    allow read, write: if request.auth != null && request.auth.uid == uid;
  }
  match /onlineGames/{gameId} {
    allow read: if request.auth != null && request.auth.uid == uid;
    allow write: if false;
  }
}
```

`localGames` jest w pełni zaufane klientowi — spójne z tym, że cały tryb lokalny od zawsze ufa klientowi (własny `Math.random`, brak walidacji serwera). `onlineGames` jest zapisywane wyłącznie przez Cloud Functions (Admin SDK omija reguły), klient ma tylko odczyt własnych danych — spójne z modelem `rooms/{roomId}`.

## UI i nawigacja

- Nowy przycisk **"Statystyki"** w `ProfileScreen`, obok istniejących "Edytuj profil"/"Wyloguj"/"Wstecz" — przełącza na trzeci wewnętrzny podwidok (ten sam wzorzec co istniejące przełączanie widok/edycja), bez zmian w routingu `App.tsx`.
- Nowy komponent `StatsScreen`, renderowany przez `ProfileScreen` w trybie "stats": dwie sekcje jedna pod drugą, **"Lokalne"** i **"Online"**, każda pokazuje liczbę gier, liczbę wygranych, średnią punktów oraz listę ostatnich wyników (data + wynik + wygrana/przegrana). Dane pobierane przy wejściu na ekran przez `statsService.getStats(uid, mode)`.
- Przycisk "Wstecz" wraca do widoku profilu.
- Zero zmian w `packages/game-engine` — `calculateTotal`/`getWinners` już istnieją i są reużywane bez modyfikacji zarówno przez klienta (lokalnie), jak i Cloud Functions (online).

## Testowanie

- `app/src/utils/playerOrder.ts`: generifikacja `shufflePlayerOrder<T>` — istniejące testy (operujące na `string[]`) przechodzą bez zmian, nowe testy sprawdzają zachowanie na `PlayerNameRow[]`.
- `app/src/components/StartScreen.test.tsx`: nowe testy na `accountPlayerIndex` — stabilność przy edycji nazwy, przy zmianie liczby graczy, przy "Losuj kolejność"; `null` gdy niezalogowany.
- `app/src/components/GameScreen.test.tsx`: nowy test — zalogowany użytkownik z `accountPlayerIndex` wywołuje zapis wyniku po zakończeniu gry; niezalogowany lub `accountPlayerIndex=null` nie wywołuje niczego.
- `app/src/services/statsService.test.ts` (nowy): testy `recordLocalGameResult`/`getStats` z mockowanym Firestore SDK (wzorzec z `profileService`/`roomService`).
- `functions/src/stats/recordGameResults.test.ts` (nowy): testy jednostkowe na fake-transaction (wzorzec z istniejących testów `functions/src/rooms/*.test.ts`) — poprawne `increment()`, poprawny zapis historii dla wielu graczy, brak wywołania gdy `phase !== 'finished'`.
- `functions/src/rooms/scoreCategory.test.ts` / `handleTurnTimeout.test.ts`: rozszerzenie istniejących testów "sets phase to finished..." o asercję, że `recordGameResults` zostało wywołane.
- `firestore.rules` — rozszerzenie istniejących testów reguł (`app/src/**/*.rules.test.ts` lub odpowiednik z Etapu 5, `npm run test:rules`) o nowe podkolekcje.

## Poza zakresem (świadomie pomijane)

- Transakcyjna spójność zapisu lokalnych statystyk (dwa osobne wywołania Firestore, nie jedna transakcja) — akceptowalne ryzyko dla statystyk "dla siebie", nie rankingu konkurencyjnego.
- Walidacja serwera dla wyników lokalnych (klient mógłby teoretycznie sfałszować własne statystyki lokalne) — spójne z tym, że tryb lokalny nigdy nie miał żadnej ochrony przed oszukiwaniem.
- Czyszczenie/TTL historii wyników — kolekcja rośnie bez ograniczeń, limit dotyczy tylko wyświetlania.
- Statystyki per-kategoria (np. średni wynik w "Full") albo pełne karty wyników z historii — tylko zagregowany wynik końcowy gry.
- Ranking / porównywanie graczy między sobą — statystyki są prywatne, widoczne tylko dla właściciela konta.
- Statystyki dla graczy hot-seat innych niż zalogowany właściciel urządzenia (np. "Gracz 2" nie ma konta w tym kontekście).
