"""TASH launch ad — original score + sound design (Khaleeji-modern, 120 BPM, D Hijaz).
Everything is synthesised by /_system/audio/tashaudio.py; no samples. Reads ./cues.json (shared with the picture).
Arc: hook = room tone + held breath → DROP on «وهذا إعلانه.» (1.50) → montage groove (claps, mirwas, 808, stabs) →
breath + riser under the slow-mo spray → dots-wipe ticks → process groove (lighter, UI foley) → breakdown under the
bubbles (pops on the claps) → silence → sonic_logo() exactly on the sting (snap = bar downbeat 19.50) → tail under CTA.
Writes src/audio.wav (pre-mastered −14 LUFS / −1.5 dBTP) and src/assets/wave.json (the timeline UI's waveform).
Run: python3 src/audio.py"""
import sys, os, json, math
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, '/home/user/visitor-counter-api/tash/_system/audio')
from tashaudio import *  # noqa

C = json.load(open(os.path.join(HERE, 'cues.json')))
SH = {s['id']: s for s in C['shots']}; EV = C['ev']; T0 = C['sting']['t0']; SNAP = C['sting']['snap']
DUR = C['duration']
seed(2026)
r = np.random.default_rng(11)
G = Grid(C['bpm'], offset=C['barStart'])          # bar 0 starts on the drop (1.50); bar -1 beat 1 = 0.0
B = 60 / C['bpm']
m = Mix(DUR, tail=0.0)

# ------------------------------------------------------------------------------------------- instruments (local)
def stab(freqs, d=0.42, cutoff=2600, bright=1.0):
    """Bold synth stab: detuned saws, fast filter + amp envelope, saturated. Stereo."""
    out = np.zeros(n_(d))
    for f in freqs:
        for dt in (-0.09, 0.0, 0.09):
            out += phase_osc(f * 2 ** (dt / 12), d, 'saw')
    out /= len(freqs) * 3
    e = env_exp(d, 0.12, 0.002)
    y = lp(out * e, cutoff * bright, order=2) * 0.9 + lp(out * e, 9000) * 0.12
    return stereo(fade(sat(y * 1.8, 1.4), 0.001, 0.05), 0, width=0.8)

def hum(d):
    """Fluorescent office hum: 100/200/300 Hz buzz + air hiss, very low."""
    t = tt(d)
    x = 0.5 * np.sin(2 * np.pi * 100 * t) + 0.25 * np.sin(2 * np.pi * 200 * t) + 0.12 * np.sign(np.sin(2 * np.pi * 100 * t)) * 0.3
    x = bp(x, 80, 900) + hp(noise(d, 'pink'), 2500) * 0.12
    return fade(stereo(x * 0.18, 0, width=0.5), 0.05, 0.012)

def swish(d=0.28, lo=900, hi=7000, pan_from=0.6, pan_to=-0.6):
    """Light UI wipe: high-passed, no low end (whooshes with heavy lows read as booms)."""
    return hp(whoosh(d, lo, hi, q=2.0, pan_from=pan_from, pan_to=pan_to, peak=0.55), 400)

def hit_small():
    """The crown landing: thump + clap layer, a third of the drop."""
    a = impact(0.9, sub_f=58, bright=0.6, sub_decay=0.12, space=0.15)
    return a

HIJAZ = {'D': nf('D4'), 'Eb': nf('Eb4'), 'F#': nf('F#4'), 'G': nf('G4'), 'A': nf('A4'), 'Bb': nf('Bb4'), 'C': nf('C5'), 'D5': nf('D5')}

