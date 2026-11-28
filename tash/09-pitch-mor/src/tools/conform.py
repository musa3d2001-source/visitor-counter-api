"""MOR — conform (adapted from the HABBA concept ad's tool) the CD-approved AI clips to the edit: one JPEG per OUTPUT frame (30 fps), already retimed.

Reads cues.json → footage.segs. For every segment and every edit frame f in [round(t0*30), round(t1*30)) it evaluates
the time map s(t) (source seconds), finds the two source frames around p = s*24 and writes
    src/footage/<seg>/<f - round(t0*30):04d>.jpg      (1080×1920, cover-cropped, ffmpeg mjpeg q:v 3)
plus src/footage/manifest.json. The page draws frame index round(t*30) - round(t0*30): a pure function of t.

Retime modes (no synthesised in-betweens: ffmpeg minterpolate and DIS optical flow both tore the background around
the falling beans at full size, so they were rejected):
  blend     linear blend of the two nearest source frames (camera moves, steam, the pour)
  adaptive  the same blend where the picture is still, the NEAREST source frame where it moves fast (a falling bean is
            never shown twice, half-transparent); the mask is |A-B| on a quarter-res copy, dilated and feathered.

Usage: python3 src/tools/conform.py [seg ...]      (called by src/tools/extract.sh; only the used source ranges are decoded)
"""
import json, os, subprocess, sys
import numpy as np
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)
C = json.load(open(os.path.join(SRC, 'cues.json')))
FT = C['footage']
CLIPS = os.path.normpath(os.path.join(SRC, FT['clips']))
OUT = os.path.join(SRC, 'footage')
W, H, FPS, SFPS, NSRC = 1080, 1920, 30, 24, 121
# untagged Kling clips are BT.709 HD: decode them as such (swscale would otherwise assume BT.601 for untagged input)
VF_IN = f"scale={W + 4}:{H}:flags=lanczos+accurate_rnd+full_chroma_int:in_color_matrix=bt709:in_range=tv,crop={W}:{H}:2:0"


def tmap(seg):
    """edit time → source seconds (2 keys: a straight line, extended; 3+: monotone cubic, linear outside)."""
    k = np.array(seg['keys'], float)
    if len(k) == 2:
        (t0, s0), (t1, s1) = k
        return lambda t: s0 + (t - t0) * (s1 - s0) / (t1 - t0)
    x, y = k[:, 0], k[:, 1]
    d = np.diff(y) / np.diff(x)
    m = np.concatenate([[d[0]], (d[:-1] + d[1:]) / 2, [d[-1]]])
    for i in range(len(d)):                                   # Fritsch–Carlson
        if d[i] == 0: m[i] = m[i + 1] = 0; continue
        a, b = m[i] / d[i], m[i + 1] / d[i]
        if a * a + b * b > 9:
            tau = 3 / np.hypot(a, b); m[i] = tau * a * d[i]; m[i + 1] = tau * b * d[i]
    def f(t):
        if t <= x[0]: return y[0] + (t - x[0]) * m[0]
        if t >= x[-1]: return y[-1] + (t - x[-1]) * m[-1]
        i = np.searchsorted(x, t) - 1; h = x[i + 1] - x[i]; u = (t - x[i]) / h
        h00, h10, h01, h11 = 2*u**3 - 3*u**2 + 1, u**3 - 2*u**2 + u, -2*u**3 + 3*u**2, u**3 - u**2
        return h00 * y[i] + h10 * h * m[i] + h01 * y[i + 1] + h11 * h * m[i + 1]
    return f


