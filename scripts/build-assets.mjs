#!/usr/bin/env node
// Asset pipeline: raw/ art → web/public/assets/ + web/src/officeAssets.ts.
// Team comes from web/src/card.generated.json (run scripts/card.mjs first).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = process.env.ALPHA_OMEGA_RAW ? path.resolve(process.env.ALPHA_OMEGA_RAW) : path.join(ROOT, 'raw');
const OUT = path.join(ROOT, 'web', 'public', 'assets');
const SRC = path.join(ROOT, 'web', 'src');
const card = JSON.parse(fs.readFileSync(path.join(SRC, 'card.generated.json'), 'utf8'));
const KERNEL = card.pixelArt ? sharp.kernel.nearest : sharp.kernel.lanczos3;
const POSES = ['front', 'side', 'back'];
const SIZES = [256, 48];
const MAP_W = 1448, MAP_H = 1086;

// ---------- 1. missing files → list exactly which, stop ----------
const required = [];
for (const m of card.team) for (const p of [...POSES, 'portrait']) required.push(path.join(RAW, m.name, `${p}.png`));
required.push(path.join(RAW, 'office.png'));
const missing = required.filter((f) => !fs.existsSync(f));
if (missing.length) {
  console.error(`\x1b[31m✖ asset pipeline: ${missing.length} raw file(s) missing:\x1b[0m`);
  for (const f of missing) console.error('  - ' + path.relative(ROOT, f));
  console.error('Add them (or run `npm run placeholder-art -- --missing-only`) and re-run `npm run assets`.');
  process.exit(1);
}

// ---------- helpers ----------
async function loadRGBA(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}
function hasRealTransparency({ data, w, h }) {
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) transparent++;
  return transparent > w * h * 0.01;
}
/** Flood-fill the background from the four corners (edge-connected only) with a small tolerance. */
function floodFromCorners(img, tol = 18) {
  const { data, w, h } = img;
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) {
    const i = (y * w + x) * 4;
    const ref = [data[i], data[i + 1], data[i + 2]];
    stack.push([x, y, ref]);
  }
  let cleared = 0;
  while (stack.length) {
    const [x, y, ref] = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const p = y * w + x;
    if (seen[p]) continue;
    const i = p * 4;
    const d = Math.abs(data[i] - ref[0]) + Math.abs(data[i + 1] - ref[1]) + Math.abs(data[i + 2] - ref[2]);
    if (d > tol * 3) continue;
    seen[p] = 1; data[i + 3] = 0; cleared++;
    stack.push([x + 1, y, ref], [x - 1, y, ref], [x, y + 1, ref], [x, y - 1, ref]);
  }
  return cleared;
}
function bbox({ data, w, h }, thr = 8) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] > thr) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) throw new Error('image is fully transparent');
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}
const toSharp = ({ data, w, h }) => sharp(data, { raw: { width: w, height: h, channels: 4 } });
const hash = (buf) => crypto.createHash('md5').update(buf).digest('hex').slice(0, 8);
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [hh * 60, s, l];
}
function hslToHex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
/** Most common strongly-coloured pixel (ignores transparent, near-black, near-white, grey). */
function accentOf({ data }) {
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const [, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    if (l < 0.15 || l > 0.9 || s < 0.35) continue;
    const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
    const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    b.n++; b.r += data[i]; b.g += data[i + 1]; b.b += data[i + 2];
    buckets.set(key, b);
  }
  let best = null;
  for (const b of buckets.values()) if (!best || b.n > best.n) best = b;
  if (!best) return '#9ca3af';
  return hslToHex(...rgbToHsl(best.r / best.n, best.g / best.n, best.b / best.n));
}
function hexHsl(hex) { const n = parseInt(hex.slice(1), 16); return rgbToHsl(n >> 16, (n >> 8) & 255, n & 255); }
function nudgeApart(colours) {
  const out = [];
  for (const c of colours) {
    let [h, s, l] = hexHsl(c);
    s = Math.max(s, 0.45); l = Math.min(Math.max(l, 0.45), 0.7);
    for (let tries = 0; tries < 24 && out.some((o) => { const d = Math.abs(hexHsl(o)[0] - h); return Math.min(d, 360 - d) < 20; }); tries++) h = (h + 23) % 360;
    out.push(hslToHex(h, s, l));
  }
  return out;
}

