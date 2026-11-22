// Every route between every pair of seats must stay on walkable floor (rooms, corridors, doorways) —
// i.e. legs never cut through walls. Uses the real planRoute() from the web app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRoute, facing } from '../web/src/hooks/useWalkers.ts';
import { ROOM_SEATS } from '../web/src/officeAssets.ts';
import * as L from '../scripts/office-layout.mjs';

// floor = rooms ∪ corridors; walls = room edges minus doorway spans (12 px thick, so 6 px either side + 1 px margin)
const floor: number[][] = [...Object.values(L.ROOMS), ...L.CORRIDORS] as number[][];
type Seg = { x0: number; y0: number; x1: number; y1: number };
const walls: Seg[] = [];
const cut = (a: number, b: number, gaps: number[][]) => { // split [a,b] by gap spans
  const out: number[][] = []; let cur = a;
  for (const [g0, g1] of gaps.sort((p, q) => p[0] - q[0])) { if (g1 <= a || g0 >= b) continue; if (g0 > cur) out.push([cur, g0]); cur = Math.max(cur, g1); }
  if (cur < b) out.push([cur, b]); return out;
};
for (const [room, [x0, y0, x1, y1]] of Object.entries(L.ROOMS) as [string, number[]][]) {
  const gaps = (side: string) => L.DOORS.filter((d) => d.room === room && d.side === side).map((d) => d.span as number[]);
  // a doorway in a shared wall is also a gap for the neighbouring room's wall on that line
  const shared = (side: string) => L.DOORS.filter((d) => d.room !== room).filter((d) => {
    const R = L.ROOMS[d.room as keyof typeof L.ROOMS] as number[];
    const line = d.side === 'top' ? R[1] : d.side === 'bottom' ? R[3] : d.side === 'left' ? R[0] : R[2];
    const horiz = d.side === 'top' || d.side === 'bottom';
    return (side === 'top' || side === 'bottom') === horiz && line === (side === 'top' ? y0 : side === 'bottom' ? y1 : side === 'left' ? x0 : x1);
  }).map((d) => d.span as number[]);
  for (const [a, b] of cut(x0, x1, [...gaps('top'), ...shared('top')])) walls.push({ x0: a, y0, x1: b, y1: y0 });
  for (const [a, b] of cut(x0, x1, [...gaps('bottom'), ...shared('bottom')])) walls.push({ x0: a, y0: y1, x1: b, y1 });
  for (const [a, b] of cut(y0, y1, [...gaps('left'), ...shared('left')])) walls.push({ x0, y0: a, x1: x0, y1: b });
  for (const [a, b] of cut(y0, y1, [...gaps('right'), ...shared('right')])) walls.push({ x0: x1, y0: a, x1, y1: b });
}
const nearWall = (x: number, y: number) => walls.some((w) => {
  const cx = Math.max(w.x0, Math.min(x, w.x1)), cy = Math.max(w.y0, Math.min(y, w.y1));
  const hit = Math.hypot(x - cx, y - cy) < 7; if (hit && process.env.DBG) console.log("wall", JSON.stringify(w)); return hit;
});
const walkable = (x: number, y: number) => floor.some(([a, b, c, d]) => x >= a && x <= c && y >= b && y <= d) && !nearWall(x, y);

test('no leg between any two seats crosses a wall', () => {
  const seats = Object.values(ROOM_SEATS).flat();
  let legs = 0, samples = 0;
  for (const from of seats) for (const to of seats) {
    if (from.id === to.id) continue;
    const pts = [{ x: from.x, y: from.y }, ...planRoute({ room: from.room, x: from.x, y: from.y }, to)];
    for (let i = 1; i < pts.length; i++) {
      legs++;
      const a = pts[i - 1], b = pts[i];
      const ax = (a.x / 100) * L.W, ay = (a.y / 100) * L.H, bx = (b.x / 100) * L.W, by = (b.y / 100) * L.H;
      const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) / 3));
      for (let k = 0; k <= n; k++) {
        const x = ax + ((bx - ax) * k) / n, y = ay + ((by - ay) * k) / n;
        samples++;
        assert.ok(walkable(x, y), `${from.id} → ${to.id}: leg ${i} hits a wall at (${x.toFixed(0)}, ${y.toFixed(0)})`);
      }
    }
  }
  console.log(`checked ${seats.length * (seats.length - 1)} routes, ${legs} legs, ${samples} sample points — all on walkable floor`);
});

test('facing: side mirrored when moving right, back when up, front when down', () => {
  assert.deepEqual(facing({ x: 10, y: 50 }, { x: 40, y: 52 }), { pose: 'side', flip: true });
  assert.deepEqual(facing({ x: 40, y: 50 }, { x: 10, y: 52 }), { pose: 'side', flip: false });
  assert.deepEqual(facing({ x: 40, y: 80 }, { x: 41, y: 20 }), { pose: 'back', flip: false });
  assert.deepEqual(facing({ x: 40, y: 20 }, { x: 41, y: 80 }), { pose: 'front', flip: false });
});

test('negative control: a straight line workspace → approval office DOES hit a wall', () => {
  const a = ROOM_SEATS.workspace[3], b = ROOM_SEATS.approval[0];
  let hit = false;
  for (let k = 0; k <= 200; k++) { const x = ((a.x + (b.x - a.x) * k / 200) / 100) * L.W, y = ((a.y + (b.y - a.y) * k / 200) / 100) * L.H; if (!walkable(x, y)) hit = true; }
  assert.ok(hit);
});
