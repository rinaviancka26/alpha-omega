// DEV-ONLY coordinate picker: http://localhost:4316/picker.html
// All coordinates are percentages of the map, 1 decimal.
import { useMemo, useRef, useState } from 'react';
import { CARD } from '../card';
import { OFFICE_MAP, MAP_W, MAP_H } from '../officeAssets';
import { bfs } from '../lib/graph';
import { useFitBox } from '../hooks/useFitBox';

type Rect = { x: number; y: number; w: number; h: number };
type Seat = { id: string; room: string; x: number; y: number };
type Door = { id: string; room: string; x: number; y: number };
type Node = { id: string; x: number; y: number };
export type Coords = { rooms: Record<string, Rect>; seats: Seat[]; doors: Door[]; nodes: Node[]; edges: [string, string][] };
type Mode = 'ROOM' | 'SEAT' | 'DOOR' | 'NODE' | 'CONNECT';
const MODES: Mode[] = ['ROOM', 'SEAT', 'DOOR', 'NODE', 'CONNECT'];
const ROOM_KEYS = Object.keys(CARD.rooms);
const r1 = (v: number) => Math.round(v * 10) / 10;
const empty = (): Coords => ({ rooms: {}, seats: [], doors: [], nodes: [], edges: [] });

export function checklist(c: Coords) {
  const items: { ok: boolean; text: string }[] = [];
  const missingRooms = ROOM_KEYS.filter((k) => !c.rooms[k]);
  items.push({ ok: missingRooms.length === 0, text: `All ${ROOM_KEYS.length} rooms placed${missingRooms.length ? ` — missing: ${missingRooms.join(', ')}` : ''}` });
  const noDoor = ROOM_KEYS.filter((k) => !c.doors.some((d) => d.room === k));
  items.push({ ok: noDoor.length === 0, text: `Every room has a door${noDoor.length ? ` — none: ${noDoor.join(', ')}` : ''}` });
  for (const room of ['command', 'workspace', 'server']) {
    const need = CARD.team.filter((m) => m.worksIn === room).length;
    const have = c.seats.filter((s) => s.room === room).length;
    items.push({ ok: have >= need, text: `${CARD.rooms[room]}: ${have} seat(s) ≥ ${need} member(s) working there` });
  }
  const firstDoor = (k: string) => c.doors.find((d) => d.room === k)?.id;
  const start = firstDoor('command');
  const unreachable = ROOM_KEYS.filter((k) => { const d = firstDoor(k); return !start || !d || !bfs(c.edges, start, d); });
  items.push({ ok: unreachable.length === 0, text: `All rooms reachable${unreachable.length ? ` — unreachable: ${unreachable.join(', ')}` : ''}` });
  return items;
}