# ------------------------------------------------------------------------------------------- 0.00–1.50  HOOK
m.add(hum(1.50), 0.0, gain=0.22, bus='amb')
m.add(fade(stereo(lp(noise(1.5, 'brown'), 300) * 0.05, 0, width=0.6), 0.05, 0.012), 0.0, gain=0.5, bus='amb')  # room
m.add(tick(1800, 0.03), EV['hookText'], gain=0.18, pan=0.1)                                     # the line lands: a dry tick
m.add(stereo(hp(riser(1.05, 300, 7000, tonal=False)[:, 0], 600), 0, width=0.6), EV['drop'] - 1.05 - 0.07, gain=0.30, bus='sfx')  # held breath
m.add(shutter(), EV['shutter'] + 0.005, gain=0.85, pan=0.15)  # main bus: rings through the pre-drop gap                          # the phone's dry click
# 1.43–1.50 is silence (the riser is cut 2 f early): the drop lands on nothing

# ------------------------------------------------------------------------------------------- 1.50  DROP
m.add(impact(2.2, sub_f=46, bright=1.0, sub_decay=0.26, space=0.35), EV['drop'] - 0.004, gain=0.95, bus='sfx')
m.add(claps_ensemble(10, 0.4, seed_=4), EV['drop'], gain=0.9, bus='music')
m.add(stab([nf('D3'), nf('A3'), nf('D4'), nf('F#4'), nf('Eb5')], 0.55, cutoff=3200), EV['drop'], gain=0.55, bus='music')
m.add(shimmer(1.6, base=1320, n=6, seed_=9), EV['drop'] + 0.05, gain=0.20, bus='sfx')

# ------------------------------------------------------------------------------------------- 1.50–7.50  montage groove (bars 0–2)
KICK = 'x.........x.....'
CLAP = '....x.......x...'
KHAL = '.......o..o.....'          # Khaleeji off-beat group-clap answers
DUM  = 'x.....x...x.....'
TAK  = '...x.xx.x..x.xx.'
HAT  = '..x...x...x...x.'
def groove(bar, var=0, light=False):
    for (t, v) in G.steps(bar, KICK): m.add(kick(150, 44, 0.5, 1.0, 0.4), t, gain=0.75 * v * (0.75 if light else 1), bus='music')
    for (t, v) in G.steps(bar, CLAP): m.add(claps_ensemble(8, 0.36, seed_=bar * 7 + int(t * 10) % 5), t + r.uniform(-0.004, 0.004), gain=0.55 * v, bus='music')
    if not light:
        for (t, v) in G.steps(bar, KHAL): m.add(claps_ensemble(5, 0.3, seed_=31 + bar), t + 0.006, gain=0.32, bus='music')
    for (t, v) in G.steps(bar, DUM): m.add(mirwas_dum(), t, gain=0.42 * v, pan=-0.2, bus='music')
    for k, (t, v) in enumerate(G.steps(bar, TAK)): m.add(mirwas_tak(), t + r.uniform(-0.006, 0.006), gain=0.30 * v * (0.8 if k % 2 else 1), pan=0.25, bus='music')
    for (t, v) in G.steps(bar, HAT): m.add(hat(), t, gain=0.22, pan=0.3, bus='music')
    # 808: root on 1, answer on the "and" of 3
    m.add(sub808(nf('D1'), 0.9, glide_from=nf('A1'), decay=0.32), G.t(bar), gain=0.62, bus='bass')
    m.add(sub808(nf('C2') if var % 2 else nf('F1'), 0.45, decay=0.18), G.t(bar, 2.5), gain=0.5, bus='bass')

for bar in range(0, 3):
    groove(bar, var=bar)
# stabs: the hook figure (D Hijaz colour: the Eb), answered once per bar
STAB_D = [nf('D3'), nf('A3'), nf('D4'), nf('F#4')]
STAB_E = [nf('Eb3'), nf('G3'), nf('Eb4'), nf('G4')]
for bar in range(0, 3):
    m.add(stab(STAB_D, 0.32, 2400), G.t(bar, 1.75), gain=0.30, bus='music')
    m.add(stab(STAB_E, 0.30, 2200), G.t(bar, 3.0), gain=0.28, bus='music')
