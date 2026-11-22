import { SPRITES } from '../officeAssets';
import { timeAgo } from '../lib/sentences';
import type { AppState, TaskStatus } from '../types';

const COLS: { key: TaskStatus; label: string; cls: string }[] = [
  { key: 'planned', label: 'Planned', cls: 'border-gray-600' },
  { key: 'in_progress', label: 'In progress', cls: 'border-green-500' },
  { key: 'review', label: 'Review', cls: 'border-violet-400' },
  { key: 'blocked', label: 'Blocked', cls: 'border-red-500' },
  { key: 'done', label: 'Done', cls: 'border-sky-400' },
];

export default function Tasks({ state }: { state: AppState | null }) {
  const p = state?.project;
  if (!p) return <div className="text-gray-500">No project loaded.</div>;
  const now = Date.now();
  return (
    <div className="grid grid-cols-5 gap-3 h-full min-h-0" data-testid="tasks-board">
      {COLS.map((c) => {
        const list = p.tasks.filter((t) => t.status === c.key);
        return (
          <div key={c.key} data-col={c.key} className={`bg-panel rounded-lg border-t-4 ${c.cls} p-2 flex flex-col min-h-0`}>
            <div className="text-xs uppercase tracking-wider text-gray-400 mb-2">{c.label} <span className="text-gray-600">{list.length}</span></div>
            <div className="space-y-2 overflow-auto">
              {list.map((t) => (
                <div key={t.id} data-task={t.id} className="bg-panel2 rounded p-2 text-sm">
                  <div className="flex items-start gap-2">
                    {SPRITES[t.owner] ? <img src={SPRITES[t.owner].portrait} className="w-7 h-7 rounded-full shrink-0" style={{ background: SPRITES[t.owner].colour + '33' }} title={t.owner} /> : <span className="text-xs text-red-400">?{t.owner}</span>}
                    <div className="min-w-0 flex-1"><b className="text-gray-400 mr-1">{t.id}</b>{t.title}</div>
                  </div>
                  {t.status === 'done' && (t.verified ? <div data-verify="ok" className="text-xs text-green-400 mt-1">✓ verified</div> : <div data-verify="unverified" className="text-xs text-amber-300 mt-1">⚠ unverified</div>)}
                  {t.note && <div className="text-xs text-gray-400 mt-1">{t.note}</div>}
                  {!!t.files?.length && <div className="text-[10px] text-gray-500 mt-1 truncate" title={t.files.join(', ')}>{t.files.join(', ')}</div>}
                  {(t.updated || t.started) && <div className="text-[10px] text-gray-600 mt-0.5">{timeAgo(t.updated || t.started, now)}</div>}
                </div>))}
            </div>
          </div>);
      })}
    </div>
  );
}
