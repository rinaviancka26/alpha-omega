import { useEffect, useState } from 'react';
import { api, type TerminalStatus } from '../lib/api';

/** Polls /api/terminal-status (cheap; the server caches the process scan). */
export function useTerminalStatus(intervalMs = 3000) {
  const [st, setSt] = useState<TerminalStatus>({ attached: false, sessions: 0, claudeRunning: false });
  useEffect(() => {
    let alive = true;
    const tick = () => api<TerminalStatus>('/api/terminal-status').then((s) => alive && setSt(s)).catch(() => alive && setSt({ attached: false, sessions: 0, claudeRunning: false }));
    tick();
    const id = setInterval(tick, intervalMs);
    return () => { alive = false; clearInterval(id); };
  }, [intervalMs]);
  return st;
}
