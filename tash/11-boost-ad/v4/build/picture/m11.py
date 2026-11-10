"""M11: measurable BUILD-SPEC section 12 gates for one rendered variant of the TASH boost ad v4 (0 credits).

usage: python3 -I m11.py <work dir with film.json + frames/> [--mp4 file.mp4] [--tmp dir] [--stills dir]
                         [--det id,id,id] [--no-det] [--jobs 4]
Writes <work dir>/m11.json, prints a summary, exit code 1 if any gate fails (2 on a usage or tool error).

Gates (spec section 12 rows that can be measured on the frames and the layer lists):
  G1 luma        mean gamma luma Y' = 0.2126 R' + 0.7152 G' + 0.0722 B' (sRGB 0-1, not linear) of every frame >= 0.40.
                 Accepted (reported, not failed): the LAYL night beat A-20 f165-194, A-14 f165-179 (owner decision).
  G2 colour      Lime frames (Lime #C6FF00 +-14 on >= 25% of the picture) >= 40% of frames; footage frames (any footage
                 visible, from the layer lists, >= 0.5% of the picture) >= 45%; no Ink/Char/Smoke field (that colour
                 +-14 on >= 25% of the picture) except where LAYL footage is on screen (accepted near-black ground).
  G3 flash       spec luma steps |dY'| >= 0.10 counted per pixel (quarter resolution) from the previous frame; a flash is
                 a step followed by an opposite step at the same pixel; in any 30-frame window (cyclic: the loop seam
                 counts) the count is the largest n with >= 25% of the picture having >= n flashes; gate <= 3. Irises,
                 thirds and lens entries count where their edge passes a pixel; ramps (each pixel < 0.10 per frame) do not.
                 Frame-level steps (area >= 25%, frame to frame and over lags 1..6) are listed for reading.
  G4 cuts        hard picture cuts (>= 50% of the pixels change by >= 40 levels in one frame) only on multiples of 15;
                 at most 2 per 30-frame window. Smaller off-grid changes (>= 25%) are listed as transitions.
  G5 WCAG        general flash (relative luminance |dL| >= 0.10, darker state < 0.80) and red flash (linear RGB: a state
                 with R/(R+G+B) >= 0.8 and |d (R-G-B)*320| > 20), same per-pixel pairing as G3, area >= 25% of a 10-degree
                 field (771 x 771 px: 6.5 cm wide phone at 30 cm): <= 3 flashes per second. Every saturated-red
                 transition is listed (the spec row "no saturated-red transitions" is reported, not gated: the STAKK red
                 ground is an owner decision).
  G6 canvas      no transparent pixel in the picture, no single-colour (blank) frame, frame count and size.
  G7 loop        SSIM(Y') of f(N-1) against f0 >= 0.99.
  G8 rail        9:16 only: no text/word/wordmark ink (rendered from the layer list), no dot centre and no lens or
                 porthole in x > 960 over y 1100-1750.
  G9 tags        no tag ink box (each tag layer rendered alone by sb/compose.mjs after its -4 deg tilt: fill + keyline +
                 block shadow, axis-aligned box of alpha > 8) intersects the product body mask, in any frame with footage.
                 Also reported: ink-pixel overlap, fill-only box overlap, clearance (px) and tag ink over thin elements
                 (sauce or milk streams; not gated). How the mask is built: MASK_DOC below (also written into m11.json).
  G10 determinism  three frames re-rendered with sb/compose.mjs are pixel-identical to frames/.
  G11 mp4        (with --mp4) ffprobe: frame count, size, 30 fps, yuv420p, BT.709 primaries/transfer/matrix, tv range;
                 decoded colours (BT.709 tv -> full range) against the PNGs: flat-area mean signed error <= 1.5 levels
                 per channel and PSNR >= 35 dB on 6 frames.
"""
import sys, os, json, hashlib, subprocess, tempfile, shutil, math
from multiprocessing import Pool
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from scipy.spatial import ConvexHull

HERE = os.path.dirname(os.path.abspath(__file__))
SB = os.path.normpath(os.path.join(HERE, '..', '..', 'sb'))
W = 1080
WY = np.array([0.2126, 0.7152, 0.0722], np.float32)
COLS = {'lime': (198, 255, 0), 'ink': (11, 11, 11), 'char': (26, 26, 24), 'smoke': (142, 144, 136), 'paper': (245, 245, 233)}
NAMED = {'ink': '#0B0B0B', 'paper': '#F5F5E9', 'lime': '#C6FF00', 'smoke': '#8E9088', 'char': '#1A1A18'}
WORLD = {'hp': 'HABBA pour', 'hu': 'HABBA pour (band)', 'hb': 'HABBA beans', 'ls': 'LAYL spray', 'lb': 'LAYL bottle',
         'sa': 'STAKK open stack', 'sb': 'STAKK crown', 'su': 'STAKK', 'sl': 'STAKK (lens)', 'dc': 'cake', 'k': 'kunafa'}
# empty-backdrop rectangles (x0, y0, x1, y1) in prepared-frame (source) pixels, per prefix, for the product-mask colour model
BACKDROP = {'hp': [(0, 0, 1080, 650)], 'hu': [(0, 1500, 1080, 1920)], 'hb': [(0, 0, 1080, 900)], 'ls': [(0, 0, 900, 900)],
            'lb': [(0, 0, 1080, 600)], 'sa': [(0, 0, 1080, 750)], 'sb': [(0, 0, 1080, 750)], 'su': [(0, 0, 1080, 750)],
            'sl': [(0, 0, 1080, 750)], 'dc': [(0, 120, 450, 850), (740, 120, 1080, 850)], 'k': [(0, 0, 1080, 800)]}
HULL = {'hu': True, 'hb': True}                  # convex products (cup + saucer seen from the side, beans + table edge)
SAUCER = {'hp': (561, 1259)}                       # top-view cup: saucer disc fitted around this centre guess (manifest cup centre)
STAKK, LAYL = ('sa', 'sb', 'su', 'sl'), ('ls', 'lb')
K_LAG, WIN_Q = 6, 193          # transition lag (frames); 10-degree window at quarter resolution (771 px)
MASK_DOC = ("Product mask per prepared source frame, then mapped onto the canvas through each still layer (scale, cx, cy, ax, ay, dx, dy, clip); "
            "later opaque fills, rects, dots and stills erase it. STAKK (sa/sb/su/sl): not STAKK red (R>150, G<125, B<125, R-G>80; this also "
            "takes the pink steam as backdrop; |G-B| < 40 keeps the orange bun), R > 120, open r3. LAYL (ls/lb): Y' > 0.18 (bottle, cap, spray), open r1. Natural backdrops (hp/hu/hb/dc/k): "
            "6-cluster colour model (chromaticity r,g x4 and Y') of the empty-backdrop rectangles " + json.dumps(BACKDROP) + "; seeds = "
            "Mahalanobis^2 > 60 to every cluster, open r5, components >= 3000 px; plus pixels > 20 within 24 px of a seed (soft rims). "
            "HABBA top view (hp): plus the saucer disc (circle fitted to the rim edge, +2 px; see saucer_fit). All: close r12, holes filled, "
            "components >= 3000 px; convex hull for hu/hb (cup + saucer from the side, beans + table edge). 'thin' = pixels > 60 "
            "removed by the r5 opening plus vertical filaments (|Y' - mean of 61 px across| > 0.04, opened by a 41 px vertical line): "
            "sauce stream, milk stream; components >= 400 px: reported, not gated. Checked by eye on "
            "overlays and luma profiles: saucer top within 4 px (fit 778 against 782 at x 561, conservative), bun top within 5 px, cake crumble edge within about 10 px; the steel tray and the wood are not product.")


