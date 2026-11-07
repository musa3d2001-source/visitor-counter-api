"""BTS reel «من الفكرة للإعلان» — original score and foley (TASH engine, no samples).

Picture: sketch → wire → clay → final (the LAYL S3 orbit) → the real LAYL ending (10.50–15.90 of the ad).
The process half (0–7.67 s) is composed here in LAYL's own key and tempo (Hijaz on D, 80 BPM, grid offset 5 frames),
quiet and tactile: pencil on paper, three scan sweeps, a clay knock, a glass ping when the light arrives.
Silence for 0.25 s, then the hand-off: the ad's own pre-master (its S6 impact, groove, end card, lights-out and the
TASH sonic logo) continues from 10.50 s, so the sting audio stays exactly on its picture.
Run:  python3 08-instagram/src/bts/audio.py   →  08-instagram/src/bts/audio.wav
"""
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
TASH = os.path.abspath(os.path.join(HERE, '../../..'))
sys.path.insert(0, os.path.join(TASH, '_system/audio'))
from tashaudio import *  # noqa
from scipy.io import wavfile as wf

seed(505)
C = json.load(open(os.path.join(HERE, 'cues.json')))
DUR, BEAT, OFF, HIT = C['duration'], C['beat'], C['gridOffset'], C['hit']
B = lambda k: OFF + k * BEAT            # beat k on the shared grid (B(10) == HIT)
SW = {s['to']: s for s in C['sweeps']}
TXT = {b['id']: b for b in C['text']}
m = Mix(DUR, tail=0.5)
R = np.random.default_rng(7)


def oud(note, t, vel=1.0, d=1.8, pan=0.0, trem=False, bright=0.40):
    f = nf(note)
    m.add(lp(pluck(f, d, bright=bright, decay=0.9958), 3800) * 0.6 * vel, t, pan=pan, bus='oud')
    if trem: m.add(lp(pluck(f, d * 0.8, bright=bright * 0.8, decay=0.995), 3200) * 0.27 * vel, t + 0.095, pan=pan * 0.8, bus='oud')


def pencil(t0, d, gain=1.0, pan=0.0, seed_=1):
    """Graphite on paper: band-passed noise whose level flutters with the hand (seeded, so every build is identical)."""
    r = np.random.default_rng(seed_); N = n_(d)
    x = bp(noise(d, 'white'), 1700, 7500, order=2)
    flutter = np.interp(np.arange(N), np.linspace(0, N, max(4, int(d * 38))), 0.35 + 0.65 * r.random(max(4, int(d * 38))))
    strokes = np.interp(np.arange(N), np.linspace(0, N, max(3, int(d * 6))), 0.45 + 0.55 * r.random(max(3, int(d * 6))))
    env = np.clip(np.arange(N) / n_(0.06), 0, 1) * np.clip((N - np.arange(N)) / n_(0.12), 0, 1)
    y = peak_eq(x * flutter * strokes * env, 3500, -3.0, 1.2)
    m.add(fade(y, 0.005, 0.03) * 0.11 * gain, t0, pan=pan, bus='foley')


def scan(t0, d):
    """The scan line crossing the frame right → left: a light filtered sweep, panned with the line."""
    m.add(whoosh(d, f_lo=900, f_hi=5200, q=3.0, pan_from=0.8, pan_to=-0.8, peak=0.5) * 0.10, t0, bus='sfx')


def ping(note, t0, gain=0.07, pan=0.0, d=2.0, bright=0.45):
    m.add(lp(bell(nf(note), d, bright), 7000) * gain, t0, pan=pan, bus='glass')