# events in the montage
m.add(swish(0.34, 600, 6000, 0.7, -0.7), SH['BURGER']['at'] - 0.2, gain=0.55, bus='sfx')          # whip (peak on the cut)
m.add(hit_small(), EV['crown'] - 0.003, gain=0.55, bus='sfx')                                         # the crown lands on the beat
m.add(stereo(hp(riser(0.32, 800, 9000, tonal=False)[:, 0], 900), 0, 0.6), EV['burn'][1] - 0.32, gain=0.30, bus='sfx')  # burn swell
m.add(pour(1.0, seed_=17), SH['COFFEE']['at'] + 0.02, gain=0.35, bus='sfx')                             # the pour
m.add(bell(nf('A6'), 1.8, 0.8), SH['RING']['at'], gain=0.30, pan=-0.2, bus='sfx')                      # cup → ring: one 'ting'
m.add(bell(nf('E7'), 1.4, 0.6), SH['RING']['at'] + 0.09, gain=0.14, pan=0.3, bus='sfx')

# ------------------------------------------------------------------------------------------- 7.50–9.50  breath (bar 3): spray slow-mo, riser
press = SH['SPRAY']['at'] + (6.20 - SH['SPRAY']['in']) / SH['SPRAY']['speed']
m.add(lp(spray(0.6), 9000), press + 0.08, gain=0.26, bus='sfx')
m.add(pad([nf('D3'), nf('A3'), nf('Eb4'), nf('F#4')], 2.2, cutoff=1500, attack=0.25, release=0.5), SH['SPRAY']['at'], gain=0.24, bus='music')
for k, (n, b) in enumerate([('D5', 0), ('C', 0.5), ('A', 1.0), ('Bb', 1.5), ('A', 2.0), ('G', 2.75), ('F#', 3.0)]):
    m.add(pluck(HIJAZ[n] * (1 if n != 'D5' else 1), 1.1, bright=0.5), G.t(3, b) if b < 4 else G.t(3, 3.5), gain=0.36 - 0.02 * k, pan=0.15, bus='music')
for (t, v) in G.steps(3, '....x.......x...'): m.add(mirwas_tak(), t, gain=0.22, pan=0.2, bus='music')
m.add(riser(EV['riser'][1] - EV['riser'][0] - 0.1, 200, 8000), EV['riser'][0], gain=0.20, bus='sfx')
# dots-wipe: the three typing ticks (dots grow right→left), then a short whoosh into the process
for k in range(3):
    m.add(tick([2200, 2500, 2800][k]), EV['dotsWipe'][0] + k * 0.067, gain=0.42 - 0.05 * k, pan=[0.3, 0, -0.3][k], bus='sfx')
m.add(swish(0.36, 500, 7000, 0.4, -0.6), EV['dotsWipe'][1] - 0.2, gain=0.5, bus='sfx')

# ------------------------------------------------------------------------------------------- 9.50–15.50  process groove (bars 4–6)
P_KICK = 'x...x...x...x...'
P_RIM  = '..x...x...x..x.x'
P_SHK  = 'xxxxxxxxxxxxxxxx'
BASSL = [nf('D2'), nf('D2'), nf('F2'), nf('D2'), nf('Eb2'), nf('D2'), nf('C2'), nf('A1')]
for bar in range(4, 7):
    for (t, v) in G.steps(bar, P_KICK): m.add(kick(130, 46, 0.35, 0.6, 0.5), t, gain=0.5, bus='music')
    for (t, v) in G.steps(bar, CLAP): m.add(claps_ensemble(6, 0.32, seed_=50 + bar), t, gain=0.42, bus='music')
    for k, (t, v) in enumerate(G.steps(bar, P_RIM)): m.add(rim(), t + r.uniform(-0.004, 0.004), gain=0.22 * (1 - 0.1 * (k % 2)), pan=-0.3, bus='music')
    for k, (t, v) in enumerate(G.steps(bar, P_SHK)): m.add(shaker(0.1), t, gain=0.09 * (1.0 if k % 4 == 2 else 0.6), pan=0.35, bus='music')
    for k in range(8):
        m.add(bass_synth(BASSL[(k + bar) % 8], 0.22, cutoff=420, env_amt=1500), G.t(bar, k * 0.5), gain=0.30, bus='bass')
    m.add(stab(STAB_D if bar != 5 else STAB_E, 0.22, 2000), G.t(bar, 3.5), gain=0.18, bus='music')