def die(msg):
    print('m11: ' + msg, file=sys.stderr); sys.exit(2)


def args():
    a = sys.argv[1:]
    if not a or a[0].startswith('-'): die(__doc__.split('\n')[2])
    o = {'wd': os.path.abspath(a[0]), 'mp4': None, 'tmp': None, 'stills': None, 'det': None, 'nodet': False, 'jobs': 4}
    i = 1
    while i < len(a):
        k = a[i]
        if k == '--no-det': o['nodet'] = True; i += 1; continue
        if i + 1 >= len(a): die('missing value for ' + k)
        v = a[i + 1]; i += 2
        if k == '--mp4': o['mp4'] = os.path.abspath(v)
        elif k == '--tmp': o['tmp'] = os.path.abspath(v)
        elif k == '--stills': o['stills'] = os.path.abspath(v)
        elif k == '--det': o['det'] = v
        elif k == '--jobs': o['jobs'] = int(v)
        else: die('unknown option ' + k)
    return o


# ---------------------------------------------------------------- per-frame pixel scan (worker)
def scan_frame(job):
    i, path, HH = job
    im = Image.open(path); im.load()
    size = im.size
    a = np.asarray(im.convert('RGBA'))[:HH]
    rgb = a[..., :3]; alpha = a[..., 3]
    Yf = rgb.astype(np.float32) @ WY / 255.0
    r16 = rgb.astype(np.int16)
    out = {'i': i, 'size': size, 'Y': float(Yf.mean()), 'a_lt255': int((alpha < 255).sum()), 'a_eq0': int((alpha == 0).sum()),
           'std': float(rgb.reshape(-1, 3).astype(np.float32).std(0).max()), 'nearblack': float((Yf < 0.10).mean())}
    for k, c in COLS.items():
        out['c_' + k] = float((np.abs(r16 - np.array(c, np.int16)).max(-1) <= 14).mean())
    q = np.asarray(Image.fromarray(rgb).reduce(4))      # quarter resolution, box average (270 px wide)
    return out, q


# ---------------------------------------------------------------- geometry helpers for layer lists
def col_of(c):
    return NAMED.get(c, c)


def clip_mask(clip, shape, s=1.0):
    """boolean mask of a compose clip at scale s (canvas px * s)"""
    H, Wd = shape
    if not clip: return np.ones(shape, bool)
    im = Image.new('1', (Wd, H), 0); d = ImageDraw.Draw(im)
    t = clip.get('type')
    if t == 'circle':
        x, y, r = clip['x'] * s, clip['y'] * s, clip['r'] * s
        if r > 0: d.ellipse([x - r, y - r, x + r, y + r], fill=1)
    elif t == 'rects':
        for (x, y, w, h) in clip['rects']: d.rectangle([x * s, y * s, (x + w) * s - 1, (y + h) * s - 1], fill=1)
    else:
        x, y, w, h = clip['x'] * s, clip['y'] * s, clip['w'] * s, clip['h'] * s
        if w > 0 and h > 0: d.rectangle([x, y, x + w - 1, y + h - 1], fill=1)
    return np.asarray(im)


def still_geom(L, iw=1080, ih=1920):
    k = max(W / iw, 1920 / ih) * L.get('scale', 1)
    w, h = iw * k, ih * k
    cx, cy = L.get('cx', 0.5), L.get('cy', 0.5)
    ax, ay = L.get('ax', W * cx), L.get('ay', 1920 * cy)
    x0 = ax - w * cx + L.get('dx', 0); y0 = ay - h * cy + L.get('dy', 0)
    return k, x0, y0, w, h


def region(L, shape, s):
    """area a layer paints opaquely at scale s (fills, rects, filled dots, stills), as a boolean mask"""
    H, Wd = shape; t = L['t']
    if L.get('alpha', 1) < 1 or L.get('blend'): return None
    if t == 'fill':
        return clip_mask(L.get('clip'), shape, s)
    if t == 'rect' and L.get('fill'):
        m = np.zeros(shape, bool); x0, y0 = int(round(L['x'] * s)), int(round(L['y'] * s))
        m[max(0, y0):max(0, int(round((L['y'] + L['h']) * s))), max(0, x0):max(0, int(round((L['x'] + L['w']) * s)))] = True
        return m
    if t == 'dot' and L.get('fill', 'lime') is not None:
        im = Image.new('1', (Wd, H), 0); r = L.get('r', 0) * s; x, y = L['x'] * s, L['y'] * s
        if r > 0: ImageDraw.Draw(im).ellipse([x - r, y - r, x + r, y + r], fill=1)
        m = np.asarray(im)
        return m & clip_mask(L.get('clip'), shape, s) if L.get('clip') else m
    if t == 'still':
        k, x0, y0, w, h = still_geom(L)
        m = np.zeros(shape, bool)
        m[max(0, int(math.ceil(y0 * s))):max(0, int(math.floor((y0 + h) * s))), max(0, int(math.ceil(x0 * s))):max(0, int(math.floor((x0 + w) * s)))] = True
        return m & clip_mask(L.get('clip'), shape, s)
    return None


def coverage(F, HH, s=0.125):
    """layer-list raster at 1/8: share of the picture showing footage, and share painted Lime"""
    shape = (int(round(HH * s)), int(round(W * s)))
    foot = np.zeros(shape, bool); lime = np.zeros(shape, bool)
    for L in F['layers']:
        m = region(L, shape, s)
        if m is None: continue
        foot[m] = L['t'] == 'still'
        c = col_of(L.get('color') if L['t'] == 'fill' else L.get('fill', 'lime'))
        lime[m] = (L['t'] != 'still') and isinstance(c, str) and c.upper() == '#C6FF00'
    return float(foot.mean()), float(lime.mean())


def prefix_of(src):
    b = os.path.basename(src); return ''.join(ch for ch in b.split('.')[0] if ch.isalpha())


def label(F):
    pre = [prefix_of(L['src']) for L in F['layers'] if L['t'] == 'still']
    return F['note'] + ('/' + WORLD.get(pre[-1], pre[-1]) if pre else '')


