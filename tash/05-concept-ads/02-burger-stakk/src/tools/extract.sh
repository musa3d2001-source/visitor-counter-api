#!/usr/bin/env bash
# STAKK photoreal: rebuild src/footage/ (graded, retimed 30 fps JPEG sequences, 1080x1920, q:v 3) from the
# CD-approved Higgsfield clips in footage/ai/*.mp4, following src/edl.json. Only the frames the edit uses are written.
#   bash src/tools/extract.sh            # all sequences
#   bash src/tools/extract.sh S03 S05    # just some
# Needs ffmpeg + python3 (numpy, PIL). Deterministic: same EDL → same JPEGs. Takes ~4–5 min on 1 core.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
for c in b1_smash b2_crust b3_heel b4_melt b5_stack b6_sauce b7_crown; do
  [ -f "$HERE/../../footage/ai/$c.mp4" ] || { echo "missing footage/ai/$c.mp4"; exit 1; }
done
python3 "$HERE/conform.py" "$@"
du -sh "$HERE/../footage"
