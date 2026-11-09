"""DOSE: original score + sound design for the «ناقصك دوز.» spec story ad. Everything is synthesised here or by the
TASH engine (_system/audio/tashaudio.py); no library music, no Kling audio. Timings come from cues.json.

Shape: a flat, muffled room under the low mood battery (two low-battery blips, a slow charging riser) → the first dose
lands on bar 1 (1.8 s): a warm ~100 BPM house/lo-fi groove in F (rootless e-piano chords, round bass, soft kick,
finger snaps on 2 & 4, swung shaker). Every dose = one meter step = one rising pluck: C5, D5, F5, G5 (a 4-note motif)
resolving on A5 + C6 at ١٠٠٪ (10.8 s, on F6/9). Foley on picture: grinder whirr + bean rattle, the iced pour and the ice
plunging into the cup (on the visible landings), the espresso into milk, the sauce, the terrace air (v2: no foley
without a visible cause). The match (12.6 s) resolves C9sus4 → Fmaj9 (the wall sign becomes the mark = home), then the
TASH sonic logo. Run: python3 src/audio.py → src/audio.wav (pre-mastered to −14 LUFS, true peak ≤ −1.5 dBTP)."""
import sys, os, json
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.normpath(os.path.join(HERE, '..', '..', '_system', 'audio')))
from tashaudio import *  # noqa: F401,F403

C = json.load(open(os.path.join(HERE, 'cues.json')))
EV = C['ev']; DUR = C['duration']
g = Grid(C['bpm'], offset=C['downbeat'])       # bar 0 = the first dose (1.8 s); 1 beat = 0.6 s
B = g.beat
R = np.random.default_rng(100)
seed(100)


# ----------------------------------------------------------------------------- local voices
def epiano(f, d=2.4, vel=0.8, bright=0.5, pan=0.0):
    """soft Rhodes-like e-piano (1:1 FM bark into a sine, short tine, slow tremolo), lowpassed warm (from the MOR ad)"""
    t = tt(d)
    idx = (0.55 * bright + 0.5 * vel) * np.exp(-t / 0.26) + 0.12
    car = np.sin(2 * np.pi * f * t + np.sin(2 * np.pi * f * t) * idx)
    tine = np.sin(2 * np.pi * f * 6.98 * t) * np.exp(-t / 0.035) * 0.10 * vel
    body = np.sin(2 * np.pi * f * 2 * t) * np.exp(-t / 0.5) * 0.12
    y = (car + tine + body) * env_exp(d, 1.4 + 160 / f, 0.004) * vel
    y = hp(lp(y, 2600 + 1800 * bright), 120)
    trem = 0.09 * np.sin(2 * np.pi * 3.3 * t)
    st = np.stack([y * (1 + trem), y * (1 - trem)], axis=1) * 0.5
    if pan: st = stereo(mono(st), pan)
    return fade(st, 0.002, 0.25)


def chord(m, at, notes, vel=0.7, spread=0.018, bright=0.5, d=2.4, gain=0.27, bus='keys'):
    for k, n in enumerate(notes):
        m.add(epiano(nf(n), d, vel * (0.92 + 0.08 * R.random()), bright, pan=(k / max(1, len(notes) - 1) - 0.5) * 0.5),
              at + k * spread + R.uniform(0, 0.005), gain=gain, bus=bus)


def roundbass(f, d=0.5, vel=1.0):
    y = phase_osc(f, d) + 0.3 * phase_osc(2 * f, d) + 0.08 * phase_osc(3 * f, d)
    return fade(sat(y * env_adsr(d, 0.008, 0.18, 0.6, 0.12) * vel, 1.5) * 0.5, 0.003, 0.04)


def softkick():
    return lp(kick(f0=120, f1=48, d=0.42, punch=0.6, click=0.15), 2600)


def snap(seed_=1):
    """finger snap: a short bright crack with a tiny tonal body"""
    r = np.random.default_rng(seed_); d = 0.16; t = tt(d)
    nz = bp(r.uniform(-1, 1, n_(d)), 1800, 7000) * np.exp(-t / 0.018)
    body = np.sin(2 * np.pi * 1350 * t) * np.exp(-t / 0.01) * 0.3
    return fade((nz + body) * 0.7, 0.0002, 0.02)


