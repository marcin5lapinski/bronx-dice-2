import { describe, it, expect } from 'vitest';
import { createEmptyScoreCard, type DiceValue } from '@bronx-dice/game-engine';
import { buildRollDecisionPrompt, buildScoreDecisionPrompt } from './promptBuilder';

describe('buildRollDecisionPrompt', () => {
  it('includes the dice, held state, rollsLeft, and open category previews', () => {
    const card = createEmptyScoreCard();
    const dice: DiceValue[] = [1, 1, 1, 4, 5];
    const heldDice = [true, true, true, false, false];
    const prompt = buildRollDecisionPrompt(card, dice, heldDice, 2);

    expect(prompt).toContain('1, 1, 1, 4, 5');
    expect(prompt).toContain('Pozostałe rzuty w tej turze: 2');
    expect(prompt).toContain('aces: 3 pkt');
    expect(prompt).toContain('fives: 5 pkt');
    expect(prompt).toContain('"action":"reroll"');
    expect(prompt).toContain('"action":"score"');
  });

  it('omits already-filled categories from the preview list', () => {
    const card = createEmptyScoreCard();
    const filled = { ...card, upper: { ...card.upper, fives: 10 } };
    const dice: DiceValue[] = [1, 1, 1, 4, 5];
    const prompt = buildRollDecisionPrompt(filled, dice, [false, false, false, false, false], 2);

    expect(prompt).not.toContain('fives:');
  });
});

describe('buildScoreDecisionPrompt', () => {
  it('includes the dice and open category previews, without a reroll option', () => {
    const card = createEmptyScoreCard();
    const dice: DiceValue[] = [6, 6, 6, 6, 6];
    const prompt = buildScoreDecisionPrompt(card, dice, 0);

    expect(prompt).toContain('6, 6, 6, 6, 6');
    expect(prompt).toContain('sixes: 30 pkt');
    expect(prompt).not.toContain('"action"');
    expect(prompt).toContain('"category"');
  });
});
