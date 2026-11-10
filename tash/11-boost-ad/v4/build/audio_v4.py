#!/usr/bin/env python3
"""TASH boost ad v4 «نقاط مشروعك»: the 20 s (A-20) and 14 s (A-14) scores.

Source of truth: v4/BUILD-SPEC.md §10 (audio plan), §7 (beat table), §11 A-14, §15 R3-1..R3-24 (R3 wins).
Pure synthesis on the TASH engine (tash/_system/audio/tashaudio.py) with the patterns of the v3 score (src/audio.py).
No samples, loops or library music. The only recorded audio is the three approved ElevenLabs stems in
src/assets/rec/ (voice1.wav, voice2.wav, voice3_tash.wav): re-timed (6 % stretch at most), filtered, never re-voiced.

Music: 120 BPM, 1 beat = 15 frames = 0.5 s at 30 fps, D Hijaz. Bars start at f30 + 60k, so HERO 1 (f90), HERO 3 (f390)
and the CTA (f450) each open a bar; group claps fall on every multiple of 30 frames. A-14 has one 2-beat bar at f270 so
its HERO 3 (f300 = 10.0 s) also opens a bar. The hero 808 sits on A1 = 55 Hz with saturated 110 / 165 / 220 Hz.
The three dots are three woodblock ticks D6 / E♭6 / F♯6 (1174.7 / 1244.5 / 1480 Hz), typed right to left.

Run (from anywhere):  python3 tash/11-boost-ad/v4/build/audio_v4.py
Writes v4/build/audio/A20.wav (960 000 samples), A14.wav (672 000 samples), 48 kHz stereo float, and cues.json; prints the
phone-speaker checks and exits 1 if any check fails.
"""
import sys, os, json, math, subprocess, tempfile, time
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))                 # tash/11-boost-ad/v4/build
AD = os.path.normpath(os.path.join(HERE, '..', '..'))             # tash/11-boost-ad
TASH = os.path.dirname(AD)
sys.path.insert(0, os.path.join(TASH, '_system', 'audio'))
from tashaudio import *  # noqa: F401,F403  SR, Mix, Grid, membrane, tick, kick, sub808, claps_ensemble, reverb ...
from scipy import signal as sig
from scipy.io import wavfile
from scipy.ndimage import maximum_filter1d

REC = os.path.join(AD, 'src', 'assets', 'rec')
OUT = os.path.join(HERE, 'audio')
FPS, BPM = 30, 120
BEAT = 60 / BPM                                   # 0.5 s = 15 frames
fr = lambda f: f / FPS
NOTES = [nf('D6'), nf('Eb6'), nf('F#6')]          # 1174.7 / 1244.5 / 1480.0 Hz
TICK_PAN = [0.25, 0.0, -0.25]                     # right dot (x 807) types first, then middle, then left
A1 = 55.0
HILU_AT = 0.500                                   # the voiced «حلو» must start here (clap f15)
MAX_STRETCH = 0.06

# ----------------------------------------------------------------------------- mix levels (linear gains)
G = dict(
    voice=1.95, voice_stack=1.60,
    hero808=0.40, hook808=0.38, land808=0.42, hero_kick=0.30, hero_clap=0.85, hook_clap=0.42,
    kick=0.28, kick_full=0.26, soft_kick=0.26, clap=0.90, dum=0.32, tak=0.95, shaker=0.30,
    bass=0.13, pad=0.18, ep=0.36, pluck=0.20,
    tick=0.50, tick_talk=0.30, swarm=0.22, fall_tick=0.46, land_tick=0.46, tap=0.40,
    crack=0.85, splash=0.42, crunch=0.55, clink=0.55, crackle=0.62, breath=0.40, sizzle=0.42, thump=0.75,
    pop=0.50, burst=0.55, shock=0.55, whoosh=0.40, riser=0.30, inflate=0.30, zip=0.22, notepop=0.45, swell=0.55,
    room=0.0,                                     # set by calibrate_room(): the dead beat sits at -40 dBFS
)
MUSIC_SC_DB = -6.0                                # music (and sound beds) side-chained under each voice
ROOM_TARGET = -40.0


# ----------------------------------------------------------------------------- local voices (patterns from v3 src/audio.py)
def wtick(freq, gain=1.0, body=0.55, d=0.05):
    """The typing tick: a pitched woodblock (tick transient over a damped membrane body)."""
    a = tick(freq, d)
    b = membrane(freq * 0.5, 0.07, 0.011, pitch_drop=0.04, strike=0.25, strike_band=(2500, 7000))
    n = max(len(a), len(b)); y = np.zeros(n); y[:len(a)] += a * 0.9; y[:len(b)] += b * body
    return fade(peak_eq(y, 3500, -3, 1.0), 0.0002, 0.01) * gain


def thump(gain=1.0):
    """A short body (70 Hz floor) + a 250-800 Hz felt knock + a 2-4 kHz click, so phones hear it."""
    k = hp(kick(f0=120, f1=70, d=0.18, punch=0.4, click=0.0), 60) * 0.5
    knock = bp(noise(0.09), 250, 800) * env_exp(0.09, 0.022) * 0.8
    click = bp(noise(0.01), 2000, 4000) * env_exp(0.01, 0.0025) * 0.5
    y = np.zeros(len(k)); y += k; y[:len(knock)] += knock; y[:len(click)] += click
    return fade(y, 0.0003, 0.03) * gain


def wood_tock(freq=520, gain=1.0):
    return membrane(freq, 0.16, 0.03, pitch_drop=0.05, strike=0.5, strike_band=(1500, 5000)) * gain


def air_fall(d=0.3, gain=1.0, pan=0.0):
    """Descending air as a dot falls."""
    x = svf_sweep(noise(d, 'pink'), 3500, 500, q=3.0)
    e = np.linspace(0, 1, n_(d)) ** 1.8
    return stereo(x * e * 0.5 * gain, pan)


def room_tone(d):
    """Room air in the band a phone plays (never rumble, never digital silence); loops seamlessly over d."""
    xf = n_(0.12); N = n_(d)
    x = stereo(bp(noise(d + 0.13, 'pink'), 160, 2400) * 0.02 + bp(noise(d + 0.13, 'pink'), 900, 4000) * 0.03, 0, width=0.8)
    x = x[n_(0.01):n_(0.01) + N + xf]
    y = x[:N].copy(); r = np.sin(np.linspace(0, np.pi / 2, xf))[:, None]
    y[:xf] = y[:xf] * r + x[N:N + xf] * np.cos(np.linspace(0, np.pi / 2, xf))[:, None]   # equal-power wrap
    return y


def bass808(f, d, glide=None, gain=1.0, drive=3.2):
    """Groove 808 (v3): the sub (-8 dB) plus a band-passed saturated copy (250-1500 Hz) so the note reads on phones."""
    x = mono(sub808(f, d, glide_from=glide, drive=drive))
    mid = bp(sat(x * 4.0, 3.0), 250, 1500) * 0.7
    return (x * 0.28 + mid) * gain


def hit808(f=A1, d=1.3, gain=1.0):
    """Hero 808: 55 Hz with its 110 / 165 / 220 Hz harmonics written in, saturated, plus a phone-band copy and a click."""
    t = tt(d)
    ph = np.cumsum(f * (1 + 0.6 * np.exp(-t / 0.03))) / SR
    x = sum(a * np.sin(2 * np.pi * k * ph) for k, a in ((1, 1.0), (2, 0.9), (3, 0.75), (4, 0.6)))
    body = sat(x * env_exp(d, 0.30, 0.0015) * 1.1, 2.4)
    mid = bp(sat(body * 2.5, 3.0), 250, 1600) * 0.6
    click = bp(noise(0.01), 1800, 6000) * env_exp(0.01, 0.0018) * 0.5
    y = lp(body, 3000) * 0.60 + mid
    y[:len(click)] += click
    return fade(y, 0.0004, 0.12) * gain


def gkick(punch=0.9):
    """Groove kick with a 180-900 Hz knock so it reads on a phone."""
    k = kick(f0=150, f1=52, d=0.26, punch=punch, click=0.6)
    knock = bp(noise(0.05), 180, 900) * env_exp(0.05, 0.012) * 0.7
    k[:len(knock)] += knock
    return k


