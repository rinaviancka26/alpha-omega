# ALPHA OMEGA

A local, browser-based **visual office** for your Claude Code agent team. Every team member from
`mission.card.md` is a cartoon character that walks between rooms — Briefing, Meeting, Approval, Workspace,
Command, Server, Pantry, Lounge — **driven only by real Claude Code hook events**. Claude Code is the engine;
this app only mirrors what it really does (honest silence beats fake activity; the clearly labelled **Demo**
toggle is the only simulation).

What you get:
- **Office** — top-down map, lights that come on with a real Claude session, characters walking corridors to
  their desks / the meeting room / the break rooms, speech bubbles with what they actually said, a live ticker, a roster.
- **Needs-You bar** — appears only when something waits for you (plan approval, 🔔 approvals, blocked or stalled tasks); decisions are typed straight into the running Claude.
- **Projects, Tasks, Decisions, Brief, Timeline** tabs, all live.
- An **embedded terminal** (real shell, survives page reloads) with *Launch Claude* and *Wake <lead>* buttons.

> The single source of truth for names, roles, rooms, colours and the app name is **`mission.card.md`**.
> After editing it run `npm run card:sync`.

## Run it on Windows
1. Install **Node.js LTS 22.x** from <https://nodejs.org> (the "LTS" button; keep "Automatically install the necessary tools" ticked —
   `node-pty` ships prebuilt binaries for Node 22 on Windows x64, the build tools are only a fallback). Git is optional.
2. Double-click **`start.cmd`**. The first run installs dependencies (a few minutes), then opens two small windows
   (server on port 4317, web on port 4316) and your browser at <http://localhost:4316>. Running it again only starts what is down.
3. **`stop.cmd`** frees both ports. **`make-shortcut.cmd`** puts a desktop shortcut (named after the app, with its icon).
4. In the app's terminal press **Launch Claude** (or type `claude`). The first time, Claude asks you to trust this folder:
   say yes — that is what loads the hooks in `.claude/settings.json`. The office lights come on.
5. **Projects → + New project** (or *+ Add existing folder*), then talk to the lead in the terminal. The lead follows
   "How rv runs the team" in `CLAUDE.md`: plan → you approve in the Needs-You bar → the team works.

macOS/Linux: `./start.sh` / `./stop.sh` do the same (logs in `.satoru/run/`).

Developer commands (repo root): `npm run card`, `npm run card:sync`, `npm run assets`, `npm run check` (card + typecheck),
`npm test`, `npm run build`. Coordinate picker for a new office map: start the app and open <http://localhost:4316/picker.html>.

## How it fits together
```
mission.card.md ──scripts/card.mjs──► web/src/card.generated.json ──► UI, assets, agents, launchers
raw/ art ──scripts/build-assets.mjs──► web/public/assets/ + web/src/officeAssets.ts (+ launcher/app.ico)
Claude Code hooks ──hooks/telemetry.mjs──► .satoru/ (events/*.ndjson, projects/<slug>/*.json)
.satoru/ ──chokidar──► server :4317 ──SSE /api/stream──► web :4316 (Vite + React 19 + Tailwind v4)
server :4317 ── /pty WebSocket ──► embedded terminal (node-pty; reload re-attaches the same shell)
```
`.satoru/` is the only place the app writes at runtime. Every JSON write is atomic (temp file + rename) and shared
files are updated under a `<file>.lock`.

## Replacing the placeholder art
The art shipped in `art/placeholder/` (and generated into `raw/`) is **placeholder** robot mechanics and a placeholder map.
Put your real art in `raw/` (gitignored) with this layout, then run `npm run assets`:

```
raw/
  office.png               top-down office map, 4:3 (it is resized to exactly 1448×1086)
  icon.png                 optional, used for the favicon / desktop shortcut
  <name>/front.png         one folder per card member, folder name = card name
  <name>/side.png          side view, character FACING LEFT
  <name>/back.png
  <name>/portrait.png
```
Transparent PNGs are best; opaque ones get their background flood-filled from the four corners.
If any file is missing, `npm run assets` lists exactly which ones and stops.
To regenerate placeholders only for the missing files: `npm run placeholder-art -- --missing-only`.

## Telemetry hooks
`.claude/settings.json` (project level) registers `hooks/telemetry.mjs` for SessionStart, SessionEnd, UserPromptSubmit,
PreToolUse (`Task|Agent`), PostToolUse (`Edit|Write|NotebookEdit`, `Bash`), SubagentStop and Stop, always as
`node "$CLAUDE_PROJECT_DIR/hooks/telemetry.mjs" <event>`. The hook never fails a Claude session and exits silently if `.satoru/` is missing.

### Optional: user-level registration (to see sessions you run in *other* folders)
Nothing in your user settings is touched automatically. If you want it, add this to `%USERPROFILE%\.claude\settings.json`
(macOS/Linux: `~/.claude/settings.json`), replacing `C:/path/to/alpha-omega` with the absolute path of this repo
(forward slashes are fine on Windows):
```json
{
  "hooks": {
    "SessionStart":     [{ "hooks": [{ "type": "command", "command": "node \"C:/path/to/alpha-omega/hooks/telemetry.mjs\" session_start" }] }],
    "SessionEnd":       [{ "hooks": [{ "type": "command", "command": "node \"C:/path/to/alpha-omega/hooks/telemetry.mjs\" session_end" }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node \"C:/path/to/alpha-omega/hooks/telemetry.mjs\" prompt" }] }],
    "PreToolUse":  [{ "matcher": "Task|Agent", "hooks": [{ "type": "command", "command": "node \"C:/path/to/alpha-omega/hooks/telemetry.mjs\" spawn" }] }],
    "PostToolUse": [
      { "matcher": "Edit|Write|NotebookEdit", "hooks": [{ "type": "command", "command": "node \"C:/path/to/alpha-omega/hooks/telemetry.mjs\" file_touch" }] },
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "node \"C:/path/to/alpha-omega/hooks/telemetry.mjs\" command" }] }
    ],
    "SubagentStop": [{ "hooks": [{ "type": "command", "command": "node \"C:/path/to/alpha-omega/hooks/telemetry.mjs\" done" }] }],
    "Stop":         [{ "hooks": [{ "type": "command", "command": "node \"C:/path/to/alpha-omega/hooks/telemetry.mjs\" idle" }] }]
  }
}
```
Sessions inside this repo would then fire both registrations; the hook de-duplicates identical calls within 10 s.

## Known limits
- **Windows scripts are unverified on Windows** — they were written in a Linux build session without PowerShell (see `docs/PROOF.md`).
- Placeholder art is deliberately simple; the office coordinates match the placeholder map only. With your own `raw/office.png` you must redo rooms/seats/doors/corridors in the picker and export to `web/src/office-coordinates.json`.
- Claude Code must run in the embedded terminal for decisions to be typed into it automatically; otherwise the app tells you to tell the lead yourself.
- Attribution of file edits/commands needs the session to be pinned to a project (`🎬 @slug`, done automatically on project switch) or a working directory inside the project.
- Hook payload fields can change between Claude Code versions; the hook ignores what it doesn't understand and never fails the session.
- The server is started without file watching (`npm start`) so editing code never kills your terminal; restart it after changing `server/`.
- See `docs/DECISIONS.md` for defaults chosen without asking, and `docs/PROOF.md` for what was verified and how.
