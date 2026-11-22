// Step 11 proof: Needs-You bar, plan modal + conflict guard, decisions, terminal bridge (stub claude), approval cards.
import { createRequire } from 'node:module';
import { reset, put, ev, ago, sleep, T } from './sandbox.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const WebSocket = createRequire(new URL('../../server/package.json', import.meta.url))('ws');
const [LEAD, A, B, C, D, E, F, G] = T;
reset();
await ev({ type: 'session_start', agent: LEAD, payload: {} });
const plan = (tasks) => ({ status: 'awaiting-approval', title: 'Parts catalogue v1', scope: 'Catalogue page + API + docs', risks: ['schema churn'], tasks });
await put('garage', 'plan', plan([
  { id: 'T1', title: 'Catalogue API', owner: F, files: ['server/parts.ts'] },
  { id: 'T2', title: 'Parts schema', owner: E, files: ['db/parts.sql', 'server/parts.ts'] },
  { id: 'T3', title: 'API docs', owner: G, files: ['docs/parts.md'] }]));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:4316/', { waitUntil: 'networkidle' });
await sleep(1200);
console.log('bar:', (await page.getByTestId('needs-you').innerText()).replace(/\n/g, ' | '));
await page.click('[data-need="plan"]'); await sleep(600);
console.log('conflict shown:', (await page.getByTestId('plan-conflict').innerText()));
console.log('Approve disabled:', await page.getByTestId('plan-approve').isDisabled());
await page.screenshot({ path: 'docs/proof/step11-plan-conflict.png' });
const r409 = await fetch('http://localhost:4317/api/projects/garage/plan/decision', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'approve' }) });
console.log('direct POST approve →', r409.status, JSON.stringify(await r409.json()));
await page.click('[aria-label="close"]');
// fix the plan
await put('garage', 'plan', plan([
  { id: 'T1', title: 'Catalogue API', owner: F, files: ['server/parts.ts'] },
  { id: 'T2', title: 'Parts schema', owner: E, files: ['db/parts.sql'] },
  { id: 'T3', title: 'API docs', owner: G, files: ['docs/parts.md'] }]));
await sleep(1200);
await page.click('[data-need="plan"]'); await sleep(600);
console.log('after fix — conflict shown:', await page.getByTestId('plan-conflict').count(), '| Approve disabled:', await page.getByTestId('plan-approve').isDisabled());
await page.screenshot({ path: 'docs/proof/step11-plan-modal.png' });
await page.getByTestId('plan-approve').click(); await sleep(1200);
console.log('toast (no Claude live):', await page.getByTestId('toast').first().innerText());
console.log('HUD pill:', await page.getByTestId('plan-pill').innerText(), '| bar present:', await page.getByTestId('needs-you').count());
await page.screenshot({ path: 'docs/proof/step11-approved-pill.png' });

// stub claude in a PTY → bridge injects
const ws = new WebSocket('ws://localhost:4317/pty?sid=proof-claude');
let out = ''; ws.on('message', (m) => { const j = JSON.parse(m); if (j.data) out += j.data; });
await new Promise((r) => ws.on('open', r));
ws.send(JSON.stringify({ type: 'input', data: new URL('./stub-claude/claude', import.meta.url).pathname + '\r' }));
await sleep(2500);
console.log('terminal-status:', JSON.stringify(await (await fetch('http://localhost:4317/api/terminal-status')).json()));
// 🔔 approval arrives (as the hook would write it) → beep
const beepsBefore = await page.evaluate(() => window.__beeps || 0);
await put('garage', 'approvals', { approvals: [{ id: 'A-1a2b3c4d', title: 'Drop the legacy parts table', risk: 'high', reason: 'irreversible data change', status: 'pending', created: new Date().toISOString(), agent: LEAD }] });
await sleep(1500);
console.log('beeps when count grew:', (await page.evaluate(() => window.__beeps || 0)) - beepsBefore, '| bar:', (await page.getByTestId('needs-you').innerText()).replace(/\n/g, ' | '));
await page.click('[data-need="approval"]'); await sleep(500);
await page.screenshot({ path: 'docs/proof/step11-approval-card.png' });
await page.fill('[data-testid="approval-A-1a2b3c4d"] input', 'backup first');
await page.click('[data-testid="approval-A-1a2b3c4d"] >> text=Approve'); await sleep(1500);
console.log('toast (stub claude live):', await page.getByTestId('toast').last().innerText());
console.log('PTY received:', out.split(/\r?\n/).filter((l) => l.startsWith('STUB CLAUDE GOT')).join(' / '));
const ap = await (await fetch('http://localhost:4317/api/projects/garage')).json();
console.log('approvals.json:', JSON.stringify(ap.approvals[0]));
console.log('plan.json status:', ap.plan.status, ap.plan.decidedAt ? '(decidedAt set)' : '');
console.log('bar after all decided:', await page.getByTestId('needs-you').count() ? 'present' : 'renders nothing');
// stalled + blocked
await put('garage', 'tasks', { tasks: [{ id: 'T1', title: 'Catalogue API', owner: F, status: 'in_progress', started: ago(35 * 60_000) }, { id: 'T2', title: 'Parts schema', owner: E, status: 'blocked' }] });
await sleep(1500);
console.log('bar with stalled+blocked:', (await page.getByTestId('needs-you').innerText()).replace(/\n/g, ' | '));
await page.screenshot({ path: 'docs/proof/step11-stalled-blocked.png' });
ws.send(JSON.stringify({ type: 'kill' })); ws.close();
console.log('page errors:', errs.length ? errs : 'none');
await browser.close();
