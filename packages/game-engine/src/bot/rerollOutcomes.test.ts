import { describe, it, expect } from 'vitest';
import { REROLL_OUTCOMES_BY_K } from './rerollOutcomes';

const EXPECTED_UNIQUE_COUNTS = [1, 6, 21, 56, 126, 252];

describe('REROLL_OUTCOMES_BY_K', () => {
  it('has one entry per k = 0..5', () => {
    expect(REROLL_OUTCOMES_BY_K).toHaveLength(6);
  });

  EXPECTED_UNIQUE_COUNTS.forEach((expectedCount, k) => {
    it(`k=${k}: has C(${k}+5,5)=${expectedCount} unique multisets`, () => {
      expect(REROLL_OUTCOMES_BY_K[k]).toHaveLength(expectedCount);
    });

    it(`k=${k}: probabilities sum to 1`, () => {
      const total = REROLL_OUTCOMES_BY_K[k].reduce(
        (sum, outcome) => sum + outcome.probability,
        0
      );
      expect(total).toBeCloseTo(1, 10);
    });

    it(`k=${k}: every outcome has exactly k sorted-ascending values`, () => {
      for (const outcome of REROLL_OUTCOMES_BY_K[k]) {
        expect(outcome.values).toHaveLength(k);
        const sorted = [...outcome.values].sort((a, b) => a - b);
        expect(outcome.values).toEqual(sorted);
      }
    });
  });

  it('k=1: each face has probability 1/6', () => {
    for (const outcome of REROLL_OUTCOMES_BY_K[1]) {
      expect(outcome.probability).toBeCloseTo(1 / 6, 10);
    }
  });

  it('k=5: an all-sixes outcome has probability 1/6^5', () => {
    const allSixes = REROLL_OUTCOMES_BY_K[5].find((outcome) =>
      outcome.values.every((value) => value === 6)
    );
    expect(allSixes?.probability).toBeCloseTo(1 / 6 ** 5, 10);
  });
});