# ------------------------------------------------------------------------------------------ SKETCH (0 – 1.65): pencil, a low string
m.add(pad([nf('A3'), nf('D4')], 2.2, cutoff=900, detune=0.08, attack=0.25, release=0.8) * 0.07, 0.0, bus='music')
oud('D3', 0.0, vel=0.45, d=2.4)                            # frame 0 is never silent
pencil(0.00, 0.62, 1.0, pan=0.15, seed_=11)              # the outline is already being drawn
pencil(0.20, 0.80, 0.8, pan=-0.1, seed_=12)              # bevel line + cavity
pencil(0.30, 0.66, 0.55, pan=0.05, seed_=13)             # the cap
pencil(0.80, 0.50, 0.45, pan=0.3, seed_=14)              # dimension lines (ruler-quick)
# the brand ellipsis types after «يلمع»: three ticks at the dots' first peaks, retuned to the key (D7 · Eb7 · F#7)
d0 = C['dotsIn']
for k, f in enumerate([2349.3, 2489.0, 2960.0]):
    m.add(tick(f), d0 + k * 0.12 + 0.25 * 0.72, gain=db(-1.5 * k) * 0.5, pan=[0.25, 0, -0.25][k], bus='sfx')
oud('D3', B(1), vel=0.55, pan=0.05)                      # «كان خطوط.» lands

# ------------------------------------------------------------------------------------------ WIRE (sweep 1.40 → 3.15)
s = SW['WIRE']; scan(s['at'], s['dur'])
ping('D6', B(2), gain=0.045, pan=0.2, d=1.4, bright=0.6)  # the first 3D line appears
for k, (n, v) in enumerate([('A4', 0.55), ('D5', 0.45), ('A4', 0.35)]):   # thin bright strings: the mesh
    m.add(lp(pluck(nf(n), 0.9, bright=0.75, decay=0.993), 6000) * 0.22 * v, B(2) + 0.375 * (k + 1), pan=0.2 * (-1) ** k, bus='oud')
for k in range(4):                                       # light shaker eighths: the build begins
    m.add(hp(shaker(0.09), 2500) * (0.05 - 0.008 * k), B(2) + 0.375 * k + 0.19, pan=0.3, bus='perc')
m.add(mirwas_tak() * 0.10, B(3) - 0.375, pan=0.2, bus='perc')

# ------------------------------------------------------------------------------------------ CLAY (sweep 2.90 → 5.40): form
s = SW['CLAY']; scan(s['at'], s['dur'])
knock = lp(membrane(150, 0.35, 0.06, pitch_drop=0.10, strike=0.2), 1800)   # soft clay knock (dull, no metal)
m.add(knock * 0.42, B(4), pan=0.0, bus='perc')
oud('D3', B(4), vel=0.7, d=2.2)
m.add(pad([nf('D3'), nf('A3'), nf('D4')], 2.6, cutoff=900, detune=0.09, attack=0.5, release=0.7) * 0.14, B(4) - 0.1, bus='music')
for k, (n, v, tr) in enumerate([('D4', 0.8, True), ('Eb4', 0.6, False), ('F#4', 0.85, True), ('G4', 0.65, False)]):
    oud(n, B(5) + k * 0.375, vel=v, trem=tr, pan=0.08 * (-1) ** k)            # the shape rises: Hijaz upward
for b in (5, 6):
    m.add(hp(mirwas_dum(), 70) * 0.16, B(b), pan=-0.1, bus='perc')
    m.add(mirwas_tak() * 0.10, B(b) + 0.375, pan=0.15, bus='perc')
    m.add(mirwas_tak() * 0.08, B(b) + 0.5625, pan=0.2, bus='perc')

# ------------------------------------------------------------------------------------------ FINAL (sweep 5.15 → 7.67): the light
s = SW['FINAL']; scan(s['at'], s['dur'])
ping('A6', B(7), gain=0.09, pan=0.3)
ping('D7', B(7) + 0.19, gain=0.05, pan=-0.3, bright=0.3)
m.add(shimmer(2.2, base=1174.7, n=6, seed_=21) * 0.11, B(7) - 0.05, bus='glass')
oud('A4', B(7), vel=0.95, trem=True)
m.add(pad([nf('D3'), nf('A3'), nf('D4'), nf('F#4')], 2.4, cutoff=1500, detune=0.09, attack=0.35, release=0.6) * 0.17, B(7), bus='music')
for k, (n, v, tr) in enumerate([('G4', 0.6, False), ('F#4', 0.8, True), ('Eb4', 0.6, False), ('D4', 0.9, True)]):
    oud(n, B(7) + 0.375 + k * 0.375, vel=v, trem=tr, pan=0.06)
