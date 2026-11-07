"""DOSE: re-comp the cup's small «specialty» line in d2d_carafe (CD review: the coffee stream, the falling cubes and
the foam are drawn IN FRONT of «specialty», which is printed on the cup's outer wall, so letters break: f54
«specia|ty», f62 «spec|alty» ...; the big «dose» correctly stays on top).

Method (conformed 1080x1920 px, d2d upscaled x1.5): the print is rigid on the cup, so the big «dose» letters are
tracked (uniform scale + translation, orange-ness map, Nelder-Mead, frame to frame, then a quadratic fit over time)
against REF = f110, where «specialty» is clean on dark coffee. The clean line's alpha is keyed off REF by colour
(orange ink vs the dark coffee behind it), warped into every frame of the used range and laid on top as opaque ink in
the colour of that frame's own «dose» letters, so the stream, ice and foam sit BEHIND the print.
Run: python3 src/tools/fx_specialty.py  (writes assets/specialty.json + specialty_a.png). Used by tools/prep.py.
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


def orng(im):
    f = im.astype(np.float32); R, G, B = f[..., 0] + 1, f[..., 1], f[..., 2]
    return np.clip(((R - B) / R - 0.45) / 0.3, 0, 1) * np.clip((0.62 - G / R) / 0.2, 0, 1) * np.clip((R - 120) / 60, 0, 1)


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


_C = {}
def apply(k, rgb):
    if not _C:
        _C['m'] = json.load(open(os.path.join(ASSETS, 'specialty.json')))
        _C['a'] = np.asarray(Image.open(os.path.join(ASSETS, 'specialty_a.png')), np.float32) / 255
    meta, a = _C['m'], _C['a']
    if not (meta['fix'][0] <= k <= meta['fix'][1]) or str(k) not in meta['frames']: return rgb
    fm = meta['frames'][str(k)]; s, c = fm['s'], meta['c']; bx, by = meta['spec_box'][:2]
    A = np.array([[s, 0, c[0] * (1 - s) + fm['tx'] + s * bx], [0, s, c[1] * (1 - s) + fm['ty'] + s * by]], np.float32)
    al = cv2.warpAffine(a, A, (1080, 1920), flags=cv2.INTER_LINEAR)
    # the AI's own (misplaced / broken) ink just around our letters: lift it out first (small Telea fill), so no
    # second outline shows beside the re-comped print
    ys, xs = np.where(al > 0.05); y0, y1, x0, x1 = ys.min() - 12, ys.max() + 13, xs.min() - 12, xs.max() + 13
    crop = rgb[y0:y1, x0:x1].copy(); ac = al[y0:y1, x0:x1]
    near = cv2.dilate((ac > 0.25).astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
    stray = near & (orng(crop) > 0.3) & (ac < 0.6)
    if stray.any():
        stray = cv2.dilate(stray.astype(np.uint8), np.ones((3, 3), np.uint8))
        crop = cv2.inpaint(crop, stray, 3, cv2.INPAINT_TELEA)
    base = rgb.copy(); base[y0:y1, x0:x1] = crop
    ink = np.array(fm['ink'], np.float32)
    out = base.astype(np.float32) * (1 - al[..., None]) + ink * al[..., None]
    return np.clip(out + 0.5, 0, 255).astype(np.uint8)


if __name__ == '__main__':
    analyse()
