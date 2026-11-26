#!/usr/bin/env python3
"""s6_payoff assets (scene builder D): the lecture-hall plate baked into two depth layers with card 1's slide on the
projection screen. Re-run after the samples or the plate change:
    python3 src/assets/s6_payoff/prep_s6.py            (from tash/12-students-ad/)
Reads src/footage/h2/ (plate.jpg, screen.json, fg.png) and samples/deck-uni-01-title.png (read-only); writes only into
this folder. Everything is in PLATE px (1512 x 2688, 1.4x the frame), the space the scene's camera works in.

Compositing is done here, in linear light, so the browser only moves layers:
  room.jpg    the room: plate + the slide on the screen (projected look: lifted blacks, a soft hot spot, a hair of
              softness) + the presenter's hand back on top (fg.png) + the two audience phones showing the slide in
              their viewfinders + the screen's light on the front rows (warm rim spill, phone glows); the near rows are
              filled in behind (inpainted) so the near layer can move over it without ghosting.
  near.png    the near rows (the three blurred heads closest to the camera and the seat backs) as a soft-matted RGBA
              crop, drawn with a slightly faster camera: the parallax of the push-in.
  glow.jpg    half-resolution bloom of the screen (and the phones), drawn over the room with mix-blend-mode: screen;
              its opacity swells on the chord.
  grain.png   a film-grain tile.
  s6.json     boxes and the screen/phone geometry for the scene.
"""
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
SRC = HERE.parents[1]
H2 = SRC / 'footage' / 'h2'
SAMPLES = SRC.parent / 'samples'
SLIDE = 'deck-uni-01-title'
# (fix round, 26 Nov) the room is MIRRORED left-right (it has no text): the presenter, the scene's only human anchor,
# then stands at the frame's LEFT edge (x ≈ 20–170) instead of under the TikTok/Reels button column on the right. The
# plate, the hand matte, the near-rows outline and the phone quads are mirrored; the slide is comped un-mirrored.
MIRROR = True

# near-layer outline (plate px), traced on a brightened, gridded crop of the plate: the left near head and its body,
# the centre near head (long hair, warm rim), the right near shoulder/head, and the seat backs along the bottom.
NEAR = [(0, 1622), (45, 1634), (112, 1672), (165, 1736), (200, 1830), (212, 1930), (204, 2035), (180, 2104),
        (236, 2134), (304, 2172), (356, 2232), (388, 2314), (404, 2396), (420, 2412), (428, 2345), (440, 2245),
        (458, 2145), (488, 2045), (536, 1962), (606, 1902), (676, 1876), (738, 1866), (800, 1876), (865, 1910),
        (925, 1966), (975, 2040), (1020, 2125), (1052, 2210), (1078, 2300), (1098, 2400), (1112, 2418), (1132, 2300),
        (1152, 2190), (1192, 2124), (1262, 2074), (1342, 2042), (1410, 2002), (1440, 1952), (1446, 1850),
        (1442, 1758), (1462, 1694), (1512, 1672), (1512, 2688), (0, 2688)]
NEAR_FEATHER = 9.0           # px (gaussian sigma) — the near rows are far out of focus, so a soft edge is right
NEAR_TOP = 1600              # the near.png crop starts here

# the two audience phones: the display area of each screen (TL, TR, BR, BL), measured on 6x zoomed crops
PHONES = {
    'left': [(320.5, 1688.0), (362.0, 1688.5), (361.5, 1767.0), (320.0, 1766.5)],
    'right': [(1294.0, 1667.0), (1340.0, 1667.0), (1340.0, 1727.0), (1294.5, 1727.0)],
}


def lin(a):
    a = a / 255.0
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * x ** (1 / 2.4) - 0.055) * 255.0


def warp(img, quad, size, src_wh=None):
    h, w = img.shape[:2]
    sw, sh = src_wh or (w, h)
    M = cv2.getPerspectiveTransform(np.float32([[0, 0], [sw, 0], [sw, sh], [0, sh]]), np.float32(quad))
    return cv2.warpPerspective(img, M, size, flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=0)


def projected(slide_lin, w, h):
    """the projector look: blacks lifted to the screen's ambient level, a soft centre hot spot, a hair of softness"""
    yy, xx = np.mgrid[0:h, 0:w]
    r2 = ((xx - w * 0.52) / (w * 0.62)) ** 2 + ((yy - h * 0.46) / (h * 0.75)) ** 2
    hot = 1.06 - 0.20 * np.clip(r2, 0, 1.6)
    out = slide_lin * 0.93 * hot[..., None] + np.array([0.0062, 0.0055, 0.0052])
    out = cv2.GaussianBlur(out, (0, 0), 0.55)
    return out


