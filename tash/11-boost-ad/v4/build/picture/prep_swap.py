"""TASH boost ad v4, world swap: prepare every footage frame the film uses from the earlier TASH works (0 credits).
Plan: v4/swap/director-plan.json (wins on details). Layout per use: swap_manifest.json (same folder).
Every fix is baked in, so the generator only places the frames (scale, source point, dy): no shift, fill or paint-out is left to it.

usage: python3 -I prep_swap.py <out dir> [--kunafa <dir with k0030-k0072.png>] [--layl-clean <dir>] [--only hp,hu,...]
  --kunafa      copy the current kunafa frames (prep_all.py output, kept exactly as they are) so the sweet can run both ways
  --layl-clean  folder of LAYL film frames re-rendered from src with the plinth label hidden (layl_nolabel.mjs, about 3.5 s a
                frame); missing frames are rendered into it first. Without it the label is painted out in code (fallback).

Output: 1080x1920 RGB PNGs <prefix><NNNN>.png, NNNN = native frame index of the source clip (LAYL: film frame number).
  hp  HABBA k3_pour ROTATED 180 deg, cover 1084x1920 crop 2 px a side: n28-n120            opener, return, hold, porthole (n82-n107), Coffee B lens, loop (n28-n39 play into f0)
  hu  HABBA k3_pour unrotated n45-n92 (cup centre about (519,661))                            coffee CTA band
  hb  HABBA k4_beans n95-n113; the middle bean that sinks into the table in n103-n113 is held from n102   iris f131-134, Coffee A
  ls  LAYL film f180-230 (S4 spray) drawn 400 px lower; rows above are a smooth fill of the frame's own top rows, dithered     Oud A, Oud B
  lb  LAYL film f315-344 (S6 bottle), unshifted, plinth label and its floor reflection removed   Oud C lens, right porthole, perfume band
  sa  STAKK b7_crown n0-n9 drawn 100 px lower, top rows from n0 (40 px feather)                Burger A (n10-n12 dropped)
  sb  STAKK b7_crown n19-n33 drawn 250 px lower, rows 0-480 from n0 (80 px feather)           Burger B (punch-in)
  su  STAKK b7_crown n4-n48 unshifted (never n18)                                               left porthole, burger band
  sl  STAKK b7_crown n34-n48 shrunk x958/1080 about (540,1112), red backdrop continued sideways  Burger C lens (lens scale 0.62 = 0.55 effective)
  lp  LAYL f315-344 bottle (as lb) shrunk 0.8 into a 1080x1920 canvas, cap at y 1075, edges continued   9:16 perfume CTA band
  sd  STAKK b7 n4-n17, n19-n33 shrunk 0.6 into a 1080x1920 canvas, settled bun top at y 1075, margins from n30   9:16 burger CTA band
  se  the same at 0.5, bun top at y 815                                                       4:5 burger CTA band
  lq  LAYL bottle (as lp) at 0.65, cap at y 815                                               4:5 perfume CTA band
  dc  DOSE d4_cake n0-n35 unshifted (the plan shows only n2-n31)                                sweet (owner's yes, 10 Nov: «كيكة دوز خوش»)
  k   kunafa k0030-k0072 copied unchanged from --kunafa                                         sweet, kunafa option
Grade: k3 (hp, hu) and b7 (sa, sb, su) get the plan's small mid-tone lift (LIFT below); nothing else is graded.
Colour: every clip is decoded the way its own project did: BT.709 matrix, tv range in, full-range RGB out
(scale=...:in_color_matrix=bt709:in_range=tv:out_range=pc); the 1080x1912 Kling clips are cover-fitted exactly as HABBA's and
DOSE's conform (scale 1084x1920 lanczos, crop 2 px a side). No JPEG anywhere: rawvideo pipe in, PNG out.
"""
import sys, os, json, shutil, subprocess, hashlib
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
TASH = os.path.normpath(os.path.join(HERE, '..', '..', '..', '..'))
CLIP = {
    'k3': os.path.join(TASH, '05-concept-ads/03-coffee-habba/footage/ai/k3_pour.mp4'),     # tagged BT.709 tv
    'k4': os.path.join(TASH, '05-concept-ads/03-coffee-habba/footage/ai/k4_beans.mp4'),    # untagged: BT.709 as HABBA's conform.py
    'b7': os.path.join(TASH, '05-concept-ads/02-burger-stakk/footage/ai/b7_crown.mp4'),    # tagged BT.709 tv
    'd4': os.path.join(TASH, '10-spec-dose/footage/ai/d4_cake.mp4'),                       # untagged: BT.709 as DOSE's common.py
    'layl': os.path.join(TASH, '05-concept-ads/01-perfume-layl/LAYL-concept-9x16.mp4'),    # 1080x1920 30 fps, tagged BT.709 tv
}
W, H = 1080, 1920
# Mid-tone lift the plan names (director-plan.json, risks): k3 "lift about +0.04 in the grade", b7 "small lift". Per channel
# x + k*x*(1-x) on 0..1: black and white points stay; +0.04 to +0.045 (k3) and +0.03 (b7) on the composed frame's mean Y'.
# Same k on every frame of a clip, so full frames, lens, portholes and band match. LAYL (deliberate night beat), k4 and d4
# (already over Y' 0.40) are not lifted. Set a value to 0 to switch it off.
LIFT = {'k3': 0.28, 'b7': 0.22}

