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
<!-- END GENERATED: lead-playbook -->
