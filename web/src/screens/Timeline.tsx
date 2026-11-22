import { useEffect, useRef, useState } from 'react';
import { CARD } from '../card';
import { api } from '../lib/api';
import { sentence } from '../lib/sentences';
import type { AppState, SatoruEvent } from '../types';

type Entry = SatoruEvent & { cursor: string; day: string };
const TYPES = ['session_start', 'session_end', 'prompt', 'idle', 'spawn', 'done', 'file_touch', 'command', 'stage', 'note'];
const localDay = (iso: string) => { const d = new Date(Date.parse(iso)); return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' }); };

export default function Timeline({ state, eventsRev }: { state: AppState | null; eventsRev: number }) {
  const [f, setF] = useState({ project: '', agent: '', type: '' });
  const [items, setItems] = useState<Entry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const qs = (c?: string | null) => new URLSearchParams({ limit: '50', ...(c ? { cursor: c } : {}), ...(f.project && { project: f.project }), ...(f.agent && { agent: f.agent }), ...(f.type && { type: f.type }) }).toString();
  const fRef = useRef(f); fRef.current = f;

  useEffect(() => { // filters changed → first page
    setLoading(true);
    api<{ events: Entry[]; nextCursor: string | null }>(`/api/timeline?${qs()}`).then((r) => { setItems(r.events); setCursor(r.nextCursor); }).finally(() => setLoading(false));
  }, [f.project, f.agent, f.type]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // live: new events arrive → merge the newest page on top
    if (!eventsRev) return;
    api<{ events: Entry[] }>(`/api/timeline?${qs()}`).then((r) => setItems((cur) => { const have = new Set(cur.map((e) => e.cursor)); const fresh = r.events.filter((e) => !have.has(e.cursor)); return fresh.length ? [...fresh, ...cur] : cur; }));
  }, [eventsRev]); // eslint-disable-line react-hooks/exhaustive-deps
  const older = async () => {
    if (!cursor) return;
    setLoading(true);
    const r = await api<{ events: Entry[]; nextCursor: string | null }>(`/api/timeline?${qs(cursor)}`).finally(() => setLoading(false));
    setItems((cur) => { const have = new Set(cur.map((e) => e.cursor)); return [...cur, ...r.events.filter((e) => !have.has(e.cursor))]; });
    setCursor(r.nextCursor);
  };
  const groups: { day: string; list: Entry[] }[] = [];
  for (const e of items) { const d = localDay(e.ts); if (!groups.length || groups[groups.length - 1].day !== d) groups.push({ day: d, list: [] }); groups[groups.length - 1].list.push(e); }
  const sel = 'bg-panel2 rounded px-2 py-1 text-sm';
  return (
    <div className="max-w-4xl" data-testid="timeline">
      <div className="flex gap-2 mb-3 flex-wrap">
        <select data-testid="f-project" className={sel} value={f.project} onChange={(e) => setF({ ...f, project: e.target.value })}>
          <option value="">all projects</option>{state?.registry.projects.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}<option value="unattributed">unattributed</option>
        </select>
        <select data-testid="f-agent" className={sel} value={f.agent} onChange={(e) => setF({ ...f, agent: e.target.value })}>
          <option value="">all members</option>{CARD.team.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}<option value="unattributed">unattributed</option>
        </select>
        <select data-testid="f-type" className={sel} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          <option value="">all types</option>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="text-xs text-gray-500 self-center">{items.length} shown · last 14 days</span>
      </div>
      {groups.map((g) => (
        <section key={g.day} className="mb-4" data-day={g.day}>
          <h3 className="sticky top-0 bg-ink/95 py-1 text-xs uppercase tracking-wider text-accent">{g.day}</h3>
          <ul className="border-l border-line ml-1">
            {g.list.map((e) => (
              <li key={e.cursor} data-cursor={e.cursor} className="pl-3 py-1 text-sm flex gap-3">
                <span className="text-xs text-gray-500 w-20 shrink-0 tabular-nums">{new Date(Date.parse(e.ts)).toLocaleTimeString()}</span>
                <span className="text-[10px] uppercase text-gray-500 w-20 shrink-0">{e.type}</span>
                <span className={e.project ? '' : 'text-gray-500'}>{sentence(e)}{!e.project && <span className="ml-1 text-[10px] text-gray-600">(unattributed)</span>}</span>
              </li>))}
          </ul>
        </section>))}
      {!items.length && !loading && <div className="text-gray-500">No events.</div>}
      {cursor && <button data-testid="load-older" disabled={loading} onClick={older} className="px-3 py-1.5 rounded bg-panel2 hover:bg-line text-sm">Load older</button>}
    </div>
  );
}
