"""DOSE: re-comp the print on the S2 hero cup (d2d_carafe) with a faithful recreation of dose's lockup (the keyed
logo plate: frames/logo_plate.png, GPT Image 2.6 job 836ec4b1, matched to ref06 in proportion; not their own file).

v1 re-comped only the small «specialty» line (the stream, cubes and foam were drawn IN FRONT of it). The CD review of
v1 then found the big «dose» off-model too: the AI drew its stencil counters as 1-3 px hairlines (the real mark has
wide slits, as on the S3 cup and the end card), a much taller d ascender and squatter bowls. v2 replaces the whole
printed lockup (specialty / dose / cafe) with the keyed logo plate's own pixels (assets/logo_a.png, never redrawn).

Method (conformed 1080x1920 px, d2d upscaled x1.5):
  track   unchanged from v1: the rigid «dose» letters give a per-frame similarity (scale + translation) against REF = f110
          (analyse(), assets/specialty.json).
  place   the plate lockup wraps the cup: logo px -> REF px through a cylinder (radius R) with a uniform scale, a 0.3 deg
          tilt and the ellipse sag of the cup's horizontal lines (k), fitted by least squares on 14 landmarks read off a
          pixel grid of REF (d bowl, e edge, the four slits, tops and bottoms of the bowls), then scaled 2.5 % about the
          lockup centre so the e stays clear of the thumb (assets/cup_lockup.json).
  remove  the AI print: REF's own print mask (assets/cup_ai_mask.png) carried into the frame, plus this frame's own
          orange ink near it, dilated 4 px, filled from the coffee / foam / stream around it (Telea).
  print   the plate alpha (remapped through the inverse similarity and cylinder) laid on as opaque ink in the frame's own
          ink colour, shaded by the AI print's smooth light falloff; the thumb (in front of the cup) is kept in front.
Run: python3 src/tools/fx_specialty.py  (writes assets/specialty.json, cup_lockup.json, cup_ai_mask.png). Used by
tools/prep.py.
"""
import os, json, sys
import numpy as np, cv2
from PIL import Image
from scipy import ndimage
from scipy.optimize import minimize
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import decode, ASSETS

CLIP, REF, K0, K1 = 'd2d_carafe', 110, 34, 112
FIX = (36, 99)          # frames that get the re-comp (the edit uses 37-95; a guard frame each side for the blend)
CUR_THR = 0.3           # v3 (was 0.5): this frame's own AI ink, down into the shadow by the thumb


def orng(im):
    f = im.astype(np.float32); R, G, B = f[..., 0] + 1, f[..., 1], f[..., 2]
    return np.clip(((R - B) / R - 0.45) / 0.3, 0, 1) * np.clip((0.62 - G / R) / 0.2, 0, 1) * np.clip((R - 120) / 60, 0, 1)


def inkish(im):
    """v3: the AI print's ink, lit OR in shadow: orange-ness > CUR_THR, or a deep red-orange (R > 78, G/R < 0.36,
    B/R < 0.15; the e's right half by the thumb measures ~(90-130, 14-30, 0-6), the coffee behind it R < 60)"""
    f = im.astype(np.float32) + 0.5; R, G, B = f[..., 0], f[..., 1], f[..., 2]
    return (orng(im) > CUR_THR) | ((R > 78) & (G < 0.36 * R) & (B < 0.15 * R))


def comps(o, box, thr=0.5):
    m = o > thr; b = np.zeros_like(m); b[box[1]:box[3], box[0]:box[2]] = True; m &= b
    lab, n = ndimage.label(m); return lab, ndimage.find_objects(lab), ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))


