"""MOR — original score + sound design for the spec pitch ad. Everything is synthesised here or by the TASH engine
(_system/audio/tashaudio.py). Timings come from cues.json (one source of truth with the picture).

Shape: a night outside (crickets, a far car) → a key turns, the lock gives → we push through the keyhole and the music
starts on bar 1 (1.6 s): warm Khaleeji lo-fi at 90 BPM (1 beat = 20 frames): rootless e-piano chords, an oud-ish Bayati
motif on `pluck`, a round bass, mirwas + soft group claps in the montage. Foley on picture: kettle pour, ice, porcelain,
fizz. The groove drops out for «الباب مفتوح…», a breath of near-silence before «تفضّل.» (hero), and the end card resolves
D minor → D major (the door opens) as MOR's emblem blooms. Then the TASH sonic logo.
Run: python3 src/audio.py → src/audio.wav (pre-mastered to −14 LUFS, true peak ≤ −1.5 dBTP)."""
import sys, os, json
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, '/home/user/visitor-counter-api/tash/_system/audio')
from tashaudio import *  # noqa: F401,F403

C = json.load(open(os.path.join(HERE, 'cues.json')))
EV = C['ev']; DUR = C['duration']
g = Grid(C['bpm'], offset=C['downbeat'])      # bar 0 starts on the push-through
B = g.beat
R = np.random.default_rng(90)
seed(90)


# ----------------------------------------------------------------------------- local voices
def epiano(f, d=3.0, vel=0.8, bright=0.5, pan=0.0):
    """soft Rhodes-like e-piano (1:1 FM bark into a sine, short tine, slow tremolo), lowpassed warm"""
    t = tt(d)
    idx = (0.55 * bright + 0.5 * vel) * np.exp(-t / 0.28) + 0.12
    car = np.sin(2 * np.pi * f * t + np.sin(2 * np.pi * f * t) * idx)
    tine = np.sin(2 * np.pi * f * 6.98 * t) * np.exp(-t / 0.035) * 0.10 * vel
    body = np.sin(2 * np.pi * f * 2 * t) * np.exp(-t / 0.5) * 0.12
    y = (car + tine + body) * env_exp(d, 1.5 + 160 / f, 0.004) * vel
    y = hp(lp(y, 2400 + 1600 * bright), 110)
    trem = 0.1 * np.sin(2 * np.pi * 4.0 * t)
    st = np.stack([y * (1 + trem), y * (1 - trem)], axis=1) * 0.5
    if pan: st = stereo(mono(st), pan)
    return fade(st, 0.002, 0.25)


def chord(m, at, notes, vel=0.7, spread=0.02, bright=0.45, d=3.0, gain=0.28):
    for k, n in enumerate(notes):
        m.add(epiano(nf(n), d, vel * (0.92 + 0.08 * R.random()), bright, pan=(k / max(1, len(notes) - 1) - 0.5) * 0.5),
              at + k * spread + R.uniform(0, 0.006), gain=gain, bus='keys')


def softbass(f, d=1.0, vel=1.0):
    y = phase_osc(f, d) + 0.25 * phase_osc(2 * f, d) + 0.06 * phase_osc(3 * f, d)
    return fade(sat(y * env_adsr(d, 0.012, 0.25, 0.55, 0.25) * vel, 1.4) * 0.5, 0.004, 0.05)


def oud(note, d=1.4, vel=1.0, bright=0.4):
    """oud-ish: Karplus-Strong pluck, a little double-course detune, warm lowpass"""
    f = nf(note)
    a = pluck(f, d, bright=bright); b = pluck(f * 1.004, d, bright=bright * 0.9)
    n = min(len(a), len(b))
    return lp((a[:n] * 0.6 + b[:n] * 0.45) * vel, 3600)