def mirror_quad(q, PW):
    """a TL, TR, BR, BL quad mirrored left-right (still TL, TR, BR, BL)"""
    m = [[PW - x, y] for x, y in q]
    return [m[1], m[0], m[3], m[2]]


def main():
    global NEAR, PHONES
    J = json.loads((H2 / 'screen.json').read_text())
    plate8 = np.asarray(Image.open(H2 / 'plate.jpg').convert('RGB')).astype(np.float32)
    PH, PW = plate8.shape[:2]
    fg_img = Image.open(H2 / 'fg.png').convert('RGBA')
    if MIRROR:
        plate8 = plate8[:, ::-1].copy()
        J['screen']['quad_draw'] = mirror_quad(J['screen']['quad_draw'], PW)
        fg_img = fg_img.transpose(Image.FLIP_LEFT_RIGHT)
        J['fg']['box'][0] = PW - J['fg']['box'][0] - fg_img.width
        NEAR = [(PW - x, y) for x, y in NEAR]
        PHONES = {'left': mirror_quad(PHONES['right'], PW), 'right': mirror_quad(PHONES['left'], PW)}
    P = lin(plate8).astype(np.float32)

    # ---------------------------------------------------------------- the slide on the screen
    quad = J['screen']['quad_draw']
    qw = int(round(max(quad[1][0] - quad[0][0], quad[2][0] - quad[3][0]))) + 4
    qh = int(round(max(quad[3][1] - quad[0][1], quad[2][1] - quad[1][1]))) + 4
    slide8 = Image.open(SAMPLES / f'{SLIDE}.png').convert('RGB').resize((qw, qh), Image.LANCZOS)
    S = projected(lin(np.asarray(slide8).astype(np.float32)).astype(np.float32), qw, qh).astype(np.float32)
    Sw = warp(S, quad, (PW, PH))
    Mw = warp(np.ones((qh, qw), np.float32), quad, (PW, PH))[..., None]
    room = P * (1 - Mw) + Sw * Mw

    # the presenter's forearm/hand/clicker back in front of the slide (decontaminated RGBA from the lead)
    fg = np.asarray(fg_img).astype(np.float32)
    bx, by = J['fg']['box'][:2]
    fa = fg[..., 3:4] / 255.0
    fl = lin(fg[..., :3])
    sl = room[by:by + fg.shape[0], bx:bx + fg.shape[1]]
    room[by:by + fg.shape[0], bx:bx + fg.shape[1]] = sl * (1 - fa) + fl * fa

    # ---------------------------------------------------------------- the phones: the slide in their viewfinders
    # a portrait viewfinder: the dim room around the screen, the projected slide across the middle
    vw, vh = 90, 170
    around = room[700:1500, 120:1390]
    vf = cv2.resize(cv2.GaussianBlur(around, (0, 0), 6), (vw, vh), interpolation=cv2.INTER_AREA) * 0.55
    sw_ = vw - 6
    sh_ = int(round(sw_ * 9 / 16))
    mini = cv2.resize(S, (sw_, sh_), interpolation=cv2.INTER_AREA) * 1.25 + 0.01
    y0 = (vh - sh_) // 2 - 6
    vf[y0:y0 + sh_, 3:3 + sw_] = mini
    phone_glow = np.zeros_like(P)
    for name, q in PHONES.items():
        Vw = warp(vf.astype(np.float32), q, (PW, PH))
        Pm = warp(np.ones((vh, vw), np.float32), q, (PW, PH))
        # keep what is in front of the screen (an out-of-focus strand of hair on the left phone): warm, saturated
        r, g, b = plate8[..., 0], plate8[..., 1], plate8[..., 2]
        hair = np.clip(((r - b) - 30) / 45.0, 0, 1)
        m = (Pm * (1 - hair))[..., None]
        room = room * (1 - m) + (room * 0.25 + Vw) * m
        phone_glow += Vw * Pm[..., None]

    # ---------------------------------------------------------------- the screen's light on the front rows
    L = (P * np.array([0.2126, 0.7152, 0.0722])).sum(2)
    hp = np.clip(L - cv2.GaussianBlur(L, (0, 0), 5), 0, None)          # rims and edges that already catch light
    yy, xx = np.mgrid[0:PH, 0:PW].astype(np.float32)
    # falloff from the screen's bottom edge into the rows (strong on the first rows, gentle on the near ones)
    fall = np.clip((yy - 1420) / 120, 0, 1) * np.exp(-np.clip(yy - 1560, 0, None) / 520)
    fall *= np.exp(-((xx - (PW - 760 if MIRROR else 760)) / 900) ** 2)
    warm = np.array([1.0, 0.56, 0.26], np.float32)                     # the slide's orange, through warm room air
    spill = (hp * 2.6 * fall)[..., None] * warm
    # a broad, very soft lift on the heads facing the screen
    broad = (cv2.GaussianBlur(L, (0, 0), 14) * 0.10 * fall)[..., None] * np.array([1.0, 0.72, 0.5], np.float32)
    room = room + spill + broad
    # the phones light the hands holding them
    pg = cv2.GaussianBlur(phone_glow, (0, 0), 7) * 0.9
    room = room + pg * np.array([1.0, 0.9, 0.85], np.float32)

    # ---------------------------------------------------------------- depth: near rows vs the room
    mpoly = np.zeros((PH, PW), np.float32)
    cv2.fillPoly(mpoly, [np.int32(np.round(np.array(NEAR) * 4))], 1.0, lineType=cv2.LINE_AA, shift=2)
    matte = cv2.GaussianBlur(mpoly, (0, 0), NEAR_FEATHER)
    matte[mpoly > 0.5] = np.maximum(matte[mpoly > 0.5], 0)  # keep the feather symmetric around the line
    # the room behind the near rows. Only a thin band above each near head is ever uncovered (the near layer grows
    # outward from the frame centre, so the heads move DOWN over the room), so the fill continues the room straight
    # down from just above the matte (vertical extrusion), softened, and sinks into the dark seat tone further in.
    # (Telea inpainting was tried: it smeared the lit seat tops into bright rays.)
    room8 = np.clip(srgb(room), 0, 255).astype(np.uint8)
    grow = cv2.dilate((matte > 0.02).astype(np.uint8), np.ones((7, 7), np.uint8)).astype(bool)
    src_rows = np.where(~grow, np.arange(PH)[:, None], -1)
    last = np.maximum.accumulate(src_rows, axis=0)                     # last unmasked row above, per column
    last = np.clip(last, 0, PH - 1)
    above = cv2.GaussianBlur(room8.astype(np.float32), (0, 0), 2.5)
    fill = above[last, np.arange(PW)[None, :]]
    depth = (np.arange(PH)[:, None] - last).astype(np.float32)
    dark = cv2.GaussianBlur(above, (0, 0), 40) * 0.55
    k = np.exp(-depth / 45.0)[..., None]
    fill = fill * k + dark * (1 - k)
    fill = cv2.GaussianBlur(fill, (0, 0), 3.0)
    g = cv2.GaussianBlur(grow.astype(np.float32), (0, 0), 2)[..., None]
    room_bg8 = room8.astype(np.float32) * (1 - g) + fill * g
    Image.fromarray(np.clip(room_bg8, 0, 255).astype(np.uint8)).save(HERE / 'room.jpg', quality=93, subsampling=0)

    near = np.dstack([room8[NEAR_TOP:], np.clip(matte[NEAR_TOP:] * 255, 0, 255)]).astype(np.uint8)
    Image.fromarray(near, 'RGBA').save(HERE / 'near.png', optimize=True)

    # ---------------------------------------------------------------- bloom (half res)
    src = Sw * Mw
    bloom = cv2.GaussianBlur(src, (0, 0), 10) * 0.30 + cv2.GaussianBlur(src, (0, 0), 34) * 0.42 + \
        cv2.GaussianBlur(src, (0, 0), 110) * 0.34 + cv2.GaussianBlur(phone_glow, (0, 0), 16) * 0.8
    # do not bloom over the screen itself (it would just wash the slide out); keep the halo and the rows
    bloom *= (1 - 0.82 * Mw)
    gl = cv2.resize(np.clip(srgb(bloom), 0, 255).astype(np.uint8), (PW // 2, PH // 2), interpolation=cv2.INTER_AREA)
    Image.fromarray(gl).save(HERE / 'glow.jpg', quality=92)

    # film grain tile (256 px, mid-grey, overlay-blended very lightly by the scene)
    rng = np.random.default_rng(11)
    gr = ndimage.gaussian_filter(rng.normal(0, 1, (256, 256)), 0.6, mode='wrap')
    gr = np.clip(128 + (gr - gr.mean()) / gr.std() * 26, 0, 255).astype(np.uint8)
    Image.fromarray(gr, 'L').save(HERE / 'grain.png', optimize=True)

    meta = {
        '_note': 'plate px; room.jpg and glow.jpg (half res) cover the plate; near.png starts at y = near_top',
        'plate': [PW, PH], 'near_top': NEAR_TOP, 'screen_quad': quad, 'phones': PHONES, 'slide': SLIDE, 'mirrored': MIRROR,
    }
    (HERE / 's6.json').write_text(json.dumps(meta, indent=1))
    print('ok', room8.shape, 'near', near.shape)


if __name__ == '__main__':
    main()
