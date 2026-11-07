"""DOSE: print the origin names on d1_grinders' blank hopper cards (the brief: the cards were generated blank on
purpose and we write the names in post; names ONLY, from dose's own caption: Ethiopia, El Salvador, Colombia; no
process / altitude / tasting notes). Card style from their bar (ref05): bold black geometric caps, top-left.

Method (conformed 1080x1920 px): every card is a flat white rectangle with strong right/bottom edges. Per frame, each
card's white mask is taken inside a window around its previous quad, the four sides are fitted as lines (RANSAC on
the contour points near each predicted side, so the clip's notch on the top edge is ignored), the corners are the
line intersections, and the corner tracks are fitted over time with a robust degree-5 polynomial (the soft left edges' noise is rejected). The label is
set with PIL in Archivo (OFL) ExtraBold, expanded, on a canonical card, warped by the card's homography, given the
card's own defocus, and multiplied in as ink that follows the card's light. Each name prints on (a 0.12 s ink-in)
on the beat its Arabic word lands (times come from cues.json through the shot's time map).
Run: python3 src/tools/fx_cards.py   (writes assets/cards.json). Used by tools/prep.py.
"""
import os, json, sys
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import decode, ASSETS, SRC, k2c

CLIP, K0, K1 = 'd1_grinders', 0, 64
FONT = os.path.normpath(os.path.join(SRC, '..', '..', '_system', 'fonts', 'Archivo-VF.ttf'))
# frame-0 corners (TL, TR, BR, BL) from the CD review, Kling px -> conformed
START = {
    'c1': [(628, 636), (920, 625), (918, 851), (632, 860)],
    'c2': [(369, 855), (549, 852), (546, 993), (364, 999)],
    'c3': [(173, 971), (307, 975), (313, 1064), (174, 1069)],
}
LABEL = {'c1': ['ETHIOPIA'], 'c2': ['EL', 'SALVADOR'], 'c3': ['COLOMBIA']}
CUE = {'c1': 'origin1', 'c2': 'origin2', 'c3': 'origin3'}      # cues.json ev keys (edit seconds)
BLUR = {'c1': 0.5, 'c2': 0.6, 'c3': 2.2}                        # the cards' own defocus (card 3 is soft in the clip)
CW, CH = 640, 500                                               # canonical card face


def white(im):
    f = im.astype(np.float32); L = f.mean(2); s = (f[..., 0] - f[..., 2]) / (f[..., 0] + 1)
    return ((L > 175) & (s < 0.17)).astype(np.uint8)


def line_fit(pts):
    """RANSAC + least squares line through points -> (point, unit direction)"""
    best = None; r = np.random.default_rng(1)
    for _ in range(200):
        a, b = pts[r.choice(len(pts), 2, replace=False)]
        d = b - a; n = np.linalg.norm(d)
        if n < 5: continue
        d /= n; nr = np.array([-d[1], d[0]])
        inl = np.abs((pts - a) @ nr) < 1.5
        if best is None or inl.sum() > best.sum(): best = inl
    p = pts[best]; c = p.mean(0); u, s_, vt = np.linalg.svd(p - c); return c, vt[0]


def intersect(l1, l2):
    (p, d), (q, e) = l1, l2
    A = np.array([d, -e]).T; t = np.linalg.solve(A, q - p); return p + t[0] * d


