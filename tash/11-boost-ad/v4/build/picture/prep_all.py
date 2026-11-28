"""Prepare every footage frame the full film uses (A-20, A-14, TikTok, 4:5), with the zero-credit fixes of BUILD-SPEC R3-21..R3-24.
Extends video/preview/prep.py (same fixes) to all used ranges.
usage: python3 -I prep_all.py <scratch r4 dir> <scratch r5 dir> <out dir>
  c0000-c0018  opener n0-n18 (BT.709, specks out, top clean plate)        hook, punch-in, return, porthole iris, Coffee A, loop freeze (n2)
  c0068-c0096  opener settled tail (floor plate from n2, bean + streak fill, light unsharp)   Coffee B lens, CTA band
  k0030-k0072  kunafa S5 (tray-floor squiggle cloned out up to n46)       drain, Kunafa A/B, porthole, CTA band
  o0000-o0044  perfume S2 (fade to its own backdrop above y 1010->880)    Oud A/B/C, porthole, CTA band
  b0011-b0022, b0054-b0072  burger S3 (side seed plate on n11-n22)        Burger A/B/C, porthole, CTA band
"""
import sys, os, math
import numpy as np
from PIL import Image, ImageFilter
r4, r5, out = sys.argv[1:4]; os.makedirs(out, exist_ok=True)
ld = lambda p: np.asarray(Image.open(p).convert('RGB')).astype(np.float64)
sv = lambda a, p: Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8)).save(p)
H, W = 1920, 1080; yy, xx = np.mgrid[0:H, 0:W]
def feather(mask, r=5):
    return np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(np.float64)[..., None] / 255
def g1d(arr, sigma, axis):
    r = int(3 * sigma) + 1; k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2); k /= k.sum()
    return np.apply_along_axis(lambda v: np.convolve(np.pad(v, r, mode='edge'), k, mode='valid'), axis, arr)
def box_fill(a, x0, y0, x1, y1, pad=24):
    """Fill a box by tall-thin normalised convolution from the pixels around it (vertical structure carries through)."""
    X0, Y0, X1, Y1 = x0 - pad, y0 - pad * 2, x1 + pad, y1 + pad * 2
    R = a[Y0:Y1, X0:X1].copy(); m = np.zeros(R.shape[:2]); m[y0 - Y0:y1 - Y0, x0 - X0:x1 - X0] = 1
    keep = 1 - m; num = g1d(g1d(R * keep[..., None], 14, 0), 2.0, 1); den = g1d(g1d(keep, 14, 0), 2.0, 1)[..., None]
    fill = num / np.maximum(den, 1e-3); w = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.5))).astype(np.float64)[..., None] / 255
    a[Y0:Y1, X0:X1] = R * (1 - w) + fill * w
    return a
only = set(sys.argv[4].split(',')) if len(sys.argv) > 4 else {'c', 'k', 'o', 'b'}
if 'c' in only:
    # opener n0-n18: already despecked + top plate (video/final/despeck.py, clean_top.py) in r4/hookH/src (NNNN = n+1)
    for n in range(0, 19): sv(ld(f'{r4}/hookH/src/{n+1:04d}.png'), f'{out}/c{n:04d}.png')
    # settled n68-n96: floor plate from n2 outside the glass silhouette (and under the glass base), bean + streak fill, light sharpening
    plate = ld(f'{r4}/png709/0003.png')
    glass = (yy >= 1180) & (yy < 1556) & (xx >= 384) & (xx <= 663)
    wf = feather(((yy > 1410) & ~glass).astype(np.float64), 5)
    for n in range(68, 97):
        a = ld(f'{r4}/png709/{n+1:04d}.png'); a = a * (1 - wf) + plate * wf
        a = box_fill(a, 390, 1270, 412, 1315)
        if n <= 80: a = box_fill(a, 523, 1315, 577, 1375)
        Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8)).filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2)).save(f'{out}/c{n:04d}.png')
if 'k' in only:
    CX, CY = 537.5, 1272.5; th = math.radians(8)
    for n in range(30, 73):
        a = ld(f'{r5}/qc_s5/frames/{n+1:04d}.png')
        if n <= 46:
            x0, y0, x1, y1 = 388, 1110, 437, 1154
            R = a[y0:y1, x0:x1]; L = 0.2126 * R[..., 0] + 0.7152 * R[..., 1] + 0.0722 * R[..., 2]
            med = np.asarray(Image.fromarray(np.clip(L, 0, 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(21))).astype(np.float64)
            m = ((med - L) > 30).astype(np.uint8) * 255
            m = np.asarray(Image.fromarray(m).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1.5))).astype(np.float64)[..., None] / 255
            ys, xs = np.mgrid[y0:y1, x0:x1]; dx, dy = xs - CX, ys - CY
            sx = np.clip(np.round(CX + dx * math.cos(th) - dy * math.sin(th)).astype(int), 0, W - 1); sy = np.clip(np.round(CY + dx * math.sin(th) + dy * math.cos(th)).astype(int), 0, H - 1)
            a[y0:y1, x0:x1] = R * (1 - m) + a[sy, sx] * m
        sv(a, f'{out}/k{n:04d}.png')
if 'o' in only:
    w = np.clip((1010 - yy) / 130.0, 0, 1)[..., None]
    for n in range(0, 45):
        a = ld(f'{r5}/qc_s2/frames/{n+1:04d}.png'); bg = np.median(a[0:800, 900:1080].reshape(-1, 3), axis=0)
        sv(a * (1 - w) + bg * w, f'{out}/o{n:04d}.png')
if 'b' in only:
    p72 = ld(f'{r5}/qc_s3/frames/0073.png')
    ws = feather((((xx < 270) | (xx > 830)) & (yy > 885) & (yy < 1560)).astype(np.float64), 5)
    for n in list(range(11, 23)) + list(range(54, 73)):
        a = ld(f'{r5}/qc_s3/frames/{n+1:04d}.png')
        if n <= 22: a = a * (1 - ws) + p72 * ws
        sv(a, f'{out}/b{n:04d}.png')
print('prepared', len(os.listdir(out)), 'frames in', out)
