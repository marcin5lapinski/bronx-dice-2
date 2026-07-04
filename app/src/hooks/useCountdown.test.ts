// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Timestamp } from 'firebase/firestore';
import { useCountdown } from './useCountdown';

function fakeTimestamp(millis: number): Timestamp {
  return { toMillis: () => millis } as Timestamp;
}

describe('useCountdown', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the full limit right after the turn starts', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const { result } = renderHook(() => useCountdown(fakeTimestamp(1_000_000), 30));
    expect(result.current).toBe(30);
  });

  it('counts down as time passes', () => {
    vi.useFakeTimers();
    const start = Date.now();
    const { result } = renderHook(() => useCountdown(fakeTimestamp(start), 30));

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current).toBe(25);
  });

  it('never goes below zero', () => {
    vi.useFakeTimers();
    const start = Date.now();
    const { result } = renderHook(() => useCountdown(fakeTimestamp(start), 30));

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(result.current).toBe(0);
  });
});
