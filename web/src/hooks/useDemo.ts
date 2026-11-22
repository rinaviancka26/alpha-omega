// DEMO mode — the ONLY place activity is simulated. Clearly labelled in the UI; never written to disk.
import { useEffect, useState } from 'react';
import { CARD } from '../card';
import type { Project } from '../types';

export function useDemo(enabled: boolean): Project | null {
  const [tick, setTick] = useState(0);
  useEffect(() => { if (!enabled) return; setTick(0); const id = setInterval(() => setTick((t) => t + 1), 4000); return () => clearInterval(id); }, [enabled]);
  if (!enabled) return null;
  const now = Date.now();
  const iso = new Date(now).toISOString();
  const team = CARD.team.slice(1);
  const agents: Project['agents'] = {};
  const tasks: Project['tasks'] = [];
  team.forEach((m, i) => {
    const phase = (tick + i * 2) % 8;
    const status = phase < 4 ? 'in_progress' : phase === 4 ? 'review' : phase === 5 ? 'done' : 'planned';
    tasks.push({ id: `D${i + 1}`, title: `Demo task ${i + 1}`, owner: m.name, status, files: [] });
    agents[m.name] = { state: phase < 4 ? 'working' : phase === 5 ? 'completed' : 'idle', task: `Demo task ${i + 1}`, since: iso, heartbeat: iso, say: phase === 5 ? 'Demo: all bolts tightened.' : null };
  });
  if (tick % 6 === 3) agents[team[0].name] = { ...agents[team[0].name], intendedRoom: 'meeting', voice: 'Demo: quick sync in the meeting room', directiveAt: iso };
  return { slug: 'demo', agents, tasks, plan: null, approvals: tick % 5 === 2 ? [{ id: 'A-demo', title: 'Demo approval', risk: 'low', reason: 'demo', status: 'pending', created: iso }] : [], mission: { title: 'Demo' } };
}
