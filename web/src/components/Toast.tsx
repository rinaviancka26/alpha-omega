import { useEffect } from 'react';
export type ToastMsg = { id: number; tone: 'ok' | 'quiet' | 'error' | 'info'; text: string };
export default function Toasts({ items, onExpire }: { items: ToastMsg[]; onExpire: (id: number) => void }) {
  useEffect(() => { const ts = items.map((t) => setTimeout(() => onExpire(t.id), 5000)); return () => ts.forEach(clearTimeout); }, [items, onExpire]);
  return (
    <div className="fixed right-4 bottom-4 z-[1100] flex flex-col gap-2">
      {items.map((t) => (
        <div key={t.id} data-testid="toast" data-tone={t.tone} className={`ao-pop px-3 py-2 rounded-lg text-sm shadow-xl border ${t.tone === 'ok' ? 'bg-green-900/90 border-green-500/50' : t.tone === 'error' ? 'bg-red-900/90 border-red-500/50' : t.tone === 'info' ? 'bg-accent/30 border-accent' : 'bg-panel2/95 border-line text-gray-300'}`}>{t.text}</div>
      ))}
    </div>
  );
}
