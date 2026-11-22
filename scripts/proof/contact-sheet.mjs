// Contact sheet of every member's poses (256 + 48) and portrait with its colour swatch.
import fs from 'node:fs';
import sharp from 'sharp';
const card = JSON.parse(fs.readFileSync('web/src/card.generated.json', 'utf8'));
const src = fs.readFileSync('web/src/officeAssets.ts', 'utf8');
const SPRITES = JSON.parse(src.match(/export const SPRITES[^=]*= (\{[\s\S]*?\n\});/)[1]);
const CW = 256, ROWH = 300, cols = ['front_256', 'side_256', 'back_256', 'front_48', 'side_48', 'back_48', 'portrait_128', 'swatch'];
const W = 140 + cols.length * 170 + 300, H = 60 + card.team.length * ROWH;
const comps = [];
const text = (s, x, y, size = 22, fill = '#e5e7eb') => ({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="${size + 12}"><text x="0" y="${size}" font-family="DejaVu Sans" font-size="${size}" fill="${fill}">${s}</text></svg>`), left: x, top: y });
comps.push(text('front(256) · side(256, faces LEFT) · back(256) · front/side/back(48) · portrait(128) · colour', 20, 14, 20));
let y = 60;
for (const m of card.team) {
  const dir = `web/public/assets/characters/${m.name}`;
  comps.push(text(`${m.name}`, 20, y + 110, 26), text(m.role, 20, y + 146, 18, '#9ca3af'));
  let x = 140;
  for (const c of ['front_256', 'side_256', 'back_256']) {
    // checker bg shows transparency; red line = shared baseline (bottom of canvas)
    comps.push({ input: await sharp({ create: { width: CW, height: CW, channels: 4, background: '#2a2d36' } }).composite([{ input: `${dir}/${c}.png` }]).png().toBuffer(), left: x, top: y });
    comps.push({ input: { create: { width: CW, height: 2, channels: 4, background: '#ff3b3b' } }, left: x, top: y + CW - 8 });
    x += CW + 14;
  }
  for (const c of ['front_48', 'side_48', 'back_48']) { comps.push({ input: `${dir}/${c}.png`, left: x, top: y + 200 }); x += 60; }
  comps.push({ input: `${dir}/portrait_128.png`, left: x + 10, top: y + 60 }); x += 160;
  const col = SPRITES[m.name].colour;
  comps.push({ input: { create: { width: 90, height: 90, channels: 4, background: col } }, left: x, top: y + 80 }, text(col, x, y + 180, 18));
  y += ROWH;
}
await sharp({ create: { width: 1650, height: H, channels: 4, background: '#14171f' } }).composite(comps).png().toFile(process.argv[2] || 'docs/proof/step3-contact-sheet.png');
console.log('contact sheet written');
