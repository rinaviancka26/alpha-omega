# ALPHA OMEGA — build proof

Every step was verified by running real commands in the cloud build session (Linux, Node 22). Screenshots are in `docs/proof/`.
Windows-only parts are marked **UNVERIFIED ON WINDOWS** — they could not be executed here.

| Step | Result |
|------|--------|
| 1 Mission card + CLAUDE.md | PASS |
| 2 Scaffold | PASS |
| 3 Placeholder art + asset pipeline | PASS |
| 4 Coordinate picker | PASS |
| 5 Embedded terminal | PASS (injection proven with a stub `claude`; real Claude injection proven in step 15) |
| 6 State layer | PASS |
| 7 Subagents | PASS |
| 8 Telemetry hook | PASS (fake payloads + real hooks from real sessions) |
| 9 Office screen | PASS |
| 10 Board-driven rooms | PASS |
| 11 Approvals | PASS |
| 12 Projects tab | PASS |
| 13 Tasks / Decisions / Brief / Timeline | PASS |
| 14 Launchers | PASS for `start.sh`/`stop.sh`; `start.cmd/.ps1`, `stop.cmd/.ps1`, `make-shortcut` **UNVERIFIED ON WINDOWS** |
| 15 Verification pass (real Claude Code session) | PASS 18/18 |
| 16 Card-change workflow | PASS |

Re-run everything: `npm test` · `npm run check` · `npm --prefix web run build` · Playwright proofs in `scripts/proof/*.mjs`
(`office`, `board`, `approvals`, `projects`, `tabs` run against a sandbox via `scripts/proof/restart-server.sh`; `e2e` runs against `./start.sh` with a logged-in `claude`).

---

## Step 1 — Mission card + CLAUDE.md — **PASS**

```
$ node scripts/card.mjs
card OK: ALPHA OMEGA · 8 members · lead rv → web/src/card.generated.json
```
Output `web/src/card.generated.json` (excerpt): `"appName": "ALPHA OMEGA"`, `"uiAccent": "#8b5cf6"`, `"pixelArt": false`, team of 8 starting with `{"name":"rv","role":"lead","worksIn":"command",...,"details":null}`, `rooms` with all 8 keys.

