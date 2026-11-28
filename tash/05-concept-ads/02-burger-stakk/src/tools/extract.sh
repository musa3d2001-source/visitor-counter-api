#!/usr/bin/env bash
# STAKK photoreal: rebuild src/footage/ (graded, retimed 30 fps JPEG sequences, 1080x1920, q:v 3) from the
# CD-approved Higgsfield clips in footage/ai/*.mp4, following src/edl.json. Only the frames the edit uses are written.
#   bash src/tools/extract.sh            # all sequences
#   bash src/tools/extract.sh S03a S05   # just some
# Needs ffmpeg + python3 (numpy, PIL). Deterministic: same EDL → same JPEGs. Takes a few minutes on 1 core.
# The one-stage build (S03a–S08c) is cut from the four chained clips c1–c4, colour-matched to b7 (see conform.py).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
for c in b1_smash_v3 b2_sear c1_patty c2_double c3_toppings c4_sauce b7_crown; do
  [ -f "$HERE/../../footage/ai/$c.mp4" ] || { echo "missing footage/ai/$c.mp4"; exit 1; }
done
python3 "$HERE/conform.py" "$@"
du -sh "$HERE/../footage"