def dose_pluck(note, vel=1.0):
    """the meter's rising note: a bright, round pluck (two detuned KS strings + a soft sine body) with a little air"""
    f = nf(note); a = pluck(f, 1.6, bright=0.7); b = pluck(f * 1.003, 1.6, bright=0.55)
    n = min(len(a), len(b)); s = sine_bell(f, 1.6)[:n]
    return lp((a[:n] * 0.55 + b[:n] * 0.35 + s * 0.35) * vel, 7000)


def sine_bell(f, d):
    t = tt(d); return (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.2)) * np.exp(-t / 0.55) * 0.6


def low_batt():
    """phone-style low-battery chirp: two short descending tones, a little square in them"""
    out = np.zeros(n_(0.3))
    for t0, f, d in ((0.0, 1046.5, 0.07), (0.085, 784.0, 0.1)):
        x = phase_osc(f, d) * 0.8 + 0.2 * np.sign(phase_osc(f, d))
        x = lp(x, 4000) * env_adsr(d, 0.004, 0.02, 0.8, 0.03)
        out[n_(t0):n_(t0) + len(x)] += x
    return fade(out * 0.5, 0.001, 0.02)


def grinder(d=1.6):
    """a commercial burr grinder heard from across the bar: motor hum + burr grit, spinning up and easing off"""
    t = tt(d); spin = np.clip(t / 0.18, 0, 1) * np.clip((d - t) / 0.35, 0, 1)
    f0 = 118 * (0.8 + 0.2 * np.clip(t / 0.25, 0, 1))
    hum = phase_osc(f0, d, 'saw') * 0.3 + phase_osc(2 * f0, d) * 0.2
    grit = bp(noise(d, 'pink'), 900, 5200) * (0.6 + 0.4 * np.sin(2 * np.pi * 37 * t) ** 2)
    return stereo(lp(hum, 900) * spin * 0.35 + grit * spin * 0.22, 0.2, width=0.4)


def beans(d=1.2, density=55, seed_=4):
    """beans tumbling in a hopper: many tiny woody clicks"""
    r = np.random.default_rng(seed_); out = np.zeros(n_(d))
    for _ in range(int(density * d)):
        t0 = r.uniform(0, d - 0.03); f = r.uniform(1800, 4200); dd = 0.012
        c = np.sin(2 * np.pi * f * tt(dd)) * np.exp(-tt(dd) / 0.003) * r.uniform(0.2, 0.7)
        out[n_(t0):n_(t0) + len(c)] += c
    return stereo(hp(out, 900) * 0.6, -0.15, width=0.5)


def ice_plunk(f=2900, seed_=1, splash=0.6):
    """an ice cube plunging into a cup: a glassy knock, a short bubbly gulp and a splash of air"""
    r = np.random.default_rng(seed_); d = 0.45; t = tt(d)
    knock = sum(np.sin(2 * np.pi * f * m * (1 + r.uniform(-0.01, 0.01)) * t) * np.exp(-t / (0.05 / m)) * a
                for m, a in ((1, 1), (1.73, 0.55), (2.41, 0.3)))
    gulp = np.sin(2 * np.pi * np.cumsum(420 + 900 * np.exp(-t / 0.03)) / SR) * np.exp(-t / 0.05) * 0.5
    spl = bp(noise(d), 2500, 9000) * np.exp(-t / 0.06) * splash
    return fade(hp(knock * 0.35 + gulp * 0.4 + spl * 0.35, 300), 0.0003, 0.05)


def porcelain(f1=2310):
    d = 0.6; t = tt(d)
    y = (np.sin(2 * np.pi * f1 * t) * np.exp(-t / 0.11) + 0.55 * np.sin(2 * np.pi * f1 * 1.7 * t) * np.exp(-t / 0.06)
         + 0.3 * np.sin(2 * np.pi * f1 * 0.51 * t) * np.exp(-t / 0.05))
    return fade(y * 0.35 + bp(noise(d), 2000, 8000) * env_exp(d, 0.0015) * 0.4, 0.0003, 0.05)


