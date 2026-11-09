"""TASH boost ad «نقاط مشروعك»: original score + sound design. Pure synthesis on the TASH engine
(_system/audio/tashaudio.py); no samples, loops or library music. Timings come from cues.json (one source of truth with
the picture). Khaleeji-modern at 120 BPM in D Hijaz; bar 1 = 3.00 s (the drop); 1 beat = 15 frames.

The one motif is the typing tick, pitched D6 / E♭6 / F♯6 with a woodblock body, played right→left 1/6 s apart: the
three notes of the hook, the clap figure in the crowd, and the sonic logo. Harmony follows the picture: D (hook, brand) →
E♭ (the dark studio, the bII of Hijaz) → D when the lights come on (9.00) → a G minor / E♭ / D cadence under the CTA.

Real voices and claps (TREATMENT §9) are optional stems in src/assets/rec/: voice1.wav («مشروعك حلو…», hook A, at 0.00)
and voice2.wav («من وين طلبتيه؟!», at 9.40). Missing stems → the documented fallback: no voices (the text carries every
line) and the synthesised `claps_ensemble`. Synthetic voice is never used.

Run: python3 src/audio.py [--len 20|14] [--hook A|B]  →  src/audio/audio-<len><hook>.wav  (−14 LUFS, ≤ −1.5 dBTP)
"""
import sys, os, json, argparse
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', '_system', 'audio'))
from tashaudio import *  # noqa: F401,F403
from scipy.io import wavfile

ap = argparse.ArgumentParser()
ap.add_argument('--len', default='20', choices=['20', '14'])
ap.add_argument('--hook', default='A', choices=['A', 'B'])
args = ap.parse_args()

C0 = json.load(open(os.path.join(HERE, 'cues.json')))
C = dict(C0)
if args.len == '14':
    C.update({'duration': C0['len14']['duration'], 'studio': C0['len14']['studio'], 'hero3': C0['len14']['hero3'], 'cta': C0['len14']['cta']})
FPS, DUR = C['fps'], C['duration']
S, H3, CT, BR, RT = C['studio'], C['hero3'], C['cta'], C['break'], C['ret']
fr = lambda f: f / FPS
g = Grid(C['bpm'], offset=1.0)                 # bar k starts at 1 + 2k s → bar 1 = 3.00
B = g.beat
NOTES = C['ticks']['notes']                    # D6, E♭6, F♯6
seed(120)
R = np.random.default_rng(120)

TAIL = 2.0
m = Mix(DUR, tail=TAIL)                        # the tail is folded back onto the head (the film loops)


# ----------------------------------------------------------------------------- local voices
def wtick(freq, gain=1.0, body=0.55):
    """The typing tick: a pitched woodblock (tick transient over a damped membrane body)."""
    a = tick(freq, 0.05)
    b = membrane(freq * 0.5, 0.07, 0.011, pitch_drop=0.04, strike=0.25, strike_band=(2500, 7000))
    n = max(len(a), len(b)); y = np.zeros(n); y[:len(a)] += a * 0.9; y[:len(b)] += b * body
    return fade(peak_eq(y, 3500, -3, 1.0), 0.0002, 0.01) * gain


def broken_tick():
    """D6 bending down an octave over 120 ms, with a dry crack."""
    d = 0.2; t = tt(d)
    f = NOTES[0] * 2 ** (-np.clip(t / 0.12, 0, 1))
    x = phase_osc(f, d) * env_exp(d, 0.07, 0.0005) * 0.5
    crack = bp(noise(0.05), 1800, 7000) * env_exp(0.05, 0.006) * 0.9
    x[:len(crack)] += crack
    return fade(x, 0.0002, 0.03)


def thump(gain=1.0):
    """Exit thump: a short body (70 Hz floor) + a 250–800 Hz felt knock + a 2–4 kHz click, so phones hear it."""
    k = hp(kick(f0=120, f1=70, d=0.18, punch=0.4, click=0.0), 60) * 0.5
    knock = bp(noise(0.09), 250, 800) * env_exp(0.09, 0.022) * 0.8
    click = bp(noise(0.01), 2000, 4000) * env_exp(0.01, 0.0025) * 0.5
    y = np.zeros(len(k)); y += k; y[:len(knock)] += knock; y[:len(click)] += click
    return fade(y, 0.0003, 0.03) * gain


