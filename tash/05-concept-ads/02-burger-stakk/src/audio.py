"""STAKK BURGER — concept ad soundtrack (photoreal cut: same score; only SFX timing/character changed where the picture did). Original, synthesised with the TASH engine (no samples).
120 BPM. Beat k lands at t0 + 0.5k (t0 = 0.4 s = the smash). Cue times come from cues.json (same file as the picture).
Khaleeji group claps + mirwas over a modern 808/hat groove, Hijaz-on-D pluck hook, every layer drop gets its own SFX.
Writes src/audio.wav."""
import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', '..', '_system', 'audio'))
from tashaudio import *  # noqa

C = json.load(open(os.path.join(HERE, 'cues.json')))
T0, BPM, DUR = C['t0'], C['bpm'], C['duration']
D = C['drops']; X = C['text']
g = Grid(BPM, T0)
B = 60 / BPM
seed(23)

drums = Mix(DUR, tail=2.0)   # rendered separately so we can half-time / tape-stop the music
music = Mix(DUR, tail=2.0)
sfx = Mix(DUR, tail=2.5)

STING, END = C['sting'], C['endcard']
HALF = (D['cheese'] + 0.5, C['shots'][5]['end'])       # 4.90–5.75 'على مهله' half-time
GAP = (C['shots'][8]['at'] + 0.25, D['crown'])          # 8.15–8.40 silence before the top bun


def muted(t, extra=()):
    rs = [HALF, GAP, (STING - 0.02, 99)] + list(extra)
    return any(a <= t < b for a, b in rs)


def bar_t(b, step16):
    return g.t(b, step16 * 0.25)


# ------------------------------------------------------------------ drum programme (bars 0..5 → 0.4 … 12.4)
KICK = 'x......x..x.....'
CLAP = '....x....x..x...'      # backbeat + Khaleeji push on the 'and' of 3 (3+3+2 feel)
MIRW = 'd.t..t.dt.t..t.t'      # mirwas: d = dum, t = tak
HATS = 'x.x.x.x.x.x.x.xo'
kick_s, clap_s, mir_d, mir_t = kick(), claps_ensemble(7, 0.42, seed_=5), mirwas_dum(), mirwas_tak()
hat_c, hat_o = hat(), hat(open_=True)
for b in range(0, 6):
    for i in range(16):
        t = bar_t(b, i)
        if t < C['smash'] - 1e-6 or muted(t):
            continue
        intro = t < C['shots'][2]['at']                    # lighter during the title
        drop_sec = D['crown'] <= t < END + 1.0
        if KICK[i] == 'x':
            drums.add(kick_s, t, gain=0.95 if not intro else 0.8)
        if CLAP[i] == 'x':
            drums.add(clap_s, t, gain=0.62 if drop_sec else 0.5)
        if MIRW[i] == 'd':
            drums.add(mir_d, t, gain=0.45, pan=-0.15)
        elif MIRW[i] == 't' and not intro:
            drums.add(mir_t, t, gain=0.32 + 0.08 * (i % 3 == 0), pan=0.25)
        if not intro or i % 2 == 0:
            if HATS[i] == 'x':
                drums.add(hat_c, t + 0.004 * (i % 2), gain=(0.32 if i % 4 == 0 else 0.2) * (1.15 if drop_sec else 1), pan=0.3)
            elif HATS[i] == 'o' and not intro:
                drums.add(hat_o, t, gain=0.18, pan=0.3)
        if drop_sec and i % 2 == 1:                          # 16th shaker lift in the drop
            drums.add(shaker(), t, gain=0.2, pan=-0.4)

# half-time 'on its own pace' — only a slow dum + claps on the half-time backbeat
for t in (HALF[0], HALF[0] + 0.5):
    drums.add(mirwas_dum(), t, gain=0.5)
drums.add(claps_ensemble(8, 0.5, seed_=8), HALF[0] + 0.5, gain=0.45)
# fill back in (16th taks + rising snare) into the double burst
for k in range(6):
    drums.add(mirwas_tak(), HALF[1] - 0.25 + k * B / 4 * 0.5 - 0.01, gain=0.25 + 0.06 * k, pan=0.2)
# snare roll into the top bun (7.90 → 8.15), then silence
for k in range(8):
    t = C['shots'][8]['at'] + k * (0.25 / 8)
    drums.add(snare(0.18, 220 + k * 12), t, gain=0.16 + 0.05 * k, pan=0.1)

# ------------------------------------------------------------------ 808 + harmony (Hijaz on D)
D2, Eb2, C2, A1, G1 = nf('D2'), nf('Eb2'), nf('C2'), nf('A1'), nf('G1')
BASS = [(0, D2, 0.7), (1.5, D2, 0.4), (2.5, Eb2, 0.45), (3.5, D2, 0.4)]
for b in range(0, 6):
    for beat, f, d in BASS:
        t = g.t(b, beat)
        if t < C['smash'] - 1e-6 or muted(t):
            continue
        music.add(sub808(f, d * 0.85, glide_from=f * 1.5 if beat == 0 else None), t, gain=0.5)
