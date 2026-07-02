# Bronx Dice v2 — plan pracy (design doc)

Data: 2026-07-01

## Kontekst

Istnieje pierwowzór aplikacji (`pierwowzor/`) — gra kości podobna do Yahtzee, napisana w React (JS, Create React App), z Firebase (Firestore) używanym tylko do przechowywania prostych profili/statystyk graczy. Gra działa wyłącznie lokalnie w trybie hot-seat (jedno urządzenie, gracze podają je sobie po kolei). Mechanika i zasady gry są uznane za kompletne, ale implementacja jest amatorska (masowe kopiuj-wklej logiki per gracz zamiast jednej parametryzowanej funkcji) i ma nieukończone/wadliwe fragmenty.

Celem nowej wersji jest przepisanie gry w React + TypeScript, z zachowaniem tych samych zasad gry, ale:
- czystszą, sparametryzowaną implementacją silnika gry,
- obsługą 2–6 graczy (zamiast sztywnych 5),
- dodaniem trybu **online** — realna rozgrywka na 2–6 osobnych urządzeniach przez internet, oprócz trybu lokalnego (hot-seat).

## Zasady gry (potwierdzone z pierwowzoru)

- 5 kości, maks. 3 rzuty na turę.
- Górna sekcja (Asy–Szóstki): suma kości danej wartości (jak w klasycznym Yahtzee).
- Bonus +50 pkt, jeśli suma górnej sekcji ≥ 63 (inaczej niż w klasycznym Yahtzee, gdzie bonus to +35).
- **Zasada własna #1:** dolną sekcję (Para, 2x Para, Trójka, Czwórka, Mały strit, Duży strit, Full, Szansa, Piątka/Generał) można zacząć wypełniać dopiero, gdy cała górna sekcja jest już uzupełniona (`upperFilled`).
- **Zasada własna #2:** jeśli gracz zapisuje kategorię z dolnej sekcji po pierwszym rzucie w turze (zostały mu jeszcze 2 rzuty, tzn. `rollsLeft === 2` w momencie zapisu), wynik tej kategorii jest podwajany. Premiuje szybkie/odważne decyzje.
- Piątka/Generał (5 tych samych oczek) daje sumę oczek + 50 pkt (podwojenie sumy działa tak samo jak wyżej: suma × 2 + 50, jeśli zapisane po pierwszym rzucie).
- Wygrywa gracz z najwyższym wynikiem końcowym (`total`).
- Znane błędy w pierwowzorze do naprawienia przy przepisywaniu: wykrywanie Pary / 2x Pary / Trójki / Fulla używa tego samego uproszczonego sprawdzenia duplikatów w tablicy kości i nie odróżnia poprawnie tych kombinacji.

## Kluczowe decyzje architektoniczne

| Obszar | Decyzja |
|---|---|
| Frontend | React + TypeScript, Vite (zamiast przestarzałego Create React App z pierwowzoru) |
| Tryb lokalny | Hot-seat na jednym urządzeniu, do 6 graczy (spójne z limitem online) |
| Backend online | Firebase — Firestore (stan pokoju gry) + Cloud Functions (logika autorytatywna) |
| Projekt Firebase | Nowy, czysty projekt (nie kontynuujemy `bronx-dice` z pierwowzoru) |
| Tożsamość graczy online | Firebase Auth (Google + e-mail/hasło) — konto wymagane do gry online; profil gracza (nazwa wyświetlana, avatar) powiązany z kontem. Tryb lokalny (hot-seat) nadal nie wymaga logowania |
| Rejestracja/logowanie | Firebase Auth: rejestracja e-mail+hasło, logowanie, reset hasła (link e-mail), logowanie przez Google. Bez wymogu weryfikacji adresu e-mail w MVP |
| Losowanie kości i walidacja online | Po stronie serwera (Cloud Functions) — klient nie może samodzielnie wygenerować ani zmodyfikować wyniku rzutu/punktacji |
| Statystyki graczy (historia gier, wygrane) | Niski priorytet — osobny etap na końcu, opcjonalny |
| Hosting | Firebase Hosting (spójne z resztą stacku) |

