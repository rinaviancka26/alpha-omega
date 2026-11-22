import { CARD } from '../card';
import { SPRITES } from '../officeAssets';
import type { AppState, Project } from '../types';

export function phase(p: Project): null | 'executing' | 'validation' | 'ready' {
  if (!p.tasks.length) return null;
  if (p.tasks.some((t) => t.status !== 'done')) return 'executing';
  if (p.tasks.some((t) => !t.verified)) return 'validation';
  return 'ready';
}

export default function Brief({ state }: { state: AppState | null }) {
  const p = state?.project;
  if (!p) return <div className="text-gray-500">No project loaded.</div>;
  const reg = state!.registry.projects.find((x) => x.slug === p.slug);
  const ph = phase(p);
  const count = (s: string) => p.tasks.filter((t) => t.status === s).length;
  const owners = [...new Set(p.tasks.map((t) => t.owner))];
  const pending = p.approvals.filter((a) => a.status === 'pending');
  const chip = { executing: 'bg-green-600', validation: 'bg-amber-500 text-black', ready: 'bg-sky-500 text-black' };
  return (
    <article className="max-w-3xl bg-panel rounded-xl border border-line p-6 space-y-4" data-testid="brief">
      <header className="flex items-center gap-3">
        <h2 className="text-2xl font-black flex-1">{reg?.name || p.slug}</h2>
        {ph && <span data-testid="phase" className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${chip[ph]}`}>{ph}</span>}
      </header>
      {p.mission?.summary && <p className="text-gray-300">{p.mission.summary}</p>}
      <section><h3 className="text-xs uppercase tracking-wider text-gray-500">Plan</h3>
        {p.plan ? <p><b>{p.plan.title}</b> <span className="text-gray-500">({p.plan.status})</span><br /><span className="text-sm text-gray-300">{p.plan.scope}</span></p> : <p className="text-gray-500">No plan yet.</p>}
      </section>
      <section><h3 className="text-xs uppercase tracking-wider text-gray-500">Progress</h3>
        <p className="text-sm">{p.tasks.length} tasks · {count('done')} done ({p.tasks.filter((t) => t.status === 'done' && t.verified).length} verified) · {count('in_progress')} in progress · {count('review')} in review · {count('blocked')} blocked · {count('planned')} planned</p>
      </section>
      <section><h3 className="text-xs uppercase tracking-wider text-gray-500">On the job</h3>
        <div className="flex gap-2 mt-1">{owners.map((o) => SPRITES[o] && <img key={o} src={SPRITES[o].portrait} title={`${o} — ${CARD.team.find((m) => m.name === o)?.role}`} className="w-9 h-9 rounded-full" style={{ background: SPRITES[o].colour + '33' }} />)}{!owners.length && <span className="text-sm text-gray-500">nobody yet</span>}</div>
      </section>
      {(pending.length > 0 || !!p.plan?.risks?.length) && <section><h3 className="text-xs uppercase tracking-wider text-gray-500">Open questions & risks</h3>
        <ul className="list-disc ml-5 text-sm">{pending.map((a) => <li key={a.id} className="text-amber-200">Approval needed: {a.title} (risk {a.risk})</li>)}{p.plan?.risks.map((r) => <li key={r}>{r}</li>)}</ul></section>}
    </article>
  );
}
