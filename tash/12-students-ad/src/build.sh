#!/usr/bin/env bash
# «طشّ للطلاب» — render the whole film (run from anywhere; works from the tash/ root).
#   bash 12-students-ad/src/build.sh                 # picture (all 877 frames) + every mix that exists
#   WORKERS=6 bash 12-students-ad/src/build.sh       # more Chromium workers (default 4, max 6)
#   bash 12-students-ad/src/build.sh --mux-only      # re-mux the existing picture with the current mixes
# Picture:  12-students-ad/out/picture.mp4 (silent, H.264 CRF 14, BT.709)
# Mixes (written by the audio agent's src/audio.py): src/audio/mix_vo.wav → TASH-students-9x16-vo.mp4,
#           src/audio/mix_novo.wav → TASH-students-9x16-novo.mp4 (both in 12-students-ad/), loudness -14 LUFS.
# Until the mixes exist, out/check-vo-edit.mp4 = picture + the raw VO edit (to check sync by eye/ear).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd); AD=$(dirname "$HERE"); TASH=$(dirname "$AD")
cd "$TASH"
WORKERS=${WORKERS:-4}
OUT=12-students-ad/out
mkdir -p "$OUT"
if [ "${1:-}" != "--mux-only" ]; then
  python3 - <<'PY'
import json; c = json.load(open('12-students-ad/src/cues.json'))
assert c['duration'] <= 30.0, c['duration']
print(f"rendering {c['duration_frames']} frames = {c['duration']} s @ {c['fps']} fps, {c['bpm']} BPM")
PY
  node _system/tools/render.mjs --page 12-students-ad/src/index.html --out "$OUT/picture.mp4" --workers "$WORKERS"
fi
have=0
for mix in vo novo; do
  wav=12-students-ad/src/audio/mix_$mix.wav
  if [ -f "$wav" ]; then python3 12-students-ad/src/tools/mux.py "$OUT/picture.mp4" "$wav" "12-students-ad/TASH-students-9x16-$mix.mp4"; have=1; fi
done
if [ "$have" = 0 ]; then
  python3 12-students-ad/src/tools/mux.py "$OUT/picture.mp4" 12-students-ad/src/vo/vo_edit.wav "$OUT/check-vo-edit.mp4"
fi
ffprobe -v error -show_entries format=duration:stream=codec_name,width,height,r_frame_rate,nb_frames -of compact "$OUT/picture.mp4"