def soft_kick():
    k = kick(f0=118, f1=48, d=0.30, punch=0.3, click=0.12) * 0.7
    knock = bp(noise(0.05), 200, 900) * env_exp(0.05, 0.014) * 0.3
    k[:len(knock)] += knock
    return k


def epiano(f, d=1.2, vel=0.8, bright=0.55):
    """Soft Rhodes-like e-piano (v3): the warm mid-range of the groove."""
    t = tt(d)
    idx = (0.55 * bright + 0.5 * vel) * np.exp(-t / 0.25) + 0.12
    car = np.sin(2 * np.pi * f * t + np.sin(2 * np.pi * f * t) * idx)
    tine = np.sin(2 * np.pi * f * 6.98 * t) * np.exp(-t / 0.03) * 0.1 * vel
    y = (car + tine) * env_exp(d, 0.9 + 120 / f, 0.004) * vel
    y = hp(lp(y, 2600 + 1800 * bright), 160)
    trem = 0.08 * np.sin(2 * np.pi * 4.0 * t)
    return fade(np.stack([y * (1 + trem), y * (1 - trem)], axis=1) * 0.45, 0.002, 0.15)


def group_clap(seed_=0, n=7, d=0.38):
    return claps_ensemble(n, d, seed_=seed_)


# ----------------------------------------------------------------------------- world and dot sounds (all synthesised)
def ice_crack(R):
    """f0: ice cracking into the glass: a crack, fracture ticks, four glass clinks, a phone-band knock."""
    d = 0.6; out = np.zeros((n_(d), 2))
    c = bp(noise(0.04), 1800, 10000) * env_exp(0.04, 0.003) * 1.1
    out[:len(c)] += stereo(c)
    for _ in range(7):
        b = bp(noise(0.006), 3000, 12000) * env_exp(0.006, 0.0008) * R.uniform(0.2, 0.5)
        i0 = n_(R.uniform(0.002, 0.045)); out[i0:i0 + len(b)] += stereo(b, R.uniform(-0.6, 0.6))
    for dt_, f, g in [(0.0, 2950, 0.9), (0.017, 3420, 0.6), (0.039, 2610, 0.55), (0.066, 3880, 0.4), (0.094, 3150, 0.3)]:
        b = bell(f * R.uniform(0.98, 1.02), 0.32, 1.0) * g
        i0 = n_(dt_); s = stereo(b, R.uniform(-0.5, 0.5)); out[i0:i0 + len(s)] += s[:len(out) - i0]
    knock = membrane(560, 0.12, 0.018, pitch_drop=0.03, strike=0.9, strike_band=(1200, 5000)) * 0.6
    out[:len(knock)] += stereo(knock)
    return fade(out, 0.0002, 0.08)


def splash(R, size=1.0, d=0.5, dark=False):
    """Ice into iced coffee: a liquid body, spray, a low plop and bubbles."""
    N = n_(d); t = np.arange(N) / SR
    body = hp(lp(noise(d, 'pink'), 1100 if dark else 2200), 180) * np.clip(t / 0.006, 0, 1) * np.exp(-t / (0.07 * size))
    spray = 0.0 if dark else bp(noise(d), 2500, 9000) * np.clip(t / 0.012, 0, 1) * np.exp(-t / 0.09) * 0.35
    plop = phase_osc(np.geomspace(260, 95, N), d) * env_exp(d, 0.035, 0.001) * 0.7
    y = body * 0.9 + spray + plop
    for _ in range(int(7 * size)):
        f = R.uniform(380, 1100); p = pop(f, f * R.uniform(1.4, 1.9), 0.035) * R.uniform(0.08, 0.22)
        i0 = n_(R.uniform(0.03, d * 0.7)); y[i0:i0 + len(p)] += p[:N - i0]
    return stereo(fade(y * size, 0.0003, 0.06), 0, width=0.6)


def crunch(R, d=0.45, syrup=0.0, soft=1.0):
    """Kunafa: pastry flakes giving way (bite + crumble), a soft press, optionally sticky syrup (no nuts)."""
    N = n_(d); t = np.arange(N) / SR
    dens = np.exp(-((t - 0.02) / 0.03) ** 2) + 0.55 * np.exp(-((t - 0.12) / 0.06) ** 2)
    k = int(260 * d); imp = np.zeros(N)
    pos = R.choice(N, size=k, p=dens / dens.sum()); imp[pos] = R.uniform(-1, 1, k) ** 3
    flakes = sig.lfilter([1], [1, -0.55], bp(imp, 1200, 6500)) * 3.2
    press = lp(noise(d, 'brown'), 500) * env_exp(d, 0.03, 0.002) * 0.5
    y = flakes * soft + press
    if syrup:
        sy = bp(noise(d, 'pink'), 250, 1400) * np.sin(np.pi * np.clip(t / 0.35, 0, 1)) ** 2 * 0.25
        tg = np.clip(t - 0.12, 0, None)
        drip = phase_osc(np.geomspace(820, 430, N), d) * np.clip((t - 0.12) / 0.03, 0, 1) * np.exp(-tg / 0.08) * 0.18
        y = y + (sy + drip) * syrup
    return stereo(fade(y, 0.0003, 0.05), 0, width=0.5)


def ice_clink(R):
    """Coffee A: two glass clinks and a small splash."""
    out = np.zeros((n_(0.6), 2))
    for dt_, f, g, p in [(0.0, 3100, 0.9, 0.2), (0.026, 3650, 0.6, -0.2)]:
        s = stereo(bell(f, 0.35, 1.0) * g, p); i0 = n_(dt_); out[i0:i0 + len(s)] += s[:len(out) - i0]
    s = splash(R, 0.55, 0.45); out[n_(0.012):n_(0.012) + len(s)] += s[:len(out) - n_(0.012)] * 0.7
    return out


def charcoal(R, d=0.9):
    """Oud A: charcoal crackle and the smoke puff the picture does not show (the hit is carried by the sound)."""
    N = n_(d); t = np.arange(N) / SR; y = np.zeros(N)
    for k in range(int(26 * d)):
        t0 = R.uniform(0, 0.03) if k < 3 else R.uniform(0, d * 0.85)
        p = membrane(R.uniform(700, 2600), 0.03, 0.004, pitch_drop=0.02, strike=1.0, strike_band=(2000, 9000))
        p = p * R.uniform(0.15, 0.6) * (1.0 if t0 < 0.05 else 0.7)
        i0 = n_(t0); y[i0:i0 + len(p)] += p[:N - i0]
    ember = bp(noise(d, 'pink'), 150, 900) * 0.10 * np.exp(-t / 0.5)
    hiss = bp(noise(d), 2000, 7000) * 0.05 * np.exp(-t / 0.4)
    smoke = bp(noise(d, 'pink'), 400, 2600) * np.clip(t / 0.08, 0, 1) * np.exp(-t / 0.3) * 0.22
    return stereo(fade(y + ember + hiss + smoke, 0.0005, 0.1), 0, width=0.8)


def smoke_breath(d=0.6):
    t = tt(d); e = np.clip(t / 0.18, 0, 1) ** 1.5 * np.exp(-np.clip(t - 0.18, 0, None) / 0.18)
    return stereo(svf_sweep(noise(d, 'pink'), 600, 1800, q=1.2) * e * 0.5, 0, width=0.9)


def grill(d=1.0, seed_=9):
    """Burger A: the sizzle bed (engine sizzle), tamed for phones, swelling in."""
    s = lp(sizzle(d, density=700, seed_=seed_), 9000)
    e = np.clip(tt(d) / 0.04, 0, 1) * np.exp(-tt(d) / (d * 0.6))
    return fade(s * e[:, None], 0.001, 0.15)


def bun_thump():
    th = thump(1.0)
    puff = lp(noise(0.12, 'pink'), 900) * env_exp(0.12, 0.03, 0.002) * 0.5
    y = np.zeros(max(len(th), len(puff))); y[:len(th)] += th; y[:len(puff)] += puff
    return y


def porthole_pop(f0, f1):
    """A porthole opening: a short bright bubble pop with a cork click (short, so it reads over the end of «طشّ!»)."""
    p = pop(f0, f1, 0.045) * 1.1
    cork = membrane(f1 * 0.5, 0.05, 0.008, pitch_drop=0.1, strike=0.9, strike_band=(2000, 7000)) * 0.5
    click = bp(noise(0.006), 2500, 8000) * env_exp(0.006, 0.001) * 0.6
    y = np.zeros(max(len(p), len(cork))); y[:len(p)] += p; y[:len(cork)] += cork; y[:len(click)] += click
    return fade(y, 0.0002, 0.01)


