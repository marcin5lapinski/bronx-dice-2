# Kolejność graczy na StartScreen — design doc

Data: 2026-07-04

## Kontekst

Dodatek niezwiązany z numerowanymi etapami roadmapy (podobnie jak logo i nowe avatary z tej samej sesji roboczej). `StartScreen` (`app/src/components/StartScreen.tsx`) obecnie renderuje select liczby graczy (2–6) i listę inputów tekstowych z nazwami graczy, indeksowaną pozycją (`names: string[]`). Kolejność tej tablicy przy starcie gry staje się kolejnością tur (`onStart(trimmedNames)` → `createGameState` przypisuje `player-1`, `player-2`... w kolejności tablicy). Od niedawna `StartScreen` korzysta też z `useAuth()` do pokazania "Zaloguj się"/"Profil gracza".

Ten dokument opisuje trzy powiązane zmiany na tym ekranie:
1. Drag & drop do ręcznej zmiany kolejności graczy.
2. Checkbox "losuj kolejność" oznaczający, że kolejność ma zostać wylosowana przy starcie.
3. Automatyczne uzupełnianie pierwszego pola nazwy nickiem zalogowanego gracza.

To czysto prezentacyjna/UI zmiana w `StartScreen` — silnik gry (`app/src/engine/*`), `createGameState` i istniejące testy silnika pozostają nietknięte. `onStart` nadal przyjmuje `string[]` w finalnej kolejności — cała logika opisana niżej dzieje się przed wywołaniem `onStart`.

## Nowa zależność

`@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` — nowoczesna biblioteka drag & drop z natywnym wsparciem dotyku (istotne, bo apka jest mobile-first) i wbudowaną dostępnością (obsługa klawiatury). Bez tego reorderowanie działałoby słabo na telefonie albo wymagałoby ręcznej implementacji pointer-eventów od zera.

## Model danych

`names: string[]` (indeksowany pozycją) zmienia się na:

```ts
interface PlayerNameRow {
  id: string;
  value: string;
}
```

`id` generowane raz przy utworzeniu wiersza (np. `crypto.randomUUID()` albo licznik), **nigdy** przy każdym renderze — `@dnd-kit` wymaga stabilnego `id` per przeciągany element, żeby poprawnie śledzić gest podczas ruchu.

Etykieta "Gracz N" pozostaje wyliczana z **pozycji** w tablicy (`Gracz ${index + 1}`), tak jak dziś — nie jest przypisana do `id` wiersza. Po przeciągnięciu wiersza z wartością "Kuba" na pozycję 1, ten wiersz renderuje się jako "Gracz 1" z wartością "Kuba".

Zmiana liczby graczy (select 2–6) zachowuje istniejące zachowanie: dokłada nowe wiersze (z nowym `id`, domyślną wartością `Gracz N`) lub ucina od końca aktualnej (czyli już ewentualnie przeciągniętej) kolejności — analogicznie do dzisiejszego `Array.from({ length: count }, (_, i) => current[i] ?? defaultName(i))`.

## Drag & drop

Każdy wiersz dostaje osobny **uchwyt do przeciągania** (mała ikona, np. "⋮⋮") obok pola tekstowego — nie cały wiersz jest przeciągalny, żeby kliknięcie/fokus w polu tekstowym nie kolidowały z gestem drag. Struktura:

- `DndContext` z `sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))` — `PointerSensor` obsługuje mysz i dotyk jednym sensorem; `KeyboardSensor` daje dostępność (reorder strzałkami) za darmo z paczki `@dnd-kit/sortable`.
- `SortableContext` z listą `id`-ów wierszy w bieżącej kolejności, `strategy={verticalListSortingStrategy}`.
- Każdy wiersz używa `useSortable({ id })`, podpina `transform`/`transition` (przez `CSS.Transform.toString` z `@dnd-kit/utilities`) do stylu kontenera, a `listeners`/`attributes` **tylko** do uchwytu, nie do całego wiersza ani do inputu.

Logika przestawiania wyodrębniona do czystej, testowalnej funkcji:

```ts
function reorderNames(
  rows: PlayerNameRow[],
  activeId: string,
  overId: string
): PlayerNameRow[]
```

(cienki wrapper na `arrayMove` z `@dnd-kit/sortable`, z obsługą przypadku `activeId === overId` lub brakującego `overId` → zwraca `rows` bez zmian). `onDragEnd` z `DndContext` wywołuje tę funkcję i ustawia nowy stan. Dzięki wydzieleniu logiki testy jednostkowe nie muszą symulować prawdziwego gestu wskaźnika w jsdom (kruche, słabo wspierane) — testują `reorderNames` bezpośrednio jako czystą funkcję.

