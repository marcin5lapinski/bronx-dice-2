import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as roomService from './roomService';

const mockHttpsCallable = vi.fn();

vi.mock('firebase/functions', () => ({
  httpsCallable: (...args: unknown[]) => mockHttpsCallable(...args),
}));

vi.mock('../firebase/client', () => ({
  functions: 'the-functions-instance',
}));

describe('roomService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createRoom calls the createRoom callable and returns the roomId', async () => {
    const call = vi.fn().mockResolvedValue({ data: { roomId: 'AAAAA' } });
    mockHttpsCallable.mockReturnValue(call);

    const roomId = await roomService.createRoom({ maxPlayers: 3, turnTimeLimitSeconds: 30 });

    expect(mockHttpsCallable).toHaveBeenCalledWith('the-functions-instance', 'createRoom');
    expect(call).toHaveBeenCalledWith({ maxPlayers: 3, turnTimeLimitSeconds: 30 });
    expect(roomId).toBe('AAAAA');
  });

  it('joinRoom calls the joinRoom callable with the roomId', async () => {
    const call = vi.fn().mockResolvedValue({ data: undefined });
    mockHttpsCallable.mockReturnValue(call);

    await roomService.joinRoom('AAAAA');

    expect(mockHttpsCallable).toHaveBeenCalledWith('the-functions-instance', 'joinRoom');
    expect(call).toHaveBeenCalledWith({ roomId: 'AAAAA' });
  });

  it('setReady calls the setReady callable with roomId and ready', async () => {
    const call = vi.fn().mockResolvedValue({ data: undefined });
    mockHttpsCallable.mockReturnValue(call);

    await roomService.setReady('AAAAA', true);

    expect(call).toHaveBeenCalledWith({ roomId: 'AAAAA', ready: true });
  });

  it('startGame calls the startGame callable with the roomId', async () => {
    const call = vi.fn().mockResolvedValue({ data: undefined });
    mockHttpsCallable.mockReturnValue(call);

    await roomService.startGame('AAAAA');

    expect(call).toHaveBeenCalledWith({ roomId: 'AAAAA' });
  });

  it('rollDice calls the rollDice callable with the roomId', async () => {
    const call = vi.fn().mockResolvedValue({ data: undefined });
    mockHttpsCallable.mockReturnValue(call);

    await roomService.rollDice('AAAAA');

    expect(call).toHaveBeenCalledWith({ roomId: 'AAAAA' });
  });

  it('toggleHeldDie calls the toggleHeldDie callable with roomId and dieIndex', async () => {
    const call = vi.fn().mockResolvedValue({ data: undefined });
    mockHttpsCallable.mockReturnValue(call);

    await roomService.toggleHeldDie('AAAAA', 2);

    expect(call).toHaveBeenCalledWith({ roomId: 'AAAAA', dieIndex: 2 });
  });

  it('scoreCategory calls the scoreCategory callable with roomId and category', async () => {
    const call = vi.fn().mockResolvedValue({ data: undefined });
    mockHttpsCallable.mockReturnValue(call);

    await roomService.scoreCategory('AAAAA', 'chance');

    expect(call).toHaveBeenCalledWith({ roomId: 'AAAAA', category: 'chance' });
  });

  it('leaveRoom calls the leaveRoom callable with the roomId', async () => {
    const call = vi.fn().mockResolvedValue({ data: undefined });
    mockHttpsCallable.mockReturnValue(call);

    await roomService.leaveRoom('AAAAA');

    expect(call).toHaveBeenCalledWith({ roomId: 'AAAAA' });
  });

  it('handleTurnTimeout calls the handleTurnTimeout callable with the roomId', async () => {
    const call = vi.fn().mockResolvedValue({ data: undefined });
    mockHttpsCallable.mockReturnValue(call);

    await roomService.handleTurnTimeout('AAAAA');

    expect(call).toHaveBeenCalledWith({ roomId: 'AAAAA' });
  });
});
