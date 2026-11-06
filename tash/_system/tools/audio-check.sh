#!/usr/bin/env bash
# Loudness + true peak + spectrogram of an audio or video file. Usage: audio-check.sh in.(wav|mp4) [spectrogram.png]
set -e; IN="$1"; PNG="${2:-}"
ffmpeg -nostats -i "$IN" -af ebur128=peak=true -f null - 2>&1 | awk '/Summary/{f=1} f&&/I:|LRA:|Peak:/{print}'
[ -n "$PNG" ] && ffmpeg -v error -y -i "$IN" -lavfi "showspectrumpic=s=1400x480:legend=1:scale=log:fscale=log,format=rgb24" "$PNG" && echo "$PNG"