A = sys.argv[1:]
if not A or A[0].startswith('--'):
    sys.exit(__doc__)
OUT = A[0]
opt = lambda k: A[A.index(k) + 1] if k in A else None
ONLY = set(opt('--only').split(',')) if opt('--only') else {'hp', 'hu', 'hb', 'ls', 'lb', 'lp', 'lq', 'sa', 'sb', 'su', 'sl', 'sd', 'se', 'dc', 'k'}
os.makedirs(OUT, exist_ok=True)
LOG = {}


def decode(clip, a, b):
    """native frames a..b (inclusive) as uint8 RGB HxW arrays, keyed by frame index"""
    src = CLIP[clip]
    if clip == 'layl':
        geo = f'scale={W}:{H}:flags=lanczos+accurate_rnd+full_chroma_int:in_color_matrix=bt709:in_range=tv:out_range=pc'
    else:
        geo = f'scale={W + 4}:{H}:flags=lanczos+accurate_rnd+full_chroma_int:in_color_matrix=bt709:in_range=tv:out_range=pc,crop={W}:{H}:2:0'
    vf = f"select='between(n\\,{a}\\,{b})',{geo},format=rgb24"
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-an', '-vf', vf, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'],
                         stdout=subprocess.PIPE, check=True).stdout
    n = len(raw) // (W * H * 3)
    if n != b - a + 1:
        raise SystemExit(f'{clip}: asked for n{a}-n{b}, decoded {n} frames')
    arr = np.frombuffer(raw, np.uint8).reshape(n, H, W, 3)
    return {a + i: arr[i] for i in range(n)}


def lift(a, k):
    if not k: return a
    x = np.asarray(a, np.float64) / 255
    return (x + k * x * (1 - x)) * 255


def save(prefix, n, a):
    p = os.path.join(OUT, f'{prefix}{n:04d}.png')
    Image.fromarray(np.clip(np.asarray(a, np.float64) + 0.5, 0, 255).astype(np.uint8) if a.dtype != np.uint8 else a).save(p)
    LOG.setdefault(prefix, []).append(n)


def shift_down(a, dy, plate, feather, cover=None):
    """frame drawn dy px lower; the top `cover` rows (default dy) come from `plate` (same size, unshifted); the seam is a
    linear feather over `feather` rows below that (plate fading into the shifted frame)"""
    a = a.astype(np.float64); plate = plate.astype(np.float64); c = cover or dy
    o = np.empty_like(a); o[dy:] = a[:H - dy]; o[:c] = plate[:c]
    if feather:
        t = ((np.arange(feather) + 1) / (feather + 1))[:, None, None]
        o[c:c + feather] = o[c:c + feather] * t + plate[c:c + feather] * (1 - t)
    return o


