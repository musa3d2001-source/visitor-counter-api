"""DOSE: print the origin names on d1_grinders' blank hopper cards (the brief: the cards were generated blank on
purpose and we write the names in post; names ONLY, from dose's own caption: Ethiopia, El Salvador, Colombia; no
process / altitude / tasting notes). Card style from their bar (ref05): bold black geometric caps, top-left.

Method (conformed 1080x1920 px; v2 after the owner caught COLOMBIA running off card 3): each card has ONE
hand-measured reference quad (read off a pixel grid of a frame where it is sharp and whole). An affine ECC registration
of that card window (the card + 28 px around it) is chained through every frame, and each corner track is fitted over
time with a robust degree-5 polynomial (the slider move is smooth). The label is set with PIL in Archivo (OFL)
ExtraBold (v3: width 90; v2 used the expanded width 118, which made COLOMBIA a 10 px grey smudge), on a canonical card face with the card's own aspect, ONE type size on all three cards (the longest
word spans 72 % of the width; 13 % left margin, >= 15 % right, 20 % top), warped by the card's homography, given the
card's own defocus, and multiplied in as ink that follows the card's light. Each name prints on (a 0.12 s ink-in) on
the beat its Arabic word lands (times come from cues.json through the shot's time map).
Run: python3 src/tools/fx_cards.py   (writes assets/cards.json). Used by tools/prep.py.
"""
import os, json, sys
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import decode, ASSETS, SRC

CLIP, K0, K1 = 'd1_grinders', 0, 74
FONT = os.path.normpath(os.path.join(SRC, '..', '..', '_system', 'fonts', 'Archivo-VF.ttf'))
# v2: every card is tracked from ONE hand-measured reference quad (TL, TR, BR, BL; conformed px), read off a 3-5x
# pixel grid of its reference frame, where each card is sharp and fully in frame. v1 fitted lines to a whiteness mask
# and took the hopper glass's highlight beside card 3 as card (its quad grew ~35 px past the real left edge and its
# top edge tilted), so COLOMBIA ran off the card (owner, 7 Nov).
REF = {
    'c1': (20, [(635, 610), (935, 604), (934, 836), (636, 843)]),
    'c2': (40, [(380, 819), (570, 819), (570, 967), (380, 968)]),
    'c3': (45, [(189, 930), (322, 932), (322, 1049), (190, 1050)]),
}
LABEL = {'c1': ['ETHIOPIA'], 'c2': ['EL', 'SALVADOR'], 'c3': ['COLOMBIA']}
CUE = {'c1': 'origin1', 'c2': 'origin2', 'c3': 'origin3'}      # cues.json ev keys (edit seconds)
# the cards' own defocus (card 3's edges measure sigma 1.7-2.3); v3: card 3's ink 1.8 -> 1.3, a touch firmer than its
# edge so COLOMBIA reads at story size without looking pasted on
BLUR = {'c1': 0.5, 'c2': 0.6, 'c3': 1.3}
WDTH = 90       # v3: Archivo ExtraBold at width 90 (v2: 118, expanded): at the same 72 % of the card the caps are ~29 % taller
CW = 640                                                        # canonical card face width (height: the card's own aspect)
# type: one size on every card (they are the same physical card), set so the LONGEST word (SALVADOR / COLOMBIA) spans
# 72 % of the card's width; 13 % margin left, >= 15 % right, ~20 % top: well inside the card on every side
TEXT_W, MARGIN_L, TOP = 0.72, 0.13, 0.20


def ecc_track(fr, k_ref, quad_ref):
    """affine ECC of the reference card window (card + 28 px of its surroundings) into every frame, chained from the
    previous frame; pixels that would fall outside the frame are masked (card 1 leaves frame right at the end)"""
    q = np.array(quad_ref, np.float32)
    x0, y0 = np.floor(q.min(0) - 28).astype(int); x1, y1 = np.ceil(q.max(0) + 28).astype(int)
    gray = lambda im: cv2.GaussianBlur(cv2.cvtColor(im, cv2.COLOR_RGB2GRAY).astype(np.float32), (0, 0), 1.0)
    tmpl = gray(fr[k_ref - K0])[y0:y1, x0:x1]
    crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-6)
    out, cc = {k_ref: np.eye(3, dtype=np.float64)}, {k_ref: 1.0}
    for rng in (range(k_ref + 1, K1 + 1), range(k_ref - 1, K0 - 1, -1)):
        Wm = np.array([[1, 0, x0], [0, 1, y0]], np.float32)
        for k in rng:
            img = gray(fr[k - K0])
            try:
                c, Wm = cv2.findTransformECC(tmpl, img, Wm, cv2.MOTION_AFFINE, crit, np.ones(img.shape, np.uint8), 5)
            except cv2.error:
                c = 0.0
            A = np.vstack([Wm, [0, 0, 1]]).astype(np.float64) @ np.array([[1, 0, -x0], [0, 1, -y0], [0, 0, 1]], np.float64)
            out[k] = A; cc[k] = float(c)
    Q = {k: (np.c_[q, np.ones(4)] @ out[k].T)[:, :2] for k in out}
    return Q, cc


