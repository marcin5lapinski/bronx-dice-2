import {
  UPPER_CATEGORIES,
  LOWER_CATEGORIES,
  canScoreCategory,
  type DiceValue,
  type PlayerScoreCard,
} from '@bronx-dice/game-engine';
import { previewScore } from '../utils/previewScore';
import { HOUSE_RULES_TEXT } from './houseRules';

const ALL_CATEGORIES = [...UPPER_CATEGORIES, ...LOWER_CATEGORIES];

function openCategoryLines(
  scoreCard: PlayerScoreCard,
  dice: DiceValue[],
  rollsLeft: number
): string {
  return ALL_CATEGORIES.filter((category) => canScoreCategory(scoreCard, category))
    .map(
      (category) =>
        `- ${category}: ${previewScore(scoreCard, category, dice, rollsLeft)} pkt jeśli wybierzesz teraz`
    )
    .join('\n');
}

export function buildRollDecisionPrompt(
  scoreCard: PlayerScoreCard,
  dice: DiceValue[],
  heldDice: boolean[],
  rollsLeft: number
): string {
  return `${HOUSE_RULES_TEXT}

Grasz w kości. Aktualny stan Twojej tury:
- Kości: ${dice.join(', ')}
- Aktualnie trzymane kości (index:trzymana): ${heldDice
    .map((held, index) => `${index}:${held}`)
    .join(', ')}
- Pozostałe rzuty w tej turze: ${rollsLeft}

Dostępne (jeszcze niewypełnione) kategorie i ich wynik, gdyby wybrać je teraz:
${openCategoryLines(scoreCard, dice, rollsLeft)}

Zdecyduj: czy rzucić ponownie kośćmi, które NIE są trzymane (podaj które kości trzymać przy kolejnym rzucie), czy zakończyć turę i zapunktować teraz najlepszą dostępną kategorią.
Odpowiedz WYŁĄCZNIE jednym obiektem JSON, bez żadnego dodatkowego tekstu, w jednym z dwóch formatów:
{"action":"reroll","hold":[bool,bool,bool,bool,bool]}
{"action":"score","category":"<jedna z nazw kategorii powyżej>"}`;
}

export function buildScoreDecisionPrompt(
  scoreCard: PlayerScoreCard,
  dice: DiceValue[],
  rollsLeft: number
): string {
  return `${HOUSE_RULES_TEXT}

Grasz w kości. To już ostatni rzut w tej turze, musisz teraz zapunktować.
- Kości: ${dice.join(', ')}

Dostępne (jeszcze niewypełnione) kategorie i ich wynik, gdyby wybrać je teraz:
${openCategoryLines(scoreCard, dice, rollsLeft)}

Wybierz najlepszą dostępną kategorię do zapunktowania.
Odpowiedz WYŁĄCZNIE jednym obiektem JSON, bez żadnego dodatkowego tekstu, w formacie:
{"category":"<jedna z nazw kategorii powyżej>"}`;
}
