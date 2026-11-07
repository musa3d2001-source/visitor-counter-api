"""MOR — track the cups' small printed Arabic in the conformed footage, so the page can soften it (CD review).
The AI rendered it wrong: in m3 the top-right block reads as garbage, in m7 it reads «الكميت» for «الكويت». The English
("Kuwait / Al jahra city") and «مور MOR» are correct and are left untouched.

Method: normalized cross-correlation of a template (the text block) inside a ±R px search window, frame to frame,
on the 30 fps JPEG sequences in src/footage/<seg>/ (run tools/extract.sh first). The template is refreshed from the
matched position every frame, blended 70/30 with the original so the track neither drifts nor jitters.
Writes src/assets/patches.json: {seg: [[x, y, w, h], ...one box per segment frame, in SOURCE px (1080×1920)]}.
Run: python3 src/tools/track_patch.py
"""
import os, json
import numpy as np
from PIL import Image
from numpy.lib.stride_tricks import sliding_window_view

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)
FOOT = os.path.join(SRC, 'footage')
# initial boxes (source px, frame 0 of each segment), measured on full-size frames
START = {'C': (812, 768, 100, 140), 'G': (872, 1120, 118, 86)}
R = 18

def gray(seg, i):
    return np.asarray(Image.open(os.path.join(FOOT, seg, f'{i:04d}.jpg')).convert('L'), np.float32)

def ncc_search(img, tpl, x0, y0):
    h, w = tpl.shape
    ys, xs = max(0, y0 - R), max(0, x0 - R)
    win = img[ys:y0 + R + h, xs:x0 + R + w]
    patches = sliding_window_view(win, (h, w))
    t = (tpl - tpl.mean()) / (tpl.std() + 1e-6)
    pm = patches.mean(axis=(2, 3), keepdims=True); ps = patches.std(axis=(2, 3), keepdims=True) + 1e-6
    score = (((patches - pm) / ps) * t).mean(axis=(2, 3))
    dy, dx = np.unravel_index(np.argmax(score), score.shape)
    return xs + dx, ys + dy, float(score.max())

out = {}
for seg, (x, y, w, h) in START.items():
    n = len([f for f in os.listdir(os.path.join(FOOT, seg)) if f.endswith('.jpg')])
    img = gray(seg, 0); tpl0 = img[y:y + h, x:x + w].copy(); tpl = tpl0.copy()
    boxes = [[x, y, w, h]]; worst = 1
    for i in range(1, n):
        img = gray(seg, i)
        x, y, s = ncc_search(img, tpl, x, y); worst = min(worst, s)
        tpl = 0.7 * img[y:y + h, x:x + w] + 0.3 * tpl0
        boxes.append([int(x), int(y), w, h])
    # smooth the track (the camera moves smoothly; this removes 1 px match jitter)
    b = np.array(boxes, np.float32); k = np.ones(5) / 5
    for c in (0, 1):
        p = np.pad(b[:, c], 2, mode='edge'); b[:, c] = np.convolve(p, k, mode='valid')
    out[seg] = [[round(float(v), 1) for v in r] for r in b]
    print(f'{seg}: {n} frames, start {boxes[0][:2]} → end {boxes[-1][:2]}, worst NCC {worst:.2f}')
json.dump(out, open(os.path.join(SRC, 'assets', 'patches.json'), 'w'), separators=(',', ':'))