# UI foley on the picture's events
for k, t in enumerate(EV['ideaWords']): m.add(rim(0.05), t, gain=0.16 + 0.03 * k, pan=0.4 - 0.4 * k, bus='sfx')     # words land
for k, t in enumerate(EV['panels']): m.add(stereo(bp(noise(0.16, 'pink'), 2500, 9000) * env_exp(0.16, 0.05) * 0.5, [0.4, 0, -0.4][k]), t, gain=0.35, bus='sfx')  # pencil strokes
m.add(swish(0.5, 300, 5000, 0.2, -0.2), EV['boardPush'][0] - 0.02, gain=0.45, bus='sfx')                            # push into SC 02
m.add(pop(300, 700, 0.07), SH['PROD']['at'], gain=0.25, bus='sfx')
for t in (EV['wipeClay'], EV['wipeFinal']): m.add(swish(0.3, 1200, 8000, 0.6, -0.6), t - 0.15, gain=0.38, bus='sfx')  # RTL wipes
m.add(downlifter(0.5), EV['shrink'][0], gain=0.28, bus='sfx')
for k, t in enumerate(EV['sizes']): m.add(stereo(np.concatenate([rim(0.06) * 0.8, np.zeros(10)])), t, gain=0.32 - 0.04 * k, bus='sfx')   # format snaps
m.add(swish(0.4, 400, 6000, -0.4, 0.4), EV['toPhone'][0], gain=0.45, bus='sfx')

# ------------------------------------------------------------------------------------------- 15.50–19.50  breakdown under the bubbles
m.add(pad([nf('D2'), nf('A2'), nf('F3'), nf('E4')], T0 - 15.5 + 0.4, cutoff=900, attack=0.3, release=0.6), 15.5, gain=0.40, bus='music')
m.add(sub808(nf('D1'), 1.2, decay=0.5), 15.5, gain=0.45, bus='bass')
m.add(sub808(nf('Bb0'), 1.2, decay=0.5), 17.5, gain=0.40, bus='bass')
for t in (15.5, 16.0, 16.5, 17.0, 17.5): m.add(mirwas_dum(), t, gain=0.20, pan=-0.2, bus='music')
for k, t in enumerate(EV['bubbles']):                      # each bubble pops ON a group clap
    m.add(claps_ensemble(9, 0.4, seed_=70 + k), t, gain=0.55, bus='music')
    m.add(pop(380 + 60 * k, 980 + 120 * k, 0.07), t, gain=0.55, pan=[0.3, -0.3, 0.3][k], bus='sfx')
m.add(stab([nf('D3'), nf('A3'), nf('F4')], 0.6, 1400), EV['bubbles'][2] + 0.25, gain=0.16, bus='music')
for k in range(3): m.add(pop(260, 520, 0.05), EV['collapse'][0] + 0.06 + k * 0.05, gain=0.18, bus='sfx')  # bubbles fold in

# ------------------------------------------------------------------------------------------- 18.38  the sting (official sonic logo) — snap = bar downbeat
m.add(sonic_logo(), T0, gain=1.15, bus='logo')

# ------------------------------------------------------------------------------------------- 19.50–25.50  tail under ASK / CTA
m.add(pad([nf('D3'), nf('A3'), nf('D4'), nf('F#4')], 3.6, cutoff=1300, attack=0.9, release=1.0), 20.4, gain=0.22, bus='music')
TAILP = [('A', 0), ('Bb', 0.5), ('A', 1.0), ('G', 1.5), ('F#', 2.0), ('Eb', 2.5), ('D', 3.0)]
for k, (n, b) in enumerate(TAILP): m.add(pluck(HIJAZ[n], 1.3, bright=0.45), SH['ASK']['at'] + b * B * 0.5 + 0.0, gain=0.30, pan=-0.1, bus='music')
for bar in (10, 11):
    for (t, v) in G.steps(bar, '....x.......x...'): m.add(claps_ensemble(6, 0.3, seed_=90 + bar), t, gain=0.28, bus='music')
    for (t, v) in G.steps(bar, 'x.....x...x.....'): m.add(mirwas_dum(), t, gain=0.24, pan=-0.2, bus='music')
    for (t, v) in G.steps(bar, '...x.x....x..x..'): m.add(mirwas_tak(), t, gain=0.16, pan=0.25, bus='music')
    m.add(sub808(nf('D1'), 1.0, decay=0.35), G.t(bar), gain=0.40, bus='bass')
