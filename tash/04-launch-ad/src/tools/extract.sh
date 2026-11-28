#!/usr/bin/env bash
# Rebuild tash/review/launch-footage/ (git-ignored JPEG sequences) from the clips kept in 04-launch-ad/footage/.
# Every clip becomes <name>/0000.jpg … at 1080×1920 (cover-cropped), numbered by SOURCE frame index.
# The page maps edit time → source frame index itself (24 fps AI clips are conformed to 30 fps by index).
set -e
T=/home/user/visitor-counter-api/tash
F=$T/04-launch-ad/footage; O=$T/review/launch-footage
mkdir -p "$O"
one() { # src.mp4 name
  rm -rf "$O/$2"; mkdir -p "$O/$2"
  ffmpeg -v error -y -i "$1" -an -vf "scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,format=yuvj420p" -q:v 2 -start_number 0 "$O/$2/%04d.jpg"
  echo "$2: $(ls "$O/$2" | wc -l) frames"
}
for c in s1_hook s2_diwaniya s3_cafe s4_car s5_owner; do one "$F/ai/$c.mp4" "ai-$c"; done
for f in "$F"/clean/*.mp4 "$F"/bts/*.mp4 "$F"/final/*.mp4; do [ -f "$f" ] && one "$f" "$(basename "${f%.mp4}")"; done
for f in "$F"/built/*.mp4; do [ -f "$f" ] && one "$f" "$(basename "${f%.mp4}")"; done
true
# manifest: frame count + source fps per clip (the page reads it to map time → frame index)
python3 - "$O" <<'PY'
import json, os, subprocess, sys
O = sys.argv[1]; T = '/home/user/visitor-counter-api/tash/04-launch-ad/footage'
m = {}
for d in sorted(os.listdir(O)):
    p = os.path.join(O, d)
    if os.path.isdir(p): m[d] = {'frames': len([f for f in os.listdir(p) if f.endswith('.jpg')]), 'fps': 24 if d.startswith('ai-') else 30}
json.dump(m, open(os.path.join(O, 'manifest.json'), 'w'), indent=1)
print('manifest', len(m), 'clips')
PY