// ---------- 2. characters ----------
// Remove only folders of members no longer on the card (keep the directory itself: a running Vite dev server watches it).
fs.mkdirSync(path.join(OUT, 'characters'), { recursive: true });
for (const d of fs.readdirSync(path.join(OUT, 'characters'))) if (!card.team.some((m) => m.name === d)) fs.rmSync(path.join(OUT, 'characters', d), { recursive: true, force: true });
const report = [];
const SPRITES = {};
const frontImgs = [];
for (const m of card.team) {
  const dir = path.join(OUT, 'characters', m.name);
  fs.mkdirSync(dir, { recursive: true });
  const trimmed = {};
  for (const pose of POSES) {
    const img = await loadRGBA(path.join(RAW, m.name, `${pose}.png`));
    let note = 'alpha';
    if (!hasRealTransparency(img)) note = `flood-filled ${floodFromCorners(img)} px`;
    const bb = bbox(img);
    const buf = await toSharp(img).extract(bb).png().toBuffer();
    trimmed[pose] = { buf, ...bb, note };
    if (pose === 'front') frontImgs.push(await loadRGBA(buf));
  }
  // ONE scale per character, from its tallest pose (also guarantees the widest fits)
  const maxH = Math.max(...POSES.map((p) => trimmed[p].height));
  const maxW = Math.max(...POSES.map((p) => trimmed[p].width));
  const files = {};
  for (const size of SIZES) {
    const pad = Math.max(1, Math.round(size * 0.03));
    const scale = Math.min((size - pad * 2) / maxH, (size - pad * 2) / maxW);
    for (const pose of POSES) {
      const t = trimmed[pose];
      const w = Math.max(1, Math.round(t.width * scale)), h = Math.max(1, Math.round(t.height * scale));
      const resized = await sharp(t.buf).resize(w, h, { kernel: KERNEL, fit: 'fill' }).png().toBuffer();
      const out = path.join(dir, `${pose}_${size}.png`);
      await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: resized, left: Math.round((size - w) / 2), top: size - pad - h }]) // bottom-aligned shared baseline
        .png().toFile(out);
      files[`${pose}_${size}`] = out;
      report.push(`${path.relative(ROOT, out)}  ${size}×${size}  (content ${w}×${h}, scale ${scale.toFixed(4)}, ${t.note})`);
    }
  }
  // portraits: trim, pad square, resize
  const pimg = await loadRGBA(path.join(RAW, m.name, 'portrait.png'));
  if (!hasRealTransparency(pimg)) floodFromCorners(pimg);
  const pbb = bbox(pimg);
  const side = Math.max(pbb.width, pbb.height);
  const ptrim = await toSharp(pimg).extract(pbb).png().toBuffer();
  const psq = await sharp({ create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: ptrim, left: Math.round((side - pbb.width) / 2), top: Math.round((side - pbb.height) / 2) }]).png().toBuffer();
  for (const s of [512, 128]) {
    const out = path.join(dir, `portrait_${s}.png`);
    await sharp(psq).resize(s, s, { kernel: KERNEL }).png().toFile(out);
    files[`portrait_${s}`] = out;
    report.push(`${path.relative(ROOT, out)}  ${s}×${s}`);
  }
  const v = (f) => `/assets/characters/${m.name}/${path.basename(f)}?v=${hash(fs.readFileSync(f))}`;
  SPRITES[m.name] = {
    front: v(files.front_256), side: v(files.side_256), back: v(files.back_256),
    front48: v(files.front_48), side48: v(files.side_48), back48: v(files.back_48),
    portrait: v(files.portrait_128), portraitLarge: v(files.portrait_512), colour: '',
  };
}
const colours = nudgeApart(frontImgs.map(accentOf));
card.team.forEach((m, i) => { SPRITES[m.name].colour = colours[i]; });

// ---------- 3. office map ----------
fs.mkdirSync(path.join(OUT, 'office'), { recursive: true });
const officeOut = path.join(OUT, 'office', 'office_full_map.png');
const om = await sharp(path.join(RAW, 'office.png')).metadata();
const aspect = om.width / om.height;
if (Math.abs(aspect - MAP_W / MAP_H) > 0.01) console.warn(`⚠ raw/office.png is ${om.width}×${om.height} (aspect ${aspect.toFixed(3)}), expected 4:3 — it will be stretched`);
await sharp(path.join(RAW, 'office.png')).resize(MAP_W, MAP_H, { fit: 'fill', kernel: KERNEL }).png().toFile(officeOut);
const omd = await sharp(officeOut).metadata();
if (omd.width !== MAP_W || omd.height !== MAP_H) throw new Error('office map has wrong size');
report.push(`${path.relative(ROOT, officeOut)}  ${omd.width}×${omd.height}`);
const OFFICE_MAP = `/assets/office/office_full_map.png?v=${hash(fs.readFileSync(officeOut))}`;

