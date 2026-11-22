// Proof helper: an isolated ALPHA_OMEGA_ROOT (so the real .satoru of this repo is untouched) + seeding helpers.
import fs from 'node:fs';
import path from 'node:path';
import { writeJson, appendEvent } from '../../hooks/lib/io.mjs';

export const SANDBOX = process.env.AO_SANDBOX || path.resolve('/tmp/claude-0/aoroot');
export const SAT = path.join(SANDBOX, '.satoru');
export const card = JSON.parse(fs.readFileSync(new URL('../../web/src/card.generated.json', import.meta.url), 'utf8'));
export const T = card.team.map((m) => m.name); // T[0] = lead

export function reset({ projects = [{ slug: 'garage', name: 'Garage Rebuild' }], active = 'garage' } = {}) {
  // clear CONTENTS only — the running server is watching .satoru itself
  fs.mkdirSync(SAT, { recursive: true });
  for (const f of fs.readdirSync(SAT)) fs.rmSync(path.join(SAT, f), { recursive: true, force: true });
  for (const d of ['work', 'projects-root']) fs.rmSync(path.join(SANDBOX, d), { recursive: true, force: true });
  fs.mkdirSync(path.join(SANDBOX, 'web', 'src'), { recursive: true });
  fs.copyFileSync(new URL('../../web/src/card.generated.json', import.meta.url), path.join(SANDBOX, 'web/src/card.generated.json'));
  fs.mkdirSync(path.join(SAT, 'events'), { recursive: true });
  fs.mkdirSync(path.join(SAT, 'projects'), { recursive: true });
  const reg = projects.map((p) => { const dir = path.join(SANDBOX, 'work', p.slug); fs.mkdirSync(dir, { recursive: true }); return { ...p, path: dir }; });
  fs.writeFileSync(path.join(SAT, 'registry.json'), JSON.stringify({ projects: reg }, null, 2));
  fs.writeFileSync(path.join(SAT, 'config.json'), JSON.stringify({ activeProject: active, projectsRoot: path.join(SANDBOX, 'projects-root') }, null, 2));
  return reg;
}
export const put = (slug, file, data) => writeJson(path.join(SAT, 'projects', slug, `${file}.json`), data);
export const ev = (e) => appendEvent(SAT, e);
export const ago = (ms) => new Date(Date.now() - ms).toISOString();
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