## Checkbox "losuj kolejność"

Zwykły `useState<boolean>` w `StartScreen`. Gdy zaznaczony:
- Uchwyty drag & drop są wizualnie wyszarzone i nieaktywne (np. `disabled` na sensorach albo warunkowe niepodpinanie `listeners`) — kolejność i tak zostanie nadpisana, więc ręczne przestawianie nie ma sensu.
- Widoczna lista inputów **nie zmienia się** w momencie zaznaczenia — losowanie jest "niewidzialne" aż do startu gry.

Kliknięcie "Rozpocznij grę" z zaznaczonym checkboxem tasuje finalną listę nazw tuż przed wywołaniem `onStart(...)`, przez czystą, testowalną funkcję z injectowalnym RNG (wzorzec spójny z `rollDice` w silniku):

```ts
function shufflePlayerOrder(
  names: string[],
  random: () => number = Math.random
): string[]
```

(Fisher–Yates). Gdy checkbox odznaczony, `onStart` dostaje nazwy w kolejności z (ewentualnie przeciąganej) listy, bez tasowania.

## Automatyczne uzupełnianie nicku

Wiersz utworzony jako pierwszy przy montowaniu komponentu (domyślnie "Gracz 1") dostaje wewnętrzną flagę synchronizacji. Ponieważ auto-uzupełnianie dotyczy zawsze dokładnie jednego wiersza (tego utworzonego jako pierwszy przy starcie), stan komponentu przechowuje to jako pojedyncze pole `syncedRowId: string | null` (ustawione na `id` pierwszego wiersza przy montowaniu, `null` po pierwszej ręcznej edycji tego pola).

Dopóki flaga aktywna dla danego `id`:
- Wartość tego wiersza śledzi `profile.displayName` na bieżąco — `useEffect` reagujący na zmiany `user`/`profile.displayName`, aktualizujący `value` wiersza o pasującym `id`.
- Flaga **podąża za wierszem przez `id`**, nie za pozycją — jeśli ten wiersz zostanie przeciągnięty w inne miejsce listy, synchronizacja trwa dalej.

Pierwsza ręczna edycja pola należącego do zsynchronizowanego wiersza (`onChange` na jego inpucie) trwale wyłącza synchronizację dla tego `id` (niezależnie od tego, czy w danym momencie edytowany tekst akurat pokrywa się z nickiem). Gdy użytkownik niezalogowany albo `profile` nie ma jeszcze `displayName`, mechanizm nic nie robi (brak efektu).

## Testowanie

- `reorderNames` i `shufflePlayerOrder` — testy jednostkowe czystych funkcji (przestawienie środkowego elementu, przestawienie na tę samą pozycję, pusta/jednoelementowa lista; tasowanie z deterministycznym `random` zwracającym stałe wartości, analogicznie do testów `rollDice`).
- `StartScreen.test.tsx` (rozszerzenie istniejącego pliku, już opakowanego w `AuthProvider` z poprzedniej zmiany):
  - uchwyty drag & drop obecne przy więcej niż jednym graczu,
  - wywołanie `onDragEnd`-owego handlera bezpośrednio (bez symulacji gestu) przestawia kolejność w stanie i w efekcie w danych przekazanych do `onStart`,
  - zaznaczenie "losuj kolejność" wyłącza/wyszarza uchwyty,
  - `onStart` wywołane z zaznaczonym checkboxem dostaje przetasowaną listę (z podmienionym, deterministycznym RNG),
  - pole "Gracz 1" śledzi `profile.displayName` zalogowanego użytkownika,
  - ręczna edycja tego pola zatrzymuje synchronizację (kolejna zmiana `displayName` w profilu już go nie nadpisuje),
  - synchronizacja przetrwa przeciągnięcie wiersza w inne miejsce listy.

## Zakres i granice

**W zakresie:**
- Drag & drop reorderowania wierszy z nazwami graczy na `StartScreen`.
- Checkbox "losuj kolejność" + tasowanie przy starcie gry.
- Auto-synchronizacja pierwszego pola z nickiem zalogowanego gracza, z regułą "dopóki nieedytowane ręcznie".
- Nowe zależności `@dnd-kit/*`.

**Poza zakresem:**
- Jakiekolwiek zmiany w silniku gry, `createGameState`, typach domenowych czy trybie online (to osobne etapy roadmapy).
- Zapamiętywanie wybranej kolejności/ustawienia checkboxa między sesjami (np. w `localStorage`) — nie zostało poproszone, YAGNI.
- Drag & drop na innych ekranach niż `StartScreen`.

## Kolejne kroki

Po zatwierdzeniu tego dokumentu: szczegółowy plan implementacyjny (`writing-plans`).