def burst_pop(R, d=0.35):
    """HERO 3: one big pop and a spray of small ones that slows down (burst speed 1 to 0.1)."""
    out = np.zeros((n_(d), 2)); main = pop(240, 760, 0.1)
    out[:len(main)] += stereo(main)
    for k in range(22):
        tk = abs(0.004 + 0.16 * (k / 22) ** 1.6 + R.normal(0, 0.004))
        f = R.uniform(520, 1500); p = pop(f, f * R.uniform(1.5, 2.0), 0.03) * R.uniform(0.15, 0.4) * (1 - 0.6 * k / 22)
        i0 = n_(tk); s = stereo(p, R.uniform(-0.9, 0.9)); out[i0:i0 + len(s)] += s[:len(out) - i0]
    return out


def shockwave(d=0.45):
    """HERO 1: the shockwave from the ش: a low whump and a band-limited air front (kept under 1.5 kHz for «طشّ!»)."""
    t = tt(d)
    whump = phase_osc(45 + 120 * np.exp(-t / 0.04), d) * env_exp(d, 0.09, 0.001)
    air = bp(noise(d, 'pink'), 220, 1500) * env_exp(d, 0.05, 0.002) * 0.8
    return stereo(fade(sat(whump * 0.9 + air, 1.3), 0.0003, 0.08), 0, width=0.6)


def inflate(d):
    """The flood: 81 dots inflating: a band sweep up with a rising tone, peaking at the end."""
    N = n_(d); e = np.linspace(0, 1, N) ** 2.2
    x = svf_sweep(noise(d, 'pink'), 700, 7000, q=2.0) * 0.9 + phase_osc(np.geomspace(220, 660, N), d, 'tri') * 0.18
    return stereo(fade(x * e, 0.005, 0.004), 0, width=0.9)


def note_pop(freq):
    p = pop(freq * 0.55, freq, 0.06) * 0.8
    b = membrane(freq, 0.14, 0.03, pitch_drop=0.02, strike=0.35, strike_band=(2000, 7000)) * 0.5
    s = phase_osc(freq, 0.18) * env_exp(0.18, 0.05) * 0.25
    y = np.zeros(max(len(p), len(b), len(s))); y[:len(p)] += p; y[:len(b)] += b; y[:len(s)] += s
    return fade(y, 0.0003, 0.03)


def reverse_swell(d):
    """Wind-up: a reversed room of a D-A-D pluck chord and a puff, rising to a hard stop (then 2 frames of air)."""
    src = np.zeros(n_(0.35))
    puff = hp(noise(0.08, 'pink'), 300) * env_exp(0.08, 0.02, 0.001); src[:len(puff)] += puff
    for f in (nf('D4'), nf('A4'), nf('D5')):
        p = pluck(f, 0.35, bright=0.6) * 0.3; src[:len(p)] += p
    wet = reverb(src, decay=1.6, mix=1.0, tone=7000)
    rev = wet[::-1]
    pk = int(np.argmax(np.abs(rev).max(axis=1))); rev = rev[:pk + n_(0.002)]
    y = rev[-n_(d):] * (np.linspace(0.2, 1, n_(d)) ** 2)[:, None]
    return fade(y, 0.002, 0.004)


def mirwas_roll(t0, t1, n, gain, put_at, start_vel=0.3):
    """Accelerating / crescendo taks between two frames."""
    for k in range(n):
        f = t0 + (t1 - t0) * k / n
        put_at(f, gain * (start_vel + (1 - start_vel) * k / max(1, n - 1)))


# ----------------------------------------------------------------------------- dynamics / measurement helpers (v3 + new)
def deess(x, f=5500, thresh_db=-30, ratio=4.0):
    hi = hp(x, f, order=4); lo = x - hi
    return lo + compress(hi, thresh_db=thresh_db, ratio=ratio, attack=0.002, release=0.06)[:len(hi), 0]


def limit(x, ceiling_db=-2.0, look=0.004, release=0.08):
    """Look-ahead peak limiter (v3) with true-peak detection on a 4x copy, no delay, gain state starting at 1."""
    c = db(ceiling_db); d = n_(look)
    up = sig.resample_poly(x, 4, 1, axis=0)
    tp = np.abs(up).max(axis=1)[:4 * len(x)].reshape(-1, 4).max(axis=1)
    pk = maximum_filter1d(np.maximum(tp, np.abs(x).max(axis=1)), 2 * d + 1)
    g = np.minimum(1.0, c / (pk + 1e-9))
    a_ = math.exp(-1 / (release * SR))
    gs, _ = sig.lfilter([1 - a_], [1, -a_], g, zi=[g[0] * a_])
    return np.clip(x * np.minimum(g, gs)[:, None], -c, c)


