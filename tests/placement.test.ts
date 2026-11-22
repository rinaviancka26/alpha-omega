import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePlacements } from '../web/src/lib/placement.ts';
import { WORK_HOME } from '../web/src/officeAssets.ts';
import cardJson from '../web/src/card.generated.json' with { type: 'json' };

const team = cardJson.team as any[];
const [L, A, B, C, D, E, F, G] = team.map((m) => m.name);
const rooms = Object.keys(cardJson.rooms);
const now = Date.parse('2026-11-22T12:00:00Z');
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
const base = (over: any = {}) => ({ slug: 'p', agents: {}, tasks: [], plan: null, approvals: [], mission: null, ...over });
const at = (ps: any[], n: string) => ps.find((p) => p.name === n);

test('precedence: directive > approval > plan briefing > working > review > blocked > rest', () => {
  const ps = computePlacements(team, base({
    agents: { [A]: { state: 'working', intendedRoom: 'meeting', voice: 'sync', directiveAt: iso(60_000), heartbeat: iso(0) } },
    approvals: [{ id: 'A-1', title: 't', risk: 'low', reason: 'r', status: 'pending', created: iso(0) }],
    plan: { status: 'awaiting-approval', title: 'P', scope: '', risks: [], tasks: [{ id: 'T1', title: 'x', owner: B, files: [] }] },
    tasks: [
      { id: 'T1', title: 'x', owner: B, status: 'in_progress' },
      { id: 'T2', title: 'y', owner: C, status: 'in_progress' },
      { id: 'T3', title: 'z', owner: D, status: 'review' },
      { id: 'T4', title: 'w', owner: E, status: 'blocked' },
    ],
  }) as any, now, { rooms });
  assert.equal(at(ps, A).room, 'meeting'); assert.equal(at(ps, A).reason, 'directive'); assert.equal(at(ps, A).bubble, 'sync');
  assert.equal(at(ps, L).room, 'approval'); assert.equal(at(ps, L).badge, 'amber');
  assert.equal(at(ps, B).room, 'briefing');
  assert.equal(at(ps, C).room, WORK_HOME[C].room); assert.equal(at(ps, C).seat.id, WORK_HOME[C].seat);
  assert.equal(at(ps, D).room, 'meeting'); assert.equal(at(ps, D).reason, 'review');
  assert.equal(at(ps, E).room, 'meeting'); assert.equal(at(ps, E).badge, 'red');
  assert.ok(['lounge', 'pantry'].includes(at(ps, F).room));
  const ids = ps.map((p) => p.seat.id); assert.equal(new Set(ids).size, ids.length, 'no seat sharing');
});

test('expired directive (>2 h) ignored; lead never in a break room; stale working dimmed with age tag; completed never dimmed', () => {
  const ps = computePlacements(team, base({ agents: {
    [A]: { state: 'idle', intendedRoom: 'meeting', directiveAt: iso(3 * 3600_000) },
    [B]: { state: 'working', heartbeat: iso(40 * 60_000) },
    [C]: { state: 'completed', heartbeat: iso(5 * 3600_000), since: iso(5 * 3600_000) },
    [L]: { state: 'idle' },
  } }) as any, now, { rooms });
  assert.notEqual(at(ps, A).room, 'meeting');
  assert.equal(at(ps, L).room, WORK_HOME[L].room); assert.equal(at(ps, L).reason, 'lead-desk');
  assert.equal(at(ps, B).dim, true); assert.equal(at(ps, B).ageTag, '40m');
  assert.equal(at(ps, C).dim, false); assert.ok(['lounge', 'pantry'].includes(at(ps, C).room));
});

test('no project → nobody works', () => {
  const ps = computePlacements(team, null, now, { rooms });
  for (const p of ps) assert.ok(p.reason === 'no-project' || p.reason === 'lead-desk');
});