# ---------------------------------------------------------------- layer renders (compose.mjs), cached by layer JSON
def lkey(L):
    return hashlib.sha1(json.dumps(L, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:20]


def render_layers(layers, tmp, stills):
    """render each layer alone on a transparent 1080x1920 canvas; returns {key: (bbox x0,y0,x1,y1 inclusive or None, alpha path)}"""
    d = os.path.join(tmp, 'layers'); os.makedirs(d, exist_ok=True)
    todo = {}
    for L in layers:
        k = lkey(L)
        if not os.path.exists(os.path.join(d, k + '.png')): todo[k] = L
    if todo:
        spec = os.path.join(tmp, 'layers_spec.json')
        with open(spec, 'w') as fh: json.dump({'title': 'm11 layers', 'frames': [{'id': k, 'tc': '', 'note': '', 'layers': [L]} for k, L in todo.items()]}, fh, ensure_ascii=False)
        r = subprocess.run(['node', os.path.join(SB, 'compose.mjs'), '--frames', spec, '--out', d, '--stills', stills, '--nosheet'], capture_output=True, text=True)
        if r.returncode: die('compose.mjs failed on layer renders: ' + r.stderr[-2000:])
    return d


def alpha_of(d, L):
    a = np.asarray(Image.open(os.path.join(d, lkey(L) + '.png')).convert('RGBA'))[..., 3]
    return a > 8


def bbox(m):
    ys, xs = np.nonzero(m)
    return None if not len(xs) else (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))


# ---------------------------------------------------------------- product masks (source frames), cached
def _feats(a):
    a = a.astype(np.float32); s = a.sum(-1, keepdims=True) + 1.0
    Y = (a @ WY) / 255
    return np.concatenate([a[..., :2] / s * 4.0, Y[..., None]], -1)


def _disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]; return x * x + y * y <= r * r


def _components(m, min_px):
    lab, n = ndi.label(m)
    if not n: return m
    sz = ndi.sum(m, lab, range(1, n + 1))
    return np.isin(lab, 1 + np.nonzero(sz >= min_px)[0])


def saucer_fit(a, c):
    """circle through the saucer rim: on 81 rays (190-350 deg, the upper half, where the type is) from the centre guess c, the
    strongest outward luma drop over 6 px between r 380 and 620 (rim -> its shadow on the wood); Kasa least-squares circle, 5 rounds
    of outlier rejection. Checked on hp0043: rim top x 330/450/550/700 = 838/790/778/801 against 840-844/792-796/782/800-804 by eye."""
    Yb = ndi.gaussian_filter((a.astype(np.float32) @ WY) / 255, 2)
    th = np.radians(np.arange(190, 351, 2)); r = np.arange(380, 621, dtype=np.float32)
    P = ndi.map_coordinates(Yb, [c[1] + np.sin(th)[:, None] * r[None], c[0] + np.cos(th)[:, None] * r[None]], order=1, mode='nearest')
    d = P[:, 6:] - P[:, :-6]; k = d.argmin(1) + 3
    px, py = c[0] + np.cos(th) * r[k], c[1] + np.sin(th) * r[k]; keep = d.min(1) < -0.08
    for _ in range(5):
        A_ = np.stack([px[keep], py[keep], np.ones(keep.sum())], 1)
        Dk, Ek, Fk = np.linalg.lstsq(A_, -(px[keep] ** 2 + py[keep] ** 2), rcond=None)[0]
        cx, cy = -Dk / 2, -Ek / 2; R = float(np.sqrt(cx * cx + cy * cy - Fk))
        res = np.abs(np.hypot(px - cx, py - cy) - R); keep = keep & (res < max(6, 2.5 * np.median(res[keep])))
    return float(cx), float(cy), R


def product_mask_src(path, pre):
    """(body, thin) product masks of one prepared source frame. body is gated; thin = sauce stream, milk stream, mist
    filaments not in the body (reported only)."""
    a = np.asarray(Image.open(path).convert('RGB')); ai = a.astype(np.int16)
    thin = np.zeros(a.shape[:2], bool)
    if pre in STAKK:                                    # STAKK red backdrop (lit, shaded and the pink steam over it)
        bg = (ai[..., 0] > 120) & (ai[..., 1] < 125) & (ai[..., 2] < 125) & (ai[..., 0] - ai[..., 1] > 80) & (np.abs(ai[..., 1] - ai[..., 2]) < 40)
        body = ndi.binary_opening(~bg, _disk(3))
    elif pre in LAYL:                                   # near-black ground: bottle, cap and spray are brighter
        body = ndi.binary_opening((a.astype(np.float32) @ WY) / 255 > 0.18, _disk(1))
    else:                                               # natural backdrops: colour model of the empty backdrop
        F = _feats(a)
        X = np.concatenate([F[y0:y1, x0:x1].reshape(-1, 3) for x0, y0, x1, y1 in BACKDROP.get(pre, [(0, 0, 1080, 600)])])
        X = X[np.random.default_rng(1).choice(len(X), min(30000, len(X)), replace=False)]
        rng = np.random.default_rng(0); C = X[rng.choice(len(X), 6, replace=False)]
        for _ in range(20):
            l = ((X[:, None, :] - C[None]) ** 2).sum(-1).argmin(1)
            C = np.array([X[l == j].mean(0) if (l == j).any() else C[j] for j in range(6)])
        D = np.full(F.shape[:2], np.inf, np.float32)
        for j in range(6):
            Xj = X[l == j]
            if len(Xj) < 50: continue
            mu = Xj.mean(0); ic = np.linalg.inv(np.cov(Xj.T) + np.eye(3) * 1e-4)
            Z = F - mu; D = np.minimum(D, np.einsum('hwi,ij,hwj->hw', Z, ic, Z))
        seed = _components(ndi.binary_opening(D > 60, _disk(5)), 3000)            # sure product (thin parts removed)
        near = ndi.distance_transform_edt(~seed) <= 24                              # hysteresis: soft rims within 24 px
        body = seed | (ndi.binary_opening(D > 20, _disk(1)) & near)
        if pre in SAUCER:                               # saucer rim colours overlap the sunlit wood: fit the rim as a circle
            cx, cy, R = saucer_fit(a, SAUCER[pre])
            yy, xx = np.ogrid[:a.shape[0], :a.shape[1]]
            body = body | ((xx - cx) ** 2 + (yy - cy) ** 2 <= (R + 2) ** 2)
        Yv = (a.astype(np.float32) @ WY) / 255           # vertical streams (sauce, milk): local contrast across x, kept if vertical
        vert = ndi.binary_opening(np.abs(Yv - ndi.uniform_filter1d(Yv, 61, axis=1)) > 0.04, np.ones((41, 1), bool))
        thin = _components((ndi.binary_opening(D > 60, _disk(1)) | vert) & ~ndi.binary_dilation(body, _disk(4)), 400)
    body = _components(ndi.binary_fill_holes(ndi.binary_closing(body, _disk(12))), 3000)
    if HULL.get(pre, False):
        lab, n = ndi.label(body)
        for j in range(1, n + 1):
            ys, xs = np.nonzero(lab == j); pts = np.stack([xs, ys], 1)
            try:
                h = ConvexHull(pts); im = Image.new('1', (body.shape[1], body.shape[0]), 0)
                ImageDraw.Draw(im).polygon([tuple(map(float, pts[v])) for v in h.vertices], fill=1); body = body | np.asarray(im)
            except Exception: pass
    return body, thin


