// Embedded terminal: PTY sessions keyed by a stable client sid.
// Socket close DETACHES (never kills). Kill only on explicit {"type":"kill"} or server stop.
import type http from 'node:http';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { WebSocketServer, type WebSocket } from 'ws';
import * as pty from 'node-pty';
import { REPO_ROOT } from './paths.ts';

const SCROLLBACK_BYTES = 200 * 1024;

type Session = { sid: string; proc: pty.IPty; buf: string; sockets: Set<WebSocket>; lastUsed: number; exited: boolean; cols: number; rows: number };
const sessions = new Map<string, Session>();

export function shellCommand(): { file: string; args: string[] } {
  if (process.platform === 'win32') return { file: 'powershell.exe', args: ['-NoLogo'] };
  return { file: process.env.SHELL || 'bash', args: ['-l'] };
}

function spawnSession(sid: string, cols = 120, rows = 30): Session {
  const { file, args } = shellCommand();
  const proc = pty.spawn(file, args, {
    name: 'xterm-256color', cols, rows, cwd: REPO_ROOT,
    env: { ...process.env, TERM: 'xterm-256color', ALPHA_OMEGA_TERMINAL: '1' } as Record<string, string>,
  });
  const s: Session = { sid, proc, buf: '', sockets: new Set(), lastUsed: Date.now(), exited: false, cols, rows };
  proc.onData((d) => {
    s.buf += d;
    if (s.buf.length > SCROLLBACK_BYTES) s.buf = s.buf.slice(s.buf.length - SCROLLBACK_BYTES);
    for (const ws of s.sockets) if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'output', data: d }));
  });
  proc.onExit(({ exitCode }) => {
    s.exited = true;
    for (const ws of s.sockets) if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'exit', code: exitCode }));
    sessions.delete(sid);
  });
  sessions.set(sid, s);
  return s;
}

export function attachPty(server: http.Server) {
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname !== '/pty') return; // let other upgrade handlers (none) / default close
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
  wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const sid = (url.searchParams.get('sid') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    if (!sid) { ws.close(1008, 'sid required'); return; }
    const cols = Number(url.searchParams.get('cols')) || 120, rows = Number(url.searchParams.get('rows')) || 30;
    let s = sessions.get(sid);
    const reattached = !!s;
    if (!s) s = spawnSession(sid, cols, rows);
    s.sockets.add(ws);
    ws.send(JSON.stringify({ type: 'hello', sid, reattached, pid: s.proc.pid }));
    if (s.buf) ws.send(JSON.stringify({ type: 'replay', data: s.buf }));
    const sess = s;
    ws.on('message', (raw) => {
      let msg: { type?: string; data?: string; cols?: number; rows?: number };
      try { msg = JSON.parse(String(raw)); } catch { return; }
      if (msg.type === 'input' && typeof msg.data === 'string') { sess.proc.write(msg.data); sess.lastUsed = Date.now(); }
      else if (msg.type === 'resize' && msg.cols && msg.rows) {
        const c = Math.max(10, Math.min(500, Math.floor(msg.cols))), r = Math.max(4, Math.min(200, Math.floor(msg.rows)));
        if (c !== sess.cols || r !== sess.rows) { try { sess.proc.resize(c, r); sess.cols = c; sess.rows = r; } catch { /* exited */ } }
      } else if (msg.type === 'kill') { killSession(sid); }
    });
    ws.on('close', () => { sess.sockets.delete(ws); }); // detach only — the shell keeps running
  });
  const stop = () => { for (const sid of [...sessions.keys()]) killSession(sid); };
  process.once('exit', stop);
  for (const sig of ['SIGINT', 'SIGTERM'] as const) process.once(sig, () => { stop(); process.exit(0); });
  return wss;
}

export function killSession(sid: string) {
  const s = sessions.get(sid);
  if (!s) return false;
  try { s.proc.kill(); } catch { /* already gone */ }
  sessions.delete(sid);
  return true;
}

export function mostRecentSession(): Session | undefined {
  let best: Session | undefined;
  for (const s of sessions.values()) if (!best || s.lastUsed > best.lastUsed) best = s;
  return best;
}

// ---------- is Claude running inside a PTY? ----------
type Proc = { pid: number; ppid: number; name: string; args: string };
function listProcesses(): Promise<Proc[]> {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      execFile('powershell.exe', ['-NoProfile', '-Command',
        'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId)`t$($_.ParentProcessId)`t$($_.Name)`t$($_.CommandLine)" }'],
      { windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: 8000 }, (err, out) => {
        if (err) return resolve([]);
        resolve(out.split(/\r?\n/).filter(Boolean).map((l) => { const [pid, ppid, name, ...rest] = l.split('\t'); return { pid: +pid, ppid: +ppid, name: name || '', args: rest.join('\t') }; }));
      });
    } else {
      execFile('ps', ['-A', '-o', 'pid=,ppid=,comm=,args='], { maxBuffer: 8 * 1024 * 1024, timeout: 5000 }, (err, out) => {
        if (err) return resolve([]);
        resolve(out.split('\n').filter(Boolean).map((l) => {
          const m = l.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/);
          return m ? { pid: +m[1], ppid: +m[2], name: m[3], args: m[4] } : { pid: 0, ppid: 0, name: '', args: '' };
        }));
      });
    }
  });
}
export const isClaudeProc = (p: Proc) =>
  /^claude(\.exe)?$/i.test(p.name.split(/[\\/]/).pop() || '') ||
  (/^node(\.exe)?$/i.test(p.name.split(/[\\/]/).pop() || '') && /claude-code|[\\/]claude(\.js|\.cmd)?(\s|$)/i.test(p.args));

let cache: { at: number; value: Map<number, boolean> } = { at: 0, value: new Map() };
async function claudeUnder(pids: number[]): Promise<Map<number, boolean>> {
  if (Date.now() - cache.at < 1500) return cache.value;
  const procs = await listProcesses();
  const children = new Map<number, Proc[]>();
  for (const p of procs) { if (!children.has(p.ppid)) children.set(p.ppid, []); children.get(p.ppid)!.push(p); }
  const res = new Map<number, boolean>();
  for (const root of pids) {
    let found = false;
    const stack = [...(children.get(root) || [])];
    const seen = new Set<number>();
    while (stack.length && !found) {
      const p = stack.pop()!;
      if (seen.has(p.pid)) continue; seen.add(p.pid);
      if (isClaudeProc(p)) found = true;
      stack.push(...(children.get(p.pid) || []));
    }
    res.set(root, found);
  }
  cache = { at: Date.now(), value: res };
  return res;
}

export async function terminalStatus() {
  const list = [...sessions.values()];
  const attached = list.some((s) => s.sockets.size > 0);
  const recent = mostRecentSession();
  const map = await claudeUnder(list.map((s) => s.proc.pid));
  return { attached, sessions: list.length, claudeRunning: recent ? !!map.get(recent.proc.pid) : false };
}

export async function inject(text: string): Promise<{ injected: boolean; reason?: string }> {
  const s = mostRecentSession();
  if (!s) return { injected: false, reason: 'no terminal session' };
  cache.at = 0; // fresh check
  const map = await claudeUnder([s.proc.pid]);
  if (!map.get(s.proc.pid)) return { injected: false, reason: 'Claude is not running in the terminal' };
  const clean = text.replace(/[\r\n]+/g, ' ').slice(0, 2000);
  s.proc.write(clean);
  setTimeout(() => { try { s.proc.write('\r'); } catch { /* gone */ } }, 150);
  s.lastUsed = Date.now();
  return { injected: true };
}
export const _sessions = sessions;
export const hostname = os.hostname;