def analyse():
    fr = decode(CLIP, K0, K1); get = lambda k: fr[k - K0]
    ref = get(REF); o = orng(ref)
    lab, objs, sz = comps(o, (300, 1050, 900, 1550))
    big = [int(np.argmax(sz))]                                          # the dose letters (they touch: one component)
    dose = np.isin(lab, [i + 1 for i in big])
    ys, xs = np.where(dose); dbox = [xs.min(), ys.min(), xs.max(), ys.max()]
    c = np.array([(dbox[0] + dbox[2]) / 2, (dbox[1] + dbox[3]) / 2])
    # specialty: the small orange strokes beside the d ascender, above the o/s/e (not part of the dose component)
    spec = (o > 0.12) & ~ndimage.binary_dilation(dose, iterations=2)
    sb = np.zeros_like(spec); sb[dbox[1] - 6:dbox[1] + 66, dbox[0] + 80:dbox[2] + 10] = True
    spec &= sb
    lab2, n2 = ndimage.label(spec); sz2 = ndimage.sum(np.ones_like(lab2), lab2, range(1, n2 + 1)); ob2 = ndimage.find_objects(lab2)
    # the word = the two biggest pieces («spec» and «alty») and every piece inside their span (the i, its dot);
    # foam edges above and bubbles to the right are dropped
    two = np.argsort(sz2)[-2:]
    X0 = min(ob2[i][1].start for i in two) - 4; X1 = max(ob2[i][1].stop for i in two) + 4
    Y0 = min(ob2[i][0].start for i in two) - 10; Y1 = max(ob2[i][0].stop for i in two) + 4
    keep = [i + 1 for i in range(n2) if sz2[i] > 25 and ob2[i][1].start >= X0 and ob2[i][1].stop <= X1 and ob2[i][0].start >= Y0 and ob2[i][0].stop <= Y1]
    spec = np.isin(lab2, keep)
    ys, xs = np.where(spec); sbox = [int(xs.min()) - 6, int(ys.min()) - 6, int(xs.max()) + 7, int(ys.max()) + 7]
    # alpha: projection between the coffee behind (local median of non-ink) and the ink colour
    crop = ref[sbox[1]:sbox[3], sbox[0]:sbox[2]].astype(np.float32)
    oc = orng(crop.astype(np.uint8))
    ink = np.median(crop[oc > 0.8], 0); bg = np.median(crop[oc < 0.05], 0)
    v = ink - bg; a = np.clip(((crop - bg) @ v) / (v @ v), 0, 1)
    a = np.clip((a - 0.12) / 0.76, 0, 1); a[oc < 0.03] = 0
    a *= cv2.GaussianBlur(ndimage.binary_dilation(spec, iterations=2)[sbox[1]:sbox[3], sbox[0]:sbox[2]].astype(np.float32), (0, 0), 0.7)
    a[a < 0.03] = 0                                                       # only the letters: no foam edge, no bubbles
    Image.fromarray((a * 255).astype(np.uint8)).save(os.path.join(ASSETS, 'specialty_a.png'))
    # track the dose letters
    region = ndimage.binary_dilation(dose, iterations=8).astype(np.float32)
    oref = cv2.GaussianBlur(orng(ref) * region, (0, 0), 1.5)
    sc = 0.5; small = lambda q: cv2.resize(q, None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA)
    oref_s, reg_s = small(oref), small(region)
    def As(p): return np.array([[p[0], 0, (c[0] * (1 - p[0]) + p[1]) * sc], [0, p[0], (c[1] * (1 - p[0]) + p[2]) * sc]], np.float32)
    raw, hist = {}, []
    for k in range(REF, K0 - 1, -1):
        o_s = small(cv2.GaussianBlur(orng(get(k)), (0, 0), 1.5))
        p0 = list(2 * np.array(hist[-1]) - np.array(hist[-2])) if len(hist) >= 2 else (hist[-1] if hist else [1.0, 0, 0])
        def f(p):
            if not 0.6 < p[0] < 1.4: return 1e9
            wr = cv2.warpAffine(reg_s, As(p), o_s.shape[::-1]); wv = cv2.warpAffine(oref_s, As(p), o_s.shape[::-1])
            return float((((wv - o_s) ** 2) * wr).sum())
        r = minimize(f, p0, method='Nelder-Mead', options={'xatol': 1e-4, 'fatol': 1e-5, 'maxiter': 2000,
                     'initial_simplex': np.array(p0) + np.array([[0, 0, 0], [0.01, 0, 0], [0, 3, 0], [0, 0, 3]])})
        hist.append(list(r.x)); raw[k] = [float(x) for x in r.x] + [float(r.fun)]
    ks = np.array(sorted(k for k in raw if FIX[0] - 2 <= k <= REF)); P = np.array([raw[k][:3] for k in ks])
    fit = [np.polyfit(ks, P[:, j], 2) for j in range(3)]
    sm = np.stack([np.polyval(fit[j], ks) for j in range(3)], 1)
    res = np.abs(sm - P)
    print(f'dose track {len(ks)} frames: quadratic-fit residual max s {res[:, 0].max():.4f}  x {res[:, 1].max():.2f}  y {res[:, 2].max():.2f} px')
    # per-frame ink colour = the frame's own dose letters (eroded, median)
    cols = {}
    for k in ks:
        A = np.array([[sm[ks == k][0][0], 0, c[0] * (1 - sm[ks == k][0][0]) + sm[ks == k][0][1]], [0, sm[ks == k][0][0], c[1] * (1 - sm[ks == k][0][0]) + sm[ks == k][0][2]]], np.float32)
        dm = cv2.warpAffine(ndimage.binary_erosion(dose, iterations=6).astype(np.float32), A, (1080, 1920)) > 0.9
        im = get(int(k)).astype(np.float32); oo = orng(get(int(k)))
        cols[int(k)] = np.median(im[dm & (oo > 0.7)], 0).tolist()
    # refine each frame on the specialty line itself: the unbroken letters are rigid, so the offset (dx, dy) that best
    # lands the clean alpha on this frame's own visible ink (orange-ness, positive part only) is the true placement
    off = {}
    for i, k in enumerate(ks):
        s_, tx_, ty_ = sm[i]; oo = orng(get(int(k)))
        best = None
        for dy in np.arange(-8, 8.01, 0.5):
            for dx in np.arange(-6, 6.01, 0.5):
                A = np.array([[s_, 0, c[0] * (1 - s_) + tx_ + s_ * sbox[0] + dx], [0, s_, c[1] * (1 - s_) + ty_ + s_ * sbox[1] + dy]], np.float32)
                al = cv2.warpAffine(a.astype(np.float32), A, (1080, 1920))
                y0, y1, x0, x1 = sbox[1] - 60, sbox[3] + 60, sbox[0] - 60, sbox[2] + 60
                sc_ = float((al[y0:y1, x0:x1] * (2 * oo[y0:y1, x0:x1] - 1)).sum())
                if best is None or sc_ > best[0]: best = (sc_, dx, dy)
        off[int(k)] = best[1:]
    O = np.array([off[int(k)] for k in ks], np.float32)
    O = ndimage.median_filter(O, size=(3, 1), mode='nearest')
    sm[:, 1] += O[:, 0]; sm[:, 2] += O[:, 1]
    print('per-frame refinement dx range', O[:, 0].min(), O[:, 0].max(), ' dy range', O[:, 1].min(), O[:, 1].max())
    meta = {'clip': CLIP, 'ref': REF, 'c': c.tolist(), 'dose_box': [int(x) for x in dbox], 'spec_box': sbox, 'fix': FIX,
            'ink_ref': ink.tolist(), 'frames': {int(k): {'s': float(sm[i, 0]), 'tx': float(sm[i, 1]), 'ty': float(sm[i, 2]),
                                                     'ink': cols[int(k)], 'raw': [round(x, 3) for x in raw[int(k)]]} for i, k in enumerate(ks)}}
    json.dump(meta, open(os.path.join(ASSETS, 'specialty.json'), 'w'), indent=0)
    print('specialty box', sbox, 'ink', np.round(ink), 'bg', np.round(bg))
    return meta


