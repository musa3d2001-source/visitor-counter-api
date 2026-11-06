"""HABBA — original score + sound design for concept ad 03 (specialty coffee).
Warm lo-fi at 85.714 BPM (1 beat = 0.7 s = 21 frames): soft electric-piano chords (local FM voice), a gentle mirwas
groove, round sine bass, vinyl crackle; foley on picture: blinds, pour, bean taps, the cup's turn and clink.
Everything is synthesised here or by the TASH engine (_system/audio/tashaudio.py). Timings come from cues.json.
Run:  python3 src/audio.py   → writes src/audio.wav (pre-mastered to −14 LUFS, true peak ≤ −1.5 dBTP)."""
import sys, os, json
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, '/home/user/visitor-counter-api/tash/_system/audio')
from tashaudio import *  # noqa: F401,F403
from tashaudio import _rng  # noqa: F401

C = json.load(open(os.path.join(HERE, 'cues.json')))
EV = C['ev']; DUR = C['duration']
STING = json.load(open('/home/user/visitor-counter-api/tash/_system/motion/endcard-cues.json'))
g = Grid(C['bpm'])            # g.t(bar, beat, sub)
B = g.beat
R = np.random.default_rng(85)
seed(85)


# ----------------------------------------------------------------------------- local voices
def epiano(f, d=3.0, vel=0.8, bright=0.5, pan=0.0):
    """Soft Rhodes-like electric piano: 1:1 FM 'bark' that decays into a sine, a short tine on the attack,
    slow stereo tremolo. Lowpassed for a warm lo-fi tone."""
    t = tt(d)
    idx = (0.55 * bright + 0.5 * vel) * np.exp(-t / 0.28) + 0.12
    mod = np.sin(2 * np.pi * f * t) * idx
    car = np.sin(2 * np.pi * f * t + mod)
    tine = np.sin(2 * np.pi * f * 6.98 * t) * np.exp(-t / 0.035) * 0.10 * vel
    body = np.sin(2 * np.pi * f * 2 * t) * np.exp(-t / 0.5) * 0.12
    e = env_exp(d, 1.5 + 160 / f, 0.004)
    y = (car + tine + body) * e * vel
    y = hp(lp(y, 2600 + 1800 * bright), 110, order=2)   # 1:1 FM leaves DC/sub sidebands: keep the keys out of the bass
    trem = 0.11 * np.sin(2 * np.pi * 4.2 * t)
    st = np.stack([y * (1 + trem), y * (1 - trem)], axis=1) * 0.5
    st = stereo(mono(st), pan) if pan else st
    return fade(st, 0.002, 0.25)


def chord(m, at, notes, vel=0.7, spread=0.018, bus='keys', bright=0.45, d=3.2):
    """Strum the voicing bottom→top with a humanised spread (lo-fi players never hit all notes at once)."""
    for k, n in enumerate(notes):
        dt = k * spread + R.uniform(0, 0.006)
        m.add(epiano(nf(n), d, vel * (0.92 + 0.08 * R.random()), bright, pan=(k / max(1, len(notes) - 1) - 0.5) * 0.5), at + dt,
              gain=0.30, bus=bus)


def softbass(f, d=1.2, vel=1.0):
    t = tt(d)
    y = phase_osc(f, d) + 0.22 * phase_osc(2 * f, d) + 0.05 * phase_osc(3 * f, d)
    e = env_adsr(d, 0.012, 0.25, 0.55, 0.25)
    return fade(sat(y * e * vel, 1.3) * 0.5, 0.004, 0.05)


def vinyl(d, seed_=4):
    r = np.random.default_rng(seed_); N = n_(d)
    imp = np.zeros(N); idx = r.integers(0, N, int(d * 26)); imp[idx] = r.uniform(-1, 1, len(idx)) ** 3
    pops = bp(imp, 900, 7000) * 2.2
    hiss = lp(hp(noise(d, 'pink'), 1800), 9000) * 0.035
    rumble = hp(lp(noise(d, 'brown'), 90), 35) * 0.05
    return stereo(pops * 0.5 + hiss + rumble, 0, width=0.7)


