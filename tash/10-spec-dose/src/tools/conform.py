"""DOSE: conform the fixed source frames (tools/prep.py -> src/footage/_src/) to the edit: one JPEG per OUTPUT frame
(30 fps), already retimed, adapted from the MOR / HABBA tool.

Reads cues.json -> footage.segs. For every segment and every edit frame f in [round(t0*30), round(t1*30)) it evaluates
the time map s(t), takes the source frames around p = s*24 and writes
    src/footage/<seg>/<f - round(t0*30):04d>.jpg      (1080x1920, ffmpeg mjpeg q:v 2)
plus src/footage/manifest.json (first edit frame, frame count, clip, source positions). The page draws frame index
round(t*30) - round(t0*30): a pure function of t.
Modes (no synthesised in-betweens where clear ice and liquid streams move; d5b's crane is solid objects, so it gets them):
  blend    linear blend of the two nearest source frames (slow camera moves, pours)
  nearest  the nearest source frame (24p cadence inside 30p; used for d2d's falling ice)
  adaptive the blend where the picture is slow, the NEAREST source frame where it moves fast (a near cup is never
           shown twice, half-transparent); the mask is |A-B| on a quarter-res copy, dilated and feathered
  flow     a motion-compensated in-between: DIS optical flow A->B and B->A on the fixed frames, both frames warped to
           the in-between time and blended; where the two flows disagree (> 1.5 px round trip: occlusions, thin chair
           legs) the nearest whole frame is used instead, feathered. True 30p from the 24p crane (no 6 Hz repeat)
Usage: python3 src/tools/conform.py [seg ...]      (bash src/tools/extract.sh runs prep + conform)"""
import json, os, subprocess, sys
import numpy as np, cv2
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import SRC, PREP, W, H, NSRC, cues, edit_frames
from scipy import ndimage

C = cues()
OUT = os.path.join(SRC, 'footage')
FPS = 30


def src_frame(clip, k, cache={}):
    """clip = the folder under footage/_src (a clip name, or clip_<variant>, see prep.src_dir)"""
    key = (clip, k)
    if key not in cache:
        if len(cache) > 6: cache.pop(next(iter(cache)))
        cache[key] = np.asarray(Image.open(os.path.join(PREP, clip, f'{k:03d}.png')).convert('RGB'), np.float32)
    return cache[key]


def motion_mask(A, B):
    """1 where the two source frames differ a lot (a fast, near object), feathered; computed at quarter resolution."""
    a = A[::4, ::4].astype(np.int16); b = B[::4, ::4].astype(np.int16)
    d = np.abs(a - b).sum(2).astype(np.float32)
    m = np.clip((d - 36) / 40, 0, 1)
    m = ndimage.maximum_filter(m, size=9)
    m = ndimage.gaussian_filter(m, 3)
    m = np.clip(m * 1.5, 0, 1)
    return np.repeat(np.repeat(m, 4, 0), 4, 1)[:H, :W, None]


_DIS = {}
def flows(clip, i):
    """(F_AB, F_BA) between source frames i and i+1 (full res, DIS medium preset on grey), cached"""
    key = (clip, i)
    if key not in _DIS:
        if len(_DIS) > 4: _DIS.pop(next(iter(_DIS)))
        if 'dis' not in globals():
            globals()['dis'] = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
        g = lambda k: cv2.cvtColor(src_frame(clip, k).astype(np.uint8), cv2.COLOR_RGB2GRAY)
        a, b = g(i), g(i + 1)
        _DIS[key] = (dis.calc(a, b, None), dis.calc(b, a, None))
    return _DIS[key]


