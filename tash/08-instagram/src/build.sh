#!/usr/bin/env bash
# Rebuild the Instagram launch package (everything except the BTS video, which has its own steps below).
#   bash 08-instagram/src/build.sh          # from anywhere
#   bash 08-instagram/src/build.sh --bts    # also re-extract plates, re-score and re-render the BTS reel (~8 min)
# Order matters: post 6 feeds a picture in post 7; every upload file feeds the profile preview.
set -euo pipefail
TASH="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$TASH"
R=review/ig-package; mkdir -p "$R/ba" "$R/profile"
T=03-templates/render.mjs; S=08-instagram/src

echo "── reels 1, 2, 3, 9: copy the teams' masters, write covers"
python3 $S/package_reels.py

echo "── post 6: the «before» render (same camera as the LAYL hero frame), then the post"
node _system/tools/render.mjs --page $S/ba/before.html --stills 0 --stills-dir $R/ba --prefix before >/dev/null
cp $R/ba/before_000.00.png $S/ba/plates/before-wide.png
cp 05-concept-ads/01-perfume-layl/still-hero.png $S/ba/plates/after-still-hero.png
node $T $S/templates/before-after.html $S/data/06-before-after.json 08-instagram/06-before-after-post/post.png

echo "── carousels 4, 7, 8"
node $T $S/templates/deck.html $S/data/04-ehna-tash.json 08-instagram/04-ehna-tash-carousel/slide.png
node $T $S/templates/deck.html $S/data/07-services.json 08-instagram/07-services-carousel/slide.png
node $T $S/templates/deck.html $S/data/08-how-to-order.json 08-instagram/08-how-to-order-carousel/slide.png

if [ "${1:-}" = --bts ]; then
  echo "── BTS reel: plates, score, render"
  bash $S/bts/extract.sh
  python3 $S/bts/audio.py
  node _system/tools/render.mjs --page $S/bts/index.html --out 08-instagram/05-bts-reel/reel.mp4 --audio $S/bts/audio.wav --workers 2
fi
echo "── BTS cover"
node $T $S/templates/reel-cover-bts.html $S/data/05-bts-cover.json 08-instagram/05-bts-reel/cover.png

echo "── profile previews (dark = profile-preview.png, light = profile-preview-light.png)"
node _system/tools/render.mjs --page $S/profile/index.html --stills 0 --stills-dir $R/profile --prefix dark >/dev/null
node _system/tools/render.mjs --page "$S/profile/index.html?mode=light" --stills 0 --stills-dir $R/profile --prefix light >/dev/null
cp $R/profile/dark_000.00.png 08-instagram/profile-preview.png
cp $R/profile/light_000.00.png 08-instagram/profile-preview-light.png

echo "── captions"
python3 $S/check_captions.py
