"""STAKK photoreal: conform the CD-approved AI clips into the edit.

Reads src/edl.json and writes, per sequence, graded and retimed 30 fps JPEG frames (1080x1920, q:v 3) into
src/footage/<seq>/0000.jpg ...  plus src/footage/manifest.json (frame counts + edit start per sequence).
The page draws frame round((t - from) * 30) of a sequence, so a render is a pure function of t.

Pipeline per output frame:
  source time  st(t)  : cubic Hermite through the EDL keys (speed_in / speed_out per key)
  pixels             : the two neighbouring 24 fps source frames, blended in linear light (slow motion),
                       or the nearest frame (crisp: real-speed action and every event frame)
  framing            : cover crop at zoom z around (cx, cy), one Lanczos resample to 1080x1920
                       (S02: frame lowered with a dark falloff on top, see edl.json)
  grade (shared)     : 1) per-clip black match  2) one look (sat trim, gentle S, highlight roll-off to cream)
                       3) red-stage secondary: the seamless red of b3/b6/b7 is pulled to the client red #E23B2E
Usage: python3 conform.py [seq ...]     (no args: all sequences)
"""
import json, os, subprocess, sys, shutil
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)
PROJ = os.path.dirname(SRC)
OUT = os.path.join(SRC, 'footage')
EDL = json.load(open(os.path.join(SRC, 'edl.json')))
SFPS, FPS = EDL['srcFps'], EDL['fps']
SW, SH = 1080, 1912          # source size
W, H = 1080, 1920            # output size

# ------------------------------------------------------------------------------------------- shared grade
BLACK = np.array([10, 9, 7], np.float32) / 255           # every dark clip's 0.5th percentile lands here (warm-neutral)
CREAM = np.array([252, 243, 226], np.float32) / 255      # highlights roll off toward the client cream (#FFF3DC family)
BRAND_RED = np.array([226, 59, 46], np.float32) / 255    # #E23B2E
LOOK = dict(sat=0.93, contrast=0.012, knee=0.84)
# stage-red sample regions (source px) for the clips shot on the red seamless
STAGE = {'b3_heel': (100, 100, 980, 700), 'b6_sauce': (0, 0, 200, 500), 'b7_crown': (100, 100, 980, 500)}
DARK = {'b1_smash', 'b2_crust', 'b4_melt', 'b5_stack'}
# the frame each clip's correction is measured on (clean stage, nothing falling through the sample region),
# so every sequence cut from the same clip gets identical numbers
REF = {'b1_smash': 40, 'b2_crust': 60, 'b3_heel': 30, 'b4_melt': 60, 'b5_stack': 0, 'b6_sauce': 60, 'b7_crown': 60}


def smooth(e0, e1, x):
    k = np.clip((x - e0) / (e1 - e0), 0, 1)
    return k * k * (3 - 2 * k)


def rgb2hsv(x):
    r, g, b = x[..., 0], x[..., 1], x[..., 2]
    mx, mn = x.max(-1), x.min(-1)
    d = mx - mn
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    dd = np.maximum(d, 1e-6)
    h = np.where(mx == r, ((g - b) / dd) % 6, np.where(mx == g, (b - r) / dd + 2, (r - g) / dd + 4)) * 60
    h = np.where(d < 1e-6, 0, h)
    return h, s, mx


def hsv2rgb(h, s, v):
    h = (h % 360) / 60
    i = np.floor(h).astype(np.int32) % 6
    f = h - np.floor(h)
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    r = np.choose(i, [v, q, p, p, t, v]); g = np.choose(i, [t, v, v, q, p, p]); b = np.choose(i, [p, p, t, v, v, q])
    return np.stack([r, g, b], -1)


def look(x):
    # saturation trim (AI clips run hot) around Rec.709 luma
    y = (x @ np.array([0.2126, 0.7152, 0.0722], np.float32))[..., None]
    x = y + (x - y) * LOOK['sat']
    # gentle S around 0.5 (monotonic for contrast < 0.159)
    x = x - LOOK['contrast'] * np.sin(2 * np.pi * np.clip(x, 0, 1))
    # highlight roll-off toward cream (never pure white)
    k = LOOK['knee']
    hi = x > k
    span = CREAM - k
    xr = k + span * np.tanh((x - k) / span)
    return np.where(hi, xr, x)


