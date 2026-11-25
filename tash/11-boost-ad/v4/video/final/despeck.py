"""Remove the dark red-brown specks the video model left in the milk of the opener (BUILD-SPEC R3-18b), 0 credits.
Detection: inside the glass interior, where the local median (61 px) is light (luma > 115), pixels darker than luma 125 and at least 35 levels under that median.
Fill: normalised convolution with a tall, thin Gaussian, so the vertical glass ribs carry through the patch; matched grain.
usage: python3 -I despeck.py <in dir NNNN.png> <out dir> <n from> <n to> [mask dir]
"""
import sys, os
import numpy as np
from PIL import Image, ImageFilter
src, out, a, b = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
mdir = sys.argv[5] if len(sys.argv) > 5 else None
os.makedirs(out, exist_ok=True); mdir and os.makedirs(mdir, exist_ok=True)
X0, X1, Y0, Y1 = 398, 652, 1290, 1525                     # glass interior (layout px): below the rim and the ice, above the thick base
def gblur1d(arr, sigma, axis):
    r = int(3 * sigma) + 1; k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2); k /= k.sum()
    return np.apply_along_axis(lambda v: np.convolve(np.pad(v, r, mode='edge'), k, mode='valid'), axis, arr)
rng = np.random.default_rng(20261110)
for n in range(a, b + 1):
    im = np.asarray(Image.open(os.path.join(src, f'{n + 1:04d}.png')).convert('RGB')).astype(np.float64)
    R = im[Y0:Y1, X0:X1].copy()
    Lm = 0.2126 * R[..., 0] + 0.7152 * R[..., 1] + 0.0722 * R[..., 2]
    bg = np.asarray(Image.fromarray(np.clip(Lm, 0, 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(61))).astype(np.float64)
    m = ((bg - Lm) > 35) & (Lm < 125) & (bg > 115)
    mi = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.GaussianBlur(4))
    w = np.asarray(mi).astype(np.float64) / 255.0                       # 1 = replace
    if w.max() > 0:
        keep = (np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(21))) == 0).astype(np.float64)
        num = gblur1d(gblur1d(R * keep[..., None], 22, 0), 1.2, 1); den = gblur1d(gblur1d(keep, 22, 0), 1.2, 1)[..., None]
        fill = num / np.maximum(den, 1e-3)
        fill += rng.normal(0, 1.6, fill.shape)
        R = R * (1 - w[..., None]) + fill * w[..., None]
        im[Y0:Y1, X0:X1] = R
    Image.fromarray(np.clip(im + 0.5, 0, 255).astype(np.uint8)).save(os.path.join(out, f'{n + 1:04d}.png'))
    if mdir: Image.fromarray((w * 255).astype(np.uint8)).save(os.path.join(mdir, f'{n + 1:04d}.png'))
    print(n, 'speck px', int(m.sum()))