def fit_quad(im, quad):
    quad = np.array(quad, np.float32)
    x0, y0 = np.floor(quad.min(0) - 24).astype(int); x1, y1 = np.ceil(quad.max(0) + 24).astype(int)
    x0, y0 = max(0, x0), max(0, y0); x1, y1 = min(im.shape[1], x1), min(im.shape[0], y1)
    m = white(im[y0:y1, x0:x1])
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    if n < 2: return None
    k = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    cs, _ = cv2.findContours((lab == k).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    pts = max(cs, key=len)[:, 0, :].astype(np.float32) + [x0, y0]
    lines = []
    for i in range(4):
        a, b = quad[i], quad[(i + 1) % 4]
        d = (b - a) / np.linalg.norm(b - a); nr = np.array([-d[1], d[0]])
        t = (pts - a) @ d; dist = np.abs((pts - a) @ nr)
        L = np.linalg.norm(b - a)
        sel = pts[(dist < 7) & (t > 0.12 * L) & (t < 0.88 * L)]
        if len(sel) < 12: return None
        lines.append(line_fit(sel))
    return np.array([intersect(lines[3], lines[0]), intersect(lines[0], lines[1]), intersect(lines[1], lines[2]), intersect(lines[2], lines[3])])


def robust_poly(t, y, deg):
    """the camera move is smooth: a degree-5 polynomial in time, iteratively reweighted (Huber-like) so the soft
    left edges' fitting noise is ignored; the crisp right/bottom edges fit to ~0.3 px"""
    w = np.ones_like(y)
    for _ in range(6):
        p = np.polyfit(t, y, deg, w=w); r = y - np.polyval(p, t); sd = 1.4826 * np.median(np.abs(r)) + 1e-3
        w = 1 / np.maximum(1, np.abs(r) / (2 * sd))
    return np.polyval(p, t), r


def analyse():
    fr = decode(CLIP, K0, K1)
    out = {}
    for cid, q0 in START.items():
        quad = np.array([k2c(*p) for p in q0], np.float32); track = []
        for k in range(K0, K1 + 1):
            q = fit_quad(fr[k - K0], quad)
            if q is None or np.abs(q - quad).max() > 25: q = quad.copy(); ok = False
            else: ok = True
            track.append((q, ok)); quad = q
        Q = np.array([t[0] for t in track])
        bad = [k for k, t in zip(range(K0, K1 + 1), track) if not t[1]]
        t = np.arange(len(Q)); S = np.zeros_like(Q); med = []
        for i in range(4):
            for j in range(2):
                S[:, i, j], r = robust_poly(t, Q[:, i, j], 5); med.append(float(np.median(np.abs(r))))
        print(f'{cid}: {len(Q)} frames, refit failures {bad}, median |raw - fit| per coord {np.round(med, 2).tolist()} px')
        out[cid] = {'label': LABEL[cid], 'cue': CUE[cid], 'blur': BLUR[cid], 'quad': {int(k): np.round(S[i], 2).tolist() for i, k in enumerate(range(K0, K1 + 1))}}
    json.dump(out, open(os.path.join(ASSETS, 'cards.json'), 'w'), indent=0)
    return out


def label_img(lines):
    """the name on a canonical white card: black ink alpha (0..1), bold expanded caps, top-left like dose's bar cards"""
    img = Image.new('L', (CW, CH), 0); d = ImageDraw.Draw(img)
    f = ImageFont.truetype(FONT, 84); f.set_variation_by_axes([800, 118])
    x, y = int(CW * 0.085), int(CH * 0.30)
    for ln in lines:
        d.text((x, y), ln, font=f, fill=255)
        y += 92
    return np.asarray(img, np.float32) / 255


_C = {}
def apply(k, rgb, ink_on):
    """ink_on: {card id: 0..1} print-on amount for this source frame (computed from the edit's cue times)"""
    if not _C:
        _C['cards'] = json.load(open(os.path.join(ASSETS, 'cards.json')))
        _C['lab'] = {c: label_img(v['label']) for c, v in _C['cards'].items()}
    out = rgb.astype(np.float32)
    for cid, v in _C['cards'].items():
        a = ink_on.get(cid, 0)
        if a <= 0 or str(k) not in v['quad']: continue
        q = np.array(v['quad'][str(k)], np.float32)
        Hm = cv2.getPerspectiveTransform(np.array([[0, 0], [CW, 0], [CW, CH], [0, CH]], np.float32), q)
        al = cv2.warpPerspective(_C['lab'][cid], Hm, (1080, 1920), flags=cv2.INTER_AREA if np.linalg.norm(q[1] - q[0]) < CW else cv2.INTER_LINEAR)
        # downscale ~2-4x: pre-blur the canonical label in proportion so the warp never aliases
        al = cv2.GaussianBlur(al, (0, 0), v['blur']) * a
        ys, xs = np.where(al > 0.004)
        if not len(ys): continue
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        card = out[y0:y1, x0:x1]
        light = np.clip(card.mean(2, keepdims=True) / 222.0, 0.6, 1.08)            # the card's own shading
        ink = np.array([22, 20, 19], np.float32) * light
        A_ = al[y0:y1, x0:x1, None] * 0.94
        out[y0:y1, x0:x1] = card * (1 - A_) + ink * A_
    return np.clip(out + 0.5, 0, 255).astype(np.uint8)


if __name__ == '__main__':
    analyse()
