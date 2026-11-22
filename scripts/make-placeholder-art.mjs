#!/usr/bin/env node
// Generates CLEARLY-PLACEHOLDER art for every card member + the office map.
//   raw/<name>/{front,side,back,portrait}.png   (side faces LEFT)
//   raw/office.png  (1448×1086)   raw/icon.png
// and copies everything to art/placeholder/ (raw/ is gitignored).
// Replace the files in raw/ with real art and run `npm run assets`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { parseCard } from './card.mjs';
import * as L from './office-layout.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const card = parseCard(fs.readFileSync(path.join(ROOT, 'mission.card.md'), 'utf8'));
const RAW = path.join(ROOT, 'raw');
const COPY = path.join(ROOT, 'art', 'placeholder');
const onlyMissing = process.argv.includes('--missing-only');

const OL = '#1b1b26';
const SW = 14;
const hsl = (h, s, l) => `hsl(${h} ${s}% ${l}%)`;
const METAL = '#a7b0c2', METAL_S = '#717a8d';
const OVER = '#3b4558', OVER_S = '#2a3242';
const BOOT = '#34343f', BOOT_S = '#24242c';

let uid = 0;
/** Flat fill + ONE shadow tone (crescent bottom-right) + thick outline. `shape(extra)` returns an SVG element. */
function part(shape, base, shade, dx = -22, dy = -18) {
  const id = `c${uid++}`;
  return `<clipPath id="${id}">${shape('')}</clipPath>
<g clip-path="url(#${id})"><rect x="-99" y="-99" width="2000" height="2000" fill="${shade}"/>${shape(`fill="${base}" transform="translate(${dx},${dy})"`)}</g>
${shape(`fill="none" stroke="${OL}" stroke-width="${SW}" stroke-linejoin="round"`)}`;
}
const rr = (x, y, w, h, r) => (extra) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ${extra}/>`;
const circ = (cx, cy, r) => (extra) => `<circle cx="${cx}" cy="${cy}" r="${r}" ${extra}/>`;
const pth = (d) => (extra) => `<path d="${d}" ${extra}/>`;
const flat = (shape, fill) => shape(`fill="${fill}" stroke="${OL}" stroke-width="${SW}" stroke-linejoin="round"`);

function wrench(x, y, rot) {
  return `<g transform="translate(${x},${y}) rotate(${rot})">
${part(pth('M -16 -120 L 16 -120 L 16 40 L -16 40 Z'), METAL, METAL_S, -8, -6)}
${part(pth('M -44 -150 A 46 46 0 1 0 44 -150 L 20 -150 L 20 -186 L -20 -186 L -20 -150 Z'), METAL, METAL_S, -8, -8)}
</g>`;
}
function antenna(x) {
  return `<line x1="${x}" y1="172" x2="${x}" y2="128" stroke="${OL}" stroke-width="${SW}" stroke-linecap="round"/>
${part(circ(x, 120, 22), '#ffd23f', '#e0a400', -6, -6)}`;
}
function initialBadge(cx, cy, letter) {
  return `${flat(circ(cx, cy, 30), '#f4f1e8')}
<text x="${cx}" y="${cy + 13}" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="38" text-anchor="middle" fill="${OL}">${letter}</text>`;
}

function front(h, letter) {
  const C = hsl(h, 72, 58), S = hsl(h, 64, 42);
  return `
