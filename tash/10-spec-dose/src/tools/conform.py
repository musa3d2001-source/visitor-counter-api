"""DOSE: conform the fixed source frames (tools/prep.py -> src/footage/_src/) to the edit: one JPEG per OUTPUT frame
(30 fps), already retimed, adapted from the MOR / HABBA tool.

Reads cues.json -> footage.segs. For every segment and every edit frame f in [round(t0*30), round(t1*30)) it evaluates
the time map s(t), takes the source frames around p = s*24 and writes
    src/footage/<seg>/<f - round(t0*30):04d>.jpg      (1080x1920, ffmpeg mjpeg q:v 2)
plus src/footage/manifest.json (first edit frame, frame count, clip, source positions). The page draws frame index
round(t*30) - round(t0*30): a pure function of t.
Modes (no synthesised in-betweens: motion interpolation warps clear ice and liquid streams):
  blend    linear blend of the two nearest source frames (slow camera moves, pours)
  nearest  the nearest source frame (24p cadence inside 30p; used for d2d's falling ice)
Usage: python3 src/tools/conform.py [seg ...]      (bash src/tools/extract.sh runs prep + conform)"""
import json, os, subprocess, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import SRC, PREP, W, H, NSRC, cues, edit_frames

C = cues()
OUT = os.path.join(SRC, 'footage')
FPS = 30


def src_frame(clip, k, cache={}):
    key = (clip, k)
    if key not in cache:
        if len(cache) > 6: cache.pop(next(iter(cache)))
        cache[key] = np.asarray(Image.open(os.path.join(PREP, clip, f'{k:03d}.png')).convert('RGB'), np.float32)
    return cache[key]


def conform(seg):
    f0, f1, ps = edit_frames(seg, FPS)
    d = os.path.join(OUT, seg['id']); os.makedirs(d, exist_ok=True)
    for old in os.listdir(d):
        if old.endswith('.jpg'): os.remove(os.path.join(d, old))
    enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
                            '-i', '-', '-vf', 'scale=out_color_matrix=bt601:out_range=full,format=yuvj420p', '-q:v', '2',
                            '-start_number', '0', os.path.join(d, '%04d.jpg')], stdin=subprocess.PIPE)
    used = []
    for p in ps:
        if seg['mode'] == 'nearest':
            k = int(round(p)); out = src_frame(seg['clip'], k); used.append(k)
        else:
            i = int(np.floor(p)); w = p - i
            A = src_frame(seg['clip'], i)
            if w < 1e-3 or i + 1 >= NSRC: out = A
            else: out = A * (1 - w) + src_frame(seg['clip'], i + 1) * w
            used.append(round(p, 3))
        enc.stdin.write(np.clip(out + 0.5, 0, 255).astype(np.uint8).tobytes())
    enc.stdin.close(); enc.wait()
    print(f"{seg['id']:2s} {seg['clip']:12s} edit {seg['t0']:.3f}-{seg['t1']:.3f}  frames {f1 - f0:3d}  source {ps[0] / 24:.3f}-{ps[-1] / 24:.3f} s"
          f" (src frames {ps[0]:.1f}-{ps[-1]:.1f}, {seg['mode']})")
    return {'f0': f0, 'n': f1 - f0, 'clip': seg['clip'], 'p': [round(x, 3) for x in ps]}


if __name__ == '__main__':
    want = set(sys.argv[1:])
    mf = os.path.join(OUT, 'manifest.json')
    M = json.load(open(mf)) if os.path.exists(mf) else {}
    for seg in C['footage']['segs']:
        if want and seg['id'] not in want: continue
        M[seg['id']] = conform(seg)
    M = {s['id']: M[s['id']] for s in C['footage']['segs'] if s['id'] in M}
    json.dump(M, open(mf, 'w'), separators=(',', ':'))
    print('manifest', mf)
