#!/usr/bin/env python3
"""s5_details assets (scene builder D). Re-run after the samples change:
    python3 src/assets/s5_details/prep_s5.py        (from tash/12-students-ad/)
Reads ../samples/*.png (read-only); writes only into this folder.

1. The margins shot uses the report's contents page (samples/report-02-contents.png). Its 13 table-of-contents rows are
   lifted off the paper as transparent pieces (colour-to-alpha against the locally estimated paper colour, so the ink,
   the orange numbers and the dotted leaders keep their exact colours) and the paper under them is filled back in:
     page_clean.jpg            the page without the 13 rows (everything else untouched)
     row{i}_{num|title|lead|pg}.png   each row in four parts: the section number, the title (sub-numbers ride with
                               the title), the dotted leader, the page number
     rows.json                 page-px boxes of every part + the band of each row
   The scene puts the parts back slightly out of line and SNAPS them onto the margin guides on «نضبّطها».
2. The before/after pair, Lanczos-scaled to the size they are shown at (no compositor minification):
     before.jpg, after.jpg     1000 x 562
3. grain.png                   a small paper-grain tile (multiplied very lightly over the page)
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
SAMPLES = HERE.parents[2] / 'samples'

# the 13 rows of the contents page: [y0, y1) bands between the rows (measured from the ink profile, see main())
BANDS = [(470, 538), (538, 609), (609, 673), (673, 719), (719, 768), (768, 822), (822, 896), (896, 958), (958, 1006),
         (1006, 1061), (1061, 1133), (1133, 1205), (1205, 1280)]
REGION = (88, 466, 1156, 1284)          # x0, y0, x1, y1 of the rows block (page px)


def paper_estimate(a):
    """smooth estimate of the paper colour everywhere (normalised convolution over the non-ink pixels)"""
    flat = np.array([244, 236, 223], float)
    ink = np.abs(a - flat).max(2) > 7
    ink = ndimage.binary_dilation(ink, iterations=5)
    w = (~ink).astype(float)
    out = np.empty_like(a)
    num_w = ndimage.gaussian_filter(w, 22)
    for c in range(3):
        out[..., c] = ndimage.gaussian_filter(a[..., c] * w, 22) / np.maximum(num_w, 1e-4)
    bad = num_w < 1e-3
    out[bad] = flat
    return out


def color_to_alpha(p, b):
    """GIMP-style colour-to-alpha against a per-pixel background b (both float 0..255, HxWx3)"""
    eps = 1e-6
    al = np.zeros(p.shape[:2])
    for c in range(3):
        dn = np.where(p[..., c] < b[..., c], (b[..., c] - p[..., c]) / np.maximum(b[..., c], eps),
                      (p[..., c] - b[..., c]) / np.maximum(255 - b[..., c], eps))
        al = np.maximum(al, dn)
    al = np.clip(al, 0, 1)
    col = (p - (1 - al[..., None]) * b) / np.maximum(al[..., None], eps)
    col = np.clip(col, 0, 255)
    al[al < 0.03] = 0
    return col, al


def segments(colmask, gap=8):
    segs, x, n = [], 0, len(colmask)
    while x < n:
        if colmask[x]:
            s = x
            while x < n and colmask[x]:
                x += 1
            segs.append([s, x])
        x += 1
    out = []
    for s in segs:
        if out and s[0] - out[-1][1] <= gap:
            out[-1][1] = s[1]
        else:
            out.append(s)
    return out


def main():
    src = Image.open(SAMPLES / 'report-02-contents.png').convert('RGB')
    a = np.asarray(src).astype(float)
    bgest = paper_estimate(a)

    # clean plate: the rows block replaced by the paper estimate
    clean = a.copy()
    x0, y0, x1, y1 = REGION
    clean[y0:y1, x0:x1] = bgest[y0:y1, x0:x1]
    Image.fromarray(np.clip(clean, 0, 255).astype(np.uint8)).save(HERE / 'page_clean.jpg', quality=94, subsampling=0)

    col, al = color_to_alpha(a, bgest)
    rows = []
    for i, (b0, b1) in enumerate(BANDS):
        band = al[b0:b1]
        cm = (band > 0.10).any(0)
        segs = segments(cm)
        big = [s for s in segs if s[1] - s[0] > 10 and 700 < s[0] < 1070]
        title_left = min(s[0] for s in big)
        parts = {
            'pg': (88, 150),
            'lead': (150, title_left - 10),
            'title': (title_left - 10, 1064),
            'num': (1100, 1156),
        }
        row = {'band': [b0, b1], 'parts': {}}
        for name, (px0, px1) in parts.items():
            sub = al[b0:b1, px0:px1]
            ys, xs = np.nonzero(sub > 0.02)
            if len(xs) == 0:
                continue
            # tight box + 3 px of air
            bx0, bx1 = max(px0, px0 + xs.min() - 3), min(px1, px0 + xs.max() + 4)
            by0, by1 = max(b0, b0 + ys.min() - 3), min(b1, b0 + ys.max() + 4)
            rgba = np.dstack([col[by0:by1, bx0:bx1], al[by0:by1, bx0:bx1] * 255]).astype(np.uint8)
            Image.fromarray(rgba, 'RGBA').save(HERE / f'row{i}_{name}.png', optimize=True)
            row['parts'][name] = [int(bx0), int(by0), int(bx1 - bx0), int(by1 - by0)]
        rows.append(row)

    meta = {
        'page': [src.width, src.height],
        'region': list(REGION),
        'rows': rows,
        'guides': {
            'note': 'page px: the right margin (section numbers right edge), the title column (titles right edge), the '
                    'left margin (page numbers left edge); the page edge is x = 1240',
            'right': 1140, 'title': 1055, 'left': 100,
        },
    }
    (HERE / 'rows.json').write_text(json.dumps(meta, indent=1))

    # before / after, scaled to the shown size
    for name, out in (('before-slide', 'before'), ('deck-uni-01-title', 'after')):
        im = Image.open(SAMPLES / f'{name}.png').convert('RGB').resize((1000, 562), Image.LANCZOS)
        im.save(HERE / f'{out}.jpg', quality=94, subsampling=0)

    # paper grain tile (256 px, neutral grey around 128, multiplied lightly)
    rng = np.random.default_rng(7)
    g = rng.normal(0, 1, (256, 256))
    g = ndimage.gaussian_filter(g, 0.7, mode='wrap')
    g = (g - g.mean()) / g.std()
    tile = np.clip(128 + g * 22, 0, 255).astype(np.uint8)
    Image.fromarray(tile, 'L').save(HERE / 'grain.png', optimize=True)
    print('rows', len(rows), [list(r['parts'].keys()) for r in rows][:2])


if __name__ == '__main__':
    main()
