import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import spawn from 'cross-spawn';
import { runClaudeHeadless } from './claudeClient';

vi.mock('cross-spawn', () => ({
  default: vi.fn(),
}));

function createFakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { end: ReturnType<typeof vi.fn> };
    kill: () => void;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { end: vi.fn() };
  child.kill = vi.fn();
  return child;
}

describe('runClaudeHeadless', () => {
  afterEach(() => {
    vi.mocked(spawn).mockReset();
  });

  it('resolves with stdout when the claude CLI exits successfully', async () => {
    const child = createFakeChild();
    vi.mocked(spawn).mockReturnValue(child as never);

    const promise = runClaudeHeadless('line one\nline two prompt');
    child.stdout.emit('data', Buffer.from('{"action":"score","category":"chance"}'));
    child.emit('close', 0, null);

    await expect(promise).resolves.toBe('{"action":"score","category":"chance"}');
    expect(spawn).toHaveBeenCalledWith(
      'claude',
      ['-p'],
      expect.objectContaining({ timeout: expect.any(Number) })
    );
    expect(child.stdin.end).toHaveBeenCalledWith('line one\nline two prompt');
  });

  it('passes a multi-line prompt via stdin instead of argv (argv is truncated at newlines on Windows)', async () => {
    const child = createFakeChild();
    vi.mocked(spawn).mockReturnValue(child as never);

    void runClaudeHeadless('first line\nsecond line\nthird line');

    expect(child.stdin.end).toHaveBeenCalledWith('first line\nsecond line\nthird line');
    const spawnArgs = vi.mocked(spawn).mock.calls[0];
    expect(spawnArgs[1]).not.toContain('first line\nsecond line\nthird line');
  });

  it('rejects when the claude CLI process itself fails to spawn', async () => {
    const child = createFakeChild();
    vi.mocked(spawn).mockReturnValue(child as never);

    const promise = runClaudeHeadless('some prompt');
    child.emit('error', new Error('boom'));

    await expect(promise).rejects.toThrow('boom');
  });

  it('rejects when the claude CLI exits with a non-zero code', async () => {
    const child = createFakeChild();
    vi.mocked(spawn).mockReturnValue(child as never);

    const promise = runClaudeHeadless('some prompt');
    child.stderr.emit('data', Buffer.from('something went wrong'));
    child.emit('close', 1, null);

    await expect(promise).rejects.toThrow('something went wrong');
  });

  it('rejects when the claude CLI is killed by a signal', async () => {
    const child = createFakeChild();
    vi.mocked(spawn).mockReturnValue(child as never);

    const promise = runClaudeHeadless('some prompt');
    child.emit('close', null, 'SIGTERM');

    await expect(promise).rejects.toThrow('SIGTERM');
  });
});