def crickets(d, seed_=3):
    """night: 3 crickets (AM-pulsed 4–5 kHz chirps) far apart in the stereo field + a low city air"""
    r = np.random.default_rng(seed_); N = n_(d); out = np.zeros((N, 2)); t = tt(d)
    for k, (f0, per, pan) in enumerate(((4650, 0.42, -0.6), (4920, 0.57, 0.55), (4380, 0.71, 0.1))):
        car = np.sin(2 * np.pi * f0 * t)
        am = (np.sin(2 * np.pi * 34 * t) > 0.2).astype(float)
        ph = ((t + r.uniform(0, per)) % per) / per
        gate = np.where(ph < 0.22, np.sin(np.pi * ph / 0.22), 0) ** 2
        out += stereo(lp(car * am * gate, 7000) * 0.05 * (0.6 + 0.4 * k / 2), pan)
    air = hp(lp(noise(d, 'brown'), 260), 40) * 0.12
    return out + stereo(air, 0, width=0.6)


def far_car(d=2.2):
    """a car passing far away: lowpassed noise swelling and fading, a slow sweep"""
    x = svf_sweep(noise(d, 'pink'), 220, 520, q=0.9, mode='lp')
    e = np.sin(np.linspace(0, np.pi, len(x))) ** 2
    return stereo(x * e * 0.35, -0.4, width=0.3)


def key_turn():
    """a key in an old lock: three small metal ratchet clicks"""
    out = np.zeros(n_(0.3))
    for k, (t0, f) in enumerate(((0.0, 3400), (0.07, 3900), (0.13, 3100))):
        c = phase_osc(f, 0.04) * env_exp(0.04, 0.006) * 0.35
        c[:n_(0.02)] += bp(noise(0.02), 2500, 9000) * env_exp(0.02, 0.002)
        out[n_(t0):n_(t0) + len(c)] += c * (0.8 - 0.15 * k)
    return out


def lock_clunk():
    """the bolt gives: a metal clack on a wooden door body"""
    d = 0.4; t = tt(d)
    clack = bp(noise(d), 1200, 6000) * env_exp(d, 0.006)
    wood = (phase_osc(180 * (1 + 0.15 * np.exp(-t / 0.01)), d) + 0.5 * phase_osc(412, d)) * env_exp(d, 0.06)
    ring = phase_osc(2650, d) * env_exp(d, 0.09) * 0.08
    return fade(clack * 0.6 + wood * 0.5 + ring, 0.0005, 0.05)


def ice_clink(f=3100, seed_=1):
    """ice settling against a cup: short inharmonic glassy partials"""
    r = np.random.default_rng(seed_); d = 0.35; t = tt(d)
    y = sum(np.sin(2 * np.pi * f * m * (1 + r.uniform(-0.01, 0.01)) * t) * np.exp(-t / (0.06 / m)) * a
            for m, a in ((1, 1), (1.73, 0.6), (2.41, 0.35)))
    return fade(hp(y, 1200) * 0.4 + bp(noise(d), 3000, 9000) * env_exp(d, 0.002) * 0.3, 0.0003, 0.03)


def porcelain():
    """cup touching its saucer: a bright ceramic tink with a short body"""
    d = 0.6; t = tt(d)
    y = (np.sin(2 * np.pi * 2310 * t) * np.exp(-t / 0.11) + 0.55 * np.sin(2 * np.pi * 3920 * t) * np.exp(-t / 0.06)
         + 0.3 * np.sin(2 * np.pi * 1180 * t) * np.exp(-t / 0.05))
    return fade(y * 0.35 + bp(noise(d), 2000, 8000) * env_exp(d, 0.0015) * 0.4, 0.0003, 0.05)


def door_open(d=1.1):
    """a heavy wooden door swinging open: a soft low creak (slow pitch wobble) over an air swell"""
    t = tt(d)
    f = 95 + 25 * np.sin(2 * np.pi * 1.3 * t) + 18 * t
    creak = np.sin(2 * np.pi * np.cumsum(f) / SR) * (0.5 + 0.5 * np.sin(2 * np.pi * 31 * t)) ** 3
    creak = bp(sat(creak * 2.0, 2.0), 160, 1600) * np.sin(np.linspace(0, np.pi, len(t))) ** 2
    air = svf_sweep(noise(d, 'pink'), 400, 2200, q=1.2) * np.sin(np.linspace(0, np.pi, len(t))) ** 2
    return fade(creak * 0.3 + air * 0.16, 0.01, 0.1)


# ----------------------------------------------------------------------------- arrangement
m = Mix(DUR, tail=0.5)
T = lambda bar, beat=0, sub=0: g.t(bar, beat, sub)