def chair_scrape(d=0.42):
    """a folding bistro chair dragged a few cm on stone: a rough metallic scrape with a pitch wobble"""
    t = tt(d); f = 520 + 140 * np.sin(2 * np.pi * 7 * t) + 80 * t
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * (0.5 + 0.5 * (np.sin(2 * np.pi * 41 * t) > 0))
    grit = bp(noise(d), 1200, 6000)
    e = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.5
    return stereo(bp(sat(tone * 0.5 + grit * 0.6, 1.8), 400, 5000) * e * 0.35, 0.35, width=0.3)


def street(d):
    """the terrace: soft open air, a far car, a bird or two (late afternoon, Jahra)"""
    air = stereo(hp(lp(noise(d, 'pink'), 1800), 120) * 0.07, 0, width=0.8)
    car = svf_sweep(noise(d, 'pink'), 200, 600, q=0.8, mode='lp') * np.sin(np.linspace(0, np.pi, n_(d))) ** 2 * 0.18
    out = air + stereo(car, -0.5, width=0.3)
    r = np.random.default_rng(9)
    for t0 in (0.6, 1.9):
        dd = 0.16; tt_ = tt(dd); f = 3600 + 1400 * np.sin(2 * np.pi * 9 * tt_)
        chirp = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * tt_ / dd) ** 2 * 0.05
        out[n_(t0):n_(t0) + len(chirp)] += stereo(chirp, r.uniform(-0.7, 0.7))
    return out


# ----------------------------------------------------------------------------- arrangement
m = Mix(DUR, tail=0.5)
# v3 end card + tail (measured: 300 Hz high-passed 200 ms RMS >= -26 dBFS over 12.6-15.0; 50 ms RMS between the
# sting's ticks -38..-40 dBFS, the ticks 15-16 dB above it): the end-card pad 0.18 -> 0.26, two Fmaj9 re-strikes
# (13.50 and the pushed 16th 14.55), the music ducked -15 dB for the tail, and a separate tail pad on the sting bus
PADG, RSG, RS2, TAILDUCK, TAILGAIN = 0.26, 0.32, 3.25, -15, 0.065
T = lambda bar, beat=0: g.t(bar, beat)

# ---- HOOK (0–1.8): a flat, muffled room; the battery is low
room = stereo(hp(lp(noise(2.2, 'brown'), 380), 40) * 0.25, 0, width=0.6)
m.add(fade(room, 0.02, 0.25), 0.0, gain=0.9, bus='amb')
m.add(lp(pad([nf(n) for n in ('F3', 'A3', 'C4', 'E4')], 2.0, cutoff=420, detune=0.05, attack=0.15, release=0.4), 600), 0.0, gain=0.11, bus='amb')
for t0 in (0.0, 0.6, 1.2):                                         # a muffled pulse (tempo, heartbeat-ish)
    m.add(lp(softkick(), 300), t0, gain=0.32, bus='amb')
m.add(low_batt(), EV['blip1'], gain=0.55, bus='sfx', pan=0.0)
m.add(low_batt(), EV['blip2'], gain=0.5, bus='sfx', pan=0.0)
# v2: the hook plate is the start of the iced pour (grey, defocused): the pour heard through the same muffled room
m.add(fade(lp(pour(1.9, seed_=11), 420), 0.08, 0.3), 0.0, gain=0.42, bus='amb', pan=-0.1)
m.add(riser(0.85, 400, 6000, tonal=False), EV['dose1'] - 0.85, gain=0.2, bus='sfx')                 # charging
m.add(whoosh(0.4, 600, 5200, pan_from=0.2, pan_to=-0.2, peak=0.8), EV['dose1'] - 0.32, gain=0.22, bus='sfx')
m.add(impact(1.2, sub_f=55, bright=0.35, sub_decay=0.14, space=0.25), EV['dose1'] - 0.004, gain=0.3, bus='sfx')

# ---- the meter's rising note: one per dose (C D F G), resolving on A + C at ١٠٠٪
for ev, note, vel in (('dose1', 'C5', 0.9), ('dose2', 'D5', 0.9), ('dose3', 'F5', 0.95), ('dose4', 'G5', 1.0)):
    m.add(dose_pluck(note, vel), EV[ev] + 0.004, gain=0.42, bus='pluck', pan=0.05)
