#!/usr/bin/env python3
"""Plate for the STAKK «شغل جديد» story (03-templates story-new-work, 03-templates/data/story-new-work-02.json).

  python3 08-instagram/src/stakk_story_plate.py <clean-still.png> <out.png>

Input: STAKK's own clean frame at 9.40 s (`05-concept-ads/02-burger-stakk/src/index.html?clean=1`, rendered by build.sh).
Why a plate at all: in every STAKK hero frame the burger spans the full frame width (bun at x ≈ 11–1045 of 1080), and the
story template fills an 888 px slot by width, so the bun would touch the slot edge (and `still-hero.png`, at 11.60 s, is
pushed in further: bottom bun and right edge cut off). Here the frame is kept 1:1, pixel for pixel, and only the empty red
seamless is continued sideways: 110 px on the left and 86 px on the right, so the burger sits centred with a margin.

The extension is each row's own edge colour carried outward (the seamless changes by < 0.1 level per px near the
edges, so no gradient needs continuing) and softened with distance (see `extend`), plus fine grain matched to the frame's (measured σ ≈ 0.8). Nothing inside the
original 1080 columns changes. Deterministic (fixed seed).
"""
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

EL, ER = 110, 86          # px added left / right; burger centre x ≈ 528 → centred on the new canvas (528 + 110 = 1276 / 2)


def extend(a: np.ndarray, side: str, n: int) -> np.ndarray:
    """a: H×W×3 float. Returns the H×n×3 continuation of the left or right edge. At the seam it is each row's own edge
    colour (mean of the outer 4 columns, lightly smoothed down the rows so the grain doesn't streak); moving outward it
    relaxes to a heavily smoothed version (σ 40 rows), so the floor shadow that touches the right edge fades out softly
    instead of running on as a hard horizontal band. The bun never reaches those columns (it starts at x ≈ 11 and ends
    at x ≈ 1045), so only seamless red and floor shadow are continued."""
    edge = (a[:, :4] if side == 'L' else a[:, -4:]).mean(1)
    near = ndimage.gaussian_filter1d(edge, 3, axis=0)
    far = ndimage.gaussian_filter1d(edge, 40, axis=0, mode='nearest')
    w = 1 - np.exp(-np.arange(1, n + 1, dtype=np.float64) / 30.0)               # 0 at the seam → ≈1 by 90 px
    ext = near[:, None, :] * (1 - w)[None, :, None] + far[:, None, :] * w[None, :, None]
    return ext if side == 'R' else ext[:, ::-1]


def main():
    src, out = sys.argv[1], sys.argv[2]
    a = np.asarray(Image.open(src).convert('RGB')).astype(np.float64)
    H, W, _ = a.shape
    assert (W, H) == (1080, 1920), (W, H)
    L, R = extend(a, 'L', EL), extend(a, 'R', ER)
    rng = np.random.default_rng(20261106)
    for ext in (L, R):                                                             # grain like the frame's
        g = ndimage.gaussian_filter(rng.normal(0, 1, ext.shape[:2]), 0.6)
        ext += (g / g.std() * 0.8)[..., None]
    canvas = np.concatenate([L, a, R], axis=1)
    Image.fromarray(np.clip(canvas + 0.5, 0, 255).astype(np.uint8)).save(out, optimize=True)
    print(f'{out}: {canvas.shape[1]}×{canvas.shape[0]} (frame kept 1:1 at x {EL}–{EL + W - 1})')


if __name__ == '__main__':
    main()
