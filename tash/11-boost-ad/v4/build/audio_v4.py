#!/usr/bin/env python3
"""TASH boost ad v4 «نقاط مشروعك»: the 20 s (A-20) and 14 s (A-14) scores.

Source of truth: v4/BUILD-SPEC.md §10 (audio plan), §7 (beat table), §11 A-14, §15 R3-1..R3-24 (R3 wins), and the
world swap of 10 Nov (v4/swap/director-plan.json): the world sounds follow the new pictures (HABBA latte pour + bean,
LAYL atomiser + bottle, STAKK crown, a sauce / syrup drizzle that fits both sweet options).
Pure synthesis on the TASH engine (tash/_system/audio/tashaudio.py) with the patterns of the v3 score (src/audio.py).
No samples, loops or library music. The only recorded audio is the three approved ElevenLabs stems in
src/assets/rec/ (voice1.wav, voice2.wav, voice3_tash.wav): re-timed (6 % stretch at most, plus about 43 ms cut out of
the silent «ك» closure of voice1 so its «ح» lands within a frame of f15), filtered, never re-voiced.

Music: 120 BPM, 1 beat = 15 frames = 0.5 s at 30 fps, D Hijaz. Bars start at f30 + 60k, so HERO 1 (f90), HERO 3 (f390)
and the CTA (f450) each open a bar; group claps fall on every multiple of 30 frames. A-14 has one 2-beat bar at f270 so
its HERO 3 (f300 = 10.0 s) also opens a bar. The hero 808 sits on A1 = 55 Hz with saturated 110 / 165 / 220 Hz.
The three dots are three woodblock ticks D6 / E♭6 / F♯6 (1174.7 / 1244.5 / 1480 Hz), typed right to left.

Run (from anywhere):  python3 tash/11-boost-ad/v4/build/audio_v4.py
Writes v4/build/audio/A20.wav (960 000 samples), A14.wav (672 000 samples), 48 kHz stereo float, and cues.json; prints the
phone-speaker checks and exits 1 if any check fails. The limiter ceiling starts at -2.85 dBTP and is lowered further until
the WAV measures -2.85 dBTP or lower (8x across the loop wrap, both a polyphase resample and the ideal band-limited FFT
interpolation of the loop, and ffmpeg's own meter) and the AAC 320 kb/s encode that mux.sh makes stays at -2 dBTP or lower
(AAC overshoots the WAV by a few tenths of a dB).
The checks include one per named world sound (pour, drizzles, bean, atomiser, bloom, glass, sizzle, bun landing): its own
processed signal must stand +3 dB or more over everything else (voices included) in its own band in some 150 ms window
of its moment, measured on the processed buses before the master (mono, the loop tail folded in); see audibility().
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
HILU_AT = 0.500                                   # the «ح» of «حلو» must be heard here (clap f15), within one frame
MAX_STRETCH = 0.06
CLOSURE_CUT = 0.045                               # s cut from the middle of the silent «ك» closure of voice1 (raw time)
CLOSURE_KEEP = 0.011                              # s of the closure kept after the vowel; the rest stays before the «ح»
HOOK808_MID_DUCK = (-6.0, 0.30, 0.05)             # dB, until s, ramp back s: the hook 808's phone-band copy under «مشـ»
HOOK808_BODY_CUT = (-10.0, 0.15, 0.05, 300, 1000) # dB, until s, ramp s, Hz: the whole hook 808 in 300-1000 Hz under «مـ» (C3)
POUR_SWELL = (0.03, 0.95, 8.0)                    # the opener pour rises from 30 ms before the V1 stem ends to 0.95 s, by dB
HILU_POUR_MAX = 1.75                              # dB the opener pour may cost «حلو» (V1 from its «ح» to its end), 300-4000 Hz:
                                                  # its plain level costs 1.4-1.6 dB, a swell under «لو» (0.70 s) took A-20 to 1.9

# ----------------------------------------------------------------------------- mix levels (linear gains)
G = dict(
    voice=1.95, voice_stack=1.60,
    hero808=0.40, hook808=0.38, land808=0.42, hero_kick=0.30, hero_clap=0.85, hook_clap=0.42,
    kick=0.28, kick_full=0.26, soft_kick=0.26, clap=0.90, dum=0.32, tak=0.95, shaker=0.30,
    bass=0.13, pad=0.18, ep=0.36, pluck=0.20,
    tick=0.50, tick_talk=0.30, swarm=0.22, fall_tick=0.46, land_tick=0.46, tap=0.40,
    pour=0.85, bean=1.80, spray=0.45, bloom=1.60, glass=0.35, drizzle=0.75, sizzle=0.84, thump=1.50,
    pop=0.50, burst=0.55, shock=0.55, whoosh=0.40, riser=0.30, inflate=0.30, zip=0.22, notepop=0.45, swell=0.55,
)
DRIZZLE_BAND = (1800, 4500)                       # the drizzle's glossy sheen: where the groove is thin (not the bass's 160-1400 Hz)
BLOOM_BAND = (1400, 5600)
THUMP_BAND = (250, 800)
SIZZLE_BAND = (2000, 9000)
AUD_WIN, AUD_HOP, AUD_GATE = 0.150, 0.010, 3.0    # audibility: best 150 ms window, own band, >= +3 dB over everything else
WAV_CEILING = -2.85                               # dBTP limiter ceiling to start from (lowered if the 8x check or the AAC needs it)
WAV_TP_MAX = -2.85                                # dBTP, the wav's true peak at 8x oversampling across the loop wrap
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


def hit808(f=A1, d=1.3, gain=1.0, mid_duck=None, body_cut=None):
    """Hero 808: 55 Hz with its 110 / 165 / 220 Hz harmonics written in, saturated, plus a phone-band copy and a click.
    mid_duck=(dB, until_s, ramp_s) lowers only the phone-band copy (250-1600 Hz) at the start, so a voice that starts
    with the hit is not masked; the body, its harmonics and the click stay (the hook: F2 of the audio check).
    body_cut=(dB, until_s, ramp_s, lo, hi) then cuts lo-hi Hz of the whole note (body and copy) for that long: the
    saturated body carries 300-1000 Hz too, so the copy's duck alone leaves the «م» of «مشروعك» under it (C3)."""
    t = tt(d)
    ph = np.cumsum(f * (1 + 0.6 * np.exp(-t / 0.03))) / SR
    x = sum(a * np.sin(2 * np.pi * k * ph) for k, a in ((1, 1.0), (2, 0.9), (3, 0.75), (4, 0.6)))
    body = sat(x * env_exp(d, 0.30, 0.0015) * 1.1, 2.4)
    mid = bp(sat(body * 2.5, 3.0), 250, 1600) * 0.6
    if mid_duck:
        dd, t1, rr = mid_duck
        mid = mid * db(np.interp(t, [0.0, t1, t1 + rr], [dd, dd, 0.0]))
    click = bp(noise(0.01), 1800, 6000) * env_exp(0.01, 0.0018) * 0.5
    y = lp(body, 3000) * 0.60 + mid
    if body_cut:
        cd, c1, cr, clo, chi = body_cut
        band = sig.sosfiltfilt(sig.butter(4, [clo, chi], 'band', fs=SR, output='sos'), y)     # zero phase: a clean cut
        y = y - band * (1 - db(np.interp(t, [0.0, c1, c1 + cr], [cd, cd, 0.0])))
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
def slow_mod(R, N, fc, depth):
    """A slow random level wobble (1 +/- depth), for streams that should not sound like steady noise."""
    m = lp(R.standard_normal(N), fc)
    return np.clip(1 + depth * m / (m.std() + 1e-9), 0.25, None)


