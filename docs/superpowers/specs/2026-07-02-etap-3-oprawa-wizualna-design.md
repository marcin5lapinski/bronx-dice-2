# Etap 3 — Oprawa wizualna — design doc

Data: 2026-07-02

## Kontekst

Etap 1 (silnik gry) i Etap 2 (tryb lokalny hot-seat) są ukończone i zmergowane do `master`. Aplikacja jest w pełni grywalna, ale wizualnie to wciąż domyślny szablon Vite (jasne tło, fioletowy akcent `#aa3bff` z `app/src/index.css`) — komponenty z Etapu 2 (`StartScreen`, `DiceTray`, `RollButton`, `ScoreBoard`, `WinnerScreen`) mają tylko funkcjonalny, niestylowany markup.

Etap 3 nadaje aplikacji futurystyczny motyw wizualny z jaskrawymi kolorami. To **czysto prezentacyjna zmiana**: CSS, struktura markupu i lokalny stan UI (np. animacje) — logika gry, propsy komponentów, silnik (`app/src/engine/*`, `app/src/types/*`) i istniejące testy pozostają nietknięte.

## Zatwierdzony kierunek wizualny — "Electric HUD"

Wybrany spośród 3 zaprezentowanych kierunków (Neon Cyberpunk, Synthwave Sunset, Electric HUD).

- **Tło:** prawie czarny granat `#060b14`.
- **Panele:** półprzezroczyste, "szklane" (glassmorphism) — subtelne półprzezroczyste tło, `backdrop-filter: blur(...)`, cienkie obramowania w kolorze `#1d3a4a`.
- **Akcent 1 — elektryczny błękit `#00e5ff`:** elementy interaktywne/aktywne — niezatrzymane kości (zostaną przerzucone), przyciski akcji, klikalny podgląd wyniku w tabeli, podświetlenie kolumny aktualnego gracza.
- **Akcent 2 — limonkowa zieleń `#39ff14`:** potwierdzone/zsumowane wartości — wiersz "Bonus" gdy zdobyty, wiersz "Suma"/total, etykieta "Tura: {gracz}".
- **Typografia:** monospace (`ui-monospace, Consolas, monospace`) w całym motywie gry — efekt terminala/HUD-a statku. Duże litery + `letter-spacing` na etykietach (np. "RZUĆ KOŚĆMI").
- **Glow:** interaktywne/aktywne elementy dostają `box-shadow` w kolorze akcentu (np. `0 0 14px rgba(0,229,255,0.6)`), żeby "świeciły" na ciemnym tle.

Ten sam motyw obowiązuje na wszystkich ekranach (`StartScreen`, `GameScreen`/`ScoreBoard`/`DiceTray`/`RollButton`, `WinnerScreen`) — jeden spójny design system, nie osobny styl per ekran.

## Kości

- **Na razie renderowane jako cyfry** (duże, pogrubione, monospace) — to świadomy placeholder. Użytkownik przygotuje własne grafiki kości (SVG/PNG), które zastąpią cyfry w tym samym miejscu i rozmiarze w kolejnej iteracji — nie jest to część zakresu Etapu 3, ale strukturę (jeden punkt podmiany w `DiceTray`) trzeba zostawić łatwą do rozszerzenia.
- **Zatrzymana kość (`held === true`, nie będzie przerzucana):** BEZ podświetlenia — przygaszone barwy, cienka szara/stalowa obwódka (`#1d3a4a`), przygaszony kolor cyfry.
- **Niezatrzymana kość (`held === false`, zostanie przerzucona przy kolejnym rzucie):** Z podświetleniem — kolorowa obwódka + `box-shadow` glow w elektrycznym błękicie, jaśniejszy kolor cyfry.
- Uwaga: to jest **odwrotna** konwencja względem intuicji "podświetlone = ważne/zablokowane" — tu podświetlenie = "ten element się jeszcze zmieni", brak podświetlenia = "ten wynik jest już ustalony". Celowa decyzja produktowa, nie błąd.
- **Animacja przy rzucie:** kliknięcie "Rzuć kośćmi" animuje wizualnie każdą kość, która NIE jest zatrzymana (dokładnie te, które silnik faktycznie przerzuca — spójne z `rollDice`/`rollInTurn` z Etapu 1/2). Mechanizm: silnik losuje i zwraca finalną wartość **natychmiast** (bez zmian względem Etapu 1/2 — `rollInTurn` nie wie nic o animacji), wartość trafia do DOM od razu. Równolegle każda przerzucana kość dostaje na ok. 1 sekundę CSS-ową klasę `.rolling`, która obraca ją (`transform: rotate(...)`, docelowo ok. 740°, `transition`/`@keyframes` z easingiem "ease-out" żeby obrót naturalnie wyhamował). To czysto wizualny efekt na już-poprawnej wartości — nie opóźnia pojawienia się wyniku w DOM, więc nie wymaga zmian w istniejących testach (`GameScreen.test.tsx` nadal sprawdza wynik rzutu zaraz po kliknięciu, bez czekania). Zatrzymane kości (`held === true`) nie dostają klasy `.rolling` przy rzucie.

