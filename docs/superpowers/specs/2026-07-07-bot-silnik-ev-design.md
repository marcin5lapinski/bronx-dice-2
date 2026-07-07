# Silnik EV dla bota (zastąpienie Claude headless CLI)

## Cel

Zastąpić dotychczasowy mechanizm decyzyjny bota lokalnego (patrz
[`2026-07-07-bot-lokalny-claude-design.md`](2026-07-07-bot-lokalny-claude-design.md)),
oparty o `bot-server` proxy do `claude -p` (LLM), czystym algorytmem TS
liczącym dokładną wartość oczekiwaną (expected value, EV) każdej decyzji.
Kości jest tylko 5, więc dokładne przeliczenie wszystkich 32 kombinacji
trzymania kości i obu pozostałych rzutów jest w pełni wykonalne w
przeglądarce w czasie rzędu milisekund — bot może grać realnie optymalnie w
ramach jednej tury, bez zależności od sieci, zewnętrznego CLI, kosztu API
czy zalogowanego konta.

Zakres tej zmiany: **tylko gra lokalna (hotseat)**, tak jak dotychczasowy
bot. Silnik EV ląduje jednak w `packages/game-engine` (nie w `app/`), żeby
`functions/` (Cloud Functions dla trybu online) mogło go w przyszłości
zaimportować bez zmian strukturalnych — sama funkcja bota w trybie online
pozostaje poza zakresem tego etapu.

`bot-server/` i cała dotychczasowa ścieżka LLM w `app/src/bot/`
(`botClient.ts`, `promptBuilder.ts`, `houseRules.ts`, `decision.ts`,
`heuristic.ts` i ich testy) **zostają w repo nietknięte, ale odpięte** —
`useBotTurn.ts` przestaje je wywoływać. To świadoma decyzja: gdyby pomysł na
bota LLM kiedyś wrócił, kod jest gotowy do podłączenia z powrotem.

## Architektura

Nowy moduł `packages/game-engine/src/bot/`, eksportowany z `index.ts` tak
jak istniejące `dice.ts`/`scoreCard.ts`/`turn.ts`:

- **`rerollOutcomes.ts`** — statyczna, prekalkulowana tabela: dla
  `k = 0..5` niewstrzymanych kości, lista wszystkich unikalnych multisetów
  wyników (`DiceValue[]` posortowane rosnąco) wraz z prawdopodobieństwem
  (waga multinomialna / `6^k`). Liczona raz przy imporcie modułu — dla
  wszystkich `k` łącznie to 462 kombinacje, trywialne obliczeniowo,
  niezależne od aktualnego stanu gry.
- **`types.ts`** — `BotRollDecision = { action: 'reroll'; hold: boolean[] }
  | { action: 'score'; category: ScoreCategory }`. Własny typ, nie
  reużywa `app/src/bot/decision.ts` (ten zostaje częścią odpiętej ścieżki
  LLM).
- **`strategy.ts`** — właściwy silnik:
  - `chooseBotRollDecision(scoreCard, dice, heldDice, rollsLeft):
    BotRollDecision` — wywoływane, gdy `rollsLeft > 0`.
  - `chooseBotScoreDecision(scoreCard, dice, rollsLeft): ScoreCategory` —
    wywoływane, gdy `rollsLeft === 0` (wymuszony wybór kategorii, bez
    możliwości przerzutu).
  - Wewnętrznie: memoizowana rekurencja `valueAtRollsLeft` (patrz
    "Algorytm" niżej) oraz `bestCategoryValue` (odpowiednik dzisiejszego
    `chooseHeuristicCategory`, ale z poprawką o bonus — patrz niżej).

`app/src/bot/useBotTurn.ts` (jedyny plik zmieniany w `app/`): zamiast
`buildRollDecisionPrompt` → `requestBotMove` → `parseRollDecision` →
fallback `chooseHeuristicCategory`, woła bezpośrednio
`chooseBotRollDecision`/`chooseBotScoreDecision` z
`@bronx-dice/game-engine`. Ponieważ silnik EV jest czystą, deterministyczną
funkcją nad poprawnym stanem gry (bez I/O, bez parsowania niezaufanego
JSON), nie ma już scenariusza "sieć/CLI zawiodło" — zostaje tylko istniejący
skrajny przypadek "brak legalnej kategorii" (`NO_OP` w `useBotTurn.ts`),
obsługiwany identycznie jak dziś. Cała reszta sekwencji tury (rzut →
namysł → zastosowanie decyzji → punktacja), timing "namysłu"
(`DECISION_WINDOW_MS = 2500`, `withDecisionWindow`) i wskaźniki UI
("bot myśli") zostają **bez zmian** — zmienia się tylko to, co produkuje
decyzję, nie jak jest ona konsumowana ani wizualizowana.

## Algorytm (dokładny EV, tylko bieżąca tura)

### Poprawka: wartość to delta całego wyniku, nie surowy wynik kategorii

