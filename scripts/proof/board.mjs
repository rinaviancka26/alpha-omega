// Step 10 proof: hand-written board state → which room and why.
import { createRequire } from 'node:module';
import { reset, put, ev, ago, sleep, T } from './sandbox.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const [LEAD, A, B, C, D, E, F, G] = T;
const iso = () => new Date().toISOString();
const browser = await chromium.launch();

async function shoot(name, label) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto('http://localhost:4316/', { waitUntil: 'networkidle' });
  await page.click('[data-tab="Office"]');
  await page.click('text=Terminal');
  await sleep(1500);
  const pl = await page.evaluate(() => window.__placements.map((p) => `${p.name.padEnd(7)} → ${p.room.padEnd(9)} ${p.seat.id.padEnd(12)} ${p.badge ? '[' + p.badge + ' !] ' : ''}${p.dim ? '[dimmed ' + p.ageTag + '] ' : ''}because: ${p.why}`));
  const badges = await page.locator('[data-badge]').evaluateAll((els) => els.map((e) => e.dataset.badge));
  const opacities = await page.locator('[data-member]').evaluateAll((els) => els.map((e) => `${e.dataset.member}:${getComputedStyle(e).opacity}`));
  console.log(`\n### ${label}\n` + pl.join('\n') + `\nbadges on screen: ${badges.join(', ') || 'none'}\nopacity: ${opacities.join(' ')}`);
  console.log('banner:', await page.getByTestId('hud').innerText().then((t) => t.replace(/\n/g, ' ')));
  await page.screenshot({ path: `docs/proof/${name}.png` });
  await page.close();
}

// Scenario 1: no project loaded
reset({ active: null });
await shoot('step10-no-project', 'No project loaded');

// Scenario 2: a working agent, a stale working agent, a blocked task, a review task, a pending approval, a 3-hour-old completion
reset();
await ev({ type: 'session_start', agent: LEAD, payload: {} });
await put('garage', 'agents', { agents: {
  [LEAD]: { state: 'approval', since: ago(120_000), heartbeat: iso() },
  [A]: { state: 'working', task: 'Spec the parts catalogue', since: ago(400_000), heartbeat: iso() },
  [B]: { state: 'working', task: 'Rewrite onboarding copy', since: ago(50 * 60_000), heartbeat: ago(32 * 60_000) },
  [C]: { state: 'completed', task: 'Dockerfile', say: 'Image builds in 41 s.', since: ago(3 * 3600_000), heartbeat: ago(3 * 3600_000) },
  [F]: { state: 'idle', since: ago(600_000) },
} });
await put('garage', 'tasks', { tasks: [
  { id: 'T1', title: 'Spec the parts catalogue', owner: A, status: 'in_progress', files: ['docs/parts.md'] },
  { id: 'T2', title: 'Rewrite onboarding copy', owner: B, status: 'in_progress', files: ['src/copy.ts'] },
  { id: 'T3', title: 'Parts table migration', owner: E, status: 'blocked', files: ['db/001.sql'], note: 'needs a decision on SKU format' },
  { id: 'T4', title: 'Parts API', owner: F, status: 'review', files: ['server/parts.ts'] },
  { id: 'T5', title: 'Dockerfile', owner: C, status: 'done', verified: true, files: ['Dockerfile'] },
] });
await put('garage', 'approvals', { approvals: [{ id: 'A-1234abcd', title: 'Drop the legacy parts table', risk: 'high', reason: 'irreversible', status: 'pending', created: ago(90_000) }] });
await put('garage', 'plan', { status: 'approved', title: 'Parts catalogue v1', scope: 'catalogue', risks: [], tasks: [] });
await shoot('step10-board', 'Working / stale / blocked / review / pending approval / 3-hour-old completion');

// Scenario 3: plan awaiting approval → owners in the briefing room
await put('garage', 'plan', { status: 'awaiting-approval', title: 'Parts catalogue v2', scope: 'search + filters', risks: ['index size'], tasks: [
  { id: 'P1', title: 'Search spec', owner: A, files: ['docs/search.md'] }, { id: 'P2', title: 'Search API', owner: F, files: ['server/search.ts'] }, { id: 'P3', title: 'Search docs', owner: G, files: ['docs/api.md'] }] });
await put('garage', 'approvals', { approvals: [] });
await put('garage', 'agents', { agents: { [LEAD]: { state: 'idle', heartbeat: iso() } } });
await put('garage', 'tasks', { tasks: [] });
await shoot('step10-plan-briefing', 'Plan awaiting approval');
await browser.close();
