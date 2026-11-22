import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { lockedUpdateJson, readJson, redactString } from '../../hooks/lib/io.mjs';

const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ao-lock-'));

/** Hammers the file with raw reads while `work` runs; returns how many reads failed to parse. */
async function watchParses(file: string, work: Promise<unknown>) {
  let reads = 0, bad = 0, stop = false;
  const loop = (async () => {
    while (!stop) {
      try { const t = fs.readFileSync(file, 'utf8'); reads++; JSON.parse(t); } catch (e: any) { if (e.code !== 'ENOENT') bad++; }
      await new Promise((r) => setImmediate(r));
    }
  })();
  await work; stop = true; await loop;
  return { reads, bad };
}

test('200 concurrent lockedUpdateJson increments (in-process) → exactly 200, always parseable', async () => {
  const file = path.join(tmpdir(), 'counter.json');
  const work = Promise.all(Array.from({ length: 200 }, () => lockedUpdateJson<{ n: number }>(file, (c) => ({ n: (c.n || 0) + 1 }), { n: 0 })));
  const { reads, bad } = await watchParses(file, work);
  const final = await readJson<{ n: number }>(file);
  console.log(`in-process: final n=${final.n}, raw reads during run=${reads}, unparseable=${bad}`);
  assert.equal(final.n, 200);
  assert.equal(bad, 0);
  assert.equal(fs.existsSync(file + '.lock'), false);
});

test('4 processes × 50 increments (cross-process lock) → exactly 200, always parseable', async () => {
  const file = path.join(tmpdir(), 'counter.json');
  const io = new URL('../../hooks/lib/io.mjs', import.meta.url).href;
  const child = `const { lockedUpdateJson } = await import(${JSON.stringify(io)});
    await Promise.all(Array.from({ length: 50 }, () => lockedUpdateJson(${JSON.stringify(file)}, (c) => ({ n: (c.n || 0) + 1 }), { n: 0 })));`;
  const run = () => new Promise<number>((res) => spawn(process.execPath, ['--input-type=module', '-e', child], { stdio: 'inherit' }).on('exit', (c) => res(c ?? 1)));
  const work = Promise.all([run(), run(), run(), run()]);
  const { reads, bad } = await watchParses(file, work);
  const codes = await work;
  const final = await readJson<{ n: number }>(file);
  console.log(`cross-process: exit codes=${codes.join(',')}, final n=${final.n}, raw reads=${reads}, unparseable=${bad}`);
  assert.deepEqual(codes, [0, 0, 0, 0]);
  assert.equal(final.n, 200);
  assert.equal(bad, 0);
});

test('stale lock (>10 s old) is taken over', async () => {
  const file = path.join(tmpdir(), 'x.json');
  fs.writeFileSync(file + '.lock', 'dead');
  const old = (Date.now() - 11_000) / 1000;
  fs.utimesSync(file + '.lock', old, old);
  const r = await lockedUpdateJson<{ ok?: boolean }>(file, () => ({ ok: true }), {});
  assert.equal(r.ok, true);
});

test('fresh foreign lock → times out after ~2 s', async () => {
  const file = path.join(tmpdir(), 'y.json');
  fs.writeFileSync(file + '.lock', 'busy');
  const t0 = Date.now();
  await assert.rejects(lockedUpdateJson(file, () => ({}), {}), /lock timeout/);
  const dt = Date.now() - t0;
  assert.ok(dt >= 1900 && dt < 4000, `took ${dt} ms`);
});

test('torn read → retries then fallback', async () => {
  const file = path.join(tmpdir(), 'torn.json');
  fs.writeFileSync(file, '{"a": 1, "b":');
  assert.deepEqual(await readJson(file, { fallback: true }), { fallback: true });
});

test('redaction', () => {
  assert.equal(redactString('x sk-ant-abcdefghijk123 y'), 'x sk-[REDACTED] y');
  assert.match(redactString('password=hunter2'), /\[REDACTED\]/);
  assert.match(redactString('Bearer abcdefghijkl'), /Bearer \[REDACTED\]/);
  assert.equal(redactString('src/components/Office.tsx'), 'src/components/Office.tsx');
});