def _pm_job(job):
    path, pre, cache = job
    if not os.path.exists(cache):
        b, t = product_mask_src(path, pre)
        np.savez_compressed(cache, b=np.packbits(b), t=np.packbits(t), shape=np.array(b.shape))
    return cache


def load_pm(cache):
    z = np.load(cache); sh = tuple(z['shape']); n = sh[0] * sh[1]
    return np.unpackbits(z['b'])[:n].reshape(sh).astype(bool), np.unpackbits(z['t'])[:n].reshape(sh).astype(bool)


def product_canvas(F, stills, pmcache, HH):
    """(body, thin) product masks on the canvas for one frame (None if no footage)"""
    shape = (HH, W); P = np.zeros(shape, bool); Tn = np.zeros(shape, bool); any_still = False
    for L in F['layers']:
        if L['t'] == 'still':
            any_still = True
            src = os.path.join(stills, L['src'].split('/_stills/')[-1])
            vis = region(L, shape, 1.0); P &= ~vis; Tn &= ~vis
            for m, acc in zip(load_pm(pmcache[src]), (P, Tn)):
                k, x0, y0, w, h = still_geom(L, m.shape[1], m.shape[0])
                img = Image.fromarray(m.astype(np.uint8) * 255)
                warped = np.asarray(img.transform((W, 1920), Image.AFFINE, (1 / k, 0, -x0 / k, 0, 1 / k, -y0 / k), resample=Image.NEAREST))[:HH] > 127
                acc |= warped & vis
        else:
            m = region(L, shape, 1.0)
            if m is not None: P &= ~m; Tn &= ~m
    return (P, Tn) if any_still else None


# ---------------------------------------------------------------- flash / step bookkeeping
def pairs(seq):
    """frame-level count of sign alternations; opposite steps on the same frame (a cut that brightens one area and darkens
    another) are not a pair"""
    n, last, lf = 0, None, None
    for f, s in seq:
        if last is not None and s != last and f != lf: n += 1; last = None
        else: last, lf = s, f
    return n


def window_pairs(events, N, L=30):
    """events: list of (frame, sign); cyclic 30-frame windows; returns (max pairs, worst window start, windows over 3, max events)"""
    ev = sorted(events)
    best, bw, over, mx = 0, None, [], 0
    for f0 in range(N):
        w = sorted([((f - f0) % N, s, f) for f, s in ev if (f - f0) % N < L])
        p = pairs([(o, s) for o, s, f in w]); mx = max(mx, len(w))
        if p > best: best, bw = p, f0
        if p > 3: over.append(f0)
    return best, bw, over, mx


def win_events(events, f0, N, L=30):
    return [(f, '+' if s > 0 else '-') for o, s, f in sorted(((f - f0) % N, s, f) for f, s in events if (f - f0) % N < L)]


def flash_counts(T, area_fn, N, L=30):
    """T: int8 (N, h, w) per-pixel transitions (+1 / -1 / 0) from the previous frame (cyclic). For each 30-frame window, the largest n such
    that area_fn(pixels with >= n flashes) >= 0.25; a flash = a transition followed by an opposite one at the same pixel."""
    anyT = T.reshape(N, -1).any(1); res = np.zeros(N, int)
    for f0 in range(N):
        idx = [(f0 + o) % N for o in range(L) if anyT[(f0 + o) % N]]
        if len(idx) < 2: continue
        last = np.zeros(T.shape[1:], np.int8); cnt = np.zeros(T.shape[1:], np.uint8)
        for i in idx:
            t = T[i]; nz = t != 0; pair = nz & (last != 0) & (t != last)
            cnt += pair; last = np.where(pair, 0, np.where(nz, t, last)).astype(np.int8)
        n = 0
        for k in range(1, int(cnt.max()) + 1):
            if area_fn(cnt >= k) >= 0.25: n = k
            else: break
        res[f0] = n
    return res


def area_win(mask):
    if not mask.any(): return 0.0
    u = ndi.uniform_filter(mask.astype(np.float32), WIN_Q, mode='constant'); h = WIN_Q // 2
    v = u[h:mask.shape[0] - h, h:mask.shape[1] - h]
    return float(v.max()) if v.size else float(mask.mean())


def lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def ssim_y(a, b):
    from scipy.ndimage import gaussian_filter as g
    C1, C2 = 0.01 ** 2, 0.03 ** 2
    mx, my = g(a, 1.5, truncate=3.5), g(b, 1.5, truncate=3.5)
    sxx = g(a * a, 1.5, truncate=3.5) - mx * mx; syy = g(b * b, 1.5, truncate=3.5) - my * my; sxy = g(a * b, 1.5, truncate=3.5) - mx * my
    m = ((2 * mx * my + C1) * (2 * sxy + C2)) / ((mx * mx + my * my + C1) * (sxx + syy + C2))
    return float(m.mean()), m


def runs(fl):
    out = []
    for f in sorted(fl):
        if out and f == out[-1][1] + 1: out[-1][1] = f
        else: out.append([f, f])
    return out


def rs(fl):
    return ', '.join(f'f{a}' if a == b else f'f{a}-{b}' for a, b in runs(fl)) or '-'


