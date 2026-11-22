import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-tl-'));
fs.mkdirSync(path.join(root, '.satoru', 'events'), { recursive: true });
fs.mkdirSync(path.join(root, 'web', 'src'), { recursive: true });
process.env.ALPHA_OMEGA_ROOT = root;
const L = await import('../src/lib.ts');

test('timeline paging over two days with identical timestamps on a page boundary', async () => {
  const now = Date.now();
  const today = new Date(now), yesterday = new Date(now - 86400_000);
  // 30 events yesterday, 30 today; newest-first positions 25/26 (1-based) share one timestamp
  const evs: { ts: string; i: number }[] = [];
  for (let i = 0; i < 30; i++) evs.push({ ts: new Date(yesterday.setHours(10, 0, i)).toISOString(), i });
  const base = new Date(today); base.setHours(0, 30, 0, 0);
  for (let i = 0; i < 30; i++) evs.push({ ts: new Date(base.getTime() + i * 1000).toISOString(), i: 30 + i });
  // newest-first index 24 and 25 (0-based) = today's i=5 and i=4 → give them the same ts
  evs[30 + 4].ts = evs[30 + 5].ts;
  for (const e of evs) await L.appendEvent(L.SATORU_DIR, { ts: e.ts, type: 'note', agent: null, project: e.i % 2 ? 'p' : null, payload: { text: `#${e.i}` } });
  const files = fs.readdirSync(path.join(root, '.satoru', 'events'));
  assert.equal(files.length, 2, 'two day files');

  const seen: string[] = []; let cursor: string | null = null; let pages = 0; const boundary: string[][] = [];
  do {
    const r = await L.timeline({ limit: 25, cursor });
    boundary.push(r.events.map((e) => e.payload.text as string));
    seen.push(...r.events.map((e) => e.payload.text as string));
    cursor = r.nextCursor; pages++;
  } while (cursor);
  console.log(`pages=${pages} sizes=${boundary.map((b) => b.length).join(',')} | page1 last=${boundary[0].at(-1)} page2 first=${boundary[1][0]} (identical ts) | cursor format e.g. ${(await L.timeline({ limit: 1 })).nextCursor}`);
  assert.equal(seen.length, 60); assert.equal(new Set(seen).size, 60, 'no duplicates, nothing skipped');
  assert.equal(boundary[0].at(-1), '#35'); assert.equal(boundary[1][0], '#34', 'identical-ts pair split across the page boundary');
  // filters
  const un = await L.timeline({ limit: 100, project: 'unattributed' });
  assert.equal(un.events.length, 30); assert.ok(un.events.every((e) => e.project === null));
});
