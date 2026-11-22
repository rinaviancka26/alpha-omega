// State layer over .satoru/ (the ONLY runtime write location).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import chokidar from 'chokidar';
import { readJson, writeJson, lockedUpdateJson, appendEvent, redact, redactString, localDate, EVENT_TYPES } from '../../hooks/lib/io.mjs';
import type { SatoruEvent } from '../../hooks/lib/io.mjs';
import { SATORU, CARD_JSON } from './paths.ts';

export { readJson, writeJson, lockedUpdateJson, appendEvent, redact, redactString, localDate, EVENT_TYPES };
export type { SatoruEvent };

// ---------- types ----------
export type AgentState = 'idle' | 'working' | 'completed' | 'briefing' | 'meeting' | 'approval' | 'blocked';
export type Agent = { state: AgentState; task?: string | null; say?: string | null; since?: string; heartbeat?: string; intendedRoom?: string | null; voice?: string | null; directiveAt?: string | null };
export type Agents = { agents: Record<string, Agent> };
export type Task = { id: string; title: string; owner: string; status: 'planned' | 'in_progress' | 'review' | 'blocked' | 'done'; files?: string[]; verified?: boolean; updated?: string; started?: string; note?: string };
export type Plan = { status: 'awaiting-approval' | 'approved' | 'changes-requested' | 'rejected'; title: string; scope: string; risks: string[]; tasks: { id: string; title: string; owner: string; files: string[] }[]; created?: string; decidedAt?: string; note?: string };
export type Approval = { id: string; title: string; risk: 'low' | 'med' | 'high'; reason: string; status: 'pending' | 'approved' | 'rejected' | 'discuss'; created: string; decidedAt?: string; note?: string; agent?: string };
export type Config = { activeProject: string | null; projectsRoot?: string };
export type Registry = { projects: { slug: string; name: string; path: string }[] };

export const P = {
  config: () => path.join(SATORU, 'config.json'),
  registry: () => path.join(SATORU, 'registry.json'),
  events: () => path.join(SATORU, 'events'),
  project: (slug: string) => path.join(SATORU, 'projects', slug),
  file: (slug: string, f: 'agents' | 'tasks' | 'plan' | 'approvals' | 'mission') => path.join(SATORU, 'projects', slug, `${f}.json`),
};
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function card(): { appName: string; team: { name: string; role: string; worksIn: string }[]; rooms: Record<string, string> } {
  return JSON.parse(fs.readFileSync(CARD_JSON, 'utf8'));
}

export async function getConfig(): Promise<Config> { const c = await readJson<Config>(P.config(), { activeProject: null }); return { ...(c || {}), activeProject: c?.activeProject ?? null }; }
export async function getRegistry(): Promise<Registry> { const r = await readJson<Registry>(P.registry(), { projects: [] }); return { projects: Array.isArray(r?.projects) ? r.projects : [] }; }

export async function projectData(slug: string) {
  const [agents, tasks, plan, approvals, mission] = await Promise.all([
    readJson<Agents>(P.file(slug, 'agents'), { agents: {} }),
    readJson<{ tasks: Task[] }>(P.file(slug, 'tasks'), { tasks: [] }),
    readJson<Plan | null>(P.file(slug, 'plan'), null),
    readJson<{ approvals: Approval[] }>(P.file(slug, 'approvals'), { approvals: [] }),
    readJson<Record<string, unknown> | null>(P.file(slug, 'mission'), null),
  ]);
  return { slug, agents: agents?.agents ?? {}, tasks: tasks?.tasks ?? [], plan, approvals: approvals?.approvals ?? [], mission };
}

// ---------- events ----------
async function dayFiles(): Promise<string[]> {
  try { return (await fsp.readdir(P.events())).filter((f) => /^\d{4}-\d{2}-\d{2}\.ndjson$/.test(f)).sort(); } catch { return []; }
}
export function parseLines(txt: string): SatoruEvent[] {
  const out: SatoruEvent[] = [];
  for (const line of txt.split('\n')) { if (!line.trim()) continue; try { out.push(JSON.parse(line)); } catch { /* torn tail line */ } }
  return out;
}
/** Most recent `limit` events across day files, oldest → newest. */
export async function recentEvents(limit = 200): Promise<SatoruEvent[]> {
  const files = await dayFiles();
  let acc: SatoruEvent[] = [];
  for (let i = files.length - 1; i >= 0 && acc.length < limit; i--) {
    const evs = parseLines(await fsp.readFile(path.join(P.events(), files[i]), 'utf8'));
    acc = evs.concat(acc);
  }
  acc.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  return acc.slice(-limit);
}