# ---------------------------------------------------------------- main
def main():
    o = args(); wd = o['wd']
    filmp = os.path.join(wd, 'film.json'); fdir = os.path.join(wd, 'frames')
    if not os.path.exists(filmp) or not os.path.isdir(fdir): die('no film.json / frames/ in ' + wd)
    film = json.load(open(filmp)); FR = film['frames']; N = len(FR)
    t = film['title'].split()                          # "A-20 ig 916"
    LEN, PLAT, FMT = int(t[0].split('-')[1]), t[1], t[2]
    HH = 1350 if FMT == '45' else 1920
    man = json.load(open(os.path.join(HERE, 'swap_manifest.json')))
    stills = o['stills'] or man['stills_dir']
    own_tmp = o['tmp'] is None
    tmp = o['tmp'] or tempfile.mkdtemp(prefix='m11_'); os.makedirs(tmp, exist_ok=True)
    R = {'variant': film['title'], 'work_dir': wd, 'frames': N, 'visible_height': HH, 'gates': {}, 'notes': []}
    G = R['gates']
    def gate(name, ok, summary, **kw):
        G[name] = {'pass': bool(ok), 'summary': summary, **kw}
    ACC = (165, 194) if LEN == 20 else (165, 179)       # accepted LAYL night beat
    accepted = lambda f: ACC[0] <= f <= ACC[1]
    labels = [label(F) for F in FR]

    # ---- G6 canvas: files
    names = sorted(x for x in os.listdir(fdir) if x.endswith('.png'))
    want = [F['id'] + '.png' for F in FR]
    missing = [x for x in want if x not in names]
    if missing: die(f'{len(missing)} frames missing, e.g. {missing[:3]}')

    # ---- pixel scan
    jobs = [(i, os.path.join(fdir, want[i]), HH) for i in range(N)]
    with Pool(o['jobs']) as pool: res = pool.map(scan_frame, jobs, chunksize=8)
    S = {k: np.array([r[0][k] for r in res]) for k in res[0][0] if k not in ('i', 'size')}
    sizes = sorted({r[0]['size'] for r in res})
    Q = np.stack([r[1] for r in res]); del res
    Y = S['Y']

    # ---- G1 luma
    low = [f for f in range(N) if Y[f] < 0.40]
    # director decision (BUILD-SPEC R3-25): natural footage of the HABBA pour (hp) and the STAKK open stack (sa) may sit up to
    # 0.015 under the gate (measured 0.389-0.400); they are listed, not failed
    natural = lambda f: Y[f] >= 0.385 and any(L['t'] == 'still' and prefix_of(L['src']) in ('hp', 'sa') for L in FR[f]['layers'])
    low_nat = [f for f in low if not accepted(f) and natural(f)]
    low_acc = [f for f in low if accepted(f)]; low_bad = [f for f in low if not accepted(f) and not natural(f)]
    bysec = {}
    for f in low_bad: bysec.setdefault(labels[f], []).append(f)
    gate('G1_luma', not low_bad,
         f"min Y' {Y.min():.3f} at f{int(Y.argmin())} ({labels[int(Y.argmin())]}); frames under 0.40: {len(low)} "
         f"(accepted LAYL night beat f{ACC[0]}-{ACC[1]}: {len(low_acc)}, Y' {min([Y[f] for f in low_acc], default=float('nan')):.3f}-{max([Y[f] for f in low_acc], default=float('nan')):.3f}; "
         f"outside it: {len(low_bad)})",
         below_040_outside_accepted={k: {'frames': rs(v), 'Y_min': round(float(min(Y[f] for f in v)), 4), 'Y_max': round(float(max(Y[f] for f in v)), 4)} for k, v in bysec.items()},
         accepted_range=f'f{ACC[0]}-{ACC[1]}', accepted_below=rs(low_acc), accepted_natural_footage_0385=rs(low_nat))

    # ---- G2 colour shares
    cov = [coverage(F, HH) for F in FR]
    foot_area = np.array([c[0] for c in cov]); lime_layers = np.array([c[1] for c in cov])
    lime_px = S['c_lime']
    lime_frames = lime_px >= 0.25; foot_frames = foot_area >= 0.005
    dark_field = {k: [f for f in range(N) if S['c_' + k][f] >= 0.25] for k in ('ink', 'char', 'smoke')}
    layl = lambda f: accepted(f) or any(L['t'] == 'still' and prefix_of(L['src']) in LAYL for L in FR[f]['layers'])
    dark_bad = {k: [f for f in v if not layl(f)] for k, v in dark_field.items()}   # the LAYL near-black ground is accepted
    fill_dark = [f for f, F in enumerate(FR) for L in F['layers'] if L['t'] == 'fill' and not L.get('clip') and L.get('color') in ('ink', 'char', 'smoke')]
    ok2 = lime_frames.mean() >= 0.40 and foot_frames.mean() >= 0.45 and not any(dark_bad.values()) and not fill_dark
    gate('G2_colour', ok2,
         f"Lime frames {lime_frames.mean()*100:.1f}% (gate 40%), footage frames {foot_frames.mean()*100:.1f}% (gate 45%; >= 25% of the picture: {(foot_area >= 0.25).mean()*100:.1f}%); "
         f"Ink/Char/Smoke-coloured field (>=25%) frames: {sum(len(v) for v in dark_field.values())}, outside the accepted LAYL near-black ground: {sum(len(v) for v in dark_bad.values())}",
         lime_frames_pct=round(float(lime_frames.mean() * 100), 2), footage_frames_pct=round(float(foot_frames.mean() * 100), 2),
         footage_ge25_pct=round(float((foot_area >= 0.25).mean() * 100), 2),
         lime_by_layers_ge25_pct=round(float((lime_layers >= 0.25).mean() * 100), 2),
         dark_field_frames={k: rs(v) for k, v in dark_field.items()}, dark_field_outside_accepted={k: rs(v) for k, v in dark_bad.items()},
         unclipped_dark_fill_layers=rs(fill_dark))

    # ---- temporal metrics (quarter resolution, cyclic: the film loops)
    Yq = np.empty(Q.shape[:3], np.float32); Lq = np.empty_like(Yq); rv = np.empty_like(Yq); sat = np.empty(Q.shape[:3], bool)
    for f in range(N):                                   # per frame, to keep memory low
        g = Q[f].astype(np.float32) / 255; l = lin(g).astype(np.float32)
        Yq[f] = g @ WY; Lq[f] = l @ WY
        sat[f] = (l[..., 0] / np.maximum(l.sum(-1), 1e-6)) >= 0.8
        rv[f] = np.maximum(0, (l[..., 0] - l[..., 1] - l[..., 2]) * 320)
    A = {s: np.zeros((K_LAG + 1, N), np.float32) for s in (+1, -1)}
    chg = np.zeros(N, np.float32)
    Wg = {s: np.zeros(N, np.float32) for s in (+1, -1)}; Rd = {s: np.zeros(N, np.float32) for s in (+1, -1)}
    TS = np.zeros(Yq.shape, np.int8); TW = np.zeros(Yq.shape, np.int8); TR = np.zeros(Yq.shape, np.int8)   # per-pixel transitions
    for f in range(N):
        for k in range(1, K_LAG + 1):
            p = (f - k) % N; dY = Yq[f] - Yq[p]
            A[+1][k, f] = (dY >= 0.10).mean(); A[-1][k, f] = (dY <= -0.10).mean()
            if k == 1: TS[f] = (dY >= 0.10).astype(np.int8) - (dY <= -0.10).astype(np.int8)
        p = (f - 1) % N
        chg[f] = (np.abs(Q[f].astype(np.int16) - Q[p].astype(np.int16)).max(-1) >= 40).mean()
        dL = Lq[f] - Lq[p]; wg = np.minimum(Lq[f], Lq[p]) < 0.80
        TW[f] = ((dL >= 0.10) & wg).astype(np.int8) - ((dL <= -0.10) & wg).astype(np.int8)
        Wg[+1][f] = area_win(TW[f] > 0); Wg[-1][f] = area_win(TW[f] < 0)
        dR = rv[f] - rv[p]; rr = (sat[f] | sat[p]) & (np.abs(dR) > 20)
        TR[f] = (rr & (dR > 0)).astype(np.int8) - (rr & (dR < 0)).astype(np.int8)
        Rd[+1][f] = area_win(TR[f] > 0); Rd[-1][f] = area_win(TR[f] < 0)
    frame_area = lambda m: float(m.mean())
    fS = flash_counts(TS, frame_area, N); fW = flash_counts(TW, area_win, N); fR = flash_counts(TR, area_win, N)
    ev1 = [(f, s) for f in range(N) for s in (+1, -1) if A[s][1, f] >= 0.25]
    evT = list(ev1)
    for s in (+1, -1):
        hit = [f for f in range(N) if A[s][1:, f].max() >= 0.25]
        for a, b in runs(hit):
            if not any(a <= f <= b and ss == s for f, ss in ev1): evT.append((a, s))
    p1 = window_pairs(ev1, N); pT = window_pairs(evT, N)
    fmt_ev = lambda ev: ' '.join(f'f{f}{"+" if s > 0 else "-"}' for f, s in sorted(ev))
    wS = int(fS.argmax())
    gate('G3_flash_spec', fS.max() <= 3,
         f"opposing pairs of luma steps (|dY'|>=0.10, same pixels, >=25% of the picture) in any 30 f window: max {fS.max()} "
         f"(window f{wS}-f{(wS + 29) % N}); frame-level steps: {len(ev1)} frame-to-frame, {len(evT)} with slow transitions (lag <= {K_LAG}), "
         f"max {pT[3]} in a window, max {pT[0]} sign alternations",
         flashes_per_window_max=int(fS.max()), worst_window_start=wS, windows_over_3=rs([f for f in range(N) if fS[f] > 3]),
         steps_k1=fmt_ev(ev1), steps_with_transitions=fmt_ev(evT),
         worst_window_frame_level={'start': pT[1], 'events': win_events(evT, pT[1], N)} if pT[1] is not None else None,
         method='per pixel (quarter resolution) a step is |dY\'| >= 0.10 from the previous frame; a flash = a step followed by an opposite step at the '
                'same pixel; per 30-frame window (cyclic, the loop seam counts) the count n is the largest n with >= 25% of the picture having >= n flashes')

    # ---- G4 cuts
    hard = [f for f in range(N) if chg[f] >= 0.50]
    hard_off = [f for f in hard if f % 15]
    trans_off = [f for f in range(N) if 0.25 <= chg[f] < 0.50 and f % 15]
    cut_win = max(len([f for f in hard if (f - f0) % N < 30]) for f0 in range(N))
    grid_no_change = [f for f in range(0, N, 15) if chg[f] < 0.25]
    gate('G4_cuts', not hard_off and cut_win <= 2,
         f"hard cuts (>=50% of pixels change >=40 levels): {len(hard)}, off the 15-frame grid: {len(hard_off)}; max per 30 f: {cut_win}; "
         f"off-grid changes 25-50% (transitions): {len(trans_off)}",
         hard_cuts=' '.join(f'f{f}' for f in hard),
         hard_off_grid=[{'f': f, 'chg': round(float(chg[f]), 3), 'section': labels[f]} for f in hard_off],
         transitions_off_grid=[{'frames': f'f{a}-{b}' if a != b else f'f{a}', 'chg_max': round(float(chg[a:b + 1].max()), 3), 'section': labels[a]} for a, b in runs(trans_off)],
         grid_frames_without_change=' '.join(f'f{f}({labels[f]})' for f in grid_no_change))

    # ---- G5 WCAG flashes
    evW = [(f, s) for f in range(N) for s in (+1, -1) if Wg[s][f] >= 0.25]
    evR = [(f, s) for f in range(N) for s in (+1, -1) if Rd[s][f] >= 0.25]
    pr = window_pairs(evR, N)
    red_frames = (sat.mean((1, 2)))
    wW, wR = int(fW.argmax()), int(fR.argmax())
    gate('G5_wcag', fW.max() <= 3 and fR.max() <= 3,
         f"WCAG general flashes (same 10-degree area, 25%): max {fW.max()} per second (window f{wW}); red flashes: max {fR.max()} per second; "
         f"saturated-red transitions (>=25% of a 10-degree field): {len(evR)} ({rs(sorted({f for f, s in evR}))}), max {pr[3]} in 1 s",
         general_flashes_max=int(fW.max()), general_worst_window=wW, red_flashes_max=int(fR.max()), red_worst_window=wR,
         general_transition_frames=fmt_ev(evW), red_transition_frames=fmt_ev(evR),
         spec_row_no_saturated_red_transitions='met' if not evR else f'not met as written: {len(evR)} transitions (reported, not gated: STAKK red is an owner decision)',
         frames_saturated_red_ge25pct=rs([f for f in range(N) if red_frames[f] >= 0.25]))

    # ---- G6 canvas
    alpha_bad = [f for f in range(N) if S['a_lt255'][f] > 0]
    blank = [f for f in range(N) if S['std'][f] < 2.0]
    size_ok = sizes == [(1080, 1920)]
    gate('G6_canvas', not alpha_bad and not blank and size_ok and len(names) == N,
         f"{len(names)} PNGs for {N} frames, sizes {sizes}; frames with transparent pixels in the picture: {len(alpha_bad)}; blank frames: {len(blank)}",
         transparent=rs(alpha_bad), blank=rs(blank), extra_files=[x for x in names if x not in want][:10])

    # ---- G7 loop
    def Yfull(f):
        return np.asarray(Image.open(os.path.join(fdir, want[f])).convert('RGB'))[:HH].astype(np.float64) / 255 @ WY.astype(np.float64)
    s_loop, m_loop = ssim_y(Yfull(N - 1), Yfull(0))
    bad = m_loop < 0.9; bb = bbox(bad)
    gate('G7_loop', s_loop >= 0.99, f"SSIM(Y') f{N-1} vs f0 = {s_loop:.4f} (gate 0.99); local SSIM < 0.9 on {bad.mean()*100:.2f}% of pixels" + (f" in x {bb[0]}-{bb[2]} y {bb[1]}-{bb[3]}" if bb else ''),
         ssim=round(s_loop, 5))

    # ---- layer renders: tags (full and fill-only) and, for 9:16, every text/word/mark layer
    tag_layers = []
    for F in FR:
        if any(L['t'] == 'still' for L in F['layers']):
            for L in F['layers']:
                if L['t'] == 'text' and L.get('rot') == -4:
                    tag_layers.append(L); tag_layers.append({k: v for k, v in L.items() if k not in ('stroke', 'lw', 'shadow')})
    type_layers = [L for F in FR for L in F['layers'] if L['t'] in ('text', 'word', 'mark')] if FMT == '916' else []
    uniq = {lkey(L): L for L in tag_layers + type_layers}
    ld = render_layers(list(uniq.values()), tmp, stills)

    # ---- G8 rail (9:16)
    if FMT == '916':
        X0, Y0, Y1 = 960, 1100, 1750
        hits = []
        lay_info = {}
        for k, L in uniq.items():
            if L['t'] in ('text', 'word', 'mark') and k not in lay_info:
                m = alpha_of(ld, L); lay_info[k] = int(m[Y0:Y1 + 1, X0 + 1:].sum())
        def inside_clip(x, y, c):
            if not c: return True
            if c.get('type') == 'circle': return math.hypot(x - c['x'], y - c['y']) <= c['r']
            if c.get('type') == 'rects': return any(r[0] <= x <= r[0] + r[2] and r[1] <= y <= r[1] + r[3] for r in c['rects'])
            return c['x'] <= x <= c['x'] + c['w'] and c['y'] <= y <= c['y'] + c['h']
        for f, F in enumerate(FR):
            for L in F['layers']:
                t_ = L['t']
                if t_ in ('text', 'word', 'mark'):
                    px = lay_info[lkey(L)]
                    if px: hits.append({'f': f, 'layer': t_, 'what': L.get('s', L.get('key', 'mark')), 'ink_px_in_rail': px})
                elif t_ == 'dot' and L.get('alpha', 1) > 0 and L.get('r', 0) > 0 and L['r'] <= 400:
                    if L['x'] > X0 and Y0 <= L['y'] <= Y1 and inside_clip(L['x'], L['y'], L.get('clip')):
                        hits.append({'f': f, 'layer': 'dot', 'x': L['x'], 'y': L['y'], 'r': L['r']})
                elif t_ == 'still' and (L.get('clip') or {}).get('type') == 'circle' and L['clip']['r'] <= 400:
                    c = L['clip']
                    if c['x'] + c['r'] > X0 and c['y'] + c['r'] > Y0 and c['y'] - c['r'] < Y1:
                        hits.append({'f': f, 'layer': 'lens/porthole', 'x': c['x'], 'y': c['y'], 'r': c['r']})
        gate('G8_rail', not hits, f"items in x>960, y 1100-1750: {len(hits)} (text/word/mark ink rendered from the layer list, dot centres, lens/porthole circles)",
             hits=hits[:40], layers_checked=len(lay_info))
    else:
        G['G8_rail'] = {'pass': True, 'summary': 'not applicable (4:5)', 'skipped': True}

    # ---- G9 tags vs product
    srcs = {}
    for F in FR:
        if any(L['t'] == 'text' and L.get('rot') == -4 for L in F['layers']):
            for L in F['layers']:
                if L['t'] == 'still':
                    p = os.path.join(stills, L['src'].split('/_stills/')[-1]); srcs[p] = prefix_of(L['src'])
    pmdir = os.path.join(tmp, 'pmask'); os.makedirs(pmdir, exist_ok=True)
    pmcache = {p: os.path.join(pmdir, os.path.basename(p).replace('.png', '.npz')) for p in srcs}
    with Pool(o['jobs']) as pool: pool.map(_pm_job, [(p, srcs[p], pmcache[p]) for p in srcs])
    rows = []
    for f, F in enumerate(FR):
        tags = [L for L in F['layers'] if L['t'] == 'text' and L.get('rot') == -4]
        if not tags or not any(L['t'] == 'still' for L in F['layers']): continue
        P, Tn = product_canvas(F, stills, pmcache, HH)
        for L in tags:
            m = alpha_of(ld, L)[:HH]; mf = alpha_of(ld, {k: v for k, v in L.items() if k not in ('stroke', 'lw', 'shadow')})[:HH]
            b = bbox(m); bf = bbox(mf)
            if b is None: continue
            box_px = int(P[b[1]:b[3] + 1, b[0]:b[2] + 1].sum())
            fbox_px = int(P[bf[1]:bf[3] + 1, bf[0]:bf[2] + 1].sum()) if bf else 0
            ink_px = int((m & P).sum())
            y0c, y1c = max(0, b[1] - 60), min(HH, b[3] + 460)     # clearance searched up to ~400 px around the tag
            Pc = P[y0c:y1c]
            clear = float(ndi.distance_transform_edt(~Pc)[m[y0c:y1c]].min()) if Pc.any() and m.any() else None
            ob = bbox(P[b[1]:b[3] + 1, b[0]:b[2] + 1]) if box_px else None
            thin_px = int((m & Tn).sum()); tb = bbox(m & Tn)
            rows.append({'f': f, 'tag': L['s'], 'section': labels[f], 'box': b, 'fill_box': bf, 'box_x_product_px': box_px,
                         'fill_box_x_product_px': fbox_px, 'ink_x_product_px': ink_px, 'clearance_px': None if clear is None else round(clear, 1),
                         'overlap_box': None if ob is None else [ob[0] + b[0], ob[1] + b[1], ob[2] + b[0], ob[3] + b[1]],
                         'ink_x_thin_px': thin_px, 'thin_box': tb})
    # director decision (BUILD-SPEC R3-25, director-plan.json): in 9:16 the hook tag «حلو…» may rest on the HABBA saucer rim
    # (f3-29); the cup stays clear. Listed, not failed.
    rim_ok = lambda r: FMT == '916' and r['f'] <= 29 and r['tag'] == 'حلو…'
    accepted_rows = [r for r in rows if r['box_x_product_px'] > 0 and rim_ok(r)]
    fails = [r for r in rows if r['box_x_product_px'] > 0 and not rim_ok(r)]
    beats = {}
    for r in rows: beats.setdefault((r['section'], r['tag']), []).append(r)
    summ = []
    for (sec, tg), rr in beats.items():
        fr_ = [r['f'] for r in rr]
        summ.append({'section': sec, 'tag': tg, 'frames': rs(fr_), 'frames_box_overlap': rs([r['f'] for r in rr if r['box_x_product_px']]),
                     'frames_ink_overlap': rs([r['f'] for r in rr if r['ink_x_product_px']]),
                     'max_box_px': max(r['box_x_product_px'] for r in rr), 'max_ink_px': max(r['ink_x_product_px'] for r in rr),
                     'max_fill_box_px': max(r['fill_box_x_product_px'] for r in rr),
                     'min_clearance_px': min((r['clearance_px'] for r in rr if r['clearance_px'] is not None), default=None),
                     'tag_box_y_max': max(r['box'][3] for r in rr),
                     'frames_ink_over_thin_elements': rs([r['f'] for r in rr if r['ink_x_thin_px']]), 'max_ink_x_thin_px': max(r['ink_x_thin_px'] for r in rr)})
    gate('G9_tag_product', not fails,
         f"tag frames over footage: {len(rows)}; tag ink box intersects the product mask on {len(fails)} "
         f"(ink pixels on the product: {sum(1 for r in rows if r['ink_x_product_px'])}; fill-only box: {sum(1 for r in rows if r['fill_box_x_product_px'])}); "
         f"tag ink over a thin element (stream/filament, not gated): {sum(1 for r in rows if r['ink_x_thin_px'])} frames",
         beats=summ, frames=rows, accepted_saucer_rim=rs([r['f'] for r in accepted_rows]),
         mask=MASK_DOC)

    # ---- G10 determinism
    if not o['nodet']:
        if o['det']: ids = o['det'].split(',')
        else:
            first = lambda n: next((i for i, F in enumerate(FR) if F['note'] == n), None)
            cand = [first('worlds') + 7, first('multiply') + 7, first('cta') + 40]
            ids = [FR[c]['id'] for c in cand if c is not None and c < N]
        dd = os.path.join(tmp, 'det_' + os.path.basename(wd)); shutil.rmtree(dd, ignore_errors=True); os.makedirs(dd)
        r = subprocess.run(['node', os.path.join(SB, 'compose.mjs'), '--frames', filmp, '--out', dd, '--stills', stills, '--nosheet', '--only', ','.join(ids)], capture_output=True, text=True)
        det = []
        if r.returncode: det.append({'error': r.stderr[-1500:]})
        else:
            for i in ids:
                a = np.asarray(Image.open(os.path.join(fdir, i + '.png')).convert('RGBA')).astype(np.int16)
                b = np.asarray(Image.open(os.path.join(dd, i + '.png')).convert('RGBA')).astype(np.int16)
                d = np.abs(a - b)
                det.append({'id': i, 'identical': bool(not d.any()), 'pixels_differ': int((d.max(-1) > 0).sum()), 'max_diff': int(d.max())})
        gate('G10_determinism', all(x.get('identical') for x in det), f"re-rendered {ids}: " + ', '.join(f"{x.get('id')} {'identical' if x.get('identical') else 'DIFFERS (%s px, max %s)' % (x.get('pixels_differ'), x.get('max_diff'))}" for x in det), frames=det)

    # ---- G11 mp4
    if o['mp4']:
        G['G11_mp4'] = mp4_check(o['mp4'], fdir, want, N, HH)

    # ---- write
    R['per_frame'] = {'section': labels, 'Y': [round(float(v), 4) for v in Y], 'lime_px': [round(float(v), 4) for v in lime_px],
                      'footage_area': [round(float(v), 4) for v in foot_area], 'chg': [round(float(v), 4) for v in chg],
                      'step_pos_k1': [round(float(v), 4) for v in A[+1][1]], 'step_neg_k1': [round(float(v), 4) for v in A[-1][1]]}
    R['pass'] = all(v['pass'] for v in G.values())
    out = os.path.join(wd, 'm11.json')
    with open(out, 'w') as fh: json.dump(R, fh, ensure_ascii=False, indent=1)
    print(f"===== M11 {film['title']} ({N} frames) -> {out}")
    for k, v in G.items(): print(f"  {'PASS' if v['pass'] else 'FAIL'} {k}: {v['summary']}")
    print('  RESULT:', 'PASS' if R['pass'] else 'FAIL')
    if own_tmp: shutil.rmtree(tmp, ignore_errors=True)
    sys.exit(0 if R['pass'] else 1)