def flow_inbetween(clip, i, w):
    A, B = src_frame(clip, i), src_frame(clip, i + 1)
    F01, F10 = flows(clip, i); w = float(w)
    # flows from the in-between time t=w to each frame (Super SloMo's linear-motion approximation)
    Ft0 = (-(1 - w) * w * F01 + w * w * F10).astype(np.float32)
    Ft1 = ((1 - w) * (1 - w) * F01 - w * (1 - w) * F10).astype(np.float32)
    gx, gy = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))
    wa = cv2.remap(A, gx + Ft0[..., 0], gy + Ft0[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    wb = cv2.remap(B, gx + Ft1[..., 0], gy + Ft1[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    out = wa * (1 - w) + wb * w
    # round-trip consistency of the two flows; where they disagree, the nearest whole frame (feathered)
    back = cv2.remap(F10, gx + F01[..., 0], gy + F01[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    err = np.hypot(*(F01 + back).transpose(2, 0, 1)).astype(np.float32)
    # v3 (CD: chipped cup rims and a stair-stepped table edge on the in-betweens, worst on the ١٠٠٪ frame f324):
    # the round-trip error lives in frame A's coordinates, so it is carried to the in-between time before it is used
    # as a mask there; the fallback is the ONE-SIDED warp from the nearer frame (v2 pasted the unwarped frame, whose
    # objects sit w x their motion away); a wider feather (sigma 8, 15 px dilate)
    err_t = cv2.remap(err, gx + Ft0[..., 0], gy + Ft0[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    bad = cv2.GaussianBlur(np.clip((err_t - 1.5) / 1.5, 0, 1), (0, 0), 8)
    bad = np.clip(cv2.dilate(bad, np.ones((15, 15), np.uint8)) * 1.5, 0, 1)[..., None]
    near = wa if w < 0.5 else wb
    return out * (1 - bad) + near * bad, float((bad > 0.5).mean())


def conform(seg):
    f0, f1, ps = edit_frames(seg, FPS)
    src = seg['clip'] + ('_' + seg['variant'] if seg.get('variant') else '')
    d = os.path.join(OUT, seg['id']); os.makedirs(d, exist_ok=True)
    for old in os.listdir(d):
        if old.endswith('.jpg'): os.remove(os.path.join(d, old))
    enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
                            '-i', '-', '-vf', 'scale=out_color_matrix=bt601:out_range=full,format=yuvj420p', '-q:v', '2',
                            '-start_number', '0', os.path.join(d, '%04d.jpg')], stdin=subprocess.PIPE)
    used, fallback = [], []
    for p in ps:
        if seg['mode'] == 'nearest':
            k = int(round(p)); out = src_frame(src, k); used.append(k)
        elif seg['mode'] == 'flow':
            i = int(np.floor(p)); w = p - i
            if w < 1e-3 or i + 1 >= NSRC: out = src_frame(src, i)
            elif w > 1 - 1e-3: out = src_frame(src, i + 1)
            else:
                out, fb = flow_inbetween(src, i, w); fallback.append(fb)
            used.append(round(p, 3))
        else:
            i = int(np.floor(p)); w = p - i
            A = src_frame(src, i)
            if w < 1e-3 or i + 1 >= NSRC: out = A
            else:
                B = src_frame(src, i + 1); out = A * (1 - w) + B * w
                if seg['mode'] == 'adaptive':
                    m = motion_mask(A, B); out = out * (1 - m) + (B if w >= 0.5 else A) * m
            used.append(round(p, 3))
        enc.stdin.write(np.clip(out + 0.5, 0, 255).astype(np.uint8).tobytes())
    enc.stdin.close(); enc.wait()
    print(f"{seg['id']:2s} {src:18s} edit {seg['t0']:.3f}-{seg['t1']:.3f}  frames {f1 - f0:3d}  source {ps[0] / 24:.3f}-{ps[-1] / 24:.3f} s"
          f" (src frames {ps[0]:.1f}-{ps[-1]:.1f}, {seg['mode']})" + (f"  flow fallback to whole frames: mean {np.mean(fallback) * 100:.1f} % of pixels, max {np.max(fallback) * 100:.1f} %" if fallback else ''))
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
