// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useRoom } from './useRoom';

const mockDoc = vi.fn();
const mockOnSnapshot = vi.fn();

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
}));

vi.mock('../firebase/client', () => ({
  db: 'the-db-instance',
}));

describe('useRoom', () => {
  it('subscribes to rooms/{roomId} and exposes the latest document', async () => {
    mockDoc.mockReturnValue('room-ref');
    let capturedCallback: (snapshot: unknown) => void = () => {};
    mockOnSnapshot.mockImplementation((_ref, callback) => {
      capturedCallback = callback;
      return () => {};
    });

    const { result } = renderHook(() => useRoom('AAAAA'));

    expect(mockDoc).toHaveBeenCalledWith('the-db-instance', 'rooms', 'AAAAA');
    expect(result.current.loading).toBe(true);

    capturedCallback({ exists: () => true, data: () => ({ phase: 'lobby' }) });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.room).toEqual({ phase: 'lobby' });
    expect(result.current.notFound).toBe(false);
  });

  it('sets notFound when the room document does not exist', async () => {
    mockDoc.mockReturnValue('room-ref');
    let capturedCallback: (snapshot: unknown) => void = () => {};
    mockOnSnapshot.mockImplementation((_ref, callback) => {
      capturedCallback = callback;
      return () => {};
    });

    const { result } = renderHook(() => useRoom('AAAAA'));
    capturedCallback({ exists: () => false });

    await waitFor(() => expect(result.current.notFound).toBe(true));
    expect(result.current.room).toBeNull();
  });

  it('unsubscribes on unmount', () => {
    mockDoc.mockReturnValue('room-ref');
    const unsubscribe = vi.fn();
    mockOnSnapshot.mockReturnValue(unsubscribe);

    const { unmount } = renderHook(() => useRoom('AAAAA'));
    unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });

  it('sets disconnected when the onSnapshot listener reports an error', async () => {
    mockDoc.mockReturnValue('room-ref');
    let capturedError: (error: unknown) => void = () => {};
    mockOnSnapshot.mockImplementation((_ref, _onNext, onError) => {
      capturedError = onError;
      return () => {};
    });

    const { result } = renderHook(() => useRoom('AAAAA'));
    capturedError(new Error('unavailable'));

    await waitFor(() => expect(result.current.disconnected).toBe(true));
  });

  it('clears disconnected once a later snapshot succeeds', async () => {
    mockDoc.mockReturnValue('room-ref');
    let capturedNext: (snapshot: unknown) => void = () => {};
    let capturedError: (error: unknown) => void = () => {};
    mockOnSnapshot.mockImplementation((_ref, onNext, onError) => {
      capturedNext = onNext;
      capturedError = onError;
      return () => {};
    });

    const { result } = renderHook(() => useRoom('AAAAA'));
    capturedError(new Error('unavailable'));
    await waitFor(() => expect(result.current.disconnected).toBe(true));

    capturedNext({ exists: () => true, data: () => ({ phase: 'lobby' }) });
    await waitFor(() => expect(result.current.disconnected).toBe(false));
  });

  it('tracks disconnected via browser online/offline events', async () => {
    mockDoc.mockReturnValue('room-ref');
    mockOnSnapshot.mockImplementation(() => () => {});
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);

    const { result } = renderHook(() => useRoom('AAAAA'));
    expect(result.current.disconnected).toBe(false);

    window.dispatchEvent(new Event('offline'));
    await waitFor(() => expect(result.current.disconnected).toBe(true));

    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(result.current.disconnected).toBe(false));
  });
});