# TASH replies: a warm pop + glass ting as the lime bubble lands, then the cadence resolves on D (bar 11)
m.add(pop(420, 1250, 0.08), EV['ctaLine'], gain=0.6, bus='sfx')
m.add(bell(nf('D6'), 1.6, 0.7), EV['ctaLine'] + 0.02, gain=0.18, bus='sfx')
m.add(stab([nf('D3'), nf('A3'), nf('D4'), nf('F#4'), nf('A4')], 1.6, 1800), G.t(11), gain=0.30, bus='music')
m.add(pad([nf('D2'), nf('A2'), nf('D3'), nf('F#3'), nf('A3')], DUR - G.t(11), cutoff=1600, attack=0.05, release=1.2), G.t(11), gain=0.30, bus='music')
m.add(pluck(nf('D5'), 1.8, bright=0.4), G.t(11, 2.0), gain=0.22, bus='music')

# ------------------------------------------------------------------------------------------- buses
N = len(m.buf)
kicks = [t for bar in range(0, 3) for (t, _) in G.steps(bar, KICK)] + [t for bar in range(4, 7) for (t, _) in G.steps(bar, P_KICK)]
side = duck_curve(N, kicks, depth_db=-5, attack=0.004, hold=0.03, release=0.16)
# clear the air: before the drop (silent gap), before the snap (−12 dB, 0.3 s), and under the sting
pre = duck_curve(N, [SNAP - 0.32], depth_db=-14, attack=0.04, hold=0.30, release=0.6)
sting_dip = duck_curve(N, [T0 + 0.05], depth_db=-7, attack=0.15, hold=1.2, release=0.8)
def gap(b, a0, a1, fade_s=0.004):
    i0, i1 = int(a0 * SR), int(a1 * SR); f = n_(fade_s)
    b[i0 - f:i0] *= np.linspace(1, 0, f)[:, None]; b[i0:i1] = 0
    return b
m.process_bus('music', lambda b: gap(b * (side * pre * sting_dip)[:, None], EV['drop'] - 0.07, EV['drop'] - 0.002))
m.process_bus('bass', lambda b: lp(b * (pre * sting_dip)[:, None], 260, order=2) + hp(sat(lp(b, 900) * 2.0, 2.0), 160) * 0.18)  # phone-audible harmonics on the 808
m.process_bus('sfx', lambda b: gap(peak_eq(b, 3500, -2.5, 1.2), EV['drop'] - 0.07, EV['drop'] - 0.004))
m.process_bus('amb', lambda b: b)
end_fade = np.ones(N); nf_ = n_(0.25); end_fade[-nf_:] = np.linspace(1, 0, nf_) ** 1.5
for k in list(m.buses):
    m.process_bus(k, lambda b: b * end_fade[:len(b), None])

out = m.master(os.path.join(HERE, 'audio.wav'), ceiling_db=-1.5)

# waveform for the timeline UI (our own track, 360 points, normalised peaks)
mono_ = np.abs(out).max(axis=1); k = len(mono_) // 360
w = [float(mono_[i * k:(i + 1) * k].max()) for i in range(360)]
mx = max(w) or 1
os.makedirs(os.path.join(HERE, 'assets'), exist_ok=True)
json.dump([round(v / mx, 3) for v in w], open(os.path.join(HERE, 'assets', 'wave.json'), 'w'))
print('wave.json written')
