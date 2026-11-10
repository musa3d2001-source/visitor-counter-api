"""Fit a raw AI still (1536x2752) into the v4 layout (1080x1920) at zero credits.

The stills came back with the product too large and too high. This tool scales
the picture down, puts the product in the hero box and continues the backdrop
around it. Nothing is generated and no pixel of the product is repainted.

  plate mode  the backdrop outside the picture is the picture's own four edges
              carried outward (smoothed along the edge), so the value is
              continuous across every picture edge. On the side where a shadow
              leaves the picture, that edge is rebuilt from the opposite edge
              and the picture fades into the plate over a wide ramp.
  tile mode   for a textured surface (pool tiles): the picture is continued by
              shifted copies of itself, the shift chosen on the tile period,
              cross-faded over a short band.

usage: python3 -I fit_stills.py <key> <raw.png> <out.png> [<mask_out.png>|-] [<json config override>]
Coordinates in the config are "cover" coordinates: the raw still scaled to
1080 wide (1080x1935) and cropped 7.5 px top and bottom.
"""
import sys, json
import numpy as np
from PIL import Image

W, H = 1080, 1920
K = 1080 / 1536

CFG = {
    # s: scale; src -> dst: a cover-coordinate point and where it lands
    's1':    dict(s=0.647, src=(540, 1700), dst=(540, 1610), shadow_side='right', target='#FF7A1A'),
    's1alt': dict(s=0.66,  src=(540, 1660), dst=(540, 1610), shadow_side='right', target='#FF7A1A'),
    's5':    dict(s=0.535, src=(536, 1000), dst=(540, 1270), shadow_side='right', target='#FF4F9A'),
    's2':    dict(s=0.68,  src=(570, 1580), dst=(540, 1610), shadow_side='left', side_model='none', top='sides',
                  fade_above=(880, 1010), target='#FF4F9A'),
    's3':    dict(s=0.81,  src=(540, 1570), dst=(540, 1610), shadow_side='right', target='#1EA7FF'),
    's3alt': dict(s=0.667, src=(560, 1380), dst=(540, 1610), shadow_side='right', target='#1EA7FF'),
    's6':    dict(s=0.85,  src=(540, 960),  dst=(540, 1270), mode='tile'),
}


def gauss1d(a, sigma):
    """Gaussian along axis 0 of an (n, c) array."""
    if sigma <= 0:
        return a
    r = int(max(1, round(sigma * 3)))
    x = np.arange(-r, r + 1)
    k = np.exp(-x * x / (2 * sigma * sigma)); k /= k.sum()
    p = np.pad(a, ((r, r), (0, 0)), mode='edge')
    return np.stack([np.convolve(p[:, c], k, mode='valid') for c in range(a.shape[1])], axis=1)


def medfilt(a, win):
    """Median along axis 0 of an (n, c) array."""
    win = max(3, int(win) | 1)
    r = win // 2
    p = np.pad(a, ((r, r), (0, 0)), mode='reflect')
    return np.median(np.lib.stride_tricks.sliding_window_view(p, win, axis=0), axis=-1)


def bilat1d(a, sigma_s, sigma_r):
    """Edge-preserving smoothing along axis 0 of an (n, c) array: lighting blotches go, a horizon step stays."""
    ref = gauss1d(a, 1.6)
    r = int(3 * sigma_s)
    pr = np.pad(ref, ((r, r), (0, 0)), mode='edge')
    win = np.lib.stride_tricks.sliding_window_view(pr, 2 * r + 1, axis=0)       # (n, c, 2r+1)
    d2 = ((win - ref[:, :, None]) ** 2).sum(axis=1)                              # (n, 2r+1)
    x = np.arange(-r, r + 1)
    w = np.exp(-x * x / (2 * sigma_s ** 2))[None, :] * np.exp(-d2 / (2 * sigma_r ** 2))
    return (win * w[:, None, :]).sum(-1) / w.sum(-1)[:, None]


def sstep(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def hexrgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32)


def luma(a):
    return a @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)


def grain_sigma(small):
    """Noise level of the picture's plain backdrop (corner patches, 3x3 residual)."""
    y = luma(small); n = 80; o = 6; out = []
    for ys in (slice(o, o + n), slice(-o - n, -o)):
        for xs in (slice(o, o + n), slice(-o - n, -o)):
            p = y[ys, xs]
            m = sum(p[1 + dy:n - 1 + dy, 1 + dx:n - 1 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1)) / 9
            out.append(float((p[1:-1, 1:-1] - m).std() / np.sqrt(8 / 9)))
    return float(np.clip(np.median(out), 0.4, 3.0))


def hsv(a):
    a = np.clip(a, 0, 255) / 255
    mx = a.max(-1); mn = a.min(-1); d = mx - mn
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    with np.errstate(divide='ignore', invalid='ignore'):
        h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4))
        h = np.where(d == 0, 0, h) * 60
        s = np.where(mx == 0, 0, d / mx)
    return h, s, mx


