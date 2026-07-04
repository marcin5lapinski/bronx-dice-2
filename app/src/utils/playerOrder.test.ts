import { describe, it, expect } from 'vitest';
import {
  reorderNames,
  reorderIds,
  shufflePlayerOrder,
  type PlayerNameRow,
} from './playerOrder';

describe('reorderNames', () => {
  const rows: PlayerNameRow[] = [
    { id: 'a', value: 'Ola' },
    { id: 'b', value: 'Kuba' },
    { id: 'c', value: 'Ala' },
  ];

  it('moves a row to a new position', () => {
    const result = reorderNames(rows, 'c', 'a');
    expect(result.map((row) => row.id)).toEqual(['c', 'a', 'b']);
  });

  it('returns the same array when activeId equals overId', () => {
    const result = reorderNames(rows, 'b', 'b');
    expect(result).toEqual(rows);
  });

  it('returns the same array when overId is null', () => {
    const result = reorderNames(rows, 'b', null);
    expect(result).toEqual(rows);
  });

  it('returns the same array when an id is not found', () => {
    const result = reorderNames(rows, 'does-not-exist', 'a');
    expect(result).toEqual(rows);
  });

  it('returns the same array when overId is not found', () => {
    const result = reorderNames(rows, 'a', 'does-not-exist');
    expect(result).toEqual(rows);
  });
});

describe('reorderIds', () => {
  const ids = ['a', 'b', 'c'];

  it('moves an id to a new position', () => {
    expect(reorderIds(ids, 'c', 'a')).toEqual(['c', 'a', 'b']);
  });

  it('returns the same array when activeId equals overId', () => {
    expect(reorderIds(ids, 'b', 'b')).toEqual(ids);
  });

  it('returns the same array when overId is null', () => {
    expect(reorderIds(ids, 'b', null)).toEqual(ids);
  });

  it('returns the same array when an id is not found', () => {
    expect(reorderIds(ids, 'does-not-exist', 'a')).toEqual(ids);
  });

  it('returns the same array when overId is not found', () => {
    expect(reorderIds(ids, 'a', 'does-not-exist')).toEqual(ids);
  });
});

describe('shufflePlayerOrder', () => {
  it('returns a new array containing the same elements', () => {
    const names = ['Ola', 'Kuba', 'Ala'];
    const result = shufflePlayerOrder(names, () => 0);
    expect(result).not.toBe(names);
    expect(result.slice().sort()).toEqual(names.slice().sort());
  });

  it('produces a deterministic order for a fixed random sequence', () => {
    const names = ['A', 'B', 'C', 'D'];
    const random = () => 0; // always picks index 0 as the swap target
    const result = shufflePlayerOrder(names, random);
    // Fisher-Yates from i=3 down to i=1, j=floor(0*(i+1))=0 each step:
    // i=3: swap(3,0) -> [D,B,C,A]
    // i=2: swap(2,0) -> [C,B,D,A]
    // i=1: swap(1,0) -> [B,C,D,A]
    expect(result).toEqual(['B', 'C', 'D', 'A']);
  });

  it('defaults to Math.random when no random function is passed', () => {
    const names = ['A', 'B', 'C'];
    const result = shufflePlayerOrder(names);
    expect(result.slice().sort()).toEqual(names.slice().sort());
  });
});
