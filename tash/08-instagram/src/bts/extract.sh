#!/usr/bin/env bash
# BTS reel «من الفكرة للإعلان» — build the picture plates the page reads (run from anywhere; needs ~300 MB of scratch).
#
#  1. Re-renders the three LAYL passes (wire · clay · final/clean) over the S3 orbit, 3.00–6.00 s of the ad,
#     at 60 fps: true in-between frames from the LAYL page, so the reel can play them at half speed with no
#     frame blending and no optical-flow guesses. (~6 min with 2 workers; LAYL's own page, unchanged.)
#  2. Extracts every frame of those passes, plus the real ad's ending (LAYL-concept-9x16.mp4, 10.50–15.90 s:
#     hero cut, end card, CONCEPT AD slate, TASH sting), to JPEG sequences in review/ig-package/bts/frames/.
#
#  SKIP_RENDER=1 bash 08-instagram/src/bts/extract.sh   → reuse existing pass renders, only re-extract.
set -euo pipefail
TASH="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$TASH"
OUT=review/ig-package/bts
mkdir -p "$OUT/passes60"
if [ "${SKIP_RENDER:-0}" != 1 ]; then
  for p in wire clay final; do
    q="pass=$p"; [ "$p" = final ] && q="clean=1"
    node _system/tools/render.mjs --page "05-concept-ads/01-perfume-layl/src/index.html?$q" \
      --out "$OUT/passes60/$p.mp4" --from 3 --to 6 --fps 60 --workers 2
  done
fi
for p in wire clay final; do
  rm -rf "$OUT/frames/$p"; mkdir -p "$OUT/frames/$p"
  ffmpeg -v error -y -i "$OUT/passes60/$p.mp4" -q:v 2 -start_number 0 "$OUT/frames/$p/%04d.jpg"
done
# the ad's ending: frames 315..476 (10.50 → 15.90 s at 30 fps), renumbered from 0
rm -rf "$OUT/frames/ad"; mkdir -p "$OUT/frames/ad"
ffmpeg -v error -y -i 05-concept-ads/01-perfume-layl/LAYL-concept-9x16.mp4 \
  -vf "select='between(n\,315\,476)',setpts=N/FRAME_RATE/TB" -fps_mode passthrough -q:v 2 -start_number 0 "$OUT/frames/ad/%04d.jpg"
for d in wire clay final ad; do printf '%-6s %s frames\n' "$d" "$(ls "$OUT/frames/$d" | wc -l)"; done