def best_shift(hp, need, span=170):
    """Lag >= need (rows) at which the picture best matches itself (tile period multiple)."""
    n = hp.shape[0]
    f = np.fft.rfft(hp, n=2 * n, axis=0)
    ac = np.fft.irfft(f * np.conj(f), axis=0)[:n].sum(axis=1)
    ac = ac / (ac[0] * (1 - np.arange(n) / n))            # unbiased
    seg = ac[need:need + span]
    return need + int(np.argmax(seg)), float(seg.max())


def extend(img, before, total, d, xf):
    """(n, m, 3) -> (total, m, 3): row 0 placed at `before`, the rest filled by copies shifted by d."""
    n = img.shape[0]
    y = np.arange(total) - before
    out = img[np.clip(y, 0, n - 1)]
    if before > 0:
        w = sstep(y / xf)[:, None, None]
        out = out * w + img[np.clip(y + d, 0, n - 1)] * (1 - w)
    if total - before - n > 0:
        w = sstep((n - 1 - y) / xf)[:, None, None]
        out = out * w + img[np.clip(y - d, 0, n - 1)] * (1 - w)
    return out


def main():
    key, raw, out = sys.argv[1:4]
    mask_out = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] != '-' else None
    cfg = dict(CFG[key])
    if len(sys.argv) > 5:
        cfg.update(json.loads(sys.argv[5]))
    s = cfg['s']
    (cx, cy), (ax, ay) = cfg['src'], cfg['dst']
    im = Image.open(raw).convert('RGB')
    assert im.size == (1536, 2752), im.size
    iw, ih = round(1536 * K * s), round(2752 * K * s)
    small = np.asarray(im.resize((iw, ih), Image.LANCZOS)).astype(np.float32)
    ox = int(round(ax - s * cx)); oy = int(round(ay - s * (cy + 7.5)))
    rng = np.random.default_rng(20261109)
    info = dict(key=key, s=s, placed=[ox, oy, ox + iw, oy + ih])
    mode = cfg.get('mode', 'plate')
    plate = None

    if mode == 'tile':
        xf = cfg.get('xfade', 64)
        y = luma(small)
        hp = y - gauss1d(gauss1d(y, 8).T, 8).T
        if 'shift' in cfg:
            dy, dx = cfg['shift']; cy_ = cx_ = None
        else:
            dy, cy_ = best_shift(hp, max(oy, 0) + 8)
            dx, cx_ = best_shift(hp.T, max(ox, 0) + 8)
        info['tile_shift'] = [int(dy), int(dx)]; info['tile_corr'] = [cy_, cx_]
        wide = extend(small.transpose(1, 0, 2), ox, W, dx, xf).transpose(1, 0, 2)     # ih x W x 3
        full = extend(wide, oy, max(H, oy + ih), dy, xf)
        res = full[:H]
    elif mode == 'reflect':
        def mirror(i, n):
            p = 2 * (n - 1)
            i = np.mod(i, p)
            return np.where(i >= n, p - i, i)
        res = small[mirror(np.arange(H) - oy, ih)][:, mirror(np.arange(W) - ox, iw)]
    else:
        b0, bw = 3, 14
        ss_, sr_ = cfg.get('edge_sigma', (30, 50)), cfg.get('edge_range', 6.0)
        L = bilat1d(small[:, b0:b0 + bw].mean(axis=1), ss_[0], sr_)
        R = bilat1d(small[:, iw - b0 - bw:iw - b0].mean(axis=1), ss_[0], sr_)
        tb = cfg.get('tb_sigma', 90)      # top and bottom edges hold no horizon: smooth them wide
        T = gauss1d(bilat1d(small[b0:b0 + bw].mean(axis=0), ss_[1], sr_), tb)
        B = gauss1d(bilat1d(small[ih - b0 - bw:ih - b0].mean(axis=0), ss_[1], sr_), tb)
        side = cfg.get('shadow_side'); model = cfg.get('side_model', 'smooth')

        def rebuild(bad, good):
            if model == 'none':
                return good.copy()
            d = bad - good
            if model == 'const':
                r0, r1 = cfg.get('wall_rows', (0.02, 0.22))
                return good + np.median(d[int(ih * r0):int(ih * r1)], axis=0)
            return good + gauss1d(medfilt(d, cfg.get('med', 0.25) * ih), 0.05 * ih)
        if side == 'right':
            R = rebuild(R, L)
        elif side == 'left':
            L = rebuild(L, R)

        u = np.clip(np.arange(W) - ox, 0, iw - 1)
        v = np.clip(np.arange(H) - oy, 0, ih - 1)
        t = (u / (iw - 1))[None, :, None].astype(np.float32)
        row = L[v][:, None, :] * (1 - t) + R[v][:, None, :] * t
        row0 = L[0] * (1 - t) + R[0] * t
        rowN = L[-1] * (1 - t) + R[-1] * t
        Tm = row0 if cfg.get('top') == 'sides' else T[u][None] + (L[0] - T[0]) * (1 - t) + (R[0] - T[-1]) * t
        Bm = rowN if cfg.get('bottom') == 'sides' else B[u][None] + (L[-1] - B[0]) * (1 - t) + (R[-1] - B[-1]) * t
        fall = cfg.get('fall', 200)
        wt = sstep(1 - v / fall)[:, None, None]
        wb = sstep(1 - (ih - 1 - v) / fall)[:, None, None]
        plate = row + wt * (Tm - row0) + wb * (Bm - rowN)
        gs = cfg.get('grain', grain_sigma(small)); info['grain'] = round(gs, 2)
        plate = plate + rng.normal(0, gs, plate.shape[:2])[..., None]

        ramp = dict(left=30, right=30, top=96, bottom=60)
        if side:
            ramp[side] = 110
        ramp.update(cfg.get('ramp', {}))
        xi = np.arange(W) - ox; yi = np.arange(H) - oy
        ax_ = sstep((xi + 0.5) / ramp['left']) * sstep((iw - 0.5 - xi) / ramp['right'])
        ay_ = sstep((yi + 0.5) / ramp['top']) * sstep((ih - 0.5 - yi) / ramp['bottom'])
        inside = ((yi >= 0) & (yi < ih))[:, None] & ((xi >= 0) & (xi < iw))[None, :]
        A = (ay_[:, None] * ax_[None, :]).astype(np.float32) * inside
        if 'fade_above' in cfg:
            y0, y1 = cfg['fade_above']
            A = A * sstep((np.arange(H) - y0) / (y1 - y0))[:, None]
        canvas = small[v][:, u]
        res = plate * (1 - A[..., None]) + canvas * A[..., None]

    res = np.clip(res, 0, 255)
    if cfg.get('grade'):
        # channel gains that take the backdrop's own colour to the target, on backdrop-hued pixels only
        g = dict(width=(18, 30), sat=(0.15, 0.35), amount=1.0); g.update(cfg['grade'] if isinstance(cfg['grade'], dict) else {})
        ref = np.median(res[:880].reshape(-1, 3), axis=0)
        tgt = hexrgb(g.get('to', cfg['target']))
        hh, ss, _ = hsv(res); h0 = float(hsv(ref[None])[0][0])
        dh = np.abs((hh - h0 + 180) % 360 - 180)
        wq = (1 - sstep((dh - g['width'][0]) / (g['width'][1] - g['width'][0]))) * sstep((ss - g['sat'][0]) / (g['sat'][1] - g['sat'][0]))
        wq = (wq * g['amount'])[..., None]
        res = np.clip(res * (1 - wq) + res * (tgt / ref) * wq, 0, 255)
        info['grade'] = dict(ref=[round(float(x), 1) for x in ref], to=g.get('to', cfg['target']))
    Image.fromarray(np.rint(res).astype(np.uint8)).save(out, optimize=True)

    # gate measurements on the fitted still
    if plate is not None and not cfg.get('grade'):
        d = np.linalg.norm(res - plate, axis=2)
        ratio = (res + 1e-3) / (np.clip(plate, 0, 255) + 1e-3)
        shadow = (ratio.max(axis=2) - ratio.min(axis=2) < 0.18) & (ratio.mean(axis=2) < 1.03)
        subj = (d > 40) & ~shadow
        k = 7; pad = k // 2
        c = np.pad(subj.astype(np.int32), pad).cumsum(0).cumsum(1)
        c = np.pad(c, ((1, 0), (1, 0)))
        cnt = c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]
        subj = cnt >= 30
        rws = np.where(subj.sum(axis=1) >= 5)[0]; cls = np.where(subj.sum(axis=0) >= 5)[0]
        info['subject_bbox'] = [int(cls.min()), int(rws.min()), int(cls.max()), int(rws.max())] if len(rws) else None
        info['subject_px_above_880'] = int(subj[:880].sum())
        if mask_out:
            Image.fromarray((subj * 255).astype(np.uint8)).save(mask_out)
    top = res[:880].reshape(-1, 3)
    info['top_mean'] = [round(float(x), 1) for x in top.mean(0)]
    info['top_std'] = [round(float(x), 2) for x in top.std(0)]
    if cfg.get('target'):
        info['top_delta'] = round(float(np.linalg.norm(top.mean(0) - hexrgb(cfg['target']))), 1)
    r = res / 255
    lin = np.where(r <= 0.04045, r / 12.92, ((r + 0.055) / 1.055) ** 2.4)
    info['gamma_luma'] = round(float((luma(lin.astype(np.float32)) ** (1 / 2.2)).mean()), 3)
    hh, ss, vv = hsv(res)
    info['lime_frac'] = round(float(((hh >= 62) & (hh <= 100) & (ss > 0.55) & (vv > 0.55)).mean()), 5)
    print(json.dumps(info))


main()