def shrink_into(a, k, sx, sy, ax, ay, seed, ref=None):
    """the frame scaled by k so that its source point (sx,sy) lands on (ax,ay) of a 1080x1920 canvas; the uncovered canvas is the
    frame's own edge rows / columns continued (per row / column, smoothed along the edge, dithered): CTA bands that keep the whole
    product above the app's caption rows (final review CC1). ref = a clean frame of the same shot: the margins are taken from it
    for every frame, so a highlight passing the frame edge cannot streak across the margin (delivery check OE-2)"""
    rng = np.random.default_rng(seed); a = np.asarray(a, np.float64)
    w, h = round(W * k), round(H * k); x0, y0 = round(ax - sx * k), round(ay - sy * k)
    s = np.stack([np.asarray(Image.fromarray(np.ascontiguousarray(a[..., c]).astype(np.float32)).resize((w, h), Image.LANCZOS)) for c in range(3)], -1).astype(np.float64)
    o = np.zeros((H, W, 3)); X0, Y0, X1, Y1 = max(0, x0), max(0, y0), min(W, x0 + w), min(H, y0 + h)
    o[Y0:Y1, X0:X1] = s[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0]
    e = o
    if ref is not None:
        r = np.asarray(ref, np.float64)
        rs_ = np.stack([np.asarray(Image.fromarray(np.ascontiguousarray(r[..., c]).astype(np.float32)).resize((w, h), Image.LANCZOS)) for c in range(3)], -1).astype(np.float64)
        e = np.zeros((H, W, 3)); e[Y0:Y1, X0:X1] = rs_[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0]
    g = np.exp(-0.5 * (np.arange(-30, 31) / 10.0) ** 2); g /= g.sum()
    sm = lambda prof: np.stack([np.convolve(np.pad(prof[:, c], 30, mode='edge'), g, mode='valid') for c in range(3)], -1)
    if X0 > 0: o[Y0:Y1, :X0] = sm(e[Y0:Y1, X0:X0 + 12].mean(1))[:, None, :] + rng.normal(0, 1.0, (Y1 - Y0, X0, 3))
    if X1 < W: o[Y0:Y1, X1:] = sm(e[Y0:Y1, X1 - 12:X1].mean(1))[:, None, :] + rng.normal(0, 1.0, (Y1 - Y0, W - X1, 3))
    if Y0 > 0: o[:Y0] = sm(o[Y0:Y0 + 12].mean(0))[None] + rng.normal(0, 1.0, (Y0, W, 3))
    if Y1 < H: o[Y1:] = sm(o[Y1 - 12:Y1].mean(0))[None] + rng.normal(0, 1.0, (H - Y1, W, 3))
    return np.clip(o, 0, 255)


# ---------------- HABBA k3_pour ----------------
if {'hp', 'hu'} & ONLY:
    k3 = decode('k3', 28, 120)
    if 'hp' in ONLY:     # rotated 180 deg (barista's view): cup centre about (561,1259), pitcher enters from the bottom edge
        for n in range(28, 121):   # n28-n39 play into the loop (final review R2); n82-n107 only in the 220 px porthole (R4)
            save('hp', n, lift(np.ascontiguousarray(k3[n][::-1, ::-1]), LIFT['k3']))
    if 'hu' in ONLY:     # unrotated, for the band. Cup centre stays at (519,661): moving it 21 px to x 540 needs 21 new columns,
        for n in range(45, 93):    # and a mirrored fill showed a visible chevron in the sun bars at 100%, so the cup sits 21 px left
            save('hu', n, lift(k3[n], LIFT['k3']))
    del k3

# ---------------- HABBA k4_beans ----------------
if 'hb' in ONLY:
    # final review R1: from n103 the bean lying behind the big front-left bean sinks straight down into the table (AI morph).
    # It is held from n102: inside the region x 262-575, y 1245-1510 (8 px feather) the picture comes from n102, except where
    # the landing bean D of each frame is (its dark component at (680,1420), x >= 525, opened by 16 px so thin bridges into
    # the sinking bean drop out, dilated back 19 px, 2.5 px feather). Checked at 100% on n102-n113 (c/bean_patch3.png).
    from scipy import ndimage
    from PIL import ImageFilter
    k4 = decode('k4', 95, 113)
    luma = lambda a: 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    soft = lambda m, r: np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(np.float64) / 255
    def bean_d(a, thr=100, er=16):
        m = luma(a.astype(np.float64)) < thr; m[:1150] = False; m[:, :525] = False
        m = ndimage.binary_erosion(m, iterations=er); lab, _ = ndimage.label(m); l = lab[1420, 680]
        return ndimage.binary_dilation(lab == l, iterations=er + 3) if l else np.zeros_like(m)
    yy, xx = np.mgrid[0:H, 0:W]
    S0 = soft(((xx >= 262) & (xx <= 575) & (yy >= 1245) & (yy <= 1510)), 8)
    P = k4[102].astype(np.float64)
    for n, a in k4.items():
        if n >= 103:
            S = (S0 * (1 - soft(bean_d(a), 2.5)))[..., None]
            a = a.astype(np.float64) * (1 - S) + P * S
        save('hb', n, a)
    del k4

