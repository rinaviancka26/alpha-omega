import express from 'express';
import cors from 'cors';
import http from 'node:http';

export const PORT = Number(process.env.ALPHA_OMEGA_SERVER_PORT || 4317);
export const WEB_ORIGIN = 'http://localhost:4316';

const app = express();
app.use(cors({ origin: WEB_ORIGIN }));
app.use(express.json({ limit: '1mb' }));
app.get('/api/health', (_req, res) => { res.json({ ok: true }); });

const server = http.createServer(app);
server.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`));
