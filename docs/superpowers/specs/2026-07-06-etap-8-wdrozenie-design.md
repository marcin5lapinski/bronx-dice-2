# Etap 8 — Wdrożenie i dopracowanie — design doc

Data: 2026-07-06

## Kontekst

Etapy 1–7 są ukończone i zmergowane do `master`: silnik gry, tryb lokalny hot-seat, oprawa wizualna, uwierzytelnianie, pełny tryb online (Firestore + Cloud Functions), oraz statystyki graczy. Aplikacja nigdy nie była wdrożona poza `npm run dev` / `vite preview` — `firebase.json` nie ma sekcji `hosting`, nie ma żadnego CI/CD, a responsywność jest szczątkowa (dwa `@media` w `app/src/styles/components.css`). Obsługa błędów sieci praktycznie nie istnieje: `useRoom.ts` woła `onSnapshot` bez callbacku błędu, nie ma `navigator.onLine`, nie ma banera stanu połączenia.

Etap 8 zamyka rdzeń projektu: hosting na Firebase, dopracowanie responsywności (priorytet: telefon), oraz obsługa rozłączeń/błędów sieci podczas gry online. **PWA i automatyzacja CI/CD są świadomie poza zakresem** (patrz "Poza zakresem") — zdecydowano to podczas brainstormingu, mimo że roadmapa wymieniała PWA jako opcję.

## 1. Firebase Hosting

- `firebase.json` dostaje sekcję `hosting`:
  ```json
  "hosting": {
    "public": "app/dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  }
  ```
- Ten sam projekt Firebase (`bronx-dice-v2`, już skonfigurowany w `.firebaserc`) — bez osobnego targetu/projektu dla produkcji vs. developmentu.
- Nowy skrypt w root `package.json`: `"deploy": "npm run build --workspace=app && firebase deploy --only hosting"`. Deploy pozostaje ręczny — uruchamiany świadomie przez dewelopera, bez GitHub Actions ani innej automatyzacji.
- Bez zmian w `vite.config.ts` — domyślny `base: '/'` już pasuje do Firebase Hosting serwującego z korzenia domeny.

## 2. Responsywność (priorytet: telefon)

Layout jest już w dużej mierze mobile-first: `#root { max-width: 640px }` w `theme.css` oznacza, że nawet desktop dostaje wąską, wyśrodkowaną kolumnę — więc to jest **audyt i punktowe poprawki**, nie przebudowa układu.

Zakres audytu (emulowana szerokość viewportu ~320–375px, najmniejsze popularne telefony):
- `StartScreen` — wiersze graczy z uchwytem drag & drop (`.player-row-handle`, dziś 32×32px — sprawdzić czy to wystarczający touch target i czy pole nazwy nie jest ściśnięte obok niego).
- `GameScreen` / `OnlineGameScreen` — `DiceTray` (5 kości + gap przy `--die-size: 48px` już blisko granicy 320px szerokości), przyciski hosta (`.host-presence-controls`, już `flex-wrap`).
- `ScoreBoard` — już ma `overflow-x: auto` przy `max-width: 480px`, do zweryfikowania czy to wystarcza przy najwęższych ekranach.
- `RoomLobbyScreen`, `OnlineMenuScreen` — listy graczy, formularze.
- `ProfileScreen` / `StatsScreen` — `.avatar-grid` ma sztywne 4 kolumny, do sprawdzenia czy nie jest za ciasno na 320px.
- Ekrany auth (`LoginScreen`, `RegisterScreen`, `ForgotPasswordScreen`, `ProfileSetupScreen`) — pola formularzy, już `width: 100%`.

Poprawki trafiają do istniejącego `app/src/styles/components.css` (kontynuacja istniejącej struktury z komentarzami per-sekcja), nowe/dostrojone `@media (max-width: ...)` bloki tam, gdzie audyt wykaże realny problem. Breakpointy `min-width: 640px` (tablet/desktop) nie są ruszane — już działają.

Weryfikacja manualna w przeglądarce (DevTools device toolbar lub `/verify`), bez nowych testów automatycznych dla CSS.

## 3. Obsługa rozłączeń i błędów sieci (banner + auto-reconnect)

### Zmiana w `useRoom.ts`

