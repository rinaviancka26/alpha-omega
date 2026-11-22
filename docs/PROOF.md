# ALPHA OMEGA — build proof

Every step was verified by running real commands in the cloud build session (Linux, Node 22). Screenshots are in `docs/proof/`.
Windows-only parts are marked **UNVERIFIED ON WINDOWS** — they could not be executed here.

| Step | Result |
|------|--------|

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
