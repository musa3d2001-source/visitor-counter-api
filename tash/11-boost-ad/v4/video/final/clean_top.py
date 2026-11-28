"""Top clean plate for the opener (BUILD-SPEC R3-18a): rows above layout y 900 come from a calm plate frame, ramped 900 -> 880.
usage: python3 -I clean_top.py <frames dir (NNNN.png, NNNN = n+1)> <plate frame number n> <out dir> <n from> <n to> [plate dir]
"""
import sys, os
import numpy as np
from PIL import Image
src, plate_n, out, a, b = sys.argv[1], int(sys.argv[2]), sys.argv[3], int(sys.argv[4]), int(sys.argv[5]); pdir = sys.argv[6] if len(sys.argv) > 6 else src
os.makedirs(out, exist_ok=True)
P = np.asarray(Image.open(os.path.join(pdir, f'{plate_n + 1:04d}.png')).convert('RGB')).astype(np.float64)
H = P.shape[0]; y = np.arange(H)[:, None, None]
w = np.clip((900 - y) / 20.0, 0, 1)             # 1 above y 880, 0 below y 900
for n in range(a, b + 1):
    F = np.asarray(Image.open(os.path.join(src, f'{n + 1:04d}.png')).convert('RGB')).astype(np.float64)
    Image.fromarray(np.clip(F * (1 - w) + P * w + 0.5, 0, 255).astype(np.uint8)).save(os.path.join(out, f'{n + 1:04d}.png'))
print('cleaned', a, '-', b, 'with plate n', plate_n)
