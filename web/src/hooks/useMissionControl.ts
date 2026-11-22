import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { AppState, SatoruEvent } from '../types';

export type Change = { kind: string; project: string | null; file: string };

/** Live view of .satoru via GET /api/state + /api/events/recent, refreshed on every SSE change. */
export function useMissionControl() {
  const [state, setState] = useState<AppState | null>(null);
  const [events, setEvents] = useState<SatoruEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastChange, setLastChange] = useState<Change | null>(null);
  const [rev, setRev] = useState(0);
  const pending = useRef<{ state: boolean; events: boolean; t?: ReturnType<typeof setTimeout> }>({ state: false, events: false });

  const refresh = useCallback(async (what: { state?: boolean; events?: boolean } = { state: true, events: true }) => {
    const jobs: Promise<unknown>[] = [];
    if (what.state) jobs.push(api<AppState>('/api/state').then(setState));
    if (what.events) jobs.push(api<{ events: SatoruEvent[] }>('/api/events/recent?limit=200').then((r) => setEvents(r.events)));
    await Promise.all(jobs).catch(() => undefined);
    setRev((r) => r + 1);
  }, []);

  useEffect(() => {
    refresh();
    const es = new EventSource('/api/stream');
    es.onopen = () => { setConnected(true); refresh(); };
    es.onerror = () => setConnected(false);
    es.onmessage = (m) => {
      let c: Change;
      try { c = JSON.parse(m.data); } catch { return; }
      if (c.kind === 'hello') return;
      setLastChange(c);
      const p = pending.current;
      if (c.kind === 'events') p.events = true; else p.state = true;
      clearTimeout(p.t);
      p.t = setTimeout(() => { const w = { state: p.state, events: p.events }; p.state = p.events = false; refresh(w); }, 60);
    };
    return () => es.close();
  }, [refresh]);

  return { state, events, connected, lastChange, refresh, rev };
}
