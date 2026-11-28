"""«طشّ للطلاب»: the payoff still h2_class → src/footage/h2/
  plate.jpg   1512x2688 (exact 9:16; the 1520x2688 still minus 4 px a side). That is 1.4x the 1080x1920 frame: the
              renderer draws a window of the plate (zoom z >= 1 shows 1512/z source px across the frame), so a slow
              2.5D push-in up to ~1.4x never upsamples, and at z = 1.1 there is 5 % of overscan on every side for drift.
  screen.json the projection screen quad (TL, TR, BR, BL, plate px) = the inner edge of its dark frame, edges fitted on
              the unoccluded contour (the presenter's hand covers part of the right edge); plus the presenter's crop
              box for fg.png and the plate size.
  matte.png   8-bit alpha, plate size: 1 = in front of the screen (her forearm, hand and clicker), 0 = the screen.
              Keyed INSIDE the screen only (quad + 3 px), against the screen's own white measured locally: outside the
              screen the plate is already right, so nothing needs a matte there.
  fg.png      RGBA crop of the plate x matte around the presenter (its box in screen.json -> fg.box): draw it on top
              of the slide so the slide sits BEHIND her hand.
  No parallax layer: a front-rows layer over an inpainted wall was tried and dropped (ghosted heads, doubled stage
  edge at 3 % parallax). The push-in is one plane.
Usage: python3 src/tools/prep_h2.py [check.png]   (check.png: a test comp with a sample slide on the screen)"""
import json, os, sys
import numpy as np, cv2
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)
STILL = os.path.join(os.path.dirname(SRC), 'footage', 'ai', 'frames', 'h2_class.png')
OUT = os.path.join(SRC, 'footage', 'h2')
CROPX = 4


def line_fit(pts):
    c = pts.mean(0); _, _, vt = np.linalg.svd(pts - c); return c, vt[0]


def intersect(l1, l2):
    (p, d), (q, e) = l1, l2
    t = np.linalg.solve(np.array([d, -e]).T, q - p); return p + t[0] * d


def screen_quad(im):
    m = (im.min(2) > 200).astype(np.uint8)
    n, lab, st, ce = cv2.connectedComponentsWithStats(m, 8)
    i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    comp = cv2.morphologyEx((lab == i).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    cs, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cs, key=cv2.contourArea)[:, 0, :].astype(np.float64)
    x0, y0, w, h = cv2.boundingRect(c.astype(np.int32))
    # each edge: contour points within 5 px of the bounding box side, middle 70 %, then a robust (trimmed) line fit
    sides = {'top': (c[:, 1] < y0 + 5) & (c[:, 0] > x0 + .15 * w) & (c[:, 0] < x0 + .85 * w),
             'right': (c[:, 0] > x0 + w - 5) & (c[:, 1] > y0 + .15 * h) & (c[:, 1] < y0 + .85 * h),
             'bottom': (c[:, 1] > y0 + h - 5) & (c[:, 0] > x0 + .15 * w) & (c[:, 0] < x0 + .85 * w),
             'left': (c[:, 0] < x0 + 5) & (c[:, 1] > y0 + .15 * h) & (c[:, 1] < y0 + .85 * h)}
    L = {}
    for k, sel in sides.items():
        p = c[sel]; ln = line_fit(p)
        for _ in range(3):                                   # drop points > 1.5 px off the line (an occluding hand)
            d = np.abs((p - ln[0]) @ np.array([-ln[1][1], ln[1][0]])); p = p[d < 1.5] if (d < 1.5).sum() > 20 else p; ln = line_fit(p)
        L[k] = ln
    q = np.array([intersect(L['left'], L['top']), intersect(L['top'], L['right']), intersect(L['right'], L['bottom']),
                  intersect(L['bottom'], L['left'])])
    return q


def expand_quad(q, px):
    """the quad pushed out by px along each edge normal (corners = the moved edges' intersections)"""
    c = q.mean(0); lines = []
    for k in range(4):
        A, B = q[k], q[(k + 1) % 4]; u = (B - A) / np.linalg.norm(B - A); n = np.array([u[1], -u[0]])
        if np.dot(n, (A + B) / 2 - c) < 0: n = -n
        lines.append((A + n * px, u))
    return np.array([intersect(lines[(k - 1) % 4], lines[k]) for k in range(4)])


def quad_mask(shape, q, ss=4):
    """anti-aliased polygon mask (supersampled x ss)"""
    H, W = shape
    m = np.zeros((H * ss, W * ss), np.uint8)
    cv2.fillPoly(m, [np.round(q * ss).astype(np.int32)], 255, lineType=cv2.LINE_8)
    return cv2.resize(m, (W, H), interpolation=cv2.INTER_AREA).astype(np.float32) / 255


def presenter_matte(im, q):
    """alpha of what is in front of the screen, INSIDE the screen (the only place a slide is drawn; outside it the
    plate itself is already right): her forearm, hand and clicker keyed against the screen's own white, measured
    locally (a wide max filter over screen pixels only), limited to the quad pushed out 3 px (the white's anti-aliased
    rim) and to the presenter's side of the screen"""
    Lum = cv2.cvtColor(im, cv2.COLOR_RGB2GRAY).astype(np.float32)
    H, W = Lum.shape
    qm = quad_mask((H, W), expand_quad(q, 3.0))
    inner = quad_mask((H, W), expand_quad(q, -4.0))
    white = np.where(inner > 0.99, Lum, 0)
    bg = cv2.GaussianBlur(ndimage.maximum_filter(white, size=61), (0, 0), 20)
    bg = np.where(bg < 200, 250, bg)                           # the rim, where the filter sees no screen: plain white
    a = np.clip((bg - 18 - Lum) / np.maximum(bg - 18 - 40, 20), 0, 1) * qm
    reg = np.zeros((H, W), np.uint8); reg[1150:1500, 1150:] = 1   # her side (the hand reaches x ~ 1258)
    a *= reg
    n, lab = cv2.connectedComponents((a > 0.5).astype(np.uint8), 8)
    sizes = np.bincount(lab.ravel()); sizes[0] = 0
    keep = cv2.dilate((lab == int(np.argmax(sizes))).astype(np.uint8), np.ones((9, 9), np.uint8))
    return a * keep


