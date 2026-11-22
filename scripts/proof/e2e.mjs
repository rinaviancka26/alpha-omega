// Step 15: drive the whole app with a REAL Claude Code session in the embedded terminal.
// Run with the app started from the repo root (./start.sh). Writes screenshots to docs/proof/step15-*.png
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const SAT = path.join(ROOT, '.satoru');
const PROJ_ROOT = process.env.AO_PROJECTS_ROOT || '/tmp/claude-0/ao-projects';
const card = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/src/card.generated.json'), 'utf8'));
const LEAD = card.team[0].name;
const byRole = (r) => (card.team.find((m) => m.role === r) || card.team[1]).name;
const DOCS = byRole('docs'), WRITER = byRole('writer');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0).padStart(4)}s]`, ...a);
const api = async (p) => (await fetch('http://localhost:4317' + p)).json();
async function waitFor(label, fn, timeoutMs = 300_000, every = 1500) {
  const t = Date.now();
  for (;;) { const v = await fn().catch(() => null); if (v) { log('✓', label); return v; } if (Date.now() - t > timeoutMs) throw new Error('timeout: ' + label); await sleep(every); }
}
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(ok ? 'PASS' : 'FAIL', name, detail); };
const shot = (page, n) => page.screenshot({ path: `docs/proof/step15-${n}.png` });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:4316/', { waitUntil: 'networkidle' });
await page.click('[data-tab="Office"]');
await sleep(1500);
check('fresh start: lights off', (await page.getByTestId('lights').innerText()).includes('lights off'));
check('fresh start: "no project loaded"', await page.getByTestId('no-project').count() === 1);
await shot(page, '01-fresh');

const term = page.getByTestId('xterm');
const termText = () => page.evaluate(() => { const b = window.__term.buffer.active; let s = ''; for (let i = 0; i < b.length; i++) s += b.getLine(i).translateToString(true) + '\n'; return s; });
const dump = setInterval(async () => { try { fs.writeFileSync('/tmp/claude-0/term.txt', await termText()); } catch { /* page busy */ } }, 4000);
const typeInTerm = async (text) => { await term.click(); await page.keyboard.type(text, { delay: 2 }); await sleep(300); await page.keyboard.press('Enter'); };
const ptyPid1 = (await page.evaluate(() => window.__ptyHello)).pid;
// Launch Claude in the embedded terminal (the transcript-saving marker inherited from the build session is unset so hooks get transcripts)
await typeInTerm(`env -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_SESSION_ID -u CLAUDE_CODE_REMOTE_SESSION_ID -u CLAUDECODE claude --permission-mode acceptEdits --allowedTools "Bash Read Write Edit Glob Grep Agent Task" --add-dir ${PROJ_ROOT}`);
await waitFor('Claude detected in the terminal', async () => (await api('/api/terminal-status')).claudeRunning, 60_000);
await waitFor('lights on after a real SessionStart hook', async () => (await page.getByTestId('lights').innerText()).includes('lights on'), 60_000);
check('lights on from real session_start', true);
await shot(page, '02-lights-on');

// New project via the Projects tab (enabled now that Claude is live) → switch message injected
await page.click('[data-tab="Projects"]'); await sleep(800);
await page.fill('[data-testid="new-name"]', 'Demo Garage');
await page.click('[data-testid="new-btn"]');
await waitFor('project created + active', async () => (await api('/api/state')).activeProject === 'demo-garage', 20_000);
await sleep(600);
await shot(page, '03-new-project');
const projDir = (await api('/api/state')).registry.projects.find((p) => p.slug === 'demo-garage').path;
await waitFor('lead pinned the session to the project (🎬 @demo-garage)', async () => {
  const sm = JSON.parse(fs.readFileSync(path.join(SAT, 'session-map.json'), 'utf8'));
  return Object.values(sm.sessions).some((s) => s.slug === 'demo-garage');
}, 180_000, 3000);

// The real job
await page.click('[data-tab="Office"]');
const job = `You are ${LEAD}. Follow "How ${LEAD} runs the team" in CLAUDE.md for the active project demo-garage (folder ${projDir}). ` +
  `The job: ${DOCS} writes docs/USAGE.md (five short lines on how to use the garage) and ${WRITER} writes TAGLINE.md (one catchy tagline), both inside that folder. ` +
  `Step 1 now: write .satoru/projects/demo-garage/plan.json (status awaiting-approval) and tasks.json, then STOP and wait for approval. Do not use Bash. ` +
  `After approval: delegate both in parallel with the Agent tool, put a 🎬 line for each, update tasks.json, and when both are done end your reply with exactly one line: ` +
  `🔔 approval: Publish the tagline | risk:low | ${WRITER}'s tagline goes on the shop sign`;
await typeInTerm(job);
await waitFor('plan.json awaiting approval', async () => (await api('/api/state')).project?.plan?.status === 'awaiting-approval', 300_000, 3000);
await sleep(2000);
const st1 = await api('/api/state');
check('plan written by the real lead', st1.project.plan.tasks.length >= 2, st1.project.plan.tasks.map((t) => `${t.id}:${t.owner}`).join(', '));
check('Needs-You bar shows the plan', (await page.getByTestId('needs-you').innerText()).includes('Plan awaiting approval'));
const inBriefing = await page.evaluate(() => window.__placements.filter((p) => p.reason === 'plan-briefing').map((p) => p.name));
check('plan owners gather in the briefing room', inBriefing.length >= 1, inBriefing.join(', '));
await shot(page, '04-plan-awaiting');
await page.click('[data-need="plan"]'); await sleep(800);
await shot(page, '05-plan-modal');
await page.getByTestId('plan-approve').click();
await waitFor('approval toast', async () => (await page.getByTestId('toast').allInnerTexts()).some((t) => t.includes('Sent to')), 15_000, 500);
check('plan approval injected into the live Claude', true, (await page.getByTestId('toast').allInnerTexts()).join(' | '));

