import { useEffect, useMemo, useRef, useState } from 'react';
import { CARD, LEAD } from '../card';
import { SPRITES } from '../officeAssets';
import { api, post } from '../lib/api';
import Modal from './Modal';
import type { AppState, Approval, Plan, Task } from '../types';

export const STALL_MS = 20 * 60_000;
export type NeedItem = { key: string; kind: 'plan' | 'approval' | 'blocked' | 'stalled'; label: string; approval?: Approval; task?: Task };
export type DecisionResult = { ok?: boolean; injected?: boolean; reason?: string; notice?: string; error?: string; conflicts?: { file: string; tasks: string[] }[] };

export function needsYou(state: AppState | null, now: number): NeedItem[] {
  const p = state?.project;
  if (!p) return [];
  const items: NeedItem[] = [];
  if (p.plan?.status === 'awaiting-approval') items.push({ key: 'plan', kind: 'plan', label: `Plan awaiting approval: ${p.plan.title}` });
  for (const a of p.approvals.filter((x) => x.status === 'pending')) items.push({ key: a.id, kind: 'approval', label: `Approval (${a.risk}): ${a.title}`, approval: a });
  for (const t of p.tasks.filter((x) => x.status === 'blocked')) items.push({ key: 'b-' + t.id, kind: 'blocked', label: `Blocked: ${t.title} (${t.owner})`, task: t });
  for (const t of p.tasks.filter((x) => x.status === 'in_progress')) {
    const since = Date.parse(t.started || t.updated || '');
    if (Number.isFinite(since) && now - since > STALL_MS) items.push({ key: 's-' + t.id, kind: 'stalled', label: `Stalled ${Math.round((now - since) / 60_000)}m: ${t.title} (${t.owner})`, task: t });
  }
  return items;
}

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx(); const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = 880; g.gain.value = 0.06; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.15);
    setTimeout(() => ctx.close(), 400);
  } catch { /* no audio */ }
  const w = window as unknown as { __beeps?: number }; w.__beeps = (w.__beeps || 0) + 1;
}

/** Renders nothing unless something waits for you. */
export function NeedsYouBar({ state, onOpen }: { state: AppState | null; onOpen: (i: NeedItem) => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(id); }, []);
  const items = useMemo(() => needsYou(state, now), [state, now]);
  const prev = useRef<number | null>(null);
  useEffect(() => {
    if (prev.current !== null && items.length > prev.current) beep();
    if (state) prev.current = items.length;
  }, [items.length, state]);
  if (!items.length) return null;
  return (
    <div data-testid="needs-you" className="shrink-0 flex items-center gap-2 px-4 py-1.5 bg-amber-500/15 border-b border-amber-500/50 text-sm overflow-x-auto">
      <span className="ao-pulse w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
      <b className="text-amber-300 shrink-0">Needs you ({items.length})</b>
      {items.map((i) => (
        <button key={i.key} data-need={i.kind} onClick={() => onOpen(i)} className={`shrink-0 px-2 py-0.5 rounded border text-xs ${i.kind === 'blocked' ? 'border-red-500/60 text-red-300' : 'border-amber-500/60 text-amber-200'} hover:bg-white/5`}>{i.label}</button>
      ))}
    </div>
  );
}

const Portrait = ({ name, size = 28 }: { name: string; size?: number }) => SPRITES[name]
  ? <img src={SPRITES[name].portrait} title={name} className="rounded-full" style={{ width: size, height: size, background: SPRITES[name].colour + '33' }} />
  : <span className="text-xs text-red-400" title="not on the card">?{name}</span>;

