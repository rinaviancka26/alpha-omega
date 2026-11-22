// Projects: registry listing with live git status, load, create, add existing.
import type express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import * as L from './lib.ts';
import { inject } from './pty.ts';

const run = (cmd: string, args: string[], cwd?: string) => new Promise<{ ok: boolean; out: string }>((resolve) =>
  execFile(cmd, args, { cwd, timeout: 5000, windowsHide: true }, (err, stdout) => resolve({ ok: !err, out: String(stdout || '').trim() })));

export async function gitInfo(dir: string) {
  if (!fs.existsSync(dir)) return { exists: false, git: false as const, branch: null, dirty: null };
  const b = await run('git', ['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD']);
  if (!b.ok) {
    const inside = await run('git', ['-C', dir, 'rev-parse', '--is-inside-work-tree']);
    if (!inside.ok) return { exists: true, git: false as const, branch: null, dirty: null };
  }
  const st = await run('git', ['-C', dir, 'status', '--porcelain']);
  return { exists: true, git: true as const, branch: b.ok ? b.out : '(no commits)', dirty: st.ok ? st.out.length > 0 : null };
}
export function expandHome(p: string) { return p === '~' ? os.homedir() : p.startsWith('~/') || p.startsWith('~\\') ? path.join(os.homedir(), p.slice(2)) : p; }
export async function projectsRoot() { const c = await L.getConfig(); return path.resolve(expandHome(c.projectsRoot || '~/alpha-omega-projects')); }
export const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63) || 'project';

async function activate(slug: string) {
  await L.lockedUpdateJson<L.Config>(L.P.config(), (c) => ({ ...c, activeProject: slug }), { activeProject: null });
  const reg = await L.getRegistry();
  const p = reg.projects.find((x) => x.slug === slug)!;
  const c = L.card();
  await L.appendEvent(L.SATORU_DIR, { type: 'note', agent: null, project: slug, payload: { text: `Now working on ${p.name}` } });
  const r = await inject(`${c.appName}: switch to project "${p.name}" at ${p.path} (slug ${slug}). Put "🎬 @${slug}" on its own line in your reply, then read .satoru/projects/${slug}/ for its board.`).catch(() => ({ injected: false, reason: 'inject failed' }));
  return { project: p, injected: r.injected, ...(r.injected ? {} : { notice: `no live terminal — tell ${c.team[0].name} yourself` }) };
}

export function mountProjects(app: express.Express, wrap: (fn: (req: express.Request, res: express.Response) => Promise<unknown>) => express.RequestHandler) {
  app.get('/api/projects', wrap(async (_req, res) => {
    const [reg, config, root] = await Promise.all([L.getRegistry(), L.getConfig(), projectsRoot()]);
    const projects = await Promise.all(reg.projects.map(async (p) => ({ ...p, active: p.slug === config.activeProject, ...(await gitInfo(p.path)) })));
    res.json({ projects, projectsRoot: root, gitAvailable: (await run('git', ['--version'])).ok });
  }));

  app.post('/api/projects/load', wrap(async (req, res) => {
    const slug = String(req.body?.slug || '');
    const reg = await L.getRegistry();
    if (!reg.projects.some((p) => p.slug === slug)) { res.status(404).json({ error: `unknown project "${slug}"` }); return; }
    res.json({ ok: true, ...(await activate(slug)) });
  }));

  app.post('/api/projects/new', wrap(async (req, res) => {
    const name = String(req.body?.name || '').trim().slice(0, 80);
    if (!name) { res.status(400).json({ error: 'name required' }); return; }
    const slug = slugify(name);
    const root = await projectsRoot();
    const dir = path.join(root, slug);
    const reg = await L.getRegistry();
    if (reg.projects.some((p) => p.slug === slug)) { res.status(409).json({ error: `a project with slug "${slug}" is already registered` }); return; }
    if (fs.existsSync(dir)) { res.status(409).json({ error: `folder already exists: ${dir} — nothing was changed` }); return; }
    fs.mkdirSync(root, { recursive: true });
    fs.mkdirSync(dir); // not recursive: fails if it raced into existence — never overwrite
    fs.writeFileSync(path.join(dir, 'README.md'), `# ${name}\n\nCreated by ${L.card().appName}.\n`, { encoding: 'utf8', flag: 'wx' });
    const g = await run('git', ['init', '-q'], dir);
    await L.lockedUpdateJson<L.Registry>(L.P.registry(), (r) => ({ projects: [...(r.projects || []), { slug, name, path: dir }] }), { projects: [] });
    res.json({ ok: true, slug, path: dir, gitInit: g.ok, ...(await activate(slug)) });
  }));

  app.post('/api/projects/add', wrap(async (req, res) => {
    const raw = String(req.body?.path || '').trim();
    if (!raw) { res.status(400).json({ error: 'path required' }); return; }
    const dir = path.resolve(expandHome(raw));
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) { res.status(400).json({ error: `folder does not exist: ${dir}` }); return; }
    const reg = await L.getRegistry();
    const same = reg.projects.find((p) => path.resolve(p.path) === dir);
    if (same) { res.status(409).json({ error: `already registered as "${same.slug}"` }); return; }
    let slug = slugify(path.basename(dir)); let n = 2;
    while (reg.projects.some((p) => p.slug === slug)) slug = `${slugify(path.basename(dir)).slice(0, 58)}-${n++}`;
    await L.lockedUpdateJson<L.Registry>(L.P.registry(), (r) => ({ projects: [...(r.projects || []), { slug, name: path.basename(dir), path: dir }] }), { projects: [] });
    res.json({ ok: true, slug, path: dir, ...(await activate(slug)) }); // the folder itself is never modified
  }));
}
