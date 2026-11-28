#!/usr/bin/env bash
# Render one variant of the v4 film to a silent MP4 (frames -> BT.709 H.264), 0 credits.
# usage: bash render.sh <len 20|14> <plat ig|tt> <fmt 916|45> <prepared footage dir> <work dir> <out mp4> [sweet kunafa|cake]
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; SB="$HERE/../../sb"
LEN=$1 PLAT=$2 FMT=$3 SRC=$4 WORK=$5 OUT=$6 SWEET=${7:-cake}
mkdir -p "$WORK"; rm -rf "$WORK/frames"; mkdir -p "$WORK/frames"
node "$HERE/mk_film.mjs" --len "$LEN" --plat "$PLAT" --fmt "$FMT" --sweet "$SWEET" --out "$WORK" --chunks 10 | cut -c1-80
# ten chunks, three browsers at a time: a page keeps every decoded still, so short chunks keep each page small
for c in 0 1 2 3 4 5 6 7 8 9; do echo $c; done | xargs -P 3 -I{} sh -c 'node "$0/compose.mjs" --frames "$1/film.{}.json" --out "$1/frames" --stills "$2" --nosheet > "$1/render.{}.log" 2>&1 || echo "chunk {} FAILED"' "$SB" "$WORK" "$SRC"
n=$(ls "$WORK/frames" | wc -l); echo "frames: $n"
want=$(node -e "console.log(require(process.argv[1]).frames.length)" "$WORK/film.json"); [ "$n" = "$want" ] || { echo "MISSING FRAMES: $n of $want"; exit 1; }
CROP=""; [ "$FMT" = 45 ] && CROP="crop=1080:1350:0:0,"
ffmpeg -v error -y -framerate 30 -i "$WORK/frames/%04d.png" \
  -vf "${CROP}scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv420p" \
  -c:v libx264 -preset slow -crf 16 -tune grain -color_primaries bt709 -color_trc bt709 -colorspace bt709 -movflags +faststart "$OUT"
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,nb_frames,r_frame_rate -of csv=p=0 "$OUT"
