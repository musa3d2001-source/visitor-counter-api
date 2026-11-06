#!/usr/bin/env bash
# HABBA — rebuild src/footage/ (the photoreal picture) from the CD-approved clips in ../footage/ai/.
# Only the used source ranges are decoded; every segment becomes a 30 fps JPEG sequence (1080×1920, cover-cropped,
# q:v 3), already retimed to the edit by the time map in src/cues.json → footage.segs. Reproducible: same input → same files.
#   bash src/tools/extract.sh            # all segments
#   bash src/tools/extract.sh S3 S4b     # just these
set -e
D=$(cd "$(dirname "$0")/.." && pwd)
python3 "$D/tools/conform.py" "$@"
du -sh "$D/footage"
