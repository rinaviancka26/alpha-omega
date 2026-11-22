import { useEffect, useState } from 'react';
import { LEAD } from '../card';
import { api, post, type TerminalStatus } from '../lib/api';
import type { AppState } from '../types';

type Row = { slug: string; name: string; path: string; active: boolean; exists: boolean; git: boolean; branch: string | null; dirty: boolean | null };
type Res = { ok?: boolean; injected?: boolean; notice?: string; project?: { name: string } };

export default function Projects({ state, term, onSwitched, onError }: { state: AppState | null; term: TerminalStatus; onSwitched: (name: string, r: Res) => void; onError: (msg: string) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [root, setRoot] = useState('');
  const [gitOk, setGitOk] = useState(true);
  const [newName, setNewName] = useState('');
  const [addPath, setAddPath] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => api<{ projects: Row[]; projectsRoot: string; gitAvailable: boolean }>('/api/projects').then((r) => { setRows(r.projects); setRoot(r.projectsRoot); setGitOk(r.gitAvailable); }).catch(() => undefined);
  useEffect(() => { load(); }, [state?.registry, state?.activeProject]);
  const live = term.claudeRunning;
  const gateTip = live ? '' : `Start Claude in the terminal first (Launch Claude) — ${LEAD.name} needs to hear about the switch.`;
  const act = async (fn: () => Promise<Res>) => {
    setBusy(true);
    try { const r = await fn(); onSwitched(r.project?.name || '', r); load(); }
    catch (e) { onError(String((e as { body?: { error?: string } }).body?.error || (e as Error).message)); }
    finally { setBusy(false); }
  };
  return (
    <div className="max-w-4xl space-y-4" data-testid="projects">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">+ New project <span className="text-gray-600">(created under {root || '…'})</span></label>
          <div className="flex gap-2">
            <input data-testid="new-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Project name" className="bg-panel2 rounded px-2 py-1.5 text-sm w-56" />
            <span title={gateTip}><button data-testid="new-btn" disabled={!live || busy || !newName.trim()} onClick={() => act(() => post('/api/projects/new', { name: newName }))} className="px-3 py-1.5 rounded bg-accent disabled:opacity-40 disabled:cursor-not-allowed">Create</button></span>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">+ Add existing folder <span className="text-gray-600">(never modified)</span></label>
          <div className="flex gap-2">
            <input data-testid="add-path" value={addPath} onChange={(e) => setAddPath(e.target.value)} placeholder="C:\path\to\folder" className="bg-panel2 rounded px-2 py-1.5 text-sm w-72" />
            <button data-testid="add-btn" disabled={busy || !addPath.trim()} onClick={() => act(() => post('/api/projects/add', { path: addPath }))} className="px-3 py-1.5 rounded bg-panel2 hover:bg-line disabled:opacity-40">Add</button>
          </div>
        </div>
      </div>
      {!live && <div data-testid="gate-note" className="text-xs text-amber-300">Load and New are disabled until Claude is running in the terminal.</div>}
      {!gitOk && <div className="text-xs text-gray-400">Git was not found — branches are not shown and new projects are created without <code>git init</code>.</div>}
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-gray-500"><th className="py-1">Project</th><th>Folder</th><th>Branch</th><th>State</th><th /></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.slug} data-project={p.slug} className={`border-t border-line ${p.active ? 'bg-accent/10' : ''}`}>
              <td className="py-2"><b>{p.name}</b> <span className="text-xs text-gray-500">{p.slug}</span>{p.active && <span className="ml-2 text-xs text-accent">● active</span>}</td>
              <td className="text-xs text-gray-400 max-w-[260px] truncate" title={p.path}>{p.path}</td>
              <td className="text-xs">{!p.exists ? <span className="text-red-400">missing</span> : p.git ? p.branch : <span className="text-gray-500">no git</span>}</td>
              <td className="text-xs">{p.dirty === null ? '—' : p.dirty ? <span className="text-amber-300">dirty</span> : <span className="text-green-400">clean</span>}</td>
              <td className="text-right"><span title={gateTip}><button data-load={p.slug} disabled={!live || busy || p.active} onClick={() => act(() => post('/api/projects/load', { slug: p.slug }))} className="px-2 py-1 rounded bg-panel2 hover:bg-line disabled:opacity-40 disabled:cursor-not-allowed">{p.active ? 'Loaded' : 'Load'}</button></span></td>
            </tr>))}
          {!rows.length && <tr><td colSpan={5} className="py-6 text-center text-gray-500">No projects yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
