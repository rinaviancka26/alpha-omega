#!/usr/bin/env node
// Parses mission.card.md (the single source of truth) into web/src/card.generated.json.
// Fails loudly (exit 1) on any validation error.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK_ROOMS = ['command', 'workspace', 'server'];
const ROOM_KEYS = ['briefing', 'meeting', 'approval', 'workspace', 'command', 'server', 'pantry', 'lounge'];

export function parseCard(text) {
  const errors = [];
  const t = text.replace(/\r\n/g, '\n');
  const start = t.indexOf('=== MISSION CARD ===');
  const end = t.indexOf('=== END CARD ===');
  if (start < 0 || end < 0 || end < start) throw new Error('card: missing "=== MISSION CARD ===" / "=== END CARD ===" markers');
  const body = t.slice(start, end).split('\n').map((l) => l.trim());

  const field = (key) => {
    const line = body.find((l) => l.startsWith(key + ':'));
    if (!line) { errors.push(`missing field ${key}`); return ''; }
    return line.slice(key.length + 1).trim();
  };
  const appName = field('APP_NAME');
  const theme = field('THEME');
  const artStyle = field('ART_STYLE');
  const officeSetting = field('OFFICE_SETTING');
  const accentRaw = field('UI_ACCENT');
  const hex = accentRaw.match(/#[0-9a-fA-F]{6}\b/);
  if (!hex) errors.push(`UI_ACCENT must contain a #rrggbb colour (got "${accentRaw}")`);
  const uiAccent = hex ? hex[0].toLowerCase() : '';
  const uiAccentName = accentRaw.replace(/#[0-9a-fA-F]{6}\b/, '').trim() || null;
  const pixelArt = /pixel/i.test(artStyle) && !/not pixel/i.test(artStyle);

  // team table
  const team = [];
  const tableRows = body.filter((l) => l.startsWith('|'));
  if (tableRows.length < 2) errors.push('team table not found');
  const header = (tableRows[0] || '').split('|').slice(1, -1).map((c) => c.trim().toLowerCase());
  const want = ['name', 'role', 'works in', 'character', 'extra details'];
  if (header.join(',') !== want.join(',')) errors.push(`team table header must be | ${want.join(' | ')} | (got | ${header.join(' | ')} |)`);
  for (const row of tableRows.slice(1)) {
    const cells = row.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.every((c) => /^-+$/.test(c))) continue; // separator
    if (cells.length !== 5) { errors.push(`team row has ${cells.length} cells, expected 5: ${row}`); continue; }
    const [name, role, worksIn, character, details] = cells;
    team.push({ name, role, worksIn, character, details: details === '-' || details === '' ? null : details });
  }
  if (team.length < 2 || team.length > 8) errors.push(`team must have 2–8 members (got ${team.length})`);
  const leads = team.filter((m) => m.role.toLowerCase() === 'lead');
  if (leads.length !== 1) errors.push(`exactly one member must have role "lead" (got ${leads.length}${leads.length ? ': ' + leads.map((l) => l.name).join(', ') : ''})`);
  else if (team[0] !== leads[0]) errors.push(`the lead (${leads[0].name}) must be the first row of the team table`);
  const seen = new Set();
  for (const m of team) {
    if (!/^[a-z][a-z0-9]*$/.test(m.name)) errors.push(`name "${m.name}" must be a single lowercase word (a-z, 0-9)`);
    if (seen.has(m.name)) errors.push(`duplicate name "${m.name}"`);
    seen.add(m.name);
    if (!WORK_ROOMS.includes(m.worksIn)) errors.push(`${m.name}: works in "${m.worksIn}" must be one of ${WORK_ROOMS.join(', ')}`);
    if (!m.role) errors.push(`${m.name}: role is empty`);
    if (!m.character) errors.push(`${m.name}: character is empty`);
  }

  // rooms
  const rooms = {};
  const ri = body.findIndex((l) => l.startsWith('ROOM LABELS'));
  if (ri < 0) errors.push('ROOM LABELS section not found');
  else {
    for (const l of body.slice(ri + 1)) {
      const m = l.match(/^([a-z]+)\s*=\s*(.+)$/);
      if (m) rooms[m[1]] = m[2].trim();
    }
  }
  for (const k of ROOM_KEYS) if (!rooms[k]) errors.push(`room label missing for "${k}"`);
  for (const k of Object.keys(rooms)) if (!ROOM_KEYS.includes(k)) errors.push(`unknown room key "${k}" (allowed: ${ROOM_KEYS.join(', ')})`);
  if (!appName) errors.push('APP_NAME is empty');

  if (errors.length) {
    const e = new Error('mission.card.md is invalid:\n  - ' + errors.join('\n  - '));
    e.cardErrors = errors;
    throw e;
  }
  return { appName, theme, artStyle, pixelArt, officeSetting, uiAccent, uiAccentName, team, rooms };
}

export function writeCard({ cardPath = path.join(ROOT, 'mission.card.md'), outPath = path.join(ROOT, 'web/src/card.generated.json') } = {}) {
  const card = parseCard(fs.readFileSync(cardPath, 'utf8'));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const json = JSON.stringify(card, null, 2) + '\n';
  const tmp = `${outPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, json, 'utf8');
  fs.renameSync(tmp, outPath);
  return card;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const cardPath = args[0] ? path.resolve(args[0]) : undefined;
  const outPath = args[1] ? path.resolve(args[1]) : undefined;
  try {
    const card = writeCard({ ...(cardPath && { cardPath }), ...(outPath && { outPath }) });
    console.log(`card OK: ${card.appName} · ${card.team.length} members · lead ${card.team[0].name} → ${path.relative(ROOT, outPath || path.join(ROOT, 'web/src/card.generated.json'))}`);
  } catch (e) {
    console.error('\x1b[31m✖ ' + e.message + '\x1b[0m');
    process.exit(1);
  }
}
