#!/usr/bin/env bash
# Brand guide — sting filmstrip. Renders the real sting page (02-logo/motion/src/sting.html, 1:1 format) with the studio
# renderer at the cue times from _system/motion/endcard-cues.json, then crops/resizes into 01-brand-guide/assets/sting/.
# Run from tash/:  bash 01-brand-guide/src/prep-sting.sh
set -e
cd "$(dirname "$0")/../.."
TMP=review/brandguide/sting-strip; OUT=01-brand-guide/assets/sting
rm -rf "$TMP"; mkdir -p "$TMP" "$OUT"
# typing · converge · flight · snap · shadda · tagline · handle · pulse · end
TIMES=0.34,0.74,0.96,1.12,1.36,1.80,2.40,3.05,4.19
node _system/tools/render.mjs --page "02-logo/motion/src/sting.html?fmt=11" --stills "$TIMES" --stills-dir "$TMP" --prefix f >/dev/null
python3 -I - "$TMP" "$OUT" <<'EOF'
import sys, glob, os
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
for f in sorted(glob.glob(os.path.join(src, 'f_*.png'))):
    t = os.path.basename(f)[2:-4]
    im = Image.open(f).convert('RGB').crop((170, 140, 910, 880)).resize((480, 480), Image.LANCZOS)
    im.save(os.path.join(out, f'sting-{float(t):.2f}.png'), optimize=True)
    print(os.path.join(out, f'sting-{float(t):.2f}.png'))
EOF
