# ALPHA OMEGA

(full README is written in the final step)

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