def ffmpeg_lufs(x):
    with tempfile.NamedTemporaryFile(suffix='.wav') as f:
        wavfile.write(f.name, SR, x.astype(np.float32))
        o = subprocess.run(['ffmpeg', '-nostats', '-i', f.name, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                           capture_output=True, text=True).stderr
    I = float([l for l in o.splitlines() if l.strip().startswith('I:')][-1].split()[1])
    P = float([l for l in o.splitlines() if l.strip().startswith('Peak:')][-1].split()[1])
    return I, P


def share(x, lo, hi):
    f, p = sig.welch(mono(x), SR, nperseg=8192)
    return float(p[(f >= lo) & (f < hi)].sum() / p[(f >= 20)].sum())


def automation(N, points):
    pts = sorted(points, key=lambda p: p[0])
    return db(np.interp(np.arange(N) / SR, [p[0] for p in pts], [p[1] for p in pts]))


def low_mono(x, f=150, trim_db=-2.0):
    lo = lp(x, f, order=4); hi_ = x - lo
    return hi_ + np.repeat(lo.mean(axis=1, keepdims=True) * db(trim_db), 2, axis=1)


def svf_curve(x, fc, q=0.707):
    """TPT state-variable low-pass with a per-sample cutoff array (the engine's svf_sweep, any curve)."""
    g = np.tan(np.pi * np.clip(fc, 20, SR * 0.45) / SR); k = 1 / q
    a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2
    ic1 = ic2 = 0.0; y = np.empty(len(x)); xs = x.tolist(); A1_, A2_, A3_ = a1.tolist(), a2.tolist(), a3.tolist()
    for i in range(len(x)):
        v3 = xs[i] - ic2; v1 = A1_[i] * ic1 + A2_[i] * v3; v2 = ic2 + A2_[i] * ic1 + A3_[i] * v3
        ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2; y[i] = v2
    return y


def drain_filter(x):
    """Music low-pass: closes 8 kHz -> 400 Hz over f30-44, stays shut through the dead beat, opens 400 Hz -> 12 kHz f72-90."""
    a, b = n_(fr(24)), n_(fr(96))
    fc = np.full(b - a, 21000.0)
    i30, i44, i72, i90 = (n_(fr(f)) - a for f in (30, 44, 72, 90))
    fc[i30:i44] = 8000 * (400 / 8000) ** np.linspace(0, 1, i44 - i30)
    fc[i44:i72] = 400
    fc[i72:i90] = 400 * (12000 / 400) ** np.linspace(0, 1, i90 - i72)
    y = x.copy(); xf = n_(0.004); r = np.linspace(0, 1, xf)
    for ch in range(2):
        s = svf_curve(x[a:b, ch], fc)
        s[:xf] = x[a:a + xf, ch] * (1 - r) + s[:xf] * r
        s[-xf:] = s[-xf:] * (1 - r) + x[b - xf:b, ch] * r
        y[a:b, ch] = s
    return y


def sidechain(key, depth_db=MUSIC_SC_DB, thresh_db=-46.0, knee=8.0, att=0.008, rel=0.16):
    """Gain curve that dips depth_db while the voice bus speaks (envelope follower, soft knee)."""
    k = np.abs(key).max(axis=1); hop = 32
    blocks = maximum_filter1d(k, hop)[::hop]
    a = math.exp(-hop / (att * SR)); r = math.exp(-hop / (rel * SR)); e = 0.0; env = np.zeros_like(blocks)
    for i, v in enumerate(blocks):
        e = a * e + (1 - a) * v if v > e else r * e + (1 - r) * v
        env[i] = e
    amt = np.clip((20 * np.log10(env + 1e-9) - thresh_db) / knee, 0, 1)
    return db(np.repeat(depth_db * amt, hop)[:len(k)])


def band_energy(x, lo, hi, mask=None):
    y = sig.sosfilt(sig.butter(4, [lo, hi], 'band', fs=SR, output='sos'), mono(x))
    return float((y[mask] ** 2).sum() if mask is not None else (y ** 2).sum())


# ----------------------------------------------------------------------------- voice stems
def read_wav(p):
    sr, x = wavfile.read(p)
    x = x.astype(np.float64) / 32768.0 if x.dtype.kind == 'i' else x.astype(np.float64)
    if sr != SR:
        x = sig.resample_poly(x, SR, sr, axis=0)
    return mono(x)


def ffx(x, af):
    """Run a mono signal through an ffmpeg filter (rubberband time / pitch, latency compensated by ffmpeg)."""
    with tempfile.TemporaryDirectory() as d:
        a, b = os.path.join(d, 'a.wav'), os.path.join(d, 'b.wav')
        wavfile.write(a, SR, x.astype(np.float32))
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', a, '-af', af, '-ar', str(SR), '-c:a', 'pcm_f32le', b], check=True)
        return read_wav(b)


def band_env(x, lo, hi, win=0.010, hop=0.0025):
    y = sig.sosfilt(sig.butter(4, [lo, hi], 'band', fs=SR, output='sos'), x)
    w, h = n_(win), n_(hop)
    cs = np.concatenate([[0.0], np.cumsum(y ** 2)])
    idx = np.arange(0, max(1, len(y) - w), h)
    return (idx + w / 2) / SR, 10 * np.log10((cs[idx + w] - cs[idx]) / w + 1e-12)


def v1_marks(x):
    """(closure, hilu): start of the silent closure of the «ك» that ends «مشروعك» (= where «حلو» begins) and the onset
    of the «ح» frication after it."""
    t, eb = band_env(x, 100, 8000)
    _, eh = band_env(x, 1500, 4000)
    ref = np.median(eb[(t > 0.25) & (t < 0.45)]); run = int(round(0.03 / 0.0025))
    cand = [i for i in np.where((t >= 0.42) & (t < 0.80))[0] if (eb[i:i + run] < ref - 9).all()]
    tb = t[cand[0]]
    lv = np.median(eh[(t > tb) & (t < tb + 0.03)])
    th = t[np.where((t > tb + 0.01) & (eh > lv + 15))[0][0]]
    return float(tb), float(th)


def onset(x, rel=-25.0):
    t, e = band_env(x, 100, 8000, win=0.005, hop=0.001)
    return float(max(0.0, t[np.argmax(e > e.max() + rel)] - 0.0025))


def voice_chain(x, target=-18.0):
    """Spec §10: high-pass 120 Hz, +3 dB at 3 kHz; plus the v3 light de-ess; loudness-matched."""
    x = hp(x, 120, order=4)
    x = mono(deess(x))
    x = peak_eq(x, 3000, 3.0, 1.0)
    return x * db(target - lufs(stereo(x)))


def align_to(ref, x, search=0.02):
    """Shift x so its envelope lines up with ref (1 ms resolution)."""
    t1, e1 = band_env(ref, 100, 8000, 0.005, 0.001); _, e2 = band_env(x, 100, 8000, 0.005, 0.001)
    e1, e2 = db(e1 / 2), db(e2 / 2)
    n = min(len(e1), len(e2)); L = int(search * 1000)
    best = max(range(-L, L + 1), key=lambda k: np.dot(e1[max(0, k):n + min(0, k)], e2[max(0, -k):n - max(0, k)]))
    s = n_(abs(best / 1000)) if best else 0
    return (np.concatenate([np.zeros(s), x]) if best > 0 else x[s:]), best


def prep_voices():
    info = {}
    raw1 = read_wav(os.path.join(REC, 'voice1.wav'))
    b0, h0 = v1_marks(raw1)
    factor = min(1.0, max(1 - MAX_STRETCH, HILU_AT / b0))           # time factor (<1 = shorter), capped at 6 %
    x1 = raw1 if factor > 0.9999 else ffx(raw1, f'rubberband=tempo={1 / factor:.7f}:transients=crisp:formant=preserved:pitchq=quality')
    b1, _ = v1_marks(x1)
    shift = b1 - HILU_AT
    if shift > 0:
        x1 = fade(x1[n_(shift):], 0.003, 0.002)                       # the rest of the way: trim the quiet «م» attack
    else:
        x1 = np.concatenate([np.zeros(n_(-shift)), x1])
    b2, h2 = v1_marks(x1)                                             # measured the same way as the 0.55 s above
    v1 = voice_chain(x1)
    info['V1'] = dict(file='src/assets/rec/voice1.wav', source_seconds=round(len(raw1) / SR, 4),
                      measured_closure_s=round(b0, 4), measured_hilu_frication_s=round(h0, 4),
                      stretch_percent=round((1 - factor) * 100, 2), rubberband_tempo=round(1 / factor, 5),
                      head_trim_ms=round(max(0.0, shift) * 1000, 1), head_pad_ms=round(max(0.0, -shift) * 1000, 1),
                      placed_closure_s=round(b2, 4), placed_hilu_frication_s=round(h2, 4),
                      placed_seconds=round(len(v1) / SR, 4))
    raw2 = read_wav(os.path.join(REC, 'voice2.wav')); v2 = voice_chain(raw2)
    raw3 = read_wav(os.path.join(REC, 'voice3_tash.wav')); v3 = voice_chain(raw3)
    on2, on3 = onset(v2), onset(v3)
    info['V2'] = dict(file='src/assets/rec/voice2.wav', seconds=round(len(raw2) / SR, 4), onset_s=round(on2, 4))
    info['V3'] = dict(file='src/assets/rec/voice3_tash.wav', seconds=round(len(raw3) / SR, 4), onset_s=round(on3, 4))
    # the stack: 0 / +35 / +70 ms, 0 / +2 / -3 semitones, centre / left / right
    layers = [(0.0, 0, 0.0, 1.0), (0.035, 2, -0.75, 0.78), (0.070, -3, 0.75, 0.78)]
    stack = np.zeros((len(v3) + n_(0.2), 2)); lag = {}
    for dly, st, pan, g in layers:
        x = v3 if st == 0 else voice_chain(ffx(raw3, f'rubberband=pitch={2 ** (st / 12):.6f}:formant=shifted:pitchq=quality'))
        if st:
            x, lag[st] = align_to(v3, x)
        s = stereo(x, pan) * g; i0 = n_(dly) if dly else 0
        stack[i0:i0 + len(s)] += s[:len(stack) - i0]
    info['V3_stack'] = dict(layers=[dict(delay_ms=int(d * 1000), semitones=s, pan=p, gain=g) for d, s, p, g in layers],
                            pitch_engine='rubberband (ffmpeg), formant shifted', align_ms={str(k): v for k, v in lag.items()})
    return dict(v1=v1, v2=v2, v3=v3, stack=stack, on2=on2, on3=on3, info=info)


# ----------------------------------------------------------------------------- the two cue sheets
A20 = dict(
    name='A20', frames=600, seed=2020,
    bars=[(-30, 4)] + [(30 + 60 * k, 4) for k in range(10)],
    style=[(0, 'hook'), (30, 'drain'), (45, 'dead'), (72, 'return'), (90, 'full'), (135, 'peak'), (285, 'talk'),
           (330, 'build'), (375, 'flood'), (386, 'pocket'), (390, 'half'), (450, 'calm'), (540, 'thin'), (588, 'wind')],
    chords={-30: 'D', 30: 'D', 90: 'D', 150: 'Eb', 210: 'D', 270: 'Eb', 330: 'Eb', 390: 'D', 450: 'Gm', 510: 'Eb', 570: 'D'},
    worlds=[(135, 'kick', 'Coffee A full frame'), (150, 'clap', 'Coffee B lens'), (165, 'kick', 'Oud A full frame'),
            (180, 'clap', 'Oud B punch-in'), (195, 'kick', 'Oud C lens'), (210, 'kick', 'Burger A full frame'),
            (225, '808', 'Burger B: bun lands'), (240, 'kick', 'Burger C lens'), (255, 'kick', 'Kunafa A full frame'),
            (270, 'clap', 'Kunafa B lens')],
    clink=138, crackle=165, breath=180, sizzle=(210, 225), bun=225, crunch=255,
    talk=285, mult=[330, 345, 360], build8=360, flood=375, duck=381, pocket=(386, 390), hero3=390,
    cta=450, band=[(450, 'kunafa'), (480, 'burger'), (510, 'oud'), (540, 'coffee')], pop2=457, thin=540,
    swell=(588, 598), windup=588, room_window=(56, 71), swarm=1.0,
)
A14 = dict(
    name='A14', frames=420, seed=1414,
    bars=[(-30, 4), (30, 4), (90, 4), (150, 4), (210, 4), (270, 2), (300, 4), (360, 4)],
    style=[(0, 'hook'), (30, 'drain'), (45, 'dead'), (72, 'return'), (90, 'full'), (135, 'peak'), (255, 'talk'),
           (270, 'build'), (285, 'flood'), (296, 'pocket'), (300, 'half'), (315, 'calm'), (375, 'thin'), (414, 'wind')],
    chords={-30: 'D', 30: 'D', 90: 'D', 150: 'Eb', 210: 'D', 270: 'Eb', 300: 'D', 360: 'D'},
    worlds=[(135, 'kick', 'Coffee A full frame'), (150, 'clap', 'Coffee B lens'), (165, 'kick', 'Oud A full frame'),
            (180, 'clap', 'Oud C lens'), (195, 'kick', 'Burger A full frame'), (210, '808', 'Burger B: bun lands'),
            (225, 'kick', 'Kunafa A full frame'), (240, 'clap', 'Kunafa B lens')],
    clink=138, crackle=165, breath=None, sizzle=(195, 210), bun=210, crunch=225,
    talk=255, mult=[270, 275, 280], build8=280, flood=285, duck=291, pocket=(296, 300), hero3=300,
    cta=315, band=[(315, 'kunafa'), (345, 'burger'), (375, 'coffee')], pop2=318, thin=375,
    swell=(408, 418), windup=414, room_window=(56, 71), swarm=2.0,   # ticks run under V2 here: +6 dB before the duck
)
CHORDS = {'D': ['D3', 'F#3', 'A3', 'D4'], 'Eb': ['Eb3', 'G3', 'Bb3', 'Eb4'], 'Gm': ['G2', 'D3', 'G3', 'Bb3']}
ROOTS = {'D': (nf('D2'), nf('A1')), 'Eb': (nf('Eb2'), nf('Bb1')), 'Gm': (nf('G1'), nf('D2'))}
MIR = {0: ('dum', 1.0), 3: ('tak', .55), 6: ('tak', .7), 8: ('dum', .85), 10: ('dum', .6), 12: ('tak', .7), 14: ('tak', .5), 15: ('tak', .35)}
MIR_LEVEL = {'hook': .7, 'drain': .8, 'full': 1.0, 'peak': 1.0, 'talk': .85, 'build': .9, 'half': .8, 'calm': .55, 'thin': .45}
MIR_ONLY = {'half': {0, 6, 12}, 'thin': {0, 8}}
SHAKER = {'drain': (1, .6), 'full': (1, .7), 'peak': (1, 1.0), 'build': (1, .8), 'calm': (2, .5)}
BASS_LEVEL = {'drain': .8, 'full': 1.0, 'peak': 1.0, 'talk': .9, 'build': 1.0, 'half': 1.0, 'calm': .55}
CHORD_LEVEL = {'drain': .7, 'full': 1.0, 'peak': 1.0, 'half': .8, 'calm': .6, 'thin': .4}
PAD_ONLY = {'drain', 'thin'}
RIFF = {'D': [(10, 'A4'), (11, 'Bb4'), (12, 'A4'), (13, 'G4'), (14, 'F#4'), (15, 'Eb4')],   # a Hijaz turn on beats 3-4
        'Eb': [(10, 'G4'), (11, 'Bb4'), (12, 'G4'), (13, 'F#4'), (14, 'Eb4'), (15, 'F#4')],
        'Gm': [(10, 'D5'), (11, 'C5'), (12, 'Bb4'), (13, 'A4'), (14, 'G4'), (15, 'F#4')]}


def style_at(V, f):
    s = None
    for f0, name in V['style']:
        if f >= f0 - 1e-6: s = name
    return s


def style_end(V, f):
    return min([f0 for f0, _ in V['style'] if f0 > f + 1e-6] + [V['frames']])


# ----------------------------------------------------------------------------- the score
def score(V, VO):
    seed(V['seed']); R = np.random.default_rng(V['seed'])
    F = V['frames']; DUR = fr(F)
    m = Mix(DUR, tail=2.0)
    cues = []
    hero_frames = {90, V['hero3']}

    def put(x, f, bus, what=None, gain=1.0, pan=0.0, width=0.0, dt=0.0):
        if f + dt * FPS >= F - 1e-6:
            return                                              # no onset at or after the loop point (tails fold in)
        m.add(x, fr(f) + dt, gain=gain, pan=pan, bus=bus, width=width)
        if what:
            cues.append(dict(frame=round(f + dt * FPS, 2), t=round(fr(f) + dt, 4), bus=bus, what=what))

    def note(f, what, bus='note'):
        cues.append(dict(frame=round(f, 2), t=round(fr(f), 4), bus=bus, what=what))

    m.add(room_tone(DUR) * 1.0, 0.0, bus='room')

    # --- f0-29 HOOK: 808 + ice crack, V1, ticks f0/5/10, mirwas pickup (groove), clap f15 on «حلو»
    put(hit808(A1, 1.2), 0, 'music', '808 A1 55 Hz (+110/165/220 Hz) on frame 0', G['hook808'])
    put(ice_crack(R), 0, 'hit', 'ice-on-glass crack (ice hits the latte)', G['crack'])
    put(splash(R, 0.9), 5, 'sfx', 'ice enters the coffee: splash (n7 entry)', G['splash'])
    for i in range(3):
        put(wtick(NOTES[i]), 5 * i, 'sfx', f'typing tick {["right", "middle", "left"][i]} dot ({NOTES[i]:.1f} Hz)', G['tick'], TICK_PAN[i])
    put(group_clap(15, 5, 0.22), 15, 'music', 'group clap on the voiced «حلو» (punch-in)', G['hook_clap'])
    put(splash(R, 0.6, 0.35, dark=True), 16, 'sfx', 'closer replay of the ice touching the coffee (dark plop)', G['splash'] * 0.7)
    put(VO['v1'], 0, 'voice', f'V1 «مشروعك حلو…» from 0.00 s; «حلو» starts {VO["info"]["V1"]["placed_closure_s"]:.3f} s', G['voice'])

    # --- f30-44 DRAIN: kunafa (no nuts on screen): soft syrup/pastry crunch; three dots fall; music low-pass closes
    put(crunch(R, 0.45, syrup=1.0, soft=0.8), 30, 'sfx', 'soft syrup / pastry crunch (kunafa, no nut scatter)', G['crunch'])
    for i, (f, hz) in enumerate(zip((32, 34, 36), (1480.0, 1244.5, 1174.7))):
        put(wtick(hz), f, 'sfx', f'falling tick {hz} Hz ({["right", "middle", "left"][i]} dot drops, drags its third)', G['fall_tick'], TICK_PAN[i])
        put(air_fall(0.3, 1.0, TICK_PAN[i] * 1.6), f, 'sfx', None, G['whoosh'] * 0.9)
    note(30, 'music low-pass closes 8 kHz -> 400 Hz over f30-44; music out from f45 (fade f44.5-46)', 'music')

    # --- f45-71 DEAD: room tone at -40 dBFS; the drained dots land (soft taps), no ghost clicks (R3-4)
    for k, (f, p) in enumerate([(45, 0.3), (47, 0.0), (49, -0.3)]):
        tap = lp(wood_tock(300 - 20 * k, 1.0), 1400)
        put(tap, f, 'sfx', f'soft tap: drained dot {k + 1} lands on the floor', G['tap'] * (1 - 0.12 * k), p)
        put(tap, f + 1.5, 'sfx', None, G['tap'] * 0.35, p)
    note(45, 'dead beat f45-71: room tone only (no ghost clicks, R3-4)', 'room')

    # --- f72-89 RETURN: jump whoosh, riser, filter opens, rising landing ticks right to left
    put(whoosh(0.22, 350, 6000, pan_from=0.0, pan_to=0.1, peak=0.85), 72, 'sfx', 'jump whoosh (dots turn lime and jump)', G['whoosh'])
    put(riser(0.6, 300, 8000), 72, 'sfx', 'riser f72-89', G['riser'] * 0.8)
    for i, f in enumerate((78, 81, 84)):
        put(wtick(NOTES[i], 1.1), f, 'sfx', f'rising landing tick {NOTES[i]:.1f} Hz (dot lands on the ش, {["x 807", "x 715", "x 623"][i]})', G['land_tick'], TICK_PAN[i])
    put(lp(mirwas_dum(), 900), 75, 'music', 'low dum under the opening filter', G['dum'] * 1.2)
    for k, f in enumerate([78.75, 82.5, 84.375, 86.25, 88.125]):
        put(mirwas_tak(), f, 'music', None, G['tak'] * (0.35 + 0.12 * k))
    note(72, 'music filter opens 400 Hz -> 12 kHz over f72-89', 'music')

    # --- HERO 1 f90: 808 + group clap + V3 «طشّ!» dry; shockwave
    put(hit808(A1, 1.4), 90, 'music', 'HERO 1: 808 A1 55 Hz (+110/165/220 Hz)', G['hero808'])
    put(gkick(1.0), 90, 'music', 'HERO 1: kick', G['hero_kick'])
    put(group_clap(90, 10, 0.42), 90, 'music', 'HERO 1: group clap (10 hands)', G['hero_clap'])
    put(mirwas_dum(), 90, 'music', None, G['dum'])
    put(shockwave(), 90, 'hit', 'shockwave from the ش (r 0 to 2300 in 4 f), wordmark slam', G['shock'])
    put(VO['v3'], 90, 'voice', '«طشّ!» V3 dry single take, onset on f90', G['voice'], dt=-VO['on3'])

    # --- f105-134 portholes, clap f120 (in the groove), mirwas fill into f135
    for k, (f, p) in enumerate([(105, -0.5), (108, 0.0), (111, 0.5)]):
        put(porthole_pop(520 + 60 * k, 1250 + 150 * k), f, 'hit', f'porthole pop {k + 1} (x {[270, 540, 810][k]})', G['pop'], p)
    note(120, 'clap f120 = groove clap (portholes cut to their next 15 frames)', 'music')
    for k, f in enumerate([127.5, 129.375, 131.25, 133.125]):
        put(mirwas_tak(), f, 'music', 'mirwas fill into f135' if k == 0 else None, G['tak'] * (0.45 + 0.15 * k))

    # --- f135.. the worlds: kick or clap on every entry, one world sound each
    for f, kind, what in V['worlds']:
        if kind == 'kick':
            note(f, f'kick: {what}', 'music')
        elif kind == 'clap':
            note(f, f'group clap: {what}', 'music')
    put(ice_clink(R), V['clink'], 'sfx', 'ice clink + small splash (Coffee A; ice impact about f138)', G['clink'])
    put(charcoal(R), V['crackle'], 'sfx', 'charcoal crackle + smoke puff (Oud A; no puff on screen, the sound carries it)', G['crackle'])
    if V['breath']:
        put(smoke_breath(), V['breath'], 'sfx', 'breath of smoke (Oud B punch-in)', G['breath'])
    s0, s1 = V['sizzle']
    put(grill(fr(s1 - s0) + 0.4), s0, 'sfx', f'sizzle bed f{s0}-{s1} (Burger A, sound only)', G['sizzle'])
    put(hit808(A1, 1.0), V['bun'], 'music', '808 A1 on the bun landing (Burger B, exactly on the cut)', G['land808'])
    put(bun_thump(), V['bun'], 'sfx', 'bun thump (Burger B)', G['thump'])
    put(crunch(R, 0.4, syrup=0.3, soft=1.0), V['crunch'], 'sfx', 'soft crunch (Kunafa A)', G['crunch'])

    # --- TALK: mirwas + bass only, V2, typing ticks under the dot triplet (period 15 f, 5 f lag, right to left)
    t0, t1 = V['talk'], V['mult'][0]
    put(VO['v2'], t0, 'voice', '«شنو حسابهم؟!» V2 (1.10 s)', G['voice'], dt=-VO['on2'])
    k = 0
    for f in range(t0, t1, 5):
        i = ((f - t0) // 5) % 3
        put(wtick(NOTES[i]), f, 'sfx', None, G['tick_talk'], TICK_PAN[i]); k += 1
    note(t0, f'typing ticks every 5 frames f{t0}-{t1 - 5} ({k} ticks, D6/Eb6/F#6 right to left, period 15 f)', 'sfx')

    # --- MULTIPLICATION: ticks tripling per step, pitch up a fourth per step; riser; throws
    steps = V['mult'] + [V['flood']]
    for k in range(3):
        a, b = steps[k], steps[k + 1]
        per = 3 * 3 ** k; mul = 2 ** (5 * k / 12)
        n = max(1, int(round(per * (b - a) / 15)))
        for j in range(n):
            f = a + (b - a) * j / n + R.normal(0, 0.12 * (b - a) / n)
            note_ = NOTES[j % 3] * mul
            pan = TICK_PAN[j % 3] if k == 0 else R.uniform(-0.85, 0.85)
            put(wtick(note_, body=0.55 if k == 0 else 0.3, d=0.05 if k < 2 else 0.03), max(a, f), 'sfx', None,
                G['swarm'] * V['swarm'] * (1.0 if k == 0 else 0.8 if k == 1 else 0.55), pan)
        put(whoosh(0.16, 900, 5200, pan_from=0.0, pan_to=[0.5, -0.5, 0.2][k], peak=0.5), a, 'sfx',
            f'multiplication step {k + 1}: {3 ** (k + 2)} dots, {n} typing ticks at {per} per 15 f, pitch x{mul:.3f} (+{5 * k} st)', G['zip'])
    rise = fr(V['pocket'][0] - V['mult'][0])
    put(riser(rise, 250, 9000), V['mult'][0], 'sfx', f'riser f{V["mult"][0]}-{V["pocket"][0]} (peaks into the flood)', G['riser'])
    put(inflate(fr(V['pocket'][0] - V['flood'])), V['flood'], 'sfx', 'flood: 81 dots inflate (swell)', G['inflate'])
    mirwas_roll(V['flood'], V['pocket'][0] - 0.5, 8, G['tak'] * 0.9, lambda f, g: put(mirwas_tak(), f, 'music', None, g))
    note(V['flood'], 'mirwas roll (32nds, crescendo) into the duck', 'music')
    note(V['duck'], 'duck -9 dB (music and sound design)', 'music')
    note(V['pocket'][0], f'silence pocket f{V["pocket"][0]}-{V["pocket"][1] - 1} (room tone only)', 'music')

    # --- HERO 3: 808 + clap + burst pop + V3 stacked x3
    h3 = V['hero3']
    put(hit808(A1, 1.5), h3, 'music', 'HERO 3: 808 A1 55 Hz (+110/165/220 Hz)', G['hero808'])
    put(gkick(1.0), h3, 'music', 'HERO 3: kick', G['hero_kick'])
    put(group_clap(h3, 12, 0.45), h3, 'music', 'HERO 3: group clap (12 hands)', G['hero_clap'])
    put(burst_pop(R), h3, 'hit', 'burst pop (81 dots fly out, slowing)', G['burst'])
    put(VO['stack'], h3, 'voice', '«طشّ!» V3 stacked x3 (0/+35/+70 ms, 0/+2/-3 st, centre/left/right), onset on the hit', G['voice_stack'], dt=-VO['on3'])

    # --- CTA: soft kick on each band cut, two-note pop on «بالخاص»
    for f, world in V['band']:
        put(soft_kick(), f, 'music', f'soft kick: band cuts to {world}', G['soft_kick'])
    put(note_pop(nf('A5')), V['pop2'], 'hit', 'two-note pop, note 1 A5 (synthesised)', G['notepop'], 0.1)
    put(note_pop(nf('D6')), V['pop2'] + 3, 'hit', 'two-note pop, note 2 D6', G['notepop'], -0.1)

    # --- WIND-UP: reverse swell, then 2 frames of air into f0
    a, b = V['swell']
    put(reverse_swell(fr(b - a)), a, 'sfx', f'reverse swell f{a}-{b - 1}, hard stop, then {F - b} frames of air into f0', G['swell'])

    # --- the groove (per 16th), bass line, chords, riff
    groove(V, put, note, hero_frames)
    return m, cues


def groove(V, put, note, hero_frames):
    F = V['frames']
    for b0, nb in V['bars']:
        chord = V['chords'][b0]; root, fifth = ROOTS[chord]
        bar_end = b0 + nb * 15
        for s in range(nb * 4):
            f = b0 + s * 3.75
            if f < 0 or f >= F:
                continue
            st = style_at(V, f)
            sw = 0.02 if s % 4 == 2 else 0.0
            hero = any(abs(f - h) < 0.01 for h in hero_frames)
            in_tash = any(0 < f - h < 23 for h in hero_frames)                # «طشّ!» is speaking
            # mirwas
            if st in MIR_LEVEL and (s % 16) in MIR and (st not in MIR_ONLY or (s % 16) in MIR_ONLY[st]):
                kind, v = MIR[s % 16]
                if not (hero and kind == 'dum') and not (in_tash and kind == 'tak'):
                    x = mirwas_dum() if kind == 'dum' else mirwas_tak()
                    put(x, f, 'music', None, v * MIR_LEVEL[st] * (G['dum'] if kind == 'dum' else G['tak']), -0.1 if kind == 'tak' else 0.0, dt=sw)
            # kick
            kick_on = {'drain': s % 8 == 0, 'full': s % 8 == 0, 'peak': s % 4 == 0,
                       'build': s % 4 == 0 or (f >= V['build8'] and s % 2 == 0), 'half': (s % 16) in (0, 10)}.get(st, False)
            if kick_on and not hero and not any(abs(f - w) < 0.01 and kind == '808' for w, kind, _ in V['worlds']):
                put(gkick(0.9 if st != 'full' else 0.7), f, 'music', f'kick ({st})' if s % 4 == 0 else None,
                    G['kick_full'] if st in ('full', 'drain', 'half') else G['kick'])
            # group clap every 30 frames (2 and 4 of the Khaleeji bar)
            clap_on = {'drain': s % 8 == 0, 'full': s % 8 == 0, 'peak': s % 8 == 0, 'half': (s % 16) == 8}.get(st, False)
            if clap_on and not hero:
                put(group_clap(int(f * 7) % 997, 7, 0.38), f, 'music', f'group clap ({st})', G['clap'])
            # shaker
            if st in SHAKER and s % SHAKER[st][0] == 0:
                put(shaker(0.09), f, 'music', None, (0.22 if s % 4 == 0 else 0.13) / 0.22 * G['shaker'] * SHAKER[st][1], 0.3, dt=sw)
        # bass line
        line = [(0, root, 0.5, None), (7, root * 2, 0.2, None), (10, fifth, 0.35, None), (14, root, 0.3, root * 2 ** (-2 / 12))]
        for s, f0, d, gl in line:
            f = b0 + s * 3.75
            if s >= nb * 4 or f < 0 or f >= F:
                continue
            st = style_at(V, f)
            if st not in BASS_LEVEL or any(abs(f - h) < 0.01 for h in hero_frames):
                continue
            if st == 'half':
                if s == 0: put(bass808(root, 1.8, gain=G['bass'] * 0.9), f, 'music', 'bass: long root (half-time)')
                continue
            if st == 'calm' and s not in (0, 10):
                continue
            put(bass808(f0, d, glide=gl, gain=G['bass'] * BASS_LEVEL[st]), f, 'music', None)
        # chords: one pad per style segment inside the bar, e-piano stabs, the riff in peak bars
        segs, f = [], max(0, b0)
        while f < min(bar_end, F):
            e = min(style_end(V, f), bar_end, F); segs.append((f, e, style_at(V, f))); f = e
        for fa, fb, st in segs:
            if st not in CHORD_LEVEL:
                continue
            lvl = CHORD_LEVEL[st]; d = fr(fb - fa)
            put(pad([nf(n) for n in CHORDS[chord]], d + 0.3, cutoff=1900, attack=min(0.25, d / 3), release=min(0.5, d / 2 + 0.1)),
                fa, 'music', f'chord {chord} ({st}) f{fa:g}-{fb:g}', G['pad'] * lvl)
            if st in PAD_ONLY:
                continue
            up = [nf(n) * 2 for n in CHORDS[chord][1:]]
            for beat, dd, v in [(0, 1.0, 0.75), (1.5, 0.35, 0.5), (2.5, 0.6, 0.62), (3.5, 0.3, 0.45)]:
                ff = b0 + beat * 15
                if fa - 1e-6 <= ff < fb and beat * 4 < nb * 4 and not any(abs(ff - h) < 0.01 for h in hero_frames):
                    for kk, fq in enumerate(up):
                        put(epiano(fq, dd, v), ff, 'music', None, G['ep'] * lvl, dt=0.008 * kk)
            if st == 'peak' and nb == 4:
                for s, nm in RIFF[chord]:
                    ff = b0 + s * 3.75
                    if fa <= ff < fb:
                        put(pluck(nf(nm), 0.5, bright=0.5), ff, 'music', None, G['pluck'], 0.25)


# ----------------------------------------------------------------------------- bus processing, master, checks
def process(V, m):
    F = V['frames']; DUR = fr(F)
    key = m.bus('voice'); N = len(m.buf)
    sc = sidechain(key)
    sc_band = sc ** (5.0 / 6.0)                                               # music 0.7-4 kHz: a further -5 dB
    mus = [(0, 0), (fr(44.5), 0), (fr(46), -90), (fr(72) - 0.003, -90), (fr(72), 0)]
    flood = [(fr(V['duck']) - 0.012, 0), (fr(V['duck']), -9), (fr(V['pocket'][0]) - 0.004, -9), (fr(V['pocket'][0]), -90),
             (fr(V['pocket'][1]) - 0.003, -90), (fr(V['pocket'][1]), 0)]
    cta = [(fr(V['cta']) - 0.01, 0), (fr(V['cta']), -2.5), (fr(V['thin']), -2.5), (fr(V['windup']), -6), (DUR, -8), (DUR + 2.5, -8)]
    mus_auto = automation(N, mus + flood + cta)
    sfx_auto = automation(N, [(0, 0)] + flood + [(DUR + 2.5, 0)])

    def music_fx(x):
        x = drain_filter(x)
        x = x + reverb(hp(x, 250), decay=0.9, mix=1.0, tone=5000)[:len(x)] * 0.10     # the room, high-passed
        x = x * mus_auto[:, None] * sc[:, None]
        band = bp(x, 700, 4000, order=2); x = x - band + band * sc_band[:, None]     # extra voice-band dip
        x = low_mono(x, 150, -2.5)
        x = x - lp(x, 120) * (1 - db(-4.0))                                       # low shelf -4 dB (phones)
        return peak_eq(peak_eq(x, 2500, 3.0, 0.8), 1000, 2.0, 0.9)

    m.process_bus('music', music_fx)
    sc_fx = sc ** (8.0 / 6.0)                                                  # sound beds: -8 dB under a voice
    m.process_bus('sfx', lambda x: low_mono(x * sfx_auto[:, None] * sc_fx[:, None], 150, 0.0))
    m.process_bus('hit', lambda x: low_mono(x * sfx_auto[:, None] * sc[:, None], 150, 0.0))   # transients pass the 8 ms attack
    return sc


def fold(V, m):
    Nf = n_(fr(V['frames']))
    raw = m.buf.copy()
    for b in m.buses.values():
        raw += b[:len(raw)]
    loop = raw[:Nf].copy(); loop[:len(raw) - Nf] += raw[Nf:]          # the tail rings into the head, as it does on replay
    return loop


def master(V, loop):
    Nf = len(loop)
    tile = np.vstack([loop, loop, loop])
    tile = hp(tile, 28, order=4)
    tile = compress(tile, thresh_db=-14, ratio=2.0, attack=0.01, release=0.15)
    tile = sat(tile * 1.05, 1.15)
    y = tile[Nf:2 * Nf]
    for _ in range(6):
        yl = limit(np.vstack([y, y, y]), -2.3)[Nf:2 * Nf]
        I, P = ffmpeg_lufs(yl)
        if abs(I + 14.0) < 0.08:
            break
        y = y * db(-14.0 - I)
    return yl


def rms_db(x):
    return float(20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-12))


def render(V, VO, room_gain):
    t_ = time.time()
    m, cues = score(V, VO)
    m.buses['room'] *= room_gain
    sc = process(V, m)
    loop = fold(V, m)
    y = master(V, loop)
    return dict(y=y, m=m, cues=cues, sc=sc, secs=time.time() - t_)


def checks(V, VO, r):
    y, m, sc = r['y'], r['m'], r['sc']
    F = V['frames']; Nf = len(y)
    I, P = ffmpeg_lufs(y)
    lo, mid = share(y, 20, 150), share(y, 500, 6000)
    a, b = V['room_window']; room = rms_db(y[n_(fr(a)):n_(fr(b))])
    pa, pb = V['pocket']; pocket = rms_db(y[n_(fr(pa)):n_(fr(pb))])
    # voices over the bed in 300-4000 Hz, measured on the processed buses while each voice speaks
    voice = m.buses['voice'][:Nf]; bed = sum(m.buses[k][:Nf] for k in ('music', 'sfx', 'hit', 'room')) + m.buf[:Nf]
    env_t, env = band_env(mono(voice), 100, 8000, 0.02, 0.005)
    rows = []
    for name, f0, dur in [('V1 «مشروعك حلو…»', 0, len(VO['v1']) / SR), ('V3 «طشّ!» f90', 90, 0.8),
                          ('V2 «شنو حسابهم؟!»', V['talk'], 1.1), ('V3 x3 «طشّ!»', V['hero3'], 0.9)]:
        t0, t1 = fr(f0) - 0.1, fr(f0) + dur
        sel = (env_t >= t0) & (env_t < t1)
        thr = env[sel].max() - 25
        mask = np.zeros(Nf, bool)
        for tc, e in zip(env_t[sel], env[sel]):
            if e > thr: mask[max(0, n_(tc - 0.0025)):n_(tc + 0.0025)] = True
        ev, eb = band_energy(voice, 300, 4000, mask), band_energy(bed, 300, 4000, mask)
        rows.append((name, 10 * np.log10(ev / (eb + 1e-12)), 20 * np.log10(sc[:Nf][mask].min()), mask.sum() / SR))
    # 808 harmonics (the hero hit alone)
    h = hit808(A1, 1.4)[:n_(0.6)]; sp = np.abs(np.fft.rfft(h * np.hanning(len(h)))); fq = np.fft.rfftfreq(len(h), 1 / SR)
    lv = lambda f: 20 * np.log10(sp[(fq > f - 4) & (fq < f + 4)].max())
    harm = [round(lv(f) - lv(55), 1) for f in (110, 165, 220)]
    ok = {
        'loudness -14 +/- 0.5 LUFS': abs(I + 14) <= 0.5,
        'true peak <= -2 dBTP': P <= -2.0,
        'energy 500 Hz-6 kHz >= 25 %': mid >= 0.25,
        'energy < 150 Hz <= 50 %': lo <= 0.50,
        'voices >= +6 dB over the bed (300-4000 Hz)': all(r_[1] >= 6.0 for r_ in rows),
        'music side-chain -6 dB under each voice': all(abs(r_[2] - MUSIC_SC_DB) < 0.3 for r_ in rows),
        'dead-beat room tone -40 dBFS +/- 1.5': abs(room - ROOM_TARGET) <= 1.5,
        f'length {F} frames = {Nf} samples': Nf == F * SR // FPS,
    }
    return dict(I=I, P=P, lo=lo, mid=mid, room=room, pocket=pocket, voices=rows, harm=harm, ok=ok,
                seam=float(np.abs(y[0] - y[-1]).max()), first=float(np.abs(y[:48]).max()))


def calibrate_and_render(V, VO):
    g = 1.0
    r = render(V, VO, g)
    a, b = V['room_window']; room = rms_db(r['y'][n_(fr(a)):n_(fr(b))])
    g = g * db(ROOM_TARGET - room)
    r = render(V, VO, g)
    r['room_gain'] = g
    return r


def main():
    os.makedirs(OUT, exist_ok=True)
    VO = prep_voices()
    i1 = VO['info']['V1']
    print(f'V1 «حلو» onset: measured {i1["measured_closure_s"]:.3f} s (the «ح» frication at {i1["measured_hilu_frication_s"]:.3f} s); '
          f'stretched {i1["stretch_percent"]:.1f} % (rubberband tempo {i1["rubberband_tempo"]}) + head trim {i1["head_trim_ms"]:.1f} ms '
          f'-> placed {i1["placed_closure_s"]:.3f} s (frication {i1["placed_hilu_frication_s"]:.3f} s), stem now {i1["placed_seconds"]:.3f} s')
    print(f'V2 onset {VO["on2"] * 1000:.1f} ms, V3 onset {VO["on3"] * 1000:.1f} ms (placed so the onset sits on the frame); '
          f'stack alignment {VO["info"]["V3_stack"]["align_ms"]} ms')
    sheet = dict(spec='v4/BUILD-SPEC.md §10, §7, §11 A-14, §15 R3-1..R3-24 (R3 wins; no version B)', fps=FPS, bpm=BPM,
                 beat_frames=15, sample_rate=SR, script='v4/build/audio_v4.py', voices=VO['info'])
    failed = False
    for V in (A20, A14):
        r = calibrate_and_render(V, VO)
        path = os.path.join(OUT, f'{V["name"]}.wav')
        wavfile.write(path, SR, r['y'].astype(np.float32))
        c = checks(V, VO, r)
        print(f'\n{V["name"]}: wrote {path} ({len(r["y"])} samples = {len(r["y"]) / SR:.3f} s, {V["frames"]} frames, '
              f'48 kHz stereo float; render {r["secs"]:.0f} s)')
        print(f'  integrated loudness {c["I"]:.1f} LUFS (ffmpeg ebur128) · true peak {c["P"]:.1f} dBTP')
        print(f'  energy share: below 150 Hz {100 * c["lo"]:.1f} % · 500 Hz-6 kHz {100 * c["mid"]:.1f} %')
        for name, ratio, scd, secs in c['voices']:
            print(f'  {name}: voice over music+sfx in 300-4000 Hz {ratio:+.1f} dB over {secs:.2f} s; music side-chain {scd:.1f} dB')
        print(f'  808 harmonics vs 55 Hz: 110 Hz {c["harm"][0]:+.1f} dB, 165 Hz {c["harm"][1]:+.1f} dB, 220 Hz {c["harm"][2]:+.1f} dB')
        print(f'  dead-beat room tone f{V["room_window"][0]}-{V["room_window"][1]} {c["room"]:.1f} dBFS RMS · silence pocket '
              f'f{V["pocket"][0]}-{V["pocket"][1] - 1} {c["pocket"]:.1f} dBFS · first sample {c["first"]:.3f} · seam jump f599->f0 {c["seam"]:.4f}')
        for k, v in c['ok'].items():
            print(f'  [{"PASS" if v else "FAIL"}] {k}')
            failed |= not v
        cues = sorted(r['cues'], key=lambda q: (q['frame'], q['bus']))
        sheet[V['name']] = dict(file=f'audio/{V["name"]}.wav', frames=V['frames'], seconds=fr(V['frames']), samples=len(r['y']),
                                checks=dict(lufs=round(c['I'], 2), true_peak_dbtp=round(c['P'], 2),
                                            share_below_150=round(c['lo'], 4), share_500_6k=round(c['mid'], 4),
                                            room_tone_dbfs=round(c['room'], 2),
                                            voice_over_bed_db={n: round(v, 1) for n, v, _, _ in c['voices']},
                                            seam_jump=round(c['seam'], 5), passed=all(c['ok'].values())),
                                cues=cues)
    with open(os.path.join(OUT, 'cues.json'), 'w') as f:
        json.dump(sheet, f, ensure_ascii=False, indent=1)
    print(f'\nwrote {os.path.join(OUT, "cues.json")} ({len(sheet["A20"]["cues"])} A-20 cues, {len(sheet["A14"]["cues"])} A-14 cues)')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
