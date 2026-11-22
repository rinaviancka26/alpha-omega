// Shared, dependency-free file I/O for .satoru/ — used by the server AND hooks/telemetry.mjs.
// Conventions: atomic writes (temp + rename), <file>.lock opened 'wx' (retry ~2 s, stale after 10 s),
// explicit UTF-8, secrets redacted before anything is written.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const LOCK_TIMEOUT_MS = 2000;
export const LOCK_STALE_MS = 10_000;

// ---------- redaction ----------
const PATTERNS = [
  [/\bsk-[A-Za-z0-9_-]{8,}/g, 'sk-[REDACTED]'],
  [/\b(gh[pousr]_)[A-Za-z0-9]{16,}/g, '$1[REDACTED]'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, 'github_pat_[REDACTED]'],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, 'xox-[REDACTED]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, 'AKIA[REDACTED]'],
  [/(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, '$1[REDACTED]'],
  [/((?:password|passwd|pwd|secret|token|api[_-]?key)\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s&"',;]+)/gi, '$1[REDACTED]'],
  [/\b[0-9a-fA-F]{32,}\b/g, '[REDACTED-HEX]'],
  [/(?<![A-Za-z0-9+/=_-])(?=[A-Za-z0-9+/_-]*[0-9])(?=[A-Za-z0-9+/_-]*[A-Z])(?=[A-Za-z0-9+/_-]*[a-z])[A-Za-z0-9+/_-]{40,}={0,2}(?![A-Za-z0-9+/=_-])/g, '[REDACTED-B64]'],
];
export function redactString(s) {
  let out = s;
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep);
  return out;
}
/** Deep-redact any JSON-able value (strings only; keys kept). */
export function redact(v) {
  if (typeof v === 'string') return redactString(v);
  if (Array.isArray(v)) return v.map(redact);
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = redact(x); return o; }
  return v;
}

// ---------- JSON ----------
/** Read JSON; retry twice on torn/partial reads, then return the fallback. */
export async function readJson(file, fallback = null) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const txt = await fsp.readFile(file, 'utf8');
      return JSON.parse(txt.replace(/^\uFEFF/, ''));
    } catch (e) {
      if (e && e.code === 'ENOENT') return fallback;
      if (attempt < 2) await sleep(25 + attempt * 25);
    }
  }
  return fallback;
}
/** Atomic write: temp file in the same dir, then rename. Always UTF-8, always redacted. */
export async function writeJson(file, data) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(redact(data), null, 2) + '\n', { encoding: 'utf8' });
  for (let i = 0; ; i++) {
    try { await fsp.rename(tmp, file); return; } catch (e) {
      // Windows: rename can fail transiently with EPERM/EBUSY while a reader has the file open.
      if (i < 10 && e && (e.code === 'EPERM' || e.code === 'EBUSY' || e.code === 'EACCES')) { await sleep(15 * (i + 1)); continue; }
      try { await fsp.unlink(tmp); } catch { /* ignore */ }
      throw e;
    }
  }
}

// ---------- locking ----------
const inProcess = new Map(); // file -> tail promise (serialises same-process writers before the cross-process lock)
async function acquire(lock) {
  const start = Date.now();
  for (;;) {
    try {
      const fd = fs.openSync(lock, 'wx');
      fs.writeSync(fd, `${process.pid} ${new Date().toISOString()}`);
      fs.closeSync(fd);
      return;
    } catch (e) {
      if (!e || e.code !== 'EEXIST') throw e;
      try {
        const st = fs.statSync(lock);
        if (Date.now() - st.mtimeMs > LOCK_STALE_MS) { try { fs.unlinkSync(lock); } catch { /* raced */ } continue; }
      } catch { continue; } // vanished between open and stat
      if (Date.now() - start > LOCK_TIMEOUT_MS) throw new Error(`lock timeout: ${lock}`);
      await sleep(10 + Math.random() * 30);
    }
  }
}
function release(lock) { try { fs.unlinkSync(lock); } catch { /* already gone */ } }

/**
 * Read-modify-write under <file>.lock. `fn(current)` returns the new value
 * (or undefined to skip the write — e.g. "skip if unchanged").
 */
export async function lockedUpdateJson(file, fn, fallback = {}) {
  const prev = inProcess.get(file) || Promise.resolve();
  let done;
  const mine = new Promise((r) => { done = r; });
  inProcess.set(file, prev.then(() => mine));
  await prev;
  const lock = `${file}.lock`;
  try {
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await acquire(lock);
    try {
      const cur = await readJson(file, structuredClone(fallback));
      const next = await fn(cur);
      if (next !== undefined) await writeJson(file, next);
      return next === undefined ? cur : next;
    } finally { release(lock); }
  } finally {
    done();
    if (inProcess.get(file) === mine || inProcess.get(file) === undefined) { /* keep chain; cleared lazily */ }
  }
}

// ---------- events ----------
export const EVENT_TYPES = ['session_start', 'session_end', 'prompt', 'idle', 'spawn', 'done', 'file_touch', 'command', 'stage', 'note'];
export function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
/** Append one event line to events/<local YYYY-MM-DD>.ndjson (UTF-8, redacted). */
export async function appendEvent(satoruDir, ev) {
  const e = redact({ ts: ev.ts || new Date().toISOString(), agent: ev.agent ?? null, type: ev.type, project: ev.project ?? null, payload: ev.payload ?? {} });
  const dir = path.join(satoruDir, 'events');
  await fsp.mkdir(dir, { recursive: true });
  await fsp.appendFile(path.join(dir, `${localDate(new Date(Date.parse(e.ts)))}.ndjson`), JSON.stringify(e) + '\n', { encoding: 'utf8' });
  return e;
}