class ClipGrade:
    """Per-clip correction measured once on a reference frame, so the same numbers grade every frame of the clip."""
    def __init__(self, clip, ref):
        self.clip = clip
        self.d = np.zeros(3, np.float32)
        if clip in DARK:
            p = np.percentile(ref.reshape(-1, 3), 0.5, axis=0).astype(np.float32)
            self.d = BLACK - p
        self.red = None
        if clip in STAGE:
            x0, y0, x1, y1 = STAGE[clip]
            reg = look(self.base(ref[y0:y1, x0:x1]))
            h, s, v = rgb2hsv(reg)
            hm = float(np.degrees(np.angle(np.mean(np.exp(1j * np.radians(h))))))
            sm, vm = float(np.median(s)), float(np.median(v))
            th, ts, tv = [np.asarray(a).item() for a in rgb2hsv(BRAND_RED[None, None])]
            th, ts, tv = th % 360, ts, tv
            dh = ((th - hm + 180) % 360) - 180
            self.red = dict(h0=hm % 360, dh=dh, ks=ts / max(sm, 1e-3), kv=(1 - tv) / max(1 - vm, 1e-3), meas=(hm % 360, sm, vm))

    def base(self, x):
        if np.any(self.d):
            x = x + self.d * np.clip(1 - x / 0.35, 0, 1) ** 2
        return x

    def __call__(self, x):
        x = look(self.base(x))
        if self.red:
            R = self.red
            h, s, v = rgb2hsv(np.clip(x, 0, 1))
            dist = np.abs(((h - R['h0'] + 180) % 360) - 180)
            w = (1 - smooth(10, 28, dist)) * smooth(0.42, 0.62, s) * smooth(0.28, 0.48, v)
            h = h + w * R['dh']
            s = np.clip(s * (1 + w * (R['ks'] - 1)), 0, 1)
            v = np.clip(1 - (1 - v) * (1 + w * (R['kv'] - 1)), 0, 1)
            x = hsv2rgb(h, s, v)
        return np.clip(x, 0, 1)


# ------------------------------------------------------------------------------------------- timing
def make_st(keys):
    K = [list(map(float, k)) for k in keys]
    def st(t):
        if t <= K[0][0]:
            return K[0][1] + (t - K[0][0]) * K[0][3]
        for a, b in zip(K, K[1:]):
            if t <= b[0]:
                h = b[0] - a[0]; u = (t - a[0]) / h
                h00, h10, h01, h11 = 2*u**3 - 3*u**2 + 1, u**3 - 2*u**2 + u, -2*u**3 + 3*u**2, u**3 - u**2
                return h00 * a[1] + h10 * h * a[3] + h01 * b[1] + h11 * h * b[2]
        return K[-1][1] + (t - K[-1][0]) * K[-1][2]
    return st


def blend_on(seq, t):
    b = seq.get('blend', False)
    if b is True or b is False:
        return b
    return any(a - 1e-6 <= t <= z + 1e-6 for a, z in b)


