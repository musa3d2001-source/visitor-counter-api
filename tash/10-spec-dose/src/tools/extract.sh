#!/usr/bin/env bash
# DOSE: rebuild src/footage/ (the picture) from the clips in ../footage/ai/: decode only the used source frames, apply
# the clip fixes (tools/prep.py: card names, «specialty» re-comp, wall-sign replacement), then retime every segment to
# a 30 fps JPEG sequence (tools/conform.py, time map in src/cues.json -> footage.segs). Same input -> same files.
# Needs: ffmpeg, python3 with numpy, scipy, pillow and opencv (pip install opencv-contrib-python-headless).
#   bash src/tools/extract.sh          # everything
set -e
D=$(cd "$(dirname "$0")/.." && pwd)
python3 "$D/tools/prep.py"
python3 "$D/tools/conform.py"
du -sh "$D/footage"