def slats(d=0.55, n=11, close=False, seed_=6):
    """Blinds tilting: a quick ripple of tiny slat clicks (aluminium-ish) over a soft air swish."""
    r = np.random.default_rng(seed_); out = np.zeros((n_(d + 0.2), 2))
    for k in range(n):
        x = k / (n - 1)
        tk = (x ** 0.8 if not close else x ** 1.25) * d * 0.85
        c = np.zeros(n_(0.02))
        c[:n_(0.012)] += bp(noise(0.012), 2500, 9000) * env_exp(0.012, 0.0025) * r.uniform(0.4, 1.0)
        c += phase_osc(r.uniform(3200, 4400), 0.02) * env_exp(0.02, 0.004) * 0.25
        out[n_(tk):n_(tk) + len(c)] += stereo(c, r.uniform(-0.5, 0.5))[:len(out) - n_(tk)]
    sw = svf_sweep(noise(d, 'pink'), 600 if not close else 3500, 3500 if not close else 600, q=1.6)
    e = np.sin(np.linspace(0, np.pi, len(sw))) ** 2
    out[:len(sw)] += stereo(sw * e * 0.18, 0, width=0.6)
    return out * 0.9


def bean_tap(seed_=1, gain=1.0):
    """A roasted bean landing on oiled wood: a tiny bright tick + a short hollow wooden knock."""
    r = np.random.default_rng(seed_)
    d = 0.16; t = tt(d)
    tick_ = bp(noise(d), 2500, 9000) * env_exp(d, 0.0018)
    f0 = r.uniform(1150, 1350)
    knock = (phase_osc(f0 * (1 + 0.08 * np.exp(-t / 0.004)), d) + 0.4 * phase_osc(f0 * 2.31, d)) * env_exp(d, 0.018)
    low = phase_osc(310, d) * env_exp(d, 0.03) * 0.35
    return fade((tick_ * 0.9 + knock * 0.5 + low) * gain, 0.0003, 0.02)


def clink(f=2350, d=1.1):
    """Ceramic 'tink': stiff inharmonic partials with fast decay + a glassy transient (cup settling on its saucer)."""
    t = tt(d); y = np.zeros_like(t)
    for ratio, a, dec in ((1.0, 1.0, 0.32), (2.42, 0.55, 0.16), (3.9, 0.35, 0.09), (5.61, 0.22, 0.05), (0.51, 0.25, 0.12)):
        y += a * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t / dec)
    y += bp(noise(d), 3000, 11000) * env_exp(d, 0.0025) * 0.8
    return fade(y * 0.35, 0.0002, 0.1)


def scrape(d=1.3):
    """The cup's foot turning on the saucer well: a very soft, slightly grainy ceramic slide."""
    N = n_(d)
    x = bp(noise(d), 900, 3800) * (0.6 + 0.4 * lp(_rng.standard_normal(N), 30) * 6)
    e = np.sin(np.linspace(0, np.pi, N)) ** 1.5 * np.linspace(1, 0.4, N)
    return stereo(x * e * 0.08, 0.1, width=0.3)


# ----------------------------------------------------------------------------- arrangement
m = Mix(DUR, tail=0.5)

# bed: vinyl crackle from frame 0 (the room tone of the piece)
m.add(vinyl(DUR + 0.4), 0.0, gain=0.55, bus='bed')

# chords (bars of 4 beats = 2.8 s): Gmaj9 → F#m7(11) → Em9 → A7sus4 → Dmaj9 (resolves on the end card)
V = {   # rootless voicings — the bass carries the roots
    'Gmaj9': ['B3', 'D4', 'F#4', 'A4'],
    'F#m11': ['A3', 'C#4', 'E4', 'B4'],
    'Em9': ['G3', 'B3', 'D4', 'F#4'],
    'A7sus': ['D4', 'E4', 'G4', 'B4'],
    'Dmaj9': ['F#3', 'A3', 'C#4', 'E4'],
}
# bar 0: the chord blooms as the blinds open (a lowpass opening on the keys bus, applied below)
chord(m, 0.00, V['Gmaj9'], vel=0.62, spread=0.03, bright=0.35, d=3.0)
chord(m, g.t(0, 2.5), V['Gmaj9'][1:], vel=0.42, bright=0.3, d=1.6)
chord(m, g.t(1, 0), V['F#m11'], vel=0.66)
chord(m, g.t(1, 2.5), V['F#m11'][1:], vel=0.44, d=1.6)
chord(m, g.t(2, 0), V['Em9'], vel=0.64)
chord(m, g.t(2, 2.5), V['Em9'][1:], vel=0.40, d=1.4)
chord(m, g.t(3, 0), V['A7sus'], vel=0.62)
chord(m, g.t(3, 2.5), V['A7sus'][1:], vel=0.42, d=1.6)
chord(m, g.t(4, 0), V['Dmaj9'], vel=0.70, spread=0.035, bright=0.5, d=4.2)

