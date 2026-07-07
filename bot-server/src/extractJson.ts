export function extractJson(rawOutput: string): unknown {
  const match = rawOutput.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('No JSON object found in Claude output');
  }
  return JSON.parse(match[0]);
}