def wood_tock(freq=520, gain=1.0):
    return membrane(freq, 0.16, 0.03, pitch_drop=0.05, strike=0.5, strike_band=(1500, 5000)) * gain


def lamp_clack(gain=1.0):
    """A heavy lamp clack over a 120 Hz filament-hum swell (saturated so phones hear the harmonics)."""
    cl = membrane(1300, 0.09, 0.012, pitch_drop=0.02, strike=1.2, strike_band=(2500, 9000)) * 0.9
    d = 0.9; t = tt(d)
    hum = (phase_osc(120, d) + 0.5 * phase_osc(240, d) + 0.25 * phase_osc(360, d)) * (1 - np.exp(-t / 0.05)) * np.exp(-t / 0.45) * 0.22
    y = sat(hum, 2.0) * 0.6; y[:len(cl)] += cl
    return fade(y, 0.0003, 0.1) * gain


def hum_bed(d, level=1.0):
    t = tt(d)
    x = (phase_osc(120, d) + 0.45 * phase_osc(240, d) + 0.2 * phase_osc(360, d)) * (1 + 0.15 * np.sin(2 * np.pi * 0.7 * t))
    return fade(sat(x * 0.1, 1.6) * level, 0.2, 0.3)


def air_fall(d=0.27, gain=1.0, pan=0.0):
    """Short descending air as a dot falls toward the camera."""
    x = svf_sweep(noise(d, 'pink'), 3500, 500, q=3.0)
    e = np.linspace(0, 1, n_(d)) ** 1.8
    return stereo(x * e * 0.5 * gain, pan)


def room_tone(d):
    """Room air in the band a phone speaker plays (never rumble, never digital silence)."""
    return stereo(bp(noise(d, 'pink'), 160, 2400) * 0.02 + bp(noise(d, 'pink'), 900, 4000) * 0.03, 0, width=0.8)


def bass808(f, d, glide=None, gain=1.0, drive=3.2):
    """The 808, lighter (−6 dB) plus a band-passed saturated copy (250–1500 Hz) so the note reads on phones."""
    x = mono(sub808(f, d, glide_from=glide, drive=drive))
    mid = bp(sat(x * 4.0, 3.0), 250, 1500) * 0.4
    return (x * 0.4 + mid) * gain


def group_clap(seed_=0, n=7, d=0.38):
    """A group clap: one of the recorded takes in src/assets/rec/clap_*.wav when present (round-robin), else synthesised."""
    if CLAPS:
        c = CLAPS[seed_ % len(CLAPS)]
        return c * (0.9 + 0.2 * ((seed_ * 37) % 10) / 10)
    return claps_ensemble(n, d, seed_=seed_)


def epiano(f, d=1.2, vel=0.8, bright=0.55):
    """Soft Rhodes-like e-piano (FM bark into a sine, short tine, gentle tremolo): the warm mid-range of the groove."""
    t = tt(d)
    idx = (0.55 * bright + 0.5 * vel) * np.exp(-t / 0.25) + 0.12
    car = np.sin(2 * np.pi * f * t + np.sin(2 * np.pi * f * t) * idx)
    tine = np.sin(2 * np.pi * f * 6.98 * t) * np.exp(-t / 0.03) * 0.1 * vel
    y = (car + tine) * env_exp(d, 0.9 + 120 / f, 0.004) * vel
    y = hp(lp(y, 2600 + 1800 * bright), 160)
    trem = 0.08 * np.sin(2 * np.pi * 4.0 * t)
    return fade(np.stack([y * (1 + trem), y * (1 - trem)], axis=1) * 0.45, 0.002, 0.15)


def _read(p):
    sr, x = wavfile.read(p)
    x = x.astype(np.float32) / (32768.0 if np.issubdtype(x.dtype, np.integer) else 1.0)
    if sr != SR:
        from scipy.signal import resample_poly
        x = resample_poly(x, SR, sr, axis=0)
    return x


def deess(x, f=5500, thresh_db=-30, ratio=4.0):
    """Light de-esser: compress only the band above f."""
    hi = hp(x, f, order=4); lo = x - hi
    return lo + compress(hi, thresh_db=thresh_db, ratio=ratio, attack=0.002, release=0.06)[:len(hi), 0]


def load_stem(name, target_lufs=-20.0):
    """A recorded line: HPF 90 Hz, light de-ess, loudness-matched (no pitch or time effects, no AI)."""
    p = os.path.join(HERE, 'assets', 'rec', name)
    if not os.path.exists(p): return None
    x = mono(_read(p)); x = hp(x, 90); x = mono(deess(x))
    return x * db(target_lufs - lufs(stereo(x)))


