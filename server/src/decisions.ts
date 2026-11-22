// Plan + approval decisions. Written with lockedUpdateJson; the lead is told via the terminal bridge.
import type express from 'express';
import * as L from './lib.ts';
import { inject } from './pty.ts';

export function planConflicts(plan: L.Plan | null) {
  const byFile = new Map<string, string[]>();
  for (const t of plan?.tasks ?? []) for (const f of t.files ?? []) {
    const k = f.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
    byFile.set(k, [...(byFile.get(k) || []), t.id]);
  }
  return [...byFile].filter(([, ids]) => ids.length > 1).map(([file, tasks]) => ({ file, tasks }));
}

async function tell(text: string) {
  const r = await inject(text).catch((e) => ({ injected: false, reason: String(e?.message || e) }));
  const lead = L.card().team[0].name;
  return r.injected ? { injected: true } : { injected: false, reason: r.reason, notice: `no live terminal — tell ${lead} yourself` };
}

export function mountDecisions(app: express.Express, wrap: (fn: (req: express.Request, res: express.Response) => Promise<unknown>) => express.RequestHandler) {
  const slugOk = async (slug: string) => L.SLUG_RE.test(slug) && (await L.getRegistry()).projects.some((p) => p.slug === slug);

  app.get('/api/projects/:slug/plan/conflicts', wrap(async (req, res) => {
    const slug = String(req.params.slug);
    if (!(await slugOk(slug))) { res.status(404).json({ error: 'unknown project' }); return; }
    res.json({ conflicts: planConflicts(await L.readJson<L.Plan | null>(L.P.file(slug, 'plan'), null)) });
  }));

  app.post('/api/projects/:slug/plan/decision', wrap(async (req, res) => {
    const slug = String(req.params.slug);
    const decision = String(req.body?.decision || '');
    const note = typeof req.body?.note === 'string' ? req.body.note.slice(0, 2000) : '';
    const status = ({ approve: 'approved', changes: 'changes-requested', reject: 'rejected' } as Record<string, L.Plan['status'] | undefined>)[decision];
    if (!status) { res.status(400).json({ error: 'decision must be approve | changes | reject' }); return; }
    if (!(await slugOk(slug))) { res.status(404).json({ error: 'unknown project' }); return; }
    if (status === 'changes-requested' && !note.trim()) { res.status(400).json({ error: 'a note is required when requesting changes' }); return; }
    let conflict: ReturnType<typeof planConflicts> = [];
    let missing = false, notWaiting = false;
    const plan = await L.lockedUpdateJson<L.Plan | null>(L.P.file(slug, 'plan'), (p) => {
      if (!p) { missing = true; return undefined; }
      if (p.status !== 'awaiting-approval') { notWaiting = true; return undefined; }
      if (status === 'approved') { conflict = planConflicts(p); if (conflict.length) return undefined; }
      return { ...p, status, decidedAt: new Date().toISOString(), note: note || undefined };
    }, null);
    if (missing) { res.status(404).json({ error: 'no plan' }); return; }
    if (notWaiting) { res.status(409).json({ error: `plan is ${plan?.status}, not awaiting approval` }); return; }
    if (conflict.length) { res.status(409).json({ error: 'two tasks claim the same file', conflicts: conflict }); return; }
    const app = L.card().appName;
    await L.appendEvent(L.SATORU_DIR, { type: 'note', agent: null, project: slug, payload: { text: `Plan ${status} in ${app}: ${plan!.title}${note ? ` — ${note}` : ''}`, decision: 'plan', status } });
    const text = status === 'approved' ? `Plan approved in ${app}: ${plan!.title}. Proceed.`
      : status === 'changes-requested' ? `Plan changes requested in ${app}: ${plan!.title}. Note: ${note}`
      : `Plan rejected in ${app}: ${plan!.title}.${note ? ` Note: ${note}` : ''} Do not proceed.`;
    res.json({ ok: true, plan, ...(await tell(text)) });
  }));

  app.post('/api/projects/:slug/approvals/:id', wrap(async (req, res) => {
    const slug = String(req.params.slug), id = String(req.params.id);
    const decision = String(req.body?.decision || '');
    const note = typeof req.body?.note === 'string' ? req.body.note.slice(0, 2000) : '';
    const status = ({ approve: 'approved', reject: 'rejected', discuss: 'discuss' } as Record<string, L.Approval['status'] | undefined>)[decision];
    if (!status) { res.status(400).json({ error: 'decision must be approve | reject | discuss' }); return; }
    if (!(await slugOk(slug))) { res.status(404).json({ error: 'unknown project' }); return; }
    let found: L.Approval | null = null;
    await L.lockedUpdateJson<{ approvals: L.Approval[] }>(L.P.file(slug, 'approvals'), (d) => {
      const list = d.approvals || [];
      const i = list.findIndex((a) => a.id === id);
      if (i < 0) return undefined;
      found = { ...list[i], status, decidedAt: new Date().toISOString(), note: note || undefined };
      return { approvals: list.map((a, k) => (k === i ? found! : a)) };
    }, { approvals: [] });
    if (!found) { res.status(404).json({ error: 'no such approval' }); return; }
    const a = found as L.Approval;
    const app = L.card().appName;
    await L.appendEvent(L.SATORU_DIR, { type: 'note', agent: null, project: slug, payload: { text: `Approval ${a.id} ${status} in ${app}: ${a.title}${note ? ` — ${note}` : ''}`, decision: 'approval', approval: a.id, status } });
    const verb = status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'needs discussion';
    const text = `Approval ${a.id} ${verb} in ${app}: ${a.title}.${note ? ` Note: ${note.trim().replace(/[.!\s]+$/, '')}.` : ''}${status === 'approved' ? ' Proceed.' : status === 'rejected' ? ' Do not proceed.' : ' Let us talk it through before acting.'}`;
    res.json({ ok: true, approval: a, ...(await tell(text)) });
  }));
}