def decontaminate(im, a):
    """edge pixels of the hand/hair carry the screen's white: unmix them, F = (I - (1-a) B) / a with B the local
    background colour (a wide per-channel max filter, blurred), so fg.png shows no white fringe over a dark slide"""
    I = im.astype(np.float32)
    B = np.dstack([cv2.GaussianBlur(ndimage.maximum_filter(I[..., c], size=61), (0, 0), 25) for c in range(3)])
    A = np.maximum(a, 1e-3)[..., None]
    F = (I - (1 - A) * B) / A
    # where alpha is tiny the unmixed colour is noise: fall back to the dark body colour of the silhouette
    body = np.median(I[a > 0.95], axis=0) if (a > 0.95).any() else np.array([30, 25, 22], np.float32)
    k = np.clip((a - 0.05) / 0.25, 0, 1)[..., None]
    F = F * k + body * (1 - k)
    F = np.where(a[..., None] > 0.98, I, F)
    return np.clip(F, 0, 255).astype(np.uint8)


def main():
    os.makedirs(OUT, exist_ok=True)
    im = cv2.cvtColor(cv2.imread(STILL), cv2.COLOR_BGR2RGB)[:, CROPX:-CROPX]      # 1512 x 2688
    H, W = im.shape[:2]
    cv2.imwrite(os.path.join(OUT, 'plate.jpg'), cv2.cvtColor(im, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 93])
    q = screen_quad(im)
    a = presenter_matte(im, q)
    cv2.imwrite(os.path.join(OUT, 'matte.png'), np.round(a * 255).astype(np.uint8))
    ys, xs = np.nonzero(a > 0.004)
    box = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
    fgc = decontaminate(im, a)
    fg = np.dstack([fgc, np.round(a * 255).astype(np.uint8)])[box[1]:box[3], box[0]:box[2]]
    cv2.imwrite(os.path.join(OUT, 'fg.png'), cv2.cvtColor(fg, cv2.COLOR_RGBA2BGRA))
    J = {'_note': __doc__.split('Usage:')[0].strip(), 'still': 'footage/ai/frames/h2_class.png', 'crop_x': CROPX,
         'plate': {'file': 'src/footage/h2/plate.jpg', 'size': [W, H], 'frame_scale_at_z1': round(1080 / W, 6)},
         'screen': {'quad': [[round(float(x), 2), round(float(y), 2)] for x, y in q], 'order': 'TL, TR, BR, BL (plate px)',
                    'quad_draw': [[round(float(x), 2), round(float(y), 2)] for x, y in expand_quad(q, 2.0)],
                    'note': 'quad = the white/frame transition (50 %); draw the slide into quad_draw (2 px out) so no '
                            'white rim of the original screen shows',
                    'w': round(float(np.linalg.norm(q[1] - q[0])), 1), 'h': round(float(np.linalg.norm(q[3] - q[0])), 1),
                    'aspect': round(float(np.linalg.norm(q[1] - q[0]) / np.linalg.norm(q[3] - q[0])), 4)},
         'fg': {'file': 'src/footage/h2/fg.png', 'box': box, 'note': 'draw at (box[0], box[1]) in plate px, over the slide'},
         'matte': {'file': 'src/footage/h2/matte.png'},
         'parallax': 'none: a separate front-rows layer was built and tested (26 Nov) and dropped: with the wall '
                     'inpainted behind the heads, a 3 % parallax showed doubled stage edges and head ghosts. The push-in is '
                     'one plane (plate + slide + fg.png), which is clean at any zoom up to ~1.4x.'}
    json.dump(J, open(os.path.join(OUT, 'screen.json'), 'w'), ensure_ascii=False, indent=1)
    print('plate', W, H, 'screen quad', J['screen']['quad'], 'aspect', J['screen']['aspect'], 'fg box', box)
    if len(sys.argv) > 1: check(im, q, a, box, sys.argv[1])


def check(im, q, a, box, path):
    """test comp: a sample slide warped onto the screen, the presenter's hand on top"""
    s = cv2.cvtColor(cv2.imread(os.path.join(os.path.dirname(SRC), 'samples', 'deck-uni-01-title.png')), cv2.COLOR_BGR2RGB)
    h, w = s.shape[:2]
    M = cv2.getPerspectiveTransform(np.float32([[0, 0], [w, 0], [w, h], [0, h]]), np.float32(expand_quad(q, 2.0)))
    H, W = im.shape[:2]
    warped = cv2.warpPerspective(s, M, (W, H), flags=cv2.INTER_AREA)
    inside = cv2.warpPerspective(np.ones((h, w), np.float32), M, (W, H))
    comp = im.astype(np.float32) * (1 - inside[..., None]) + warped.astype(np.float32) * inside[..., None]
    comp = comp * (1 - a[..., None]) + decontaminate(im, a).astype(np.float32) * a[..., None]
    out = cv2.cvtColor(np.clip(comp, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR)
    det = out[1150:1550, 1050:1512]
    cv2.imwrite(path, np.hstack([cv2.resize(out, (540, 960)), cv2.resize(det, (int(462 * 960 / 400), 960))]))
    print('check comp', path)


if __name__ == '__main__':
    main()
