// Step 9 proof: lights, seats, closing line → walk to break room, directive walk with facing checks, no overlap.
import { createRequire } from 'node:module';
import { reset, put, ev, ago, sleep, T } from './sandbox.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const [LEAD, A, B, C, D, E, F, G] = T;
reset();
const iso = () => new Date().toISOString();
const agents = {
  [LEAD]: { state: 'idle', since: ago(60_000), heartbeat: iso() },
  [A]: { state: 'working', task: 'Write acceptance criteria', since: ago(300_000), heartbeat: iso() },
  [B]: { state: 'working', task: 'Draft the launch copy', since: ago(200_000), heartbeat: iso() },
  [C]: { state: 'completed', task: 'CI pipeline', say: 'CI is green.', since: ago(3 * 3600_000), heartbeat: ago(3 * 3600_000) },
  [E]: { state: 'working', task: 'Migrate the parts table', since: ago(100_000), heartbeat: iso() },
  [G]: { state: 'working', task: 'Document the API', since: ago(100_000), heartbeat: iso() },
};
await put('garage', 'agents', { agents });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
if (process.env.DBG) page.on('request', (r) => { if (r.url().includes('/api/') && !r.url().includes('terminal')) console.log(Date.now() % 100000, 'req', r.url().slice(21)); });
await page.goto('http://localhost:4316/', { waitUntil: 'networkidle' });
await page.click('[data-tab="Office"]');
await page.click('text=Terminal'); // collapse dock for a bigger map
await sleep(800);
const lights = () => page.getByTestId('lights').innerText();
console.log('before session_start:', await lights());
await page.screenshot({ path: 'docs/proof/step9-lights-off.png' });
await ev({ type: 'session_start', agent: LEAD, payload: { source: 'startup' } });
await sleep(1500);
console.log('after real session_start event:', await lights());
await page.screenshot({ path: 'docs/proof/step9-settled.png' });
const pl = await page.evaluate(() => window.__placements.map((p) => ({ name: p.name, room: p.room, seat: p.seat.id, why: p.why })));
console.table(pl);
const seatIds = pl.map((p) => p.seat);
console.log('unique seats:', new Set(seatIds).size === seatIds.length);

