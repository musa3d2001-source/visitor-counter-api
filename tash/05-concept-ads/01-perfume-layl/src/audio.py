"""LAYL — original score & sound design (synthesised with the TASH engine; no samples).
Slow 80 BPM pulse (1 beat = 0.75 s, every cut lands on a beat), Hijaz on D: D Eb F# G A Bb C.
Dark & warm: oud-like plucks, deep pad, sub swells, glass shimmer; slow-motion spray; resolves into the TASH sonic logo.
Cue times mirror src/shots.js (SHOTS / T). Run:  python3 src/audio.py  → src/audio.wav
"""
import sys, os, json
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(HERE, '../../../_system/audio')))
from tashaudio import *  # noqa

seed(707)
C = json.load(open(os.path.join(HERE, 'cues.json')))      # one source of truth with the picture (src/shots.js)
DUR = C['duration']
BEAT = C['beat']
CUT = {s['id']: s['at'] for s in C['shots']}
TT = C['t']
T_SPRAY = TT['spray']; T_PRESS = T_SPRAY - 0.10
T_LINE1, T_LINE2 = TT['line1'], TT['line2']
T_ENDCARD, T_LIGHTSOUT, T_STING = TT['endcard'], TT['lightsOut'], TT['sting']

m = Mix(DUR, tail=3.0)
R = np.random.default_rng(11)


# ------------------------------------------------------------------------------------------ voices
def oud(note, t, vel=1.0, d=1.8, pan=0.0, trem=False, bright=0.40):
    """Oud-ish pluck (Karplus-Strong, darker body) with an optional risha tremolo re-strike."""
    f = nf(note)
    x = pluck(f, d, bright=bright, decay=0.9958)
    x = lp(x, 3800)
    m.add(x * 0.66 * vel, t, pan=pan, bus='oud')
    if trem:
        y = pluck(f, d * 0.8, bright=bright * 0.8, decay=0.995)
        m.add(lp(y, 3200) * 0.30 * vel, t + 0.095, pan=pan * 0.8, bus='oud')


def pad_seg(notes, t0, t1, cutoff=1200, gain=0.22, attack=0.7, release=0.9):
    x = pad([nf(n) for n in notes], t1 - t0 + release, cutoff=cutoff, detune=0.09, attack=attack, release=release)
    m.add(x * gain, t0, bus='music')


def sub_swell(note, t0, d, gain=0.4, rise=0.6):
    """Warm sub swell: sine + a little 2nd harmonic (audible on phones), sin² envelope, clean tail."""
    f = nf(note); tt_ = np.arange(n_(d)) / SR
    env = np.sin(np.pi * np.clip(tt_ / d, 0, 1)) ** 2
    env *= np.clip(tt_ / max(rise, 1e-3), 0, 1)
    x = (phase_osc(f, d) + 0.22 * phase_osc(2 * f, d)) * env
    m.add(fade(x, 0.01, 0.2) * gain, t0, bus='music')


def glass_sing(note, t0, d, gain=0.08, pan=0.0):
    """Wet-finger-on-glass tone: sine + soft partials, slow attack, gentle vibrato."""
    f = nf(note); tt_ = np.arange(n_(d)) / SR
    vib = 1 + 0.003 * np.sin(2 * np.pi * 5.2 * tt_)
    x = phase_osc(f * vib, d) + 0.25 * phase_osc(2.01 * f * vib, d) + 0.08 * phase_osc(3.0 * f * vib, d)
    env = np.sin(np.pi * np.clip(tt_ / d, 0, 1)) ** 1.5
    m.add(fade(x * env, 0.02, 0.1) * gain, t0, pan=pan, bus='glass')


def ping(note, t0, gain=0.08, pan=0.0, d=2.0, bright=0.45):
    m.add(lp(bell(nf(note), d, bright), 7000) * gain, t0, pan=pan, bus='glass')


# ------------------------------------------------------------------------------------------ S1 — darkness, light sweep (0.00–1.50)
sub_swell('D2', 0.0, 1.7, gain=0.15, rise=0.4)
oud('D2', 0.0, vel=0.55, d=2.6)                 # frame 0: a low open string under the first light
# the strip of light travels right→left: an airy sweep panned R→L
sw = whoosh(1.45, f_lo=700, f_hi=6500, q=3.2, pan_from=0.85, pan_to=-0.85, peak=0.5)
m.add(sw * 0.22, 0.0, bus='sfx')
glass_sing('A5', 0.0, 1.5, gain=0.05, pan=0.3)
ping('A6', 0.42, gain=0.09, pan=0.35)          # first glint on the arch edge
ping('D7', 0.80, gain=0.05, pan=-0.3, bright=0.3)
oud('D3', 0.75, vel=0.55, pan=0.1)              # a single low string under the reveal

