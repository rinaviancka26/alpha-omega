#!/usr/bin/env node
// npm run card:sync — run after editing mission.card.md.
//  1. re-parses the card (fails loudly if invalid)
//  2. detects added / removed / renamed members and changed characters, art style, office setting
//  3. moves raw/<old> → raw/<new> on a rename (keeps the art), fills missing raw art with placeholders
//  4. rebuilds assets + WORK_HOME (fails naming the room if seats run out)
//  5. creates / renames / deletes .claude/agents/<name>.md (only files it generated) + the lead playbook in CLAUDE.md
//  6. prints exactly which raw images are missing or need remaking, and whether the office map needs redoing
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeCard } from './card.mjs';
import { generate, GEN_FLAG } from './gen-agents.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEN = path.join(ROOT, 'web/src/card.generated.json');
// What the assets/agents were last synced for (card.mjs rewrites GEN on every dev start, so it can't be the baseline).
const SNAP = path.join(ROOT, 'web/src/card.synced.json');
const RAW = path.join(ROOT, 'raw');
const POSES = ['front', 'side', 'back', 'portrait'];
const noPlaceholders = process.argv.includes('--no-placeholders');
const say = (s = '') => console.log(s);

const prev = fs.existsSync(SNAP) ? JSON.parse(fs.readFileSync(SNAP, 'utf8')) : fs.existsSync(GEN) ? JSON.parse(fs.readFileSync(GEN, 'utf8')) : null;
let card;
try { card = writeCard(); } catch (e) { console.error('\x1b[31m✖ ' + e.message + '\x1b[0m'); process.exit(1); }
say(`✓ card: ${card.appName} · ${card.team.length} members · lead ${card.team[0].name}`);

// ---------- diff ----------
const oldNames = prev ? prev.team.map((m) => m.name) : [];
const newNames = card.team.map((m) => m.name);
let removed = oldNames.filter((n) => !newNames.includes(n));
let added = newNames.filter((n) => !oldNames.includes(n));
const renames = [];
for (const n of [...added]) { // same position + same role → rename
  const i = newNames.indexOf(n);
  const o = prev?.team[i];
  if (o && removed.includes(o.name) && o.role === card.team[i].role) { renames.push([o.name, n]); removed = removed.filter((x) => x !== o.name); added = added.filter((x) => x !== n); }
}
const remake = new Map(); // name → reason
if (prev) {
  for (const m of card.team) {
    const o = prev.team.find((x) => x.name === m.name) || prev.team.find((x, i) => renames.some(([a, b]) => a === x.name && b === m.name));
    if (o && (o.character !== m.character || o.details !== m.details)) remake.set(m.name, `character/details changed ("${o.character}${o.details ? ' · ' + o.details : ''}" → "${m.character}${m.details ? ' · ' + m.details : ''}")`);
  }
  if (prev.artStyle !== card.artStyle) for (const m of card.team) remake.set(m.name, 'ART_STYLE changed');
}
const officeRedo = prev && (prev.officeSetting !== card.officeSetting || prev.artStyle !== card.artStyle || JSON.stringify(Object.keys(prev.rooms)) !== JSON.stringify(Object.keys(card.rooms)));
const labelsChanged = prev && JSON.stringify(prev.rooms) !== JSON.stringify(card.rooms);
if (prev) {
  say(`  added: ${added.join(', ') || '—'} · removed: ${removed.join(', ') || '—'} · renamed: ${renames.map(([a, b]) => `${a}→${b}`).join(', ') || '—'}`);
  if (prev.appName !== card.appName) say(`  app name: "${prev.appName}" → "${card.appName}" (UI title/header, window titles and the shortcut name follow the card; re-run make-shortcut.cmd to rename the desktop shortcut)`);
  if (prev.uiAccent !== card.uiAccent) say(`  UI accent: ${prev.uiAccent} → ${card.uiAccent}`);
  if (labelsChanged) say('  room labels changed (UI picks them up automatically)');
}

// ---------- raw art ----------
for (const [a, b] of renames) {
  const from = path.join(RAW, a), to = path.join(RAW, b);
  if (fs.existsSync(from) && !fs.existsSync(to)) { fs.renameSync(from, to); say(`  raw/${a}/ → raw/${b}/ (art kept for the renamed member)`); }
}
const missing = [];
for (const m of card.team) for (const p of POSES) if (!fs.existsSync(path.join(RAW, m.name, `${p}.png`))) missing.push(`raw/${m.name}/${p}.png`);
if (!fs.existsSync(path.join(RAW, 'office.png'))) missing.push('raw/office.png');
const run = (args) => { const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' }); if (r.status !== 0) process.exit(r.status || 1); };
if (missing.length && !noPlaceholders) {
  say(`  generating placeholders for ${missing.length} missing raw file(s)…`);
  run(['scripts/make-placeholder-art.mjs', '--missing-only']);
}

// ---------- assets + WORK_HOME ----------
const r = spawnSync(process.execPath, ['scripts/build-assets.mjs'], { cwd: ROOT, encoding: 'utf8' });
let failed = 0;
if (r.status !== 0) { process.stdout.write(r.stdout); process.stderr.write(r.stderr); failed = r.status || 1; say('✖ assets NOT rebuilt (see above) — fix, then run `npm run card:sync` again'); }
else {
  const homes = fs.readFileSync(path.join(ROOT, 'web/src/officeAssets.ts'), 'utf8').match(/WORK_HOME[^=]*= (\{[\s\S]*?\n\});/);
  say(`✓ assets rebuilt; WORK_HOME: ${Object.entries(JSON.parse(homes[1])).map(([n, h]) => `${n}→${h.seat}`).join(' ')}`);
}

// ---------- .claude/agents ----------
const dir = path.join(ROOT, '.claude', 'agents');
fs.mkdirSync(dir, { recursive: true });
const keep = new Set(card.team.slice(1).map((m) => `${m.name}.md`));
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.md') || keep.has(f)) continue;
  const full = path.join(dir, f);
  if (fs.readFileSync(full, 'utf8').includes(GEN_FLAG)) { fs.unlinkSync(full); say(`  deleted .claude/agents/${f} (generated, no longer on the card as a subagent)`); }
  else say(`  kept .claude/agents/${f} (hand-written — not touched)`);
}
const written = generate({ quiet: true });
say(`✓ agents: ${written.map((f) => path.basename(f)).join(', ')} · CLAUDE.md lead playbook updated`);

// ---------- art report ----------
say('\nArt checklist:');
const report = [];
for (const m of card.team) {
  for (const p of POSES) {
    const rel = `raw/${m.name}/${p}.png`;
    if (missing.includes(rel)) report.push(`  MISSING   ${rel}${noPlaceholders ? '' : '  (placeholder generated — replace with real art)'}`);
    else if (remake.has(m.name)) report.push(`  REMAKE    ${rel}  — ${remake.get(m.name)}`);
  }
}
if (missing.includes('raw/office.png')) report.push(`  MISSING   raw/office.png${noPlaceholders ? '' : '  (placeholder generated)'}`);
report.push(officeRedo ? '  OFFICE MAP: needs redoing (office setting / art style / rooms changed) — then re-place rooms/seats/doors in /picker.html'
  : '  OFFICE MAP: no change needed');
say(report.join('\n'));
if (!report.some((l) => /MISSING|REMAKE/.test(l))) say('  all member art present and up to date');
if (failed) process.exit(failed);
fs.writeFileSync(SNAP + '.tmp', JSON.stringify(card, null, 2) + '\n', 'utf8'); fs.renameSync(SNAP + '.tmp', SNAP);
