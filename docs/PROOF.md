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
