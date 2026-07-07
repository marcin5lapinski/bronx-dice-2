import { execFile } from 'node:child_process';

const CLAUDE_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

export function runClaudeHeadless(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'claude',
      ['-p', prompt],
      { timeout: CLAUDE_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout);
      }
    );
  });
}
