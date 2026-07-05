// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePresenceHeartbeat } from './usePresenceHeartbeat';
import { heartbeat } from '../services/roomService';

vi.mock('../services/roomService', () => ({
  heartbeat: vi.fn(),
}));

describe('usePresenceHeartbeat', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('pings the room immediately on mount', () => {
    vi.mocked(heartbeat).mockResolvedValue(undefined);
    renderHook(() => usePresenceHeartbeat('AAAAA'));
    expect(heartbeat).toHaveBeenCalledWith('AAAAA');
    expect(heartbeat).toHaveBeenCalledTimes(1);
  });

  it('pings again every 15 seconds', () => {
    vi.useFakeTimers();
    vi.mocked(heartbeat).mockResolvedValue(undefined);
    renderHook(() => usePresenceHeartbeat('AAAAA'));

    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(heartbeat).toHaveBeenCalledTimes(2);

    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(heartbeat).toHaveBeenCalledTimes(3);
  });

  it('stops pinging after unmount', () => {
    vi.useFakeTimers();
    vi.mocked(heartbeat).mockResolvedValue(undefined);
    const { unmount } = renderHook(() => usePresenceHeartbeat('AAAAA'));
    unmount();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(heartbeat).toHaveBeenCalledTimes(1);
  });

  it('swallows a rejected heartbeat call', async () => {
    vi.mocked(heartbeat).mockRejectedValue(new Error('network error'));
    expect(() => renderHook(() => usePresenceHeartbeat('AAAAA'))).not.toThrow();
    await act(async () => {
      await Promise.resolve();
    });
  });
});