def mp4_check(mp4, fdir, want, N, HH):
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries',
                        'stream=codec_name,profile,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_frames,nb_read_packets,color_range,color_space,color_transfer,color_primaries,duration',
                        '-of', 'json', mp4], capture_output=True, text=True)
    if r.returncode: return {'pass': False, 'summary': 'ffprobe failed: ' + r.stderr[-500:]}
    st = json.loads(r.stdout)['streams'][0]
    probs = []
    if (st.get('width'), st.get('height')) != (1080, HH): probs.append(f"size {st.get('width')}x{st.get('height')}")
    if int(st.get('nb_read_packets', st.get('nb_frames', 0))) != N: probs.append(f"frames {st.get('nb_read_packets')}")
    if st.get('r_frame_rate') != '30/1': probs.append('rate ' + str(st.get('r_frame_rate')))
    if st.get('pix_fmt') != 'yuv420p': probs.append('pix_fmt ' + str(st.get('pix_fmt')))
    for k in ('color_space', 'color_transfer', 'color_primaries'):
        if st.get(k) != 'bt709': probs.append(f'{k} {st.get(k)}')
    if st.get('color_range') != 'tv': probs.append('range ' + str(st.get('color_range')))
    fl = sorted({0, N // 5, 2 * N // 5, N // 2 + 7, 4 * N // 5, N - 1})
    td = tempfile.mkdtemp(prefix='m11mp4_'); cmp = []
    sel = '+'.join(f'eq(n\\,{f})' for f in fl)
    for tag, vf in [('709', f"select='{sel}',scale=in_color_matrix=bt709:in_range=tv:out_range=pc:flags=accurate_rnd+full_chroma_int,format=rgb24"),
                    ('auto', f"select='{sel}',format=rgb24")]:
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', mp4, '-vf', vf, '-fps_mode', 'passthrough', os.path.join(td, tag + '_%02d.png')], check=True)
    for j, f in enumerate(fl):
        p = np.asarray(Image.open(os.path.join(fdir, want[f])).convert('RGB'))[:HH].astype(np.float64)
        gy, gx = np.gradient(p.mean(-1)); e = (np.abs(gx) + np.abs(gy)) < 0.5
        flat = ndi.binary_erosion(e, np.ones((9, 9)))
        row = {'f': f, 'flat_pct': round(float(flat.mean() * 100), 1)}
        for tag in ('709', 'auto'):
            d = np.asarray(Image.open(os.path.join(td, f'{tag}_{j + 1:02d}.png'))).astype(np.float64) - p
            fd = d[flat] if flat.any() else d.reshape(-1, 3)
            row[tag] = {'flat_signed': [round(float(x), 2) for x in fd.mean(0)], 'mean_abs': round(float(np.abs(d).mean()), 2),
                        'psnr_db': round(float(10 * np.log10(255 ** 2 / max(np.mean(d ** 2), 1e-9))), 2)}
        cmp.append(row)
    shutil.rmtree(td, ignore_errors=True)
    colour_bad = [c['f'] for c in cmp if max(abs(x) for x in c['709']['flat_signed']) > 1.5 or c['709']['psnr_db'] < 35]
    if colour_bad: probs.append(f'decoded colour off on frames {colour_bad}')
    return {'pass': not probs, 'summary': (f"{os.path.basename(mp4)}: {st.get('codec_name')} {st.get('profile')} {st.get('width')}x{st.get('height')} {st.get('pix_fmt')} "
                                           f"{st.get('r_frame_rate')} fps, {st.get('nb_read_packets')} frames, {st.get('color_primaries')}/{st.get('color_transfer')}/{st.get('color_space')} {st.get('color_range')}; "
                                           f"BT.709 decode vs PNG: worst flat-area signed error {max(max(abs(x) for x in c['709']['flat_signed']) for c in cmp):.2f} levels, min PSNR {min(c['709']['psnr_db'] for c in cmp):.1f} dB"
                                           + (('; problems: ' + '; '.join(probs)) if probs else '')),
            'stream': st, 'decode_vs_png': cmp, 'size_bytes': os.path.getsize(mp4)}


if __name__ == '__main__':
    main()