export type TimelineEntry = SatoruEvent & { cursor: string; day: string };
/**
 * Timeline page, newest first, over the last `days` day files.
 * Cursor = "<ts>|<dayfile>#<line>" of the last entry returned; the next page starts strictly after it
 * in (ts desc, dayfile desc, line desc) order, so identical timestamps never get skipped or repeated.
 */
export async function timeline(opts: { limit?: number; cursor?: string | null; project?: string; agent?: string; type?: string; days?: number }) {
  const { limit = 50, cursor, project, agent, type, days = 14 } = opts;
  const files = (await dayFiles()).slice(-days);
  const all: TimelineEntry[] = [];
  for (const f of files) {
    const txt = await fsp.readFile(path.join(P.events(), f), 'utf8');
    txt.split('\n').forEach((line, i) => {
      if (!line.trim()) return;
      try { const e = JSON.parse(line); all.push({ ...e, day: f.slice(0, 10), cursor: `${e.ts}|${f}#${i + 1}` }); } catch { /* skip torn */ }
    });
  }
  const key = (e: { ts: string; cursor: string }) => {
    const [, ref] = e.cursor.split('|'); const [file, line] = ref.split('#');
    return [Date.parse(e.ts), file, Number(line)] as const;
  };
  const cmp = (a: readonly [number, string, number], b: readonly [number, string, number]) =>
    b[0] - a[0] || (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0) || b[2] - a[2];
  all.sort((a, b) => cmp(key(a), key(b)));
  const match = (e: TimelineEntry) =>
    (!project || (project === 'unattributed' ? !e.project : e.project === project)) &&
    (!agent || (agent === 'unattributed' ? !e.agent : e.agent === agent)) &&
    (!type || e.type === type);
  let start = 0;
  if (cursor) {
    const [ts, ref] = cursor.split('|');
    const [file, line] = (ref || '').split('#');
    const ck = [Date.parse(ts), file, Number(line)] as const;
    start = all.findIndex((e) => cmp(ck, key(e)) < 0);
    if (start < 0) start = all.length;
  }
  const page: TimelineEntry[] = [];
  let i = start;
  for (; i < all.length && page.length < limit; i++) if (match(all[i])) page.push(all[i]);
  const more = all.slice(i).some(match);
  return { events: page, nextCursor: more && page.length ? page[page.length - 1].cursor : null };
}

export async function telemetryStatus() {
  const evs = await recentEvents(500);
  const last = evs[evs.length - 1];
  let liveSession = false;
  for (let i = evs.length - 1; i >= 0; i--) {
    const e = evs[i];
    if (e.type === 'session_end') { liveSession = false; break; }
    if (e.type === 'session_start') { liveSession = true; break; }
  }
  return { lastEventTs: last?.ts ?? null, liveSession };
}

// ---------- watcher → SSE ----------
export type Change = { kind: string; project: string | null; file: string };
export function classify(abs: string): Change | null {
  const rel = path.relative(SATORU, abs).split(path.sep).join('/');
  if (rel.endsWith('.lock') || rel.endsWith('.tmp') || rel.startsWith('..')) return null;
  if (rel === 'config.json') return { kind: 'config', project: null, file: rel };
  if (rel === 'registry.json') return { kind: 'registry', project: null, file: rel };
  if (rel.startsWith('events/')) return { kind: 'events', project: null, file: rel };
  const m = rel.match(/^projects\/([^/]+)\/([^/]+)\.json$/);
  if (m) return { kind: m[2], project: m[1], file: rel };
  if (rel === 'session-map.json' || rel === 'spawn-queue.json') return { kind: rel.replace('.json', ''), project: null, file: rel };
  return null;
}
export function watchSatoru(onChange: (c: Change) => void) {
  fs.mkdirSync(SATORU, { recursive: true });
  const w = chokidar.watch(SATORU, {
    ignoreInitial: true,
    ignored: (p: string) => p.endsWith('.lock') || p.endsWith('.tmp'),
    awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 25 },
  });
  const h = (p: string) => { const c = classify(p); if (c) onChange(c); };
  w.on('add', h).on('change', h).on('unlink', h);
  return w;
}
