// Drives hooks/telemetry.mjs with fake Claude Code payloads against a temp .satoru.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const HOOK = path.resolve('hooks/telemetry.mjs');
const card = JSON.parse(fs.readFileSync('web/src/card.generated.json', 'utf8'));
const LEAD = card.team[0].name, A = card.team[1].name, B = card.team[2].name;

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-hook-'));
  const sat = path.join(root, '.satoru');
  const proj = path.join(root, 'demo-project');
  fs.mkdirSync(path.join(sat, 'events'), { recursive: true });
  fs.mkdirSync(path.join(sat, 'projects', 'demo'), { recursive: true });
  fs.mkdirSync(proj);
  fs.writeFileSync(path.join(sat, 'config.json'), JSON.stringify({ activeProject: 'demo' }));
  fs.writeFileSync(path.join(sat, 'registry.json'), JSON.stringify({ projects: [{ slug: 'demo', name: 'Demo', path: proj }] }));
  return { root, sat, proj };
}
function run(env, event, payload, raw) {
  const r = spawnSync(process.execPath, [HOOK, event], { input: raw ?? JSON.stringify(payload), env: { ...process.env, ALPHA_OMEGA_SATORU: env.sat }, encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}
const transcript = (dir, name, lines) => { const f = path.join(dir, name); fs.writeFileSync(f, lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf8'); return f; };
const asst = (text) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } });
const user = (text) => ({ type: 'user', message: { role: 'user', content: text } });
const agents = (env) => JSON.parse(fs.readFileSync(path.join(env.sat, 'projects/demo/agents.json'), 'utf8')).agents;
const events = (env) => fs.readdirSync(path.join(env.sat, 'events')).filter((f) => f.endsWith('.ndjson')).flatMap((f) => fs.readFileSync(path.join(env.sat, 'events', f), 'utf8').trim().split('\n').map((l) => JSON.parse(l)));

test('full scenario: spawn → phantom stop → real stop → Stop with directives', () => {
  const env = setup();
  const r1 = run(env, 'spawn', { session_id: 's1', cwd: env.proj, tool_name: 'Agent', tool_use_id: 'tu1', tool_input: { subagent_type: A, description: 'Draft the requirements', prompt: 'long prompt' } });
  assert.equal(r1.code, 0); assert.equal(r1.stdout, '');
  let ag = agents(env);
  assert.equal(ag[A].state, 'working'); assert.equal(ag[A].task, 'Draft the requirements');
  const q = JSON.parse(fs.readFileSync(path.join(env.sat, 'spawn-queue.json'), 'utf8')).queue;
  assert.equal(q.length, 1);

  run(env, 'done', { session_id: 's1', cwd: env.proj, agent_type: '' }); // phantom
  assert.equal(agents(env)[A].state, 'working', 'phantom SubagentStop must not change state');

  const at = transcript(env.root, 'agent.jsonl', [user('do it'), asst('Working on it.'), asst('Requirements drafted in docs/req.md; verified by re-reading. torque-checked ✔')]);
  const mainT = transcript(env.root, 'main.jsonl', [user('should not be read for say'), asst('MAIN TRANSCRIPT TEXT')]);
  run(env, 'done', { session_id: 's1', cwd: env.proj, agent_type: A, agent_transcript_path: at, transcript_path: mainT });
  ag = agents(env);
  assert.equal(ag[A].state, 'completed');
  assert.match(ag[A].say, /^Requirements drafted/); assert.doesNotMatch(ag[A].say, /MAIN TRANSCRIPT/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(env.sat, 'spawn-queue.json'), 'utf8')).queue.length, 0);

  const stopT = transcript(env.root, 'stop.jsonl', [user('go'), asst([
    'Plan is moving.',
    '```',
    `🎬 ${B} → meeting · "this one is inside a code block and must be ignored"`,
    '```',
    `Also inline: \`🎬 ${B} → lounge · "inline ignored"\``,
    `🎬 ${A} → briefing · "Walking the team through the spec"`,
    '🔔 approval: Delete old migrations | risk:high | irreversible data change',
  ].join('\n'))]);
  run(env, 'idle', { session_id: 's1', cwd: env.proj, transcript_path: stopT, stop_hook_active: false });
  ag = agents(env);
  assert.equal(ag[A].intendedRoom, 'briefing'); assert.equal(ag[A].voice, 'Walking the team through the spec');
  assert.equal(ag[B], undefined, 'directive inside code must be ignored');
  assert.equal(ag[LEAD].state, 'approval');
  const ap = JSON.parse(fs.readFileSync(path.join(env.sat, 'projects/demo/approvals.json'), 'utf8')).approvals;
  assert.equal(ap.length, 1); assert.match(ap[0].id, /^A-[0-9a-f]{8}$/); assert.equal(ap[0].risk, 'high');
  run(env, 'idle', { session_id: 's1', cwd: env.proj, transcript_path: stopT }); // same message again (different payload? identical → dedupe; approval id exists → skipped anyway)
  assert.equal(JSON.parse(fs.readFileSync(path.join(env.sat, 'projects/demo/approvals.json'), 'utf8')).approvals.length, 1);

  const evs = events(env);
  console.log('agents.json:', JSON.stringify(agents(env), null, 1));
  console.log('events:\n' + evs.map((e) => JSON.stringify(e)).join('\n'));
  assert.deepEqual(evs.map((e) => e.type), ['spawn', 'done', 'done', 'idle', 'stage', 'note', 'idle']); // repeated Stop: no duplicate stage/approval
  assert.equal(evs[1].payload.phantom, true); assert.equal(evs[1].agent, null);
});