# ---- the night outside (hook): crickets + a far car; they fade under the music, gone by 3.5 s
night = crickets(4.0)
night *= np.minimum(1, np.linspace(1.6, 0, len(night)) * 1.0 + 0.35).clip(0, 1)[:, None] ** 1.5
m.add(fade(night, 0.005, 0.4), 0.0, gain=1.3, bus='amb')
m.add(far_car(2.3), -0.3, gain=0.7, bus='amb')
m.add(key_turn(), EV['keyTurn'] - 0.13, gain=0.75, bus='sfx', pan=0.1)
m.add(lock_clunk(), EV['unlock'] - 0.003, gain=0.85, bus='sfx')
# the push through the keyhole: an air riser whose top sits on the downbeat, then hero hit 1 (soft) + music
m.add(riser(EV['through'] - EV['push'] + 0.05, 300, 5200, tonal=False), EV['push'] - 0.05, gain=0.26, bus='sfx')
m.add(whoosh(0.5, 300, 4200, pan_from=0.3, pan_to=-0.3), EV['through'] - 0.32, gain=0.3, bus='sfx')
m.add(impact(1.6, sub_f=50, bright=0.5, sub_decay=0.18, space=0.35), EV['through'] - 0.004, gain=0.42, bus='sfx')

# ---- chords: Dm9 · Bbmaj7 · Gm9 · A7sus4 · (m7) Bbmaj9 → Asus · end card: Dmaj9 (the door opens: minor → major)
V = {'Dm9': ['F3', 'A3', 'C4', 'E4'], 'Bbmaj7': ['D4', 'F4', 'A4', 'C5'], 'Gm9': ['Bb3', 'D4', 'F4', 'A4'],
     'A7sus': ['D4', 'E4', 'G4', 'C#5'], 'Bbmaj9': ['D4', 'F4', 'A4', 'C5'], 'Asus': ['D4', 'E4', 'A4'],
     'Dmaj9': ['F#3', 'A3', 'C#4', 'E4']}
chord(m, T(0), V['Dm9'], vel=0.62, spread=0.03, d=3.0)
chord(m, T(0, 2.5), V['Dm9'][1:], vel=0.4, d=1.4)
chord(m, T(1), V['Bbmaj7'], vel=0.62)
chord(m, T(1, 2.5), V['Bbmaj7'][1:], vel=0.4, d=1.4)
chord(m, T(2), V['Gm9'], vel=0.64)
chord(m, T(2, 2.5), V['Gm9'][1:], vel=0.42, d=1.4)
chord(m, T(3), V['A7sus'], vel=0.64)
chord(m, T(3, 2), V['A7sus'][1:], vel=0.44, d=1.4)
chord(m, T(4), V['Bbmaj9'], vel=0.5, spread=0.04, bright=0.35, d=2.6)          # «الباب مفتوح…»: keys alone
chord(m, EV['welcome'], V['Asus'], vel=0.55, spread=0.05, bright=0.4, d=1.6)    # «تفضّل.» (on beat 3 of bar 4)
chord(m, T(5), V['Dmaj9'], vel=0.66, spread=0.045, bright=0.5, d=3.4)          # end card: the resolve
PADS = [(0, 'Dm9'), (1, 'Bbmaj7'), (2, 'Gm9'), (3, 'A7sus'), (4, 'Bbmaj9'), (5, 'Dmaj9')]
for bar, name in PADS:
    m.add(pad([nf(n) for n in V[name][:3]], 2.9, cutoff=800, detune=0.08, attack=0.8, release=0.9), T(bar) - 0.05, gain=0.13, bus='keys')

# ---- bass: roots, round; sits out under «الباب مفتوح…» until «تفضّل.»
for bar, root in ((0, 'D2'), (1, 'Bb1'), (2, 'G1'), (3, 'A1'), (5, 'D2')):
    m.add(softbass(nf(root), 1.1), T(bar) + 0.004, gain=0.55, bus='bass')
    if bar in (0, 1, 2, 3): m.add(softbass(nf(root) * 2, 0.45, 0.6), T(bar, 2.5) + 0.004, gain=0.3, bus='bass')
