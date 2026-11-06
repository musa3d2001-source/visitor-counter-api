#!/usr/bin/env bash
# MOR — rebuild src/footage/ (the picture) from the CD-approved clips in ../footage/ai/.
# Only the used source ranges are decoded; every segment becomes a 30 fps JPEG sequence (1080×1920, cover-cropped from
# 1080×1912, q:v 3), retimed by the time map in src/cues.json → footage.segs. Same input → same files.
#   bash src/tools/extract.sh          # all segments
#   bash src/tools/extract.sh A G      # just these
set -e
D=$(cd "$(dirname "$0")/.." && pwd)
python3 "$D/tools/conform.py" "$@"
du -sh "$D/footage"