# ------------------------------------------------------------------------------------------ S2 — the liquid wakes (1.50–3.00)
oud('D2', CUT['S2'], vel=0.75, d=2.4)
oud('D4', CUT['S2'], vel=0.9, pan=-0.1, trem=True)
oud('Eb4', CUT['S2'] + 0.375, vel=0.65, pan=-0.05)
oud('F#4', CUT['S2'] + 0.75, vel=0.85, pan=0.0, trem=True)
oud('G4', CUT['S2'] + 1.125, vel=0.6, pan=0.05)
pad_seg(['D3', 'A3'], CUT['S2'] - 0.2, CUT['S3'] + 0.3, cutoff=750, gain=0.20, attack=0.9)
sub_swell('D2', CUT['S2'] + 0.2, 1.8, gain=0.17, rise=1.0)
m.add(riser(1.2, f_lo=300, f_hi=3500, tonal=False) * 0.07, CUT['S3'] - 1.2, bus='sfx')

# ------------------------------------------------------------------------------------------ S3 — orbit, gold dust (3.00–6.00)
m.add(impact(2.0, sub_f=50, bright=0.25, sub_decay=0.25, space=0.25) * 0.30, CUT['S3'], bus='sfx')
m.add(sub808(nf('D2'), 1.4, glide_from=nf('D3'), glide_t=0.07, decay=0.42) * 0.24, CUT['S3'], bus='music')
oud('A4', CUT['S3'], vel=1.0, trem=True, pan=0.0)
for i, (n, b, v) in enumerate([('G4', 0.5, 0.6), ('F#4', 1.0, 0.75), ('Eb4', 1.5, 0.6), ('D4', 2.0, 0.85),
                               ('F#4', 2.75, 0.5), ('A4', 3.0, 0.6), ('C5', 3.25, 0.55), ('Bb4', 3.5, 0.6), ('A4', 3.75, 0.7)]):
    oud(n, CUT['S3'] + b * BEAT, vel=v, pan=0.12 * ((-1) ** i), trem=(n in ('D4', 'A4')))
pad_seg(['D3', 'A3', 'D4', 'F#4'], CUT['S3'], CUT['S4'] + 0.2, cutoff=1300, gain=0.22, attack=0.5)
m.add(shimmer(2.6, base=1174.7, n=6, seed_=21) * 0.14, CUT['S3'] + 0.25, bus='glass')
for k in range(7):  # dust glints, Hijaz notes, scattered L/R
    ping(['D6', 'F#6', 'A6', 'Eb6', 'G6', 'D7', 'A6'][k], CUT['S3'] + 0.5 + k * 0.36 + R.uniform(-0.05, 0.05), gain=0.035 + 0.02 * R.random(), pan=R.uniform(-0.8, 0.8), d=1.4)

# ------------------------------------------------------------------------------------------ S4 — atomiser, slow-motion mist (6.00–8.25)
oud('D2', CUT['S4'], vel=0.7, d=2.6)
pad_seg(['D3', 'Eb4', 'A3'], CUT['S4'], CUT['S5'] + 0.4, cutoff=620, gain=0.16, attack=0.4)   # b2 colour: held breath
m.add(riser(0.9, f_lo=400, f_hi=6000, tonal=False) * 0.08, T_PRESS - 0.85, bus='sfx')
# the press: a small heavy-metal click
clk = lp(noise(0.06), 600) * env_exp(0.06, 0.01) * 0.7
clk[:n_(0.03)] += bp(noise(0.03), 1800, 7000) * env_exp(0.03, 0.004) + tick(3300, 0.03) * 0.6
m.add(clk * 0.55, T_PRESS, pan=-0.1, bus='sfx')
# the spray: a real-time 'psst' onset that stretches into a slowed, darkening hiss (time slows down)
m.add(spray(0.30) * 0.7, T_SPRAY, bus='sfx')
d = 2.0; nz = noise(d, 'pink')
hiss = svf_sweep(nz, 7500, 1600, q=0.9, mode='bp') * 2.2
envs = np.concatenate([np.linspace(0, 1, n_(0.03)), np.exp(-np.linspace(0, 3.0, n_(d) - n_(0.03)))])
hiss = hiss[:len(envs)] * envs
m.add(reverb(stereo(hiss * 0.5, 0, width=1.0), decay=2.2, mix=0.35, tone=7000), T_SPRAY + 0.02, gain=0.9, bus='sfx')
m.add(downlifter(1.6) * 0.06, T_SPRAY + 0.1, bus='sfx')
m.add(shimmer(2.0, base=1760, n=5, seed_=33) * 0.10, T_SPRAY + 0.15, bus='glass')   # mist catching the light