Rozszerzony zwracany kształt:
```ts
interface UseRoomResult {
  room: RoomDocument | null;
  loading: boolean;
  notFound: boolean;
  disconnected: boolean; // nowe
}
```

- `onSnapshot(doc(db, 'rooms', roomId), onNext, onError)` — dodany trzeci argument `onError`, ustawiający `connectionError: true` (Firestore SDK samo próbuje wznowić subskrypcję w tle; gdy się to uda, `onNext` znów zacznie strzelać i `onError`-owy stan trzeba wyzerować przy kolejnym udanym `onNext`).
- Nowy `useEffect` z `window.addEventListener('online', ...)` / `('offline', ...)`, inicjalizowany z `navigator.onLine`, ustawiający `offline: boolean`.
- `disconnected = connectionError || offline`.

### Nowy komponent `ConnectionBanner`

- `app/src/components/ConnectionBanner.tsx` — bezstanowy, przyjmuje `visible: boolean`, renderuje krótki pasek z tekstem "Utracono połączenie — próbuję ponownie…" gdy `visible`, inaczej `null`.
- Renderowany w `OnlineRoomScreen.tsx` **nad** aktualnym ekranem fazy (lobby/gra/wyniki) — niezależnie od tego, którą fazę `room.phase` aktualnie renderuje, więc gracz widzi go zawsze, także w poczekalni czy na ekranie wygranej.
- Projekt nie ma dziś koloru "warning" w `theme.css` (tylko `--accent-blue`/`--accent-green`). Dodajemy nowy token `--accent-warn: #ffb300` (bursztynowy, odróżnialny od istniejącego niebieskiego/zielonego) + `--accent-warn-glow: rgba(255, 179, 0, 0.6)`, w tym samym stylu co istniejące akcenty (cienki border + text-shadow/box-shadow glow), użyty wyłącznie przez `.connection-banner`.

### Świadomie poza zakresem tej sekcji

Błędy pojedynczych akcji zapisu (np. nieudany `rollDice` w `OnlineGameScreen.tsx`, dziś odpalany jako `void rollDice(roomId)` bez `.catch`) **nie są** naprawiane w tym etapie. Istniejący wzorzec `errorMessage()` + klasa CSS `.auth-error` (używany dziś dla `removeInactivePlayers`/`returnToLobby`) zostaje tak, jak jest — to osobny mechanizm od banera połączenia i nie zostało zgłoszone jako problem do rozwiązania teraz.

## 4. Testowanie

- `app/src/hooks/useRoom.test.ts` — nowe przypadki: `onSnapshot` zwraca błąd → `disconnected: true`; kolejny udany snapshot → `disconnected` wraca do `false`; symulacja zdarzeń `online`/`offline` na `window`.
- `app/src/components/ConnectionBanner.test.tsx` (nowy) — renderuje się przy `visible=true`, `null` przy `visible=false`.
- `app/src/components/OnlineRoomScreen.test.tsx` — rozszerzenie o test, że baner pojawia się niezależnie od `room.phase` (lobby/playing/finished) gdy `disconnected` jest `true`.
- Responsywność — bez nowych testów automatycznych, weryfikacja manualna (patrz sekcja 2).
- Hosting — bez testów jednostkowych; weryfikacja przez faktyczny `firebase deploy --only hosting` i sprawdzenie działającej aplikacji pod adresem Firebase Hosting.

## Poza zakresem (świadomie pomijane)

- **PWA** (manifest, service worker, tryb offline) — mimo że roadmapa wymieniała to jako opcję dla Etapu 8, świadomie odłożone: gra online i tak wymaga połączenia z Firestore, więc pełne "offline-first" ma ograniczoną wartość teraz; można dodać jako osobny etap później.
- **CI/CD** (GitHub Actions czy inny automatyczny deploy) — deploy pozostaje ręczny (`npm run deploy`).
- **Osobny projekt/target Firebase dla produkcji vs. developmentu** — jeden projekt (`bronx-dice-v2`) na wszystko.
- **Obsługa błędów pojedynczych akcji zapisu** (roll/score/toggleHeldDie) — poza zakresem, patrz sekcja 3.
- **Testy wizualne/regresyjne (screenshoty)** dla responsywności — tylko weryfikacja manualna.
- **Przebudowa breakpointów tablet/desktop** — już działają dzięki `max-width: 640px` na `#root`, nie są ruszane.