def milk_pour(R, d=1.0, start_db=-5.0, full_at=0.5, swell=None):
    """Opener and return (HABBA k3_pour, a hot latte): a thin milk stream into the cup while the art forms. A soft,
    steady stream (450-2600 Hz) over a low cup resonance, with a few tiny surface bubbles; no impact and no splash (the
    808 carries the hit on f0). It comes in soft (start_db) and reaches full level at full_at (the f15 punch-in comes
    closer), so it stays out of the way of «مشـ» at the start; it keeps 2-6 kHz low for the same reason.
    swell=(from_s, to_s, dB): the stream then rises by dB (the opener: once V1 has spoken, the pour is the sound of the
    shot until the drain)."""
    N = n_(d); t = np.arange(N) / SR
    stream = bp(noise(d, 'pink'), 450, 2600) * 0.55 + bp(noise(d), 2600, 6000) * 0.05
    cup = lp(noise(d, 'brown'), 380) * 0.22
    y = (stream + cup) * slow_mod(R, N, 14, 0.28)
    for _ in range(int(9 * d)):
        f = R.uniform(700, 1500); p = pop(f, f * R.uniform(1.25, 1.6), 0.025) * R.uniform(0.05, 0.13)
        i0 = n_(R.uniform(0.04, max(0.05, d - 0.06))); y[i0:i0 + len(p)] += p[:N - i0]
    e = np.clip(t / 0.06, 0, 1) ** 1.5 * db(np.interp(t, [0.0, full_at], [start_db, 0.0]))
    if swell:
        e = e * db(np.interp(t, [swell[0], swell[1]], [0.0, swell[2]]))
    return stereo(fade(y * e, 0.001, 0.08), 0, width=0.5)


def bean_tap(R):
    """Coffee A (HABBA k4_beans, the bean touches at about f138): a small, crisp wooden tap (a hard shell click over a
    short table knock), then two tiny ticks as the bean rocks flat."""
    out = np.zeros(n_(0.45))
    click = bp(noise(0.006), 2500, 9000) * env_exp(0.006, 0.0007) * 0.7
    shell = membrane(1250, 0.06, 0.008, pitch_drop=0.02, strike=1.0, strike_band=(2500, 8000)) * 0.6
    table = membrane(240, 0.14, 0.035, pitch_drop=0.04, strike=0.2, strike_band=(900, 3000)) * 0.45
    knock = bp(noise(0.03), 500, 1800) * env_exp(0.03, 0.006) * 0.35
    for x in (click, shell, table, knock):
        out[:len(x)] += x
    for dt_, g in ((0.075, 0.30), (0.16, 0.14)):
        tk = membrane(1250 * R.uniform(0.95, 1.08), 0.04, 0.005, pitch_drop=0.01, strike=1.0, strike_band=(3000, 8000)) * g
        i0 = n_(dt_); out[i0:i0 + len(tk)] += tk
    return fade(out, 0.0002, 0.05)


def atomiser(d=0.55):
    """Perfume A (LAYL S4, the cap sprays): the pump click (the cap goes down, the valve opens: two clicks 11 ms apart)
    and then a fine spray hiss of about 0.3 s that tails off."""
    N = n_(d); t = np.arange(N) / SR; y = np.zeros(N)
    for dt_, g in ((0.0, 0.9), (0.011, 0.65)):
        c = bp(noise(0.008), 1800, 7000) * env_exp(0.008, 0.0012) * g
        b = membrane(1650, 0.03, 0.004, pitch_drop=0.03, strike=1.0, strike_band=(2500, 7000)) * g * 1.2
        i0 = n_(dt_); y[i0:i0 + len(c)] += c; y[i0:i0 + len(b)] += b
    e = np.clip((t - 0.016) / 0.018, 0, 1) * np.exp(-np.clip(t - 0.30, 0, None) / 0.07)
    hiss = (bp(noise(d), 3500, 13000) * 0.50 + bp(noise(d, 'pink'), 1200, 3500) * 0.12) * e
    return stereo(fade(y + hiss, 0.0002, 0.04), 0, width=0.6)


def mist_bloom(d=0.5):
    """Perfume B (LAYL f210-224 punched in: the cloud blooms): a soft, wide swell of air, no tone (the tone is saved
    for the bottle in the lens). It blooms over the punch-in (f180-194) and is gone by the bottle's glass tone (f195)."""
    N = n_(d); t = np.arange(N) / SR
    e = np.clip(t / 0.12, 0, 1) ** 1.6 * np.exp(-np.clip(t - 0.12, 0, None) / 0.30)
    l = svf_sweep(noise(d, 'pink'), 1400, 5200, q=0.9); r = svf_sweep(noise(d, 'pink'), 1500, 5600, q=0.9)
    return fade(np.stack([l * e, r * e], axis=1) * 0.5, 0.004, 0.12)


def glass_tone(f=nf('Bb6'), d=1.3):
    """Perfume C (the LAYL bottle held in the lens): a soft glass tone on Bb6 (the fifth of the Eb bar it sounds in),
    mallet-soft (no click), a little warmth an octave down, a short room."""
    b = bell(f, d, 0.45)
    s = phase_osc(f / 2, d) * env_exp(d, 0.35, 0.006) * 0.12
    y = np.zeros(max(len(b), len(s))); y[:len(b)] += b; y[:len(s)] += s
    return reverb(stereo(fade(y, 0.004, 0.2), 0, width=0.4), decay=1.2, mix=0.25, tone=8000)


def drizzle(R, d=0.95, soft=1.0, sheen=1.0, tail=0.2):
    """Sweet (DOSE d4_cake sauce, or syrup on the kunafa; one sound fits both): a slow, glossy drizzle. A thick, slow
    stream (160-1400 Hz, kept low: that band belongs to the bass and the chords), slow glops (220-600 Hz, low enough to
    sound thick) as it lands and spreads, each with a small wet smack, and the glossy sheen that a phone hears: a moving
    wet shine (1.8-4.5 kHz, where the groove is thin) with fine sticky droplets in it; no crunch.
    sheen scales the shine and the droplets (the drizzle's phone band); tail = the fade-out at the end."""
    N = n_(d); t = np.arange(N) / SR
    stream = lp(hp(noise(d, 'pink'), 160), 1400) * 0.20 * slow_mod(R, N, 6, 0.3)
    shine = bp(noise(d, 'pink'), 1800, 4500, order=4) * 0.20 * slow_mod(R, N, 9, 0.45)
    drops = np.zeros(N)
    for _ in range(int(60 * d)):
        c = bp(noise(0.006), 2000, 5000) * env_exp(0.006, 0.0012) * R.uniform(0.15, 0.55)
        i0 = n_(R.uniform(0.0, d - 0.007)); drops[i0:i0 + len(c)] += c[:N - i0]
    y = stream + (shine + drops) * sheen
    tk = 0.03
    while tk < d - 0.12:
        f = R.uniform(220, 400); gd = 0.11
        g = phase_osc(np.geomspace(f, f * R.uniform(1.25, 1.45), n_(gd)), gd) * env_exp(gd, 0.035, 0.006) * R.uniform(0.18, 0.32)
        g = lp(g, 1800); w = bp(noise(0.02), 1500, 4000) * env_exp(0.02, 0.004) * 0.10 * sheen; g[:len(w)] += w
        i0 = n_(tk); y[i0:i0 + len(g)] += g[:N - i0]
        tk += R.uniform(0.09, 0.17)
    e = np.clip(t / 0.08, 0, 1) * np.clip((d - t) / tail, 0, 1)
    return stereo(fade(y * e * soft, 0.002, 0.05), 0, width=0.5)