HOOK = (0, 35)          # v3: the hook plate (d2d f0-f35, grey and 8x defocused) gets the plate lockup too


def track_hook():
    """v3: extend the rigid «dose» track to the hook plate (f0-f35), which v2 left with the AI's off-model print
    (rounded counters, read as «doee» through the defocus). Same objective as analyse() (the REF letters' orange-ness
    under a similarity), chained from f36 down to f0, smoothed by a cubic in time (the hand moves the cup a little);
    the frames f36+ are left exactly as they are."""
    meta = json.load(open(os.path.join(ASSETS, 'specialty.json')))
    fr = decode(CLIP, 0, max(REF, 40)); get = lambda k: fr[k]
    ref = get(REF); o = orng(ref)
    lab, objs, sz = comps(o, (300, 1050, 900, 1550))
    dose = lab == int(np.argmax(sz)) + 1
    c = np.array(meta['c'])
    region = ndimage.binary_dilation(dose, iterations=8).astype(np.float32)
    oref = cv2.GaussianBlur(orng(ref) * region, (0, 0), 1.5)
    sc = 0.5; small = lambda q: cv2.resize(q, None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA)
    oref_s, reg_s = small(oref), small(region)
    def As(p): return np.array([[p[0], 0, (c[0] * (1 - p[0]) + p[1]) * sc], [0, p[0], (c[1] * (1 - p[0]) + p[2]) * sc]], np.float32)
    hist = [meta['frames'][str(k)]['raw'][:3] for k in (38, 37, 36)]
    raw = {}
    for k in range(HOOK[1], HOOK[0] - 1, -1):
        o_s = small(cv2.GaussianBlur(orng(get(k)), (0, 0), 1.5))
        p0 = list(2 * np.array(hist[-1]) - np.array(hist[-2]))
        def f(p):
            if not 0.6 < p[0] < 1.4: return 1e9
            wr = cv2.warpAffine(reg_s, As(p), o_s.shape[::-1]); wv = cv2.warpAffine(oref_s, As(p), o_s.shape[::-1])
            return float((((wv - o_s) ** 2) * wr).sum())
        r = minimize(f, p0, method='Nelder-Mead', options={'xatol': 1e-4, 'fatol': 1e-5, 'maxiter': 2000,
                     'initial_simplex': np.array(p0) + np.array([[0, 0, 0], [0.01, 0, 0], [0, 3, 0], [0, 0, 3]])})
        hist.append(list(r.x)); raw[k] = [float(x) for x in r.x] + [float(r.fun)]
    ks = np.arange(HOOK[0], HOOK[1] + 1); P = np.array([raw[k][:3] for k in ks])
    sm = np.stack([np.polyval(np.polyfit(ks, P[:, j], 3), ks) for j in range(3)], 1)
    res = np.abs(sm - P)
    print(f'hook track f{HOOK[0]}-f{HOOK[1]}: cubic-fit residual max s {res[:, 0].max():.4f}  x {res[:, 1].max():.2f}  y {res[:, 2].max():.2f} px;'
          f' at f35 {np.round(sm[-1], 3).tolist()} vs f36 {[round(meta["frames"]["36"][q], 3) for q in ("s", "tx", "ty")]}')
    for i, k in enumerate(ks):
        meta['frames'][str(int(k))] = {'s': float(sm[i, 0]), 'tx': float(sm[i, 1]), 'ty': float(sm[i, 2]), 'raw': [round(x, 3) for x in raw[int(k)]]}
    meta['fix'] = [HOOK[0], meta['fix'][1]]
    meta['frames'] = {str(k): meta['frames'][str(k)] for k in sorted(int(x) for x in meta['frames'])}
    json.dump(meta, open(os.path.join(ASSETS, 'specialty.json'), 'w'), indent=0)


