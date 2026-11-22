import { useState } from 'react';
import { CARD } from './card';

const TABS = ['Office', 'Projects', 'Tasks', 'Decisions', 'Brief', 'Timeline'] as const;
type Tab = (typeof TABS)[number];

export default function App() {
  const [tab, setTab] = useState<Tab>('Office');
  const [dockOpen, setDockOpen] = useState(true);
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
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 shrink-0 border-b border-line bg-panel flex items-center px-4 gap-4">
          <h1 className="font-bold tracking-wide">{CARD.appName}</h1>
          <span className="text-xs text-gray-500">HUD</span>
        </header>
        <main className="flex-1 overflow-auto p-4"><div className="text-gray-500">{tab}</div></main>
        <section className={`border-t border-line bg-panel ${dockOpen ? 'h-64' : 'h-9'} shrink-0 flex flex-col`}>
          <button onClick={() => setDockOpen(!dockOpen)} className="h-9 text-left px-4 text-xs text-gray-400 hover:text-white">
            {dockOpen ? '▾' : '▸'} Terminal
          </button>
        </section>
      </div>
    </div>
  );
}
