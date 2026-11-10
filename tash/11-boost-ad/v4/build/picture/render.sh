#!/usr/bin/env bash
# Render one variant of the v4 film to a silent MP4 (frames -> BT.709 H.264), 0 credits.
# usage: bash render.sh <len 20|14> <plat ig|tt> <fmt 916|45> <prepared footage dir> <work dir> <out mp4> [sweet kunafa|cake]
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; SB="$HERE/../../sb"
LEN=$1 PLAT=$2 FMT=$3 SRC=$4 WORK=$5 OUT=$6 SWEET=${7:-kunafa}
mkdir -p "$WORK"; rm -rf "$WORK/frames"; mkdir -p "$WORK/frames"
node "$HERE/mk_film.mjs" --len "$LEN" --plat "$PLAT" --fmt "$FMT" --sweet "$SWEET" --out "$WORK" --chunks 3 | cut -c1-80
for c in 0 1 2; do node "$SB/compose.mjs" --frames "$WORK/film.$c.json" --out "$WORK/frames" --stills "$SRC" --nosheet > "$WORK/render.$c.log" 2>&1 & done
wait
n=$(ls "$WORK/frames" | wc -l); echo "frames: $n"
CROP=""; [ "$FMT" = 45 ] && CROP="crop=1080:1350:0:0,"
ffmpeg -v error -y -framerate 30 -i "$WORK/frames/%04d.png" \
  -vf "${CROP}scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv420p" \
  -c:v libx264 -preset slow -crf 16 -tune grain -color_primaries bt709 -color_trc bt709 -colorspace bt709 -movflags +faststart "$OUT"
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,nb_frames,r_frame_rate -of csv=p=0 "$OUT"
