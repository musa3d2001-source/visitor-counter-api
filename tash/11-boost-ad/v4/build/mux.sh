#!/usr/bin/env bash
# Put the score under a silent render: video stream copied, audio AAC-LC 320 kb/s 48 kHz, length = the picture.
# usage: bash mux.sh <silent mp4> <wav> <out mp4>
set -euo pipefail
ffmpeg -v error -y -i "$1" -i "$2" -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 320k -ar 48000 -ac 2 -shortest -movflags +faststart "$3"
ffprobe -v error -show_entries format=duration:stream=codec_name,nb_frames,sample_rate -of csv=p=0 "$3"
ffmpeg -v info -i "$3" -map 0:a -af ebur128=peak=true -f null - 2>&1 | grep -E "I:|Peak:" | tail -2
