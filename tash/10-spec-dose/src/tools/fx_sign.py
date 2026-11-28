"""DOSE: replace the AI wall sign in d5b_terrace with the faithful recreation of dose's mark (the keyed logo plate,
not their own file; CD review: the clip's sign is spelled right but
REDRAWN: separate letters and a bold condensed specialty/cafe, where the real sign has the merged ultra-condensed ovals
and a wide geometric specialty/cafe; a match cut to the logo end card would put the two side by side).

Method (all in conformed 1080x1920 px; the camera move is a smooth crane: translate + scale, the wall is planar):
  1. track   the AI sign frame to frame against the sharpest frame (REF = source frame 117, 4.875 s): uniform scale +
             translation fitted on an orange-ness map (Nelder-Mead, extrapolated start), then a cubic fit over time.
  2. defocus per frame: the Gaussian sigma that best turns the warped REF sign region into this frame (RGB least
             squares, 0.05 px steps around the grid minimum), smoothed; the clip racks focus onto the sign at ~3.6-4.0 s.
  3. plate   a clean wall under the AI sign (+ its drop shadow) in REF: clone-filled from the leaf-dappled plaster
             above / beside it (first valid of a few offsets), a soft feathered seam; saved as assets/sign_plate.png.
  4. mark    the keyed logo (assets/logo_a.png: the plate's own pixels, never redrawn) placed on the wall with a
             similarity (rotation -1.07 deg, fitted on the dose block, then sized so it covers the AI sign), with a
             2-3 px darker return edge (the letters stand off the wall), a soft offset drop shadow measured off the AI
             sign (+19, +10 px, 21 % darker), the wall's own leaf-shadow pattern multiplied in, and the frame's defocus.
Run: python3 src/tools/fx_sign.py   (writes assets/sign.json, sign_plate.png, sign_mask.png; prints the track fit)
Used by tools/prep.py through apply(frame_index, rgb).
"""
import os, json, sys
import numpy as np, cv2
from PIL import Image
from scipy import ndimage
from scipy.optimize import minimize
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import decode, ASSETS

CLIP, REF, K0, K1 = 'd5b_terrace', 117, 50, 120
FACE = np.array([255, 108, 28], np.float32)        # sunlit brand orange on the wall (AI face measured 254,96,0: clipped)
RETURN = np.array([168, 58, 14], np.float32)       # the letters' side return, in the sign's own shade
SHADOW_OFF, SHADOW_K, SHADOW_BLUR = (19.0, 10.0), 0.30, 5.0
MARK = {'s': 0.37, 'theta_deg': -1.07, 'dx': -14.0, 'dy': 4.0}   # placement on the REF frame (see cover search)


def orng(im):
    f = im.astype(np.float32); R, G, B = f[..., 0] + 1, f[..., 1], f[..., 2]
    S = (R - B) / R; q = G / R
    return np.clip((S - 0.25) / 0.6, 0, 1) * np.clip((0.85 - q) / 0.4, 0, 1)


def ai_mask(im, loose=False):
    """the AI sign's letters (+ the dark returns when loose) in a frame aligned with REF"""
    f = im.astype(np.float32); R, G, B = f[..., 0] + 1, f[..., 1], f[..., 2]
    if loose: o = np.clip(((R - B) / R - 0.3) / 0.3, 0, 1) * np.clip((0.8 - G / R) / 0.25, 0, 1); m = (o > 0.12) & (R > 125)   # not the brown arch
    else: o = np.clip(((R - B) / R - 0.5) / 0.25, 0, 1) * np.clip((0.66 - G / R) / 0.18, 0, 1); m = o > 0.5
    box = np.zeros(m.shape, bool); box[410:775, 270:730] = True
    m &= box
    lab, n = ndimage.label(m); sz = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
    return np.isin(lab, [i + 1 for i, s in enumerate(sz) if s > 30])


def sim(s, tx, ty, c):
    """REF px -> frame px: uniform scale s about c, then translate (tx, ty)"""
    return np.array([[s, 0, c[0] * (1 - s) + tx], [0, s, c[1] * (1 - s) + ty]], np.float64)


