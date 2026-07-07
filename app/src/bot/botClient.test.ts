import { describe, it, expect, vi, afterEach } from 'vitest';
import { requestBotMove } from './botClient';

describe('requestBotMove', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the prompt and returns the parsed JSON response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ category: 'chance' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await requestBotMove('what should I do?');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4100/bot-move',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ prompt: 'what should I do?' }),
      })
    );
    expect(result).toEqual({ category: 'chance' });
  });

  it('throws when the response is not ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 502 });
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestBotMove('what should I do?')).rejects.toThrow(
      'bot-server responded with status 502'
    );
  });

  it('propagates a network failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestBotMove('what should I do?')).rejects.toThrow('network down');
  });
});
