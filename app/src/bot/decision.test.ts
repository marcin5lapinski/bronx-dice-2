import { describe, it, expect } from 'vitest';
import { createEmptyScoreCard } from '@bronx-dice/game-engine';
import { parseRollDecision, parseScoreDecision } from './decision';

describe('parseRollDecision', () => {
  it('accepts a valid reroll decision', () => {
    const card = createEmptyScoreCard();
    const raw = { action: 'reroll', hold: [true, false, false, false, false] };
    expect(parseRollDecision(raw, card)).toEqual({
      action: 'reroll',
      hold: [true, false, false, false, false],
    });
  });

  it('accepts a valid score decision for an open category', () => {
    const card = createEmptyScoreCard();
    const raw = { action: 'score', category: 'fives' };
    expect(parseRollDecision(raw, card)).toEqual({
      action: 'score',
      category: 'fives',
    });
  });

  it('rejects a score decision for an already-filled category', () => {
    const card = createEmptyScoreCard();
    const filled = { ...card, upper: { ...card.upper, fives: 10 } };
    const raw = { action: 'score', category: 'fives' };
    expect(parseRollDecision(raw, filled)).toBeNull();
  });

  it('rejects a score decision for a lower category before the upper section is full', () => {
    const card = createEmptyScoreCard();
    const raw = { action: 'score', category: 'chance' };
    expect(parseRollDecision(raw, card)).toBeNull();
  });

  it('rejects a reroll decision with a malformed hold array', () => {
    const card = createEmptyScoreCard();
    expect(parseRollDecision({ action: 'reroll', hold: [true, false] }, card)).toBeNull();
    expect(
      parseRollDecision({ action: 'reroll', hold: [1, 0, 0, 0, 0] }, card)
    ).toBeNull();
  });

  it('rejects an unrecognized shape', () => {
    const card = createEmptyScoreCard();
    expect(parseRollDecision({ action: 'give-up' }, card)).toBeNull();
    expect(parseRollDecision(null, card)).toBeNull();
    expect(parseRollDecision('not an object', card)).toBeNull();
  });
});

describe('parseScoreDecision', () => {
  it('accepts a valid category', () => {
    const card = createEmptyScoreCard();
    expect(parseScoreDecision({ category: 'sixes' }, card)).toBe('sixes');
  });

  it('rejects an already-filled category', () => {
    const card = createEmptyScoreCard();
    const filled = { ...card, upper: { ...card.upper, sixes: 12 } };
    expect(parseScoreDecision({ category: 'sixes' }, filled)).toBeNull();
  });

  it('rejects a malformed response', () => {
    const card = createEmptyScoreCard();
    expect(parseScoreDecision({ category: 'not-a-category' }, card)).toBeNull();
    expect(parseScoreDecision(null, card)).toBeNull();
  });
});