m.add(softbass(nf('A1'), 1.0), EV['welcome'] + 0.004, gain=0.5, bus='bass')

# ---- oud motif (D Bayati: D Ed F G A) — answers the lines; repeated with variation, never looped
MOT = [('A4', 0), ('G4', 0.5), ('F4', 1), ('Ed4', 1.5), ('D4', 2)]
for n, b in MOT: m.add(oud(n, 1.3, 0.9), T(0, 1) + b * B, gain=0.26, bus='oud', pan=-0.15)          # under «فيه باب بالجهراء…»
for n, b in (('D4', 0), ('F4', 0.5), ('G4', 1), ('A4', 1.5)): m.add(oud(n, 1.2, 0.8), T(2, 1) + b * B, gain=0.22, bus='oud', pan=0.15)  # «تسوى المشوار.»
for n, b in (('A4', 0), ('Bb4', 0.75), ('A4', 1.25), ('G4', 1.75)): m.add(oud(n, 1.4, 0.75, 0.35), T(4, 0.5) + b * B, gain=0.2, bus='oud', pan=-0.1)  # «الباب مفتوح…»
m.add(oud('D5', 2.2, 0.9, 0.45), EV['word'] + 0.004, gain=0.22, bus='oud')                                     # the wordmark writes on

# ---- groove: mirwas + shaker from bar 1; group claps on 2 & 4 in the montage (bars 2–3); out for bar 4 (m7)
SW = 0.03
def groove(bar, density=1.0, dums=(0, 6, 10), taks=(4, 12), ghost=(7, 14), claps=False):
    for s in range(16):
        t_ = T(bar, s * 0.25) + (SW if s % 2 else 0)
        if s in dums: m.add(lp(mirwas_dum(), 2400), t_, gain=0.6 * density * (1 if s == 0 else 0.8), bus='drums', pan=-0.08)
        if s in taks: m.add(lp(mirwas_tak(), 6000), t_, gain=0.34 * density, bus='drums', pan=0.18)
        if s in ghost: m.add(lp(mirwas_tak(), 4500), t_ + R.uniform(-0.006, 0.006), gain=0.12 * density, bus='drums', pan=0.25)
        if s % 2 == 0: m.add(shaker(0.09), t_ + 0.01, gain=(0.15 if s % 4 else 0.09) * density, bus='drums', pan=-0.3)
        if claps and s in (4, 12): m.add(lp(claps_ensemble(5, 0.35, seed_=bar * 16 + s), 5200), t_, gain=0.3 * density, bus='drums', pan=0.05)
groove(0, 0.7, dums=(0, 10), taks=(12,), ghost=())
groove(1, 0.85)
groove(2, 0.95, claps=True)
groove(3, 1.0, claps=True)
m.add(lp(mirwas_dum(), 2400), T(5), gain=0.55, bus='drums')

# ---- foley on picture
p = lp(pour(2.0, seed_=17), 3000)
m.add(p, EV['pourStart'] - 0.04, gain=0.75, bus='sfx', pan=0.1)                                  # V60 kettle pour
for k, (dt, f) in enumerate(((0.05, 3200), (0.48, 3650), (1.15, 2900))):                          # ice settling in the cup
    m.add(ice_clink(f, k + 1), EV['ice'] + dt, gain=0.55 - 0.1 * k, bus='sfx', pan=[-0.15, 0.2, 0][k])
