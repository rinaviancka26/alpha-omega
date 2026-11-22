#!/usr/bin/env node
// Writes web/src/office-coordinates.json for the PLACEHOLDER map (percentages, 1 decimal).
// For real art, use the picker instead (npm run dev → http://localhost:4316/picker.html) and export.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from './office-layout.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r1 = (v) => Math.round(v * 10) / 10;
const px = (x) => r1((x / L.W) * 100), py = (y) => r1((y / L.H) * 100);
const rooms = {};
for (const [k, [x0, y0, x1, y1]] of Object.entries(L.ROOMS)) rooms[k] = { x: px(x0), y: py(y0), w: r1(px(x1) - px(x0)), h: r1(py(y1) - py(y0)) };
const seats = [];
for (const [room, list] of Object.entries(L.SEATS)) list.forEach(([x, y], i) => seats.push({ id: `${room}_${i + 1}`, room, x: px(x), y: py(y) }));
const doors = Object.entries(L.DOOR_POINTS).map(([room, [x, y]]) => ({ id: `d_${room}`, room, x: px(x), y: py(y) }));
const nodes = Object.entries(L.NODES).map(([id, [x, y]]) => ({ id, x: px(x), y: py(y) }));
const out = { rooms, seats, doors, nodes, edges: L.EDGES };
const file = path.join(ROOT, 'web/src/office-coordinates.json');
fs.writeFileSync(file + '.tmp', JSON.stringify(out, null, 2) + '\n', 'utf8');
fs.renameSync(file + '.tmp', file);
console.log(`wrote ${path.relative(ROOT, file)}: ${Object.keys(rooms).length} rooms, ${seats.length} seats, ${doors.length} doors, ${nodes.length} nodes, ${L.EDGES.length} edges`);
