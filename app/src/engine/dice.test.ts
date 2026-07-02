import { describe, it, expect } from 'vitest';
import { rollDice, createEmptyDice, DICE_COUNT, MAX_ROLLS } from './dice';
import type { DiceValue } from '../types/game';

describe('constants', () => {
  it('DICE_COUNT is 5', () => {
    expect(DICE_COUNT).toBe(5);
  });

  it('MAX_ROLLS is 3', () => {
    expect(MAX_ROLLS).toBe(3);
  });
});

describe('createEmptyDice', () => {
  it('returns an empty array', () => {
    expect(createEmptyDice()).toEqual([]);
  });
});

describe('rollDice', () => {
  it('rolls all 5 dice fresh when nothing is held and no dice exist yet', () => {
    const sequence = [0, 0.2, 0.4, 0.6, 0.8]; // floor(x*6)+1 -> 1,2,3,4,5
    let call = 0;
    const random = () => sequence[call++];
    const result = rollDice([], [false, false, false, false, false], random);
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });

  it('keeps held dice unchanged and rerolls the rest', () => {
    const current: DiceValue[] = [6, 6, 6, 6, 6];
    const held = [true, false, true, false, true];
    const random = () => 0; // floor(0*6)+1 -> 1
    const result = rollDice(current, held, random);
    expect(result).toEqual([6, 1, 6, 1, 6]);
  });

  it('always returns DICE_COUNT dice', () => {
    const result = rollDice(
      [],
      [false, false, false, false, false],
      () => 0.99
    );
    expect(result).toHaveLength(DICE_COUNT);
  });

  it('defaults to Math.random when no random function is passed', () => {
    const result = rollDice([], [false, false, false, false, false]);
    expect(result).toHaveLength(DICE_COUNT);
    for (const value of result) {
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(6);
    }
  });
});