# ---------------- LAYL S4 spray: +400 with a smooth top ----------------
if 'ls' in ONLY:
    DY, FE = 400, 48
    rng = np.random.default_rng(20261110)
    for n, a in decode('layl', 180, 230).items():
        a = a.astype(np.float64)
        prof = a[:16].mean(axis=0)                                  # the frame's own top rows (near-black brown, vignetted at the corners)
        k = np.exp(-0.5 * (np.arange(-120, 121) / 40.0) ** 2); k /= k.sum()   # horizontal Gaussian, sigma 40 px, edge-padded
        prof = np.stack([np.convolve(np.pad(prof[:, c], 120, mode='edge'), k, mode='valid') for c in range(3)], -1)
        plate = np.broadcast_to(prof[None], a.shape).copy()
        plate[:DY + FE] += rng.normal(0, 0.55, plate[:DY + FE].shape)   # dither like the render's own grain (no 8-bit banding)
        save('ls', n, shift_down(a, DY, plate, FE))

# ---------------- LAYL S6 bottle: label and reflection off ----------------
if 'lb' in ONLY:
    clean = opt('--layl-clean')
    if clean:
        need = [f for f in range(315, 345) if not os.path.exists(os.path.join(clean, f'{f:04d}.png'))]
        if need:
            subprocess.run(['node', os.path.join(HERE, 'layl_nolabel.mjs'), clean, str(need[0]), str(need[-1])], check=True)
        film = decode('layl', 315, 344)
        for n in range(315, 345):
            a = np.asarray(Image.open(os.path.join(clean, f'{n:04d}.png')).convert('RGB'))
            # guard: the re-render must be the film's own picture outside the label and the end card
            m = np.ones((H, W), bool); m[1405:1580, 470:600] = False; m[380:600] = False
            d = float(np.abs(a.astype(np.float64) - film[n]).mean(2)[m].mean())
            if d > 2.0:
                raise SystemExit(f'LAYL re-render f{n} differs from the film by {d:.2f}/255 outside the label')
            LOG.setdefault('lb_check', {})[n] = round(d, 3)
            save('lb', n, a)
        LOG['lb_method'] = 're-render from src, label hidden (layl_nolabel.mjs)'
    else:                # fallback: the director's row-wise lerp across the label (x 478-590) and its reflection
        for n, a in decode('layl', 315, 344).items():
            a = a.astype(np.float64).copy()
            for y0, y1 in ((1410, 1490), (1494, 1570)):
                l, r = a[y0:y1, 474][:, None], a[y0:y1, 594][:, None]
                t = ((np.arange(478, 591) - 474) / (594 - 474))[None, :, None]
                a[y0:y1, 478:591] = l * (1 - t) + r * t
            save('lb', n, a)
        LOG['lb_method'] = 'paint-out (row-wise lerp)'

# ---------------- LAYL bottle for the 9:16 CTA band: 0.8 with the cap just under the panel (final review CC1) ----------------
if 'lp' in ONLY:
    for n in range(315, 345):
        a = np.asarray(Image.open(os.path.join(OUT, f'lb{n:04d}.png')).convert('RGB'))   # the prepared lb frame (label already off)
        save('lp', n, shrink_into(a, 0.8, 540, 827, 540, 1075, 20261112 + n))
if 'lq' in ONLY:     # 4:5 perfume band (delivery check OE-6): 0.65, cap at y 815 on the canvas, so the whole bottle sits in the 550 px band
    for n in range(315, 345):
        a = np.asarray(Image.open(os.path.join(OUT, f'lb{n:04d}.png')).convert('RGB'))
        save('lq', n, shrink_into(a, 0.65, 540, 827, 540, 815, 20261114 + n))

