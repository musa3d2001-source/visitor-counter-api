"""TASH boost ad v4, world swap: prepare every footage frame the film uses from the earlier TASH works (0 credits).
Plan: v4/swap/director-plan.json (wins on details). Layout per use: swap_manifest.json (same folder).
Every fix is baked in, so the generator only places the frames (scale, source point, dy): no shift, fill or paint-out is left to it.

usage: python3 -I prep_swap.py <out dir> [--kunafa <dir with k0030-k0072.png>] [--layl-clean <dir>] [--only hp,hu,...]
  --kunafa      copy the current kunafa frames (prep_all.py output, kept exactly as they are) so the sweet can run both ways
  --layl-clean  folder of LAYL film frames re-rendered from src with the plinth label hidden (layl_nolabel.mjs, about 3.5 s a
                frame); missing frames are rendered into it first. Without it the label is painted out in code (fallback).

Output: 1080x1920 RGB PNGs <prefix><NNNN>.png, NNNN = native frame index of the source clip (LAYL: film frame number).
  hp  HABBA k3_pour ROTATED 180 deg, cover 1084x1920 crop 2 px a side: n40-n81, n106-n120   opener, return, hold, porthole, Coffee B lens, loop
  hu  HABBA k3_pour unrotated n45-n92 (cup centre about (519,661))                            coffee CTA band
  hb  HABBA k4_beans n95-n113                                                                  iris f131-134, Coffee A
  ls  LAYL film f180-230 (S4 spray) drawn 400 px lower; rows above are a smooth fill of the frame's own top rows, dithered     Oud A, Oud B
  lb  LAYL film f315-344 (S6 bottle), unshifted, plinth label and its floor reflection removed   Oud C lens, right porthole, perfume band
  sa  STAKK b7_crown n0-n9 drawn 100 px lower, top rows from n0 (40 px feather)                Burger A (n10-n12 dropped)
  sb  STAKK b7_crown n19-n33 drawn 250 px lower, rows 0-480 from n0 (80 px feather)           Burger B (punch-in)
  su  STAKK b7_crown n4-n48 unshifted (never n18)                                               left porthole, burger band
  sl  STAKK b7_crown n34-n48 shrunk x958/1080 about (540,1112), red backdrop continued sideways  Burger C lens (lens scale 0.62 = 0.55 effective)
  dc  DOSE d4_cake n0-n35 unshifted (the plan shows only n2-n31)                                sweet, cake option (owner's yes needed)
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
ONLY = set(opt('--only').split(',')) if opt('--only') else {'hp', 'hu', 'hb', 'ls', 'lb', 'sa', 'sb', 'su', 'sl', 'dc', 'k'}
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


# ---------------- HABBA k3_pour ----------------
if {'hp', 'hu'} & ONLY:
    k3 = decode('k3', 40, 120)
    if 'hp' in ONLY:     # rotated 180 deg (barista's view): cup centre about (561,1259), pitcher enters from the bottom edge
        for n in list(range(40, 82)) + list(range(106, 121)):
            save('hp', n, lift(np.ascontiguousarray(k3[n][::-1, ::-1]), LIFT['k3']))
    if 'hu' in ONLY:     # unrotated, for the band. Cup centre stays at (519,661): moving it 21 px to x 540 needs 21 new columns,
        for n in range(45, 93):    # and a mirrored fill showed a visible chevron in the sun bars at 100%, so the cup sits 21 px left
            save('hu', n, lift(k3[n], LIFT['k3']))
    del k3

# ---------------- HABBA k4_beans ----------------
if 'hb' in ONLY:
    for n, a in decode('k4', 95, 113).items():
        save('hb', n, a)

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

# ---------------- STAKK b7_crown ----------------
if {'sa', 'sb', 'su', 'sl'} & ONLY:
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
