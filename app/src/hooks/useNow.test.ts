// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNow } from './useNow';

describe('useNow', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the current time on mount', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const { result } = renderHook(() => useNow());
    expect(result.current).toBe(1_000_000);
  });

  it('ticks forward as time passes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const { result } = renderHook(() => useNow(1000));

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current).toBe(1_005_000);
  });
});