# ------------------------------------------------------------------------------------------- io
def decode(clip, i0, i1):
    """source frames i0..i1 (inclusive) as float32 RGB 0..1 (BT.709 tv range → full-range RGB)"""
    path = os.path.join(PROJ, EDL['clips'][clip])
    cmd = ['ffmpeg', '-v', 'error', '-i', path, '-vf',
           f"select='between(n\\,{i0}\\,{i1})',scale=in_color_matrix=bt709:in_range=tv:out_range=full:flags=lanczos+accurate_rnd+full_chroma_int,format=rgb24",
           '-vsync', '0', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
    raw = subprocess.run(cmd, check=True, capture_output=True).stdout
    n = len(raw) // (SW * SH * 3)
    arr = np.frombuffer(raw, np.uint8).reshape(n, SH, SW, 3)
    return {i0 + k: arr[k] for k in range(n)}


def to_lin(u8): return (u8.astype(np.float32) / 255) ** 2.2
def to_srgb(lin): return np.clip(lin, 0, 1) ** (1 / 2.2)


def frame_img(seq, x):
    """x: float32 0..1 source-size image → float32 1080x1920 framed image"""
    fr = seq.get('frame', {})
    z, cx, cy = fr.get('z', 1.0), fr.get('cx', 0.5), fr.get('cy', 0.5)
    cw, ch = SH * W / H / z, SH / z
    x0 = min(max(cx * SW - cw / 2, 0), SW - cw); y0 = min(max(cy * SH - ch / 2, 0), SH - ch)
    im = Image.fromarray((np.clip(x, 0, 1) * 255 + 0.5).astype(np.uint8))
    D = fr.get('shiftY', 0)
    if not D:
        return np.asarray(im.resize((W, H), Image.LANCZOS, box=(x0, y0, x0 + cw, y0 + ch))).astype(np.float32) / 255
    # S02: the frame is lowered by D px; above it the griddle falls off into darkness (light pool ends)
    vis = H - D
    src_h = vis * ch / H
    part = np.asarray(im.resize((W, vis), Image.LANCZOS, box=(x0, y0, x0 + cw, y0 + src_h))).astype(np.float32) / 255
    out = np.zeros((H, W, 3), np.float32)
    out[D:] = part
    F = fr.get('fadeTop', 260)
    top = part[:24].mean(axis=(0, 1)) * 0.35            # the falloff tone is the griddle's own top edge, darkened
    out[:D] = top
    yy = np.arange(H, dtype=np.float32)[:, None, None]
    a = 1 - smooth(D - 40, D + F, yy)                      # 1 above the frame edge → 0 at D+F
    return out * (1 - a) + top * a


def run(seq):
    sid, clip = seq['id'], seq['clip']
    st = make_st(seq['keys'])
    # sequences live on the global 30 fps grid: frame N shows t = N/30 (cue times like 2.15 fall between frames)
    n0, n1 = int(np.ceil(seq['from'] * FPS - 1e-6)), int(np.ceil(seq['to'] * FPS - 1e-6))
    n = n1 - n0
    ts = [N / FPS for N in range(n0, n1)]
    crisp = seq.get('crisp', [])
    fidx = []
    for t in ts:
        f = min(max(st(t) * SFPS, 0), 120)
        if not blend_on(seq, t) or any(abs(t - c) < 0.5 / FPS for c in crisp):
            fidx.append((int(round(f)), int(round(f)), 0.0))
        else:
            a = int(np.floor(f)); w = f - a
            if w < 0.04: fidx.append((a, a, 0.0))
            elif w > 0.96: fidx.append((a + 1, a + 1, 0.0))
            else: fidx.append((a, min(a + 1, 120), w))
    lo, hi = min(min(a, b) for a, b, _ in fidx), max(max(a, b) for a, b, _ in fidx)
    src = decode(clip, lo, hi)
    grade = ClipGrade(clip, decode(clip, REF[clip], REF[clip])[REF[clip]].astype(np.float32) / 255)
    d = os.path.join(OUT, sid)
    shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
    enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                            '-pix_fmt', 'yuvj420p', '-q:v', '3', '-start_number', '0', os.path.join(d, '%04d.jpg')], stdin=subprocess.PIPE)
    speeds = [(st(t + 0.5 / FPS) - st(t - 0.5 / FPS)) * FPS for t in ts]
    for (a, b, w) in fidx:
        if w == 0: x = src[a].astype(np.float32) / 255
        else: x = to_srgb(to_lin(src[a]) * (1 - w) + to_lin(src[b]) * w)
        y = grade(frame_img(seq, x))
        enc.stdin.write((y * 255 + 0.5).astype(np.uint8).tobytes())
    enc.stdin.close(); enc.wait()
    size = sum(os.path.getsize(os.path.join(d, f)) for f in os.listdir(d))
    print(f"{sid:5s} {clip:9s} {n:4d} f  src {fidx[0][0]}..{fidx[-1][1]}  speed {min(speeds):.2f}..{max(speeds):.2f}  {size/1e6:5.1f} MB"
          + (f"  red meas h{grade.red['meas'][0]:.1f} s{grade.red['meas'][1]:.2f} v{grade.red['meas'][2]:.2f} dh{grade.red['dh']:+.1f}" if grade.red else '')
          + (f"  black d {np.round(grade.d*255,1).tolist()}" if np.any(grade.d) else ''))
    return {'from': seq['from'], 'to': seq['to'], 'n0': n0, 'frames': n, 'clip': clip,
            'src': [[round(st(t), 4), a, b, round(w, 3)] for t, (a, b, w) in zip(ts, fidx)]}


if __name__ == '__main__':
    want = sys.argv[1:]
    os.makedirs(OUT, exist_ok=True)
    mpath = os.path.join(OUT, 'manifest.json')
    man = json.load(open(mpath)) if os.path.exists(mpath) else {}
    for s in EDL['seq']:
        if want and s['id'] not in want:
            continue
        man[s['id']] = run(s)
    man = {k: man[k] for k in [s['id'] for s in EDL['seq']] if k in man}
    json.dump(man, open(mpath, 'w'), indent=0)
    tot = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(OUT) for f in fs)
    print(f'footage total {tot/1e6:.1f} MB')
