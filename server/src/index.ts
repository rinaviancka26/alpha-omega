import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { attachPty, inject, terminalStatus } from './pty.ts';

export const PORT = Number(process.env.ALPHA_OMEGA_SERVER_PORT || 4317);
export const WEB_ORIGIN = 'http://localhost:4316';

const app = express();
app.use(cors({ origin: WEB_ORIGIN }));
app.use(express.json({ limit: '1mb' }));
app.get('/api/health', (_req, res) => { res.json({ ok: true }); });

app.get('/api/terminal-status', async (_req, res) => { res.json(await terminalStatus()); });
app.post('/api/terminal/inject', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text : '';
  if (!text.trim()) { res.status(400).json({ injected: false, reason: 'text required' }); return; }
  res.json(await inject(text));
});

const server = http.createServer(app);
attachPty(server);
server.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`));
