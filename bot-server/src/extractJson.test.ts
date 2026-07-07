import { describe, it, expect } from 'vitest';
import { extractJson } from './extractJson';

describe('extractJson', () => {
  it('parses a raw JSON object', () => {
    expect(extractJson('{"category":"chance"}')).toEqual({ category: 'chance' });
  });

  it('extracts JSON surrounded by extra text', () => {
    const output =
      'Here is my answer:\n{"action":"reroll","hold":[true,false,false,false,false]}\nDone.';
    expect(extractJson(output)).toEqual({
      action: 'reroll',
      hold: [true, false, false, false, false],
    });
  });

  it('throws when no JSON object is present', () => {
    expect(() => extractJson('no json here')).toThrow(
      'No JSON object found in Claude output'
    );
  });

  it('throws when the extracted text is not valid JSON', () => {
    expect(() => extractJson('{not valid json}')).toThrow();
  });
});