Bonus +50 za przekroczenie sumy ≥63 w sekcji górnej liczy się w
`calculateTotal`/`calculateBonus`, nie w `scoreCategory` (który zwraca tylko
wynik samej kategorii). Naiwne podejście oparte na dzisiejszym
`previewScore` (jak w `chooseHeuristicCategory`) tego bonusu nie widzi.
Silnik EV liczy więc wartość każdego rozważanego ruchu jako:

```
turnValue(scoreCard, category, dice, rollsLeft) =
  calculateTotal(scoreCategory(scoreCard, category, dice, rollsLeft))
  - calculateTotal(scoreCard)
```

Dzięki temu przekroczenie progu 63 (i odblokowanie ukrytego +50) naturalnie
wchodzi do rachunku EV bez dodatkowej heurystyki wagowej.

### Rekurencja (DP po `rollsLeft`)

Wartości cache'owane po multisecie kości (posortowane wartości, nie
fizyczne pozycje) + `rollsLeft` — bo trzymanie/przerzut interesuje nas tylko
w kontekście tego, *jakie* kości mamy, nie *które* konkretnie kostki
fizyczne. Cache żyje tylko na czas jednego wywołania top-level (scoreCard
jest w nim stały).

- **`rollsLeft = 0`**: `value = max` z `turnValue(...)` po wszystkich
  legalnych kategoriach (`canScoreCategory`).
- **`rollsLeft > 0`**: `value = max(`
  - najlepsze `turnValue(...)` "zatrzymaj się i punktuj teraz",
  - `max` po wszystkich 32 maskach trzymania z `E[valueAtRollsLeft(scoreCard,
    kości-po-przerzucie, rollsLeft - 1)]`, gdzie oczekiwanie liczone jest
    ważąc każdy możliwy wynik przerzutu (`rerollOutcomes`) jego
    prawdopodobieństwem
  `)`.

Na szczycie (`chooseBotRollDecision`) wybieramy akcję realizującą to
maksimum na **aktualnych, fizycznych** 5 kościach (żeby zwrócić poprawny
`boolean[5]` hold odpowiadający realnym pozycjom, a nie tylko multiset).
Remisy rozstrzygane na korzyść "score now" — bot nie przerzuca, jeśli
przerzut nie daje ściśle wyższego EV niż natychmiastowe zapunktowanie.

### Złożoność

Na jedną decyzję: 32 maski trzymania × ≤252 unikalnych wyników przerzutu
(dla `k=5`) × ≤13 kategorii, z memoizacją między warstwami `rollsLeft`. Rząd
wielkości 10⁵–10⁶ prostych operacji — pojedyncze do niskich dziesiątek
milisekund w przeglądarce. Mieści się z dużym zapasem w istniejącym oknie
"namysłu" (`DECISION_WINDOW_MS = 2500`), które zostaje jako sztuczne
opóźnienie UX niezależnie od (znikomego) realnego czasu liczenia.

## Testowanie

Każdy nowy plik dostaje współlokowany `*.test.ts` (konwencja repo z
CLAUDE.md):

- `rerollOutcomes.test.ts` — dla każdego `k = 0..5` suma prawdopodobieństw
  wszystkich wyników wynosi 1; liczba unikalnych multisetów zgadza się z
  `C(k+5,5)`.
- `strategy.test.ts` — scenariusze z ustalonych układów kości:
  - cztery-takie-same + piąta luźna → trzyma 4 pasujące, przerzuca piątą,
    chyba że natychmiastowe zapunktowanie ma ściśle wyższe EV,
  - układ tuż przed progiem 63 w sekcji górnej → wybór faworyzujący
    dobicie bonusu, nawet kosztem pozornie niższego surowego wyniku
    kategorii,
  - `rollsLeft === 2` (`DOUBLE_SCORE_ROLLS_LEFT`) poprawnie faworyzuje
    szybkie zapunktowanie kategorii dolnej, gdy podwojenie czyni to
    opłacalnym względem dalszego rzucania,
  - `rollsLeft === 0` (`chooseBotScoreDecision`) zawsze zwraca legalną
    kategorię o najwyższej `turnValue`.
- `useBotTurn.test.ts` (istniejący plik) — aktualizacja mocków: zamiast
  mockować `requestBotMove`, mockuje/wywołuje bezpośrednio nowy silnik;
  pełna sekwencja rzut → hold → rzut → punktacja pozostaje testowana
  end-to-end na poziomie hooka.

## Poza zakresem (świadomie)

- **Strategia międzyturowa** (poświęcanie słabszych kategorii na rzecz
  ważniejszych później, np. wolniejsza rezygnacja z yahtzee) — to osobny,
  dużo większy problem (przestrzeń stanów całej karty wyników jest
  praktycznie zbyt duża na dokładne rozwiązanie w runtime). Bot optymalizuje
  wyłącznie EV bieżącej tury.
- **Tryb online z botem** — silnik ląduje w `packages/game-engine` żeby to
  ułatwić w przyszłości, ale podłączenie do `functions/`/Firestore to
  osobny, przyszły etap.
- **Usunięcie `bot-server`/ścieżki LLM** — zostają w repo nieużywane, nie
  usuwane (patrz "Cel").
- **Konfigurowalny poziom trudności** — bot zawsze celuje w najlepszą
  dostępną opcję (tak jak w poprzednim etapie).
