import { useCallback, useEffect, useState } from 'react';
import { CARD } from './card';
import Terminal from './components/Terminal';
import { useTerminalStatus } from './hooks/useTerminalStatus';
import { useMissionControl } from './hooks/useMissionControl';
import Office from './screens/Office';
import Projects from './screens/Projects';
import { NeedsYouBar, PlanModal, ApprovalModal, decisionMessage, type NeedItem, type DecisionResult } from './components/Approvals';
import Toasts, { type ToastMsg } from './components/Toast';

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
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const toast = useCallback((tone: ToastMsg['tone'], text: string) => setToasts((t) => [...t, { id: Date.now() + Math.random(), tone, text }]), []);
  const expire = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const onDecision = useCallback((r: DecisionResult) => { const m = decisionMessage(r); toast(m.tone, m.text); mc.refresh(); }, [toast, mc]);
  const [planOpen, setPlanOpen] = useState<null | 'edit' | 'read'>(null);
  const [approvalId, setApprovalId] = useState<string | null>(null);
  const openNeed = (i: NeedItem) => { if (i.kind === 'plan') setPlanOpen('edit'); else if (i.kind === 'approval') setApprovalId(i.approval!.id); else setTab('Tasks'); };
  const plan = state?.project?.plan ?? null;
  // project switch: lights-off → lights-on sweep + toast
  const [sweep, setSweep] = useState(0);
  const onSwitched = useCallback((name: string, r: { injected?: boolean; notice?: string }) => {
    setSweep((n) => n + 1);
    toast('info', `Now working on ${name}`);
    if (!r.injected && r.notice) toast('quiet', r.notice);
    mc.refresh();
  }, [toast, mc]);
  const approval = state?.project?.approvals.find((a) => a.id === approvalId && a.status === 'pending') ?? null;

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
          {plan && plan.status !== 'awaiting-approval' && (
            <button data-testid="plan-pill" onClick={() => setPlanOpen('read')} className={`text-xs px-2 py-0.5 rounded-full border ${plan.status === 'approved' ? 'border-green-500/60 text-green-300' : plan.status === 'rejected' ? 'border-red-500/60 text-red-300' : 'border-amber-500/60 text-amber-300'}`}>📋 {plan.title} · {plan.status}</button>)}
          <div className="flex-1" />
          <span className={`text-xs ${term.claudeRunning ? 'text-green-400' : 'text-gray-500'}`}>{term.claudeRunning ? '● Claude live' : '○ Claude not running'}</span>
        </header>
        <NeedsYouBar state={state} onOpen={openNeed} />
        <main className="flex-1 overflow-auto p-3 min-h-0">
          {tab === 'Office' && <Office state={state} events={mc.events} />}
          {tab === 'Projects' && <Projects state={state} term={term} onSwitched={onSwitched} onError={(m) => toast('error', m)} />}
          {!['Office', 'Projects'].includes(tab) && <div className="text-gray-500">{tab}</div>}
        </main>
        <section className={`border-t border-line bg-panel ${dockOpen ? 'h-72' : 'h-9'} shrink-0 flex flex-col`}>
          <button onClick={() => setDockOpen(!dockOpen)} className="h-9 shrink-0 text-left px-4 text-xs text-gray-400 hover:text-white">
            {dockOpen ? '▾' : '▸'} Terminal
          </button>
          <div className={dockOpen ? 'flex-1 min-h-0' : 'hidden'}><Terminal visible={dockOpen} status={term} /></div>
        </section>
      </div>
      {planOpen && plan && state?.activeProject && <PlanModal slug={state.activeProject} plan={plan} readOnly={planOpen === 'read'} onClose={() => setPlanOpen(null)} onDone={onDecision} />}
      {approval && state?.activeProject && <ApprovalModal slug={state.activeProject} a={approval} onClose={() => setApprovalId(null)} onDone={onDecision} />}
      {sweep > 0 && <div key={sweep} data-testid="sweep" className="ao-sweep fixed inset-0 z-[1050] pointer-events-none bg-black" />}
      <Toasts items={toasts} onExpire={expire} />
    </div>
  );
}
