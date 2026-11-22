// Step 12 proof: Projects tab (gating, new, 409, add existing untouched, load + inject, sweep + toast).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { reset, sleep, SANDBOX, SAT } from './sandbox.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const WebSocket = createRequire(new URL('../../server/package.json', import.meta.url))('ws');
reset({ active: null });
const legacy = path.join(SANDBOX, 'work', 'legacy-shop');
fs.mkdirSync(legacy, { recursive: true });
execSync('git init -q -b main && git -c user.email=a@b -c user.name=proof commit -q --allow-empty -m init && echo wip > notes.txt', { cwd: legacy, shell: '/bin/bash' });
const snapshot = (dir) => crypto.createHash('md5').update(execSync(`find . -path ./.git/index -prune -o -type f -print0 | sort -z | xargs -0 md5sum`, { cwd: dir }).toString()).digest('hex');
const legacyBefore = snapshot(legacy);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:4316/', { waitUntil: 'networkidle' });
await page.click('[data-tab="Projects"]'); await sleep(1000);
console.log('Claude not live → Load disabled:', await page.locator('[data-load="garage"]').isDisabled(), '| New disabled:', await page.getByTestId('new-btn').isDisabled(), '| tooltip:', await page.locator('[data-load="garage"]').locator('..').getAttribute('title'));
await page.screenshot({ path: 'docs/proof/step12-gated.png' });

const ws = new WebSocket('ws://localhost:4317/pty?sid=proof-claude-12');
let out = ''; ws.on('message', (m) => { const j = JSON.parse(m); if (j.data) out += j.data; });
await new Promise((r) => ws.on('open', r));
ws.send(JSON.stringify({ type: 'input', data: new URL('./stub-claude/claude', import.meta.url).pathname + '\r' }));
await sleep(4500);
console.log('stub claude live → Load enabled:', !(await page.locator('[data-load="garage"]').isDisabled()));

await page.fill('[data-testid="new-name"]', 'Turbo Shop');
await page.click('[data-testid="new-btn"]');
await sleep(400);
console.log('sweep overlay shown:', await page.getByTestId('sweep').count());
await page.screenshot({ path: 'docs/proof/step12-sweep.png' });
await sleep(900);
console.log('toasts:', (await page.getByTestId('toast').allInnerTexts()).join(' | '));
const created = path.join(SANDBOX, 'projects-root', 'turbo-shop');
console.log('created folder:', fs.existsSync(created), '| README:', fs.existsSync(path.join(created, 'README.md')), '| .git:', fs.existsSync(path.join(created, '.git')));
const readmeM = fs.statSync(path.join(created, 'README.md')).mtimeMs;
console.log('config.activeProject:', JSON.parse(fs.readFileSync(path.join(SAT, 'config.json'), 'utf8')).activeProject, '| header:', await page.getByTestId('working-on').innerText());
await page.screenshot({ path: 'docs/proof/step12-new-project.png' });

await page.fill('[data-testid="new-name"]', 'Turbo Shop');
await page.click('[data-testid="new-btn"]'); await sleep(800);
console.log('duplicate → error toast:', (await page.locator('[data-testid="toast"][data-tone="error"]').allInnerTexts()).join(' | '));
const r409 = await fetch('http://localhost:4317/api/projects/new', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'turbo-shop' }) });
console.log('direct POST duplicate →', r409.status, '| README untouched:', fs.statSync(path.join(created, 'README.md')).mtimeMs === readmeM);

await page.fill('[data-testid="add-path"]', legacy);
await page.click('[data-testid="add-btn"]'); await sleep(1500);
console.log('legacy row:', (await page.locator('[data-project="legacy-shop"]').innerText()).replace(/\s+/g, ' '));
console.log('existing folder unmodified:', snapshot(legacy) === legacyBefore);
const bad = await fetch('http://localhost:4317/api/projects/add', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: path.join(SANDBOX, 'does-not-exist') }) });
console.log('add missing folder →', bad.status, JSON.stringify(await bad.json()));

await page.click('[data-load="garage"]'); await sleep(1500);
console.log('after Load garage — header:', await page.getByTestId('working-on').innerText());
console.log('rows:\n  ' + (await page.locator('tbody tr').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')).join('\n  '));
await page.screenshot({ path: 'docs/proof/step12-projects.png' });
console.log('PTY (stub claude) received:\n  ' + out.split(/\r?\n/).filter((l) => l.startsWith('STUB CLAUDE GOT')).join('\n  '));
ws.send(JSON.stringify({ type: 'kill' })); ws.close();
console.log('page errors:', errs.length ? errs : 'none');
await browser.close();