LOCKUP = {'landmarks_logo': [[9, 427], [1282, 427], [144, 262], [144, 592], [496, 262], [496, 592], [1144, 262], [880, 363],
                             [496, 695], [85, 690], [1200, 695], [496, 160], [1150, 160], [1144, 385]],
          'landmarks_ref': [[438, 1325], [803, 1318], [470, 1283], [470, 1360], [564.5, 1293], [564.5, 1372], [769.5, 1288],
                            [695, 1313], [564, 1408], [480, 1398], [780, 1405], [564, 1257], [770, 1255], [769.5, 1313]],
          'uc': 645.5, 'vc': 370.0, 'shrink': 0.975}


def cyl_fwd(p, L, uc, vc):
    s, R, cx, cy, th, k = p
    X = (L[:, 0] - uc) * s; Y = (L[:, 1] - vc) * s
    c, sn = np.cos(th), np.sin(th); Xr = c * X - sn * Y; Yr = sn * X + c * Y
    return np.c_[cx + R * np.sin(Xr / R), cy + Yr + k * (1 - np.cos(Xr / R))]


def analyse_lockup():
    from scipy.optimize import least_squares
    L, Aref = np.array(LOCKUP['landmarks_logo'], float), np.array(LOCKUP['landmarks_ref'], float)
    uc, vc = LOCKUP['uc'], LOCKUP['vc']
    r = least_squares(lambda p: np.r_[(cyl_fwd(p, L, uc, vc) - Aref)[:, 0] * 2, (cyl_fwd(p, L, uc, vc) - Aref)[:, 1]],
                      [0.33, 270, 620, 1310, 0.02, -30])
    res = cyl_fwd(r.x, L, uc, vc) - Aref
    print('lockup cylinder fit: s %.4f R %.1f centre (%.1f, %.1f) tilt %.4f rad sag %.1f; rms x %.1f y %.1f px' % (
        *r.x, np.sqrt((res[:, 0] ** 2).mean()), np.sqrt((res[:, 1] ** 2).mean())))
    p = r.x.copy(); p[0] *= LOCKUP['shrink']
    ref = decode(CLIP, REF, REF)[0]
    m = orng(ref) > 0.5; box = np.zeros_like(m); box[1150:1480, 400:830] = True; m &= box
    m = ndimage.binary_closing(m, iterations=2)
    lab, n = ndimage.label(m); sz = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
    m = np.isin(lab, [i + 1 for i in range(n) if sz[i] > 20])
    Image.fromarray((m * 255).astype(np.uint8)).save(os.path.join(ASSETS, 'cup_ai_mask.png'))
    json.dump({'p': [float(x) for x in p], 'uc': uc, 'vc': vc, 'fit': [float(x) for x in r.x]}, open(os.path.join(ASSETS, 'cup_lockup.json'), 'w'), indent=1)