class Reader:
    """Sequential decoder of one clip's frames [a, b] (cover-cropped RGB), with a small cache."""
    def __init__(self, clip, a, b):
        self.a, self.b, self.cache = a, b, {}
        self.p = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', os.path.join(CLIPS, clip + '.mp4'), '-an', '-vf',
                                   f"select='between(n\\,{a}\\,{b})',{VF_IN},format=rgb24", '-vsync', '0',
                                   '-f', 'rawvideo', '-'], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        self.next = a

    def get(self, i):
        i = max(self.a, min(self.b, i))
        while i >= self.next:
            buf = self.p.stdout.read(W * H * 3)
            if len(buf) < W * H * 3: raise RuntimeError(f'short read at frame {self.next}')
            self.cache[self.next] = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
            self.next += 1
            for k in [k for k in self.cache if k < i - 2]: del self.cache[k]
        return self.cache[i]

    def close(self):   # the decoder may still hold frames past the last one we need: stop it quietly
        self.p.kill(); self.p.stdout.close(); self.p.wait()


def motion_mask(A, B):
    """1 where the two source frames differ a lot (a fast object), feathered; computed at quarter resolution."""
    a = A[::4, ::4].astype(np.int16); b = B[::4, ::4].astype(np.int16)
    d = np.abs(a - b).sum(2).astype(np.float32)
    m = np.clip((d - 36) / 40, 0, 1)
    m = ndimage.maximum_filter(m, size=9)
    m = ndimage.gaussian_filter(m, 3)
    m = np.clip(m * 1.5, 0, 1)
    return np.repeat(np.repeat(m, 4, 0), 4, 1)[:H, :W, None]


def conform(seg):
    f0, f1 = round(seg['t0'] * FPS), round(seg['t1'] * FPS)
    s = tmap(seg)
    ps = [min(NSRC - 1, max(0.0, s(f / FPS) * SFPS)) for f in range(f0, f1)]
    a, b = int(np.floor(min(ps))), min(NSRC - 1, int(np.ceil(max(ps))) + 1)
    d = os.path.join(OUT, seg['id']); os.makedirs(d, exist_ok=True)
    for old in os.listdir(d):
        if old.endswith('.jpg'): os.remove(os.path.join(d, old))
    enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
                            '-i', '-', '-vf', 'scale=out_color_matrix=bt601:out_range=full,format=yuvj420p', '-q:v', '3',
                            '-start_number', '0', os.path.join(d, '%04d.jpg')], stdin=subprocess.PIPE)
    rd = Reader(seg['clip'], a, b)
    log = []
    for k, p in enumerate(ps):
        i = int(np.floor(p)); w = p - i
        A = rd.get(i)
        if w < 1e-3 or i + 1 >= NSRC: out = A
        else:
            B = rd.get(i + 1)
            bl = A.astype(np.float32) * (1 - w) + B.astype(np.float32) * w
            if seg['mode'] == 'adaptive':
                m = motion_mask(A, B)
                near = (B if w >= 0.5 else A).astype(np.float32)
                bl = bl * (1 - m) + near * m
            out = np.clip(bl + 0.5, 0, 255).astype(np.uint8)
        enc.stdin.write(out.tobytes())
        log.append(round(p, 3))
    enc.stdin.close(); enc.wait(); rd.close()
    print(f"{seg['id']:4s} {seg['clip']:10s} edit {seg['t0']:.4f}-{seg['t1']:.4f}  frames {f1 - f0:3d}  source {ps[0] / SFPS:.3f}-{ps[-1] / SFPS:.3f} s"
          f" (src frames {ps[0]:.1f}-{ps[-1]:.1f}, {seg['mode']})")
    return {'f0': f0, 'n': f1 - f0, 'clip': seg['clip'], 'p': log}


if __name__ == '__main__':
    want = set(sys.argv[1:])
    mf = os.path.join(OUT, 'manifest.json')
    M = json.load(open(mf)) if os.path.exists(mf) else {}
    for seg in FT['segs']:
        if want and seg['id'] not in want: continue
        M[seg['id']] = conform(seg)
    M = {s['id']: M[s['id']] for s in FT['segs'] if s['id'] in M}
    json.dump(M, open(mf, 'w'), separators=(',', ':'))
    print('manifest', mf)