// icon (favicon + launcher)
const iconSrc = fs.existsSync(path.join(RAW, 'icon.png')) ? path.join(RAW, 'icon.png') : path.join(RAW, card.team[0].name, 'portrait.png');
await sharp(iconSrc).resize(128, 128).png().toFile(path.join(OUT, 'icon.png'));
report.push(`web/public/assets/icon.png  128×128`);

// ---------- 4. office coordinates → WORK_HOME (fails naming the room if too few seats) ----------
const coordsFile = path.join(SRC, 'office-coordinates.json');
let WORK_HOME = null;
if (fs.existsSync(coordsFile)) {
  const coords = JSON.parse(fs.readFileSync(coordsFile, 'utf8'));
  WORK_HOME = computeWorkHome(card.team, coords);
}
export function computeWorkHome(team, coords) {
  const byRoom = {};
  for (const s of coords.seats) (byRoom[s.room] ||= []).push(s);
  const home = {};
  const used = {};
  for (const m of team) { // team order: lead first → lead gets the first command seat
    const seats = byRoom[m.worksIn] || [];
    const i = used[m.worksIn] || 0;
    if (i >= seats.length) {
      const need = team.filter((t) => t.worksIn === m.worksIn).length;
      console.error(`\x1b[31m✖ room "${m.worksIn}" has ${seats.length} seat(s) but ${need} member(s) work there — add seats in the picker (npm run dev → /picker.html)\x1b[0m`);
      process.exit(1);
    }
    home[m.name] = { room: m.worksIn, seat: seats[i].id, x: seats[i].x, y: seats[i].y };
    used[m.worksIn] = i + 1;
  }
  return home;
}

// ---------- 5. officeAssets.ts ----------
const ts = `// GENERATED by scripts/build-assets.mjs from mission.card.md + raw/ art + office-coordinates.json. Do not edit.
import coords from './office-coordinates.json';

export const OFFICE_MAP = ${JSON.stringify(OFFICE_MAP)};
export const MAP_W = ${MAP_W};
export const MAP_H = ${MAP_H};
export const PIXEL_ART = ${card.pixelArt};

export type Sprite = { front: string; side: string; back: string; front48: string; side48: string; back48: string; portrait: string; portraitLarge: string; colour: string };
export const SPRITES: Record<string, Sprite> = ${JSON.stringify(SPRITES, null, 2)};

export type Rect = { x: number; y: number; w: number; h: number };
export type Seat = { id: string; room: string; x: number; y: number };
export type Pt = { x: number; y: number };
type Coords = {
  rooms: Record<string, Rect>;
  seats: Seat[];
  doors: { id: string; room: string; x: number; y: number }[];
  nodes: { id: string; x: number; y: number }[];
  edges: [string, string][];
};
const C = coords as unknown as Coords;

/** Room rectangles in % of the map. */
export const ROOM_REGIONS: Record<string, Rect> = C.rooms;
/** Seats per room (feet position, % of map). */
export const ROOM_SEATS: Record<string, Seat[]> = {};
for (const s of C.seats) (ROOM_SEATS[s.room] ||= []).push(s);
/** Door points per room. */
export const ROOM_DOORS: Record<string, { id: string; room: string; x: number; y: number }[]> = {};
for (const d of C.doors) (ROOM_DOORS[d.room] ||= []).push(d);
/** All walk-graph points (doors + corridor nodes) by id. */
export const NODES: Record<string, Pt> = {};
for (const d of C.doors) NODES[d.id] = { x: d.x, y: d.y };
for (const n of C.nodes) NODES[n.id] = { x: n.x, y: n.y };
export const EDGES: [string, string][] = C.edges;
/** The graph node a room's occupants path from/to (its first door). */
export const ROOM_NODE: Record<string, string> = {};
for (const d of C.doors) if (!ROOM_NODE[d.room]) ROOM_NODE[d.room] = d.id;
/** Each member's unique desk seat in their worksIn room (lead = first command seat). */
export const WORK_HOME: Record<string, { room: string; seat: string; x: number; y: number }> = ${JSON.stringify(WORK_HOME || {}, null, 2)};
`;
const tsFile = path.join(SRC, 'officeAssets.ts');
if (!fs.existsSync(tsFile) || fs.readFileSync(tsFile, 'utf8') !== ts) fs.writeFileSync(tsFile, ts, 'utf8'); // unchanged → no needless dev-server reload

console.log(report.join('\n'));
console.log('\ncolours: ' + card.team.map((m) => `${m.name}=${SPRITES[m.name].colour}`).join('  '));
if (!WORK_HOME) console.log('⚠ web/src/office-coordinates.json not found — WORK_HOME empty (create it with the picker)');
console.log('✓ assets built → web/public/assets/, web/src/officeAssets.ts');
