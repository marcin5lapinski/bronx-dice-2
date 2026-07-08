# Heurystyka fazy "szkółki" dla bota EV

## Kontekst i problem

Po wdrożeniu silnika EV ([`2026-07-07-bot-silnik-ev-design.md`](2026-07-07-bot-silnik-ev-design.md))
zaobserwowano w manualnych testach, że bot podczas fazy wypełniania górnej
sekcji ("szkółka") systematycznie faworyzuje kategorie o wysokiej wartości
ścianki (czwórki/piątki/szóstki) kosztem niskich (jedynki/dwójki/trójki).

Zweryfikowano to empirycznie na realnym silniku poprzez bezpośrednie
wywołania `chooseBotRollDecision` na skonstruowanych scenariuszach (nie jest
to błąd w wyborze maski trzymania — bot poprawnie ignoruje kości, których
wartość nie pasuje do żadnej otwartej kategorii; np. przy kościach
`[1,6,6,6,6]` i tylko jedynkach otwartych bot trzyma wyłącznie jedynkę i
przerzuca wszystkie cztery szóstki). Przyczyna jest strukturalna: `turnValue`
(delta `calculateTotal`) porównuje kategorie
w ramach *jednej* tury, a przy niejednoznacznym rzucie wyższa wartość
ścianki daje wyższy surowy wynik niezależnie od liczby pasujących kości
(1 kość × 4 > 2 kości × 1), więc bot racjonalnie, w ramach jednej tury,
zawsze preferuje wyższe kategorie, gdy jest wybór. Skumulowany efekt w wielu
turach: niskie kategorie zostają na koniec i często kończą się słabym lub
zerowym wynikiem. To jest dokładnie ograniczenie świadomie wykluczone z
zakresu poprzedniego etapu ("Strategia międzyturowa... to osobny, dużo
większy problem").

### Odrzucona alternatywa: dokładne rozwiązanie całej fazy

Rozważono dokładne (matematycznie optymalne) rozwiązanie całej fazy
szkółki: rozszerzenie rekursji o dodatkowy wymiar stanu — podzbiór
otwartych kategorii górnej sekcji (do 64 podzbiorów) skrzyżowany z sumą
punktów zdobytych dotychczas w tej sekcji (bo `calculateBonus` zależy od
sumy, nie od tego, które konkretnie kategorie ją złożyły). Zaimplementowano
i zmierzono prototyp tego podejścia na realnym silniku: dla pustej górnej
sekcji (najgorszy przypadek) obliczenie nie zakończyło się nawet po 45
sekundach, mimo teoretycznego oszacowania na ~6800 unikalnych stanów —
każdy stan wymaga własnego pełnego przeszukania kości (rząd złożoności
dzisiejszej pojedynczej decyzji), więc liczone na żywo w przeglądarce jest
nieakceptowalnie wolne. Policzenie tabeli raz offline i zaszycie jej jako
statycznych danych w kodzie pozostaje teoretycznie możliwe, ale wymaga
dodatkowego kroku budowania i pliku danych do utrzymania — uznano to za
nieproporcjonalny koszt względem prostszej heurystyki poniżej, którą
wybrano do realizacji w tym etapie.

## Cel i zakres

Zastąpić wybór maski trzymania **wyłącznie w fazie szkółki** (górna sekcja
niekompletna) prostą, deterministyczną regułą zamiast wyczerpującego
przeszukania 32 masek. Decyzja "przerwij czy rzuć dalej" oraz finalny wybór
kategorii do zapunktowania **pozostają bez zmian** — nadal liczy je
dzisiejszy silnik EV (`turnValue`/`bestStopChoice`), który poprawnie
uwzględnia bonus +50 za próg 63 punktów. Reguła dostarcza tylko *jednego*
kandydata na maskę trzymania (zamiast 32), więc silnik EV porównuje
"zatrzymaj się teraz" z "rzuć dalej, trzymając to, co wskazała reguła" —
bez utraty poprawności bonusu, tylko z zawężonym zestawem rozważanych
przerzutów.

**Faza "poker"** (górna sekcja kompletna) **pozostaje całkowicie bez
zmian** — pełne przeszukanie 32 masek jak dziś, bo tam obecne zachowanie
(faworyzowanie wysokich wartości) jest już pożądane.

`chooseBotScoreDecision` (wymuszony wybór kategorii przy `rollsLeft === 0`)
**pozostaje bez zmian** w obu fazach — nie ma tam kości do trzymania, więc
reguła się nie stosuje.

## Reguła wyboru maski trzymania (tylko faza szkółki)

Dla bieżących 5 kości `dice: DiceValue[]` i `scoreCard`:

1. **Odfiltruj** kości do tych, których wartość ścianki odpowiada
   *jeszcze otwartej* kategorii górnej sekcji (`canScoreCategory(scoreCard,
   faceAsUpperCategory)`). Kości, których wartość odpowiada już wypełnionej
   kategorii, są ignorowane — nieistotne w tej turze.
2. Jeśli po filtrze nie zostały żadne kości (wszystkie 5 ma wartości już
   wypełnionych kategorii) → **przerzuć wszystko** (`hold = [false, false,
   false, false, false]`).
3. W przeciwnym razie: policz wystąpienia każdej wartości wśród
   odfiltrowanych kości. Wybierz wartość o **najwyższej liczbie
   wystąpień**; przy remisie liczby wystąpień wygrywa **wyższa wartość
   ścianki**.
4. **Trzymaj** wszystkie fizyczne kości pokazujące wybraną wartość,
   **przerzuć** resztę (w tym kości pasujące do *innych* wciąż otwartych
   kategorii, które nie zostały wybrane w kroku 3 — reguła celuje w jedną
   wartość na turę, patrz drugi przykład niżej).

### Przykłady

- Kości `[1,1,1,4,5]`, otwarte wszystkie kategorie górne → jedynki mają
  najwyższą liczbę wystąpień (3) → trzymaj trzy jedynki, przerzuć 4 i 5.
- Kości `[2,2,3,3,6]`, otwarte dwójki i trójki (reszta wypełniona) →
  remis liczby wystąpień (2 i 2) → wygrywa wyższa wartość → trzymaj dwie
  trójki, przerzuć resztę (w tym dwójki — mimo że dwójki też pasują do
  otwartej kategorii, reguła wybiera tylko *jedną* wartość docelową na
  turę).
- Kości `[1,2,3,4,5]` (same unikalne wartości), wszystkie otwarte → brak
  duplikatów, najwyższa odfiltrowana wartość to 5 → trzymaj piątkę,
  przerzuć resztę.
- Kości `[6,6,6,6,6]`, ale szóstki już wypełnione, reszta otwarta → po
  filtrze nie zostaje nic → przerzuć wszystko.

## Architektura

Zmiana w jednym miejscu: `packages/game-engine/src/bot/strategy.ts`,
funkcja `chooseBotRollDecision`. Nowa funkcja pomocnicza (np.
`chooseSchoolPhaseHold(scoreCard, dice): boolean[]`) implementująca regułę
powyżej, używana zamiast przeszukania 32 masek, gdy
`!isUpperSectionFilled(scoreCard)`. Gdy `isUpperSectionFilled(scoreCard)`
jest `true`, `chooseBotRollDecision` działa dokładnie jak dziś (32 maski,
pełne EV).

Wewnętrzna rekurencja `valueAtRollsLeft` (używana do oceny "co się stanie,
jeśli przerzucę") pozostaje bez zmian jako mechanizm liczący — w fazie
szkółki jest wywoływana tylko raz (dla jedynej maski wskazanej przez
regułę) zamiast 32 razy, co dodatkowo *przyspiesza* obliczenia względem
dzisiejszego stanu w tej fazie.

`isUpperSectionFilled` jest już eksportowane z `packages/game-engine/src/scoreCard.ts`.

## Testowanie

Nowy plik `packages/game-engine/src/bot/schoolPhaseHold.test.ts` (lub
analogicznie nazwany, współlokowany z nową funkcją pomocniczą) pokrywający
bezpośrednio regułę z sekcji "Reguła wyboru maski trzymania" — w tym
wszystkie cztery przykłady powyżej jako osobne przypadki testowe.

`strategy.test.ts` (istniejący): dodać scenariusz integracyjny —
`chooseBotRollDecision` w fazie szkółki (górna sekcja częściowo wypełniona)
zwraca maskę zgodną z regułą, nie z pełnym przeszukaniem EV, oraz scenariusz
potwierdzający, że decyzja "przerwij vs rzuć dalej" nadal poprawnie
uwzględnia bonus +50 przy tej zawężonej masce. Istniejące testy fazy
"poker" (m.in. czteroteria/doubling z poprzedniego etapu) pozostają bez
zmian — dotyczą scenariuszy z w pełni wypełnioną górną sekcją, nieobjętych
tą zmianą.

## Poza zakresem (świadomie)

- **Dokładne (matematycznie optymalne) rozwiązanie całej fazy szkółki** —
  rozważone i odrzucone z powodów wydajnościowych (patrz "Odrzucona
  alternatywa" wyżej). Możliwy przyszły etap: policzenie tabeli offline i
  zaszycie jako statycznych danych, jeśli reguła heurystyczna okaże się
  niewystarczająca w praktyce.
- **Zmiana zachowania w fazie "poker"** — pozostaje niezmieniona.
- **Zmiana `chooseBotScoreDecision`** — pozostaje niezmieniona w obu
  fazach.
- **Strojenie reguły pod kątem realnej optymalności** — reguła jest
  heurystyką dobraną na podstawie intuicji domenowej (priorytet dla
  duplikatów, potem dla wyższej wartości), nie dowiedzioną matematycznie
  optymalną strategią.
