"""DOSE spec ad: shared helpers for the footage tools (decode at the edit geometry, paths, small image utilities).
Every tool works in CONFORMED space: 1080x1920, i.e. the 1080x1912 Kling source scaled to 1084x1920 (lanczos) and
centre-cropped 2 px a side (cover), exactly as tools/conform.py feeds the page. d2d_carafe (720x1280 Seedance) is
upscaled x1.5 to 1080x1920 (lanczos) with a light unsharp mask. Source frames are 24 fps, 121 per clip."""
import os, subprocess
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)
CLIPS = os.path.normpath(os.path.join(SRC, '..', 'footage', 'ai'))
ASSETS = os.path.join(SRC, 'assets')
PREP = os.path.join(SRC, 'footage', '_src')          # fixed source frames (not committed; tools/prep.py)
W, H, SFPS, NSRC = 1080, 1920, 24, 121

VF = {
    # untagged Kling/Seedance clips are BT.709 HD: decode them as such (swscale would otherwise assume BT.601)
    'kling': f"scale={W + 4}:{H}:flags=lanczos+accurate_rnd+full_chroma_int:in_color_matrix=bt709:in_range=tv,crop={W}:{H}:2:0",
    'seedance': f"scale={W}:{H}:flags=lanczos+accurate_rnd+full_chroma_int:in_color_matrix=bt709:in_range=tv,unsharp=5:5:0.45:5:5:0.0",
}
KIND = {'d2d_carafe': 'seedance'}


def decode(clip, a=0, b=NSRC - 1):
    """frames a..b (inclusive) of a clip at the edit geometry, as a list of uint8 RGB arrays (audio ignored)."""
    vf = VF[KIND.get(clip, 'kling')]
    p = subprocess.run(['ffmpeg', '-v', 'error', '-i', os.path.join(CLIPS, clip + '.mp4'), '-an', '-vf',
                        f"select='between(n\\,{a}\\,{b})',{vf},format=rgb24", '-vsync', '0', '-f', 'rawvideo', '-'],
                       stdout=subprocess.PIPE, check=True)
    buf = np.frombuffer(p.stdout, np.uint8)
    n = len(buf) // (W * H * 3)
    return [buf[i * W * H * 3:(i + 1) * W * H * 3].reshape(H, W, 3) for i in range(n)]


def k2c(x, y):
    """Kling source px (1080x1912) -> conformed px (1080x1920)."""
    return x * (W + 4) / W - 2, y * H / 1912


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def tmap(seg):
    """edit time -> source seconds (2 keys: a straight line, extended; 3+: monotone cubic (Fritsch-Carlson), or piecewise linear with interp=linear)."""
    k = np.array(seg['keys'], float)
    if seg.get('interp') == 'linear' and len(k) > 2:            # piecewise linear (a hold, then a constant speed)
        return lambda t: float(np.interp(t, k[:, 0], k[:, 1], left=None, right=None)) if k[0, 0] <= t <= k[-1, 0] else \
            (k[0, 1] if t < k[0, 0] else k[-1, 1] + (t - k[-1, 0]) * (k[-1, 1] - k[-2, 1]) / (k[-1, 0] - k[-2, 0]))
    if len(k) == 2:
        (t0, s0), (t1, s1) = k
        return lambda t: s0 + (t - t0) * (s1 - s0) / (t1 - t0)
    x, y = k[:, 0], k[:, 1]
    d = np.diff(y) / np.diff(x)
    m = np.concatenate([[d[0]], (d[:-1] + d[1:]) / 2, [d[-1]]])
    for i in range(len(d)):
        if d[i] == 0: m[i] = m[i + 1] = 0; continue
        a, b = m[i] / d[i], m[i + 1] / d[i]
        if a * a + b * b > 9:
            tau = 3 / np.hypot(a, b); m[i] = tau * a * d[i]; m[i + 1] = tau * b * d[i]
    def f(t):
        if t <= x[0]: return y[0] + (t - x[0]) * m[0]
        if t >= x[-1]: return y[-1] + (t - x[-1]) * m[-1]
        i = min(len(x) - 2, np.searchsorted(x, t) - 1); h = x[i + 1] - x[i]; u = (t - x[i]) / h
        h00, h10, h01, h11 = 2*u**3 - 3*u**2 + 1, u**3 - 2*u**2 + u, -2*u**3 + 3*u**2, u**3 - u**2
        return h00 * y[i] + h10 * h * m[i] + h01 * y[i + 1] + h11 * h * m[i + 1]
    return f


def edit_frames(seg, fps=30):
    f0, f1 = round(seg['t0'] * fps), round(seg['t1'] * fps)
    s = tmap(seg)
    return f0, f1, [min(NSRC - 1, max(0.0, s(f / fps) * SFPS)) for f in range(f0, f1)]


def cues():
    import json
    return json.load(open(os.path.join(SRC, 'cues.json')))