def robust_poly(t, y, deg):
    """the camera move is smooth: a degree-5 polynomial in time, iteratively reweighted (Huber-like)"""
    w = np.ones_like(y)
    for _ in range(6):
        p = np.polyfit(t, y, deg, w=w); r = y - np.polyval(p, t); sd = 1.4826 * np.median(np.abs(r)) + 1e-3
        w = 1 / np.maximum(1, np.abs(r) / (2 * sd))
    return np.polyval(p, t), r


def analyse():
    fr = decode(CLIP, K0, K1)
    out = {}
    for cid, (kr, q0) in REF.items():
        Qd, cc = ecc_track(fr, kr, q0)
        ks = np.arange(K0, K1 + 1); Q = np.array([Qd[k] for k in ks])
        S = np.zeros_like(Q); med = []
        for i in range(4):
            for j in range(2):
                S[:, i, j], r = robust_poly(ks.astype(float), Q[:, i, j], 5); med.append(float(np.median(np.abs(r))))
        q0a = np.array(q0, float); asp = (np.linalg.norm(q0a[1] - q0a[0]) + np.linalg.norm(q0a[2] - q0a[3])) / (np.linalg.norm(q0a[3] - q0a[0]) + np.linalg.norm(q0a[2] - q0a[1]))
        print(f'{cid}: ref f{kr}, ECC corr min {min(cc.values()):.3f} (f{min(cc, key=cc.get)}), median |raw - fit| per coord {np.round(med, 2).tolist()} px, aspect {asp:.3f}')
        out[cid] = {'label': LABEL[cid], 'cue': CUE[cid], 'blur': BLUR[cid], 'aspect': round(float(asp), 4), 'ref': kr,
                    'quad': {int(k): np.round(S[i], 2).tolist() for i, k in enumerate(ks)}}
    json.dump(out, open(os.path.join(ASSETS, 'cards.json'), 'w'), indent=0)
    return out


def _font(size):
    f = ImageFont.truetype(FONT, size); f.set_variation_by_axes([800, WDTH]); return f


def label_size():
    """one type size for all cards: the longest word spans TEXT_W of the canonical width"""
    f = _font(100); wmax = max(f.getbbox(w)[2] - f.getbbox(w)[0] for v in LABEL.values() for w in v)
    return int(round(100 * TEXT_W * CW / wmax))


def label_img(lines, aspect):
    """the name on a canonical card face (CW x CW/aspect, the card's own proportions, so the type is not squashed):
    black ink alpha (0..1), bold expanded caps, top-left like dose's bar cards"""
    CH = int(round(CW / aspect)); size = label_size(); f = _font(size)
    img = Image.new('L', (CW, CH), 0); d = ImageDraw.Draw(img)
    x, y = int(CW * MARGIN_L), int(CH * TOP)
    for ln in lines:
        bb = f.getbbox(ln); d.text((x - bb[0], y - bb[1]), ln, font=f, fill=255)
        y += int(round((bb[3] - bb[1]) * 1.32))
    return np.asarray(img, np.float32) / 255


_C = {}
def apply(k, rgb, ink_on):
    """ink_on: {card id: 0..1} print-on amount for this source frame (computed from the edit's cue times)"""
    if not _C:
        _C['cards'] = json.load(open(os.path.join(ASSETS, 'cards.json')))
        _C['lab'] = {c: label_img(v['label'], v['aspect']) for c, v in _C['cards'].items()}
    out = rgb.astype(np.float32)
    for cid, v in _C['cards'].items():
        a = ink_on.get(cid, 0)
        if a <= 0 or str(k) not in v['quad']: continue
        q = np.array(v['quad'][str(k)], np.float32)
        lab = _C['lab'][cid]; CH = lab.shape[0]
        Hm = cv2.getPerspectiveTransform(np.array([[0, 0], [CW, 0], [CW, CH], [0, CH]], np.float32), q)
        # downscale ~2-5x: pre-blur the canonical label in proportion so the warp never aliases
        sc = np.linalg.norm(q[1] - q[0]) / CW
        al = cv2.warpPerspective(cv2.GaussianBlur(lab, (0, 0), 0.45 / sc), Hm, (1080, 1920), flags=cv2.INTER_LINEAR)
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
