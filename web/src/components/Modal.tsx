import type { ReactNode } from 'react';
export default function Modal({ onClose, children, wide }: { onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[1000] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" className={`bg-panel border border-accent/60 rounded-xl shadow-2xl ${wide ? 'w-[760px]' : 'w-[560px]'} max-w-full max-h-[90vh] overflow-auto p-5 relative`} onClick={(e) => e.stopPropagation()}>
        <button aria-label="close" onClick={onClose} className="absolute right-3 top-2 text-gray-400 hover:text-white text-xl">×</button>
        {children}
      </div>
    </div>
  );
}
