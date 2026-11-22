// Moves characters seat → own door → BFS over the door/corridor graph → target door → target seat.
import { useEffect, useRef, useState } from 'react';
import { NODES, EDGES, ROOM_NODE, MAP_W, MAP_H, type Seat } from '../officeAssets';
import { bfs } from '../lib/graph';

export type Pose = 'front' | 'side' | 'back';
export type WalkerView = { x: number; y: number; pose: Pose; flip: boolean; moving: boolean; dur: number; room: string; seatId: string };
type Pt = { x: number; y: number; id?: string };
type Internal = WalkerView & { queue: Pt[]; timer?: ReturnType<typeof setTimeout>; target?: Seat; pendingTarget?: Seat; atNode?: string };

export const legDuration = (a: Pt, b: Pt) => {
  const d = Math.hypot(b.x - a.x, (b.y - a.y) * (MAP_H / MAP_W)); // % of map width, aspect-corrected
  return Math.round(Math.min(1300, Math.max(220, d * 32)));
};
export function facing(a: Pt, b: Pt): { pose: Pose; flip: boolean } {
  const dx = (b.x - a.x) * MAP_W, dy = (b.y - a.y) * MAP_H;
  if (Math.abs(dx) >= Math.abs(dy)) return { pose: 'side', flip: dx > 0 }; // side art faces LEFT → mirror when moving right
  return dy < 0 ? { pose: 'back', flip: false } : { pose: 'front', flip: false };
}
/** Waypoints from the walker's current spot to a target seat (exported for tests). */
export function planRoute(from: { room: string; atNode?: string; x: number; y: number }, to: Seat): Pt[] {
  if (!from.atNode && from.room === to.room) return [{ x: to.x, y: to.y }];
  const start = from.atNode || ROOM_NODE[from.room];
  const goal = ROOM_NODE[to.room];
  const ids = (start && goal && bfs(EDGES, start, goal)) || [goal].filter(Boolean);
  const pts: Pt[] = ids.map((id) => ({ ...NODES[id], id }));
  if (from.atNode && pts.length && pts[0].id === from.atNode) pts.shift();
  return [...pts, { x: to.x, y: to.y }];
}

export function useWalkers(targets: Record<string, Seat>) {
  const ref = useRef<Record<string, Internal>>({});
  const [, setTick] = useState(0);
  const render = () => setTick((t) => t + 1);

  useEffect(() => {
    const W = ref.current;
    const step = (name: string) => {
      const w = W[name];
      if (!w) return;
      if (w.pendingTarget) { // re-plan from where we are (a node or a seat)
        const t = w.pendingTarget; w.pendingTarget = undefined; w.target = t;
        w.queue = planRoute(w, t);
      }
      const next = w.queue.shift();
      if (!next) { Object.assign(w, { moving: false, pose: 'front', flip: false, dur: 0 }); render(); return; }
      const f = facing(w, next);
      const dur = legDuration(w, next);
      Object.assign(w, { x: next.x, y: next.y, pose: f.pose, flip: f.flip, moving: true, dur, atNode: next.id });
      if (!next.id && w.target) { w.room = w.target.room; w.seatId = w.target.id; w.atNode = undefined; }
      render();
      w.timer = setTimeout(() => step(name), dur);
    };
    for (const [name, seat] of Object.entries(targets)) {
      const w = W[name];
      if (!w) { // first sighting: settle straight in place, no walk
        W[name] = { x: seat.x, y: seat.y, pose: 'front', flip: false, moving: false, dur: 0, room: seat.room, seatId: seat.id, queue: [], target: seat };
        continue;
      }
      if (w.target?.id === seat.id && !w.pendingTarget) continue;
      if (w.moving) { w.pendingTarget = seat; continue; } // finish the current leg first
      w.pendingTarget = seat;
      step(name);
    }
    render();
  }, [JSON.stringify(Object.fromEntries(Object.entries(targets).map(([k, v]) => [k, v.id])))]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { for (const w of Object.values(ref.current)) clearTimeout(w.timer); }, []);
  return ref.current as Record<string, WalkerView>;
}
