// Board-driven placement: decides, for every card member, which room/seat they belong in RIGHT NOW
// and why — purely from real state (.satoru) — plus badges, bubbles and dimming.
import type { Member } from '../card';
import type { Project } from '../types';
import { ROOM_SEATS, WORK_HOME, type Seat } from '../officeAssets';

export type Reason = 'directive' | 'approval' | 'plan-briefing' | 'working' | 'review' | 'blocked' | 'closing' | 'lead-desk' | 'resting' | 'no-project';
export type Placement = {
  name: string; room: string; seat: Seat; reason: Reason; why: string;
  badge: null | 'amber' | 'red'; bubble: string | null; resting: boolean; dim: boolean; ageTag: string | null;
};

export const DIRECTIVE_MAX_MS = 2 * 3600_000;
export const STALE_WORK_MS = 15 * 60_000;
export const SETTLE_AFTER_MS = 5 * 60_000;
const BREAK_ROOMS = ['lounge', 'pantry'];

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export const ageText = (ms: number) => ms < 60_000 ? `${Math.max(0, Math.round(ms / 1000))}s` : ms < 3600_000 ? `${Math.round(ms / 60_000)}m` : ms < 86400_000 ? `${Math.round(ms / 3600_000)}h` : `${Math.round(ms / 86400_000)}d`;

export function computePlacements(team: Member[], project: Project | null, now: number, opts: { closing?: Set<string>; rooms: string[] } ): Placement[] {
  const lead = team[0].name;
  const taken = new Set<string>(Object.values(WORK_HOME).map((h) => h.seat)); // desks stay reserved for their owners
  const out: Placement[] = [];
  const homeSeat = (name: string): Seat => { const h = WORK_HOME[name]; return { id: h.seat, room: h.room, x: h.x, y: h.y }; };
  const freeSeat = (room: string, name: string): Seat | null => {
    const list = ROOM_SEATS[room] || [];
    const own = WORK_HOME[name];
    if (own && own.room === room) return homeSeat(name);
    for (const s of list) if (!taken.has(s.id)) { taken.add(s.id); return s; }
    return null;
  };

  const agents = project?.agents ?? {};
  const tasks = project?.tasks ?? [];
  const pendingApprovals = (project?.approvals ?? []).filter((a) => a.status === 'pending');
  const planWaiting = project?.plan?.status === 'awaiting-approval' ? project.plan : null;

  type Decision = Omit<Placement, 'seat' | 'dim' | 'ageTag'> & { seat?: Seat };
  const decide = (m: Member): Decision => {
    const a = agents[m.name];
    const base = { name: m.name, badge: null as Placement['badge'], bubble: null as string | null, resting: false };
    if (!project) return m.name === lead
      ? { ...base, room: WORK_HOME[lead].room, reason: 'lead-desk', why: 'lead rests at own desk (no project loaded)' }
      : { ...base, room: '', reason: 'no-project', why: 'no project loaded', resting: true };
    if (opts.closing?.has(m.name)) return { ...base, room: WORK_HOME[m.name].room, reason: 'closing', why: 'just finished — closing line at desk', bubble: a?.say || null };
    const da = Date.parse(a?.directiveAt || '');
    if (a?.intendedRoom && opts.rooms.includes(a.intendedRoom) && Number.isFinite(da) && now - da < DIRECTIVE_MAX_MS)
      return { ...base, room: a.intendedRoom, reason: 'directive', why: `🎬 directive → ${a.intendedRoom}`, bubble: a.voice || null };
    if (m.name === lead && pendingApprovals.length)
      return { ...base, room: 'approval', reason: 'approval', why: `${pendingApprovals.length} pending approval(s)`, badge: 'amber' };
    if (planWaiting && planWaiting.tasks.some((t) => t.owner === m.name))
      return { ...base, room: 'briefing', reason: 'plan-briefing', why: `plan "${planWaiting.title}" awaiting approval` };
    const mine = tasks.filter((t) => t.owner === m.name);
    const inProg = mine.find((t) => t.status === 'in_progress');
    if (inProg || a?.state === 'working')
      return { ...base, room: WORK_HOME[m.name].room, reason: 'working', why: inProg ? `task ${inProg.id} in progress` : 'live spawn (working)' };
    const review = mine.find((t) => t.status === 'review');
    if (review) return { ...base, room: 'meeting', reason: 'review', why: `task ${review.id} in review` };
    const blocked = mine.find((t) => t.status === 'blocked');
    if (blocked || a?.state === 'blocked') return { ...base, room: 'meeting', reason: 'blocked', why: blocked ? `task ${blocked.id} blocked` : 'agent blocked', badge: 'red' };
    if (m.name === lead) return { ...base, room: WORK_HOME[lead].room, reason: 'lead-desk', why: 'lead rests at own desk' };
    return { ...base, room: '', reason: 'resting', why: a?.state === 'completed' ? 'completed — on a break' : 'idle — on a break', resting: true };
  };

  const decisions = team.map(decide);
  // fixed rooms first (card order), then break seats
  for (const d of decisions.filter((x) => !x.resting)) {
    const seat = freeSeat(d.room, d.name) || homeSeat(d.name);
    const a = agents[d.name];
    const hb = Date.parse(a?.heartbeat || a?.since || '');
    const stale = d.reason === 'working' && Number.isFinite(hb) && now - hb > STALE_WORK_MS;
    out.push({ ...d, seat, dim: stale, ageTag: stale ? ageText(now - hb) : null });
  }
  const pool = BREAK_ROOMS.flatMap((r) => ROOM_SEATS[r] || []).filter((s) => !taken.has(s.id));
  const used = new Set<string>();
  for (const d of decisions.filter((x) => x.resting)) {
    const epoch = Math.floor((now + (hash(d.name) % 60_000)) / 90_000); // gentle wandering: a new break spot every ~90 s
    let i = hash(d.name + ':' + epoch) % Math.max(1, pool.length);
    for (let k = 0; k < pool.length && used.has(pool[i].id); k++) i = (i + 1) % pool.length;
    const seat = pool[i] || homeSeat(d.name);
    used.add(seat.id);
    out.push({ ...d, room: seat.room, seat, dim: false, ageTag: null, bubble: d.bubble });
  }
  return team.map((m) => out.find((p) => p.name === m.name)!);
}