// A finishes → closing bubble at desk, then walk to a break room
await put('garage', 'agents', { agents: { ...agents, [A]: { ...agents[A], state: 'completed', say: 'Acceptance criteria are in docs/criteria.md — verified against the plan.', since: iso(), heartbeat: iso() } } });
await sleep(700);
console.log('server state for A:', JSON.stringify((await (await fetch('http://localhost:4317/api/state')).json()).project.agents[A]).slice(0, 80), '| roster:', (await page.locator(`[data-roster="${A}"]`).innerText()).replace(/\n/g, ' '));
const bub = await page.locator(`[data-bubble="${A}"]`).innerText().catch(() => null);
console.log(`closing bubble for ${A} at desk:`, JSON.stringify(bub), '| room:', await page.locator(`[data-member="${A}"]`).getAttribute('data-room'));
await page.screenshot({ path: 'docs/proof/step9-closing-line.png' });
// sample the walk
const samples = [];
const t0 = Date.now();
while (Date.now() - t0 < 9000) {
  const s = await page.evaluate((n) => { const el = document.querySelector(`[data-member="${n}"]`); const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, pose: el.dataset.pose, flip: el.dataset.flip, moving: el.dataset.moving, op: getComputedStyle(el).opacity }; }, A);
  samples.push(s);
  if (samples.length === 18) await page.screenshot({ path: 'docs/proof/step9-mid-walk.png' });
  await sleep(90);
}
let checked = 0, wrong = 0;
for (let i = 1; i < samples.length; i++) {
  const a = samples[i - 1], b = samples[i];
  if (b.moving !== 'true' || a.pose !== b.pose) continue;
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.abs(dx) < 1.5 && Math.abs(dy) < 1.5) continue;
  checked++;
  if (b.pose === 'side' && ((dx > 0) !== (b.flip === 'true'))) wrong++;
  if (b.pose === 'back' && dy > 0.5) wrong++;
  if (b.pose === 'front' && dy < -0.5) wrong++;
}
console.log(`facing check on ${checked} moving samples: ${wrong} wrong; poses seen: ${[...new Set(samples.filter((s) => s.moving === 'true').map((s) => s.pose + (s.flip === 'true' ? '(mirrored)' : '')))].join(', ')}; min opacity while walking: ${Math.min(...samples.map((s) => +s.op))}`);
console.log(`${A} arrived in:`, await page.locator(`[data-member="${A}"]`).getAttribute('data-room'), '| ☕:', await page.locator(`[data-coffee="${A}"]`).count());
await page.screenshot({ path: 'docs/proof/step9-arrived.png' });
// directive: D (resting) → briefing room (walks up through the corridors)
await put('garage', 'agents', { agents: { ...agents, [A]: { ...agents[A], state: 'completed', say: 'done', since: ago(60_000) }, [D]: { state: 'idle', intendedRoom: 'briefing', voice: 'Collecting sources on torque specs for the brief.', directiveAt: iso(), heartbeat: iso() } } });
const s2 = []; const t1 = Date.now();
while (Date.now() - t1 < 8000) { s2.push(await page.evaluate((n) => { const el = document.querySelector(`[data-member="${n}"]`); const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, pose: el.dataset.pose, flip: el.dataset.flip, moving: el.dataset.moving }; }, D)); if (s2.length === 25) await page.screenshot({ path: 'docs/proof/step9-directive-walk.png' }); await sleep(90); }
let c2 = 0, w2 = 0;
for (let i = 1; i < s2.length; i++) { const a = s2[i - 1], b = s2[i]; if (b.moving !== 'true' || a.pose !== b.pose) continue; const dx = b.x - a.x, dy = b.y - a.y; if (Math.abs(dx) < 1.5 && Math.abs(dy) < 1.5) continue; c2++; if (b.pose === 'side' && ((dx > 0) !== (b.flip === 'true'))) w2++; if (b.pose === 'back' && dy > 0.5) w2++; if (b.pose === 'front' && dy < -0.5) w2++; }
console.log(`${D} directive walk: facing check on ${c2} moving samples: ${w2} wrong; poses seen: ${[...new Set(s2.filter((s) => s.moving === 'true').map((s) => s.pose + (s.flip === 'true' ? '(mirrored)' : '')))].join(', ')}; arrived in ${await page.locator(`[data-member="${D}"]`).getAttribute('data-room')}; bubble: ${JSON.stringify(await page.locator(`[data-bubble="${D}"]`).innerText().catch(() => null))}`);
await page.screenshot({ path: 'docs/proof/step9-directive-arrived.png' });
// overlap check: feet positions of all characters at rest
const feet = await page.evaluate(() => [...document.querySelectorAll('[data-member]')].map((el) => { const r = el.getBoundingClientRect(); return { n: el.dataset.member, x: r.x, y: r.y }; }));
let minD = 1e9; for (let i = 0; i < feet.length; i++) for (let j = i + 1; j < feet.length; j++) minD = Math.min(minD, Math.hypot(feet[i].x - feet[j].x, feet[i].y - feet[j].y));
console.log(`min distance between any two characters' feet: ${minD.toFixed(1)} px`);
// modal
await page.click(`[data-roster="${B}"]`);
await sleep(300);
await page.screenshot({ path: 'docs/proof/step9-modal.png' });
console.log('modal shows:', (await page.getByTestId('member-modal').innerText()).split('\n').slice(0, 4).join(' | '));
await page.keyboard.press('Escape'); await page.mouse.click(5, 5);
// session end → dark
await ev({ type: 'session_end', agent: LEAD, payload: { reason: 'exit' } });
await sleep(1500);
console.log('after session_end:', await lights());
console.log('ticker:', (await page.getByTestId('ticker').innerText()).replace(/\n/g, ' ').slice(0, 200));
// demo toggle
await page.click('[data-testid="demo-toggle"]'); await sleep(1500);
await page.screenshot({ path: 'docs/proof/step9-demo.png' });
console.log('demo label visible:', await page.locator('text=DEMO — SIMULATED ACTIVITY, NOT REAL').count());
console.log('page errors:', errs.length ? errs : 'none');
await browser.close();
