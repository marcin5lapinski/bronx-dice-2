const BOT_SERVER_URL = 'http://localhost:4100/bot-move';

export async function requestBotMove(prompt: string): Promise<unknown> {
  const response = await fetch(BOT_SERVER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!response.ok) {
    throw new Error(`bot-server responded with status ${response.status}`);
  }
  return response.json();
}
