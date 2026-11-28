"""Original sound for the animated «شغل جديد» story — composed to cues.json (one source of truth with index.html).

Arc: typing ticks over a quiet Bayati pad (the hook) → the air clears → whoosh into the dots-wipe → ONE hero hit on the
cut (impact + mirwas dum + a little glass shimmer: the new piece arrives) → three landing ticks as the dots drop into
the headline → a light Khaleeji groove at 120 BPM (mirwas, group claps, shaker, short 808) that dips while the line is
read → claps come in for the label and signature → the dots type once more (three ticks) → a soft bell resolves on D.
Run:  python3 03-templates/motion/story-new-work/audio.py   → writes audio.wav next to this file (−14 LUFS, ≤ −1.5 dBTP)
"""
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', '..', '_system', 'audio'))
from tashaudio import *  # noqa: E402,F401,F403

C = json.load(open(os.path.join(HERE, 'cues.json')))
D = C['duration']
seed(23)
r = np.random.default_rng(42)
m = Mix(D, tail=2.0)
g = Grid(C['bpm'], offset=C['groove'])          # beat 0 = the cut
beat = g.beat

# ---------------------------------------------------------------- 1 · hook: typing over a quiet pad (0 → cut)
pad_in = pad([nf('D3'), nf('A3'), nf('D4')], C['cut'] + 0.2, cutoff=900, attack=0.35, release=0.25)
m.add(pad_in, 0.0, gain=0.22, bus='music')
TICK_F = [nf('D7'), nf('E7'), nf('F7')]           # tuned to the D Bayati key of the piece
for k, t0 in enumerate(C['ticks']):
    i = k % 3
    m.add(tick(TICK_F[i] * (1 + r.uniform(-.012, .012))), t0 + r.uniform(-.004, .004), gain=0.5 * db(-1.2 * (k // 3)), pan=[0.25, 0, -0.25][i])
m.add(fade(pop(320, 760, 0.08), 0.004, 0.02), C['headlineIn'] + 0.05, gain=0.3)    # the headline lands (soft onset: no click)

# ---------------------------------------------------------------- 2 · the wipe: clear the air, whoosh, hit on the cut
gs = C['grow']['start']
m.add(riser(0.62, 300, 7000, tonal=False), C['cut'] - 0.62, gain=0.16)
m.add(whoosh(0.5, 380, 5200, pan_from=0.5, pan_to=-0.3, peak=0.82), C['cut'] - 0.43, gain=0.42)
cut = C['cut']
m.add(impact(1.6, sub_f=49, bright=0.8, sub_decay=0.2, space=0.28), cut - 0.004, gain=0.85)
m.add(mirwas_dum(), cut, gain=0.55)
m.add(shimmer(1.6, base=nf('D6'), n=6, seed_=8), cut + 0.03, gain=0.16)
# the dots fly into the headline: a short fall, then three landing ticks rising (like the sting)
m.add(downlifter(0.5), C['fly']['start'], gain=0.12)
for i, t0 in enumerate(C['lands']):
    m.add(tick([nf('A6'), nf('D7'), nf('F7')][i], 0.05), t0, gain=0.42 - 0.04 * i, pan=[0.2, 0, -0.2][i])

# ---------------------------------------------------------------- 3 · groove from the cut (120 BPM, 4/4)
n_beats = 10                                       # beats 0–9: the groove stops on the resolve (beat 9 ≈ 6.28 s)
for b in range(n_beats):
    t0 = cut + b * beat
    bar, pos = divmod(b, 4)
    if pos in (0, 2) and 0 < b < 9:                # mirwas dum on 1 & 3 (beat 0 carries the hit, beat 9 the bell)
        m.add(mirwas_dum(), t0 + r.uniform(-.005, .005), gain=0.48 if pos == 0 else 0.36, bus='music')
    if pos in (1, 3):                              # tak on the "and" before 2 and 4 + tak on the beat
        m.add(mirwas_tak(), t0 - beat / 2 + r.uniform(-.006, .006), gain=0.24, pan=0.18, bus='music')
        m.add(mirwas_tak(), t0 + r.uniform(-.006, .006), gain=0.3, pan=-0.12, bus='music')
    if pos in (1, 3) and bar >= 1:                 # Khaleeji group claps from bar 2 (label + signature)
        m.add(claps_ensemble(6, 0.38, seed_=10 + b), t0, gain=0.36, bus='music')
    for s8 in range(2):                            # shaker in 8ths, quiet, humanised
        if (b > 0 or s8 > 0) and b < 9:
            m.add(shaker(0.1), t0 + s8 * beat / 2 + r.uniform(-.006, .006), gain=0.09 * (1.0 if s8 == 0 else 0.7), pan=0.35, bus='music')
# short 808 on bar downbeats (D2), with harmonics so phones hear it
for bar_t, f in ((cut, nf('D2')), (cut + 4 * beat, nf('D2')), (cut + 6 * beat, nf('A1')), (cut + 8 * beat, nf('D2'))):
    if bar_t < D - 0.3:
        m.add(sub808(f, d=0.42, drive=2.4), bar_t, gain=0.34, bus='music')
# Bayati motif on the oud-ish pluck, bar 2 (repeated with variation, not looped)
mot = [('D4', 0), ('Ed4', 1), ('F4', 1.5), ('G4', 2), ('F4', 3), ('Ed4', 3.5), ('D4', 4), ('A3', 5), ('D4', 6)]
for name, bt in mot:
    t0 = cut + 4 * beat + bt * beat
    if t0 < D - 0.35:
        m.add(pluck(nf(name), 0.9, bright=0.5), t0 + r.uniform(-.004, .004), gain=0.3, pan=-0.15, bus='music')
m.add(pad([nf('D3'), nf('F3'), nf('A3')], D - cut, cutoff=1100, attack=0.6, release=0.4), cut + 0.1, gain=0.12, bus='music')

# the light sweep over the piece: a faint glass glint riding it (no hit — the groove carries the bar)
sw = C['sweep']
m.add(shimmer(1.3, base=nf('A6'), n=5, seed_=12), sw['start'] + sw['dur'] * 0.35, gain=0.06, pan=0.2)

# ---------------------------------------------------------------- 4 · signature + the last typing wave + resolve
m.add(whoosh(0.32, 900, 6000, pan_from=-0.2, pan_to=0.3, peak=0.6), C['signature'] - 0.06, gain=0.14)
for i in range(3):                                 # peaks of typing(t - pulse, i, period .62, phase .12)
    m.add(tick(TICK_F[i], 0.045), C['pulse'] + 0.155 + 0.12 * i, gain=0.38, pan=[0.25, 0, -0.25][i])
res = cut + 9 * beat                               # beat 9 after the cut ≈ 6.28 s
m.add(bell(nf('D5'), 1.2, bright=0.6), res, gain=0.2)
m.add(pluck(nf('D3'), 1.0, bright=0.4), res, gain=0.3)

# ---------------------------------------------------------------- mix: clear the air before the hit, dip under reading
N = len(m.buf)
duck = duck_curve(N, [cut - 0.42], depth_db=-12, attack=0.06, hold=0.36, release=0.12)
read = np.ones(N); i0, i1 = int(C['line'] * SR), int((C['line'] + 1.0) * SR)
read[i0:i1] = db(-6); read = np.convolve(read, np.ones(2400) / 2400, mode='same')     # −6 dB while the line resolves
m.process_bus('music', lambda b: hp(peak_eq(b, 3500, -3, 1.2), 35) * (duck * read)[:, None])
fade_out = np.ones(N); a = int((D - 0.22) * SR); b_ = int(D * SR)
fade_out[a:b_] = np.linspace(1, 0, b_ - a) ** 2; fade_out[b_:] = 0
m.buf *= fade_out[:, None]
for k in list(m.buses): m.buses[k] *= fade_out[:, None]
m.master(os.path.join(HERE, 'audio.wav'), ceiling_db=-1.5)