## Tabela wyników (`ScoreBoard`) — nowy wiersz "Bonus"

- Nowy wiersz **"Bonus"** wstawiony między sekcją górną (po "Szóstki") a sekcją dolną (przed "Para") — spójnie z tym, jak `calculateBonus` z silnika jest logicznie powiązany z sumą górnej sekcji.
- Wartość komórki per gracz:
  - Puste (`–`), dopóki `calculateBonus(scoreCard)` zwraca `0`.
  - **`"50"`** (liczba, nie tekst "BONUS"), ze zielonym akcentem/glow, gdy `calculateBonus(scoreCard)` zwraca `50`.
- To wiersz czysto wyliczany/prezentacyjny — jak istniejący wiersz "Suma". Nie jest osobną klikalną kategorią, nie wywołuje `onScore`, nie ma odpowiednika w `ScoreCategory`/`canScoreCategory`/`scoreCategory` z silnika. `ScoreBoard` tylko odczytuje `calculateBonus` (już wyeksportowane z `app/src/engine/scoring/upperSection.ts` w Etapie 1) i renderuje wynik.
- Kolumna aktualnego gracza (`currentPlayerId`) ma subtelnie podświetlone tło w całej tabeli (włącznie z wierszem Bonus), żeby jednoznacznie było widać, czyja jest tura.
- Klikalny podgląd wyniku (istniejący mechanizm `previewScore` z Etapu 2) stylizowany jako wyraźny "chip": niebieska obwódka + glow, odróżnia się od zwykłej wypełnionej komórki z liczbą.
- Wiersz "Suma" wyróżniony górną linią-separatorem i zielonym akcentem tekstu.

## Responsywność

Zamiast czekać na Etap 8 ("Wdrożenie i dopracowanie" z roadmapy, gdzie "Responsywność" jest wymieniona jako końcowe dopracowanie), Etap 3 buduje layout **responsywny od razu**:

- Ten sam układ i te same komponenty na telefonie (~380px) i szerszym ekranie (tablet/desktop) — różnice tylko przez media queries: większe odstępy, większa czcionka, większe kości na szerszym viewport. Bez przebudowy struktury między szerokościami.
- Etap 8 pozostaje odpowiedzialny za pełne QA na realnych urządzeniach i ewentualne poprawki brzegowych przypadków, nie za pierwsze wdrożenie responsywności.

## Zakres i granice

**W zakresie Etapu 3:**
- Design system: paleta kolorów, typografia, wspólne style (przyciski, obwódki, glow, panele) jako spójne, reużywalne CSS.
- Stylowanie: `StartScreen`, `DiceTray`, `RollButton`, `ScoreBoard` (w tym nowy wiersz "Bonus"), `WinnerScreen`, `App`/layout ogólny.
- Animacja rzutu kością (CSS, lokalny stan UI).
- Podstawowa responsywność (mobile + desktop/tablet) w ramach tych samych komponentów.

**Poza zakresem Etapu 3:**
- Zmiana logiki gry, propsów komponentów, silnika czy istniejących testów jednostkowych/komponentowych — wszystkie 106 testów z Etapu 1–2 muszą dalej przechodzić bez zmian w asercjach dotyczących zachowania (dopuszczalne są zmiany selektorów/tekstu tylko tam, gdzie test i tak sprawdza treść, którą świadomie zmieniamy, np. nowy wiersz "Bonus").
- Docelowe grafiki kości (SVG/PNG) — dostarczy użytkownik później; Etap 3 zostawia w `DiceTray` jedno łatwe miejsce podmiany cyfry na grafikę.
- Pełne QA cross-device, PWA, obsługa błędów sieci — to Etap 8.

## Kolejne kroki

Po zatwierdzeniu tego dokumentu: szczegółowy plan implementacyjny (`writing-plans`) dla Etapu 3.
