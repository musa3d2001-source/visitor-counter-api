"""«طشّ للطلاب»: mux a mix onto the silent picture, exactly like _system/tools/render.mjs mux(): two-pass loudnorm,
linear (one static gain), I = -14 LUFS, TP = -1.5 dBTP (room for AAC overshoot), LRA 11; AAC 320k 48 kHz; -shortest.
(render.mjs cannot be imported for this: its top level exits without --page.)
    python3 src/tools/mux.py picture.mp4 mix.wav out.mp4"""
import json, subprocess, sys


def mux(video, audio, out):
    target = 'I=-14:TP=-1.5:LRA=11'
    m = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', audio, '-af', f'loudnorm={target}:print_format=json', '-f', 'null', '-'],
                       capture_output=True, text=True, check=True).stderr
    j = json.loads(m[m.rindex('{'):m.rindex('}') + 1])
    af = (f"loudnorm={target}:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}"
          f":measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true")
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', video, '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
                    '-af', af, '-ar', '48000', '-c:a', 'aac', '-b:a', '320k', '-shortest', '-movflags', '+faststart', out], check=True)
    print('muxed', out, f"(input {j['input_i']} LUFS, TP {j['input_tp']})")


if __name__ == '__main__':
    mux(*sys.argv[1:4])
