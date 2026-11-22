import { CARD } from '../card';
import type { SatoruEvent } from '../types';

const room = (k: unknown) => (typeof k === 'string' && CARD.rooms[k]) || String(k);
const s = (v: unknown, n = 70) => { const t = String(v ?? '').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

/** One short human sentence for a real event. */
export function sentence(e: SatoruEvent): string {
  const who = e.agent || (typeof e.payload.offCard === 'string' ? `${e.payload.offCard} (off-card)` : 'someone');
  const p = e.payload || {};
  switch (e.type) {
    case 'session_start': return `Claude session started — lights on`;
    case 'session_end': return `Claude session ended — lights off`;
    case 'prompt': return `You asked ${who}: “${s(p.text, 60)}”`;
    case 'idle': return `${who} finished a turn${p.approvals ? ' and needs an approval' : ''}`;
    case 'spawn': return `${who} picked up: ${s(p.task, 60) || 'a task'}`;
    case 'done': return p.phantom ? `A subagent stopped (unknown, ignored)` : `${who} finished${p.say ? `: “${s(p.say, 60)}”` : ''}`;
    case 'file_touch': return `${who} edited ${s(p.file, 50)}`;
    case 'command': return `${who} ran ${s(p.command, 50)}`;
    case 'stage': return p.room === 'done' ? `${who} is released` : `${who} → ${room(p.room)}${p.voice ? `: “${s(p.voice, 50)}”` : ''}`;
    case 'note': return s(p.text, 90);
    default: return `${who}: ${e.type}`;
  }
}
export const timeAgo = (iso: string | undefined, now: number) => {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const d = Math.max(0, now - t);
  return d < 60_000 ? 'just now' : d < 3600_000 ? `${Math.floor(d / 60_000)}m ago` : d < 86400_000 ? `${Math.floor(d / 3600_000)}h ago` : `${Math.floor(d / 86400_000)}d ago`;
};