_C = {}
def apply(k, rgb):
    if not _C:
        _C['m'] = json.load(open(os.path.join(ASSETS, 'specialty.json')))
        _C['L'] = json.load(open(os.path.join(ASSETS, 'cup_lockup.json')))
        la = np.asarray(Image.open(os.path.join(ASSETS, 'logo_a.png')), np.float32) / 255
        # v3: the small words («specialty», «cafe») are every piece of the mark except the big «dose» body; they get
        # a lighter pre-blur and an alpha gain after the warp so their strokes print opaque (v2: σ 1.1 at a ~3.3x
        # downscale left them see-through, with the ice / the Telea fill showing through «cialty»)
        lab, n = ndimage.label(la > 0.5); sz = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
        small = (lab > 0) & (lab != int(np.argmax(sz)) + 1)
        _C['sm'] = cv2.GaussianBlur(ndimage.binary_dilation(small, iterations=8).astype(np.float32), (0, 0), 2)
        _C['la'] = cv2.GaussianBlur(la, (0, 0), 1.1) * (1 - _C['sm']) + cv2.GaussianBlur(la, (0, 0), 0.7) * _C['sm']
        _C['ai'] = (np.asarray(Image.open(os.path.join(ASSETS, 'cup_ai_mask.png'))) > 127).astype(np.uint8)
    meta, Lk = _C['m'], _C['L']
    if not (meta['fix'][0] <= k <= meta['fix'][1]) or str(k) not in meta['frames']: return rgb
    fm = meta['frames'][str(k)]; s_, c = fm['s'], meta['c']
    A = np.array([[s_, 0, c[0] * (1 - s_) + fm['tx']], [0, s_, c[1] * (1 - s_) + fm['ty']]], np.float64)   # REF -> frame
    X0, Y0, X1, Y1 = 360, 1100, 880, 1520
    im = rgb; crop = im[Y0:Y1, X0:X1].copy(); f = crop.astype(np.float32)
    # 1. where the AI print is: REF's print mask carried into this frame + this frame's own ink near it
    # v3: the carried mask is dilated 13 px (the AI print drifts against the rigid track by up to ~10 px at the e) and
    # this frame's ink is taken down to orange-ness 0.3, so the shadowed right half of the AI «e» next to the thumb and
    # its slit are lifted out too (v2 left a darker-red second «e» there, f150-f197 of the edit)
    m0 = cv2.warpAffine(_C['ai'], A.astype(np.float32), (1080, 1920), flags=cv2.INTER_NEAREST)
    cur = inkish(im)
    # this frame's ink: every ink-coloured piece within 31 px of the carried mask that is CONNECTED to it (the AI e's
    # shadowed half is one piece with its lit half; loose coffee / foam specks are dropped)
    cand = cur & cv2.dilate(m0, np.ones((31, 31), np.uint8)).astype(bool)
    lab, n = ndimage.label(cand)
    hit = np.unique(lab[(m0 > 0) & (lab > 0)])
    m = cv2.dilate(m0, np.ones((13, 13), np.uint8)) | np.isin(lab, hit[hit > 0]).astype(np.uint8)
    m = cv2.dilate(m, np.ones((9, 9), np.uint8))
    mc = m[Y0:Y1, X0:X1]
    # 2. the thumb in front of the cup: per row (right part of the lockup only), the first run of >= 12 glove/skin pixels
    mx = f.max(2); sat = (mx - f.min(2)) / (mx + 1)
    skin = (f[..., 0] > 200) & (f[..., 1] > 150) & (f[..., 2] > 140) & ((f[..., 0] - f[..., 2]) > 15) & (sat < 0.35)
    xa = int(A[0, 0] * 760 + A[0, 2]) - X0
    bnd = np.full(Y1 - Y0, np.nan)
    for yy in range(Y1 - Y0):
        run = np.where(np.convolve(skin[yy, xa:].astype(np.int32), np.ones(12, np.int32), 'valid') == 12)[0]
        if len(run): bnd[yy] = xa + run[0]
    ok = ~np.isnan(bnd); occ = np.zeros((Y1 - Y0, X1 - X0), np.float32); thumb = occ > 0.5
    if ok.sum() > 10:
        idx = np.arange(len(bnd)); b = bnd.copy(); b[~ok] = np.interp(idx[~ok], idx[ok], bnd[ok])
        b = ndimage.uniform_filter1d(ndimage.median_filter(b, 9), 5)
        occ = np.clip(np.arange(X1 - X0)[None, :] - b[:, None] + 0.5, 0, 1) * ok[:, None]
        # v3: the thumb restore never brings back orange pixels (that is the AI print in the shadow by the thumb, not
        # the glove)
        thumb = occ > 0.5
        occ = cv2.GaussianBlur((occ * ~inkish(crop)).astype(np.float32), (0, 0), 0.7)
    # 3. lift the AI print out (fill from the coffee / foam / stream around it)
    # v3: the thumb next to the print is masked too, so the fill comes from the coffee / foam only (v2 pulled the
    # glove's pink into the gap between the e and the thumb); the thumb itself goes back on top below
    near = cv2.dilate(mc, np.ones((41, 41), np.uint8)) > 0
    bg = cv2.inpaint(crop, ((mc > 0) | (thumb & near)).astype(np.uint8), 5, cv2.INPAINT_TELEA).astype(np.float32)
    # 4. the plate lockup's alpha: frame px -> REF px (inverse similarity) -> logo px (inverse cylinder)
    gx, gy = np.meshgrid(np.arange(X0, X1, dtype=np.float64), np.arange(Y0, Y1, dtype=np.float64))
    rx = (gx - A[0, 2]) / A[0, 0]; ry = (gy - A[1, 2]) / A[1, 1]
    s, R, cx, cy, th, kk = Lk['p']
    q = np.clip((rx - cx) / R, -0.999, 0.999); Xr = R * np.arcsin(q); Yr = ry - cy - kk * (1 - np.cos(Xr / R))
    ct, st = np.cos(-th), np.sin(-th); X = ct * Xr - st * Yr; Y = st * Xr + ct * Yr
    mx_, my_ = (Lk['uc'] + X / s).astype(np.float32), (Lk['vc'] + Y / s).astype(np.float32)
    al = cv2.remap(_C['la'], mx_, my_, cv2.INTER_LINEAR, borderValue=0)
    smw = cv2.remap(_C['sm'], mx_, my_, cv2.INTER_LINEAR, borderValue=0)
    al = cv2.GaussianBlur(al, (0, 0), 0.6) * (np.abs(q) < 0.995)
    al = al * (1 - smw) + np.clip(al * 1.45, 0, 1) * smw                  # v3: small-word strokes opaque
    # 5. ink: this frame's own print colour, with the AI print's smooth light falloff across the cup
    o = orng(crop); mi = (o > 0.6) & (mc > 0)
    # v3: the light falloff is a PLANE fitted to the AI print's own lit ink (v2's local sigma-20 ratio saturated at its
    # 0.93 clip where the lit samples ran out by the thumb, which drew a hard, darker curved patch through the e)
    L = f.mean(2); yy, xx = np.nonzero(mi); Lm = float(np.median(L[mi]))
    P = np.linalg.lstsq(np.c_[np.ones(len(xx)), xx / 100.0, yy / 100.0], L[mi] / Lm, rcond=None)[0]
    gy_, gx_ = np.mgrid[0:Y1 - Y0, 0:X1 - X0]
    shade = np.clip(P[0] + P[1] * gx_ / 100.0 + P[2] * gy_ / 100.0, 0.93, 1.06).astype(np.float32)
    ink = np.median(f[mi], 0)[None, None, :] * shade[..., None]
    out = bg * (1 - al[..., None]) + ink * al[..., None]
    out = out * (1 - occ[..., None]) + f * occ[..., None]
    res = rgb.copy(); res[Y0:Y1, X0:X1] = np.clip(out + 0.5, 0, 255).astype(np.uint8)
    return res


if __name__ == '__main__':
    if '--hook-only' in sys.argv: track_hook(); sys.exit()
    if '--lockup-only' not in sys.argv: analyse()
    analyse_lockup()
    track_hook()