// members working at desks
const spawned = await waitFor('real subagent spawn → member working', async () => {
  const s = await api('/api/state');
  const w = Object.entries(s.project?.agents || {}).filter(([n, a]) => n !== LEAD && a.state === 'working').map(([n]) => n);
  return w.length ? w : null;
}, 300_000, 1500);
await sleep(4000);
const atDesk = await page.evaluate((names) => window.__placements.filter((p) => names.includes(p.name)).map((p) => `${p.name}:${p.room}:${p.reason}`), spawned);
check('working members at their desks', atDesk.every((x) => x.includes(':working')), atDesk.join(', '));
await shot(page, '06-working');
const ticker1 = await page.getByTestId('ticker').innerText();
check('ticker shows real events', /picked up|edited|finished/.test(ticker1), ticker1.replace(/\n/g, ' ').slice(0, 160));

// completion: closing bubble at desk, then walk to a break room
const done = await waitFor('first real completion', async () => {
  const s = await api('/api/state');
  const c = Object.entries(s.project?.agents || {}).filter(([n, a]) => n !== LEAD && a.state === 'completed' && a.say);
  return c.length ? c : null;
}, 420_000, 800);
// closing line appears once the member is settled at the desk (they may still be walking there)
const bubbles = await waitFor('closing bubble at the desk', async () => { const b = await page.locator('[data-bubble]').allInnerTexts(); return b.length ? b : null; }, 10_000, 150).catch(() => []);
await shot(page, '07-closing-line');
check('closing line shown (real say from the subagent transcript)', bubbles.length > 0, bubbles.join(' | ').slice(0, 200));
await waitFor('all delegated members completed', async () => {
  const s = await api('/api/state');
  return spawned.every((n) => s.project.agents[n]?.state === 'completed') ? true : null;
}, 420_000, 2000);
await sleep(9000);
const rest = await page.evaluate((names) => window.__placements.filter((p) => names.includes(p.name)).map((p) => `${p.name}:${p.room}`), spawned);
check('after closing lines members walked to a break room', rest.every((x) => /lounge|pantry/.test(x)), rest.join(', '));
await shot(page, '08-break-room');

// 🔔 approval from the real final message
const appr = await waitFor('🔔 approval parsed from the lead’s message', async () => (await api('/api/state')).project?.approvals?.find((a) => a.status === 'pending'), 420_000, 2000);
await sleep(1500);
check('lead goes to the approval office with "!"', await page.evaluate((l) => window.__placements.find((p) => p.name === l).room === 'approval', LEAD));
await shot(page, '09-approval');

// reload: same PTY, no goodbye replay
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__ptyHello);
await sleep(700);
const hello2 = await page.evaluate(() => window.__ptyHello);
check('reload keeps the SAME terminal session', hello2.pid === ptyPid1 && hello2.reattached, `pid ${ptyPid1} → ${hello2.pid}, reattached=${hello2.reattached}`);
const replayed = await page.evaluate((names) => window.__placements.filter((p) => names.includes(p.name) && p.reason === 'closing').length, spawned);
const bubblesNow = await page.locator('[data-bubble]').allInnerTexts();
const walkersNow = await page.locator('[data-member][data-moving="true"]').evaluateAll((els) => els.map((e) => e.dataset.member));
check('no goodbye replay after reload', replayed === 0 && !walkersNow.some((n) => spawned.includes(n)), `closing placements=${replayed}, bubbles=[${bubblesNow.join(' | ').slice(0, 80)}], walking=[${walkersNow}]`);
await shot(page, '10-after-reload');

// decide the approval → injected
await page.click('[data-need="approval"]'); await sleep(500);
await page.locator(`[data-testid="approval-${appr.id}"] >> text=Approve`).click();
await waitFor('approval decision toast', async () => (await page.getByTestId('toast').allInnerTexts()).some((t) => t.includes('Sent to')), 15_000, 500);
check('🔔 approval decided in the UI and injected', true, appr.id);
await sleep(2000);
check('Needs-You bar empty afterwards', (await page.getByTestId('needs-you').count()) === 0);
await waitFor('lead finished acknowledging (idle)', async () => {
  const ev = (await api('/api/events/recent?limit=20')).events;
  return ev.reverse().find((e) => e.type === 'idle' && Date.parse(e.ts) > Date.parse(appr.created) + 2000);
}, 240_000, 2000);
const files = ['docs/USAGE.md', 'TAGLINE.md'].map((f) => `${f}:${fs.existsSync(path.join(projDir, f)) ? 'exists' : 'missing'}`);
check('subagents really wrote the files', files.every((f) => f.endsWith('exists')), files.join(', '));

// session end → lights off
await typeInTerm('/exit');
await waitFor('lights off after real SessionEnd', async () => (await page.getByTestId('lights').innerText()).includes('lights off'), 60_000);
check('session end → lights off', true);
await shot(page, '11-session-end');
console.log('\nRESULTS'); for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
console.log('page errors:', errs.length ? errs : 'none');
clearInterval(dump);
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