export default function Picker() {
  const [c, setC] = useState<Coords>(empty);
  const [history, setHistory] = useState<Coords[]>([]);
  const [mode, setMode] = useState<Mode>('ROOM');
  const [roomKey, setRoomKey] = useState(ROOM_KEYS[0]);
  const [nodeId, setNodeId] = useState('j_top');
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const [wrapRef, box] = useFitBox<HTMLDivElement>(MAP_W / MAP_H);

  const commit = (next: Coords) => { setHistory((h) => [...h, c]); setC(next); };
  const undo = () => setHistory((h) => { if (!h.length) return h; setC(h[h.length - 1]); return h.slice(0, -1); });
  const pct = (e: React.MouseEvent) => {
    const b = ref.current!.getBoundingClientRect();
    return { x: r1(((e.clientX - b.left) / b.width) * 100), y: r1(((e.clientY - b.top) / b.height) * 100) };
  };
  const roomAt = (p: { x: number; y: number }) =>
    Object.entries(c.rooms).find(([, r]) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)?.[0];
  const pointIds = [...c.doors.map((d) => d.id), ...c.nodes.map((n) => n.id)];
  const pointById = (id: string) => c.doors.find((d) => d.id === id) || c.nodes.find((n) => n.id === id);

  const onDown = (e: React.MouseEvent) => { if (mode === 'ROOM') { const p = pct(e); setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }); } };
  const onMove = (e: React.MouseEvent) => { if (drag) { const p = pct(e); setDrag({ ...drag, x1: p.x, y1: p.y }); } };
  const onUp = () => {
    if (mode !== 'ROOM' || !drag) return;
    const r = { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: r1(Math.abs(drag.x1 - drag.x0)), h: r1(Math.abs(drag.y1 - drag.y0)) };
    setDrag(null);
    if (r.w < 1 || r.h < 1) return;
    commit({ ...c, rooms: { ...c.rooms, [roomKey]: r } });
    setMsg(`${CARD.rooms[roomKey]} placed`);
  };
  const onClick = (e: React.MouseEvent) => {
    const p = pct(e);
    if (mode === 'SEAT') {
      const room = roomAt(p);
      if (!room) { setMsg('Seat must be inside a placed room'); return; }
      const n = c.seats.filter((s) => s.room === room).length + 1;
      let id = `${room}_${n}`; let k = n;
      while (c.seats.some((s) => s.id === id)) id = `${room}_${++k}`;
      commit({ ...c, seats: [...c.seats, { id, room, ...p }] });
      setMsg(`seat ${id} → ${CARD.rooms[room]}`);
    } else if (mode === 'DOOR') {
      let id = `d_${roomKey}`; let k = 1;
      while (c.doors.some((d) => d.id === id)) id = `d_${roomKey}_${++k}`;
      commit({ ...c, doors: [...c.doors, { id, room: roomKey, ...p }] });
      setMsg(`door ${id}`);
    } else if (mode === 'NODE') {
      const id = nodeId.trim();
      if (!/^[a-z0-9_]+$/.test(id) || pointIds.includes(id)) { setMsg(`node id "${id}" invalid or taken`); return; }
      commit({ ...c, nodes: [...c.nodes, { id, ...p }] });
      setMsg(`node ${id}`);
    }
  };
  const clickPoint = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected(id);
    if (mode !== 'CONNECT') return;
    if (!linkFrom) { setLinkFrom(id); setMsg(`link from ${id}…`); return; }
    if (linkFrom !== id && !c.edges.some(([a, b]) => (a === linkFrom && b === id) || (a === id && b === linkFrom))) {
      commit({ ...c, edges: [...c.edges, [linkFrom, id]] });
      setMsg(`linked ${linkFrom} ↔ ${id}`);
    }
    setLinkFrom(null);
  };
  const del = () => {
    if (!selected) return;
    const s = selected;
    commit({
      rooms: Object.fromEntries(Object.entries(c.rooms).filter(([k]) => `room:${k}` !== s)),
      seats: c.seats.filter((x) => x.id !== s),
      doors: c.doors.filter((x) => x.id !== s),
      nodes: c.nodes.filter((x) => x.id !== s),
      edges: c.edges.filter(([a, b]) => a !== s && b !== s && `edge:${a}|${b}` !== s),
    });
    setSelected(null);
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(c, null, 2) + '\n'], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'office-coordinates.json'; a.click();
  };
  const importJson = async (f: File) => {
    try { const j = JSON.parse(await f.text()) as Coords; commit({ ...empty(), ...j }); setMsg(`imported ${f.name}`); }
    catch (err) { setMsg('import failed: ' + (err as Error).message); }
  };
  const loadCurrent = async () => {
    const j = (await import('../office-coordinates.json')).default as unknown as Coords;
    commit(j); setMsg('loaded web/src/office-coordinates.json');
  };
  const checks = useMemo(() => checklist(c), [c]);
  const seatCount = (room: string) => c.seats.filter((s) => s.room === room).length;

  return (
    <div className="flex h-full text-sm">
      <div ref={wrapRef} className="flex-1 flex items-center justify-center p-3 min-w-0 h-full">
        <div ref={ref} data-testid="map" className="relative select-none" onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onClick={onClick}
          style={{ width: box.w, height: box.h, cursor: 'crosshair' }}>
          <img src={OFFICE_MAP} className="absolute inset-0 w-full h-full" draggable={false} />
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {c.edges.map(([a, b]) => { const A = pointById(a), B = pointById(b); return A && B ? (
              <line key={a + b} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={selected === `edge:${a}|${b}` ? '#fff' : '#22d3ee'} strokeWidth={0.35}
                onClick={(e) => { e.stopPropagation(); setSelected(`edge:${a}|${b}`); }} style={{ cursor: 'pointer' }} />) : null; })}
          </svg>
          {Object.entries(c.rooms).map(([k, r]) => (
            <div key={k} data-room={k} onClick={(e) => { if (mode === 'ROOM') { e.stopPropagation(); setSelected(`room:${k}`); } }}
              className={`absolute border-2 ${selected === `room:${k}` ? 'border-white' : 'border-accent'} bg-accent/10 pointer-events-auto`}
              style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%`, pointerEvents: mode === 'ROOM' ? 'auto' : 'none' }}>
              <span className="absolute left-1 top-1 bg-black/70 px-1 rounded text-[11px] text-white">{CARD.rooms[k]} · {seatCount(k)} seats</span>
            </div>
          ))}
          {drag && <div className="absolute border-2 border-dashed border-white" style={{ left: `${Math.min(drag.x0, drag.x1)}%`, top: `${Math.min(drag.y0, drag.y1)}%`, width: `${Math.abs(drag.x1 - drag.x0)}%`, height: `${Math.abs(drag.y1 - drag.y0)}%` }} />}
          {c.seats.map((s) => (
            <div key={s.id} data-seat={s.id} onClick={(e) => clickPoint(s.id, e)} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center" style={{ left: `${s.x}%`, top: `${s.y}%` }}>
              <div className={`w-3 h-3 rounded-full border-2 border-black ${selected === s.id ? 'bg-white' : 'bg-lime-400'}`} />
              <span className="text-[10px] bg-black/75 text-lime-300 px-1 rounded mt-0.5 whitespace-nowrap">{s.id}</span>
            </div>
          ))}
          {[...c.doors.map((d) => ({ ...d, kind: 'door' })), ...c.nodes.map((n) => ({ ...n, kind: 'node' }))].map((p) => (
            <div key={p.id} data-point={p.id} onClick={(e) => clickPoint(p.id, e)} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center cursor-pointer" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
              <div className={`w-3.5 h-3.5 border-2 border-black ${p.kind === 'door' ? 'bg-amber-400' : 'bg-cyan-400 rounded-full'} ${linkFrom === p.id || selected === p.id ? 'ring-2 ring-white' : ''}`} />
              <span className="text-[10px] bg-black/75 text-amber-200 px-1 rounded mt-0.5 whitespace-nowrap">{p.id}</span>
            </div>
          ))}
        </div>
      </div>
      <aside className="w-80 shrink-0 border-l border-line bg-panel p-3 flex flex-col gap-3 overflow-auto">
        <div className="font-bold text-accent">{CARD.appName} · picker <span className="text-xs text-gray-500">(dev only)</span></div>
        <div className="flex flex-wrap gap-1">
          {MODES.map((m) => <button key={m} data-mode={m} onClick={() => { setMode(m); setLinkFrom(null); }} className={`px-2 py-1 rounded ${mode === m ? 'bg-accent text-white' : 'bg-panel2'}`}>{m}</button>)}
        </div>
        {(mode === 'ROOM' || mode === 'DOOR') && (
          <label className="flex flex-col gap-1">room key
            <select data-testid="room-key" value={roomKey} onChange={(e) => setRoomKey(e.target.value)} className="bg-panel2 p-1 rounded">
              {ROOM_KEYS.map((k) => <option key={k} value={k}>{k} — {CARD.rooms[k]}</option>)}
            </select>
          </label>
        )}
        {mode === 'NODE' && <label className="flex flex-col gap-1">node id<input data-testid="node-id" value={nodeId} onChange={(e) => setNodeId(e.target.value)} className="bg-panel2 p-1 rounded" /></label>}
        <div className="text-xs text-gray-400">{{ ROOM: 'Drag a rectangle for the chosen room.', SEAT: 'Click inside a room to add a seat (feet position).', DOOR: 'Click a doorway for the chosen room.', NODE: 'Click to add a corridor node with the id above.', CONNECT: 'Click two doors/nodes to link them.' }[mode]}</div>
        <div className="flex flex-wrap gap-1">
          <button onClick={undo} disabled={!history.length} className="px-2 py-1 rounded bg-panel2 disabled:opacity-40">Undo</button>
          <button data-testid="delete" onClick={del} disabled={!selected} className="px-2 py-1 rounded bg-panel2 disabled:opacity-40">Delete {selected ?? ''}</button>
          <button data-testid="export" onClick={exportJson} className="px-2 py-1 rounded bg-panel2">Export</button>
          <label className="px-2 py-1 rounded bg-panel2 cursor-pointer">Import<input data-testid="import" type="file" accept=".json" className="hidden" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} /></label>
          <button data-testid="load-current" onClick={loadCurrent} className="px-2 py-1 rounded bg-panel2">Load current</button>
        </div>
        <div className="text-xs text-amber-300 min-h-4" data-testid="msg">{msg}</div>
        <div>
          <div className="font-semibold mb-1">Checklist</div>
          <ul data-testid="checklist" className="flex flex-col gap-1">
            {checks.map((i) => <li key={i.text} data-ok={i.ok} className={i.ok ? 'text-green-400' : 'text-red-400'}>{i.ok ? '✓' : '✗'} {i.text}</li>)}
          </ul>
        </div>
        <div className="text-xs text-gray-500">rooms {Object.keys(c.rooms).length} · seats {c.seats.length} · doors {c.doors.length} · nodes {c.nodes.length} · edges {c.edges.length}</div>
      </aside>
    </div>
  );
}