m.add(dose_pluck('A5', 1.0), EV['full'] + 0.004, gain=0.46, bus='pluck', pan=-0.08)
m.add(dose_pluck('C6', 0.85), EV['full'] + 0.09, gain=0.36, bus='pluck', pan=0.12)
m.add(shimmer(1.6, base=1760, n=6, seed_=7), EV['full'] + 0.02, gain=0.14, bus='sfx')
m.add(riser(0.6, 500, 7000, tonal=False), EV['full'] - 0.6, gain=0.13, bus='sfx')
m.add(impact(1.4, sub_f=50, bright=0.4, sub_decay=0.16, space=0.3), EV['full'] - 0.004, gain=0.26, bus='sfx')

# ---- chords (F major): Fmaj9 | Dm9 | Bbmaj9 · Gm9 | C9sus4 → F6/9 on 100 % | Bbmaj9 (the line) · C9sus4 | Fmaj9 (the match)
V = {'Fmaj9': ['A3', 'C4', 'E4', 'G4'], 'Dm9': ['F3', 'A3', 'C4', 'E4'], 'Bbmaj9': ['D4', 'F4', 'A4', 'C5'],
     'Gm9': ['Bb3', 'D4', 'F4', 'A4'], 'C9sus': ['Bb3', 'D4', 'F4', 'G4'], 'F69': ['A3', 'D4', 'G4', 'C5']}
PROG = [(EV['dose1'], 'Fmaj9', 'F2'), (EV['dose2'], 'Dm9', 'D2'), (EV['dose3'], 'Bbmaj9', 'Bb1'), (EV['dose4'], 'Gm9', 'G1'),
        (EV['dose5'], 'C9sus', 'C2'), (EV['full'], 'F69', 'F2'), (T(4), 'Bbmaj9', 'Bb1'), (EV['match'] - B, 'C9sus', 'C2'),
        (EV['match'], 'Fmaj9', 'F2')]
for i, (at, name, root) in enumerate(PROG):
    nxt = PROG[i + 1][0] if i + 1 < len(PROG) else EV['dip']
    dur = nxt - at
    big = name == 'Fmaj9' and at == EV['match']
    chord(m, at, V[name], vel=0.66 if not big else 0.72, d=min(3.2, dur + 0.8), bright=0.5, gain=0.26 if not big else 0.3)
    if dur > 1.0 and not big: chord(m, at + 2.5 * B if dur > 2.0 else at + 1.5 * B, V[name][1:], vel=0.42, d=1.2, gain=0.2)   # the off-beat comp
    pd = dur + 0.4 if not big else EV['sting'] + 1.2 - at              # v2: the Fmaj9 pad carries on under the tail's ticks
    m.add(pad([nf(n) for n in V[name][:3]], pd, cutoff=1100, detune=0.07, attack=0.25, release=0.5), at - 0.03, gain=0.1 if not big else PADG, bus='keys')
    # bass: root on the beat, a pickup an octave up on the "and" of 3 (none on the end card hold)
    nb = int(round(dur / B))
    for bt in range(nb):
        if big and bt > 0: break
        # v2: the end-card bass holds the whole card and decays under the ink wipe (v1: a 1.6 s note left a hole at 14.2)
        if bt % 2 == 0: m.add(roundbass(nf(root), 0.5 if not big else EV['dip'] - EV['match'] + 0.15, 1.0), at + bt * B + 0.003, gain=0.5, bus='bass')
        elif bt % 4 == 3: m.add(roundbass(nf(root) * 2, 0.22, 0.6), at + (bt - 0.5) * B + 0.003, gain=0.26, bus='bass')
# v3 (CD: the end card held only a full-band F2 bass, which a phone speaker barely plays; above 300 Hz the card sagged
# to -29..-31 dB while «سبيشلتي دوز · الجهراء» and @sdosecafe are on screen): the Fmaj9 voicing re-strikes twice, the
# held bass gets an octave partial a phone can play, and a light shaker keeps air under the info line
chord(m, EV['match'] + 1.5 * B, V['Fmaj9'][1:], vel=0.5, d=1.8, gain=RSG)
chord(m, EV['match'] + RS2 * B, V['Fmaj9'][1:], vel=0.46, d=1.6, gain=RSG)
m.add(roundbass(nf('F3'), EV['dip'] - EV['match'] + 0.15, 0.6), EV['match'] + 0.003, gain=0.14, bus='bass')
m.add(bell(nf('C6'), 2.4, bright=0.45), EV['match'] + 0.01, gain=0.08, bus='verb')
m.add(bell(nf('A5'), 2.2, bright=0.4), EV['match'] + 0.12, gain=0.06, bus='verb')