## Etapy pracy

### Etap 1 — Fundament + silnik gry (czysta logika, bez UI)
- Nowy projekt Vite + React + TypeScript, struktura folderów, lint/format.
- Typy domenowe: `Player`, `DiceValue`, `ScoreCategory`, `PlayerScoreCard`, `GameState`.
- Jeden uniwersalny silnik gry (funkcje czyste, sparametryzowane graczem i stanem kości) zamiast kopiowanej logiki per gracz.
- Naprawa wykrywania Pary / 2x Pary / Trójki / Fulla.
- Obsługa 2–6 graczy jako kolekcja/tablica, nie osobne zmienne.
- Testy jednostkowe (Vitest) na wszystkie kategorie punktacji i reguły specjalne (bonus ≥63, podwojenie przy `rollsLeft === 2`, blokada dolnej sekcji do czasu `upperFilled`).

### Etap 2 — Tryb lokalny (hot-seat) na nowym silniku
- Ekran startowy, wybór liczby graczy (2–6) i nazw.
- Plansza wyników, rzucanie kością z zaznaczaniem zatrzymanych kości, przekazywanie tury, ekran zwycięzcy.
- Stan gry trzymany lokalnie w React (bez backendu).
- Efekt końcowy: w pełni grywalna wersja offline.

### Etap 3 — Uwierzytelnianie i profil gracza
- Nowy projekt Firebase (nie kontynuujemy `bronx-dice` z pierwowzoru), konfiguracja SDK.
- Firebase Auth: dostawcy Google oraz Email/Password.
- Ekrany: logowanie, rejestracja, „zapomniałem hasła” (reset przez e-mail).
- Profil gracza: nazwa wyświetlana + avatar, zapisane w Firestore (`users/{uid}`).
- Dostęp do trybu online wymaga zalogowania; tryb lokalny (hot-seat) pozostaje dostępny bez logowania.
- Obsługa stanu sesji (utrzymanie zalogowania po odświeżeniu, wylogowanie).

### Etap 4 — Backend Firebase pod rozgrywkę online
- Firestore jako źródło stanu pokoju gry (gracze, kolejka, kości, wyniki per gracz, faza gry, kod pokoju).
- Cloud Functions jako jedyna droga zmiany stanu: `createRoom`, `joinRoom`, `rollDice`, `scoreCategory`, `leaveRoom`.
- Gracze w pokoju identyfikowani przez `uid` z Firebase Auth (Etap 3) zamiast anonimowej sesji.
- Firestore Security Rules blokujące bezpośredni zapis stanu gry z klienta (dozwolony tylko odczyt + wywołania Functions).

### Etap 5 — UI trybu online: lobby i rozgrywka na żywo
- Tworzenie pokoju / dołączanie kodem, poczekalnia (lista graczy, gotowość, start przez hosta).
- Lobby pokazuje nazwę i avatar z profilu gracza (Etap 3) zamiast pola do wpisania nicku.
- Podpięcie planszy gry z Etapu 2 do stanu z Firestore (`onSnapshot`) zamiast lokalnego state — reużycie komponentów UI.
- Obsługa rozłączenia i ponownego dołączenia gracza w trakcie gry.

### Etap 6 (opcjonalnie, niski priorytet) — Statystyki graczy
- Zapis historii rozgrywek (lokalnych i online) do Firestore, powiązanej z kontem gracza.
- Ekran statystyk: liczba gier, wygrane, historia punktów per gracz.

### Etap 7 — Wdrożenie i dopracowanie
- Firebase Hosting.
- Responsywność (telefon/tablet/desktop).
- Obsługa błędów sieci i rozłączeń.
- Ewentualnie PWA.

Etapy 1–5 stanowią rdzeń projektu (silnik + lokalnie + auth + online). Etap 6 realizujemy tylko jeśli zostanie na to czas/chęć po ukończeniu etapu 5.

## Kolejne kroki
Po zatwierdzeniu tego dokumentu: szczegółowy plan implementacyjny (`writing-plans`) dla Etapu 1.
