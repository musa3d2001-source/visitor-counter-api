#!/usr/bin/env bash
# Contact sheet of a video: 2 frames/sec, 8 columns, with timecodes. Usage: contact.sh in.mp4 out.png [fps]
set -e; IN="$1"; OUT="$2"; FPS="${3:-2}"
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN"); N=$(python3 -c "import math;print(math.ceil($D*$FPS))"); ROWS=$(( (N + 7) / 8 ))
ffmpeg -v error -y -i "$IN" -vf "fps=$FPS,scale=216:-2,drawtext=fontfile=$(dirname "$0")/../fonts/JetBrainsMono-VF.ttf:text='%{pts\:hms}':x=6:y=6:fontsize=14:fontcolor=white:box=1:boxcolor=black@0.6,tile=8x${ROWS}:padding=4:color=0x333333" -frames:v 1 "$OUT"
echo "$OUT ($N frames)"
