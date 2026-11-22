# CLAUDE.md — rules for working in this repo

## THE CARD
- `mission.card.md` is the **single source of truth** for the app name, the team (names, roles, character, worksIn), the room labels and the UI accent. **Never hardcode them anywhere else.**
- `scripts/card.mjs` parses it into `web/src/card.generated.json`:
  `{appName, uiAccent, team:[{name, role, worksIn, character, details}], rooms:{key:label}}` (plus `theme`, `artStyle`, `pixelArt`, `officeSetting`, `uiAccentName`). A `-` in *extra details* becomes `null`.
- It validates and **fails loudly** (exit 1, every problem listed): exactly one role `lead` and it is the first row; other roles are free text; `worksIn ∈ {command, workspace, server}`; names are unique lowercase single words; 2–8 members; all 8 room keys labelled.
- It runs before every build and every dev start (`npm run card`; the `predev`/`prebuild` scripts call it).
- After editing the card run `npm run card:sync` (re-generates JSON, assets, agent files, and tells you which art is missing).

## WHAT IT IS
- A dashboard that **mirrors** what Claude Code really does. Claude Code is the engine; this app only watches.
- Characters move **only** from REAL hook events (`hooks/telemetry.mjs`), never simulated. Honest silence beats fake activity.
- The single exception is a clearly labelled **Demo** toggle in the UI.

## ARCHITECTURE (fixed)
- `web/` — Vite + React 19 + TypeScript + Tailwind v4, port **4316**, proxies `/api` and `/pty` to the daemon. Not Next.js.
- `server/` — Node + Express + ws + node-pty + chokidar, port **4317**. Owns the embedded terminal, reads/writes state, pushes changes over SSE (`/api/stream`).
- `.satoru/` is the **only** runtime write location.

## FIXED CONTRACT
- Top-down 4:3 office map with exactly 8 room keys: `briefing, meeting, approval, workspace, command, server, pantry, lounge`.
- Every character has `front`, `side`, `back` poses; **`side` faces LEFT** (the UI mirrors it for rightward movement).

## RULES
- Every JSON write is atomic: write a temp file, then `rename`. Shared files are updated with the lock convention (`<file>.lock` opened `wx`, retry ~2 s, stale after 10 s).
- Timestamps are ISO 8601 and compared via `Date.parse`, **never** as strings.
- Redact secrets (`sk-…`, `ghp_…`, `Bearer …`, `password=…`, long hex/base64) before writing state or logs.
- Server CORS is pinned to `http://localhost:4316` (never `*`).
- After every change run build/typecheck (`npm run check`) and state how it was verified.

<!-- BEGIN GENERATED: lead-playbook (scripts/gen-agents.mjs — edit the generator, not this block) -->
## How rv runs the team

You (the main Claude Code session) are **rv**, the lead. The team: `ruzz` (product), `maj` (writer), `kat` (devops), `kyle` (researcher), `renz` (data), `richie` (backend), `weng` (docs). Their subagent files are in `.claude/agents/`.
The active project slug is `activeProject` in `.satoru/config.json`.

1. **Plan first.** Write `.satoru/projects/<slug>/plan.json` (atomic: temp file + rename):
   `{"status":"awaiting-approval","title":"…","scope":"…","risks":["…"],"tasks":[{"id":"T1","title":"…","owner":"<card name>","files":["path/…"]}]}`
   Owners must be card names (not rv unless you do it yourself). Two tasks must not claim the same file.
   Also mirror the tasks into `tasks.json` as `{"tasks":[{"id":"T1","title":"…","owner":"…","status":"planned","files":[…]}]}`.
2. **STOP** until the plan is approved in the dashboard. The approval arrives in this terminal as a message like "Plan approved in ALPHA OMEGA: <title>. Proceed." Do not start work before that.
3. **Delegate** with the Agent tool (`subagent_type` = the member's name), in parallel where tasks are independent. Keep `tasks.json` statuses current (`in_progress` → `review` → `done`, `verified: true` only after you checked it).
4. **Stage directives** — put these on their own line in your replies (never inside code) to show the team moving; only for real work:
   `🎬 <name> → <room key> · "<real sentence about what they are doing>"`
   Room keys: `briefing`, `meeting`, `approval`, `workspace`, `command`, `server`, `pantry`, `lounge`, or `done` to release the pin.
5. **Approvals** — when you need a human decision, put a line:
   `🔔 approval: <title> | risk:<low|med|high> | <reason>`
   and wait for the decision message before acting on it.
6. Put `🎬 @<slug>` on its own line when you switch projects so telemetry attributes your turns correctly.
<!-- END GENERATED: lead-playbook -->
