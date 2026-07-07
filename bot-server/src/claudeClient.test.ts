import { describe, it, expect, vi, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import { runClaudeHeadless } from './claudeClient';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

describe('runClaudeHeadless', () => {
  afterEach(() => {
    vi.mocked(execFile).mockReset();
  });

  it('resolves with stdout when the claude CLI succeeds', async () => {
    (vi.mocked(execFile) as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (
        _file: string,
        _args: string[],
        _options: unknown,
        callback: (error: Error | null, stdout: string, stderr: string) => void
      ) => {
        callback(null, '{"action":"score","category":"chance"}', '');
      }
    );

    const stdout = await runClaudeHeadless('some prompt');

    expect(stdout).toBe('{"action":"score","category":"chance"}');
    expect(execFile).toHaveBeenCalledWith(
      'claude',
      ['-p', 'some prompt'],
      expect.objectContaining({ timeout: expect.any(Number) }),
      expect.any(Function)
    );
  });

  it('rejects when the claude CLI errors', async () => {
    (vi.mocked(execFile) as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (
        _file: string,
        _args: string[],
        _options: unknown,
        callback: (error: Error | null, stdout: string, stderr: string) => void
      ) => {
        callback(new Error('boom'), '', '');
      }
    );

    await expect(runClaudeHeadless('some prompt')).rejects.toThrow('boom');
  });
});
