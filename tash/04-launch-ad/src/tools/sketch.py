"""Storyboard 'pencil' panels made from our own footage frames (XDoG edges + a soft graphite wash on paper).
Writes src/assets/sketch-<n>.jpg at 1080x1920. Run: python3 src/tools/sketch.py"""
import subprocess, sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
T = '/home/user/visitor-counter-api/tash'
OUT = T + '/04-launch-ad/src/assets'
SRC = [  # (name, video, time) — sc02 is frame 0 of the wire/clay/final BTS range so the push-in matches the wire pass
    ('sc01', T + '/05-concept-ads/01-perfume-layl/LAYL-concept-9x16.mp4', 0.62),
    ('sc02', T + '/04-launch-ad/footage/bts/layl-final_3.00-6.00.mp4', 0.0),
    ('sc03', T + '/04-launch-ad/footage/clean/layl-spray_6.00-8.00.mp4', 0.75),
]
PAPER = np.array([245, 245, 233], float); LEAD = np.array([40, 39, 36], float)

def grab(v, t):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(t), '-i', v, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(1920, 1080, 3).astype(float) / 255

for name, v, t in SRC:
    im = grab(v, t)
    y = (im * [0.30, 0.55, 0.15]).sum(2) ** 0.7          # lift the darks so silhouettes carry edges
    s = 1.6; g1 = nd.gaussian_filter(y, s); g2 = nd.gaussian_filter(y, s * 1.6)
    d = g1 - 0.985 * g2
    e = np.where(d >= -0.006, 1.0, np.clip(1 + 1.15 * np.tanh(70 * (d + 0.006)), 0, 1))  # XDoG: 1 = paper, →0 = line
    e = nd.gaussian_filter(e, 0.6)
    wash = 1 - 0.30 * nd.gaussian_filter(np.clip((y - 0.30) * 1.8, 0, 1), 5)  # graphite tone on the lit forms
    # hatching on the tone (seeded, diagonal) so the wash reads as pencil, not as a photo
    yy, xx = np.mgrid[0:1920, 0:1080]
    hatch = np.clip(1.6 * np.sin((xx + yy) * 0.42 + np.random.default_rng(3).normal(0, 0.5, (1920, 1080))), 0, 1)
    tone = 1 - (1 - wash) * (0.25 + 0.75 * hatch)
    k = np.clip(e * tone, 0, 1)[..., None]
    rgb = LEAD + (PAPER - LEAD) * k
    rgb += np.random.default_rng(7).normal(0, 2.2, rgb.shape)  # paper tooth
    Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).save(f'{OUT}/sketch-{name}.jpg', quality=92)
    print('wrote', name)
