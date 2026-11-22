#!/usr/bin/env node
// Telemetry hook (app name comes from mission.card.md) — pure Node, cross-platform, no dependencies.
//   node "$CLAUDE_PROJECT_DIR/hooks/telemetry.mjs" <event>
// Reads the Claude Code hook payload (JSON) from stdin and mirrors it into .satoru/.
// NEVER fails the session: everything is wrapped, exit code is always 0, nothing goes to stdout.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const EVENT = process.argv[2] || '';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const SATORU = process.env.ALPHA_OMEGA_SATORU ? path.resolve(process.env.ALPHA_OMEGA_SATORU) : path.join(REPO, '.satoru');
const MIN = 60_000;

const quietExit = () => process.exit(0);
process.on('uncaughtException', quietExit);
process.on('unhandledRejection', quietExit);

function readStdin(timeoutMs = 3000) {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    const chunks = [];
    const t = setTimeout(() => resolve(Buffer.concat(chunks).toString('utf8')), timeoutMs);
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => { clearTimeout(t); resolve(Buffer.concat(chunks).toString('utf8')); });
    process.stdin.on('error', () => { clearTimeout(t); resolve(''); });
  });
}

// ---------- transcript parsing ----------
async function readTail(file, bytes = 512 * 1024) {
  try {
    const st = await fsp.stat(file);
    const fh = await fsp.open(file, 'r');
    try {
      const len = Math.min(bytes, st.size);
      const buf = Buffer.alloc(len);
      await fh.read(buf, 0, len, st.size - len);
      let txt = buf.toString('utf8');
      if (len < st.size) txt = txt.slice(txt.indexOf('\n') + 1);
      return txt;
    } finally { await fh.close(); }
  } catch { return ''; }
}
const textOf = (content) => typeof content === 'string' ? content
  : Array.isArray(content) ? content.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n') : '';
const isRealUserTurn = (e) => {
  if (!e || e.type !== 'user' || !e.message) return false;
  const c = e.message.content;
  if (typeof c === 'string') return true;
  return Array.isArray(c) && c.some((b) => b && b.type === 'text') && !c.some((b) => b && b.type === 'tool_result');
};
/** Text of the last assistant message (all assistant text blocks after the last real user turn).
 *  finalOnly: just the last assistant entry that has text (a subagent's final report). */
