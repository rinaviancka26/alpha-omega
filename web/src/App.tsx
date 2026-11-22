import { useEffect, useState } from 'react';
import { CARD } from './card';
import Terminal from './components/Terminal';
import { useTerminalStatus } from './hooks/useTerminalStatus';
import { useMissionControl } from './hooks/useMissionControl';
import Office from './screens/Office';

const TABS = ['Office', 'Projects', 'Tasks', 'Decisions', 'Brief', 'Timeline'] as const;
type Tab = (typeof TABS)[number];
const TAB_KEY = 'alpha-omega.tab';

export default function App() {
  const [tab, setTab] = useState<Tab>(() => { try { const t = localStorage.getItem(TAB_KEY) as Tab; return TABS.includes(t) ? t : 'Office'; } catch { return 'Office'; } });
  useEffect(() => { try { localStorage.setItem(TAB_KEY, tab); } catch { /* */ } }, [tab]);
  const [dockOpen, setDockOpen] = useState(true);
  const term = useTerminalStatus();
  const mc = useMissionControl();
  const { state } = mc;
  const projName = state?.registry.projects.find((p) => p.slug === state.activeProject)?.name;

  return (
    <div className="flex h-full">
      <aside className="w-44 shrink-0 border-r border-line bg-panel flex flex-col">
        <div className="px-4 py-4 font-black tracking-widest text-accent text-sm">{CARD.appName}</div>
        <nav className="flex flex-col gap-1 px-2">
          {TABS.map((t) => (
            <button key={t} data-tab={t} onClick={() => setTab(t)}
              className={`text-left px-3 py-2 rounded-md text-sm ${tab === t ? 'bg-accent/20 text-white border-l-2 border-accent' : 'text-gray-400 hover:bg-panel2'}`}>{t}</button>
          ))}
        </nav>
        <div className="mt-auto p-3 text-[10px] text-gray-600">
          <div className={mc.connected ? 'text-green-500' : 'text-red-400'}>● {mc.connected ? 'live (SSE)' : 'server offline'}</div>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header data-testid="hud" className="h-12 shrink-0 border-b border-line bg-panel flex items-center px-4 gap-4">
          <h1 className="font-bold tracking-wide">{CARD.appName}</h1>
          {projName ? <span data-testid="working-on" className="text-sm text-gray-300">working on <b className="text-accent">{projName}</b></span>
            : <span data-testid="no-project" className="text-sm px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/40">no project loaded</span>}
          <div className="flex-1" />
          <span className={`text-xs ${term.claudeRunning ? 'text-green-400' : 'text-gray-500'}`}>{term.claudeRunning ? '● Claude live' : '○ Claude not running'}</span>
        </header>
        <main className="flex-1 overflow-auto p-3 min-h-0">
          {tab === 'Office' && <Office state={state} events={mc.events} />}
          {tab !== 'Office' && <div className="text-gray-500">{tab}</div>}
        </main>
        <section className={`border-t border-line bg-panel ${dockOpen ? 'h-72' : 'h-9'} shrink-0 flex flex-col`}>
          <button onClick={() => setDockOpen(!dockOpen)} className="h-9 shrink-0 text-left px-4 text-xs text-gray-400 hover:text-white">
            {dockOpen ? '▾' : '▸'} Terminal
          </button>
          <div className={dockOpen ? 'flex-1 min-h-0' : 'hidden'}><Terminal visible={dockOpen} status={term} /></div>
        </section>
      </div>
    </div>
  );
}
