import { useEffect, useMemo, useRef, useState } from 'react';
import { CARD, LEAD, type Member } from '../card';
import { OFFICE_MAP, MAP_W, MAP_H, PIXEL_ART, SPRITES, ROOM_REGIONS, WORK_HOME } from '../officeAssets';
import { useFitBox } from '../hooks/useFitBox';
import { useWalkers } from '../hooks/useWalkers';
import { useDemo } from '../hooks/useDemo';
import { computePlacements, SETTLE_AFTER_MS, type Placement } from '../lib/placement';
import { sentence, timeAgo } from '../lib/sentences';
import Modal from '../components/Modal';
import type { AppState, SatoruEvent, Project } from '../types';

const ROOM_KEYS = Object.keys(CARD.rooms);
const SEEN_KEY = 'alpha-omega.seen-completions';
const loadSeen = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { return new Set(); } };
const saveSeen = (s: Set<string>) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-300))); } catch { /* private mode */ } };
const STATE_DOT: Record<string, string> = { working: 'bg-green-400', completed: 'bg-sky-400', idle: 'bg-gray-500', briefing: 'bg-violet-400', meeting: 'bg-violet-400', approval: 'bg-amber-400', blocked: 'bg-red-500' };

function useNow(ms = 5000) { const [n, setN] = useState(Date.now()); useEffect(() => { const id = setInterval(() => setN(Date.now()), ms); return () => clearInterval(id); }, [ms]); return n; }