test('attribution rules', () => {
  const env = setup();
  // file_touch outside any project → unattributed even though activeProject is set
  run(env, 'file_touch', { session_id: 's9', cwd: os.tmpdir(), tool_name: 'Edit', tool_input: { file_path: '/elsewhere/x.ts' } });
  // prompt outside any project → falls back to activeProject
  run(env, 'prompt', { session_id: 's9', cwd: os.tmpdir(), prompt: 'hello with sk-ant-secretsecret123 inside' });
  // off-card subagent → unattributed agent
  run(env, 'spawn', { session_id: 's9', cwd: env.proj, tool_input: { subagent_type: 'general-purpose', description: 'x' } });
  // command inside the project dir → attributed via cwd
  run(env, 'command', { session_id: 's9', cwd: path.join(env.proj), tool_input: { command: 'npm test -- --password=hunter2' } });
  const evs = events(env);
  console.log(evs.map((e) => `${e.type}: project=${e.project} agent=${e.agent} ${JSON.stringify(e.payload)}`).join('\n'));
  assert.equal(evs[0].project, null);
  assert.equal(evs[1].project, 'demo'); assert.equal(evs[1].payload.via, 'activeProject'); assert.doesNotMatch(evs[1].payload.text, /secretsecret/);
  assert.equal(evs[2].agent, null); assert.equal(evs[2].payload.offCard, 'general-purpose');
  assert.equal(evs[3].project, 'demo'); assert.equal(evs[3].payload.via, 'cwd'); assert.doesNotMatch(evs[3].payload.command, /hunter2/);
});

test('🎬 @slug pins the session; never fails on garbage / missing .satoru', () => {
  const env = setup();
  const reg = { projects: [{ slug: 'demo', name: 'Demo', path: env.proj }, { slug: 'other', name: 'Other', path: path.join(env.root, 'o') }] };
  fs.writeFileSync(path.join(env.sat, 'registry.json'), JSON.stringify(reg));
  const t = transcript(env.root, 'pin.jsonl', [user('switch'), asst('Switching.\n🎬 @other')]);
  run(env, 'idle', { session_id: 'sp', cwd: os.tmpdir(), transcript_path: t });
  const sm = JSON.parse(fs.readFileSync(path.join(env.sat, 'session-map.json'), 'utf8'));
  assert.equal(sm.sessions.sp.slug, 'other');
  run(env, 'file_touch', { session_id: 'sp', cwd: os.tmpdir(), tool_input: { file_path: '/x' } });
  assert.equal(events(env).at(-1).project, 'other');
  const g = run(env, 'idle', null, '{not json');
  assert.equal(g.code, 0); assert.equal(g.stdout, '');
  const r = spawnSync(process.execPath, [HOOK, 'idle'], { input: '{}', env: { ...process.env, ALPHA_OMEGA_SATORU: path.join(env.root, 'nope') }, encoding: 'utf8' });
  assert.equal(r.status, 0); assert.equal(r.stdout, ''); assert.equal(fs.existsSync(path.join(env.root, 'nope')), false);
});

test('reconcile: stale working → completed (keeps since), approval pin released, old directive cleared', () => {
  const env = setup();
  const old = new Date(Date.now() - 3 * 3600_000).toISOString();
  fs.writeFileSync(path.join(env.sat, 'projects/demo/agents.json'), JSON.stringify({ agents: {
    [A]: { state: 'working', task: 't', since: old, heartbeat: old },
    [LEAD]: { state: 'approval', since: old, heartbeat: old },
    [B]: { state: 'idle', intendedRoom: 'meeting', voice: 'v', directiveAt: old, heartbeat: old },
  } }));
  run(env, 'session_start', { session_id: 'r1', cwd: env.proj, source: 'startup' });
  const ag = agents(env);
  assert.equal(ag[A].state, 'completed'); assert.equal(ag[A].since, old);
  assert.equal(ag[LEAD].state, 'idle');
  assert.equal(ag[B].intendedRoom, null);
  const notes = events(env).filter((e) => e.type === 'note');
  console.log(notes.map((n) => n.payload.text).join('\n'));
  assert.equal(notes.length, 3);
  const mtime = fs.statSync(path.join(env.sat, 'projects/demo/agents.json')).mtimeMs;
  run(env, 'session_start', { session_id: 'r2', cwd: env.proj, source: 'resume' });
  assert.equal(events(env).filter((e) => e.type === 'note').length, 3, 'second reconcile is a no-op');
});

test('<task-notification> prompts are system messages, not lead work', () => {
  const env = setup();
  run(env, 'prompt', { session_id: 'tn', cwd: env.proj, prompt: '<task-notification> <task-id>x</task-id> done' });
  const e = events(env).at(-1);
  assert.equal(e.payload.system, true);
  assert.equal(fs.existsSync(path.join(env.sat, 'projects/demo/agents.json')), false, 'no lead state change');
});
