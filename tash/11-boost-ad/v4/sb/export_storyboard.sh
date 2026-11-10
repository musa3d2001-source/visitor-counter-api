#!/usr/bin/env bash
# Rebuild the round-3 storyboard from the fitted stills (0 credits; layout only).
# usage: bash export_storyboard.sh [work dir]     -> writes ../storyboard/r3/
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="${1:-$(mktemp -d)}"
OUT="$HERE/../storyboard/r3"
mkdir -p "$WORK" "$OUT"/{frames,options,tiktok,r45,spec}

node "$HERE/mk_storyboard.mjs" "$WORK/spec"
node "$HERE/compose.mjs" --frames "$WORK/spec/key.frames.json"     --out "$WORK/key"     --cols 4
node "$HERE/compose.mjs" --frames "$WORK/spec/options.frames.json" --out "$WORK/options" --cols 4
node "$HERE/compose.mjs" --frames "$WORK/spec/tiktok.frames.json"  --out "$WORK/tiktok"  --cols 3 --ui tt
node "$HERE/compose.mjs" --frames "$WORK/spec/r45.frames.json"     --out "$WORK/r45"     --cols 3

jpg() { ffmpeg -v error -y -i "$1" ${3:+-vf "$3"} -q:v 3 -pix_fmt yuvj444p "$2"; }
for f in "$WORK"/key/*.png;     do jpg "$f" "$OUT/frames/$(basename "${f%.png}").jpg"; done
for f in "$WORK"/options/*.png; do jpg "$f" "$OUT/options/$(basename "${f%.png}").jpg"; done
for f in "$WORK"/tiktok/*.png;  do jpg "$f" "$OUT/tiktok/$(basename "${f%.png}").jpg"; done
for f in "$WORK"/r45/*.png;     do jpg "$f" "$OUT/r45/$(basename "${f%.png}").jpg" "crop=1080:1350:0:0"; done

cp "$WORK/key/sheet.jpg"        "$OUT/01-storyboard.jpg"
cp "$WORK/key/sheet-ui.jpg"     "$OUT/02-storyboard-instagram.jpg"
cp "$WORK/options/sheet.jpg"    "$OUT/03-options.jpg"
cp "$WORK/tiktok/sheet-ui.jpg"  "$OUT/04-tiktok.jpg"
cp "$WORK/spec/"*.frames.json   "$OUT/spec/"

# 4:5 sheet: the three cropped frames side by side, first frame on the right (Arabic reading order)
ffmpeg -v error -y -i "$OUT/r45/r45_16_f470.jpg" -i "$OUT/r45/r45_09_f140.jpg" -i "$OUT/r45/r45_01_f000.jpg" \
  -filter_complex "[0]pad=1120:1390:20:20:0x141412[a];[1]pad=1120:1390:20:20:0x141412[b];[2]pad=1120:1390:20:20:0x141412[c];[a][b][c]hstack=3,scale=1680:-2" \
  -q:v 3 -pix_fmt yuvj444p "$OUT/05-4x5.jpg"

# 25% sheet (270x480 tiles), 8 x 2, first frame top right: how the ad reads on a small phone tile
ls "$WORK"/key/[0-9]*.png | sort > "$WORK/k.txt"
row() { sed -n "$1,$2p" "$WORK/k.txt" | tac | awk '{printf " -i %s", $0}'; }
ffmpeg -v error -y $(row 1 8) $(row 9 16) -filter_complex \
  "$(for i in $(seq 0 15); do printf '[%d]scale=270:480:flags=area,pad=282:492:6:6:0x141412[t%d];' "$i" "$i"; done)$(for i in $(seq 0 7); do printf '[t%d]' "$i"; done)hstack=8[r0];$(for i in $(seq 8 15); do printf '[t%d]' "$i"; done)hstack=8[r1];[r0][r1]vstack=2" \
  -q:v 2 -pix_fmt yuvj444p "$OUT/06-small-25pct.jpg"

ls -la "$OUT" && du -sh "$OUT"
