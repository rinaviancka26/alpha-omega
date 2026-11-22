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
