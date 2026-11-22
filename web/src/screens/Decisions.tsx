import { ApprovalCard, type DecisionResult } from '../components/Approvals';
import type { AppState } from '../types';

const fmt = (iso?: string) => (iso && Number.isFinite(Date.parse(iso)) ? new Date(Date.parse(iso)).toLocaleString() : '');

export default function Decisions({ state, onOpenPlan, onDone }: { state: AppState | null; onOpenPlan: () => void; onDone: (r: DecisionResult) => void }) {
  const p = state?.project;
  if (!p) return <div className="text-gray-500">No project loaded.</div>;
  type Row = { key: string; kind: 'plan' | 'approval'; pending: boolean; title: string; status: string; when: string; note?: string; risk?: string };
  const rows: Row[] = [];
  if (p.plan) rows.push({ key: 'plan', kind: 'plan', pending: p.plan.status === 'awaiting-approval', title: p.plan.title, status: p.plan.status, when: p.plan.decidedAt || p.plan.created || '', note: p.plan.note });
  for (const a of p.approvals) rows.push({ key: a.id, kind: 'approval', pending: a.status === 'pending', title: a.title, status: a.status, when: a.decidedAt || a.created, note: a.note, risk: a.risk });
  rows.sort((a, b) => Number(b.pending) - Number(a.pending) || (Date.parse(b.when) || 0) - (Date.parse(a.when) || 0));
  return (
    <div className="max-w-3xl space-y-2" data-testid="decisions">
      {!rows.length && <div className="text-gray-500">No decisions yet.</div>}
      {rows.map((r) => r.pending && r.kind === 'approval' ? (
        <div key={r.key} data-decision={r.key} data-pending="true"><ApprovalCard slug={p.slug} a={p.approvals.find((a) => a.id === r.key)!} onDone={onDone} /></div>
      ) : (
        <div key={r.key} data-decision={r.key} data-pending={r.pending} className={`rounded-lg border p-3 ${r.pending ? 'border-amber-500/60 bg-amber-500/10' : 'border-line bg-panel2'}`}>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-black/40">{r.kind}{r.risk ? ` · ${r.risk}` : ''}</span>
            <b className="flex-1">{r.title}</b>
            <span className={`text-xs ${r.status === 'approved' ? 'text-green-400' : r.status === 'rejected' ? 'text-red-400' : 'text-amber-300'}`}>{r.status}</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">{fmt(r.when)}{r.note ? <span className="text-gray-300"> — {r.note}</span> : null}</div>
          {r.kind === 'plan' && <button onClick={onOpenPlan} className="mt-2 text-xs px-2 py-1 rounded bg-panel hover:bg-line">{r.pending ? 'Review plan' : 'View plan'}</button>}
        </div>))}
    </div>
  );
}
