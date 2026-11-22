#!/usr/bin/env node
// Generates .claude/agents/<name>.md for every card member except the lead, and the
// "How <lead> runs the team" block in CLAUDE.md. Files it writes carry `alpha-omega-generated: true`
// in their frontmatter; only such files are ever renamed/deleted by scripts/sync-card.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENTS_DIR = path.join(ROOT, '.claude', 'agents');
export const GEN_FLAG = 'alpha-omega-generated: true';

const SCOPES = {
  product: { tools: ['Read', 'Glob', 'Grep', 'Write', 'Edit'], does: 'turns goals into crisp requirements, acceptance criteria, task breakdowns and priorities', not: 'does not write production code or run commands' },
  writer: { tools: ['Read', 'Glob', 'Grep', 'Write', 'Edit'], does: 'writes user-facing copy: UI text, release notes, announcements, marketing and blog prose', not: 'does not write reference/API documentation and does not touch code logic' },
  docs: { tools: ['Read', 'Glob', 'Grep', 'Write', 'Edit'], does: 'writes and maintains technical documentation: README, setup guides, API/reference docs, code comments explaining behaviour', not: 'does not write marketing/UI copy and never runs shell commands' },
  devops: { tools: ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash'], does: 'owns build, CI, launch/stop scripts, environments, dependencies, packaging and deployment', not: 'does not implement application/business logic' },
  researcher: { tools: ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'], does: 'investigates options, reads docs and code, and reports findings with sources and a recommendation', not: 'does not edit project files' },
  data: { tools: ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash'], does: 'owns data models/schemas, migrations, data files, parsing, analysis and data-quality checks', not: 'does not build HTTP endpoints or server plumbing' },
  backend: { tools: ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash'], does: 'implements server code: APIs, business logic, integrations and their tests', not: 'does not own CI/launch scripts or data schemas/migrations' },
};
const DEFAULT_SCOPE = { tools: ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash'], does: 'handles work matching the role', not: 'stays inside the role and hands off anything else' };
const OVERLAPS = [
  ['writer', 'docs', 'Copy that users read inside the product or in announcements → writer. How-to/reference docs that explain how the code works → docs.'],
  ['data', 'backend', 'Schemas, migrations, data files and their validation → data. Endpoints and business logic that use that data → backend.'],
  ['devops', 'backend', 'Build/CI/launcher/dependency/environment changes → devops. Application code and its unit tests → backend.'],
  ['product', 'writer', 'What to build and why (requirements, acceptance criteria) → product. The wording users see → writer.'],
  ['researcher', 'product', 'Facts, comparisons and sources → researcher. The decision and priorities → product.'],
];

export function agentFile(m, team, appName, theme = '') {
  const key = m.role.toLowerCase();
  const scope = SCOPES[key] || DEFAULT_SCOPE;
  const lead = team[0];
  const byRole = (r) => team.find((t) => t.role.toLowerCase() === r && t !== lead);
  const overlaps = OVERLAPS.filter(([a, b]) => (key === a && byRole(b)) || (key === b && byRole(a)))
    .map(([a, b, line]) => `- **${byRole(a).name} (${a}) vs ${byRole(b).name} (${b}):** ${line}`);
  const extra = m.details ? `\nExtra details from the card: ${m.details}\n` : '';
  return `---
name: ${m.name}
description: ${m.name} — ${m.role} on the ${appName} team. Owns: ${scope.does}.
tools: ${scope.tools.join(', ')}
${GEN_FLAG}
---

You are **${m.name}**, the team's **${m.role}** — a ${m.character.toLowerCase()} on the ${appName} crew (theme: ${theme.toLowerCase()}).
Keep the personality light and in theme (a playful aside here and there is fine),
but the work always comes first and reports stay plain.
${extra}
## Your scope
- **In scope:** ${scope.does}.
- **Out of scope:** ${scope.not}.
- Your lead is **${lead.name}**. Take tasks only from ${lead.name}; if something is outside your scope, say who should own it instead of doing it.
${overlaps.length ? `\n## Where roles overlap\n${overlaps.join('\n')}\n` : ''}
## Rules
- Touch only the files named in your task; if you need others, say so in your report.
- **Never commit, push or open PRs unless explicitly told to.**
- Never write secrets into files or logs.
- Verify your work (build, typecheck, tests, or re-reading the output) before reporting.

## Report format (your final message)
1. **Summary** — 1–3 short sentences of what you did (this is shown in a speech bubble, so keep the last sentence meaningful).
2. **How verified** — the exact command(s) or check(s) and their result.
`;
}

export function leadPlaybook(card) {
  const lead = card.team[0];
  const others = card.team.slice(1).map((m) => `\`${m.name}\` (${m.role})`).join(', ');
  const rooms = Object.keys(card.rooms).map((k) => `\`${k}\``).join(', ');
  return `<!-- BEGIN GENERATED: lead-playbook (scripts/gen-agents.mjs — edit the generator, not this block) -->
## How ${lead.name} runs the team

You (the main Claude Code session) are **${lead.name}**, the lead. The team: ${others}. Their subagent files are in \`.claude/agents/\`.
The active project slug is \`activeProject\` in \`.satoru/config.json\`.

1. **Plan first.** Write \`.satoru/projects/<slug>/plan.json\` (atomic: temp file + rename):
   \`{"status":"awaiting-approval","title":"…","scope":"…","risks":["…"],"tasks":[{"id":"T1","title":"…","owner":"<card name>","files":["path/…"]}]}\`
   Owners must be card names (not ${lead.name} unless you do it yourself). Two tasks must not claim the same file.
   Also mirror the tasks into \`tasks.json\` as \`{"tasks":[{"id":"T1","title":"…","owner":"…","status":"planned","files":[…]}]}\`.
2. **STOP** until the plan is approved in the dashboard. The approval arrives in this terminal as a message like "Plan approved in ${card.appName}: <title>. Proceed." Do not start work before that.
3. **Delegate** with the Agent tool (\`subagent_type\` = the member's name), in parallel where tasks are independent. Keep \`tasks.json\` statuses current (\`in_progress\` → \`review\` → \`done\`, \`verified: true\` only after you checked it).
4. **Stage directives** — put these on their own line in your replies (never inside code) to show the team moving; only for real work:
   \`🎬 <name> → <room key> · "<real sentence about what they are doing>"\`
   Room keys: ${rooms}, or \`done\` to release the pin.
5. **Approvals** — when you need a human decision, put a line:
   \`🔔 approval: <title> | risk:<low|med|high> | <reason>\`
   and wait for the decision message before acting on it.
6. Put \`🎬 @<slug>\` on its own line when you switch projects so telemetry attributes your turns correctly.
<!-- END GENERATED: lead-playbook -->`;
}

export function generate({ root = ROOT, quiet = false } = {}) {
  const card = JSON.parse(fs.readFileSync(path.join(root, 'web/src/card.generated.json'), 'utf8'));
  const dir = path.join(root, '.claude', 'agents');
  fs.mkdirSync(dir, { recursive: true });
  const written = [];
  for (const m of card.team.slice(1)) {
    const f = path.join(dir, `${m.name}.md`);
    if (fs.existsSync(f) && !fs.readFileSync(f, 'utf8').includes(GEN_FLAG)) { if (!quiet) console.warn(`⚠ ${path.relative(root, f)} was hand-written (no generated flag) — left untouched`); continue; }
    fs.writeFileSync(f + '.tmp', agentFile(m, card.team, card.appName, card.theme || ''), 'utf8');
    fs.renameSync(f + '.tmp', f);
    written.push(path.relative(root, f));
  }
  // CLAUDE.md block
  const cm = path.join(root, 'CLAUDE.md');
  const txt = fs.readFileSync(cm, 'utf8');
  const re = /<!-- BEGIN GENERATED: lead-playbook[\s\S]*?<!-- END GENERATED: lead-playbook -->/;
  const next = re.test(txt) ? txt.replace(re, leadPlaybook(card)) : txt.trimEnd() + '\n\n' + leadPlaybook(card) + '\n';
  fs.writeFileSync(cm + '.tmp', next, 'utf8'); fs.renameSync(cm + '.tmp', cm);
  if (!quiet) console.log(`agents: wrote ${written.join(', ')}; CLAUDE.md lead playbook updated`);
  return written;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) generate();