# ---- groove: soft four-on-the-floor kick, snaps on 2 & 4 (from dose 2), a swung shaker; it thins on the terrace's
#      first beat (the 100 % build) and stops at the match (the end card is the chord, the bass and the bell)
SW = 0.035
def bar_groove(t0, beats, kick_=True, snaps=True, shaker_=True, dens=1.0):
    for b_ in range(beats):
        tb = t0 + b_ * B
        if kick_: m.add(softkick(), tb, gain=0.55 * dens * (1.0 if b_ % 2 == 0 else 0.85), bus='drums')
        if snaps and b_ % 2 == 1: m.add(snap(int(tb * 100)), tb + R.uniform(-0.004, 0.004), gain=0.3 * dens, bus='drums', pan=0.12)
        if shaker_:
            for s in range(4):
                m.add(shaker(0.08), tb + s * B / 4 + (SW if s % 2 else 0), gain=(0.12 if s % 2 else 0.07) * dens, bus='drums', pan=-0.28)
bar_groove(EV['dose1'], 4, snaps=False, dens=0.85)                      # d1: kick + shaker
bar_groove(EV['dose2'], 4, dens=0.95)                                   # d2: + snaps
bar_groove(EV['dose3'], 3, dens=1.0)                                    # d3
bar_groove(EV['dose4'], 3, dens=1.0)                                    # d4
bar_groove(EV['dose5'], 1, kick_=False, snaps=False, dens=0.8)          # the build into 100 %
bar_groove(EV['full'], int(round((EV['match'] - EV['full']) / B)), dens=1.0)   # 100 % → the line → the match
m.add(softkick(), EV['match'], gain=0.45, bus='drums')
bar_groove(EV['match'] + B, 3, kick_=False, snaps=False, dens=0.55)    # v3: shaker only under the end card's info line

# ---- foley on picture
m.add(grinder(1.5), EV['dose1'] + 0.05, gain=0.5, bus='sfx')
m.add(beans(1.6, 50, 4), EV['origin1'] - 0.05, gain=0.42, bus='sfx')
pour_c = lp(pour(2.5, seed_=21), 2600)
m.add(pour_c, EV['dose2'] - 0.05, gain=0.6, bus='sfx', pan=-0.1)
# the cubes plunging in, on the VISIBLE landings (v2, checked at 30 fps on the cup: f141-142, f150, f163, f168-169,
# f172-173, the f180 splash, the f184-185 splash; v1 had two hits with no contact on screen)
for k, te in enumerate((4.758, 5.05, 5.433, 5.633, 5.758, 6.008, 6.15)):
    m.add(ice_plunk(2700 + 380 * ((k * 3) % 5), k + 3, splash=0.5 + 0.1 * (k % 3)), te, gain=0.42 - 0.02 * (k % 2), bus='sfx', pan=[-0.1, 0.12, 0.0, -0.15, 0.1, 0.05, -0.05][k])
esp = lp(pour(1.9, seed_=33), 1500)
m.add(esp, EV['dose3'] - 0.02, gain=0.5, bus='sfx', pan=0.08)
# (v2: no ice clinks in d3: the ice does not move on screen)
sauce = lp(pour(1.9, seed_=44), 900)
m.add(sauce, EV['dose4'] - 0.02, gain=0.45, bus='sfx', pan=-0.05)
# (v2: no spoon clink and no chair scrape on the terrace: nothing on screen moves them)
m.add(street(3.2), EV['dose5'] - 0.05, gain=1.0, bus='amb')
m.add(whoosh(0.5, 400, 3800, pan_from=-0.2, pan_to=0.2, peak=0.55), EV['match'] - 0.28, gain=0.2, bus='sfx')

