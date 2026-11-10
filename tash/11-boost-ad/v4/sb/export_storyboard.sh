#!/usr/bin/env bash
# Rebuild the round-3 storyboard from the fitted stills (0 credits; layout only).
# usage: bash export_storyboard.sh [work dir]     -> rewrites ../storyboard/r3/
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="${1:-$(mktemp -d)}"
OUT="$HERE/../storyboard/r3"
rm -rf "$OUT" "$WORK"/{spec,key,part1,part2,part3,options,options1,options2,tiktok,r45}
mkdir -p "$WORK" "$OUT"/{frames,options,tiktok,r45,spec,phone}

node "$HERE/mk_storyboard.mjs" "$WORK/spec"
node "$HERE/compose.mjs" --frames "$WORK/spec/key.frames.json"     --out "$WORK/key"     --cols 4
for p in 1 2 3; do node "$HERE/compose.mjs" --frames "$WORK/spec/part$p.frames.json" --out "$WORK/part$p" --cols 2; done
node "$HERE/compose.mjs" --frames "$WORK/spec/options.frames.json" --out "$WORK/options" --cols 4
for p in 1 2; do node "$HERE/compose.mjs" --frames "$WORK/spec/options$p.frames.json" --out "$WORK/options$p" --cols 2; done
node "$HERE/compose.mjs" --frames "$WORK/spec/tiktok.frames.json"  --out "$WORK/tiktok"  --cols 3 --ui tt
node "$HERE/compose.mjs" --frames "$WORK/spec/r45.frames.json"     --out "$WORK/r45"     --cols 3

jpg() { ffmpeg -v error -y -i "$1" ${3:+-vf "$3"} -q:v 3 -pix_fmt yuvj444p "$2"; }
for f in "$WORK"/key/[0-9]*.png; do jpg "$f" "$OUT/frames/$(basename "${f%.png}").jpg"; done
for f in "$WORK"/options/o*.png; do jpg "$f" "$OUT/options/$(basename "${f%.png}").jpg"; done
for f in "$WORK"/tiktok/t*.png;  do jpg "$f" "$OUT/tiktok/$(basename "${f%.png}").jpg"; done
for f in "$WORK"/r45/r45*.png;   do jpg "$f" "$OUT/r45/$(basename "${f%.png}").jpg" "crop=1080:1350:0:0"; done

cp "$WORK/key/sheet.jpg"        "$OUT/01-storyboard.jpg"                 # all 18 frames, 4 across (desktop)
cp "$WORK/key/sheet-ui.jpg"     "$OUT/02-storyboard-instagram.jpg"       # the same under a rough Instagram chrome + safe-zone guides
cp "$WORK/options/sheet.jpg"    "$OUT/03-options.jpg"                    # our picks and the alternatives
cp "$WORK/tiktok/sheet-ui.jpg"  "$OUT/04-tiktok.jpg"                     # TikTok chrome check + TikTok ending
cp "$WORK/r45/sheet.jpg"        "$OUT/05-4x5.jpg"                        # 4:5 layouts
for p in 1 2 3; do cp "$WORK/part$p/sheet.jpg" "$OUT/phone/storyboard-$p-of-3.jpg"; done   # phone-readable: 6 frames each, 2 across
for p in 1 2; do cp "$WORK/options$p/sheet.jpg" "$OUT/phone/options-$p-of-2.jpg"; done              # phone-readable picks: pick beside alternative
cp "$WORK/spec/"*.frames.json   "$OUT/spec/"

# QC sheet: the 18 frames at 25% (270x480), 9 x 2, first frame top right: how the ad reads on a small tile
ls "$WORK"/key/[0-9]*.png | sort > "$WORK/k.txt"
row() { sed -n "$1,$2p" "$WORK/k.txt" | tac | awk '{printf " -i %s", $0}'; }
ffmpeg -v error -y $(row 1 9) $(row 10 18) -filter_complex \
  "$(for i in $(seq 0 17); do printf '[%d]scale=270:480:flags=area,pad=282:492:6:6:0x141412[t%d];' "$i" "$i"; done)$(for i in $(seq 0 8); do printf '[t%d]' "$i"; done)hstack=9[r0];$(for i in $(seq 9 17); do printf '[t%d]' "$i"; done)hstack=9[r1];[r0][r1]vstack=2" \
  -q:v 2 -pix_fmt yuvj444p "$OUT/qc-small-25pct.jpg"

ls -la "$OUT" "$OUT/phone" && du -sh "$OUT"