def grill(d=1.0, seed_=9):
    """Burger A-B: the sizzle bed under the crown and the landing (engine sizzle), tamed for phones, swelling in
    and easing down by about 7 dB over its length (it holds under the whole burger beat)."""
    s = lp(sizzle(d, density=700, seed_=seed_), 9000)
    e = np.clip(tt(d) / 0.04, 0, 1) * np.exp(-tt(d) / d)
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


def ffmpeg_tp(x):
    """ffmpeg's own true-peak meter to two decimals (loudnorm's input_tp; it reads a few hundredths above an 8x resample)."""
    with tempfile.NamedTemporaryFile(suffix='.wav') as f:
        wavfile.write(f.name, SR, x.astype(np.float32))
        o = subprocess.run(['ffmpeg', '-nostats', '-i', f.name, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'],
                           capture_output=True, text=True).stderr
    return float(json.loads(o[o.rindex('{'):o.rindex('}') + 1])['input_tp'])


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


def fold_loop(x, Nf):
    """A bus as the loop plays it: the tail after the loop point rings into the head."""
    y = x[:Nf].copy(); y[:len(x) - Nf] += x[Nf:]
    return y


def audibility(V, m):
    """Each named world sound against everything else (all processed buses, voices included, pre-master, mono as a phone
    speaker sums it, the loop tail folded in), in its own band. Returns one row per sound: the best AUD_WIN window inside
    its moment (dB own over rest, and when), the whole moment, how much the sound lifts its band, and the share of the
    sound's 300 Hz-12 kHz energy that falls in that band (so the band is where the sound really is)."""
    Nf = n_(fr(V['frames']))
    total = mono(fold_loop(m.buf + sum(m.buses.values()), Nf))
    W, H = n_(AUD_WIN), n_(AUD_HOP)
    rows = []
    for w in world_sounds(V):
        pm = m.probes[w['probe']]
        own = mono(fold_loop(sum(pm.buses.values()), Nf))
        a, b = n_(fr(w['f0'])), min(Nf, n_(fr(w['f1'])))
        s0, s1 = max(0, a - n_(0.3)), min(Nf, b + n_(0.3))
        sos = sig.butter(4, w['band'], 'band', fs=SR, output='sos')
        ob = sig.sosfiltfilt(sos, own[s0:s1]); rb = sig.sosfiltfilt(sos, total[s0:s1] - own[s0:s1])
        co = np.concatenate([[0.0], np.cumsum(ob ** 2)]); cr = np.concatenate([[0.0], np.cumsum(rb ** 2)])
        i = np.arange(a - s0, max(a - s0 + 1, b - s0 - W + 1), H)
        r = 10 * np.log10((co[i + W] - co[i] + 1e-20) / (cr[i + W] - cr[i] + 1e-20))
        k = int(np.argmax(r)); ia, ib = a - s0, b - s0
        whole = 10 * np.log10((co[ib] - co[ia] + 1e-20) / (cr[ib] - cr[ia] + 1e-20))
        rise = 10 * np.log10(((ob + rb)[ia:ib] ** 2).sum() / ((rb[ia:ib] ** 2).sum() + 1e-20))
        wide = sig.sosfiltfilt(sig.butter(4, [min(300, w['band'][0]), 12000], 'band', fs=SR, output='sos'), own[s0:s1])[ia:ib]
        rows.append(dict(w, best_db=float(r[k]), best_at=(s0 + i[k]) / SR, whole_db=float(whole), rise_db=float(rise),
                         band_share=float((ob[ia:ib] ** 2).sum() / ((wide ** 2).sum() + 1e-20)),
                         passed=bool(r[k] >= AUD_GATE)))
    return rows


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


def v1_marks(x, run_s=0.03):
    """(closure, hilu): start of the silent closure of the «ك» that ends «مشروعك» (= where «حلو» begins) and the onset
    of the «ح» frication after it. run_s: how long the closure must stay down (shorter once the closure is cut)."""
    t, eb = band_env(x, 100, 8000)
    _, eh = band_env(x, 1500, 4000)
    ref = np.median(eb[(t > 0.25) & (t < 0.45)]); run = int(round(run_s / 0.0025))
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


def cut_closure(x, b, h, cut=CLOSURE_CUT, keep=CLOSURE_KEEP, xf=0.005, search=0.0025):
    """Cut about `cut` s out of the silent «ك» closure [b, h] of voice1 (a low voice bar about 25 dB under the speech,
    nothing above 1.5 kHz). Pitch-synchronous splice: the end point moves by up to +/-search so the 10 ms after it best
    matches the 10 ms after the start point, then a short linear crossfade. The «ح» and the «ك» release before it are
    never touched. Returns (shorter stem, cut in s, match of the two splice windows)."""
    a = n_(b + keep); e0 = n_(b + keep + cut); w = n_(0.010); L = n_(search); ra = x[a:a + w]
    ncc = lambda k: float(np.dot(ra, x[e0 + k:e0 + k + w]) / (np.linalg.norm(ra) * np.linalg.norm(x[e0 + k:e0 + k + w]) + 1e-12))
    best = max(range(-L, L + 1), key=ncc); e = e0 + best; n = n_(xf)
    if e + n > n_(h) - n_(0.004):
        raise RuntimeError('closure cut would reach the «ح»')
    r = np.linspace(0, 1, n)
    y = np.concatenate([x[:a], x[a:a + n] * (1 - r) + x[e:e + n] * r, x[e + n:]])
    return y, (e - a) / SR, ncc(best)


def quiet_head(x, below_db=20.0):
    """How much of the head can go: the stem's start while its 5 ms level stays below_db under its speech median."""
    t, e = band_env(x, 100, 8000, 0.005, 0.001)
    ref = np.median(e[e > e.max() - 30])
    return float(max(0.0, t[np.argmax(e > ref - below_db)] - 0.002))


def prep_voices():
    info = {}
    raw1 = read_wav(os.path.join(REC, 'voice1.wav'))
    b0, h0 = v1_marks(raw1)
    # F1: cut about 43-45 ms out of the silent «ك» closure first; then the same 6 % stretch cap as before (no more stretch);
    # then the head trim, limited to the quiet pre-voicing of the «م», places the «ح» (not the closure) near 0.500 s
    cut1, cut_s, splice = cut_closure(raw1, b0, h0)
    hc = h0 - cut_s                                                   # the cut is before the «ح»: it moves by exactly cut_s
    factor = min(1.0, max(1 - MAX_STRETCH, HILU_AT / hc))             # time factor (<1 = shorter), capped at 6 %
    rb = f'rubberband=tempo={1 / factor:.7f}:transients=crisp:formant=preserved:pitchq=quality'
    x1 = cut1 if factor > 0.9999 else ffx(cut1, rb)
    _, h1 = v1_marks(x1, run_s=0.015)
    shift = h1 - HILU_AT; head_max = quiet_head(x1)
    trim = min(max(0.0, shift), head_max)
    if trim > 0:
        x1 = fade(x1[n_(trim):], 0.003, 0.002)                        # the quiet «م» pre-voicing only
    elif shift < 0:
        x1 = np.concatenate([np.zeros(n_(-shift)), x1])
    b2, h2 = v1_marks(x1, run_s=0.015)
    v1 = voice_chain(x1)
    # the reference for the cross-correlation check: the UNCUT stem, same stretch and chain, 160 ms from 10 ms before its «ح»
    xr = raw1 if factor > 0.9999 else ffx(raw1, rb)
    _, hr = v1_marks(xr); vr = voice_chain(xr)
    hilu_ref = vr[n_(hr - 0.010):n_(hr - 0.010) + n_(0.160)]
    info['V1'] = dict(file='src/assets/rec/voice1.wav', source_seconds=round(len(raw1) / SR, 4),
                      measured_closure_s=round(b0, 4), measured_hilu_frication_s=round(h0, 4),
                      raw_closure_ms=round((h0 - b0) * 1000, 1), closure_cut_ms=round(cut_s * 1000, 1),
                      closure_kept_ms=round((h0 - b0 - cut_s) * 1000, 1), splice_match=round(splice, 3),
                      stretch_percent=round((1 - factor) * 100, 2), rubberband_tempo=round(1 / factor, 5),
                      head_trim_ms=round(trim * 1000, 1), head_trim_limit_ms=round(head_max * 1000, 1),
                      head_pad_ms=round(max(0.0, -shift) * 1000, 1),
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
    return dict(v1=v1, v2=v2, v3=v3, stack=stack, on2=on2, on3=on3, info=info, hilu_ref=hilu_ref)


# ----------------------------------------------------------------------------- the two cue sheets
A20 = dict(
    name='A20', frames=600, seed=2020,
    bars=[(-30, 4)] + [(30 + 60 * k, 4) for k in range(10)],
    style=[(0, 'hook'), (30, 'drain'), (45, 'dead'), (72, 'return'), (90, 'full'), (135, 'peak'), (285, 'talk'),
           (330, 'build'), (375, 'flood'), (386, 'pocket'), (390, 'half'), (450, 'calm'), (540, 'thin'), (588, 'wind')],
    chords={-30: 'D', 30: 'D', 90: 'D', 150: 'Eb', 210: 'D', 270: 'Eb', 330: 'Eb', 390: 'D', 450: 'Gm', 510: 'Eb', 570: 'D'},
    worlds=[(135, 'kick', 'Coffee A full frame (HABBA bean lands)'), (150, 'clap', 'Coffee B lens (latte heart)'),
            (165, 'kick', 'Perfume A full frame (LAYL atomiser sprays)'), (180, 'clap', 'Perfume B punch-in (the mist blooms)'),
            (195, 'kick', 'Perfume C lens (LAYL bottle)'), (210, 'kick', 'Burger A full frame (STAKK crown)'),
            (225, '808', 'Burger B: bun lands'), (240, 'kick', 'Burger C lens'), (255, 'kick', 'Sweet A full frame (sauce drizzle)'),
            (270, 'clap', 'Sweet B lens')],
    pour_return=(78, 90), bean=138, spray=165, bloom=180, glass=195, sizzle=(210, 240), bun=225, drizzle=(255, 284),
    beds=[(210, 240), (255, 285)],                # world beds: the groove makes room (no shaker, the riff plays dull)
    talk=285, mult=[330, 345, 360], build8=360, flood=375, duck=381, pocket=(386, 390), hero3=390,
    cta=450, band=[(450, 'sweet'), (480, 'burger'), (510, 'perfume'), (540, 'coffee')], band_land=495, pop2=457, thin=540,
    swell=(588, 598), windup=588, room_window=(56, 71), swarm=1.0,
)
A14 = dict(
    name='A14', frames=420, seed=1414,
    bars=[(-30, 4), (30, 4), (90, 4), (150, 4), (210, 4), (270, 2), (300, 4), (360, 4)],
    style=[(0, 'hook'), (30, 'drain'), (45, 'dead'), (72, 'return'), (90, 'full'), (135, 'peak'), (255, 'talk'),
           (270, 'build'), (285, 'flood'), (296, 'pocket'), (300, 'half'), (315, 'calm'), (375, 'thin'), (414, 'wind')],
    chords={-30: 'D', 30: 'D', 90: 'D', 150: 'Eb', 210: 'D', 270: 'Eb', 300: 'D', 360: 'D'},
    worlds=[(135, 'kick', 'Coffee A full frame (HABBA bean lands)'), (150, 'clap', 'Coffee B lens (latte heart)'),
            (165, 'kick', 'Perfume A full frame (LAYL atomiser sprays)'), (180, 'clap', 'Perfume lens (LAYL bottle)'),
            (195, 'kick', 'Burger A full frame (STAKK crown)'), (210, '808', 'Burger B: bun lands'),
            (225, 'kick', 'Sweet A full frame (sauce drizzle)'), (240, 'clap', 'Sweet B lens')],
    pour_return=(78, 90), bean=138, spray=165, bloom=None, glass=180, sizzle=(195, 225), bun=210, drizzle=(225, 254),
    beds=[(195, 225), (225, 255)],
    talk=255, mult=[270, 275, 280], build8=280, flood=285, duck=291, pocket=(296, 300), hero3=300,
    cta=315, band=[(315, 'sweet'), (345, 'burger'), (375, 'coffee')], band_land=360, pop2=318, thin=375,
    swell=(408, 418), windup=414, room_window=(56, 71), swarm=2.0,   # ticks run under V2 here: +6 dB before the duck
)


def world_sounds(V):
    """The named world sounds and how each is judged audible: its own processed signal against everything else (all buses,
    voices included, the loop tail folded in), in its own phone band, in the best 150 ms window inside its moment
    (frames f0-f1; for a hit that is its first 200 ms, so the window holds its onset)."""
    p0, p1 = V['pour_return']; s0, s1 = V['sizzle']; d0, d1 = V['drizzle']
    W = [('pour', 'milk pour (latte opener)', 0, 30, (450, 2600)),
         ('drizzle_drain', 'drizzle (drain)', 30, 45, DRIZZLE_BAND),
         ('pour_return', 'milk pour (return)', p0, p1, (450, 2600)),
         ('bean', 'bean tap', V['bean'], V['bean'] + 6, (1000, 4000)),
         ('spray', 'atomiser spray', V['spray'], V['spray'] + 15, (2000, 9000))]
    if V['bloom']:
        W.append(('bloom', 'mist bloom', V['bloom'], V['bloom'] + 15, BLOOM_BAND))
    W += [('glass', 'bottle glass tone', V['glass'], V['glass'] + 15, (1700, 2050)),
          ('sizzle', 'sizzle bed', s0, s1, SIZZLE_BAND),
          ('thump', 'bun landing (808 + thump)', V['bun'], V['bun'] + 6, THUMP_BAND),
          ('drizzle_sweet', 'drizzle (sweet)', d0, d1 + 1, DRIZZLE_BAND)]
    return [dict(probe=p, label=l, f0=a, f1=b, band=bd) for p, l, a, b, bd in W]


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
    m.probes = {}                                               # world sound -> a Mix holding only that sound (audibility check)

    def put(x, f, bus, what=None, gain=1.0, pan=0.0, width=0.0, dt=0.0, probe=None):
        if f + dt * FPS >= F - 1e-6:
            return                                              # no onset at or after the loop point (tails fold in)
        m.add(x, fr(f) + dt, gain=gain, pan=pan, bus=bus, width=width)
        if probe:                                               # the same signal, alone, for the audibility check
            m.probes.setdefault(probe, Mix(DUR, tail=2.0)).add(x, fr(f) + dt, gain=gain, pan=pan, bus=bus, width=width)
        if what:
            cues.append(dict(frame=round(f + dt * FPS, 2), t=round(fr(f) + dt, 4), bus=bus, what=what))

    def note(f, what, bus='note'):
        cues.append(dict(frame=round(f, 2), t=round(fr(f), 4), bus=bus, what=what))

    m.add(room_tone(DUR) * 1.0, 0.0, bus='room')

    # --- f0-29 HOOK (HABBA k3_pour, hot latte, no ice): 808 + a soft milk pour, V1, ticks f0/5/10, mirwas pickup
    # (groove), clap f15 on «حلو». The 808 stays the thumb-stop; its phone-band copy is ducked under «مشـ» (F2) and the
    # whole note steps out of 300-1000 Hz for the «مـ» (C3). The pour starts low (-12 dB, also for the «م») and rises
    # only once V1 has spoken (the swell starts 30 ms before the V1 stem ends, after the «لو» of «حلو»): f0 is carried by
    # the 808 alone, the pour is heard from about f25 into the drain.
    dd, t1, rr = HOOK808_MID_DUCK; cd, c1, cr, clo, chi = HOOK808_BODY_CUT
    put(hit808(A1, 1.2, mid_duck=HOOK808_MID_DUCK, body_cut=HOOK808_BODY_CUT), 0, 'music',
        f'808 A1 55 Hz (+110/165/220 Hz) on frame 0 (the hit); its 250-1600 Hz copy {dd:+.0f} dB over 0-{t1:.2f} s, back by {t1 + rr:.2f} s; '
        f'the whole note {cd:+.0f} dB in {clo}-{chi} Hz over 0-{c1:.2f} s, back by {c1 + cr:.2f} s', G['hook808'])
    sw0 = min(0.90, len(VO['v1']) / SR - POUR_SWELL[0]); sw1, swdb = POUR_SWELL[1], POUR_SWELL[2]
    put(milk_pour(R, 1.0, start_db=-12.0, full_at=0.55, swell=(sw0, sw1, swdb)), 0, 'sfx',
        f'soft milk pour f0-29 (thin stream into the latte, art forming; no ice, no splash): in at -12 dB under «مشـ», full by f16, '
        f'then {swdb:+.0f} dB over f{sw0 * FPS:.1f}-{sw1 * FPS:.1f}, once V1 has spoken, so it is heard into the drain', G['pour'], probe='pour')
    for i in range(3):
        put(wtick(NOTES[i]), 5 * i, 'sfx', f'typing tick {["right", "middle", "left"][i]} dot ({NOTES[i]:.1f} Hz)', G['tick'], TICK_PAN[i])
    put(group_clap(15, 5, 0.22), 15, 'music', 'group clap on the voiced «حلو» (punch-in)', G['hook_clap'])
    put(VO['v1'], 0, 'voice', f'V1 «مشروعك حلو…» from 0.00 s; the «ح» of «حلو» at {VO["info"]["V1"]["placed_hilu_frication_s"]:.3f} s '
        f'({VO["info"]["V1"]["closure_cut_ms"]:.0f} ms cut from the «ك» closure)', G['voice'])

    # --- f30-44 DRAIN: the same sweet (sauce on the cake, or syrup on the kunafa): a soft drizzle, not a crunch;
    # three dots fall; music low-pass closes
    put(drizzle(R, 0.50, soft=0.8, sheen=1.3, tail=0.12), 30, 'sfx', 'soft glossy drizzle f30-44 (the sweet of the drain; no crunch; its 1.8-4.5 kHz sheen carries it as the music closes)', G['drizzle'] * 1.3, probe='drizzle_drain')
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

    # --- f72-89 RETURN: jump whoosh, riser, filter opens, rising landing ticks right to left; the pour is back f78-89
    put(whoosh(0.22, 350, 6000, pan_from=0.0, pan_to=0.1, peak=0.85), 72, 'sfx', 'jump whoosh (dots turn lime and jump)', G['whoosh'])
    p0, p1 = V['pour_return']
    put(milk_pour(R, fr(p1 - p0), start_db=-3.0, full_at=0.12), p0, 'sfx', f'the milk pour again f{p0}-{p1 - 1} (the picture returns to the pour), at the level of the opener\'s end', G['pour'] * 2.3, probe='pour_return')
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
    put(VO['v3'], 90, 'voice', None, G['voice'], dt=-VO['on3'])
    note(90, f'«طشّ!» V3 dry single take, onset on f90 (stem starts {VO["on3"] * 1000:.0f} ms earlier)', 'voice')

    # --- f105-134 portholes, clap f120 (in the groove), mirwas fill into f135
    # they open right to left (mk_film PORTS: x 810 at f105, x 540 at f108, x 270 at f111), so the pops pan right to left
    for k, (f, p, x, w) in enumerate([(105, 0.5, 810, 'perfume'), (108, 0.0, 540, 'coffee pour'), (111, -0.5, 270, 'burger')]):
        put(porthole_pop(520 + 60 * k, 1250 + 150 * k), f, 'hit', f'porthole pop {k + 1} (x {x}, {w})', G['pop'], p)
    note(120, 'clap f120 = groove clap (portholes cut to their next 15 frames)', 'music')
    for k, f in enumerate([127.5, 129.375, 131.25, 133.125]):
        put(mirwas_tak(), f, 'music', 'mirwas fill into f135' if k == 0 else None, G['tak'] * (0.45 + 0.15 * k))

    # --- f135.. the worlds: kick or clap on every entry, one world sound each
    for f, kind, what in V['worlds']:
        if kind == 'kick':
            note(f, f'kick: {what}', 'music')
        elif kind == 'clap':
            note(f, f'group clap: {what}', 'music')
    put(bean_tap(R), V['bean'], 'sfx', f'a coffee bean lands on the wooden table: small crisp wooden tap, then it rocks flat (Coffee A, n102 = f{V["bean"]})', G['bean'], probe='bean')
    put(atomiser(), V['spray'], 'sfx', 'atomiser: short pump click 40 ms after the entry kick (so the kick does not mask it), then a fine '
        'spray hiss (Perfume A, LAYL spray)', G['spray'], dt=0.04, probe='spray')
    if V['bloom']:
        put(mist_bloom(), V['bloom'], 'sfx', 'the mist blooms: a soft wide air swell f180-194 (Perfume B punch-in), gone by the glass tone', G['bloom'], probe='bloom')
    put(glass_tone(), V['glass'], 'sfx', 'soft glass tone Bb6 (the LAYL bottle in the lens)', G['glass'], probe='glass')
    s0, s1 = V['sizzle']
    put(grill(fr(s1 - s0) + 0.15), s0, 'sfx', f'sizzle bed f{s0}-{s1 - 1} (the STAKK patties under the crown; the shaker steps out for it)', G['sizzle'], probe='sizzle')
    put(hit808(A1, 1.0), V['bun'], 'music', '808 A1 on the bun landing (Burger B, exactly on the cut)', G['land808'], probe='thump')
    put(bun_thump(), V['bun'], 'sfx', 'bun thump (Burger B)', G['thump'], probe='thump')
    d0, d1 = V['drizzle']
    put(drizzle(R, fr(d1 - d0), sheen=1.4), d0, 'sfx', f'slow glossy drizzle f{d0}-{d1 - 1} (thick sauce onto the cake, or syrup on the kunafa); its 1.8-4.5 kHz sheen leads, '
        f'the shaker steps out and the riff plays dull under it', G['drizzle'], probe='drizzle_sweet')

    # --- TALK: mirwas + bass only, V2, typing ticks under the dot triplet (period 15 f, 5 f lag, right to left)
    t0, t1 = V['talk'], V['mult'][0]
    put(VO['v2'], t0, 'voice', None, G['voice'], dt=-VO['on2'])
    note(t0, f'«شنو حسابهم؟!» V2 (1.10 s), onset on f{t0} (stem starts {VO["on2"] * 1000:.0f} ms earlier); «حسابهم» at about f{t0 + 10}', 'voice')
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
    put(VO['stack'], h3, 'voice', None, G['voice_stack'], dt=-VO['on3'])
    note(h3, '«طشّ!» V3 stacked x3 (0/+35/+70 ms, 0/+2/-3 st, centre/left/right), first layer onset on the hit', 'voice')

    # --- CTA: soft kick on each band cut, two-note pop on «بالخاص»
    for f, world in V['band']:
        put(soft_kick(), f, 'music', f'soft kick: band cuts to {world}', G['soft_kick'])
    put(bun_thump(), V['band_land'], 'sfx', 'soft crown landing in the CTA burger band (on the beat; final review CC2)', G['thump'] * 0.45)
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
    land_frames = {w for w, kind, _ in V['worlds'] if kind == '808'}     # the bun landing owns its downbeat (no e-piano stab)
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
            if st in SHAKER and s % SHAKER[st][0] == 0 and not any(a <= f < b for a, b in V['beds']):
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
                if fa - 1e-6 <= ff < fb and beat * 4 < nb * 4 and not any(abs(ff - h) < 0.01 for h in hero_frames | land_frames):
                    dd = min([dd] + [fr(lf - ff) for lf in land_frames if ff < lf < ff + dd * FPS])   # the landing chokes it
                    for kk, fq in enumerate(up):
                        put(epiano(fq, dd, v), ff, 'music', None, G['ep'] * lvl, dt=0.008 * kk)
            if st == 'peak' and nb == 4:
                for s, nm in RIFF[chord]:
                    ff = b0 + s * 3.75
                    if fa <= ff < fb:
                        x = pluck(nf(nm), 0.5, bright=0.5)
                        if any(a <= ff < b for a, b in V['beds']):            # under a bed its top (1.4 kHz up) steps aside
                            x = lp(x, 1400, order=4) * 1.3
                        put(x, ff, 'music', None, G['pluck'], 0.25)


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

    sc_fx = sc ** (8.0 / 6.0)                                                  # sound beds: -8 dB under a voice
    fx = {'music': music_fx,
          'sfx': lambda x: low_mono(x * sfx_auto[:, None] * sc_fx[:, None], 150, 0.0),
          'hit': lambda x: low_mono(x * sfx_auto[:, None] * sc[:, None], 150, 0.0)}   # transients pass the 8 ms attack
    for mx in [m] + list(getattr(m, 'probes', {}).values()):                 # every bus chain is linear once the key is set,
        for name, fn in fx.items():                                           # so a probe processed alone is exactly its share
            mx.process_bus(name, fn)                                          # of the processed mix
    return sc


def fold(V, m):
    Nf = n_(fr(V['frames']))
    raw = m.buf.copy()
    for b in m.buses.values():
        raw += b[:len(raw)]
    loop = raw[:Nf].copy(); loop[:len(raw) - Nf] += raw[Nf:]          # the tail rings into the head, as it does on replay
    return loop


def master(V, loop, ceiling=-2.8):
    Nf = len(loop)
    tile = np.vstack([loop, loop, loop])
    tile = hp(tile, 28, order=4)
    tile = compress(tile, thresh_db=-14, ratio=2.0, attack=0.01, release=0.15)
    tile = sat(tile * 1.05, 1.15)
    y = tile[Nf:2 * Nf]
    for _ in range(6):
        yl = limit(np.vstack([y, y, y]), ceiling)[Nf:2 * Nf]
        I, P = ffmpeg_lufs(yl)
        if abs(I + 14.0) < 0.08:
            break
        y = y * db(-14.0 - I)
    return yl


def aac_true_peak(x):
    """True peak after the delivery encode (mux.sh: AAC-LC 320 kb/s 48 kHz); AAC overshoots the WAV by a few tenths."""
    with tempfile.TemporaryDirectory() as d:
        a, b = os.path.join(d, 'a.wav'), os.path.join(d, 'b.m4a')
        wavfile.write(a, SR, x.astype(np.float32))
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', a, '-c:a', 'aac', '-b:a', '320k', '-ar', str(SR), '-ac', '2', b], check=True)
        o = subprocess.run(['ffmpeg', '-nostats', '-i', b, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return float([l for l in o.splitlines() if l.strip().startswith('Peak:')][-1].split()[1])


def true_peak_loop(x, os_=8):
    """True peak (8x oversampled) of a loop, measured across its wrap (the file is played on repeat): the larger of a
    polyphase 8x resample and the ideal band-limited 8x interpolation of the loop (FFT, periodic, so the wrap is exact).
    The short polyphase filter alone under-reads by up to 0.4 dB: the limiter's fast gain steps put energy near 20 kHz."""
    k = 4000
    up = sig.resample_poly(np.vstack([x[-k:], x, x[:k]]), os_, 1, axis=0)[os_ * (k // 2):os_ * (len(x) + k + k // 2)]
    ideal = max(float(np.abs(sig.resample(x[:, c], len(x) * os_)).max()) for c in range(x.shape[1]))
    return float(20 * np.log10(max(float(np.abs(up).max()), ideal) + 1e-12))


def rms_db(x):
    return float(20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-12))


def render(V, VO, room_gain):
    t_ = time.time()
    m, cues = score(V, VO)
    m.buses['room'] *= room_gain
    sc = process(V, m)
    loop = fold(V, m)
    ceiling = WAV_CEILING
    for _ in range(6):                                  # the wav (8x and ffmpeg's meter) and the AAC encode under their ceilings
        y = master(V, loop, ceiling)
        tp, ap = max(true_peak_loop(y), ffmpeg_tp(y)), aac_true_peak(y)
        over = max(tp - WAV_TP_MAX, ap + 2.2)
        if over <= 0:
            break
        ceiling -= over + 0.02
    return dict(y=y, m=m, cues=cues, sc=sc, secs=time.time() - t_, aac_peak=ap, ceiling=ceiling)


def checks(V, VO, r):
    y, m, sc = r['y'], r['m'], r['sc']
    F = V['frames']; Nf = len(y)
    I, P = ffmpeg_lufs(y); TP = true_peak_loop(y); TPff = ffmpeg_tp(y)
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
    # «حلو» (V1 from its «ح» to the stem's end) over the bed in 300-4000 Hz, with and without the opener pour: the pour
    # must not cover the end of V1 (it swells only once V1 has spoken)
    hs, he = VO['info']['V1']['placed_hilu_frication_s'], len(VO['v1']) / SR
    sel = (env_t >= hs) & (env_t < he); thr = env[sel].max() - 25; mk = np.zeros(Nf, bool)
    for tc, e in zip(env_t[sel], env[sel]):
        if e > thr: mk[max(0, n_(tc - 0.0025)):n_(tc + 0.0025)] = True
    hv = band_energy(voice, 300, 4000, mk); pour = sum(m.probes['pour'].buses.values())[:Nf]
    hilu_bed = (10 * np.log10(hv / band_energy(bed, 300, 4000, mk)), 10 * np.log10(hv / band_energy(bed - pour, 300, 4000, mk)))
    # F1: where the «ح» of «حلو» is heard in THIS wav: normalised cross-correlation of the uncut stem's «ح» (160 ms from
    # 10 ms before it, same stretch and chain, VO['hilu_ref']) against the mono mix over 0.30-0.90 s
    seg = VO['hilu_ref']; ym = mono(y); w0, w1 = n_(0.30), n_(0.90)
    win = ym[w0:w1 + len(seg)]
    cc = sig.correlate(win, seg, mode='valid')
    en = np.sqrt(np.maximum(np.convolve(win ** 2, np.ones(len(seg)), mode='valid'), 0)) * np.linalg.norm(seg) + 1e-12
    nc = cc / en; k = int(np.argmax(nc)); hilu = (w0 + k) / SR + 0.010; hilu_ncc = float(nc[k])
    far = np.abs(np.arange(len(nc)) - k) > n_(0.015)
    hilu_uniq = hilu_ncc / max(float(nc[far].max()), 1e-6)            # the peak against the best match more than 15 ms away
    # F2: «مشـ» = the first 150 ms of V1 speech: voice over the bed. Gated in 1-4 kHz (intelligibility), 2-6 kHz (the
    # «ش») and 300-4000 Hz (the whole phone voice band, the «م» included: C3); 300-1000 Hz and 1-2 kHz are printed too
    on1 = onset(mono(voice)[:n_(0.6)], rel=-30.0)
    msk = np.zeros(Nf, bool); msk[n_(on1):n_(on1 + 0.15)] = True
    head = {bnd: 10 * np.log10(band_energy(voice, *bnd, msk) / (band_energy(bed, *bnd, msk) + 1e-12))
            for bnd in ((300, 1000), (1000, 2000), (1000, 4000), (2000, 6000), (300, 4000))}
    # C3: what the 300-1000 Hz cut under «مـ» costs the f0 hit on a phone: the hook 808 alone, 1-4 kHz, 0-100 ms, with and
    # without the cut (the same click noise for both)
    hits = []
    for cut in (HOOK808_BODY_CUT, None):
        seed(V['seed']); x = hit808(A1, 1.2, mid_duck=HOOK808_MID_DUCK, body_cut=cut)
        hits.append(band_energy(np.concatenate([x, np.zeros(SR)]), 1000, 4000, np.arange(len(x) + SR) < n_(0.1)))
    hit_cost = 10 * np.log10(hits[0] / hits[1])
    # the named world sounds: each one heard at its moment (see audibility())
    aud = audibility(V, m)
    # the loop seam: the step from the last sample to the first is no bigger than the steps of the 10 ms leading into it
    # (the tail side: after the wrap the f0 hit starts, whose steps are much larger)
    seam = float(np.abs(y[0] - y[-1]).max()); seam_ref = float(np.abs(np.diff(y[-n_(0.01):], axis=0)).max())
    # 808 harmonics (the hero hit alone)
    h = hit808(A1, 1.4)[:n_(0.6)]; sp = np.abs(np.fft.rfft(h * np.hanning(len(h)))); fq = np.fft.rfftfreq(len(h), 1 / SR)
    lv = lambda f: 20 * np.log10(sp[(fq > f - 4) & (fq < f + 4)].max())
    harm = [round(lv(f) - lv(55), 1) for f in (110, 165, 220)]
    ok = {
        'loudness -14 +/- 0.5 LUFS': abs(I + 14) <= 0.5,
        f'true peak <= {WAV_TP_MAX} dBTP in the wav (8x oversampled across the loop wrap, and ffmpeg\'s meter)': max(TP, TPff) <= WAV_TP_MAX,
        'true peak <= -2 dBTP after AAC 320k (mux.sh)': r['aac_peak'] <= -2.0,
        'energy 500 Hz-6 kHz >= 25 %': mid >= 0.25,
        'energy < 150 Hz <= 50 %': lo <= 0.50,
        'voices >= +6 dB over the bed (300-4000 Hz)': all(r_[1] >= 6.0 for r_ in rows),
        'music side-chain -6 dB under each voice': all(abs(r_[2] - MUSIC_SC_DB) < 0.3 for r_ in rows),
        f'the opener pour costs «حلو» (V1 from its «ح» to its end) {HILU_POUR_MAX:.2f} dB or less in 300-4000 Hz': hilu_bed[1] - hilu_bed[0] <= HILU_POUR_MAX,
        'F1: the «ح» of «حلو» within one frame of 0.500 s (cross-correlation on the wav, peak >= 2x any other)': abs(hilu - HILU_AT) <= 1 / FPS and hilu_uniq >= 2.0,
        'F2: «مشـ» (first 150 ms of V1) >= +6 dB over the bed in 1-4 kHz, 2-6 kHz and 300-4000 Hz': min(head[(1000, 4000)], head[(2000, 6000)], head[(300, 4000)]) >= 6.0,
        'C3: the 300-1000 Hz cut under «مـ» softens the f0 hit by 2 dB or less in 1-4 kHz (0-100 ms)': hit_cost >= -2.0,
        **{f'heard: {w["label"]} f{w["f0"]}-{w["f1"]}, >= +{AUD_GATE:.0f} dB over everything else in {w["band"][0]}-{w["band"][1]} Hz '
           f'in a {AUD_WIN * 1000:.0f} ms window': w['passed'] for w in aud},
        'loop seam: the last->first sample step <= the largest step in the 10 ms before it': seam <= seam_ref,
        'dead-beat room tone -40 dBFS +/- 1.5': abs(room - ROOM_TARGET) <= 1.5,
        f'length {F} frames = {Nf} samples': Nf == F * SR // FPS,
    }
    return dict(I=I, P=P, TP=TP, TPff=TPff, lo=lo, mid=mid, room=room, pocket=pocket, voices=rows, harm=harm, ok=ok, hilu_bed=hilu_bed,
                hilu=hilu, hilu_ncc=hilu_ncc, hilu_uniq=hilu_uniq, v1_onset=on1, head=head, hit_cost=hit_cost, aud=aud,
                seam=seam, seam_ref=seam_ref, first=float(np.abs(y[:48]).max()))


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
    print(f'V1 «حلو»: raw «ك» closure {i1["measured_closure_s"]:.3f} s, the «ح» frication at {i1["measured_hilu_frication_s"]:.3f} s '
          f'({i1["raw_closure_ms"]:.0f} ms closure); cut {i1["closure_cut_ms"]:.1f} ms out of the closure (kept {i1["closure_kept_ms"]:.1f} ms, '
          f'splice match {i1["splice_match"]:.2f}); stretched {i1["stretch_percent"]:.1f} % (rubberband tempo {i1["rubberband_tempo"]}) '
          f'+ head trim {i1["head_trim_ms"]:.1f} ms (limit {i1["head_trim_limit_ms"]:.1f}) -> closure {i1["placed_closure_s"]:.3f} s, '
          f'the «ح» at {i1["placed_hilu_frication_s"]:.3f} s, stem now {i1["placed_seconds"]:.3f} s')
    print(f'V2 onset {VO["on2"] * 1000:.1f} ms, V3 onset {VO["on3"] * 1000:.1f} ms (placed so the onset sits on the frame); '
          f'stack alignment {VO["info"]["V3_stack"]["align_ms"]} ms')
    sheet = dict(spec='v4/BUILD-SPEC.md §10, §7, §11 A-14, §15 R3-1..R3-24 (R3 wins; no version B); world sounds re-mapped to '
                      'v4/swap/director-plan.json (HABBA pour + bean, LAYL spray + bottle, STAKK crown, sweet drizzle)', fps=FPS, bpm=BPM,
                 beat_frames=15, sample_rate=SR, script='v4/build/audio_v4.py', voices=VO['info'])
    failed = False
    for V in (A20, A14):
        r = calibrate_and_render(V, VO)
        path = os.path.join(OUT, f'{V["name"]}.wav')
        wavfile.write(path, SR, r['y'].astype(np.float32))
        c = checks(V, VO, r)
        print(f'\n{V["name"]}: wrote {path} ({len(r["y"])} samples = {len(r["y"]) / SR:.3f} s, {V["frames"]} frames, '
              f'48 kHz stereo float; render {r["secs"]:.0f} s)')
        print(f'  integrated loudness {c["I"]:.1f} LUFS (ffmpeg ebur128) · true peak {c["TP"]:.2f} dBTP at 8x (ffmpeg {c["TPff"]:.2f}; limiter ceiling '
              f'{r["ceiling"]:.2f}) · after AAC 320k {r["aac_peak"]:.1f} dBTP')
        print(f'  energy share: below 150 Hz {100 * c["lo"]:.1f} % · 500 Hz-6 kHz {100 * c["mid"]:.1f} %')
        for name, ratio, scd, secs in c['voices']:
            print(f'  {name}: voice over music+sfx in 300-4000 Hz {ratio:+.1f} dB over {secs:.2f} s; music side-chain {scd:.1f} dB')
        print(f'  «حلو» (V1 from its «ح» to its end) over the bed in 300-4000 Hz: {c["hilu_bed"][0]:+.1f} dB '
              f'({c["hilu_bed"][1]:+.1f} dB without the opener pour)')
        print(f'  F1: the «ح» of «حلو» heard at {c["hilu"]:.4f} s = f{c["hilu"] * FPS:.2f} ({(c["hilu"] - HILU_AT) * 1000:+.1f} ms from '
              f'{HILU_AT:.3f} s; cross-correlation peak {c["hilu_ncc"]:.2f}, {c["hilu_uniq"]:.1f}x the next best)')
        print(f'  F2: «مشـ» (V1 speech from {c["v1_onset"] * 1000:.0f} ms, first 150 ms): voice over the bed '
              f'{c["head"][(1000, 4000)]:+.1f} dB in 1-4 kHz, {c["head"][(2000, 6000)]:+.1f} dB in 2-6 kHz, {c["head"][(300, 4000)]:+.1f} dB in 300-4000 Hz '
              f'(300-1000 Hz {c["head"][(300, 1000)]:+.1f} dB, 1-2 kHz {c["head"][(1000, 2000)]:+.1f} dB)')
        dc, c1, cr, clo, chi = HOOK808_BODY_CUT
        print(f'  C3: hook 808 cut {dc:+.0f} dB in {clo}-{chi} Hz over 0-{c1:.2f} s (back by {c1 + cr:.2f} s): the f0 hit alone in 1-4 kHz '
              f'(0-100 ms) changes by {c["hit_cost"]:+.1f} dB')
        print(f'  world sounds (own vs everything else, pre-master, mono, own band; best {AUD_WIN * 1000:.0f} ms window inside the moment):')
        for w in c['aud']:
            print(f'    {w["label"]:27s} f{w["f0"]}-{w["f1"]:<4} {w["band"][0]:>4}-{w["band"][1]:<4} Hz: best {w["best_db"]:+5.1f} dB at '
                  f'f{w["best_at"] * FPS:5.1f}; whole moment {w["whole_db"]:+5.1f} dB; lifts its band {w["rise_db"]:+4.1f} dB; '
                  f'{100 * w["band_share"]:3.0f} % of the sound in that band')
        print(f'  808 harmonics vs 55 Hz: 110 Hz {c["harm"][0]:+.1f} dB, 165 Hz {c["harm"][1]:+.1f} dB, 220 Hz {c["harm"][2]:+.1f} dB')
        print(f'  dead-beat room tone f{V["room_window"][0]}-{V["room_window"][1]} {c["room"]:.1f} dBFS RMS · silence pocket '
              f'f{V["pocket"][0]}-{V["pocket"][1] - 1} {c["pocket"]:.1f} dBFS · first sample {c["first"]:.3f} · seam jump f{V["frames"] - 1}->f0 {c["seam"]:.4f} '
              f'(largest step in the 10 ms before it {c["seam_ref"]:.4f})')
        for k, v in c['ok'].items():
            print(f'  [{"PASS" if v else "FAIL"}] {k}')
            failed |= not v
        cues = sorted(r['cues'], key=lambda q: (q['frame'], q['bus']))
        sheet[V['name']] = dict(file=f'audio/{V["name"]}.wav', frames=V['frames'], seconds=fr(V['frames']), samples=len(r['y']),
                                checks=dict(lufs=round(c['I'], 2), true_peak_dbtp=round(c['TP'], 2), true_peak_ffmpeg_dbtp=round(c['TPff'], 2), aac320_true_peak_dbtp=round(r['aac_peak'], 2),
                                            share_below_150=round(c['lo'], 4), share_500_6k=round(c['mid'], 4),
                                            room_tone_dbfs=round(c['room'], 2),
                                            voice_over_bed_db={n: round(v, 1) for n, v, _, _ in c['voices']},
                                            hilu_over_bed_db=dict(with_pour=round(c['hilu_bed'][0], 1), without_pour=round(c['hilu_bed'][1], 1)),
                                            f1_hilu_s=round(c['hilu'], 4), f1_hilu_xcorr_peak=round(c['hilu_ncc'], 3), f1_hilu_peak_vs_next=round(c['hilu_uniq'], 2),
                                            f2_mush_first150ms_voice_over_bed_db={f'{a}-{b}': round(v, 1) for (a, b), v in c['head'].items()},
                                            c3_f0_hit_1_4k_change_db=round(c['hit_cost'], 2),
                                            world_sounds_heard={w['label']: dict(frames=f'{w["f0"]}-{w["f1"]}', band_hz=f'{w["band"][0]}-{w["band"][1]}',
                                                                                 best_window_db=round(w['best_db'], 1), best_window_frame=round(w['best_at'] * FPS, 1),
                                                                                 whole_moment_db=round(w['whole_db'], 1), band_lift_db=round(w['rise_db'], 1),
                                                                                 share_in_band=round(w['band_share'], 2), passed=w['passed'])
                                                                for w in c['aud']},
                                            seam_jump=round(c['seam'], 5), seam_ref=round(c['seam_ref'], 5), passed=all(c['ok'].values())),
                                cues=cues)
    with open(os.path.join(OUT, 'cues.json'), 'w') as f:
        json.dump(sheet, f, ensure_ascii=False, indent=1)
    print(f'\nwrote {os.path.join(OUT, "cues.json")} ({len(sheet["A20"]["cues"])} A-20 cues, {len(sheet["A14"]["cues"])} A-14 cues)')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