# ---- TASH signature (aligned to endcard-cues.json)
m.add(sonic_logo(), EV['sting'], gain=0.9, bus='sting')
m.add(whoosh(0.3, 300, 3000, peak=0.5), EV['dip'], gain=0.25, bus='sting')            # the ink wipe (15.08-15.30) is heard (v3: 0.15 -> 0.25)
# v3 (CD: 15.7-16.05 sat at -44..-48 dBFS between the sting's ticks, a fade to near-silence on a phone): a soft Fmaj9
# pad on the sting bus (outside the music's duck) holds the bed at about -40 dBFS until the طشّ hit at 16.42
TAILPAD = (EV['sting'] - 0.1, 16.42)
m.add(fade(pad([nf(n) for n in ('A3', 'C4', 'E4', 'G4')], TAILPAD[1] - TAILPAD[0], cutoff=1500, detune=0.07, attack=0.35, release=0.3), 0.05, 0.12),
      TAILPAD[0], gain=TAILGAIN, bus='sting')

# ----------------------------------------------------------------------------- buses
N = len(m.buf)
def lin(t0, t1, a, b):
    x = np.arange(N) / SR; k = np.clip((x - t0) / max(1e-6, t1 - t0), 0, 1); k = k * k * (3 - 2 * k)
    return (a + (b - a) * k)[:, None]

m.process_bus('keys', lambda b: reverb(b, decay=1.6, mix=0.2, pre=0.02, tone=5200))
m.process_bus('pluck', lambda b: reverb(b, decay=1.9, mix=0.3, pre=0.03, tone=7000))
m.process_bus('drums', lambda b: hp(reverb(sat(b * 1.15, 1.3) / 1.15, decay=0.5, mix=0.1, tone=6000), 45))
m.process_bus('verb', lambda b: hp(reverb(b, decay=2.4, mix=1.0, pre=0.02, tone=7000), 300))
kicks = [EV['dose1'] + i * B for i in range(int((EV['match'] - EV['dose1']) / B) + 1)]
duck = duck_curve(N, kicks, depth_db=-2.5, attack=0.006, hold=0.03, release=0.16)[:, None]
# the arc: everything muffled in the hook (the room is grey), opens on the first dose; a lift into 100 %; the music
# thins under the line; full warm chord on the match; bows out for the TASH tail
arc = (lin(EV['dose1'] - 0.05, EV['dose1'] + 0.08, db(-24), 1) * lin(EV['full'] - 0.1, EV['full'] + 0.05, db(-1.0), db(0.8))
       * lin(EV['tagline'] - 0.2, EV['tagline'] + 0.2, 1, db(-2.0)) * lin(EV['match'] - 0.05, EV['match'] + 0.1, 1, db(1.5))
       * lin(EV['dip'] - 0.2, EV['sting'] + 0.1, 1, db(TAILDUCK)))      # the music bows out for the tail; v3: the bed under the ticks is the TAILPAD below
for bus in ('keys', 'bass', 'drums'): m.process_bus(bus, lambda b: b * duck * arc)
m.process_bus('pluck', lambda b: b * lin(EV['dip'] - 0.2, EV['sting'], 1, db(-12)))
m.process_bus('bass', lambda b: hp(b, 50))
m.process_bus('sfx', lambda b: peak_eq(b, 3500, -1.5, 1.2) * lin(EV['dip'] - 0.15, EV['sting'], 1, db(-14)))
m.process_bus('amb', lambda b: b * lin(EV['match'] - 0.05, EV['match'] + 0.5, 1, db(-12)) * lin(EV['dip'] - 0.2, EV['sting'], 1, db(-20)))

endf = lin(DUR - 0.12, DUR, 1, 0)
m.buf *= endf
for k in list(m.buses): m.buses[k] = m.buses[k] * endf
# master: −14 LUFS with the TRUE peak (4x oversampled) held at −1.6 dBTP. (Mix.master skips its true-peak loop when
# the mix already sits within 0.3 LU of the target, so the loop runs here.)
from scipy.io import wavfile
out = m.render(-1.5)
for _ in range(4):
    out = out * db(-14.0 - lufs(out))
    c = -1.6
    for _ in range(8):
        y = limiter(out, c); over = true_peak_db(y) + 1.6
        if over <= 0: break
        c -= over + 0.05
    out = y
    if abs(lufs(out) + 14.0) < 0.15: break
wavfile.write(os.path.join(HERE, 'audio.wav'), SR, out.astype(np.float32))
print(f"wrote audio.wav  dur={len(out) / SR:.2f}s  loudness={lufs(out):.2f} LUFS  true-peak={true_peak_db(out):.2f} dBTP")
