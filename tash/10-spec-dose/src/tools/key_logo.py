"""DOSE: key the orange dose mark off the off-white logo plate into a clean vector-like alpha layer (no redrawing: the
shape is the plate's own pixels, keyed by colour projection, then de-noised at 2x and re-thresholded so the paper
texture does not crawl inside the letters). Source: footage/ai/frames/logo_plate.png (the faithful recreation made
for this pitch only). The colour is set to the brand orange #F26A21 (the plate measured about #EC6C19).

Writes src/assets/:
  logo.png       the whole mark (specialty / dose / cafe), orange RGBA, cropped to the mark + 8 px
  logo_a.png     the same alpha as an 8-bit grey mask (used by tools/fx_sign.py for the wall sign)
  logo.json      plate size, paper colour, the crop box in plate px, and the three words' boxes in crop px
Run: python3 src/tools/key_logo.py
"""
import os, json
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)
PLATE = os.path.join(SRC, '..', 'footage', 'ai', 'frames', 'logo_plate.png')
OUT = os.path.join(SRC, 'assets'); os.makedirs(OUT, exist_ok=True)
ORANGE = np.array([0xF2, 0x6A, 0x21], np.uint8)

im = np.asarray(Image.open(PLATE).convert('RGB')).astype(np.float32)
H, W, _ = im.shape
corners = np.concatenate([im[40:300, 40:300].reshape(-1, 3), im[-300:-40, -300:-40].reshape(-1, 3)])
BG = np.median(corners, 0)
# the mark's solid colour: median of strongly orange pixels
sat = (im[..., 0] - im[..., 2]) / (im[..., 0] + 1)
OR = np.median(im[sat > 0.75], 0)
v = OR - BG
a = ((im - BG) @ v) / (v @ v)
a = np.clip((a - 0.06) / 0.88, 0, 1)
# de-noise: at 2x, a light blur and a smooth re-threshold around 0.5 (keeps the plate's outline, drops paper grain)
a2 = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).resize((W * 2, H * 2), Image.LANCZOS), np.float32) / 255
a2 = ndimage.gaussian_filter(a2, 1.2)
a2 = np.clip((a2 - 0.5) / 0.22 + 0.5, 0, 1)
a = np.asarray(Image.fromarray((a2 * 255).astype(np.uint8)).resize((W, H), Image.LANCZOS), np.float32) / 255
a[a < 0.02] = 0
# remove specks: keep components that belong to the mark (area > 400 px at plate size)
lab, n = ndimage.label(a > 0.5)
sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
keep = ndimage.binary_dilation(np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 400]), iterations=3)
a *= keep
ys, xs = np.where(a > 0.01)
x0, y0, x1, y1 = xs.min() - 8, ys.min() - 8, xs.max() + 9, ys.max() + 9
ac = a[y0:y1, x0:x1]
rgba = np.zeros(ac.shape + (4,), np.uint8); rgba[..., :3] = ORANGE; rgba[..., 3] = np.round(ac * 255)
Image.fromarray(rgba).save(os.path.join(OUT, 'logo.png'), optimize=True)
Image.fromarray(np.round(ac * 255).astype(np.uint8)).save(os.path.join(OUT, 'logo_a.png'), optimize=True)
# words: split by the empty rows between specialty / dose / cafe (dose's d ascender rises beside specialty, so split
# columns first for the top line: specialty sits right of the d stem)
lab, n = ndimage.label(ac > 0.5)
objs = ndimage.find_objects(lab)
boxes = sorted([(s[0].start, s[0].stop, s[1].start, s[1].stop, int((lab[s] == i + 1).sum())) for i, s in enumerate(objs)], key=lambda b: -b[4])
dose = boxes[0]
words = {'dose': dose}
rest = [b for b in boxes[1:] if b[4] > 200]
top = [b for b in rest if b[1] <= dose[0] + (dose[1] - dose[0]) * 0.2]
bot = [b for b in rest if b[0] >= dose[1] - (dose[1] - dose[0]) * 0.2]
u = lambda bs: (min(b[0] for b in bs), max(b[1] for b in bs), min(b[2] for b in bs), max(b[3] for b in bs))
words['specialty'] = u(top); words['cafe'] = u(bot)
meta = {'plate': [W, H], 'paper': [int(round(x)) for x in BG], 'plate_orange': [int(round(x)) for x in OR],
        'orange': '#F26A21', 'crop': [int(x0), int(y0), int(x1 - x0), int(y1 - y0)],
        'words': {k: {'x': int(b[2]), 'y': int(b[0]), 'w': int(b[3] - b[2]), 'h': int(b[1] - b[0])} for k, b in words.items()}}
json.dump(meta, open(os.path.join(OUT, 'logo.json'), 'w'), indent=1)
# check: composite back over the paper colour and compare with the plate inside the crop
rec = BG + ac[..., None] * v
err = np.abs(rec - im[y0:y1, x0:x1]).mean(2)
print(json.dumps(meta, indent=1))
print(f'mark fills {(x1 - x0) / W * 100:.1f}% of the plate width; reconstruction error mean {err.mean():.2f}, p99 {np.percentile(err, 99):.1f} (8-bit)')
