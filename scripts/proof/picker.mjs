import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:4316/picker.html', { waitUntil: 'networkidle' });
const map = page.getByTestId('map');
const box = await map.boundingBox();
const at = (px, py) => ({ x: box.x + (px / 100) * box.width, y: box.y + (py / 100) * box.height });
const okCount = async () => page.locator('[data-ok="true"]').count();
const total = async () => page.locator('#root li').count();
console.log('empty: checklist ok', await okCount(), '/', await total());
// ROOM: drag lounge
await page.getByTestId('room-key').selectOption('lounge');
let a = at(2, 74), b = at(29, 97);
await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up();
console.log('room drawn:', await page.locator('[data-room="lounge"]').innerText());
// SEAT inside lounge
await page.click('[data-mode="SEAT"]'); let s = at(10, 85); await page.mouse.click(s.x, s.y);
console.log('seat:', await page.getByTestId('msg').innerText());
// DOOR for lounge, NODE j_top, CONNECT
await page.click('[data-mode="DOOR"]'); await page.getByTestId('room-key').selectOption('lounge'); s = at(29, 86); await page.mouse.click(s.x, s.y);
await page.click('[data-mode="NODE"]'); await page.getByTestId('node-id').fill('j_top'); s = at(20, 34); await page.mouse.click(s.x, s.y);
await page.click('[data-mode="CONNECT"]'); await page.click('[data-point="d_lounge"]'); await page.click('[data-point="j_top"]');
console.log('connect:', await page.getByTestId('msg').innerText());
await page.screenshot({ path: 'docs/proof/step4-picker-editing.png' });
// delete node then undo
await page.click('[data-point="j_top"]'); await page.getByTestId('delete').click();
console.log('after delete j_top present?', await page.locator('[data-point="j_top"]').count());
await page.getByText('Undo').click();
console.log('after undo j_top present?', await page.locator('[data-point="j_top"]').count());
// export
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').click()]);
const exp = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
console.log('export:', JSON.stringify(exp));
// import the real file
await page.getByTestId('import').setInputFiles('web/src/office-coordinates.json');
await page.waitForTimeout(300);
console.log('imported real coords: checklist ok', await okCount(), '/', await total());
console.log((await page.getByTestId('checklist').innerText()).replace(/\n/g, ' | '));
await page.screenshot({ path: 'docs/proof/step4-picker-full.png' });
console.log('page errors:', errs.length ? errs : 'none');
await browser.close();