export async function lastAssistantText(file, finalOnly = false) {
  if (!file) return '';
  const lines = (await readTail(file)).split('\n').filter(Boolean);
  const entries = [];
  for (const l of lines) { try { entries.push(JSON.parse(l)); } catch { /* partial */ } }
  let i = entries.length - 1;
  while (i >= 0 && !isRealUserTurn(entries[i])) i--;
  const texts = entries.slice(i + 1).filter((e) => e.type === 'assistant' && e.message).map((e) => textOf(e.message.content)).filter(Boolean);
  return finalOnly ? (texts[texts.length - 1] || '') : texts.join('\n');
}
/** Remove fenced code blocks and inline code spans. */
export function stripCode(t) {
  return t.replace(/```[\s\S]*?(```|$)/g, '').replace(/~~~[\s\S]*?(~~~|$)/g, '').replace(/`[^`\n]*`/g, '');
}
const DIRECTIVE = /^\s*(?:[-*>]\s*)?🎬\s*([a-z0-9]+)\s*(?:→|->)\s*([a-z]+)\s*(?:[·•|-]\s*["“](.+?)["”])?\s*$/;
const PROJECT_PIN = /^\s*(?:[-*>]\s*)?🎬\s*@([a-z0-9][a-z0-9-]*)\s*$/;
const APPROVAL = /^\s*(?:[-*>]\s*)?🔔\s*approval:\s*(.+?)\s*\|\s*risk:\s*(low|med|high)\s*\|\s*(.+?)\s*$/i;
export function parseDirectives(text) {
  const out = { stage: [], approvals: [], pin: null };
  for (const line of stripCode(text).split(/\r?\n/)) {
    let m;
    if ((m = line.match(PROJECT_PIN))) out.pin = m[1];
    else if ((m = line.match(DIRECTIVE))) out.stage.push({ name: m[1], room: m[2], voice: m[3] || null });
    else if ((m = line.match(APPROVAL))) out.approvals.push({ title: m[1], risk: m[2].toLowerCase(), reason: m[3] });
  }
  return out;
}

// ---------- main ----------
async function main() {
  if (!EVENT) return;
  if (!fs.existsSync(SATORU) || !fs.statSync(SATORU).isDirectory()) return; // not set up → silent
  const io = await import(new URL('./lib/io.mjs', import.meta.url).href);
  const raw = await readStdin();
  let p = {};
  try { p = raw.trim() ? JSON.parse(raw) : {}; } catch { p = { _unparsed: true }; }

  const cardFile = path.join(REPO, 'web', 'src', 'card.generated.json');
  const card = await io.readJson(cardFile, null);
  if (!card || !Array.isArray(card.team) || !card.team.length) return;
  const LEAD = card.team[0].name;
  const onCard = (n) => typeof n === 'string' && card.team.some((m) => m.name === n);
  const ROOMS = Object.keys(card.rooms || {});
  const now = new Date();
  const nowIso = now.toISOString();
  const F = {
    config: path.join(SATORU, 'config.json'), registry: path.join(SATORU, 'registry.json'),
    sessionMap: path.join(SATORU, 'session-map.json'), queue: path.join(SATORU, 'spawn-queue.json'),
    dedupe: path.join(SATORU, 'hook-dedupe.json'),
    agents: (s) => path.join(SATORU, 'projects', s, 'agents.json'), approvals: (s) => path.join(SATORU, 'projects', s, 'approvals.json'),
  };

  // De-duplicate double registration (project + user level) of the same hook call.
  const key = crypto.createHash('md5').update(EVENT + '|' + raw).digest('hex');
  let dup = false;
  await io.lockedUpdateJson(F.dedupe, (d) => {
    const seen = (d.seen || []).filter((s) => now - Date.parse(s.ts) < 10_000);
    if (seen.some((s) => s.key === key)) { dup = true; return undefined; }
    return { seen: [...seen.slice(-40), { key, ts: nowIso }] };
  }, { seen: [] });
  if (dup) return;

  const sessionId = typeof p.session_id === 'string' ? p.session_id : null;
  const config = await io.readJson(F.config, { activeProject: null });
  const registry = await io.readJson(F.registry, { projects: [] });
  const projects = Array.isArray(registry?.projects) ? registry.projects : [];
  const norm = (x) => { let r = path.resolve(String(x)).replace(/\\/g, '/').replace(/\/+$/, ''); if (process.platform === 'win32') r = r.toLowerCase(); return r; };

  // ----- who -----
  let agent = LEAD, offCard = null, phantom = false;
  if (EVENT === 'spawn') {
    const st = p.tool_input && p.tool_input.subagent_type;
    if (onCard(st)) agent = st; else { agent = null; offCard = st || '(none)'; }
  } else if (EVENT === 'done') {
    const at = p.agent_type;
    if (!at) { phantom = true; agent = null; }
    else if (onCard(at)) agent = at; else { agent = null; offCard = at; }
  } else if (p.agent_type) { // tool use inside a subagent (newer payloads carry agent_type)
    if (onCard(p.agent_type)) agent = p.agent_type; else { agent = null; offCard = p.agent_type; }
  }

  // ----- last assistant message (idle) → directives + project pin -----
  let parsed = { stage: [], approvals: [], pin: null };
  if (EVENT === 'idle') {
    const txt = typeof p.last_assistant_message === 'string' && p.last_assistant_message ? p.last_assistant_message : await lastAssistantText(p.transcript_path);
    parsed = parseDirectives(txt);
    if (parsed.pin && sessionId && projects.some((x) => x.slug === parsed.pin)) {
      await io.lockedUpdateJson(F.sessionMap, (m) => ({ sessions: { ...(m.sessions || {}), [sessionId]: { slug: parsed.pin, ts: nowIso } } }), { sessions: {} });
    }
  }

  // ----- which project -----
  let project = null, via = null;
  if (typeof p.cwd === 'string' && p.cwd) {
    const cwd = norm(p.cwd);
    let best = null;
    for (const pr of projects) { const pp = norm(pr.path); if ((cwd === pp || cwd.startsWith(pp + '/')) && (!best || pp.length > norm(best.path).length)) best = pr; }
    if (best) { project = best.slug; via = 'cwd'; }
  }
  if (!project && sessionId) {
    const sm = await io.readJson(F.sessionMap, { sessions: {} });
    const pin = sm?.sessions?.[sessionId];
    if (pin && projects.some((x) => x.slug === pin.slug)) { project = pin.slug; via = 'session-map'; }
  }
  if (!project && parsed.pin && projects.some((x) => x.slug === parsed.pin)) { project = parsed.pin; via = 'directive'; }
  let queueEntry = null;
  if (EVENT === 'done' && !phantom) {
    await io.lockedUpdateJson(F.queue, (q) => {
      const list = q.queue || [];
      let idx = list.findIndex((e) => e.agent === (agent || offCard));
      if (idx < 0) return undefined;
      queueEntry = list[idx];
      return { queue: list.filter((_, i) => i !== idx) };
    }, { queue: [] });
    if (!project && queueEntry?.project) { project = queueEntry.project; via = 'spawn-queue'; }
  }
  if (!project && ['spawn', 'done', 'prompt', 'idle', 'stage'].includes(EVENT) && config?.activeProject && projects.some((x) => x.slug === config.activeProject)) {
    project = config.activeProject; via = 'activeProject';
  }
  // file_touch / command never fall back to activeProject (stays null → unattributed).

  const attributed = !!(project && agent);
  const short = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
  const events = [];
  const ev = (type, a, payload) => events.push({ ts: nowIso, type, agent: a, project, payload });

  // ----- per-event behaviour -----
  const updAgents = (fn) => project ? io.lockedUpdateJson(F.agents(project), (d) => {
    const agents = { ...(d.agents || {}) };
    const before = JSON.stringify(agents);
    fn(agents);
    return JSON.stringify(agents) === before ? undefined : { agents };
  }, { agents: {} }) : null;
  const touch = (agents, name, patch) => { agents[name] = { state: 'idle', ...(agents[name] || {}), heartbeat: nowIso, ...patch }; };

  switch (EVENT) {
    case 'session_start':
      ev('session_start', LEAD, { source: p.source || null, session: sessionId, via });
      if (project) await updAgents((A) => touch(A, LEAD, {}));
      break;
    case 'session_end':
      ev('session_end', LEAD, { reason: p.reason || null, session: sessionId, via });
      if (project) await updAgents((A) => { if (A[LEAD]) touch(A, LEAD, { state: A[LEAD].state === 'approval' ? 'approval' : 'idle' }); });
      break;
    case 'prompt': {
      const text = short(p.prompt, 160);
      if (/^\s*<task-notification>/.test(String(p.prompt || ''))) { ev('prompt', LEAD, { text: 'background task report', system: true, via }); break; } // not user work
      ev('prompt', LEAD, { text, via });
      if (project) await updAgents((A) => touch(A, LEAD, { state: A[LEAD]?.state === 'approval' ? 'approval' : 'working', task: short(p.prompt, 80), since: nowIso, say: null }));
      break;
    }
    case 'spawn': {
      const ti = p.tool_input || {};
      const task = short(ti.description || ti.prompt || '', 80);
      await io.lockedUpdateJson(F.queue, (q) => ({ queue: [...(q.queue || []), { id: p.tool_use_id || crypto.randomUUID(), agent: agent || offCard, project, ts: nowIso, task }] }), { queue: [] });
      ev('spawn', agent, { task, subagent: ti.subagent_type || null, ...(offCard ? { offCard } : {}), via });
      if (attributed) await updAgents((A) => touch(A, agent, { state: 'working', task, since: nowIso, say: null }));
      break;
    }
    case 'done': {
      if (phantom) { ev('done', null, { phantom: true, via }); break; }
      const finalMsg = typeof p.last_assistant_message === 'string' && p.last_assistant_message ? p.last_assistant_message : await lastAssistantText(p.agent_transcript_path, true);
      const flat = stripCode(finalMsg).replace(/\s+/g, ' ').trim();
      const say = flat.length > 120 ? '…' + flat.slice(-119) : flat;
      ev('done', agent, { say, task: queueEntry?.task || null, ...(offCard ? { offCard } : {}), via });
      if (attributed) await updAgents((A) => touch(A, agent, { state: 'completed', say: say || null, since: nowIso }));
      break;
    }
    case 'file_touch': {
      const fp = p.tool_input?.file_path || p.tool_input?.notebook_path || '';
      let rel = fp;
      try { if (fp && p.cwd) { const r = path.relative(p.cwd, fp); if (!r.startsWith('..') && !path.isAbsolute(r)) rel = r; } } catch { /* keep */ }
      ev('file_touch', agent, { file: String(rel).replace(/\\/g, '/'), tool: p.tool_name || null, ...(offCard ? { offCard } : {}), via });
      if (attributed) await updAgents((A) => { if (A[agent]) touch(A, agent, {}); });
      break;
    }
    case 'command':
      ev('command', agent, { command: short(p.tool_input?.command, 160), ...(offCard ? { offCard } : {}), via });
      if (attributed) await updAgents((A) => { if (A[agent]) touch(A, agent, {}); });
      break;
    case 'idle': {
      ev('idle', LEAD, { directives: parsed.stage.length, approvals: parsed.approvals.length, via });
      if (!project) break;
      const stage = parsed.stage.filter((s) => onCard(s.name) && (ROOMS.includes(s.room) || s.room === 'done'));
      const newApprovals = [];
      if (parsed.approvals.length) {
        await io.lockedUpdateJson(F.approvals(project), (d) => {
          const list = [...(d.approvals || [])];
          for (const a of parsed.approvals) {
            const id = 'A-' + crypto.createHash('md5').update(a.title + io.localDate(now)).digest('hex').slice(0, 8);
            if (list.some((x) => x.id === id)) continue;
            list.push({ id, title: a.title, risk: a.risk, reason: a.reason, status: 'pending', created: nowIso, agent: LEAD });
            newApprovals.push(id);
          }
          return newApprovals.length ? { approvals: list } : undefined;
        }, { approvals: [] });
      }
      const changedStage = [];
      await updAgents((A) => {
        changedStage.length = 0;
        for (const s of stage) {
          const cur = A[s.name] || {};
          if (s.room === 'done' ? cur.intendedRoom : (cur.intendedRoom !== s.room || cur.voice !== s.voice)) changedStage.push(s);
        }
        touch(A, LEAD, { state: newApprovals.length ? 'approval' : (A[LEAD]?.state === 'approval' ? 'approval' : 'idle'), task: A[LEAD]?.task ?? null });
        for (const s of stage) {
          if (s.room === 'done') touch(A, s.name, { intendedRoom: null, voice: null, directiveAt: null });
          else touch(A, s.name, { intendedRoom: s.room, voice: s.voice, directiveAt: nowIso });
        }
      });
      for (const s of changedStage) ev('stage', s.name, { room: s.room, voice: s.voice });
      for (const id of newApprovals) ev('note', LEAD, { text: `approval requested: ${parsed.approvals.find((a) => 'A-' + crypto.createHash('md5').update(a.title + io.localDate(now)).digest('hex').slice(0, 8) === id)?.title}`, approval: id });
      break;
    }
    default:
      return;
  }

  // ----- reconcile (idle + session_start), one locked write per project, skipped if unchanged -----
  if (EVENT === 'idle' || EVENT === 'session_start') {
    const q = (await io.readJson(F.queue, { queue: [] }))?.queue || [];
    for (const pr of projects) {
      if (!fs.existsSync(F.agents(pr.slug))) continue;
      const appr = (await io.readJson(F.approvals(pr.slug), { approvals: [] }))?.approvals || [];
      const pending = appr.filter((a) => a.status === 'pending').length;
      const notes = [];
      await io.lockedUpdateJson(F.agents(pr.slug), (d) => {
        const A = { ...(d.agents || {}) };
        let changed = false;
        for (const [name, a] of Object.entries(A)) {
          const hb = Date.parse(a.heartbeat || a.since || '');
          if (a.state === 'working' && name !== LEAD && Number.isFinite(hb) && now - hb > 60 * MIN && !q.some((e) => e.agent === name)) {
            A[name] = { ...a, state: 'completed' }; changed = true; // keep old `since`
            notes.push([name, `reconcile: ${name} had no heartbeat for >60 min and no live spawn — marked completed`]);
          }
          if (a.state === 'approval' && pending === 0) {
            A[name] = { ...A[name], state: 'idle' }; changed = true;
            notes.push([name, `reconcile: approval pin released (no pending approvals)`]);
          }
          const da = Date.parse(a.directiveAt || '');
          if (a.intendedRoom && Number.isFinite(da) && now - da > 120 * MIN) {
            A[name] = { ...A[name], intendedRoom: null, voice: null, directiveAt: null }; changed = true;
            notes.push([name, `reconcile: stage directive (${a.intendedRoom}) older than 2 h cleared`]);
          }
        }
        return changed ? { agents: A } : undefined;
      }, { agents: {} });
      for (const [name, text] of notes) events.push({ ts: nowIso, type: 'note', agent: name, project: pr.slug, payload: { text, reconcile: true } });
    }
  }

  for (const e of events) await io.appendEvent(SATORU, e);
}

main().catch(() => {}).finally(() => process.exit(0));