# half-time: one long sustained 808 + low pad
music.add(sub808(D2, 0.95, glide_from=D2 * 0.75, decay=0.5), HALF[0], gain=0.55)
music.add(pad([nf('D3'), nf('A3'), nf('Eb4')], 1.0, cutoff=1300, attack=0.15, release=0.4), HALF[0], gain=0.22)

# pluck hook (oud-ish) — Hijaz motif in the drop (8.40–10.40) and a 2-note tease under the title
HOOK = [('A4', 0), ('Bb4', 0.5), ('A4', 1.0), ('G4', 1.5), ('F#4', 2.0), ('G4', 2.25), ('A4', 2.5), ('D5', 3.0),
        ('C5', 3.5), ('Bb4', 3.75)]
for b, tr in ((4, 0), (5, -12)):
    for n, beat in HOOK:
        t = g.t(b, beat)
        if muted(t) or (b == 5 and beat > 1.6):
            continue
        f = nf(n) * (2 ** (tr / 12))
        music.add(pluck(f, 0.9, bright=0.6), t, gain=0.34, pan=-0.2)
        music.add(pluck(f * 2, 0.6, bright=0.4), t + 0.012, gain=0.08, pan=0.3)
for n, t in (('D4', X['title'][0]), ('A4', X['title'][0] + 0.375)):
    music.add(pluck(nf(n), 1.2, bright=0.5), t, gain=0.2, pan=-0.2)
# end card: big D chord pluck strum
for k, n in enumerate(['D3', 'A3', 'D4', 'F#4', 'A4']):
    music.add(pluck(nf(n), 1.4, bright=0.55), END + k * 0.018, gain=0.22, pan=-0.3 + k * 0.15)

# music stops with a tape-stop into the TASH signature
mus_buf = music.buf + drums.buf
i0, i1 = n_(END + 0.55), n_(STING)
seg = mus_buf[n_(END):i1].copy()
seg = tape_stop(seg, d=STING - (END + 0.55))
mus_buf[n_(END):i1] = seg
mus_buf[i1:] *= 0
fo = n_(0.03); mus_buf[i1 - fo:i1] *= np.linspace(1, 0, fo)[:, None]
# ECD pass: phones can't reproduce < ~100 Hz and the 808 + kick were most of the mix energy (sub band ≈ full band),
# which ate the -14 LUFS budget. Gentle -3.5 dB low shelf on the music bus only (hero impacts keep their sub).
mus_buf = mus_buf - (1 - db(-3.5)) * lp(mus_buf, 110)
mus_buf = hp(mus_buf, 32)
# sidechain: duck music under the big impacts
duck_t = [C['smash'], D['patty'], D['patty2'], D['crown'], END]
mus_buf *= duck_curve(len(mus_buf), duck_t, depth_db=-7, release=0.25)[:, None]

# ------------------------------------------------------------------ SFX (every drop lands on the grid)
# hook: griddle sizzle from frame 0, press whoosh, SMASH
sfx.add(sizzle(2.4, density=700, seed_=3), 0.0, gain=0.42)
sfx.add(whoosh(0.42, 200, 2200, pan_from=0.0, pan_to=0.0, peak=0.9), C['smash'] - 0.4, gain=0.35)
sfx.add(impact(1.6, sub_f=46, bright=1.0, space=0.25), C['smash'] - 0.003, gain=0.9)
sfx.add(sizzle(1.6, density=2600, seed_=5), C['smash'], gain=0.75)
sfx.add(claps_ensemble(9, 0.45, seed_=2), C['smash'], gain=0.55)
# title words land on 16ths (wooden 'thock', rising)
for k in range(4):
    sfx.add(mirwas_tak(), X['title'][0] + k * 0.125, gain=0.42, pan=0.15 - 0.1 * k)
    sfx.add(pop(260 + 70 * k, 520 + 120 * k, 0.06), X['title'][0] + k * 0.125, gain=0.3)
# whip pan up
sfx.add(whoosh(0.42, 300, 6500, pan_from=-0.3, pan_to=0.3, peak=0.55), C['whip'][0], gain=0.55)
# layer drops


def thud(t, f=70, gain=0.8, bright=0.4):
    sfx.add(impact(0.9, sub_f=f, bright=bright, sub_decay=0.12, space=0.12), t - 0.002, gain=gain)


def fall(t, d=0.25, gain=0.3):
    sfx.add(whoosh(d, 900, 3000, pan_from=0.1, pan_to=-0.1, peak=0.85), t - d, gain=gain)


