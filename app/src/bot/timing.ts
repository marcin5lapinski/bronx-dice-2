export async function withDecisionWindow<T>(
  targetMs: number,
  task: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  const result = await task();
  const elapsed = Date.now() - start;
  const remaining = targetMs - elapsed;
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
  return result;
}
