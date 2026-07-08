# Jak grać? — modal zasad + przycisk kopiowania kodu pokoju

Data: 2026-07-08

## Cel

Dwie niezależne, drobne funkcje UI:

1. Przycisk **"Jak grać?"** w głównym menu (`StartScreen`), otwierający modal z pełnym opisem zasad gry (sekcja górna/dolna, bonus, zasada podwajania, trzymanie kości i jego cel strategiczny).
2. Przycisk **kopiowania kodu pokoju** w `RoomLobbyScreen`, obok istniejącego nagłówka `Pokój {roomId}`.

## Architektura

### `HowToPlayModal` (nowy komponent, `app/src/components/HowToPlayModal.tsx` + `HowToPlayModal.test.tsx`)

- Props: `{ onClose: () => void }`.
- Renderuje overlay pełnoekranowy (przyciemnione tło) + wyśrodkowany panel w stylu istniejących paneli (`--panel-bg`/`--panel-border`), z przewijalną treścią wewnątrz panelu (na wypadek małych ekranów / długiej treści).
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` wskazujące na nagłówek "Jak grać?".
- Zamykanie:
  - przycisk **"Zamknij"** (niebieski wariant, spójny z przyciskiem "Jak grać?"),
  - klawisz **Escape** (nasłuch `keydown` w `useEffect`),
  - **klik w tło NIE zamyka** — użytkownik może chcieć zaznaczyć/skopiować fragment tekstu zasad, więc overlay nie ma handlera kliknięcia zamykającego modal.
- Treść modala to statyczny, opisany niżej tekst (sekcja "Treść modala").

### Zmiany w `StartScreen.tsx`

- Nowy stan `const [showHowToPlay, setShowHowToPlay] = useState(false)`.
- Nowy przycisk `Jak grać?` wstawiony jako **pierwszy element** wewnątrz `.start-screen`, przed warunkowym przyciskiem "Zagraj online"/"Zaloguj się" — czyli zawsze nad nim niezależnie od stanu zalogowania.
- Przycisk ma dedykowaną klasę (`how-to-play-button`), otwiera modal (`onClick={() => setShowHowToPlay(true)}`).
- `{showHowToPlay && <HowToPlayModal onClose={() => setShowHowToPlay(false)} />}` wyrenderowane wewnątrz `.start-screen`, jako ostatni element w drzewie JSX. Overlay używa `position: fixed; inset: 0;`, więc pokrywa cały viewport niezależnie od zagnieżdżenia — żaden przodek `.start-screen` nie ustawia `transform`/`filter`/`perspective`, które ograniczałyby `position: fixed` do lokalnego kontekstu.

### Zmiany w `RoomLobbyScreen.tsx`

- `<h1>Pokój {roomId}</h1>` zamienione na kontener flex-row: nagłówek + `<CopyRoomCodeButton roomId={roomId} />`.

### `CopyRoomCodeButton` (nowy komponent, `app/src/components/CopyRoomCodeButton.tsx` + `CopyRoomCodeButton.test.tsx`)

- Props: `{ roomId: string }`.
- `onClick`: `navigator.clipboard.writeText(roomId)`, następnie etykieta przycisku przełącza się z domyślnej **"Kopiuj kod"** na **"Skopiowano!"** na ok. 1.5 sekundy (timeout w `useState`/`useEffect`), po czym wraca do "Kopiuj kod".
- Brak obsługi błędu przeglądarek bez `navigator.clipboard` (poza zakresem — aplikacja i tak celuje w nowoczesne przeglądarki; jeśli `writeText` rzuci, można to zignorować/catch bez UI błędu, żeby nie dodawać niepotrzebnej złożoności).

## Stylowanie (`app/src/styles/components.css`)

Nowa sekcja `/* HowToPlayModal */`:
- `.how-to-play-overlay` — `position: fixed; inset: 0;` półprzezroczyste czarne tło, `display:flex; align-items:center; justify-content:center; z-index` ponad resztą UI.
- `.how-to-play-modal` — panel: `background: var(--panel-bg); border: 1px solid var(--panel-border);` zaokrąglone rogi, `max-width`/`max-height` z `overflow-y: auto`, padding.
- `.how-to-play-modal button` (przycisk "Zamknij") — wariant niebieski: `color/border: var(--accent-blue)`, `box-shadow: 0 0 * var(--accent-blue-glow)`, ten sam krój co pozostałe przyciski (uppercase, letter-spacing, border-radius 4px).

Dopisek w istniejącej sekcji `/* StartScreen */`:
- `.start-screen .how-to-play-button` — nadpisuje `.start-screen button`: kolory niebieskie zamiast zielonych (`--accent-blue` zamiast `--accent-green`), węższy padding (mniej szeroki niż pozostałe przyciski, np. `padding: 8px 14px`), `align-self: flex-end` (żeby wylądował po prawej stronie flex-column kontenera `.start-screen`, podczas gdy reszta przycisków pozostaje jak dotychczas), `margin-top` dopasowany żeby nie kolidował z logo powyżej.

Dopisek w sekcji `/* RoomLobbyScreen */` (lub nowej, jeśli sekcja jeszcze nie istnieje pod tą nazwą):
- kontener nagłówka `Pokój {roomId}` + przycisk kopiowania: `display:flex; align-items:center; gap: 8px;`
- `.room-lobby-screen .copy-room-code-button` — mały przycisk, styl spójny z resztą (np. wariant zielony/domyślny jak inne przyciski w tym ekranie), niewielki padding.

## Treść modala "Jak grać?"

Tekst statyczny, w języku polskim, w kolejności:

1. **Cel gry** — krótki opis (gra w kości podobna do Yahtzee z własnymi zasadami; wygrywa gracz z najwyższą sumą po zapełnieniu tabeli).
2. **Przebieg tury** — do 3 rzutów, decyzja po każdym rzucie: rzucić ponownie (niezatrzymanymi kośćmi) albo wpisać wynik.
3. **Trzymanie kości (holdowanie)** — klik zatrzymuje kość na kolejny rzut; wyjaśnienie celu strategicznego (zachowanie dobrych kości, np. pary pod 4X/Yahtzee lub budowanie strita, ryzykując tylko resztą).
4. **Sekcja górna** — Jedynki–Szóstki, wzór (liczba kości × wartość ścianki), bonus +50 przy sumie ≥63.
5. **Sekcja dolna** — odblokowana dopiero po zapełnieniu całej górnej; lista kategorii z zasadami punktacji: Para, 2× Para, 3X, 4X, Mały strit (15 pkt), Duży strit (20 pkt), Full (suma wszystkich kości), Szansa (suma wszystkich kości), 5X/Generał (suma kości + 50 pkt bonus).
6. **Zasada podwajania** — wynik w kategorii z sekcji dolnej wpisany zaraz po pierwszym rzucie (2 rzuty jeszcze niewykorzystane) zostaje podwojony; premia +50 za 5X nie jest podwajana.

Dokładne sformułowania (uzgodnione z użytkownikiem w rozmowie) do przeniesienia 1:1 do JSX komponentu jako nagłówki + akapity/listy.

## Testy

- `HowToPlayModal.test.tsx`: renderuje się z `role="dialog"`; klik "Zamknij" wywołuje `onClose`; naciśnięcie Escape wywołuje `onClose`; klik na overlay (poza panelem) **nie** wywołuje `onClose`.
- `CopyRoomCodeButton.test.tsx`: klik wywołuje `navigator.clipboard.writeText` z poprawnym `roomId` (zamockowanym), etykieta zmienia się na "Skopiowano!" i wraca po odczekaniu (fake timers).
- `StartScreen.test.tsx`: rozszerzenie o test, że przycisk "Jak grać?" otwiera modal.
- `RoomLobbyScreen.test.tsx`: rozszerzenie o obecność przycisku kopiowania obok nagłówka pokoju.

## Poza zakresem

- Brak obsługi przeglądarek bez `navigator.clipboard` / fallback (np. `document.execCommand('copy')`).
- Brak i18n — cała treść na sztywno po polsku, zgodnie z resztą aplikacji.
- Brak zmian w logice silnika gry (`packages/game-engine`) — to czysto UI.