${part(rr(400, 830, 120, 100, 40), BOOT, BOOT_S)}${part(rr(504, 830, 120, 100, 40), BOOT, BOOT_S)}
${part(rr(420, 690, 80, 160, 20), OVER, OVER_S)}${part(rr(524, 690, 80, 160, 20), OVER, OVER_S)}
${part(rr(300, 488, 74, 196, 37), C, S)}
${wrench(690, 690, 28)}
${part(rr(650, 488, 74, 196, 37), C, S)}
${part(rr(372, 466, 280, 252, 64), C, S)}
${part(pth('M 380 600 L 644 600 L 644 670 Q 644 718 596 718 L 428 718 Q 380 718 380 670 Z'), OVER, OVER_S)}
${part(rr(442, 532, 140, 100, 18), OVER, OVER_S)}
<line x1="452" y1="540" x2="410" y2="478" stroke="${OL}" stroke-width="22" stroke-linecap="round"/>
<line x1="572" y1="540" x2="614" y2="478" stroke="${OL}" stroke-width="22" stroke-linecap="round"/>
${initialBadge(512, 580, letter)}
${part(circ(337, 700, 44), METAL, METAL_S, -10, -10)}${part(circ(687, 700, 44), METAL, METAL_S, -10, -10)}
${part(rr(468, 440, 88, 40, 12), METAL, METAL_S)}
${part(circ(340, 305, 38), METAL, METAL_S, -10, -10)}${part(circ(684, 305, 38), METAL, METAL_S, -10, -10)}
${antenna(512)}
${part(rr(342, 160, 340, 290, 76), C, S, -26, -20)}
${flat(rr(384, 214, 256, 168, 52), '#1d2433')}
<rect x="438" y="262" width="46" height="64" rx="23" fill="#6ff3ff"/><rect x="540" y="262" width="46" height="64" rx="23" fill="#6ff3ff"/>
<rect x="446" y="270" width="14" height="18" rx="7" fill="#ffffff"/><rect x="548" y="270" width="14" height="18" rx="7" fill="#ffffff"/>
<path d="M 470 342 Q 512 374 554 342" stroke="#6ff3ff" stroke-width="12" fill="none" stroke-linecap="round"/>
<circle cx="404" cy="400" r="12" fill="${OL}" opacity=".35"/><circle cx="620" cy="400" r="12" fill="${OL}" opacity=".35"/>`;
}

function side(h, letter) { // faces LEFT
  const C = hsl(h, 72, 58), S = hsl(h, 64, 42);
  return `
${part(rr(470, 830, 150, 100, 40), BOOT_S, '#1a1a20')}
${part(rr(520, 690, 80, 160, 20), OVER_S, '#1f2633')}
${part(rr(400, 830, 150, 100, 40), BOOT, BOOT_S)}
${part(rr(450, 690, 80, 160, 20), OVER, OVER_S)}
${part(rr(410, 466, 220, 252, 64), C, S)}
${part(pth('M 418 600 L 622 600 L 622 670 Q 622 718 574 718 L 466 718 Q 418 718 418 670 Z'), OVER, OVER_S)}
<line x1="440" y1="600" x2="470" y2="478" stroke="${OL}" stroke-width="22" stroke-linecap="round"/>
${wrench(470, 700, -28)}
${part(rr(480, 488, 74, 196, 37), C, S)}
${part(circ(510, 700, 44), METAL, METAL_S, -10, -10)}
${part(rr(470, 440, 88, 40, 12), METAL, METAL_S)}
${antenna(540)}
${part(rr(372, 160, 300, 290, 76), C, S, -26, -20)}
${part(circ(590, 310, 44), METAL, METAL_S, -10, -10)}
${flat(circ(590, 310, 12), METAL_S)}
${flat(rr(346, 214, 160, 168, 52), '#1d2433')}
<rect x="378" y="262" width="44" height="64" rx="22" fill="#6ff3ff"/><rect x="384" y="270" width="14" height="18" rx="7" fill="#ffffff"/>
<path d="M 364 344 Q 390 366 424 346" stroke="#6ff3ff" stroke-width="12" fill="none" stroke-linecap="round"/>`;
}

function back(h, letter) {
  const C = hsl(h, 72, 58), S = hsl(h, 64, 42);
  return `
${part(rr(400, 830, 120, 100, 40), BOOT, BOOT_S)}${part(rr(504, 830, 120, 100, 40), BOOT, BOOT_S)}
${part(rr(420, 690, 80, 160, 20), OVER, OVER_S)}${part(rr(524, 690, 80, 160, 20), OVER, OVER_S)}
${part(rr(300, 488, 74, 196, 37), C, S)}${part(rr(650, 488, 74, 196, 37), C, S)}
${part(rr(372, 466, 280, 252, 64), C, S)}
${part(pth('M 380 600 L 644 600 L 644 670 Q 644 718 596 718 L 428 718 Q 380 718 380 670 Z'), OVER, OVER_S)}
<line x1="420" y1="478" x2="600" y2="604" stroke="${OL}" stroke-width="22" stroke-linecap="round"/>
<line x1="604" y1="478" x2="424" y2="604" stroke="${OL}" stroke-width="22" stroke-linecap="round"/>
${part(rr(470, 640, 84, 56, 12), OVER_S, '#1f2633')}
${part(circ(337, 700, 44), METAL, METAL_S, -10, -10)}${part(circ(687, 700, 44), METAL, METAL_S, -10, -10)}
${part(rr(468, 440, 88, 40, 12), METAL, METAL_S)}
${part(circ(340, 305, 38), METAL, METAL_S, -10, -10)}${part(circ(684, 305, 38), METAL, METAL_S, -10, -10)}
${antenna(512)}
${part(rr(342, 160, 340, 290, 76), C, S, -26, -20)}
${part(rr(412, 222, 200, 150, 30), METAL, METAL_S, -10, -10)}
<g stroke="${OL}" stroke-width="10" stroke-linecap="round"><line x1="450" y1="270" x2="574" y2="270"/><line x1="450" y1="298" x2="574" y2="298"/><line x1="450" y1="326" x2="574" y2="326"/></g>
<g fill="${OL}"><circle cx="430" cy="240" r="7"/><circle cx="594" cy="240" r="7"/><circle cx="430" cy="354" r="7"/><circle cx="594" cy="354" r="7"/></g>`;
}

const svgDoc = (inner, w = 1024, h = 1024, vb = `0 0 ${w} ${h}`) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}">${inner}</svg>`;

