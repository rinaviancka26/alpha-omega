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