m.add(riser(0.85, f_lo=300, f_hi=5000, tonal=True) * 0.06, HIT - 0.85, bus='sfx')

# bus colour
m.process_bus('oud', lambda x: reverb(hp(peak_eq(x, 300, 2.0, 1.0), 90, order=2), decay=2.4, mix=0.30, tone=5200))
m.process_bus('glass', lambda x: reverb(x, decay=3.0, mix=0.4, tone=8000))
m.process_bus('perc', lambda x: reverb(x, decay=1.0, mix=0.18, tone=5000))
m.process_bus('foley', lambda x: reverb(x, decay=0.5, mix=0.12, tone=7000))
m.process_bus('music', lambda x: hp(x, 150, order=2))   # pads carry colour, not weight: the weight comes with the ad

# silence before the hit: everything of ours drops away 0.25 s before the hand-off, its tails cut on air
N = len(m.buf); tt_ = np.arange(N) / SR
gate = 1 - np.clip((tt_ - (HIT - 0.42)) / 0.17, 0, 1) ** 1.6
for b in list(m.buses): m.buses[b] *= gate[:, None]
m.buf *= gate[:, None]

process = m.render(ceiling_db=-3.0, glue=True)            # our half, glued; its level is set against the ad below

# ------------------------------------------------------------------------------------------ the ad's own ending
sr, ad = wf.read(os.path.join(TASH, '05-concept-ads/01-perfume-layl/src/audio.wav'))
assert sr == SR, sr
ad = ad.astype(np.float64)
a0 = int(round(C['ad']['src'] * SR)); seg = ad[a0:a0 + n_(DUR - HIT)]
seg = seg.copy(); fi = n_(0.003); seg[:fi] *= np.linspace(0, 1, fi)[:, None]   # 3 ms in: no click at the cut
out = np.zeros((n_(DUR), 2))
out[:len(process)] += process
i0 = int(round(HIT * SR)); out[i0:i0 + len(seg)] += seg[:len(out) - i0]

# level: our sparse half sits a little under the ad (the reveal should feel like the lights coming on)
p_l, a_l = lufs(out[:i0]), lufs(out[i0:])
target_gap = 3.0
out[:i0] *= db((a_l - target_gap) - p_l)
print(f'process half {p_l:.1f} → {lufs(out[:i0]):.1f} LUFS · ad half {a_l:.1f} LUFS')

# pre-master: −14 LUFS, true peak ≤ −1.6 dBTP (the renderer's linear loudnorm then only nudges it)
fo = n_(0.30)
# (true peak −2.0: ffmpeg measures ~0.1 LU lower than tashaudio, and the renderer's loudnorm only stays LINEAR while
#  gain + true peak ≤ −1.5 dBTP; otherwise it silently switches to dynamic mode and the AAC overshoots)
for _ in range(4):
    out = out * db(-13.9 - lufs(out))
    c = -2.2
    for _ in range(6):
        y = limiter(out, c)
        over = true_peak_db(y) - (-2.0)
        if over <= 0: break
        c -= over + 0.05
    out = y
    if abs(lufs(out) + 13.9) < 0.15: break
out[-fo:] *= (np.linspace(1, 0, fo) ** 1.5)[:, None]      # the ad's own soft ending, kept at true zero
path = os.path.join(HERE, 'audio.wav')
wf.write(path, SR, out.astype(np.float32))
def bands(x):
    from scipy.signal import welch
    f, P = welch(x.mean(axis=1), SR, nperseg=8192)
    e = lambda lo, hi: 10 * np.log10(P[(f >= lo) & (f < hi)].sum() + 1e-20)
    return f'<60 {e(20,60):.1f} · 60–150 {e(60,150):.1f} · 150–2k {e(150,2000):.1f} · 2–5k {e(2000,5000):.1f} dB'
print('process half bands:', bands(out[:i0])); print('ad half bands:     ', bands(out[i0:]))
print(f'wrote {path}  {len(out) / SR:.3f}s  {lufs(out):.1f} LUFS  TP {true_peak_db(out):.1f} dBTP')
