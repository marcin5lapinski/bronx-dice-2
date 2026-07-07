import express, { type Express } from 'express';
import { runClaudeHeadless } from './claudeClient';
import { extractJson } from './extractJson';

export const PORT = 4100;

export function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });
  app.options('/bot-move', (_req, res) => {
    res.sendStatus(204);
  });

  app.post('/bot-move', async (req, res) => {
    const { prompt } = req.body as { prompt?: unknown };
    if (typeof prompt !== 'string' || prompt.length === 0) {
      res.status(400).json({ error: 'prompt must be a non-empty string' });
      return;
    }
    try {
      const stdout = await runClaudeHeadless(prompt);
      const decision = extractJson(stdout);
      res.json(decision);
    } catch (err) {
      res
        .status(502)
        .json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  return app;
}

export function startServer(): void {
  createApp().listen(PORT, () => {
    console.log(`bot-server listening on http://localhost:${PORT}`);
  });
}