m.add(porcelain(), EV['clink'] + 0.02, gain=0.6, bus='sfx', pan=-0.1)                             # espresso cups on saucers
m.add(hp(lp(sizzle(1.0, density=700, seed_=5), 9000), 2500) * 0.6, EV['fizz'], gain=0.3, bus='sfx')  # the red drink's fizz
m.add(whoosh(0.4, 500, 3800, pan_from=-0.3, pan_to=0.3, peak=0.5), EV['pecan'] - 0.14, gain=0.16, bus='sfx')
# «تفضّل.»: hero hit 2 — breath of near-silence before it, then a warm low knock + bell + room
m.add(lock_clunk(), EV['welcome'] - 0.003, gain=0.35, bus='sfx')
m.add(bell(nf('A5'), 2.0, bright=0.5), EV['welcome'], gain=0.13, bus='verb')
m.add(lp(mirwas_dum(), 1800), EV['welcome'], gain=0.55, bus='sfx')
# end card: we back out through the keyhole (reverse air), the door swings open, the emblem blooms (hero hit 3)
m.add(whoosh(0.55, 300, 3000, pan_from=-0.2, pan_to=0.2, peak=0.35), EV['pullBack'] - 0.2, gain=0.24, bus='sfx')
m.add(door_open(1.1), EV['pullBack'] + 0.05, gain=0.55, bus='sfx')
m.add(shimmer(1.8, base=1175, n=5, seed_=4), EV['bloom'] + 0.02, gain=0.12, bus='sfx')
m.add(lp(softbass(nf('D3'), 0.25, 0.8), 700), EV['bloom'], gain=0.25, bus='sfx')

# ---- TASH signature (aligned to endcard-cues.json)
m.add(sonic_logo(), EV['sting'], gain=0.9, bus='sting')

# ----------------------------------------------------------------------------- buses
N = len(m.buf)
def lin(t0, t1, a, b):
    x = np.arange(N) / SR; k = np.clip((x - t0) / max(1e-6, t1 - t0), 0, 1); k = k * k * (3 - 2 * k)
    return (a + (b - a) * k)[:, None]

m.process_bus('keys', lambda b: reverb(b, decay=1.8, mix=0.22, pre=0.02, tone=5000))
m.process_bus('oud', lambda b: reverb(b, decay=2.0, mix=0.26, pre=0.02, tone=5500))
m.process_bus('drums', lambda b: reverb(sat(b * 1.2, 1.4) / 1.2, decay=0.6, mix=0.14, tone=5000))
m.process_bus('verb', lambda b: hp(reverb(b, decay=2.2, mix=1.0, pre=0.02, tone=6000), 250))
m.process_bus('amb', lambda b: b * lin(EV['through'] - 0.15, EV['through'] + 1.6, 1, db(-14)))

dums = [T(b, s * 0.25) for b, ss in ((0, (0, 10)), (1, (0, 6, 10)), (2, (0, 6, 10)), (3, (0, 6, 10)), (5, (0,))) for s in ss]
duck = duck_curve(N, dums, depth_db=-3.0, attack=0.006, hold=0.03, release=0.18)[:, None]
# the arc: in from the downbeat · lift in the montage · the room empties for «الباب مفتوح…» · a breath before «تفضّل.»
# · full on the end card · bow out under the TASH tail
arc = (lin(EV['through'] - 0.05, EV['through'] + 0.2, db(-18), 1) * lin(T(2) - 0.1, T(2) + 0.1, 1, db(1.0))
       * lin(T(4) - 0.15, T(4) + 0.1, 1, db(-3)) * lin(EV['welcome'] - 0.3, EV['welcome'] - 0.12, 1, db(-9))
       * lin(EV['welcome'] - 0.02, EV['welcome'] + 0.05, 1, db(9)) * lin(T(5) - 0.05, T(5) + 0.1, 1, db(2.5))
       * lin(EV['sting'] - 0.25, EV['sting'] + 0.25, 1, db(-16)) * lin(EV['sting'] + 0.9, EV['sting'] + 1.1, 1, db(-10)))
read = lin(EV['text1'] - 0.1, EV['text1'] + 0.2, 1, db(-1.5)) * lin(EV['text1Out'], EV['text1Out'] + 0.3, 1, db(1.5))
for bus in ('keys', 'oud', 'bass', 'drums'): m.process_bus(bus, lambda b: b * duck * arc * read)
m.process_bus('bass', lambda b: hp(b, 55) * db(-1))      # phones: keep the bass's harmonics, trim the inaudible sub (review note)
m.process_bus('drums', lambda b: hp(b, 48))
m.process_bus('sfx', lambda b: peak_eq(b, 3500, -2.0, 1.2))

endf = lin(DUR - 0.12, DUR, 1, 0)
m.buf *= endf
for k in list(m.buses): m.buses[k] = m.buses[k] * endf
m.master(os.path.join(HERE, 'audio.wav'), ceiling_db=-1.5)