Broken card (changed ruzz's role to `lead`):
```
$ node scripts/card.mjs
✖ mission.card.md is invalid:
  - exactly one member must have role "lead" (got 2: rv, ruzz)
exit=1
```
Card restored from backup → `card OK` again; `git diff mission.card.md` empty.

## Step 2 — Scaffold — **PASS**

```
$ curl -s http://localhost:4316/api/health          # through the Vite proxy
{"ok":true}
$ curl -sI http://localhost:4316/api/health | grep -i access-control
access-control-allow-origin: http://localhost:4316   # CORS pinned, not "*"
$ (web) tsc -b && vite build   → ✓ built ;  (server) tsc --noEmit → ok
```
Page title = `ALPHA OMEGA` (from card via `%APP_NAME%` HTML transform). Screenshot: `docs/proof/step2-shell.png` (sidebar tabs, HUD, main, collapsible terminal dock). Console errors: none.

## Step 3 — Placeholder art + asset pipeline — **PASS**

`node scripts/make-placeholder-art.mjs` → `placeholder art: wrote 34 files to raw/ (copy in art/placeholder/)` (8 members × front/side/back/portrait, office.png, icon.png; each member a different hue).

`node scripts/build-assets.mjs` (excerpt — full list is 8 × 8 character files + map + icon):
```
web/public/assets/characters/rv/front_256.png  256×256  (content 148×240, scale 0.2837, alpha)
web/public/assets/characters/rv/side_256.png   256×256  (content 96×240,  scale 0.2837, alpha)
web/public/assets/characters/rv/back_256.png   256×256  (content 128×240, scale 0.2837, alpha)
web/public/assets/characters/rv/front_48.png   48×48    (content 28×46,  scale 0.0544, alpha)
web/public/assets/characters/rv/portrait_512.png  512×512
web/public/assets/characters/rv/portrait_128.png  128×128
web/public/assets/office/office_full_map.png  1448×1086
colours: rv=#e16647  ruzz=#e1d947  maj=#75e147  kat=#47e18c  kyle=#47c2e1  renz=#474ee1  richie=#b347e1  weng=#e1479c
```
One scale per character (same `scale` for all three poses), bottom-aligned baseline.

- Contact sheet: `docs/proof/step3-contact-sheet.png` (red line = shared baseline; colour swatch per member; side poses face left).
- Flood-fill check: a copy of `rv/front.png` flattened onto white → `flood-filled 772463 px`, corner alpha of output = 0.
- Missing-file check: deleted `kat/back.png` in a temp raw dir → `✖ asset pipeline: 1 raw file(s) missing: - …/kat/back.png`, exit 1.
- Office map: `docs/proof/step3-office.png`.

## Step 4 — Coordinate picker — **PASS**

Dev-only entry `web/picker.html` (excluded from the production build). Driven with Playwright (`node scripts/proof/picker.mjs`):
```
empty: checklist ok 0 / 6                     (all red)
room drawn: Lounge · 0 seats                  (ROOM: drag + key, label shown)
seat: seat lounge_1 → Lounge                  (SEAT assigned to containing room)
connect: linked d_lounge ↔ j_top              (DOOR + NODE + CONNECT)
after delete j_top present? 0
after undo j_top present? 1
export: {"rooms":{"lounge":{"x":2,"y":74,"w":27,"h":23}},"seats":[{"id":"lounge_1","room":"lounge","x":10,"y":85}],"doors":[...],"nodes":[...],"edges":[["d_lounge","j_top"]]}
imported real coords: checklist ok 6 / 6
✓ All 8 rooms placed | ✓ Every room has a door | ✓ Command Center: 6 seat(s) ≥ 2 … | ✓ Workspace: 6 seat(s) ≥ 3 … | ✓ Server Room: 5 seat(s) ≥ 3 … | ✓ All rooms reachable
page errors: none
```
Screenshots: `docs/proof/step4-picker-editing.png`, `docs/proof/step4-seats-edges-overlay.png` (all seats labelled, doors amber, nodes cyan, edges).

`web/src/office-coordinates.json` is produced by `scripts/make-coordinates.mjs` from the same geometry (`scripts/office-layout.mjs`) that draws the placeholder map: 8 rooms, 48 seats, 8 doors, 9 nodes, 16 edges.
WORK_HOME (generated into `officeAssets.ts`): rv→command_1 (lead gets the first command seat), ruzz→command_2, maj→workspace_1, kat→server_1, kyle→workspace_2, renz→server_2, richie→server_3, weng→workspace_3.
Too-few-seats check (server seats cut to 2): `✖ room "server" has 2 seat(s) but 3 member(s) work there …`, exit 1. Restored → build OK.

## Step 5 — Embedded terminal — **PASS**

`node scripts/proof/terminal.mjs` (Playwright, real browser, real PTY):
```
first connect: {"type":"hello","sid":"e32f…","reattached":true,"pid":2435}   (React StrictMode mounts twice in dev, so the 2nd mount already re-attaches)
before reload contains hello: true | marker: marker-2435
after reload: {"type":"hello","sid":"e32f…","reattached":true,"pid":2435}
scrollback replayed (hello present): true | same shell pid: true | reattached: true
same $$ after reload: still-2435 vs marker-2435
page errors: none
```
Screenshots: `docs/proof/step5-terminal-before.png`, `docs/proof/step5-terminal-after-reload.png`.

Injection (`node scripts/proof/inject.mjs`). No live Claude here, so a **stub process named `claude`** (`scripts/proof/stub-claude/claude`, echoes its stdin) was started inside a PTY to stand in for it:
```
no claude:  POST /api/terminal/inject → {"injected":false,"reason":"Claude is not running in the terminal"}
status with stub running: {"attached":true,"sessions":2,"claudeRunning":true}
inject: {"injected":true}
pty output line: STUB CLAUDE GOT: Plan approved. Proceed.      (text, then Enter as a separate write 150 ms later)
```
Windows: shell = `powershell.exe`; Claude detection uses `Get-CimInstance Win32_Process` — **UNVERIFIED ON WINDOWS**.

## Step 6 — State layer — **PASS**

Shared dependency-free I/O in `hooks/lib/io.mjs` (used by both the server and the telemetry hook): `readJson` (2 retries on torn reads, then fallback), atomic `writeJson` (temp + rename, UTF-8, redacted), `lockedUpdateJson` (`<file>.lock` opened `wx`, retry ~2 s, stale after 10 s), `appendEvent` → `events/<local date>.ndjson`.

`npm --prefix server test`:
```
# in-process: final n=200, raw reads during run=8796, unparseable=0
ok 1 - 200 concurrent lockedUpdateJson increments (in-process) → exactly 200, always parseable
# cross-process: exit codes=0,0,0,0, final n=200, raw reads=19838, unparseable=0
ok 2 - 4 processes × 50 increments (cross-process lock) → exactly 200, always parseable
ok 3 - stale lock (>10 s old) is taken over
ok 4 - fresh foreign lock → times out after ~2 s
ok 5 - torn read → retries then fallback
ok 6 - redaction
# pass 6  fail 0
```
SSE (`curl -N /api/stream` through the Vite proxy while writing agents.json + appending an event):
```
data: {"kind":"hello","project":null,"file":""}
data: {"kind":"agents","project":"demo-sse","file":"projects/demo-sse/agents.json"}
data: {"kind":"events","project":null,"file":"events/2026-11-22.ndjson"}
```
REST: `/api/projects/demo-sse` → agents/tasks/plan/approvals/mission; `/api/events/recent?limit=2` → the event; `/api/telemetry-status` → `{"lastEventTs":"2026-11-22T09:03:30.778Z","liveSession":false}`; `POST /api/active {"slug":"nope"}` → 404 `unknown project "nope"`.

## Step 7 — Subagents — **PASS**

`node scripts/gen-agents.mjs` → `.claude/agents/<name>.md` for every non-lead card member (frontmatter flag `alpha-omega-generated: true`), plus the generated "How rv runs the team" block in CLAUDE.md.
```
kat.md: tools: Read, Glob, Grep, Write, Edit, Bash
kyle.md: tools: Read, Glob, Grep, WebSearch, WebFetch
maj.md: tools: Read, Glob, Grep, Write, Edit
renz.md: tools: Read, Glob, Grep, Write, Edit, Bash
richie.md: tools: Read, Glob, Grep, Write, Edit, Bash
ruzz.md: tools: Read, Glob, Grep, Write, Edit
weng.md: tools: Read, Glob, Grep, Write, Edit
match card: true      (file names == card names minus lead)
```
docs (weng) and writer (maj) have no Bash; researcher (kyle) is read-only + web. Each file has scope, explicit overlap lines (maj vs weng, renz vs richie, kat vs richie, ruzz vs maj, kyle vs ruzz), "never commit unless told", and the report format (summary + how verified).

## Step 8 — Telemetry hook — **PASS**

`node --test tests/*.test.mjs` — fake payloads piped into `hooks/telemetry.mjs` against a temp `.satoru` (`ALPHA_OMEGA_SATORU`):
```
ok 1 - full scenario: spawn → phantom stop → real stop → Stop with directives
ok 2 - attribution rules
ok 3 - 🎬 @slug pins the session; never fails on garbage / missing .satoru
ok 4 - reconcile: stale working → completed (keeps since), approval pin released, old directive cleared
# pass 4  fail 0
```
agents.json after the scenario (ruzz = card member #2, rv = lead):
```
"ruzz": {"state":"completed","task":"Draft the requirements","say":"Requirements drafted in docs/req.md; verified by re-reading. torque-checked ✔",
         "intendedRoom":"briefing","voice":"Walking the team through the spec", …}
"rv":   {"state":"approval", …}
```
Event lines:
```
{"agent":"ruzz","type":"spawn","project":"demo","payload":{"task":"Draft the requirements","subagent":"ruzz","via":"cwd"}}
{"agent":null,"type":"done","project":"demo","payload":{"phantom":true,"via":"cwd"}}                    ← phantom: no state change
{"agent":"ruzz","type":"done","project":"demo","payload":{"say":"Requirements drafted in docs/req.md; …","task":"Draft the requirements","via":"cwd"}}  ← say from agent_transcript_path, not transcript_path
{"agent":"rv","type":"idle","project":"demo","payload":{"directives":1,"approvals":1,"via":"cwd"}}       ← the 🎬 in a ``` block and the inline-code one were ignored
{"agent":"ruzz","type":"stage","project":"demo","payload":{"room":"briefing","voice":"Walking the team through the spec"}}
{"agent":"rv","type":"note","project":"demo","payload":{"text":"approval requested: Delete old migrations","approval":"A-fa74ae27"}}
{"agent":"rv","type":"idle",…}                                                                           ← repeated Stop: no duplicate stage/approval
```
Attribution: `file_touch` outside a project → `project=null` (no activeProject fallback); `prompt` → `via: activeProject`; off-card `general-purpose` spawn → `agent=null, offCard`; secrets redacted (`sk-[REDACTED]`, `--password=[REDACTED]`).
Reconcile notes: `ruzz had no heartbeat for >60 min and no live spawn — marked completed` (since kept), `approval pin released`, `stage directive (meeting) older than 2 h cleared`; a second reconcile writes nothing.

**Real hooks, real session:** as soon as `.claude/settings.json` was written, the Claude Code session building this repo started firing it — `.satoru/events/2026-11-22.ndjson` received real `PostToolUse Bash` → `command` events, e.g.
`{"agent":"rv","type":"command","project":null,"payload":{"command":"sed -i 's#node --test tests/#node --test tests/*.test.mjs#' package.json && …","via":null}}` (unattributed: no project registered, and command never falls back to activeProject).

## Step 9 — Office screen — **PASS**

`node scripts/proof/office.mjs` (Playwright against a sandbox `.satoru` via `ALPHA_OMEGA_ROOT`; state written with the same atomic writer the hook uses; lights driven by real `session_start`/`session_end` event lines):
```
before session_start: 🌙 lights off — no live Claude session
after real session_start event: 💡 lights on — live Claude session
unique seats: true
closing bubble for ruzz at desk: "Acceptance criteria are in docs/criteria.md — verified against the plan." | room: command
facing check on 40 moving samples: 0 wrong; poses seen: side, front, side(mirrored), back; min opacity while walking: 0.72
ruzz arrived in: pantry | ☕: 1
kyle directive walk: facing check on 0 moving samples: 0 wrong; poses seen: ; arrived in lounge; bubble: "Collecting sources on torque specs for the brief."
min distance between any two characters' feet: 147.8 px
modal shows: maj | writer · cheerful robotic mechanic | Status: working · since 3m ago | Task: Draft the launch copy
after session_end: 🌙 lights off — no live Claude session
ticker: LIVE Claude session ended — lights off · just now Claude session started — lights on · just now
demo label visible: 1
page errors: none
```
Placement table at load:
```
│ (index) │ name     │ room        │ seat          │ why                      │
│ 0       │ 'rv'     │ 'command'   │ 'command_1'   │ 'lead rests at own desk' │
│ 1       │ 'ruzz'   │ 'command'   │ 'command_2'   │ 'live spawn (working)'   │
│ 2       │ 'maj'    │ 'workspace' │ 'workspace_1' │ 'live spawn (working)'   │
│ 3       │ 'kat'    │ 'lounge'    │ 'lounge_5'    │ 'completed — on a break' │
│ 4       │ 'kyle'   │ 'lounge'    │ 'lounge_4'    │ 'idle — on a break'      │
│ 5       │ 'renz'   │ 'server'    │ 'server_2'    │ 'live spawn (working)'   │
│ 6       │ 'richie' │ 'pantry'    │ 'pantry_1'    │ 'idle — on a break'      │
│ 7       │ 'weng'   │ 'workspace' │ 'workspace_3' │ 'live spawn (working)'   │
```
Screenshots: `step9-lights-off.png`, `step9-settled.png`, `step9-closing-line.png` (closing bubble at the desk), `step9-mid-walk.png`, `step9-arrived.png` (☕ in break room), `step9-directive-walk.png` / `step9-directive-arrived.png` (🎬 directive with voice bubble), `step9-modal.png`, `step9-demo.png` (clearly labelled DEMO).

No wall-walking — `tsx --test tests/routes.test.ts` uses the app's real `planRoute()`:
```
# checked 2256 routes, 14408 legs, 840884 sample points — all on walkable floor
ok 1 - no leg between any two seats crosses a wall
ok 2 - facing: side mirrored when moving right, back when up, front when down
ok 3 - negative control: a straight line workspace → approval office DOES hit a wall
```
Facing: sampled the real on-screen position every 90 ms while walking; every `side` sample was mirrored exactly when moving right (0 wrong of 25+38 samples), `back` only when moving up, `front` when moving down.
Root-caused flake during this step: an older `/api/state` response could land after a newer one and overwrite it → fixed with per-request sequence numbers (+10 s safety poll); 3/3 consecutive runs green afterwards. Also: `build-assets` no longer deletes the directory a running Vite watches and doesn't rewrite `officeAssets.ts` when unchanged.

## Step 10 — Board-driven rooms — **PASS**

Unit tests (`tsx --test tests/placement.test.ts`): precedence directive > approval > plan briefing > working > review > blocked > rest; expired directive ignored; lead never in a break room; stale working dimmed with age tag; completed never dimmed; no project → nobody works; no seat sharing — `# pass 3 fail 0`.

`node scripts/proof/board.mjs` (hand-written state, real browser):
```

### No project loaded
rv      → command   command_1    because: lead rests at own desk (no project loaded)
ruzz    → pantry    pantry_3     because: no project loaded
maj     → pantry    pantry_4     because: no project loaded
kat     → lounge    lounge_2     because: no project loaded
kyle    → lounge    lounge_3     because: no project loaded
renz    → lounge    lounge_1     because: no project loaded
richie  → pantry    pantry_2     because: no project loaded
weng    → pantry    pantry_5     because: no project loaded
badges on screen: none
opacity: rv:1 ruzz:1 maj:1 kat:1 kyle:1 renz:1 richie:1 weng:1
banner: ALPHA OMEGA no project loaded ○ Claude not running

### Working / stale / blocked / review / pending approval / 3-hour-old completion
rv      → approval  approval_1   [amber !] because: 1 pending approval(s)
ruzz    → command   command_2    because: task T1 in progress
maj     → workspace workspace_1  [dimmed 32m] because: task T2 in progress
kat     → lounge    lounge_2     because: completed — on a break
kyle    → lounge    lounge_3     because: idle — on a break
renz    → meeting   meeting_1    [red !] because: task T3 blocked
richie  → meeting   meeting_2    because: task T4 in review
weng    → pantry    pantry_5     because: idle — on a break
badges on screen: rv:amber, renz:red
opacity: rv:1 ruzz:1 maj:0.45 kat:1 kyle:1 renz:1 richie:1 weng:1
banner: ALPHA OMEGA working on Garage Rebuild ○ Claude not running

### Plan awaiting approval
rv      → command   command_1    because: lead rests at own desk
ruzz    → briefing  briefing_1   because: plan "Parts catalogue v2" awaiting approval
maj     → pantry    pantry_4     because: idle — on a break
kat     → lounge    lounge_2     because: idle — on a break
kyle    → lounge    lounge_3     because: idle — on a break
renz    → lounge    lounge_1     because: idle — on a break
richie  → briefing  briefing_2   because: plan "Parts catalogue v2" awaiting approval
weng    → briefing  briefing_3   because: plan "Parts catalogue v2" awaiting approval
badges on screen: none
opacity: rv:1 ruzz:1 maj:1 kat:1 kyle:1 renz:1 richie:1 weng:1
banner: ALPHA OMEGA working on Garage Rebuild ○ Claude not running
```
- kat's completion is 3 h old → settles straight in the Lounge on load (first sighting places characters without walking; no closing bubble since it is older than 5 min).
- maj is *shown working* with heartbeat 32 min old → dimmed (opacity 0.45) with ⏱ 32m tag; completed/idle agents are never dimmed.
Screenshots: `step10-no-project.png`, `step10-board.png`, `step10-plan-briefing.png`.

## Step 11 — Approvals — **PASS** (terminal bridge proven with a stub `claude` process)

`node scripts/proof/approvals.mjs`:
```
bar: Needs you (1) | Plan awaiting approval: Parts catalogue v1
conflict shown: ⚠ File conflict — server/parts.ts is claimed by T1 and T2. Approve is disabled until the plan is fixed.
Approve disabled: true
direct POST approve → 409 {"error":"two tasks claim the same file","conflicts":[{"file":"server/parts.ts","tasks":["T1","T2"]}]}
after fix — conflict shown: 0 | Approve disabled: false
toast (no Claude live): no live terminal — tell rv yourself
HUD pill: 📋 Parts catalogue v1 · approved | bar present: 0
terminal-status: {"attached":true,"sessions":2,"claudeRunning":true}
beeps when count grew: 1 | bar: Needs you (1) | Approval (high): Drop the legacy parts table
toast (stub claude live): Sent to rv in the terminal.
PTY received: STUB CLAUDE GOT: Approval A-1a2b3c4d approved in ALPHA OMEGA: Drop the legacy parts table. Note: backup first. Proceed.
approvals.json: {"id":"A-1a2b3c4d","title":"Drop the legacy parts table","risk":"high","reason":"irreversible data change","status":"approved","created":"2026-11-22T09:27:15.911Z","agent":"rv","decidedAt":"2026-11-22T09:27:18.103Z","note":"backup first"}
plan.json status: approved (decidedAt set)
bar after all decided: renders nothing
bar with stalled+blocked: Needs you (2) | Blocked: Parts schema (renz) | Stalled 35m: Catalogue API (richie)
page errors: none
```
Notes: the real Claude CLI was not logged in inside the cloud build, so a **stub process named `claude`** (`scripts/proof/stub-claude/claude`, echoes stdin) ran in a PTY to prove detection + injection; with no Claude running the UI shows the quiet "no live terminal — tell rv yourself" notice.
Screenshots: `step11-plan-conflict.png` (conflict, Approve disabled), `step11-plan-modal.png`, `step11-approved-pill.png` (read-only HUD pill, bar gone), `step11-approval-card.png`, `step11-stalled-blocked.png`.

## Step 12 — Projects tab — **PASS** (Claude stood in by the stub process)

`node scripts/proof/projects.mjs`:
```
Claude not live → Load disabled: true | New disabled: true | tooltip: Start Claude in the terminal first (Launch Claude) — rv needs to hear about the switch.
stub claude live → Load enabled: true
sweep overlay shown: 1
toasts: Now working on Turbo Shop
created folder: true | README: true | .git: true
config.activeProject: turbo-shop | header: working on Turbo Shop
duplicate → error toast: a project with slug "turbo-shop" is already registered
direct POST duplicate → 409 | README untouched: true
legacy row: legacy-shop legacy-shop● active /tmp/claude-0/aoroot/work/legacy-shop main dirty Loaded
existing folder unmodified: true
add missing folder → 400 {"error":"folder does not exist: /tmp/claude-0/aoroot/does-not-exist"}
after Load garage — header: working on Garage Rebuild
rows:
  Garage Rebuild garage● active /tmp/claude-0/aoroot/work/garage no git — Loaded
  Turbo Shop turbo-shop /tmp/claude-0/aoroot/projects-root/turbo-shop (no commits) dirty Load
  legacy-shop legacy-shop /tmp/claude-0/aoroot/work/legacy-shop main dirty Load
PTY (stub claude) received:
  STUB CLAUDE GOT: ALPHA OMEGA: switch to project "Turbo Shop" at /tmp/claude-0/aoroot/projects-root/turbo-shop (slug turbo-shop). Put "🎬 @turbo-shop" on its own line in your reply, then read .satoru/projects/turbo-shop/ for its board.
  STUB CLAUDE GOT: ALPHA OMEGA: switch to project "legacy-shop" at /tmp/claude-0/aoroot/work/legacy-shop (slug legacy-shop). Put "🎬 @legacy-shop" on its own line in your reply, then read .satoru/projects/legacy-shop/ for its board.
  STUB CLAUDE GOT: ALPHA OMEGA: switch to project "Garage Rebuild" at /tmp/claude-0/aoroot/work/garage (slug garage). Put "🎬 @garage" on its own line in your reply, then read .satoru/projects/garage/ for its board.
page errors: none
```
Screenshots: `step12-gated.png` (Load/New disabled + note), `step12-sweep.png` (lights-off sweep), `step12-new-project.png` ("Now working on Turbo Shop" toast), `step12-projects.png`.
Projects-root default recorded in `docs/DECISIONS.md`.

## Step 13 — Tasks, Decisions, Brief, Timeline — **PASS**

Server paging test (`npx tsx --test server/test/timeline.test.ts`):
```
# pages=3 sizes=25,25,10 | page1 last=#35 page2 first=#34 (identical ts) | cursor format e.g. 2026-11-22T00:30:29.000Z|2026-11-22.ndjson#30
ok 1 - timeline paging over two days with identical timestamps on a page boundary
```
UI (`node scripts/proof/tabs.mjs`, 80 seeded events over two local days, the 50th/51st newest share a timestamp):
```
tasks[planned]: T1Parts schema db/parts.sql
tasks[in_progress]: T2Catalogue API 5m ago
tasks[review]: T3Catalogue copy
tasks[blocked]: T4Search index waiting on SKU format
tasks[done]: T5Dockerfile ✓ verified || T6API docs ⚠ unverified
live: T7 appeared without reload: 1
decisions order: A-00000002(pending) → plan → A-00000001
brief phase (some not done): EXECUTING
brief phase (all done, not all verified): VALIDATION
brief phase (all done + verified): READY
brief phase (no tasks): no chip
timeline page 1: 50 entries; day groups: Sunday, Nov 22, 2026 / Saturday, Nov 21, 2026
  last on page 1: 2026-11-21T15:29:00.000Z|2026-11-21.ndjson#31
after Load older: 80 entries; first of page 2: 2026-11-21T15:29:00.000Z|2026-11-21.ndjson#30 | duplicates: 0 | Load older still shown: 0
  same timestamp across the boundary: true
filter project=unattributed: 20 entries (expected 20)
filter type=command: 16 entries (expected 16)
filter member=unattributed: 12 entries (expected 12)
live event on top: 9:30:54 AM NOTE LIVE note arrives via SSE
page errors: none
```
Cursor = `<ts>|<dayfile>#<line>`. Screenshots: `step13-tasks.png`, `step13-decisions.png`, `step13-brief.png`, `step13-timeline.png`.

## Step 14 — Launchers — **PASS (start.sh/stop.sh)** · Windows scripts **UNVERIFIED ON WINDOWS**

Written: `start.cmd`/`start.ps1`, `stop.cmd`/`stop.ps1`, `make-shortcut.cmd`/`make-shortcut.ps1` (desktop shortcut named from the card's APP_NAME, icon `launcher/app.ico`), plus `start.sh`/`stop.sh`.
- `.ps1` files are pure ASCII: `grep -P '[^\x00-\x7F]' *.ps1` → no matches. `.cmd` files use CRLF.
- `launcher/app.ico` is generated by `npm run assets` (PNG-in-ICO, 16–256 px) from `raw/icon.png` (placeholder: lead's face on a rounded square with a soft glow in its colour); `file launcher/app.ico` → "MS Windows icon resource - 7 icons".
- No PowerShell exists in this Linux container, so the Windows scripts could not be executed: **UNVERIFIED ON WINDOWS**.

Since step 15 the launchers start the server with `npm start` (no file watching) and the web with `npm run dev`; `./start.sh` was used for every step-15 run after that change.

Linux proof (first run started both halves: "Starting server on port 4317 … Starting web on port 4316 … up: http://localhost:4316"):
```
$ ./start.sh   # 2nd run while up (idempotent)
server already running on port 4317 — leaving it alone.
web already running on port 4316 — leaving it alone.
up: http://localhost:4316
$ curl -s localhost:4316/api/health
{"ok":true}
# kill only the web half (its process group), then start again
$ ./start.sh
server already running on port 4317 — leaving it alone.
Starting web on port 4316 …
up: http://localhost:4316
$ ./stop.sh
ports 4316 and 4317 are free.
$ ./stop.sh   # again
ports 4316 and 4317 are free.
leftover dev processes: 0
4316 closed
4317 closed
```
Root-caused while proving: (1) the backgrounded `cd && setsid …` list ran in a subshell that kept the caller's stdout open (a piped `./start.sh | …` never finished) → whole list now redirected and `exec`'d; (2) `stop.sh` killed only the port listener, and `tsx watch` would respawn it → it now kills the listener's whole process group. Verified: a `tsx watch` started by hand is gone after `stop.sh` (0 leftover processes).

## Step 15 — Verification pass + hardening — **PASS** (18/18 with a REAL Claude Code session)

`node scripts/proof/e2e.mjs` drives the app in Chromium exactly as a user would, against the repo's real `.satoru` started with `./start.sh`:
the real `claude` CLI (v2.1.330) is launched **inside the app's embedded terminal**, the project hooks in `.claude/settings.json` fire for real,
the lead (main session) really writes the plan, the plan is approved via the Needs-You bar, the decision is typed into the live Claude,
the real subagents `weng` and `maj` (from `.claude/agents/`) really write files, and their final messages become the closing bubbles.
(Launched as `claude --permission-mode acceptEdits --allowedTools "Bash Read Write Edit Glob Grep Agent Task" --add-dir <projects root>` so no permission prompt blocks the unattended run;
inherited session markers from the build session were unset so the nested Claude keeps its own transcript.)
```
[   3s] PASS fresh start: lights off 
[   3s] PASS fresh start: "no project loaded" 
[   6s] ✓ Claude detected in the terminal
[   6s] ✓ lights on after a real SessionStart hook
[   6s] PASS lights on from real session_start 
[   9s] ✓ project created + active
[  18s] ✓ lead pinned the session to the project (🎬 @demo-garage)
[  31s] ✓ plan.json awaiting approval
[  33s] PASS plan written by the real lead T1:weng, T2:maj
[  33s] PASS Needs-You bar shows the plan 
[  33s] PASS plan owners gather in the briefing room maj, weng
[  34s] ✓ approval toast
[  34s] PASS plan approval injected into the live Claude Sent to rv in the terminal.
[  43s] ✓ real subagent spawn → member working
[  47s] PASS working members at their desks weng:workspace:working
[  47s] PASS ticker shows real events LIVE maj edited /tmp/claude-0/ao-projects/demo-garage/TAGLINE.md · just now weng edited /tmp/claude-0/ao-projects/demo-garage/docs/USAGE.… · just now maj picked
[  52s] ✓ first real completion
[  53s] ✓ closing bubble at the desk
[  53s] PASS closing line shown (real say from the subagent transcript) … this is a standalone Markdown file in a separate project folder with no build, and my role doesn't run shell commands.
[  53s] ✓ all delegated members completed
[  62s] PASS after closing lines members walked to a break room weng:lounge
[  64s] ✓ 🔔 approval parsed from the lead’s message
[  66s] PASS lead goes to the approval office with "!" 
[  67s] PASS reload keeps the SAME terminal session pid 15856 → 15856, reattached=true
[  67s] PASS no goodbye replay after reload closing placements=0, bubbles=[], walking=[rv]
[  68s] ✓ approval decision toast
[  68s] PASS 🔔 approval decided in the UI and injected A-7c928dab
[  70s] PASS Needs-You bar empty afterwards 
[  76s] ✓ lead finished acknowledging (idle)
[  76s] PASS subagents really wrote the files docs/USAGE.md:exists, TAGLINE.md:exists
[  78s] ✓ lights off after real SessionEnd
[  78s] PASS session end → lights off 

RESULTS
PASS  fresh start: lights off
PASS  fresh start: "no project loaded"
PASS  lights on from real session_start
PASS  plan written by the real lead  — T1:weng, T2:maj
PASS  Needs-You bar shows the plan
PASS  plan owners gather in the briefing room  — maj, weng
PASS  plan approval injected into the live Claude  — Sent to rv in the terminal.
PASS  working members at their desks  — weng:workspace:working
PASS  ticker shows real events  — LIVE maj edited /tmp/claude-0/ao-projects/demo-garage/TAGLINE.md · just now weng edited /tmp/claude-0/ao-projects/demo-garage/docs/USAGE.… · just now maj picked
PASS  closing line shown (real say from the subagent transcript)  — … this is a standalone Markdown file in a separate project folder with no build, and my role doesn't run shell commands.
PASS  after closing lines members walked to a break room  — weng:lounge
PASS  lead goes to the approval office with "!"
PASS  reload keeps the SAME terminal session  — pid 15856 → 15856, reattached=true
PASS  no goodbye replay after reload  — closing placements=0, bubbles=[], walking=[rv]
PASS  🔔 approval decided in the UI and injected  — A-7c928dab
PASS  Needs-You bar empty afterwards
PASS  subagents really wrote the files  — docs/USAGE.md:exists, TAGLINE.md:exists
PASS  session end → lights off
page errors: none
exit=0
```
Screenshots `docs/proof/step15-01-fresh.png` … `step15-11-session-end.png` (lights off → on, new project, plan awaiting + modal, members at desks, closing line at the desk, break room, 🔔 approval in the Approval Office, after reload, session end → lights off).

### Failures found while driving the app, root-caused, fixed, re-verified
| Symptom | Root cause | Fix |
|---|---|---|
| Terminal pid changed after reload; Claude gone | the daemon ran under `tsx watch`; editing a server-imported file restarted it and killed every PTY | launchers start the server with `npm start` (no watching); `dev` script kept for development |
| Member stayed at the desk forever after finishing | the 2.4 s closing timer was cleared by the effect cleanup whenever any other SSE update arrived inside those 2.4 s | closing release is driven by an interval tied to the closing set, not to project updates |
| Closing line never shown for a 6-second job | the member finished while still walking to the desk; bubbles hide while walking and the window had already expired | the window starts when the member has settled at the desk |
| Member stayed at the desk although the subagent had finished | lead had not yet flipped the task from `in_progress` | a completion newer than the task's last update counts as finished |
| Lead shown "working" on `<task-notification>…` | background-agent reports arrive as UserPromptSubmit | logged as a system prompt, no state change |
| A long file path in the ticker became `[REDACTED-B64]` | base64 redaction pattern allowed `/` | `/` and `.` excluded from the token class (test added) |
| Claude stopped at a Bash permission prompt (first attempt) | expected interactive behaviour | unattended run pre-allows tools; a real user simply answers the prompt |
| Real phantom `SubagentStop` events (empty agent_type) arrived 3× per run | Claude Code behaviour | already handled: ticker-only, `payload.phantom=true`, no state change |

### Known-pitfall checklist
- Hooks registered with the full `$CLAUDE_PROJECT_DIR` path — all 8 entries are `node "$CLAUDE_PROJECT_DIR/hooks/telemetry.mjs" <event>`. ✔
- Phantom SubagentStop → ticker-only (seen live in this run). ✔
- Subagent file names match the card exactly (`match card: true`, step 7; re-checked by sync in step 16). ✔
- Refresh never kills the PTY (same pid after reload, step 5 + step 15). ✔
- No replay of old completions after reload (step 15 check; seen-completions persisted per browser). ✔
- All `.satoru` writers use lock + temp + rename (`grep` of server/hooks: the only raw writes are inside `hooks/lib/io.mjs` and the README of a *new* project folder); watcher uses `awaitWriteFinish {stabilityThreshold:120, pollInterval:25}`. ✔
- Hook writes explicit UTF-8 (`{ encoding: 'utf8' }` on writeFile/appendFile; stdin decoded as UTF-8). ✔
- One scale per character + shared baseline (step 3). ✔  · Legs never cut walls (2256 routes, step 9). ✔
- Reconcile pass (step 8 test). ✔  · Dim only stale *working* agents (step 10). ✔
- Nothing from the card hardcoded: grep for member names, room labels, app name, accent, theme and character outside the card and generated files (card JSON, officeAssets.ts, `.claude/agents`, CLAUDE.md playbook block) and docs → only two geometry comments in `scripts/office-layout.mjs` (room keys of the placeholder map) and runtime data in `.satoru`. Fixed during this pass: terminal selection colour, hook header comment, agent personality text (now from the card's character + theme), e2e prompt (now picks members by role). ✔
- node-pty on Windows: node-pty 1.1.0 ships `prebuilds/win32-x64` for Node 22 LTS; README says to install Node LTS 22.x. ✔ (not executed on Windows)

Full suite after the fixes: `npm test` → server 7/7, hook 5/5, routes+placement 6/6; `npm run check` (card + both typechecks) OK; `vite build` OK.

## Step 16 — Card-change workflow — **PASS**

`npm run card:sync` (`scripts/sync-card.mjs`) run in a temp copy of the repo (`/tmp/claude-0/cardtest`, real raw art + assets), then restored:
```
$ (rename weng → wendy in mission.card.md) && npm run card:sync
✓ card: ALPHA OMEGA · 8 members · lead rv
  added: — · removed: — · renamed: weng→wendy
  raw/weng/ → raw/wendy/ (art kept for the renamed member)
✓ assets rebuilt; WORK_HOME: rv→command_1 ruzz→command_2 maj→workspace_1 kat→server_1 kyle→workspace_2 renz→server_2 richie→server_3 wendy→workspace_3
  deleted .claude/agents/weng.md (generated, no longer on the card as a subagent)
✓ agents: ruzz.md, maj.md, kat.md, kyle.md, renz.md, richie.md, wendy.md · CLAUDE.md lead playbook updated

Art checklist:
  OFFICE MAP: no change needed
  all member art present and up to date

agents dir: kat.md kyle.md maj.md renz.md richie.md ruzz.md wendy.md 
asset folders: kat kyle maj renz richie ruzz rv wendy 
raw folders: raw/kat/ raw/kyle/ raw/maj/ raw/renz/ raw/richie/ raw/ruzz/ raw/rv/ raw/wendy/ 
sprites in officeAssets.ts for wendy: 8

$ (kat: character → GRUMPY ROBOTIC WELDER; richie replaced by zed/qa) && npm run card:sync
✓ card: ALPHA OMEGA · 8 members · lead rv
  added: zed · removed: richie · renamed: —
[31m✖ asset pipeline: 4 raw file(s) missing:[0m
  - raw/zed/front.png
  - raw/zed/side.png
  - raw/zed/back.png
  - raw/zed/portrait.png
Add them (or run `npm run placeholder-art -- --missing-only`) and re-run `npm run assets`.
✖ assets NOT rebuilt (see above) — fix, then run `npm run card:sync` again
  deleted .claude/agents/richie.md (generated, no longer on the card as a subagent)
✓ agents: ruzz.md, maj.md, kat.md, kyle.md, renz.md, zed.md, wendy.md · CLAUDE.md lead playbook updated

Art checklist:
  REMAKE    raw/kat/front.png  — character/details changed ("CHEERFUL ROBOTIC MECHANIC" → "GRUMPY ROBOTIC WELDER")
  REMAKE    raw/kat/side.png  — character/details changed ("CHEERFUL ROBOTIC MECHANIC" → "GRUMPY ROBOTIC WELDER")
  REMAKE    raw/kat/back.png  — character/details changed ("CHEERFUL ROBOTIC MECHANIC" → "GRUMPY ROBOTIC WELDER")
  REMAKE    raw/kat/portrait.png  — character/details changed ("CHEERFUL ROBOTIC MECHANIC" → "GRUMPY ROBOTIC WELDER")
  MISSING   raw/zed/front.png
  MISSING   raw/zed/side.png
  MISSING   raw/zed/back.png
  MISSING   raw/zed/portrait.png
  OFFICE MAP: no change needed
exit=1

$ (restore the original card) && npm run card:sync
✓ card: ALPHA OMEGA · 8 members · lead rv
  added: — · removed: — · renamed: wendy→weng
  raw/wendy/ → raw/weng/ (art kept for the renamed member)
✓ assets rebuilt; WORK_HOME: rv→command_1 ruzz→command_2 maj→workspace_1 kat→server_1 kyle→workspace_2 renz→server_2 richie→server_3 weng→workspace_3
  deleted .claude/agents/wendy.md (generated, no longer on the card as a subagent)
  deleted .claude/agents/zed.md (generated, no longer on the card as a subagent)
✓ agents: ruzz.md, maj.md, kat.md, kyle.md, renz.md, richie.md, weng.md · CLAUDE.md lead playbook updated

Art checklist:
  OFFICE MAP: no change needed
  all member art present and up to date
```
Restore check after the last sync (md5 of the card, generated JSON, `officeAssets.ts`, every agent file, CLAUDE.md, all of `web/public/assets/` and `raw/`):
```
card, generated JSON, officeAssets.ts, agents, CLAUDE.md: identical to before
all assets + raw art identical to before
```
Only files carrying `alpha-omega-generated: true` are ever deleted; hand-written agent files are reported and left alone.
Baseline for diffs is `web/src/card.synced.json` (written only after a successful sync), because `card.mjs` rewrites `card.generated.json` on every dev start.
Bugs found by this proof and fixed: diff baseline lost after a failed sync; `make-placeholder-art --missing-only` wiped the committed `art/placeholder/` copy.
