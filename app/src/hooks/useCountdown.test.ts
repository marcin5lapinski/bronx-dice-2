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
    vi.setSystemTime(1_000_000);
    const { result } = renderHook(() => useCountdown(fakeTimestamp(1_000_000), 30));

    act(() => {
      vi.setSystemTime(1_000_000 + 5000);
      vi.advanceTimersByTime(1000);
    });

    expect(result.current).toBe(25);
  });

  it('never goes below zero', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const { result } = renderHook(() => useCountdown(fakeTimestamp(1_000_000), 30));

    act(() => {
      vi.setSystemTime(1_000_000 + 60_000);
      vi.advanceTimersByTime(1000);
    });

    expect(result.current).toBe(0);
  });
});