# ------------------------------------------------------------------------------------------ S5 — the line (8.25–10.50): near silence
oud('D3', CUT['S5'], vel=0.75, d=3.0, trem=True)
pad_seg(['D3', 'A3'], CUT['S5'], CUT['S6'], cutoff=520, gain=0.14, attack=0.6)
ping('A5', T_LINE1 + 0.05, gain=0.04, pan=0.2, d=2.4, bright=0.3)
ping('D6', T_LINE2 + 0.10, gain=0.06, pan=-0.2, d=2.6, bright=0.3)
sub_swell('D2', 9.2, 1.4, gain=0.14, rise=1.1)
m.add(riser(1.1, f_lo=250, f_hi=4000, tonal=True) * 0.05, CUT['S6'] - 1.1, bus='sfx')

# ------------------------------------------------------------------------------------------ S6 — hero (10.50–13.50)
m.add(impact(2.2, sub_f=48, bright=0.3, sub_decay=0.28, space=0.3) * 0.42, CUT['S6'], bus='sfx')
m.add(sub808(nf('D2'), 1.6, glide_from=nf('A2'), glide_t=0.08, decay=0.5) * 0.26, CUT['S6'], bus='music')
oud('D3', CUT['S6'], vel=0.9, d=2.4)
for n, b, v, tr in [('D4', 0.0, 1.0, True), ('A4', 0.5, 0.75, False), ('G4', 1.0, 0.7, False), ('F#4', 1.5, 0.85, True),
                    ('Eb4', 2.0, 0.75, False), ('D4', 2.5, 1.0, True), ('A3', 3.0, 0.55, False), ('D4', 3.5, 0.7, True)]:
    oud(n, CUT['S6'] + b * BEAT, vel=v, trem=tr, pan=0.08)
pad_seg(['D3', 'A3', 'D4', 'F#4', 'A4'], CUT['S6'], T_LIGHTSOUT + 0.4, cutoff=1500, gain=0.24, attack=0.35, release=0.6)
# Khaleeji pulse, very soft: mirwas dum … tak tak
for bar in range(2):
    t0 = CUT['S6'] + bar * 2 * BEAT
    m.add(mirwas_dum() * 0.30, t0, pan=-0.1, bus='perc')
    m.add(mirwas_tak() * 0.16, t0 + BEAT, pan=0.15, bus='perc')
    m.add(mirwas_tak() * 0.12, t0 + 1.5 * BEAT, pan=0.2, bus='perc')
m.add(tabl() * 0.16, T_ENDCARD, bus='perc')            # the name writes on: one deep frame-drum under it
m.add(shimmer(2.2, base=1174.7, n=6, seed_=44) * 0.12, T_ENDCARD, bus='glass')
glass_sing('D6', T_ENDCARD + 0.05, 1.6, gain=0.03)

# ------------------------------------------------------------------------------------------ bus processing
m.process_bus('music', lambda x: x)  # (subs live here on purpose)
m.process_bus('oud', lambda x: reverb(peak_eq(x, 250, 2.5, 1.0), decay=2.4, mix=0.30, tone=5200))
m.process_bus('glass', lambda x: reverb(x, decay=3.0, mix=0.4, tone=8000))
m.process_bus('perc', lambda x: reverb(x, decay=1.4, mix=0.22, tone=5000))


def lights_out(x):
    """Night falls: the score darkens (low-pass) and fades under the sting."""
    N = len(x); tt_ = np.arange(N) / SR
    k = np.clip((tt_ - (T_LIGHTSOUT - 0.15)) / 0.4, 0, 1)
    g = 1 - np.clip((tt_ - T_LIGHTSOUT) / 0.42, 0, 1) ** 1.3
    dark = lp(x, 380, order=2)
    return (x * (1 - k[:, None]) + dark * k[:, None]) * g[:, None]


for b in ('oud', 'music', 'glass', 'perc'):
    m.process_bus(b, lights_out)

# ------------------------------------------------------------------------------------------ TASH signature
m.add(sonic_logo() * 0.95, T_STING)

m.buf *= db(2.6)
for b in m.buses: m.buses[b] *= db(2.6)
out = m.render(ceiling_db=-2.3, glue=True)
# soft tail: the film ends 2.4 s into the sting; fade the last 0.3 s (no hard cut, no endless sub)
N = len(out); fo = n_(0.30)
out[-fo:] *= (np.linspace(1, 0, fo) ** 1.5)[:, None]
path = os.path.join(HERE, 'audio.wav')
wavfile.write(path, SR, out.astype(np.float32))
pk = 20 * np.log10(np.abs(out).max() + 1e-9); rms = 20 * np.log10(np.sqrt((out ** 2).mean()) + 1e-9)
print(f'wrote {path}  dur={N / SR:.2f}s  peak={pk:.1f}dBFS  rms={rms:.1f}dBFS')