export function PlanModal({ slug, plan, onClose, onDone, readOnly }: { slug: string; plan: Plan; onClose: () => void; onDone: (r: DecisionResult) => void; readOnly?: boolean }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [conflicts, setConflicts] = useState<{ file: string; tasks: string[] }[]>([]);
  const [err, setErr] = useState('');
  useEffect(() => { api<{ conflicts: { file: string; tasks: string[] }[] }>(`/api/projects/${slug}/plan/conflicts`).then((r) => setConflicts(r.conflicts)).catch(() => undefined); }, [slug, plan]);
  const decide = async (decision: 'approve' | 'changes' | 'reject') => {
    if (decision === 'changes' && !note.trim()) { setErr('Write a note saying what to change.'); return; }
    setBusy(true); setErr('');
    try { onDone(await post<DecisionResult>(`/api/projects/${slug}/plan/decision`, { decision, note })); onClose(); }
    catch (e) { const b = (e as { body?: DecisionResult }).body; if (b?.conflicts) setConflicts(b.conflicts); setErr(b?.error || String((e as Error).message)); }
    finally { setBusy(false); }
  };
  const conflictFiles = new Set(conflicts.map((c) => c.file));
  return (
    <Modal onClose={onClose} wide>
      <div data-testid="plan-modal">
        <div className="text-xs uppercase tracking-wider text-gray-500">Plan · {plan.status}</div>
        <h2 className="text-xl font-bold mb-1">{plan.title}</h2>
        <p className="text-sm text-gray-300 whitespace-pre-wrap">{plan.scope}</p>
        <div className="mt-3 text-xs uppercase tracking-wider text-gray-500">Tasks</div>
        <ul className="mt-1 space-y-1.5">
          {plan.tasks.map((t) => (
            <li key={t.id} className="flex gap-2 items-start bg-panel2 rounded p-2">
              <Portrait name={t.owner} />
              <div className="min-w-0">
                <div className="text-sm"><b>{t.id}</b> {t.title} <span className="text-gray-500">— {t.owner}</span></div>
                <div className="text-xs text-gray-400 flex flex-wrap gap-1">{t.files.map((f) => <code key={f} className={`px-1 rounded ${conflictFiles.has(f.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase()) ? 'bg-red-500/30 text-red-200' : 'bg-black/30'}`}>{f}</code>)}</div>
              </div>
            </li>))}
        </ul>
        {!!plan.risks?.length && <><div className="mt-3 text-xs uppercase tracking-wider text-gray-500">Risks</div><ul className="list-disc ml-5 text-sm text-amber-200">{plan.risks.map((r) => <li key={r}>{r}</li>)}</ul></>}
        {conflicts.length > 0 && <div data-testid="plan-conflict" className="mt-3 p-2 rounded border border-red-500/60 bg-red-500/10 text-sm text-red-200">⚠ File conflict — {conflicts.map((c) => `${c.file} is claimed by ${c.tasks.join(' and ')}`).join('; ')}. Approve is disabled until the plan is fixed.</div>}
        {plan.note && <div className="mt-2 text-sm text-gray-400">Note: {plan.note}</div>}
        {!readOnly && plan.status === 'awaiting-approval' && <>
          <textarea data-testid="plan-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (required for Request changes)" className="mt-3 w-full h-16 bg-panel2 rounded p-2 text-sm" />
          {err && <div className="text-sm text-red-400 mt-1">{err}</div>}
          <div className="flex gap-2 mt-2">
            <button data-testid="plan-approve" disabled={busy || conflicts.length > 0} onClick={() => decide('approve')} className="px-3 py-1.5 rounded bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed">Approve & start</button>
            <button data-testid="plan-changes" disabled={busy} onClick={() => decide('changes')} className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-40">Request changes</button>
            <button data-testid="plan-reject" disabled={busy} onClick={() => decide('reject')} className="px-3 py-1.5 rounded bg-red-700 hover:bg-red-600 disabled:opacity-40">Reject</button>
          </div>
        </>}
      </div>
    </Modal>
  );
}

export function ApprovalCard({ slug, a, onDone }: { slug: string; a: Approval; onDone: (r: DecisionResult) => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const decide = async (decision: 'approve' | 'reject' | 'discuss') => {
    setBusy(true);
    try { onDone(await post<DecisionResult>(`/api/projects/${slug}/approvals/${a.id}`, { decision, note })); }
    catch (e) { onDone({ error: String((e as Error).message) }); }
    finally { setBusy(false); }
  };
  const riskCls = a.risk === 'high' ? 'bg-red-600' : a.risk === 'med' ? 'bg-amber-600' : 'bg-green-700';
  return (
    <div data-testid={`approval-${a.id}`} className="rounded-lg border border-line bg-panel2 p-3">
      <div className="flex items-center gap-2"><span className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${riskCls}`}>risk: {a.risk}</span><b className="flex-1">{a.title}</b><span className="text-xs text-gray-500">{a.id}</span></div>
      <div className="text-sm text-gray-300 mt-1">{a.reason}</div>
      {a.status === 'pending' ? <>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="mt-2 w-full bg-panel rounded p-1.5 text-sm" />
        <div className="flex gap-2 mt-2">
          <button disabled={busy} onClick={() => decide('approve')} className="px-3 py-1 rounded bg-green-600 hover:bg-green-500 disabled:opacity-40">Approve</button>
          <button disabled={busy} onClick={() => decide('reject')} className="px-3 py-1 rounded bg-red-700 hover:bg-red-600 disabled:opacity-40">Reject</button>
          <button disabled={busy} onClick={() => decide('discuss')} className="px-3 py-1 rounded bg-panel hover:bg-line disabled:opacity-40">Discuss</button>
        </div>
      </> : <div className="text-sm mt-1 text-gray-400">{a.status}{a.note ? ` — ${a.note}` : ''}</div>}
    </div>
  );
}

export function ApprovalModal({ slug, a, onClose, onDone }: { slug: string; a: Approval; onClose: () => void; onDone: (r: DecisionResult) => void }) {
  return <Modal onClose={onClose}><div className="text-xs uppercase tracking-wider text-gray-500 mb-2">Approval requested by {a.agent || LEAD.name}</div><ApprovalCard slug={slug} a={a} onDone={(r) => { onDone(r); onClose(); }} /></Modal>;
}

/** Message shown after a decision: injected into Claude, or a quiet notice to tell the lead yourself. */
export function decisionMessage(r: DecisionResult) {
  if (r.error) return { tone: 'error' as const, text: r.error };
  if (r.injected) return { tone: 'ok' as const, text: `Sent to ${LEAD.name} in the terminal.` };
  return { tone: 'quiet' as const, text: r.notice || `no live terminal — tell ${LEAD.name} yourself` };
}
export const appName = CARD.appName;