def mark_matrix(la_shape):
    h, w = la_shape; th = np.radians(MARK['theta_deg']); s = MARK['s']
    A = np.array([[s * np.cos(th), -s * np.sin(th)], [s * np.sin(th), s * np.cos(th)]])
    return A, np.array([w / 2, h / 2])


def analyse():
    fr = decode(CLIP, K0, K1)
    get = lambda k: fr[k - K0]
    signm = ai_mask(get(REF))
    ys, xs = np.where(signm); c = np.array([(xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2])
    region = ndimage.binary_dilation(signm, iterations=10)
    sc = 0.5; small = lambda a: cv2.resize(a, None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA)
    oref_s = small((orng(get(REF)) * region).astype(np.float32)); reg_s = small(region.astype(np.float32))
    def As(p): A = sim(p[0], p[1], p[2], c).astype(np.float32); A[:, 2] *= sc; return A
    raw, hist = {}, []
    for k in range(K1, K0 - 1, -1):                          # backwards from the sharp end, extrapolating the start
        o_s = cv2.GaussianBlur(small(orng(get(k)).astype(np.float32)), (0, 0), 2.0)
        p0 = list(2 * np.array(hist[-1]) - np.array(hist[-2])) if len(hist) >= 2 else (hist[-1] if hist else [1.0, 0, 0])
        def f(p):
            if not 0.5 < p[0] < 1.5: return 1e9
            wr = cv2.warpAffine(reg_s, As(p), o_s.shape[::-1]); wv = cv2.GaussianBlur(cv2.warpAffine(oref_s, As(p), o_s.shape[::-1]), (0, 0), 2.0)
            return float((((wv - o_s) ** 2) * wr).sum())
        r = minimize(f, p0, method='Nelder-Mead', options={'xatol': 1e-4, 'fatol': 1e-5, 'maxiter': 2000,
                     'initial_simplex': np.array(p0) + np.array([[0, 0, 0], [0.01, 0, 0], [0, 3, 0], [0, 0, 3]])})
        hist.append(list(r.x)); raw[k] = list(map(float, r.x))
    ks = np.array(sorted(raw)); P = np.array([raw[k] for k in ks])
    fit = [np.polyfit(ks, P[:, j], 3) for j in range(3)]
    sm = np.stack([np.polyval(fit[j], ks) for j in range(3)], 1)
    resid = np.abs(sm - P); print(f'track: {len(ks)} frames, cubic-fit residual max  s {resid[:, 0].max():.4f}  x {resid[:, 1].max():.2f}px  y {resid[:, 2].max():.2f}px')
    # defocus
    ref_rgb = get(REF).astype(np.float32); reg2 = ndimage.binary_dilation(signm, iterations=6).astype(np.float32)
    sig = {}
    for i, k in enumerate(ks):
        A = sim(*sm[i], c).astype(np.float32)
        wr = cv2.warpAffine(reg2, A, (1080, 1920)); yy, xx = np.where(wr > 0.5)
        y0, y1, x0, x1 = max(0, yy.min() - 20), yy.max() + 20, max(0, xx.min() - 20), xx.max() + 20
        wref = cv2.warpAffine(ref_rgb, A, (1080, 1920))[y0:y1, x0:x1]; cur = get(k)[y0:y1, x0:x1].astype(np.float32); m = wr[y0:y1, x0:x1, None]
        err = lambda sg: float((((cv2.GaussianBlur(wref, (0, 0), sg) if sg > 0.05 else wref) - cur) ** 2 * m).sum() / m.sum())
        g = np.arange(0, 4.01, 0.25); e = [err(x) for x in g]; j = int(np.argmin(e))
        fine = np.arange(max(0, g[j] - 0.25), g[j] + 0.2501, 0.05); ef = [err(x) for x in fine]
        sig[int(k)] = float(fine[int(np.argmin(ef))])
    sv = np.array([sig[int(k)] for k in ks]); sv = ndimage.median_filter(sv, 5, mode='nearest'); sv = ndimage.uniform_filter1d(sv, 5, mode='nearest')
    # clean plate under the AI sign (REF): clone the leaf-dappled plaster from nearby wall (first valid offset per
    # pixel, nearest first), a global gain so the fill carries the same mean light as the wall around it, 3 px feather
    im = get(REF).copy()
    lumi = im.mean(2)
    fi = im.astype(np.float32); gr = fi[..., 1] / (fi[..., 0] + 1)
    tan = (gr > 0.6) & (gr < 0.78) & (lumi < 175)                     # the arch's tan reveal (plaster G/R is 0.82-0.86)
    big = lambda b, n: (lambda lab, k: np.isin(lab, [i + 1 for i, a in enumerate(ndimage.sum(np.ones_like(lab), lab, range(1, k + 1))) if a > n]))(*ndimage.label(b))
    # only the large tan / dark bodies (the arch reveal, the soffit): the letters' own soft edges are tan-ish too
    arch = ndimage.binary_dilation(big(((lumi < 110) & (orng(im) < 0.2)) | ndimage.binary_opening(tan, iterations=2), 6000), iterations=5)
    # the AI letters' faces (strict colour test: never the brown arch), swept toward the lower right to take their
    # returns (the letters stand off the wall; the sun is upper left), plus their offset drop shadow
    face = ai_mask(im)
    m = face.copy()
    for d in range(1, 9): m[d:, d:] |= face[:-d, :-d]
    m = ndimage.binary_dilation(m, iterations=4)
    shm = np.zeros_like(m); shm[10:, 19:] = m[:-10, :-19]; shm = ndimage.binary_dilation(shm, iterations=6)
    mask = (m | shm) & ~arch
    valid = ~ndimage.binary_dilation(mask, iterations=4) & ~arch & (orng(im) < 0.15)
    out = im.copy(); todo = mask.copy()
    yy, xx = np.mgrid[0:1920, 0:1080]
    offs = sorted({(dx, dy) for dx in range(-520, 521, 40) for dy in range(-420, 421, 40) if abs(dx) + abs(dy) >= 300},
                  key=lambda d: (abs(d[1]) * 0.8 + abs(d[0]), d))
    for dx, dy in offs:
        if not todo.any(): break
        sy, sx = yy + dy, xx + dx
        ok = todo & (sy >= 0) & (sy < 1920) & (sx >= 0) & (sx < 1080)
        ok[ok] = valid[sy[ok], sx[ok]]
        out[ok] = im[sy[ok], sx[ok]]; todo &= ~ok
    if todo.any(): out = cv2.inpaint(out, todo.astype(np.uint8) * 255, 5, cv2.INPAINT_TELEA)
    # gradient-domain blend: keep the clones' plaster/leaf texture, take the light level from the wall at the seam
    pm8 = (ndimage.binary_dilation(mask, iterations=3) * 255).astype(np.uint8)
    ys, xs = np.where(pm8 > 0); y0, y1, x0, x1 = ys.min() - 8, ys.max() + 9, xs.min() - 8, xs.max() + 9
    src = cv2.cvtColor(np.ascontiguousarray(out[y0:y1, x0:x1]), cv2.COLOR_RGB2BGR)
    dst = cv2.cvtColor(np.ascontiguousarray(im), cv2.COLOR_RGB2BGR)
    bl = cv2.seamlessClone(src, dst, np.ascontiguousarray(pm8[y0:y1, x0:x1]), ((x0 + x1) // 2, (y0 + y1) // 2), cv2.NORMAL_CLONE)
    plate = cv2.cvtColor(bl, cv2.COLOR_BGR2RGB).astype(np.float32)
    print('plate: unfilled px', int(todo.sum()))
    ys, xs = np.where(ndimage.binary_dilation(mask, iterations=8))
    box = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
    Image.fromarray(plate[box[1]:box[3], box[0]:box[2]].astype(np.uint8)).save(os.path.join(ASSETS, 'sign_plate.png'))
    Image.fromarray((ndimage.binary_dilation(mask, iterations=2)[box[1]:box[3], box[0]:box[2]] * 255).astype(np.uint8)).save(os.path.join(ASSETS, 'sign_mask.png'))
    sunlit = float(np.percentile(plate[box[1]:box[3], box[0]:box[2]].mean(2), 97))
    meta = {'clip': CLIP, 'ref': REF, 'c': c.tolist(), 'box': box, 'sunlit': sunlit, 'mark': MARK,
            'frames': {int(k): {'s': float(sm[i, 0]), 'tx': float(sm[i, 1]), 'ty': float(sm[i, 2]), 'sigma': float(sv[i]),
                                'raw': [round(v, 3) for v in raw[int(k)]], 'sigma_raw': sig[int(k)]} for i, k in enumerate(ks)}}
    json.dump(meta, open(os.path.join(ASSETS, 'sign.json'), 'w'), indent=0)
    _C.clear(); C = _load(); s0 = MARK['s']
    for k in meta['frames']:
        A, _, _ = ref_to_frame(int(k))
        M = (np.vstack([A, [0, 0, 1]]) @ np.vstack([C['M0'], [0, 0, 1]]) @ np.diag([s0 * C['mark'].shape[1] / C['la_w'], s0 * C['mark'].shape[0] / C['la_h'], 1]))[:2]
        meta['frames'][k]['logo_affine'] = [round(float(v), 5) for v in M.ravel()]
    json.dump(meta, open(os.path.join(ASSETS, 'sign.json'), 'w'), indent=0)
    print('sigma by frame:', {int(k): round(float(v), 2) for k, v in zip(ks[::4], sv[::4])})
    return meta


_C = {}
def _load():
    if _C: return _C
    _C['meta'] = meta = json.load(open(os.path.join(ASSETS, 'sign.json')))
    _C['plate'] = np.asarray(Image.open(os.path.join(ASSETS, 'sign_plate.png')), np.float32)
    _C['pmask'] = np.asarray(Image.open(os.path.join(ASSETS, 'sign_mask.png')), np.float32) / 255
    la = np.asarray(Image.open(os.path.join(ASSETS, 'logo_a.png')), np.float32) / 255
    A, ctr = mark_matrix(la.shape)
    # pre-scale the mark to REF size with area filtering (no aliasing), then every frame only warps by ~0.86-1.01
    s = MARK['s']; pre = cv2.resize(la, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    _C['mark'] = pre; _C['la_w'], _C['la_h'] = la.shape[1] * s, la.shape[0] * s
    c = np.array(meta['c']) + np.array([MARK['dx'], MARK['dy']])
    th = np.radians(MARK['theta_deg'])
    R = np.array([[np.cos(th), -np.sin(th)], [np.sin(th), np.cos(th)]])
    pc = np.array([pre.shape[1] / 2, pre.shape[0] / 2])
    _C['M0'] = np.hstack([R, (c - R @ pc)[:, None]])          # pre-scaled mark px -> REF px
    r = np.random.default_rng(5); n = cv2.GaussianBlur(r.standard_normal(pre.shape).astype(np.float32), (0, 0), 1.2)
    _C['tex'] = n / (n.std() + 1e-6)                           # fixed paint texture, moves with the mark
    return _C


def ref_to_frame(k):
    meta = _load()['meta']; fm = meta['frames'][str(k)]
    return sim(fm['s'], fm['tx'], fm['ty'], meta['c']), fm['sigma'], fm['s']


def mark_quad(k):
    """the mark crop's corners (logo_a px space, scaled by MARK.s) in frame k: for the page's match cut"""
    C = _load(); A, _, _ = ref_to_frame(k)
    M = np.vstack([A, [0, 0, 1]]) @ np.vstack([C['M0'], [0, 0, 1]])
    return M[:2].tolist()


def apply(k, rgb, mark=True):
    """mark=False: the clean wall only (the AI sign and its shadow removed, no mark): v3 uses it under the end-card
    dissolve, so only the flat end-card mark carries the logo once it leaves the wall (v2 left a ghost sign behind)"""
    C = _load(); meta = C['meta']
    if str(k) not in meta['frames']: return rgb
    A, sg, s = ref_to_frame(k)
    out = rgb.astype(np.float32)
    bx0, by0, bx1, by1 = meta['box']
    # work in a padded window around the sign in this frame
    corners = np.array([[bx0, by0, 1], [bx1, by0, 1], [bx1, by1, 1], [bx0, by1, 1]], np.float64) @ A.T
    X0, Y0 = int(max(0, corners[:, 0].min() - 40)), int(max(0, corners[:, 1].min() - 40))
    X1, Y1 = int(min(1080, corners[:, 0].max() + 40)), int(min(1920, corners[:, 1].max() + 40))
    Wd, Hd = X1 - X0, Y1 - Y0
    T = A.copy(); T[:, 2] += A[:, :2] @ np.array([bx0, by0]) - np.array([X0, Y0])          # plate crop px -> window px
    plate = cv2.warpAffine(C['plate'], T.astype(np.float32), (Wd, Hd), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    pm = cv2.warpAffine(C['pmask'], T.astype(np.float32), (Wd, Hd), flags=cv2.INTER_LINEAR)
    if sg > 0.05: plate = cv2.GaussianBlur(plate, (0, 0), sg); pm = cv2.GaussianBlur(pm, (0, 0), max(1.2, sg))
    else: pm = cv2.GaussianBlur(pm, (0, 0), 1.2)
    win = out[Y0:Y1, X0:X1]
    wall = win * (1 - pm[..., None]) + plate * pm[..., None]
    if not mark:
        out[Y0:Y1, X0:X1] = wall
        return np.clip(out + 0.5, 0, 255).astype(np.uint8)
    # the mark, its return and its shadow (window px)
    M = np.vstack([A, [0, 0, 1]]) @ np.vstack([C['M0'], [0, 0, 1]]); M = M[:2].copy(); M[:, 2] -= [X0, Y0]
    warp = lambda img, d=(0, 0): cv2.warpAffine(img, (M + np.array([[0, 0, d[0]], [0, 0, d[1]]])).astype(np.float32), (Wd, Hd), flags=cv2.INTER_LINEAR)
    face = warp(C['mark']); tex = warp(C['tex'])
    ret = np.maximum(warp(C['mark'], (2.2 * s, 2.8 * s)), warp(C['mark'], (1.1 * s, 1.4 * s)))
    shad = cv2.GaussianBlur(warp(C['mark'], (SHADOW_OFF[0] * s, SHADOW_OFF[1] * s)), (0, 0), SHADOW_BLUR * s)
    # leaf shadows: the wall's own light pattern, as a multiplier (sunlit plaster = 1)
    lum = cv2.GaussianBlur(plate.mean(2), (0, 0), 4.0)                 # leaf-shadow shapes only, no plaster grain
    shade = np.clip(lum / meta['sunlit'], 0.5, 1.0)[..., None]
    # v2 (CD: the faces read evenly lit while the leaf shadows stop at the letter edges): the faces stand proud of the
    # wall, so they catch the same leaf shadows at full strength, shifted toward the light by the sign's depth (the
    # drop shadow's offset, reversed)
    sx, sy = SHADOW_OFF[0] * s, SHADOW_OFF[1] * s
    lum_f = cv2.warpAffine(lum, np.float32([[1, 0, sx], [0, 1, sy]]), (Wd, Hd), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
    shade_f = np.clip(lum_f / meta['sunlit'], 0.45, 1.0)[..., None]
    col_face = FACE * (0.1 + 0.9 * shade_f) * (1 + 0.012 * tex[..., None])
    col_ret = RETURN * (0.35 + 0.65 * shade)
    if sg > 0.05:
        face = cv2.GaussianBlur(face, (0, 0), sg); ret = cv2.GaussianBlur(ret, (0, 0), sg); shad = cv2.GaussianBlur(shad, (0, 0), sg)
        col_face = cv2.GaussianBlur(col_face * 1, (0, 0), sg * 0.5)
    lit = wall * (1 - SHADOW_K * shad[..., None])
    lit = lit * (1 - ret[..., None]) + col_ret * ret[..., None]
    lit = lit * (1 - face[..., None]) + col_face * face[..., None]
    out[Y0:Y1, X0:X1] = lit
    return np.clip(out + 0.5, 0, 255).astype(np.uint8)


if __name__ == '__main__':
    analyse()