# bass: roots, round and short; sits out in the slow-motion beans (bar 2 second half)
for bar, root in ((1, 'F#2'), (2, 'E2'), (3, 'A2'), (4, 'D2')):
    m.add(softbass(nf(root), 1.0), g.t(bar, 0) + 0.004, gain=0.5, bus='bass')
    if bar in (1, 3):
        m.add(softbass(nf(root) * 2, 0.5, 0.6), g.t(bar, 2.5) + 0.004, gain=0.3, bus='bass')
m.add(softbass(nf('G2'), 1.2, 0.8), g.t(0, 2) + 0.01, gain=0.42, bus='bass')

# groove: a gentle mirwas pattern (dum = low, tak = slap) with a swung shaker. Enters with the steam (bar 1),
# drops to almost nothing for the slow-motion beans, returns softly on the cup's turn, ends on the resolve.
SW = 0.035   # lo-fi swing on the off-16ths
def groove(bar, density=1.0, dums=(0, 6, 10), taks=(4, 12), ghost=(7, 14)):
    for s in range(16):
        tt_ = g.t(bar, s * 0.25) + (SW if s % 2 else 0)
        if s in dums: m.add(lp(mirwas_dum(), 2500), tt_, gain=0.62 * density * (1 if s == 0 else 0.8), bus='drums', pan=-0.08)
        if s in taks: m.add(lp(mirwas_tak(), 6000), tt_, gain=0.36 * density, bus='drums', pan=0.18)
        if s in ghost: m.add(lp(mirwas_tak(), 4500), tt_ + R.uniform(-0.006, 0.006), gain=0.13 * density, bus='drums', pan=0.25)
        if s % 2 == 0: m.add(shaker(0.09), tt_ + 0.01, gain=(0.18 if s % 4 else 0.11) * density, bus='drums', pan=-0.3)
groove(1, 0.85)
groove(2, 0.75, dums=(0, 6), taks=(4,), ghost=())         # thins out into the beans
groove(3, 0.55, dums=(10,), taks=(12,), ghost=(14,))      # comes back in on the turn
m.add(lp(mirwas_dum(), 2500), g.t(4, 0), gain=0.6, bus='drums')                      # last dum on the resolve

# melody: two soft plucks for «حبّة… حبّة.» on the bean landings (the same note twice: one, then another)
for tb, gn in ((EV['bean1'], 0.42), (EV['bean2'], 0.36)):
    m.add(lp(pluck(nf('D5'), 1.6, bright=0.35), 3800), tb + 0.004, gain=gn, bus='keys2', pan=0.15)
# a small answering phrase under «قهوتك…»
m.add(lp(pluck(nf('A4'), 1.4, bright=0.3), 3500), EV['text1'] + 0.05, gain=0.26, bus='keys2', pan=-0.2)
m.add(lp(pluck(nf('F#4'), 1.6, bright=0.3), 3500), EV['text1'] + 0.05 + B, gain=0.22, bus='keys2', pan=-0.1)

# ---------------------------------------------------------------- foley on picture
m.add(slats(0.6), EV['blindsOpen'] - 0.02, gain=0.75, bus='sfx')                          # blinds open (hook)
m.add(shimmer(1.6, base=1760, n=5, seed_=8), EV['blindsOpen'] + 0.45, gain=0.10, bus='sfx')  # light fills the room
p = pour(EV['streamOff'] - EV['milkStart'] + 0.25, seed_=21)
p = lp(p, 3200) * np.linspace(1, 0.55, len(p))[:, None]
m.add(p, EV['milkStart'] - 0.05, gain=0.85, bus='sfx')                                       # the milk pour
m.add(bean_tap(1, 1.0), EV['bean1'], gain=0.75, bus='sfx', pan=0.1)                          # bean one
m.add(bean_tap(2, 0.45), EV['bean1'] + 0.42, gain=0.6, bus='sfx', pan=0.1)                   #   …its little bounce
m.add(bean_tap(3, 1.0), EV['bean2'], gain=0.7, bus='sfx', pan=0.2)                           # bean two
m.add(bean_tap(4, 0.45), EV['bean2'] + 0.42, gain=0.55, bus='sfx', pan=0.2)
for k, tb in enumerate((7.18, 7.42, 7.95, 8.15, 8.75, 9.05)):                                 # the soft ones behind
    m.add(lp(bean_tap(10 + k, 0.5), 3000), tb, gain=0.22, bus='sfx', pan=R.uniform(-0.4, 0.4))
