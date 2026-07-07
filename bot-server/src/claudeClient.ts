import spawn from 'cross-spawn';

const CLAUDE_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

export function runClaudeHeadless(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p'], { timeout: CLAUDE_TIMEOUT_MS });
    let stdout = '';
    let stderr = '';
    let outputBytes = 0;
    let settled = false;

    child.stdout?.on('data', (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT_BYTES) {
        settled = true;
        child.kill();
        reject(new Error('claude CLI output exceeded maximum size'));
        return;
      }
      stdout += chunk;
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });

    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      if (signal) {
        reject(
          new Error(`claude CLI terminated by signal ${signal}${stderr ? `: ${stderr}` : ''}`)
        );
        return;
      }
      if (code !== 0) {
        reject(new Error(stderr || `claude CLI exited with code ${code}`));
        return;
      }
      resolve(stdout);
    });

    child.stdin.end(prompt);
  });
}
