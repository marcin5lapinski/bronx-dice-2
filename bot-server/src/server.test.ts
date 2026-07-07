import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from './server';
import { runClaudeHeadless } from './claudeClient';

vi.mock('./claudeClient', () => ({
  runClaudeHeadless: vi.fn(),
}));

describe('POST /bot-move', () => {
  afterEach(() => {
    vi.mocked(runClaudeHeadless).mockReset();
  });

  it('returns the parsed JSON decision from Claude', async () => {
    vi.mocked(runClaudeHeadless).mockResolvedValue('{"category":"chance"}');

    const response = await request(createApp())
      .post('/bot-move')
      .send({ prompt: 'decide something' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ category: 'chance' });
  });

  it('rejects a request without a prompt', async () => {
    const response = await request(createApp()).post('/bot-move').send({});

    expect(response.status).toBe(400);
    expect(runClaudeHeadless).not.toHaveBeenCalled();
  });

  it('returns a 502 when the claude CLI call fails', async () => {
    vi.mocked(runClaudeHeadless).mockRejectedValue(new Error('CLI timed out'));

    const response = await request(createApp())
      .post('/bot-move')
      .send({ prompt: 'decide something' });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: 'CLI timed out' });
  });

  it('returns a 502 when the claude output has no parseable JSON', async () => {
    vi.mocked(runClaudeHeadless).mockResolvedValue('no json here');

    const response = await request(createApp())
      .post('/bot-move')
      .send({ prompt: 'decide something' });

    expect(response.status).toBe(502);
  });

  it('answers a CORS preflight so the browser-based app (a different origin/port) is allowed to call it', async () => {
    const response = await request(createApp())
      .options('/bot-move')
      .set('Origin', 'http://localhost:5179')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    expect(response.headers['access-control-allow-origin']).toBeTruthy();
  });

  it('includes the CORS header on the actual POST response too', async () => {
    vi.mocked(runClaudeHeadless).mockResolvedValue('{"category":"chance"}');

    const response = await request(createApp())
      .post('/bot-move')
      .set('Origin', 'http://localhost:5179')
      .send({ prompt: 'decide something' });

    expect(response.headers['access-control-allow-origin']).toBeTruthy();
  });
});