function portrait(h, letter) {
  const bg = hsl(h, 45, 22);
  return svgDoc(`<circle cx="512" cy="330" r="262" fill="${bg}"/>${front(h, letter)}
<rect x="250" y="560" width="524" height="56" rx="14" fill="#000" opacity=".55"/>
<text x="512" y="598" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="30" text-anchor="middle" fill="#fff" letter-spacing="4">PLACEHOLDER</text>`,
  1024, 1024, '230 50 564 590');
}

// ---------- office ----------
function office() {
  const { W, H, ROOMS, CORRIDORS, DOORS } = L;
  const out = [];
  out.push(`<defs>
<pattern id="tiles" width="48" height="48" patternUnits="userSpaceOnUse"><rect width="48" height="48" fill="#24262d"/><path d="M48 0H0V48" fill="none" stroke="#1a1b20" stroke-width="3"/><rect x="3" y="3" width="20" height="20" fill="#272930"/></pattern>
<pattern id="ctiles" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="#2e3038"/><path d="M40 0H0V40" fill="none" stroke="#24262c" stroke-width="2"/></pattern>
<radialGradient id="amber"><stop offset="0" stop-color="#ffb347" stop-opacity=".55"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
<radialGradient id="blue"><stop offset="0" stop-color="#4fa8ff" stop-opacity=".45"/><stop offset="1" stop-color="#4fa8ff" stop-opacity="0"/></radialGradient>
<radialGradient id="rug"><stop offset="0" stop-color="#5b3a6e"/><stop offset="1" stop-color="#3d2850"/></radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="#0c0d11"/>`);
  for (const [x0, y0, x1, y1] of CORRIDORS) out.push(`<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="url(#ctiles)"/>`);
  for (const [, [x0, y0, x1, y1]] of Object.entries(ROOMS)) out.push(`<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="url(#tiles)"/>`);
  // corridor guide stripes
  out.push(`<g stroke="#8b7a3a" stroke-width="3" stroke-dasharray="18 22" opacity=".35"><line x1="40" y1="340" x2="1410" y2="340"/><line x1="650" y1="340" x2="650" y2="760"/><line x1="40" y1="760" x2="890" y2="760"/></g>`);

  const desk = (x, y, w = 110, h = 50) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#3a3f4b" stroke="${OL}" stroke-width="6"/>`;
  const monitor = (x, y, w = 54) => `<circle cx="${x + w / 2}" cy="${y + 10}" r="60" fill="url(#blue)"/><rect x="${x}" y="${y}" width="${w}" height="20" rx="4" fill="#5cc4ff" stroke="${OL}" stroke-width="5"/>`;
  const chair = (x, y) => `<circle cx="${x}" cy="${y}" r="17" fill="#2b2f3a" stroke="${OL}" stroke-width="5"/>`;
  const plant = (x, y, r = 26) => `<circle cx="${x}" cy="${y}" r="${r + 8}" fill="#5a3d2b" stroke="${OL}" stroke-width="5"/><circle cx="${x - 8}" cy="${y - 6}" r="${r * 0.7}" fill="#3fa34d" stroke="${OL}" stroke-width="4"/><circle cx="${x + 9}" cy="${y + 4}" r="${r * 0.6}" fill="#2f8a3c" stroke="${OL}" stroke-width="4"/><circle cx="${x + 2}" cy="${y - 14}" r="${r * 0.45}" fill="#56c062" stroke="${OL}" stroke-width="4"/>`;
  const lamp = (x, y) => `<circle cx="${x}" cy="${y}" r="70" fill="url(#amber)"/><circle cx="${x}" cy="${y}" r="9" fill="#ffcf7a" stroke="${OL}" stroke-width="4"/>`;

  // furniture per room (kept clear of seats, which are where characters stand)
  const S = L.SEATS;
  const deskRow = (seats) => seats.map(([x, y]) => desk(x - 55, y - 92) + monitor(x - 27, y - 88)).join('');
  out.push(deskRow(S.workspace)); out.push(deskRow(S.command.slice(0, 3))); out.push(deskRow([S.command[3], S.command[4], S.command[5]]));
  // command wall screen
  out.push(`<circle cx="1060" cy="395" r="140" fill="url(#blue)"/><rect x="900" y="390" width="320" height="22" rx="6" fill="#5cc4ff" stroke="${OL}" stroke-width="6"/>`);
  // server racks
  for (let i = 0; i < 4; i++) {
    const x = 940 + i * 120;
    out.push(`<rect x="${x}" y="760" width="90" height="40" rx="6" fill="#1e2129" stroke="${OL}" stroke-width="6"/>` +
      [0, 1, 2, 3].map((k) => `<circle cx="${x + 14 + k * 20}" cy="780" r="5" fill="${k % 2 ? '#3fe08a' : '#4fa8ff'}"/>`).join(''));
  }
  out.push(deskRow([S.server[2], S.server[3], S.server[4]]).replace(/#3a3f4b/g, '#30343e'));
  // meeting table
  out.push(`<rect x="560" y="165" width="320" height="50" rx="25" fill="#4a3b33" stroke="${OL}" stroke-width="7"/>`);
  // briefing screen + table
  out.push(`<circle cx="250" cy="40" r="120" fill="url(#blue)"/><rect x="120" y="34" width="260" height="18" rx="5" fill="#5cc4ff" stroke="${OL}" stroke-width="6"/><rect x="150" y="196" width="190" height="30" rx="10" fill="#4a3b33" stroke="${OL}" stroke-width="6"/>`);
  // approval desk + stamp
  out.push(`<rect x="1060" y="110" width="300" height="50" rx="8" fill="#4a3b33" stroke="${OL}" stroke-width="7"/><rect x="1180" y="118" width="40" height="30" rx="5" fill="#e04848" stroke="${OL}" stroke-width="4"/><rect x="1240" y="122" width="60" height="24" rx="3" fill="#f2efe6" stroke="${OL}" stroke-width="4"/>`);
  // pantry counter, fridge, coffee
  out.push(`<rect x="440" y="820" width="300" height="46" rx="6" fill="#3d4250" stroke="${OL}" stroke-width="7"/><rect x="800" y="815" width="80" height="60" rx="8" fill="#c9d1dc" stroke="${OL}" stroke-width="7"/><rect x="600" y="826" width="40" height="32" rx="6" fill="#7b4a2a" stroke="${OL}" stroke-width="5"/><circle cx="560" cy="935" r="30" fill="#4a3b33" stroke="${OL}" stroke-width="6"/><circle cx="740" cy="935" r="30" fill="#4a3b33" stroke="${OL}" stroke-width="6"/>`);
  // lounge rug + sofas
  out.push(`<ellipse cx="190" cy="940" rx="150" ry="70" fill="url(#rug)" stroke="${OL}" stroke-width="5"/><rect x="40" y="815" width="290" height="30" rx="14" fill="#6c4f8f" stroke="${OL}" stroke-width="7"/><rect x="150" y="915" width="80" height="44" rx="10" fill="#4a3b33" stroke="${OL}" stroke-width="6"/>`);
  // plants
  for (const [x, y] of [[50, 60], [450, 60], [1400, 60], [45, 410], [560, 700], [1400, 410], [1400, 700], [45, 1035], [880, 1035], [1400, 1035]]) out.push(plant(x, y));
  // walls
  for (const [, [x0, y0, x1, y1]] of Object.entries(ROOMS)) out.push(`<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="none" stroke="#454b5c" stroke-width="${L.WALL}"/>`);
  out.push(`<rect x="18" y="18" width="${W - 36}" height="${H - 36}" fill="none" stroke="#5a6174" stroke-width="12"/>`);
  // doorway gaps (floor-coloured patches over the wall, with door-jamb marks)
  for (const d of DOORS) {
    const [x0, y0, x1, y1] = ROOMS[d.room];
    const [a, b] = d.span;
    let r;
    if (d.side === 'bottom') r = [a, y1 - 8, b - a, 16]; else if (d.side === 'top') r = [a, y0 - 8, b - a, 16];
    else if (d.side === 'left') r = [x0 - 8, a, 16, b - a]; else r = [x1 - 8, a, 16, b - a];
    const horiz = d.side === 'top' || d.side === 'bottom';
    const gx = horiz ? r[0] : r[0] - 3, gy = horiz ? r[1] - 3 : r[1];
    out.push(`<rect x="${gx}" y="${gy}" width="${horiz ? r[2] : 22}" height="${horiz ? 22 : r[3]}" fill="url(#ctiles)"/>`);
    const j = (x, y) => `<rect x="${x - 7}" y="${y - 7}" width="14" height="14" fill="#8b5f2a" stroke="${OL}" stroke-width="3"/>`;
    out.push(horiz ? j(a, r[1] + 8) + j(b, r[1] + 8) : j(r[0] + 8, a) + j(r[0] + 8, b));
  }
  // amber wall lamps
  for (const [x, y] of [[120, 30], [380, 30], [600, 30], [860, 30], [1080, 30], [1320, 30], [30, 550], [1418, 550], [30, 930], [1418, 900], [300, 380], [1300, 380], [700, 1056]]) out.push(lamp(x, y));
  // room labels (from the card) + placeholder stamp
  for (const [k, [x0, y0, x1, y1]] of Object.entries(ROOMS)) {
    out.push(`<text x="${(x0 + x1) / 2}" y="${y1 - 22}" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="bold" text-anchor="middle" fill="#ffffff" opacity=".22" letter-spacing="3">${card.rooms[k].toUpperCase()}</text>`);
  }
  out.push(`<g transform="translate(330 760)"><rect x="-150" y="-20" width="300" height="34" rx="8" fill="#000" opacity=".5"/><text y="4" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="bold" text-anchor="middle" fill="#ffb347" letter-spacing="3">PLACEHOLDER MAP</text></g>`);
  return svgDoc(out.join('\n'), W, H);
}

function icon(h) {
  const C = hsl(h, 72, 58);
  return svgDoc(`<defs><radialGradient id="g"><stop offset=".55" stop-color="${C}" stop-opacity=".55"/><stop offset="1" stop-color="${C}" stop-opacity="0"/></radialGradient></defs>
<circle cx="512" cy="512" r="500" fill="url(#g)"/><clipPath id="sq"><rect x="112" y="112" width="800" height="800" rx="190"/></clipPath><rect x="112" y="112" width="800" height="800" rx="190" fill="#151821"/><g clip-path="url(#sq)">
<g transform="translate(512 600) scale(1.45) translate(-512 -330)">${front(h, card.team[0].name[0].toUpperCase())}</g></g><rect x="112" y="112" width="800" height="800" rx="190" fill="none" stroke="${C}" stroke-width="24"/>`, 1024, 1024);
}

// ---------- write ----------
async function render(svg, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(file);
}
export const memberHue = (i, n) => Math.round((12 + (360 / n) * i) % 360);

const jobs = [];
card.team.forEach((m, i) => {
  const h = memberHue(i, card.team.length);
  const L0 = m.name[0].toUpperCase();
  const poses = { front: svgDoc(front(h, L0)), side: svgDoc(side(h, L0)), back: svgDoc(back(h, L0)), portrait: portrait(h, L0) };
  for (const [pose, svg] of Object.entries(poses)) {
    const f = path.join(RAW, m.name, `${pose}.png`);
    if (onlyMissing && fs.existsSync(f)) continue;
    jobs.push(render(svg, f).then(() => f));
  }
});
const lh = memberHue(0, card.team.length);
for (const [name, svg] of [['office.png', office()], ['icon.png', icon(lh)]]) {
  const f = path.join(RAW, name);
  if (onlyMissing && fs.existsSync(f)) continue;
  jobs.push(render(svg, f).then(() => f));
}
const done = await Promise.all(jobs);
// mirror into art/placeholder/ (committed copy)
fs.rmSync(COPY, { recursive: true, force: true });
for (const f of done) {
  const dest = path.join(COPY, path.relative(RAW, f));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(f, dest);
}
console.log(`placeholder art: wrote ${done.length} files to raw/ (copy in art/placeholder/)`);
