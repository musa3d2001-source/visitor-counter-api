"""Prepare footage frames for the middle-section preview (f135-284) with the zero-credit fixes of BUILD-SPEC R3-21..R3-23.
usage: python3 -I prep.py <scratch r4 dir> <scratch r5 dir> <out dir>
"""
import sys, os
import numpy as np
from PIL import Image
r4, r5, out = sys.argv[1:4]; os.makedirs(out, exist_ok=True)
ld = lambda p: np.asarray(Image.open(p).convert('RGB')).astype(np.float64)
sv = lambda a, p: Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8)).save(p)
H, W = 1920, 1080; yy, xx = np.mgrid[0:H, 0:W]
def feather(mask, r=6):
    from PIL import ImageFilter
    return np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(np.float64)[..., None] / 255
# coffee: n4-n18 already retouched (BT.709, specks out, top plate); settled n68-n82 get a floor plate from n2 outside the glass
for n in range(4, 19): sv(ld(f'{r4}/hookH/src/{n+1:04d}.png'), f'{out}/c{n:04d}.png')
plate = ld(f'{r4}/png709/0003.png')
floor = (((yy > 1500) & ((xx < 372) | (xx > 675))) | (yy > 1600)).astype(np.float64)
wf = feather(floor)
for n in range(68, 83):
    a = ld(f'{r4}/png709/{n+1:04d}.png'); sv(a * (1 - wf) + plate * wf, f'{out}/c{n:04d}.png')
# kunafa: n30-n59 as delivered (default BT.601 decode)
for n in range(30, 60): sv(ld(f'{r5}/qc_s5/frames/{n+1:04d}.png'), f'{out}/k{n:04d}.png')
# perfume/oud: R3-12 fade to each frame's own flat backdrop, ramp y 1010 -> 880
w = np.clip((1010 - yy) / 130.0, 0, 1)[..., None]
for n in range(0, 45):
    a = ld(f'{r5}/qc_s2/frames/{n+1:04d}.png'); bg = np.median(a[0:800, 900:1080].reshape(-1, 3), axis=0)
    sv(a * (1 - w) + bg * w, f'{out}/o{n:04d}.png')
# burger: seed plate from n72 (no seeds in the air) on the sides, used for the falling-bun frames n11-n29
p72 = ld(f'{r5}/qc_s3/frames/0073.png')
side = (((xx < 270) | (xx > 830)) & (yy > 885) & (yy < 1560)).astype(np.float64); ws = feather(side, 5)
for n in list(range(11, 23)) + list(range(25, 69)):
    a = ld(f'{r5}/qc_s3/frames/{n+1:04d}.png')
    if n <= 29: a = a * (1 - ws) + p72 * ws
    sv(a, f'{out}/b{n:04d}.png')
print('prepared', len(os.listdir(out)), 'frames')