CLAPS = []
_rec = os.path.join(HERE, 'assets', 'rec')
if os.path.isdir(_rec):
    for fn in sorted(os.listdir(_rec)):
        if fn.startswith('clap_') and fn.endswith('.wav'):
            c = mono(_read(os.path.join(_rec, fn))); c = hp(c, 120)
            on = int(np.argmax(np.abs(c) > 0.1 * np.abs(c).max())); c = fade(c[max(0, on - n_(0.002)):], 0.001, 0.05)   # onset on the grid
            CLAPS.append(stereo(c * db(-29 - lufs(stereo(c))), 0, width=0.6))


D2, A1, C2, Eb2, G1 = nf('D2'), nf('A1'), nf('C2'), nf('Eb2'), nf('G1')
CHORDS = {'D': ['D3', 'F#3', 'A3', 'D4'], 'Eb': ['Eb3', 'G3', 'Bb3', 'Eb4'], 'Gm': ['G2', 'D3', 'G3', 'Bb3'], 'Dsus': ['D3', 'G3', 'A3', 'D4']}


# ----------------------------------------------------------------------------- the score
tickT = lambda t0, i: t0 + i / 6                         # dot i peaks 1/6 s after dot i−1 (right→left)
last_bar = int((DUR - 1.0) // 2)                        # bars 1..last_bar start inside the film

# room tone everywhere (no digital silence)
m.add(room_tone(DUR + 0.1), 0.0, gain=0.5)

# --- 0.00–1.00 HOOK: onset slam + typing ticks (+ voice 1 on hook A)
m.add(thump(0.6), 0.0, bus='sfx'); m.add(wood_tock(330, 0.85), 0.0, bus='sfx')
m.add(stereo(bp(noise(0.06), 300, 3000) * env_exp(0.06, 0.012) * 0.55, 0, width=0.5), 0.0, bus='sfx')   # the slam's body, in the phone band
m.add(stereo(hp(noise(0.25, 'pink'), 2500) * env_exp(0.25, 0.05) * 0.18, 0, width=0.8), 0.0, bus='sfx')
v1 = load_stem('voice1.wav')
vdk = db(-6) if (v1 is not None and args.hook == 'A') else 1.0      # ticks duck under a recorded voice 1
for i in range(3): m.add(wtick(NOTES[i]), tickT(0.0, i), gain=0.5 * vdk, pan=[0.25, 0, -0.25][i], bus='sfx')
if args.hook == 'A' and v1 is None:                                 # no voice 1: fill its slot with typing echoes + a tock under «حلو…»
    for k, (dly, gn) in enumerate([(0.375, 0.2), (0.75, 0.1)]):
        for i in range(3): m.add(lp(wtick(NOTES[i]), 3200), tickT(0.0, i) + dly, gain=gn * vdk, pan=[-0.4, 0.4][k % 2], bus='sfx')
    m.add(wood_tock(560, 0.45 * vdk), fr(15), bus='sfx')
if v1 is not None and args.hook == 'A': m.add(v1, 0.0, gain=0.9, bus='voice')
if args.hook == 'B':                                      # a soft wooden tock under each word swap; heavy on «مشروعك»
    m.add(wood_tock(560, 0.45), fr(15), bus='sfx')
    m.add(thump(0.5), fr(30), bus='sfx'); m.add(wood_tock(380, 0.5), fr(30), bus='sfx')
m.add(pad([nf(n) for n in ['D3', 'A3']], 1.1, cutoff=700, attack=0.3, release=0.3), 0.0, gain=0.10, bus='music')

# --- 1.00 the talk breaks: broken tick, three falls toward the camera, three heavy thumps
m.add(broken_tick(), fr(BR['crack']), gain=0.7, pan=0.25, bus='sfx')
m.add(reverb(hp(broken_tick(), 400), decay=1.3, mix=1.0, tone=3500), fr(BR['crack']), gain=0.24, bus='sfx')   # the crack rings out
for i, (fs, fe) in enumerate(zip(BR['fall'], BR['exit'])):
    m.add(air_fall(fr(fe - fs) + 0.02, 0.42, [0.3, 0.05, -0.25][i]), fr(fs), bus='sfx')
    m.add(thump(db(-1.5 * i)), fr(fe), gain=0.34, pan=[0.2, 0, -0.2][i], bus='sfx')

# --- 1.50–2.40: room tone + a low D pad (−30 dB). Nobody's talking.
m.add(sat(pad([nf('D4'), nf('A4'), nf('D5')], 1.5, cutoff=2200, attack=0.35, release=0.5) * 1.6, 1.4), fr(BR['crack']), gain=0.11, bus='music')   # audible on phones

# --- 2.40 the return: a low-passed dum from below, rising ticks, six rapid ticks, a light whoosh
m.add(lp(mirwas_dum(), 600), fr(RT['stir']), gain=0.8, bus='sfx')
for k, f in enumerate(sorted(RT['enter'])): m.add(wtick(NOTES[k] * 0.5 * 2 ** (k / 12)), fr(f), gain=0.5, pan=0.35, bus='sfx')
for k, f in enumerate(RT['rapid']): m.add(wtick(NOTES[2] * 2 ** ((2 * k - 4) / 12), body=0.3), fr(f), gain=0.32 + 0.04 * k, bus='sfx')
m.add(hp(whoosh(0.42, 500, 5200, pan_from=0.5, pan_to=-0.1, peak=0.8), 150), fr(88) - 0.34, gain=0.45, bus='sfx')

# --- HERO 1 (3.00): tash_hit + group claps + a saturated 808 on D
m.add(hp(tash_hit(), 60), 3.0 - 0.004, gain=1.0, bus='sfx')
m.add(bass808(D2, 1.6, glide=D2 * 1.5, gain=0.34, drive=3.4), 3.0, bus='music')
for i in range(3): m.add(wtick(NOTES[i], 0.8), tickT(4.0, i), gain=0.32, pan=[0.25, 0, -0.25][i], bus='sfx')   # the proud triplet


# --- the groove: mirwas dum/tak, claps on 2 & 4, swung shaker, an 808 line, a pad
def groove_bar(b, level=1.0, claps=True, bass=True, chord='D', shaker_=True):
    t0 = g.t(b)
    if t0 >= DUR: return
    add = m.add
    def gadd(x, at, **kw):                                           # no onset at or after the end: only tails fold into the head
        if at < DUR - 0.005: add(x, at, **kw)
    m.add = gadd
    sw = 0.06 * B
    for beat, kind, v in [(0, 'dum', 1.0), (0.75, 'tak', 0.55), (1.5, 'tak', 0.7), (2, 'dum', 0.85), (2.5, 'dum', 0.6), (3, 'tak', 0.7), (3.5, 'tak', 0.5), (3.75, 'tak', 0.35)]:
        at = t0 + beat * B + (sw if (beat * 2) % 2 == 1 else 0)
        m.add(mirwas_dum() if kind == 'dum' else mirwas_tak(), at, gain=v * (0.5 if kind == 'dum' else 0.7) * level, pan=-0.1 if kind == 'tak' else 0.0, bus='music')
    if claps:
        for beat in (1, 3): m.add(group_clap(int(b * 7 + beat)), t0 + beat * B, gain=0.7 * level, bus='music')
    if shaker_:
        for k in range(16):
            at = t0 + k * B / 4 + (0.03 if k % 2 else 0)
            m.add(shaker(0.09), at, gain=(0.22 if k % 4 == 0 else 0.13) * level, pan=0.3, bus='music')
    if bass:
        for beat, f, d, glide in [(0, D2, 0.85, None), (1.75, D2 * 2, 0.22, None), (2.5, A1, 0.45, None), (3.5, D2, 0.4, C2)]:
            m.add(bass808(f, d, glide=glide, gain=0.22 * level), t0 + beat * B, bus='music')
    m.add(pad([nf(n) for n in CHORDS[chord]], 2.05, cutoff=1900, attack=0.25, release=0.5), t0, gain=0.16 * level, bus='music')
    up = [nf(n) * 2 for n in CHORDS[chord][1:]]                      # rootless voicing, one octave up
    for beat, d, v in [(0, 1.0, 0.75), (1.5, 0.35, 0.5), (2.5, 0.6, 0.62), (3.5, 0.3, 0.45)]:
        for k, f in enumerate(up): m.add(epiano(f, d, v), t0 + beat * B + 0.008 * k, gain=0.2 * level, pan=[-0.3, 0, 0.3][k], bus='music')
    m.add = add


lt = fr(S['lightsOn'])
snap = fr(H3['snap'])
bars = [b for b in range(1, last_bar + 1) if g.t(b) < DUR]
brand = max(b for b in bars if g.t(b) <= snap + 0.01)            # the bar that starts on (or holds) the snap
cta_bars = [b for b in bars if b > brand]
CAD = ['Gm', 'Eb', 'D'][-len(cta_bars):] if cta_bars else []      # cadence under the CTA, always ending on D
for b in bars:
    t0 = g.t(b)
    if t0 < 5.0: groove_bar(b, 1.0, chord='D')
    elif t0 < lt - 0.01: groove_bar(b, 0.9, chord='Eb', bass=t0 >= 7.0 - 0.01)           # the dark studio: bII of Hijaz
    elif b <= brand: groove_bar(b, 1.0, chord='D')                                      # lights on, crowd, the brand bar
    else: groove_bar(b, 0.62, chord=CAD[cta_bars.index(b)])

# --- the studio: the room opens (plate), lift, flights, lamp clacks + hum, riser, home tocks
cut = fr(S['cut'])
m.add(reverb(impact(1.2, sub_f=46, bright=0.35, space=0.0)[:, 0] * 0.6, decay=2.2, mix=0.55, tone=4200), cut, gain=0.4, bus='sfx')
m.add(riser(0.22, 900, 5000, tonal=False), fr(S['lift']) - 0.14, gain=0.25, bus='sfx')
for i, (fs, fe) in enumerate(S['fly']):
    m.add(whoosh(fr(fe - fs) + 0.05, 600, 4200, pan_from=0.0, pan_to=[0.6, 0.15, -0.6][i], peak=0.65), fr(fs), gain=0.32, bus='sfx')
    m.add(lamp_clack(), fr(fe), gain=0.75, pan=[0.55, 0.1, -0.55][i], bus='sfx')
first_lamp = min(fe for _, fe in S['fly'])
m.add(hum_bed(lt - fr(first_lamp) + 0.3, 1.0), fr(first_lamp), gain=0.55, bus='sfx')
m.add(riser(1.0, 250, 7000), lt - 1.0, gain=0.26, bus='sfx')
for k in range(3):
    m.add(whoosh(0.4, 700, 3800, pan_from=[0.6, 0.15, -0.6][k], pan_to=0.0, peak=0.7), fr(S['detach']), gain=0.18, bus='sfx')
    m.add(wood_tock(470 + 40 * k, 0.55), fr(S['homeRow']) + (k - 1) * 2 / FPS, pan=[0.2, 0, -0.2][k], bus='sfx')

# --- HERO 2 (lights on): a deep lamp thunk + low dum + one group clap
m.add(hp(impact(1.6, sub_f=50, bright=0.5, space=0.25), 60), lt - 0.004, gain=0.6, bus='sfx')
m.add(lamp_clack(1.2), lt, gain=0.95, bus='sfx')
m.add(wood_tock(300, 0.7), lt, bus='sfx')                           # HERO 2's body in the phone band
m.add(mirwas_dum(), lt, gain=0.9, bus='sfx')
m.add(group_clap(91, 10, 0.4), lt, gain=0.95, bus='sfx')
m.add(hum_bed(fr(S['fallAway'][0]) - lt, 0.6), lt, gain=0.4, bus='sfx')
v2 = load_stem('voice2.wav')
if v2 is not None and S.get('talk'): m.add(v2, 9.4, gain=0.9, bus='voice')

# typing ticks while the dots type on the lit ش (soft; louder in the crowd)
crowd0 = fr(S['crowd'][0]) if S.get('crowd') else 99
for sec in range(int(lt), int(fr(S['fallAway'][0])) + 1):
    for i in range(3):
        at = tickT(sec, i)
        if at < lt + 0.45 or at >= fr(S['fallAway'][0]) or at >= H3['t0'] + 0.1: continue
        dk = db(-6) if (v2 is not None and S.get('talk') and 9.4 <= at < 10.7) else 1.0
        m.add(wtick(NOTES[i]), at, gain=(0.2 if at < crowd0 else 0.3) * dk, pan=[0.25, 0, -0.25][i], bus='sfx')

# --- the crowd: group claps on the triplets + an applause swell as the 18 triplets bloom
if S.get('crowd'):
    c0, c1 = fr(S['crowd'][0]), fr(S['stream'][1])
    for sec in [int(c0), int(c0) + 1]:
        for i in range(3):
            at = tickT(sec, i)
            if c0 - 0.05 <= at < c1: m.add(group_clap(int(at * 100), 12, 0.36), at, gain=0.55, pan=[0.2, 0, -0.2][i], bus='sfx')
    n = 46
    for k in range(n):
        at = c0 + (c1 - c0) * (k / n) ** 0.8 + R.normal(0, 0.012)
        m.add(clap(0.25, (R.uniform(700, 1100), R.uniform(2400, 4200)), spread=R.uniform(0.006, 0.012)), at, gain=0.12 + 0.18 * k / n, pan=R.uniform(-0.8, 0.8), bus='sfx')
    for k in range(4): m.add(mirwas_tak(), c1 - 0.5 + k * 0.125, gain=0.5, bus='sfx')
    m.add(riser(fr(S['fallAway'][0]) - H3['t0'] + 0.1, 400, 8000), H3['t0'] + 0.0, gain=0.3, bus='sfx')


# --- HERO 3: the local sonic logo (ticks on the typing peaks, one tash_hit, the shadda pop)
def sonic_logo_local(t0):
    E = json.load(open(os.path.join(HERE, '..', '..', '_system', 'motion', 'endcard-cues.json')))
    ticks = [0.12, 0.2867, 0.4533]
    for k, dt in enumerate(ticks): m.add(wtick(NOTES[k], 1.1), t0 + dt, gain=0.5, pan=[0.25, 0, -0.25][k], bus='sfx')
    m.add(whoosh(0.5, 400, 6000, pan_from=0.4, pan_to=-0.2), snap - 0.42, gain=0.5, bus='sfx')
    m.add(hp(tash_hit(), 60), snap - 0.004, gain=1.05, bus='sfx')
    m.add(pop(500, 1300, 0.06), fr(H3['shadda']) + 0.06, gain=0.42, bus='sfx')
    return E


sonic_logo_local(H3['t0'])
m.add(bass808(D2, 1.4, glide=D2 * 1.5, gain=0.32, drive=3.4), snap, bus='music')

# --- hand-back + CTA: a soft tock as the dots settle, calm ticks, the last bar ends on the triplet
m.add(wood_tock(440, 0.6), fr(CT['swap'][1]) - 2 / FPS, bus='sfx')
for sec in range(int(fr(CT['swap'][1])), int(DUR)):
    for i in range(3):
        at = tickT(sec, i)
        if tickT(sec, 0) < CT['calm'] - 0.01 or at >= DUR: continue
        loud = sec == int(DUR) - 1
        m.add(wtick(NOTES[i]), at, gain=0.34 if loud else 0.16, pan=[0.25, 0, -0.25][i], bus='sfx')
# the loop wind-up: a short reverse swell into the seam (f0's slam lands as the next beat)
sw = stereo(fade(hp(noise(0.22, 'pink'), 1200) * np.linspace(0, 1, n_(0.22)) ** 2.5 * 0.22, 0.001, 0.003), 0, width=0.7)
m.add(sw, DUR - 0.22, bus='sfx')


# ----------------------------------------------------------------------------- automation (ducks and reading dips)
def automation(N, points):
    """points: [(t, dB), ...] linear in dB between points."""
    ts = np.arange(N) / SR
    tp = [p[0] for p in points]; vp = [p[1] for p in points]
    return db(np.interp(ts, tp, vp))


N = len(m.buf)
mus = [(0, 0), (2.95, 0), (3.3, -3), (3.45, -6), (4.9, -6), (5.0, 0)]
if S.get('talk'): mus += [(9.3, 0), (9.45, -6), (11.4, -6), (11.5, 0)]
mus += [(H3['t0'] + 0.82 - 0.02, 0), (snap - 0.3, -14), (snap - 0.004, -14), (snap + 0.02, 0)]
if H3.get('tag'): mus += [(fr(H3['tag'][0]) - 0.1, 0), (fr(H3['tag'][0]) + 0.1, -5), (fr(H3['tagOut']), -5)]
mus += [(fr(CT['swap'][0]), -2), (fr(CT['words'][0]), -5), (fr(CT['words'][0]) + 1.0, -5), (DUR - 0.6, -4), (DUR, -8)]
mus.sort()
duck = [(0, 0)]
if v1 is not None and args.hook == 'A': duck += [(0.0, -6), (0.95, -6), (1.05, 0)]
if v2 is not None and S.get('talk'): duck += [(9.35, 0), (9.42, -6), (10.6, -6), (10.75, 0)]
duck = sorted(duck + [(DUR + TAIL, 0)])
m.process_bus('music', lambda x: x * automation(len(x), mus)[:, None] * automation(len(x), duck)[:, None])
m.process_bus('music', lambda x: x + reverb(hp(x, 250), decay=0.9, mix=1.0, tone=5000)[:len(x)] * 0.12)   # the room, high-passed


def low_mono(x, f=150, trim_db=-2.0):
    lo = lp(x, f, order=4); hi = x - lo
    lo_m = lo.mean(axis=1, keepdims=True) * db(trim_db)
    return hi + np.repeat(lo_m, 2, axis=1)


m.process_bus('music', lambda x: peak_eq(low_mono(x, 150, -3.0), 2500, 2.5, 0.8))
m.process_bus('sfx', lambda x: low_mono(x, 150, 0.0))
m.process_bus('sfx', lambda x: x * automation(len(x), [(0, 0), (snap - 0.3, 0), (snap - 0.25, -2), (snap - 0.01, 0), (DUR + TAIL, 0)])[:, None])

# ----------------------------------------------------------------------------- loop-aware master
import subprocess, tempfile
from scipy import signal as _sig


def limit(x, ceiling_db=-2.0, look=0.004, release=0.08):
    """Look-ahead peak limiter with NO delay (centred peak window) and the gain state starting at 1 (no fade-in)."""
    c = db(ceiling_db); d = n_(look)
    up = _sig.resample_poly(x, 4, 1, axis=0)                          # true-peak detection on a 4× oversampled copy
    tp = np.abs(up).max(axis=1)[:4 * len(x)].reshape(-1, 4).max(axis=1)
    pk = maximum_filter1d(np.maximum(tp, np.abs(x).max(axis=1)), 2 * d + 1)
    g = np.minimum(1.0, c / (pk + 1e-9))
    a_ = math.exp(-1 / (release * SR))
    gs, _ = _sig.lfilter([1 - a_], [1, -a_], g, zi=[g[0] * a_])
    return np.clip(x * np.minimum(g, gs)[:, None], -c, c)


def ffmpeg_lufs(x):
    with tempfile.NamedTemporaryFile(suffix='.wav') as f:
        wavfile.write(f.name, SR, x.astype(np.float32))
        o = subprocess.run(['ffmpeg', '-nostats', '-i', f.name, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    I = float([l for l in o.splitlines() if l.strip().startswith('I:')][-1].split()[1])
    P = float([l for l in o.splitlines() if l.strip().startswith('Peak:')][-1].split()[1])
    return I, P


raw = m.buf.copy()
for b in m.buses.values(): raw += b[:len(raw)]
Nf = n_(DUR)
loop = raw[:Nf].copy(); loop[:len(raw) - Nf] += raw[Nf:]          # the tail rings into the head, as it does on replay
tile = np.vstack([loop, loop, loop])
tile = hp(tile, 24, order=4)
tile = compress(tile, thresh_db=-14, ratio=2.0, attack=0.01, release=0.15)
tile = sat(tile * 1.05, 1.15)
y = tile[Nf:2 * Nf]
for _ in range(4):                                                 # loudness by ffmpeg's meter (what the platforms and the mux see)
    yl = limit(np.vstack([y, y, y]), -2.2)[Nf:2 * Nf]
    I, P = ffmpeg_lufs(yl)
    if abs(I + 14.0) < 0.1: break
    y = y * db(-14.0 - I)
y = yl
os.makedirs(os.path.join(HERE, 'audio'), exist_ok=True)
out = os.path.join(HERE, 'audio', f'audio-{args.len}{args.hook}.wav')
wavfile.write(out, SR, y.astype(np.float32))
I, P = ffmpeg_lufs(y)


def share(x, lo, hi):
    f, p = _sig.welch(x.mean(axis=1), SR, nperseg=8192)
    return p[(f >= lo) & (f < hi)].sum() / p[(f >= 20)].sum()


print(f'wrote {out}: {I:.1f} LUFS, true peak {P:.1f} dBTP · energy <150 Hz {100 * share(y, 20, 150):.0f}% · 500–6k {100 * share(y, 500, 6000):.0f}% · '
      f'first sample {np.abs(y[:48]).max():.3f} · seam jump {np.abs(y[0] - y[-1]).max():.3f}')
