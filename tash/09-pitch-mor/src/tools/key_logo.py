"""MOR — key the cream mark off the burgundy logo plate into animatable layers (no redrawing: every layer is the plate's
own pixels, keyed by colour distance). Source: footage/ai/frames/logo_plate.png (CD-approved faithful recreation, pitch only).

Writes src/assets/:
  ring.png       the keyhole outline (outer cream line)            cream RGBA
  rosette.png    the floral rosette inside the round top           cream RGBA
  plant.png      the tulip / plant motif inside the keyhole body   cream RGBA
  word_ar.png    «مور»                                             cream RGBA
  word_lat.png   MOR                                               cream RGBA
  hole.png       the keyhole silhouette (outline filled), white alpha mask: the hook's cut-out and the end card's window
  logo.json      plate size, plate colour, cream colour and each layer's box in plate pixels
Composited at their boxes over the plate colour, the layers reproduce the plate (checked by the diff printed at the end).
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

im = np.asarray(Image.open(PLATE).convert('RGB')).astype(np.float32)
H, W, _ = im.shape
BG = np.median(im[60:400, 60:400].reshape(-1, 3), 0)
CR = np.array([248, 236, 214], np.float32)           # the plate's cream (median of the mark's solid pixels, measured)
v = CR - BG
a = ((im - BG) @ v) / (v @ v)                         # projection on the burgundy→cream axis: 0 = plate, 1 = cream
a = np.clip((a - 0.04) / 0.92, 0, 1)                  # tiny dead zones remove plate noise and keep the cream solid

solid = a > 0.5
ys = np.where(solid.any(1))[0]
gap = [(ys[i], ys[i + 1]) for i in range(len(ys) - 1) if ys[i + 1] - ys[i] > 40][0]
EMB = (slice(0, (gap[0] + gap[1]) // 2), slice(None))
WORD = (slice((gap[0] + gap[1]) // 2, H), slice(None))

# --- emblem: the outer outline is the component whose bounding box is the emblem's bounding box
lab, n = ndimage.label(solid[EMB])
objs = ndimage.find_objects(lab)
area = lambda s: (s[0].stop - s[0].start) * (s[1].stop - s[1].start)
ring_id = 1 + max(range(n), key=lambda i: area(objs[i]))
ring_core = lab == ring_id
hole = ndimage.binary_fill_holes(ring_core)
# the outline touches the inner frame of the plant motif in places, so ownership is by distance from the silhouette's
# outer edge: the outline is ~24 px thick and sits ≥18 px clear of the inner art (measured across the body)
hole_d = ndimage.binary_dilation(hole, iterations=3)          # include the outline's anti-aliased outer pixels
edge_d = ndimage.distance_transform_edt(hole_d)
near_ring = (edge_d <= 29) & hole_d          # outline (24 px) + its anti-aliasing; inner-art tips that touch it stay inner art
ae = a[EMB]
ring_a = np.where(near_ring, ae, 0)
inside_a = np.where(~near_ring & hole_d, ae, 0)
# tips of the inner art that touch the outline: a morphological opening (disk r=7) keeps the 24 px band and drops the
# thin spurs, which go back to the inner art (the composite is unchanged; only layer ownership moves)
yy_, xx_ = np.mgrid[-7:8, -7:8]; disk = (xx_ ** 2 + yy_ ** 2) <= 49
band = ndimage.binary_opening(ring_a > 0.5, structure=disk)
own = ndimage.binary_dilation(band, iterations=2) & near_ring
inside_a = np.where(near_ring & ~own, ae, inside_a); ring_a = np.where(own, ae, 0)
# rosette vs plant: split at the keyhole's neck (narrowest row of the silhouette below the round top)
widths = hole.sum(1).astype(float)
rows = np.where(widths > 0)[0]
top, bot = rows[0], rows[-1]
mid = slice(top + int((bot - top) * 0.35), top + int((bot - top) * 0.62))
neck = mid.start + int(np.argmin(widths[mid]))
lab2, n2 = ndimage.label(inside_a > 0.3)
com = ndimage.center_of_mass(np.ones_like(lab2), lab2, range(1, n2 + 1))
ros_ids = [i + 1 for i, c in enumerate(com) if c[0] < neck]
ros_mask = ndimage.binary_dilation(np.isin(lab2, ros_ids), iterations=3)
ros_a = np.where(ros_mask, inside_a, 0)
plant_a = np.where(ros_mask, 0, inside_a)

# --- wordmark: MOR (left) and «مور» (right), split at the widest empty column gap
aw = a[WORD]
cols = np.where((aw > 0.5).any(0))[0]
cg = max(((cols[i], cols[i + 1]) for i in range(len(cols) - 1)), key=lambda p: p[1] - p[0])
xs = (cg[0] + cg[1]) // 2
lat_a = aw.copy(); lat_a[:, xs:] = 0
ar_a = aw.copy(); ar_a[:, :xs] = 0

meta = {'plate': [W, H], 'bg': [int(round(x)) for x in BG], 'cream': [int(x) for x in CR], 'neck': int(neck), 'layers': {}}

def save(name, alpha, y0, mask=False):
    yy, xx = np.where(alpha > 0.002)
    b = (int(xx.min()) - 2, int(yy.min()) - 2, int(xx.max()) + 3, int(yy.max()) + 3)
    crop = alpha[b[1]:b[3], b[0]:b[2]]
    rgba = np.zeros(crop.shape + (4,), np.uint8)
    rgba[..., :3] = 255 if mask else CR.astype(np.uint8)
    rgba[..., 3] = np.round(crop * 255).astype(np.uint8)
    Image.fromarray(rgba).save(os.path.join(OUT, name + '.png'), optimize=True)
    meta['layers'][name] = {'x': b[0], 'y': int(b[1] + y0), 'w': b[2] - b[0], 'h': b[3] - b[1]}

save('ring', ring_a, 0)
save('rosette', ros_a, 0)
save('plant', plant_a, 0)
# the hole mask: silhouette filled up to the ring's OUTER edge, feathered 1 px (anti-aliased like the plate)
hole_soft = ndimage.gaussian_filter(ndimage.binary_fill_holes(ae > 0.5).astype(np.float32), 0.8)
save('hole', np.maximum(hole_soft, 0), 0, mask=True)
save('word_ar', ar_a, EMB[0].stop)
save('word_lat', lat_a, EMB[0].stop)
json.dump(meta, open(os.path.join(OUT, 'logo.json'), 'w'), indent=1)

# --- check: composite the layers back over the plate colour and compare with the plate
rec = np.zeros((H, W), np.float32)
for n_ in ('ring', 'rosette', 'plant', 'word_ar', 'word_lat'):
    L = meta['layers'][n_]; al = np.asarray(Image.open(os.path.join(OUT, n_ + '.png')))[..., 3] / 255
    rec[L['y']:L['y'] + L['h'], L['x']:L['x'] + L['w']] = np.maximum(rec[L['y']:L['y'] + L['h'], L['x']:L['x'] + L['w']], al)
recon = BG + rec[..., None] * v
err = np.abs(recon - im).mean(2)
print(json.dumps(meta, indent=1))
print(f'reconstruction error: mean {err.mean():.2f}, p99 {np.percentile(err, 99):.1f}, max {err.max():.1f} (8-bit levels)')
yy, xx = np.unravel_index(np.argsort(err.ravel())[-5:], err.shape)
print('largest errors at (x, y):', list(zip(xx.tolist(), yy.tolist())))
