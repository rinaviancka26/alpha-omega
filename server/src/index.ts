import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { attachPty, inject, terminalStatus } from './pty.ts';
import * as L from './lib.ts';
import { mountDecisions } from './decisions.ts';
import { mountProjects } from './projects.ts';

export const PORT = Number(process.env.ALPHA_OMEGA_SERVER_PORT || 4317);
export const WEB_ORIGIN = 'http://localhost:4316';

const app = express();
app.use(cors({ origin: WEB_ORIGIN }));
app.use(express.json({ limit: '1mb' }));
const wrap = (fn: (req: express.Request, res: express.Response) => Promise<unknown>) =>
  (req: express.Request, res: express.Response) => { fn(req, res).catch((e) => { console.error('[api]', req.method, req.url, e); if (!res.headersSent) res.status(500).json({ error: L.redactString(String(e?.message || e)) }); }); };

app.get('/api/health', (_req, res) => { res.json({ ok: true }); });

// ---------- state ----------
app.get('/api/state', wrap(async (_req, res) => {
  const [config, registry, telemetry] = await Promise.all([L.getConfig(), L.getRegistry(), L.telemetryStatus()]);
  const active = config.activeProject && registry.projects.find((p) => p.slug === config.activeProject) ? config.activeProject : null;
  res.json({ config, registry, activeProject: active, project: active ? await L.projectData(active) : null, telemetry, serverTime: new Date().toISOString() });
}));
app.get('/api/projects/:slug', wrap(async (req, res) => {
  const slug = String(req.params.slug);
  if (!L.SLUG_RE.test(slug)) { res.status(400).json({ error: 'bad slug' }); return; }
  res.json(await L.projectData(slug));
}));
app.get('/api/events/recent', wrap(async (req, res) => {
  const limit = Math.max(1, Math.min(2000, Number(req.query.limit) || 200));
  res.json({ events: await L.recentEvents(limit) });
}));
app.get('/api/timeline', wrap(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  res.json(await L.timeline({ limit: Math.min(500, Number(q.limit) || 50), cursor: q.cursor || null, project: q.project || undefined, agent: q.agent || undefined, type: q.type || undefined }));
}));
app.post('/api/active', wrap(async (req, res) => {
  const slug = req.body?.slug ?? null;
  if (slug !== null) {
    const reg = await L.getRegistry();
    if (!reg.projects.some((p) => p.slug === slug)) { res.status(404).json({ error: `unknown project "${slug}"` }); return; }
  }
  await L.lockedUpdateJson<L.Config>(L.P.config(), (c) => ({ ...c, activeProject: slug }), { activeProject: null });
  res.json({ ok: true, activeProject: slug });
}));
app.get('/api/telemetry-status', wrap(async (_req, res) => { res.json(await L.telemetryStatus()); }));

mountDecisions(app, wrap);
mountProjects(app, wrap);

// ---------- SSE ----------
const clients = new Set<express.Response>();
app.get('/api/stream', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(`retry: 1500\n\n`);
  res.write(`data: ${JSON.stringify({ kind: 'hello', project: null, file: '' })}\n\n`);
  clients.add(res);
  const ping = setInterval(() => res.write(`: ping\n\n`), 15000);
  req.on('close', () => { clearInterval(ping); clients.delete(res); });
});
export function broadcast(c: L.Change) { const line = `data: ${JSON.stringify(c)}\n\n`; for (const r of clients) r.write(line); }
L.watchSatoru(broadcast);

// ---------- terminal ----------
app.get('/api/terminal-status', wrap(async (_req, res) => { res.json(await terminalStatus()); }));
app.post('/api/terminal/inject', wrap(async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text : '';
  if (!text.trim()) { res.status(400).json({ injected: false, reason: 'text required' }); return; }
  res.json(await inject(text));
}));

const server = http.createServer(app);
attachPty(server);
server.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`));