export default function Office({ state, events }: { state: AppState | null; events: SatoruEvent[] }) {
  const [demo, setDemo] = useState(false);
  const demoProject = useDemo(demo);
  const project: Project | null = demo ? demoProject : state?.project ?? null;
  const now = useNow(5000);
  const lightsOn = demo || !!state?.telemetry.liveSession;
  const [selected, setSelected] = useState<Member | null>(null);

  // closing lines: a fresh completion shows its bubble at the desk for ~2.4 s, then walks to a break room — once (no replay on reload)
  const [closing, setClosing] = useState<Set<string>>(new Set());
  const seen = useRef(loadSeen());
  const walkersRef = useRef<Record<string, { moving: boolean; seatId: string }>>({});
  useEffect(() => {
    if (!project) return;
    const add: string[] = [];
    for (const [name, a] of Object.entries(project.agents)) {
      if (a.state !== 'completed' || !a.since) continue;
      const key = `${project.slug}:${name}:${a.since}`;
      if (seen.current.has(key)) continue;
      seen.current.add(key);
      if (Date.now() - Date.parse(a.since) < SETTLE_AFTER_MS) add.push(name); // older ones settle straight in break rooms
    }
    if (!add.length) return;
    saveSeen(seen.current);
    setClosing((c) => new Set([...c, ...add]));
  }, [project]);
  // The closing line stays ~2.4 s AFTER the member has settled at the desk (they may still be walking there when the
  // job finishes). Driven by an interval, not by the `project` effect, so an SSE update can never strand anyone.
  const settledAt = useRef<Record<string, number>>({});
  useEffect(() => {
    if (!closing.size) return;
    const id = setInterval(() => {
      const done: string[] = [];
      const now = Date.now();
      for (const name of closing) {
        const w = walkersRef.current[name];
        const home = WORK_HOME[name];
        const atDesk = !!w && !w.moving && w.seatId === home?.seat;
        if (!atDesk) { delete settledAt.current[name]; continue; }
        settledAt.current[name] ??= now;
        if (now - settledAt.current[name] >= 2400) done.push(name);
      }
      if (done.length) { done.forEach((n) => delete settledAt.current[n]); setClosing((c) => { const n = new Set(c); done.forEach((x) => n.delete(x)); return n; }); }
    }, 200);
    return () => clearInterval(id);
  }, [closing]);

  const placements = useMemo(() => computePlacements(CARD.team, project, now, { closing, rooms: ROOM_KEYS }), [project, now, closing]);
  const targets = useMemo(() => Object.fromEntries(placements.map((p) => [p.name, p.seat])), [placements]);
  const walkers = useWalkers(targets);
  walkersRef.current = walkers;
  const [wrapRef, box] = useFitBox<HTMLDivElement>(MAP_W / MAP_H);
  const scale = Math.min(1.15, Math.max(0.55, box.w / 1100));
  const charH = 88 * scale;
  const imgH = charH / (240 / 256);
  const ticker = useMemo(() => events.filter((e) => !project || demo || !e.project || e.project === project.slug).slice(-14).reverse(), [events, project, demo]);
  (window as unknown as { __placements?: Placement[] }).__placements = placements;
  (window as unknown as { __walkers?: unknown }).__walkers = walkers;

  return (
    <div className="flex h-full gap-3 min-h-0">
      <div className="flex-1 flex flex-col min-w-0 min-h-0 gap-2">
        <div className="flex items-center gap-3 text-xs">
          <span data-testid="lights" className={lightsOn ? 'text-amber-300' : 'text-gray-500'}>{lightsOn ? '💡 lights on — live Claude session' : '🌙 lights off — no live Claude session'}</span>
          <div className="flex-1" />
          <label className="flex items-center gap-2 cursor-pointer select-none" title="Simulated activity for showing the office off. Not real.">
            <input data-testid="demo-toggle" type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
            <span className={demo ? 'px-2 py-0.5 rounded bg-amber-500 text-black font-bold' : 'text-gray-400'}>Demo (simulated)</span>
          </label>
        </div>
        <div ref={wrapRef} className="flex-1 min-h-0 flex items-center justify-center">
          <div data-testid="stage" className="relative overflow-hidden rounded-lg border border-line" style={{ width: box.w, height: box.h }}>
            {!project && <div data-testid="no-project-banner" className="absolute z-[900] left-1/2 -translate-x-1/2 top-2 px-3 py-1 rounded bg-black/80 border border-amber-500/50 text-amber-300 text-xs">No project loaded — load one in Projects. The team is on a break.</div>}
            {demo && <div className="absolute z-[900] left-1/2 -translate-x-1/2 top-2 px-3 py-1 rounded bg-amber-500 text-black text-xs font-black tracking-widest">DEMO — SIMULATED ACTIVITY, NOT REAL</div>}
            <div className="absolute inset-0" style={{ filter: lightsOn ? 'none' : 'brightness(0.28) saturate(0.4)', transition: 'filter 700ms ease' }}>
              <img src={OFFICE_MAP} alt="office" draggable={false} className="absolute inset-0 w-full h-full" style={{ imageRendering: PIXEL_ART ? 'pixelated' : 'auto' }} />
              {placements.map((p) => {
                const w = walkers[p.name];
                if (!w) return null;
                const sp = SPRITES[p.name];
                const walkingToBreak = w.moving && p.resting;
                return (
                  <div key={p.name} data-member={p.name} data-room={w.room} data-pose={w.pose} data-flip={w.flip} data-moving={w.moving}
                    onClick={() => setSelected(CARD.team.find((m) => m.name === p.name)!)}
                    className="absolute cursor-pointer"
                    style={{ left: `${w.x}%`, top: `${w.y}%`, zIndex: 10 + Math.round(w.y * 10), transition: `left ${w.dur}ms linear, top ${w.dur}ms linear, opacity 300ms`, opacity: walkingToBreak ? 0.72 : p.dim ? 0.45 : 1 }}>
                    <div style={{ transform: 'translate(-50%, -97%)' }}>
                      <div className={w.moving ? '' : 'ao-bob'}>
                        <img src={sp[w.pose]} alt={p.name} draggable={false}
                          style={{ height: imgH, width: imgH, transform: w.flip ? 'scaleX(-1)' : 'none', filter: 'drop-shadow(0 4px 3px rgba(0,0,0,.55))', imageRendering: PIXEL_ART ? 'pixelated' : 'auto' }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* overlays (not dimmed): room labels on hover, bubbles, badges */}
            {ROOM_KEYS.map((k) => { const r = ROOM_REGIONS[k]; return (
              <div key={k} className="absolute group" style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%`, zIndex: 5 }}>
                <span className="hidden group-hover:block absolute left-2 top-2 px-2 py-0.5 rounded bg-black/75 text-xs text-white border border-accent/50">{CARD.rooms[k]}</span>
              </div>); })}
            {placements.map((p) => {
              const w = walkers[p.name];
              if (!w) return null;
              const bubble = !w.moving && p.bubble ? p.bubble : null;
              const coffee = !w.moving && p.resting && !bubble;
              return (
                <div key={p.name} className="absolute pointer-events-none" style={{ left: `${w.x}%`, top: `${w.y}%`, zIndex: 2000 + Math.round(w.y * 10), transition: `left ${w.dur}ms linear, top ${w.dur}ms linear` }}>
                  <div className="absolute flex flex-col items-center" style={{ bottom: charH + 2, left: 0, transform: 'translateX(-50%)' }}>
                    {bubble && <div data-bubble={p.name} className="ao-pop mb-1 max-w-[220px] w-max px-2.5 py-1.5 rounded-lg bg-[#0f1118]/95 border-2 border-accent text-[11px] leading-snug text-gray-100 shadow-lg">{bubble}</div>}
                    {coffee && <div data-coffee={p.name} className="text-sm">☕</div>}
                    {p.badge && <div data-badge={`${p.name}:${p.badge}`} className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-black text-black ${p.badge === 'amber' ? 'bg-amber-400' : 'bg-red-500'} ao-pulse`}>!</div>}
                    {p.ageTag && <div className="text-[10px] px-1 rounded bg-black/70 text-gray-300">⏱ {p.ageTag}</div>}
                  </div>
                  <div className="absolute text-[10px] font-semibold px-1 rounded bg-black/60 whitespace-nowrap" style={{ top: 2, left: 0, transform: 'translateX(-50%)', color: SPRITES[p.name].colour }}>{p.name}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div data-testid="ticker" className="h-8 shrink-0 overflow-hidden rounded bg-panel border border-line flex items-center text-xs">
          <span className="px-2 text-accent font-bold shrink-0">LIVE</span>
          <div className="flex gap-6 whitespace-nowrap ao-ticker">
            {ticker.length ? ticker.map((e, i) => <span key={e.ts + i} className={e.project ? 'text-gray-200' : 'text-gray-500'}>{sentence(e)} <span className="text-gray-600">· {timeAgo(e.ts, now)}</span></span>)
              : <span className="text-gray-500">No real activity yet — start Claude in the terminal.</span>}
          </div>
        </div>
      </div>
      <aside data-testid="roster" className="w-64 shrink-0 bg-panel border border-line rounded-lg p-2 overflow-auto">
        <div className="text-xs uppercase tracking-wider text-gray-500 px-1 pb-2">Team</div>
        {placements.map((p) => {
          const m = CARD.team.find((x) => x.name === p.name)!;
          const a = project?.agents[p.name];
          const st = a?.state ?? 'idle';
          return (
            <button key={p.name} data-roster={p.name} onClick={() => setSelected(m)} className="w-full flex gap-2 items-center text-left p-1.5 rounded hover:bg-panel2">
              <img src={SPRITES[p.name].portrait} className="w-10 h-10 rounded-full" style={{ background: SPRITES[p.name].colour + '33' }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm"><span className={`w-2 h-2 rounded-full ${STATE_DOT[st] || 'bg-gray-500'}`} /><b>{m.name}</b><span className="text-gray-500 text-xs">{m.role}</span></div>
                <div className="text-[11px] text-gray-400 truncate" title={p.why}>{a?.task || (m.name === LEAD.name ? 'at the desk' : st)}</div>
                <div className="text-[10px] text-gray-600">{CARD.rooms[p.room] || ''}{a?.since ? ` · ${timeAgo(a.since, now)}` : ''}</div>
              </div>
            </button>
          );
        })}
      </aside>
      {selected && <MemberModal m={selected} project={project} events={events} onClose={() => setSelected(null)} now={now} why={placements.find((p) => p.name === selected.name)?.why} />}
    </div>
  );
}

function MemberModal({ m, project, events, onClose, now, why }: { m: Member; project: Project | null; events: SatoruEvent[]; onClose: () => void; now: number; why?: string }) {
  const sp = SPRITES[m.name];
  const a = project?.agents[m.name];
  const mine = events.filter((e) => e.agent === m.name).slice(-10).reverse();
  return (
    <Modal onClose={onClose}>
      <div className="flex gap-4" data-testid="member-modal">
        <img src={sp.portraitLarge} className="w-40 h-40 rounded-xl" style={{ background: sp.colour + '33' }} />
        <div className="flex-1 min-w-0">
          <div className="text-2xl font-black" style={{ color: sp.colour }}>{m.name}</div>
          <div className="text-gray-400">{m.role} · {m.character.toLowerCase()}</div>
          <div className="mt-2 text-sm">Status: <b>{a?.state ?? 'idle'}</b>{a?.since ? <span className="text-gray-500"> · since {timeAgo(a.since, now)}</span> : null}</div>
          <div className="text-sm">Task: {a?.task || <span className="text-gray-500">none</span>}</div>
          {a?.say && <div className="text-sm mt-1 italic text-gray-300">“{a.say}”</div>}
          {why && <div className="text-xs text-gray-500 mt-1">Location: {why}</div>}
        </div>
      </div>
      <div className="flex gap-3 mt-4 justify-center bg-panel2 rounded-lg p-2">
        {(['front', 'side', 'back'] as const).map((p) => <figure key={p} className="text-center"><img src={sp[p]} className="w-28 h-28" /><figcaption className="text-xs text-gray-500">{p}</figcaption></figure>)}
      </div>
      <div className="mt-4">
        <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Last 10 events</div>
        {mine.length ? <ul className="text-sm space-y-1">{mine.map((e, i) => <li key={i}><span className="text-gray-500 text-xs mr-2">{timeAgo(e.ts, now)}</span>{sentence(e)}</li>)}</ul> : <div className="text-sm text-gray-500">No events yet.</div>}
      </div>
    </Modal>
  );
}
