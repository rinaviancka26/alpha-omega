// Step 13 proof: Tasks, Decisions, Brief (phase chip), Timeline (grouping, filters, Load older across an identical-ts boundary) — all live.
import { createRequire } from 'node:module';
import { reset, put, ev, ago, sleep, T } from './sandbox.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const [LEAD, A, B, C, D, E, F, G] = T;
reset();
const now = Date.now();
// events: 40 yesterday, 40 today; newest-first #50/#51 share a timestamp (UI page size = 50)
const y = new Date(now - 86400_000); y.setHours(15, 0, 0, 0);
const t0 = new Date(now); t0.setHours(0, 20, 0, 0);
const list = [];
for (let i = 0; i < 40; i++) list.push({ ts: new Date(y.getTime() + i * 60_000).toISOString(), i });
for (let i = 0; i < 40; i++) list.push({ ts: new Date(t0.getTime() + i * 60_000).toISOString(), i: 40 + i });
list[40 + 30].ts = list[40 + 29].ts; // today i=69 and i=70 → newest-first positions 10/11? compute below
// choose pair so the boundary at 50 is between them: newest-first position k ↔ index 79-k ⇒ positions 49,50 (0-based) ↔ indexes 30,29
list[30].ts = list[29].ts;
const types = ['spawn', 'done', 'file_touch', 'command', 'note'];
for (const e of list) await ev({ ts: e.ts, type: types[e.i % 5], agent: e.i % 7 === 0 ? null : T[e.i % T.length], project: e.i % 4 === 0 ? null : 'garage', payload: { text: `event #${e.i}`, task: `task #${e.i}`, file: `src/f${e.i}.ts`, command: `npm test #${e.i}`, say: `finished #${e.i}` } });
await put('garage', 'tasks', { tasks: [
  { id: 'T1', title: 'Parts schema', owner: E, status: 'planned', files: ['db/parts.sql'] },
  { id: 'T2', title: 'Catalogue API', owner: F, status: 'in_progress', started: ago(300_000) },
  { id: 'T3', title: 'Catalogue copy', owner: B, status: 'review' },
  { id: 'T4', title: 'Search index', owner: D, status: 'blocked', note: 'waiting on SKU format' },
  { id: 'T5', title: 'Dockerfile', owner: C, status: 'done', verified: true },
  { id: 'T6', title: 'API docs', owner: G, status: 'done' } ] });
await put('garage', 'plan', { status: 'approved', title: 'Parts catalogue v1', scope: 'Catalogue page, API, docs', risks: ['schema churn'], tasks: [], created: ago(7200_000), decidedAt: ago(3600_000), note: 'ship it' });
await put('garage', 'approvals', { approvals: [
  { id: 'A-00000001', title: 'Use Postgres 16', risk: 'low', reason: 'newer features', status: 'approved', created: ago(5000_000), decidedAt: ago(4000_000), note: 'fine' },
  { id: 'A-00000002', title: 'Drop legacy table', risk: 'high', reason: 'irreversible', status: 'pending', created: ago(60_000) } ] });
await put('garage', 'mission', { title: 'Garage Rebuild', summary: 'Rebuild the parts catalogue for the garage.' });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:4316/', { waitUntil: 'networkidle' });
await page.click('text=Terminal');
await page.click('[data-tab="Tasks"]'); await sleep(800);
for (const c of ['planned', 'in_progress', 'review', 'blocked', 'done']) console.log(`tasks[${c}]:`, (await page.locator(`[data-col="${c}"] [data-task]`).allInnerTexts()).map((t) => t.replace(/\n/g, ' ')).join(' || '));
await page.screenshot({ path: 'docs/proof/step13-tasks.png' });
await put('garage', 'tasks', { tasks: [...(await (await fetch('http://localhost:4317/api/projects/garage')).json()).tasks, { id: 'T7', title: 'Live-added task', owner: A, status: 'planned' }] });
await sleep(1200);
console.log('live: T7 appeared without reload:', await page.locator('[data-task="T7"]').count());

await page.click('[data-tab="Decisions"]'); await sleep(600);
console.log('decisions order:', (await page.locator('[data-decision]').evaluateAll((els) => els.map((e) => `${e.dataset.decision}${e.dataset.pending === 'true' ? '(pending)' : ''}`))).join(' → '));
await page.screenshot({ path: 'docs/proof/step13-decisions.png' });

await page.click('[data-tab="Brief"]'); await sleep(600);
console.log('brief phase (some not done):', await page.getByTestId('phase').innerText());
await page.screenshot({ path: 'docs/proof/step13-brief.png' });
const all = (await (await fetch('http://localhost:4317/api/projects/garage')).json()).tasks;
await put('garage', 'tasks', { tasks: all.map((t) => ({ ...t, status: 'done', verified: t.id !== 'T6' })) }); await sleep(1200);
console.log('brief phase (all done, not all verified):', await page.getByTestId('phase').innerText());
await put('garage', 'tasks', { tasks: all.map((t) => ({ ...t, status: 'done', verified: true })) }); await sleep(1200);
console.log('brief phase (all done + verified):', await page.getByTestId('phase').innerText());
await put('garage', 'tasks', { tasks: [] }); await sleep(1200);
console.log('brief phase (no tasks):', await page.getByTestId('phase').count() ? 'chip shown' : 'no chip');

await page.click('[data-tab="Timeline"]'); await sleep(1000);
const cursors = async () => page.locator('[data-cursor]').evaluateAll((els) => els.map((e) => e.dataset.cursor));
const c1 = await cursors();
console.log('timeline page 1:', c1.length, 'entries; day groups:', (await page.locator('[data-day]').evaluateAll((els) => els.map((e) => e.dataset.day))).join(' / '));
console.log('  last on page 1:', c1.at(-1));
await page.getByTestId('load-older').click(); await sleep(800);
const c2 = await cursors();
console.log('after Load older:', c2.length, 'entries; first of page 2:', c2[50], '| duplicates:', c2.length - new Set(c2).size, '| Load older still shown:', await page.getByTestId('load-older').count());
console.log('  same timestamp across the boundary:', c2[49].split('|')[0] === c2[50].split('|')[0]);
await page.screenshot({ path: 'docs/proof/step13-timeline.png', fullPage: true });
await page.selectOption('[data-testid="f-project"]', 'unattributed'); await sleep(800);
const un = await page.locator('[data-cursor]').count();
console.log('filter project=unattributed:', un, 'entries (expected', list.filter((e) => e.i % 4 === 0).length + ')');
await page.selectOption('[data-testid="f-project"]', ''); await page.selectOption('[data-testid="f-type"]', 'command'); await sleep(800);
console.log('filter type=command:', await page.locator('[data-cursor]').count(), 'entries (expected', list.filter((e) => e.i % 5 === 3).length + ')');
await page.selectOption('[data-testid="f-type"]', ''); await page.selectOption('[data-testid="f-agent"]', 'unattributed'); await sleep(800);
console.log('filter member=unattributed:', await page.locator('[data-cursor]').count(), 'entries (expected', list.filter((e) => e.i % 7 === 0).length + ')');
await page.selectOption('[data-testid="f-agent"]', '');  await sleep(800);
await ev({ type: 'note', agent: LEAD, project: 'garage', payload: { text: 'LIVE note arrives via SSE' } }); await sleep(1500);
console.log('live event on top:', (await page.locator('[data-cursor]').first().innerText()).replace(/\n/g, ' '));
console.log('page errors:', errs.length ? errs : 'none');
await browser.close();