m.add(scrape(EV['settle'] - EV['turnStart']), EV['turnStart'], gain=1.0, bus='sfx')         # the cup turns
m.add(clink(2350), EV['settle'] - 0.004, gain=0.9, bus='sfx', pan=-0.05)                    # hero: the clink
m.add(clink(2350), EV['settle'], gain=0.25, bus='verb')
m.add(bean_tap(7, 0.55), EV['beanDot'], gain=0.45, bus='sfx')                                 # the bean drops into the mark
m.add(slats(0.4, 9, close=True, seed_=9), EV['blindsClose'] - 0.02, gain=0.55, bus='sfx')    # blinds close → TASH

# ---------------------------------------------------------------- TASH signature (aligned to endcard-cues.json)
m.add(sonic_logo(), EV['sting'], gain=0.9, bus='sting')

# ---------------------------------------------------------------- buses
N = len(m.buf)
def lin(t0, t1, a, b):
    """gain ramp a→b between t0..t1 (seconds), as an (N,1) array"""
    x = np.arange(N) / SR; k = np.clip((x - t0) / max(1e-6, t1 - t0), 0, 1); k = k * k * (3 - 2 * k)
    return (a + (b - a) * k)[:, None]

# keys: lowpass opening with the blinds (0.28 → 1.5 s), via a few block-wise filters crossfaded
def opening(b):
    dark = lp(b, 520, order=2); mid = lp(b, 1500, order=2)
    k1 = lin(0.25, 0.9, 0, 1); k2 = lin(0.8, 1.6, 0, 1)
    return dark * (1 - k1) + mid * k1 * (1 - k2) + b * k2
m.process_bus('keys', opening)
m.process_bus('keys', lambda b: reverb(b, decay=1.8, mix=0.22, pre=0.02, tone=5000))
m.process_bus('keys2', lambda b: reverb(b, decay=2.2, mix=0.3, pre=0.02, tone=5500))
m.process_bus('drums', lambda b: reverb(sat(b * 1.2, 1.4) / 1.2, decay=0.6, mix=0.14, tone=5000))
m.process_bus('verb', lambda b: hp(reverb(b, decay=1.9, mix=1.0, pre=0.02, tone=6500), 250))
m.process_bus('bed', lambda b: b * lin(DUR - 0.6, DUR, 1, 0.4))

# sidechain-ish breathing on the keys and bass from the dums; reading dip under the lines; clear the air for the clink;
# the whole music bed bows out with the blinds so the TASH signature lands on near-silence
dums = [g.t(b, s * 0.25) for b, ss in ((1, (0, 6, 10)), (2, (0, 6)), (3, (10,)), (4, (0,))) for s in ss]
duck = duck_curve(N, dums, depth_db=-3.5, attack=0.006, hold=0.03, release=0.2)[:, None]
read = lin(EV['text1'] - 0.1, EV['text1'] + 0.2, 1, db(-2)) * lin(EV['text1Out'], EV['text1Out'] + 0.3, 1, db(2))
pre_clink = lin(EV['settle'] - 0.35, EV['settle'] - 0.12, 1, db(-5)) * lin(EV['settle'] - 0.02, EV['settle'] + 0.3, 1, db(5))
outro = lin(EV['blindsClose'] - 0.05, EV['sting'] + 0.3, 1, db(-15)) * lin(EV['sting'] + 0.8, EV['sting'] + 1.08, 1, db(-12))
music = lambda b: b * duck * read * pre_clink * outro
for bus in ('keys', 'keys2', 'bass', 'drums'): m.process_bus(bus, music)
m.process_bus('bass', lambda b: hp(b, 38, order=2) * db(-3))
m.process_bus('keys', lambda b: peak_eq(b, 1000, 3.0, 0.8))
m.process_bus('sfx', lambda b: peak_eq(b, 3500, -2.0, 1.2))

# no click at the very end: a 120 ms fade on everything
endf = lin(DUR - 0.12, DUR, 1, 0)
m.buf *= endf
for k in list(m.buses): m.buses[k] = m.buses[k] * endf
out = m.master(os.path.join(HERE, 'audio.wav'), ceiling_db=-1.5)
