import { describe, it, expect } from 'vitest';
import { withDecisionWindow } from './timing';

describe('withDecisionWindow', () => {
  it('pads out to the target window when the task finishes early', async () => {
    const start = Date.now();
    const result = await withDecisionWindow(80, async () => 'done-fast');
    const elapsed = Date.now() - start;

    expect(result).toBe('done-fast');
    expect(elapsed).toBeGreaterThanOrEqual(75);
  });

  it('does not add extra delay when the task already exceeds the window', async () => {
    const start = Date.now();
    const result = await withDecisionWindow(
      20,
      () => new Promise<string>((resolve) => setTimeout(() => resolve('done-slow'), 60))
    );
    const elapsed = Date.now() - start;

    expect(result).toBe('done-slow');
    expect(elapsed).toBeGreaterThanOrEqual(60);
    expect(elapsed).toBeLessThan(150);
  });

  it('propagates a rejection from the task without waiting out the window', async () => {
    await expect(
      withDecisionWindow(80, async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
  });
});