fall(D['heel']); thud(D['heel'], 62, 0.65, 0.3); sfx.add(tabl(), D['heel'], gain=0.5)
# photoreal cut: the patty drop is a 0.5 s slow-motion fall, so its whoosh is longer
fall(D['patty'], 0.45, 0.32); thud(D['patty'], 52, 0.8, 0.6); sfx.add(sizzle(1.2, density=2200, seed_=11), D['patty'], gain=0.6)
sfx.add(sizzle(0.5, density=3000, seed_=13), C['shots'][3]['at'], gain=0.55)                    # crust macro
fall(D['cheese'], 0.2, 0.22); sfx.add(pop(180, 90, 0.14), D['cheese'], gain=0.6); thud(D['cheese'], 80, 0.4, 0.15)
sfx.add(pour(0.8, seed_=4), D['cheese'] + 0.05, gain=0.18)
sfx.add(pour(0.9, seed_=6), HALF[0] + 0.05, gain=0.16)                                                # slow melt
sfx.add(riser(0.42, 300, 7000, tonal=False), HALF[1] - 0.27, gain=0.35)
fall(D['patty2'], 0.22, 0.3); thud(D['patty2'], 50, 0.85, 0.7); sfx.add(claps_ensemble(9, 0.4, seed_=12), D['patty2'], gain=0.6)
sfx.add(sizzle(0.8, density=2400, seed_=17), D['patty2'], gain=0.5)
sfx.add(pop(200, 100, 0.12), D['cheese2'], gain=0.5); thud(D['cheese2'], 85, 0.35, 0.2)


def crunch(t, lo=1800, hi=7000, gain=0.5, seed_=1):
    r = np.random.default_rng(seed_); N = n_(0.16); x = np.zeros(N)
    for k in range(9):
        i0 = int(r.uniform(0, 0.06) * SR); b = bp(noise(0.03), lo * r.uniform(0.8, 1.2), hi) * env_exp(0.03, 0.005) * r.uniform(0.4, 1)
        x[i0:i0 + len(b)] += b[:N - i0]
    sfx.add(stereo(x * 1.2, r.uniform(-0.3, 0.3)), t, gain=gain)


crunch(D['pickles'], 1500, 6000, 0.6, 3); thud(D['pickles'], 120, 0.25, 0.4)
crunch(D['onions'], 2200, 8000, 0.55, 7); thud(D['onions'], 140, 0.22, 0.4)
# sauce (photoreal cut): a thin stream sound from the moment the sauce enters the top of the frame (cues sauceIn; S08 is one
# top-down take from 6.55, the pour enters at 7.00), a thick plop on contact on the cue, then a glossy pour into the pool
SIN = C.get('sauceIn', C['shots'][7]['at'])
sfx.add(lp(pour(D['sauce'] - SIN + 0.04, seed_=19), 2200), SIN, gain=0.2)
sfx.add(pop(300, 120, 0.13), D['sauce'], gain=0.62); thud(D['sauce'], 85, 0.32, 0.25)
sfx.add(pour(0.62, seed_=21), D['sauce'] + 0.02, gain=0.34)
# riser into the top bun, then the drop
sfx.add(riser(0.5, 200, 9000), D['crown'] - 0.5, gain=0.5)
fall(D['crown'], 0.25, 0.4)
sfx.add(impact(2.0, sub_f=44, bright=1.0, space=0.35), D['crown'] - 0.003, gain=1.0)
sfx.add(claps_ensemble(10, 0.5, seed_=14), D['crown'], gain=0.75)
sfx.add(tabl(), D['crown'], gain=0.6)
# offer + CTA
sfx.add(pop(500, 1300, 0.07), X['product'], gain=0.3)
sfx.add(pop(600, 1500, 0.08), X['price'], gain=0.45); sfx.add(bell(nf('A5'), 1.0, 0.6), X['price'], gain=0.12)
sfx.add(pop(450, 1100, 0.08), X['cta'], gain=0.4); sfx.add(tick(1800), X['cta'] + 0.5, gain=0.5)   # button press
# end card: three logo bars land, then the final hit
for k in range(3):
    sfx.add(mirwas_tak(), END + k * 0.07 + 0.12, gain=0.4)
sfx.add(impact(1.4, sub_f=50, bright=0.7, space=0.2), END - 0.003, gain=0.7)
sfx.add(claps_ensemble(9, 0.45, seed_=31), END, gain=0.5)

# ------------------------------------------------------------------ TASH signature (sonic logo, matched to createSting cues)
# the picture runs the sting from stingOffset (the cut lands on the typing bubble), so the sonic logo starts there too;
# its bubble pop (at 0.02) is re-placed on the cut and the trimmed head gets a 5 ms fade-in (no click)
STO = C.get('stingOffset', 0.0)
logo = sonic_logo()[n_(STO):]
L = n_(DUR - STING)
logo = logo[:L].copy()
logo[:n_(0.005)] *= np.linspace(0, 1, n_(0.005))[:, None]
fo = n_(0.35); logo[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 1.5

# ------------------------------------------------------------------ mix
out = Mix(DUR, tail=0.0)
out.buf = np.zeros((n_(DUR), 2))
def put(buf, gain):
    n = min(len(out.buf), len(buf)); out.buf[:n] += buf[:n] * gain
put(mus_buf, 0.78)
s = sfx.buf.copy()
fz = n_(0.12); s[n_(STING) - fz:n_(STING)] *= np.linspace(1, 0, fz)[:, None]
s[n_(STING):] *= 0                       # keep the signature clean
put(s, 0.85)
out.add(logo, STING, gain=0.95)
if STO > 0.02:
    out.add(pop(300, 700, 0.09), STING + 0.003, gain=0.4)
y = out.master(os.path.join(HERE, 'audio.wav'), ceiling_db=-1.0)