# ---------------- STAKK b7_crown ----------------
if {'sa', 'sb', 'su', 'sl', 'sd', 'se'} & ONLY:
    b7 = decode('b7', 0, 48)
    if 'sa' in ONLY:     # Burger A: +100, top rows from n0. Only n0-n9: in n10-n12 the falling crown is a flat blurred bar cut
        for n in range(0, 10):     # straight at y 100 (checked at 100%), so the plan's fallback is taken: hold n0 longer, end on n9
            save('sa', n, lift(shift_down(b7[n], 100, b7[0], 40), LIFT['b7']))
    if 'sb' in ONLY:     # Burger B: +250 before the 1.2x punch-in about (540,900); bun top lands about y 860-868.
        for n in range(19, 34):    # A white smear left by the falling crown sits in source rows 0-230 (n13-n23): rows 0-480 come
            save('sb', n, lift(shift_down(b7[n], 250, b7[0], 80, cover=480), LIFT['b7']))   # from n0's clean red (80 px feather); the bun is below y 850
    if 'su' in ONLY:     # left porthole n19-n48, band n4-n17 + n19-n34 (the lens uses sl below); n18 (ghost bun) is never prepared
        for n in list(range(4, 18)) + list(range(19, 49)):
            save('su', n, lift(b7[n], LIFT['b7']))
    if 'sl' in ONLY:     # Burger C lens (checker fix): the burger spans source x 25-1040, so at the lens scale that keeps it inside
        # the rim (0.55) the 1080 px frame is narrower than the lens and Lime showed at both sides. Shrink by 958/1080 about
        # (540,1112) and continue the red backdrop sideways (per row: mean of the 12 outer columns, which are backdrop only,
        # smoothed vertically, dithered); the lens then runs at 0.62 (= 0.55 effective) and the frame covers the whole lens.
        SW, SHh, OX, OY, EC = 958, 1703, 61, 126, 12
        rng = np.random.default_rng(20261111)
        g = np.exp(-0.5 * (np.arange(-30, 31) / 10.0) ** 2); g /= g.sum()
        for n in range(34, 49):
            a = lift(b7[n], LIFT['b7'])
            s = np.stack([np.asarray(Image.fromarray(np.ascontiguousarray(a[..., c]).astype(np.float32)).resize((SW, SHh), Image.LANCZOS)) for c in range(3)], -1).astype(np.float64)
            o = np.empty((H, W, 3)); o[OY:OY + SHh, OX:OX + SW] = s
            for x0, x1, e0, e1 in ((0, OX, OX, OX + EC), (OX + SW, W, OX + SW - EC, OX + SW)):
                prof = o[OY:OY + SHh, e0:e1].mean(1)                                  # per-row backdrop colour at that edge
                prof = np.stack([np.convolve(np.pad(prof[:, c], 30, mode='edge'), g, mode='valid') for c in range(3)], -1)
                o[OY:OY + SHh, x0:x1] = prof[:, None, :] + rng.normal(0, 1.0, (SHh, x1 - x0, 3))
            o[:OY] = o[OY]; o[OY + SHh:] = o[OY + SHh - 1]                              # rows outside the lens: edge rows
            save('sl', n, np.clip(o, 0, 255))
    if 'sd' in ONLY:     # burger CTA band (9:16): 0.6, settled bun top (source y 623) at y 1075; the crown falls behind the panel
        for n in list(range(4, 18)) + list(range(19, 34)):
            save('sd', n, shrink_into(lift(b7[n], LIFT['b7']), 0.6, 540, 623, 540, 1075, 20261113 + n, ref=lift(b7[30], LIFT['b7'])))
    if 'se' in ONLY:     # 4:5 burger band (delivery check OE-6): 0.5, settled bun top at y 815, margins from n30
        for n in list(range(4, 18)) + list(range(19, 34)):
            save('se', n, shrink_into(lift(b7[n], LIFT['b7']), 0.5, 540, 623, 540, 815, 20261115 + n, ref=lift(b7[30], LIFT['b7'])))
    del b7

# ---------------- DOSE d4_cake ----------------
if 'dc' in ONLY:
    for n, a in decode('d4', 0, 35).items():
        save('dc', n, a)

# ---------------- kunafa (current, unchanged) ----------------
if 'k' in ONLY and opt('--kunafa'):
    for n in range(30, 73):
        s = os.path.join(opt('--kunafa'), f'k{n:04d}.png'); d = os.path.join(OUT, f'k{n:04d}.png')
        shutil.copyfile(s, d)
        if hashlib.md5(open(s, 'rb').read()).digest() != hashlib.md5(open(d, 'rb').read()).digest():
            raise SystemExit('kunafa copy differs: ' + s)
        LOG.setdefault('k', []).append(n)

summary = {k: (f'{len(v)} frames n{min(v)}-n{max(v)}' if isinstance(v, list) else v) for k, v in LOG.items()}
print(json.dumps(summary, indent=1))
print('prepared', len([f for f in os.listdir(OUT) if f.endswith('.png')]), 'frames in', OUT)
