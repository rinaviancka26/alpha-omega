import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { CARD, LEAD } from '../card';
import { post } from '../lib/api';
import type { TerminalStatus } from '../lib/api';

const SID_KEY = 'alpha-omega.pty-sid';
function stableSid() {
  try {
    let sid = localStorage.getItem(SID_KEY);
    if (!sid) { sid = crypto.randomUUID().replace(/-/g, ''); localStorage.setItem(SID_KEY, sid); }
    return sid;
  } catch { return 'default'; }
}

export default function Terminal({ visible, status }: { visible: boolean; status: TerminalStatus }) {
  const host = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [conn, setConn] = useState<'connecting' | 'live' | 'down'>('connecting');
  const [note, setNote] = useState('');

  useEffect(() => {
    const term = new XTerm({ fontFamily: 'Cascadia Mono, Consolas, DejaVu Sans Mono, monospace', fontSize: 13, cursorBlink: true, scrollback: 5000,
      theme: { background: '#0b0d12', foreground: '#e5e7eb', cursor: CARD.uiAccent, selectionBackground: '#8b5cf655' } });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current!);
    fitRef.current = fit;
    const sid = stableSid();
    let closed = false, retry = 0, timer: ReturnType<typeof setTimeout> | undefined;
    const send = (m: unknown) => { const ws = wsRef.current; if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };
    const connect = () => {
      try { fit.fit(); } catch { /* hidden */ }
      setConn('connecting');
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/pty?sid=${sid}&cols=${term.cols}&rows=${term.rows}`);
      wsRef.current = ws;
      ws.onopen = () => { retry = 0; setConn('live'); send({ type: 'resize', cols: term.cols, rows: term.rows }); };
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.type === 'replay') { term.reset(); term.write(m.data); }
        else if (m.type === 'output') term.write(m.data);
        else if (m.type === 'hello') (window as unknown as { __ptyHello?: unknown }).__ptyHello = m;
        else if (m.type === 'exit') term.write(`\r\n\x1b[90m[shell exited (${m.code}) — reconnecting starts a new one]\x1b[0m\r\n`);
      };
      ws.onclose = () => {
        setConn('down');
        if (closed) return;
        timer = setTimeout(connect, Math.min(5000, 400 * 2 ** retry++));
      };
    };
    connect();
    const dataSub = term.onData((d) => send({ type: 'input', data: d }));
    const resizeSub = term.onResize(({ cols, rows }) => send({ type: 'resize', cols, rows }));
    const ro = new ResizeObserver(() => { try { fit.fit(); } catch { /* hidden */ } });
    ro.observe(host.current!);
    (window as unknown as { __term?: XTerm }).__term = term;
    return () => { closed = true; clearTimeout(timer); ro.disconnect(); dataSub.dispose(); resizeSub.dispose(); wsRef.current?.close(); term.dispose(); };
  }, []);

  useEffect(() => { if (visible) setTimeout(() => { try { fitRef.current?.fit(); } catch { /* */ } }, 50); }, [visible]);

  const launch = () => { const ws = wsRef.current; if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data: 'claude\r' })); };
  const wake = async () => {
    const r = await post<{ injected: boolean; reason?: string }>('/api/terminal/inject', {
      text: `${LEAD.name}: check the ${CARD.appName} board (.satoru) for the active project and carry on with the plan.`,
    }).catch((e) => ({ injected: false, reason: String(e.message) }));
    setNote(r.injected ? `woke ${LEAD.name}` : `not sent — ${r.reason}`);
    setTimeout(() => setNote(''), 4000);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-3 py-1 text-xs border-b border-line">
        <span data-testid="pty-conn" className={conn === 'live' ? 'text-green-400' : conn === 'connecting' ? 'text-amber-300' : 'text-red-400'}>● {conn}</span>
        <span data-testid="claude-running" className={status.claudeRunning ? 'text-green-400' : 'text-gray-500'}>{status.claudeRunning ? 'Claude running' : 'Claude not running'}</span>
        <div className="flex-1" />
        {note && <span className="text-amber-300">{note}</span>}
        <button onClick={launch} disabled={conn !== 'live' || status.claudeRunning} className="px-2 py-0.5 rounded bg-accent/80 hover:bg-accent text-white disabled:opacity-40">Launch Claude</button>
        <button onClick={wake} disabled={!status.claudeRunning} title={status.claudeRunning ? '' : 'Claude is not running in the terminal'} className="px-2 py-0.5 rounded bg-panel2 hover:bg-line disabled:opacity-40">Wake {LEAD.name}</button>
      </div>
      <div ref={host} data-testid="xterm" className="flex-1 min-h-0 px-2 py-1" />
    </div>
  );
}
