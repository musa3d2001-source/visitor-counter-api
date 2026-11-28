"""«طشّ للطلاب» (TASH for students, 9:16, 891 frames = 29.70 s): original score, sound design and the two mixes.
FIX ROUND (26 Nov): one beat is inserted after the payoff chord (cues.json music_insert: the music's logical beat k >= 48
sounds at film beat k + 1), so the closing line holds ~1 s; the VO mix carves 1.5-5 kHz out of the music by a further
-5 dB while the voice speaks and ducks the SFX -6 dB (was -3); the wink pluck sits in the gap BEFORE «بس»; the sonic
logo's ticks and the tail lift start after the last word (vo_last_end). Frame numbers in the notes below are the first
build's; every time is read from cues.json.
Everything is synthesised here or by the TASH engine (_system/audio/tashaudio.py): no samples, no library music, no
paid tools. Every time comes from src/cues.json (sfx[], the beat grid, key frames, text lands) and
src/vo/vo_timeline.json (phrases, words). Nothing is typed in by hand except the musical choices.

THE SCORE: 125 BPM (beat k at 1.401 + 0.48·k s = the cue grid; k % 4 == 0 is a bar line), F major. UK-garage 2-step
(kick on 1 and the "and" of 3, claps on 2 and 4, 16th hats swung 60 % = offbeat 16ths 24 ms late, open hats on the
offbeat 8ths) with Jersey-club kick rolls into the turns. The hook is 2 bars: an octave-bouncing bass and a bright
synth pluck over IV–V–iii–vi (Bbmaj9 · C6/9 · Am7 · Dm9, the "royal road": bright and young, not dark, never resolving
home), skippy organ stabs on 16ths 3/6/11/14. The tonic (F) is held back for the payoff chord and the sonic logo.
  0.00–7.16  hook + screen, no groove: night room, laptop fan, a low D/A/Bb tension drone that slowly opens; soft
             hesitant key taps; three dry punch-in hits (tick + sub tap D→F→A); the dive whoosh cut dead on the white
             (f78); screen blip, chat pop + phone buzz, the deadline ding (beat 3); clock tick-tock on every beat with a
             muffled heartbeat kick; the TASH bubble pop + its typing-dot ticks; soft typing on every typed word; the
             hook teased through a low-pass from bar 2 (k 8); the riser cut dead on the hit.
  7.16       SPLASH (f215, bar line): water splash + droplets + the TASH clap hit + a sub drop to Bb1; the groove drops.
  8.60–17.2  the parade: one percussive hit per card on its frame (pitch rising card to card), short whooshes into
             each card, the fan (six paper flicks), page flips, a shutter, the chart's rising pluck, five rising
             mouse-click pops on the file chips, a held Am7 on the full fan; Jersey rolls in bars 16 and 28.
  17.2–22.8  details: the groove filtered (muffled), no hats, a soft shaker; the guides snap (click + tiny bell + two
             settle ticks);
             the breath before the rule line has no drums; the beat comes back on the rule line; the swipe whoosh
             (bar line f618) opens the filter for «والترتيب والتصميم علينا.»; nothing busy under the voice.
  22.8–25.4  lecture hall: the groove cuts with the picture; room air + a low C9sus swell → the WIDE CHORD on f719
             (Fmaj9, the first tonic of the film: supersaw + e-piano + bells + sub), a small synthesised room
             applause swells under it, the beat builds back with a Jersey roll into the end card.
  25.4–29.23 end card: clean hit, the full groove and hook (energy) under the CTA; a wink pluck on «بس مو آخر ليلة.»;
             a kick roll into the TASH sonic logo (engine ingredients re-timed to the cues: three typing ticks on f834,
             whoosh, the طشّ hit on f848 over a Csus → Fmaj9 cadence, the shadda pop, the dots' answer ticks), alone,
             on a held warm pad to the last frame (energy held; 60 ms fade on the very last frame only).

MIXES (48 kHz stereo PCM 24-bit, exactly 877 frames = 1 403 200 samples):
  src/audio_novo.wav    music + SFX
  src/audio_vo.wav      the same + the VO (src/vo/vo_edit.wav, already on the film timeline): HPF 70 Hz, −2.5 dB at
                        260 Hz, +2.5 dB at 3.2 kHz, +1.5 dB shelf at 9 kHz; split-band de-esser 5–10 kHz (relative to
                        each phrase, 4:1, ≤ 8 dB); every phrase levelled to the same loudness; 2.5:1 compression; a
                        final per-phrase trim. Music + beds ducked −7 dB under speech by a look-ahead side-chain from the
                        VO envelope (50 ms look-ahead, 40 ms attack, gaps < 350 ms bridged, 300 ms release; let go
                        150 ms after the last word); foley −3 dB, card hits −2 dB; the splash and the sonic logo are never ducked.
                        A VO-only true-peak limiter (−8.5 dBFS at −20 LUFS phrases) keeps consonants off the master.
                        From the sonic logo's first tick the bed and the logo come up 3.5 dB (the VO mix's tail would
                        otherwise sit ~8 dB under the music-only mix: its loudness is set by the voice).
  src/audio/mix_novo.wav, src/audio/mix_vo.wav   byte-identical copies, the names build.sh muxes.
  For phone speakers: the groove's bottom shelved −3 dB at 110 Hz, the bass carries saturated harmonics above 220 Hz,
  the drum bus is soft-clipped (kick transients stay off the master limiter); mono fold-down loses < 0.1 LU.
  Both: −14.0 LUFS integrated, true peak ≤ −1.7 dBTP (4× oversampled look-ahead limiter with zero latency, so nothing
  moves off its frame), so tools/mux.py's linear loudnorm (TP −1.5) never falls back to dynamic mode.

Run (from anywhere):  python3 12-students-ad/src/audio.py [--stems DIR]   (--stems also writes the pre-master stems
music / sfx / hits / logo / vo and events.json, the list of every cue placement, for the sync check)."""
import sys, os, json, math, argparse
import numpy as np
from scipy import signal
from scipy.ndimage import uniform_filter1d, maximum_filter1d, minimum_filter1d
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
TASH = os.path.normpath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(TASH, '_system', 'audio'))
import tashaudio as ta  # noqa: E402
from tashaudio import (SR, n_, tt, db, mono, stereo, noise, phase_osc, env_exp, env_adsr, fade, lp, hp, bp,  # noqa: E402
                       peak_eq, sat, reverb, compress, duck_curve, lufs, true_peak_db, Mix, nf, kick, clap, snare,
                       hat, shaker, rim, pad, bell, tick, pop, whoosh, riser, impact, tash_hit, membrane, shutter)

C = json.load(open(os.path.join(HERE, 'cues.json')))
V = json.load(open(os.path.join(HERE, 'vo', 'vo_timeline.json')))
FPS = C['fps']; NFR = C['duration_frames']
NS = NFR * SR // FPS                      # 1 403 200 samples = 29.2333 s, the film to the sample
DUR = NS / SR
BEAT = 60.0 / C['bpm']; PHASE = C['phase']; S16 = BEAT / 4
SWING = 0.024                             # offbeat 16ths late by 24 ms (60 % swing)
SFX = {e['name']: e for e in C['sfx']}
TXT = {e['id']: e for e in C['text']}
KEY = C['key']
VO_WAV = os.path.join(HERE, 'vo', 'vo_edit.wav')
OUT = {'novo': [os.path.join(HERE, 'audio_novo.wav'), os.path.join(HERE, 'audio', 'mix_novo.wav')],
       'vo': [os.path.join(HERE, 'audio_vo.wav'), os.path.join(HERE, 'audio', 'mix_vo.wav')]}


INS = C.get('music_insert', {'from_logical_beat': 1e9, 'beats': 0})
def _ins(k): return INS['beats'] * BEAT if k >= INS['from_logical_beat'] - 1e-9 else 0.0   # the inserted beat after the chord
def kt(k): return PHASE + k * BEAT + _ins(k)                             # LOGICAL music beat k → film s
def ft(f): return f / FPS                                                # frame → s
def i16(i, swing=True): return PHASE + i * S16 + (SWING if swing and i % 2 else 0.0) + _ins(i / 4)   # 16th i (= 4k + step) → s
def cue(name): return ft(SFX[name]['frame'])


EVENTS = []                                # every cue placement: what the sync check compares against the cue frames
def mark(name, t, kind='onset', note=''):
    EVENTS.append({'name': name, 't': round(float(t), 4), 'frame': round(float(t) * FPS, 2), 'kind': kind, 'note': note})


# ============================================================================== voices (music)
def kick_g():
    return lp(kick(f0=172, f1=52, d=0.32, punch=1.1, click=0.5), 9000)


def kick_soft():
    return lp(kick(f0=118, f1=46, d=0.42, punch=0.5, click=0.1), 320)


def clap_g():
    c = clap(0.3, (950, 4300), spread=0.009, bursts=4); s = snare(0.2, tone=215) * 0.35
    y = np.zeros(max(len(c), len(s))); y[:len(c)] += c; y[:len(s)] += s
    return fade(y * 0.8, 0.0005, 0.03)


def ohat():
    return fade(hat(open_=True)[:n_(0.2)], 0.0003, 0.06)


def crash(d=1.3):
    t = tt(d)
    x = sum(phase_osc(410 * r, d, 'tri') for r in (1, 1.483, 1.932, 2.546, 3.12)) / 5
    x = hp(x, 3000) * env_exp(d, 0.3, 0.001) * 0.5
    x += hp(noise(d), 5000) * env_exp(d, 0.42, 0.001) + bp(noise(d), 2500, 9000) * env_exp(d, 0.05) * 0.6
    return stereo(fade(x * 0.3, 0.0005, 0.25), 0, width=0.9)


def bass_g(f, d, vel=1.0):
    """garage bass: a sine sub + a saw whose low-pass closes fast (2.2 kHz → 380 Hz), driven a little"""
    t = tt(d)
    sub = phase_osc(f, d); saw = phase_osc(f, d, 'saw')
    ef = np.exp(-t / 0.06)
    mid = ef * lp(saw, 2200) + (1 - ef) * lp(saw, 380)
    amp = env_adsr(d, 0.003, 0.1, 0.8, min(0.05, d * 0.35))
    return fade(sat((sub * 0.6 + mid * 0.68) * amp * vel, 1.8) * 0.55, 0.002, 0.015)


def pluck_syn(f, d=0.45, vel=1.0):
    """the hook pluck: two detuned saws through a snapping low-pass + a marimba-ish sine body (bright, bouncy)"""
    t = tt(d)
    osc = 0.5 * (phase_osc(f * 1.004, d, 'saw') + phase_osc(f * 0.996, d, 'saw'))
    ef = np.exp(-t / 0.05)
    y = ef * lp(osc, 6500) + (1 - ef) * lp(osc, 1500)
    body = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.22) * 0.7 + np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.05) * 0.25
    out = y * env_exp(d, 0.14, 0.0015) * 0.55 + body * 0.5
    return fade(hp(out, 180) * vel, 0.0005, 0.04)


def stab(f, d=0.2, vel=1.0):
    """percussive organ stab (drawbar partials + key click), the UKG skip"""
    t = tt(d)
    y = sum(a * np.sin(2 * np.pi * f * r * t) for r, a in ((1, 1), (2, .55), (3, .3), (4, .2), (6, .08)))
    y = y + bp(noise(d), 1500, 6000) * np.exp(-t / 0.002) * 0.15
    return fade(lp(y * env_adsr(d, 0.002, 0.05, 0.5, 0.05), 4500) * vel * 0.25, 0.0005, 0.02)


def epiano(f, d=2.4, vel=0.8, bright=0.5, pan=0.0):
    """soft Rhodes-like e-piano (from the DOSE score): 1:1 FM bark into a sine, short tine, slow tremolo"""
    t = tt(d)
    idx = (0.55 * bright + 0.5 * vel) * np.exp(-t / 0.26) + 0.12
    car = np.sin(2 * np.pi * f * t + np.sin(2 * np.pi * f * t) * idx)
    tine = np.sin(2 * np.pi * f * 6.98 * t) * np.exp(-t / 0.035) * 0.10 * vel
    body = np.sin(2 * np.pi * f * 2 * t) * np.exp(-t / 0.5) * 0.12
    y = hp(lp((car + tine + body) * env_exp(d, 1.4 + 160 / f, 0.004) * vel, 2600 + 1800 * bright), 120)
    trem = 0.09 * np.sin(2 * np.pi * 3.3 * t)
    st = np.stack([y * (1 + trem), y * (1 - trem)], axis=1) * 0.5
    if pan: st = stereo(mono(st), pan)
    return fade(st, 0.002, 0.25)


def supersaw(notes, d, voices=5, detune=0.14, lp_from=600, lp_to=3600, open_t=0.35, attack=0.015, release=0.5, seed_=3):
    """wide detuned-saw chord whose low-pass opens over open_t (the payoff's warmth)"""
    r = np.random.default_rng(seed_); N = n_(d); L = np.zeros(N); Rt = np.zeros(N)
    for f in notes:
        for v in range(voices):
            u = v / (voices - 1) * 2 - 1
            off = int(r.uniform(0, SR / f))
            s = phase_osc(f * 2 ** (u * detune / 12), (N + off + 2) / SR, 'saw')[off:off + N]
            pn = u * 0.85
            L += s * math.cos((pn + 1) * math.pi / 4); Rt += s * math.sin((pn + 1) * math.pi / 4)
    st = np.stack([L, Rt], axis=1) / (len(notes) * voices) * 2.0
    k = np.clip(tt(d) / open_t, 0, 1)[:, None]; k = k * k * (3 - 2 * k)
    y = lp(st, lp_from) * (1 - k) + lp(st, lp_to) * k
    return fade(y * env_adsr(d, attack, 0.4, 0.75, release)[:, None], 0.002, 0.05)


def pingpong(x, dt, fb=0.32, mix=0.2, tone=4200, taps=6):
    xs = stereo(x); N = len(xs); d = n_(dt); out = xs.copy(); tap = lp(mono(xs), tone) * mix
    for i in range(1, taps + 1):
        s = i * d
        if s >= N: break
        out[s:, i % 2] += tap[:N - s] * fb ** (i - 1)
        tap = lp(tap, tone)
    return out


# harmony: rootless voicings, smooth voice leading (top voice D C C E D); 2-beat cells
CH = {'Bb': ['F4', 'A4', 'C5', 'D5'], 'C': ['E4', 'G4', 'A4', 'D5'], 'Am': ['E4', 'G4', 'A4', 'C5'],
      'Dm': ['F4', 'A4', 'C5', 'E5'], 'Csus': ['F4', 'G4', 'C5', 'D5'], 'F': ['A3', 'C4', 'E4', 'G4']}
LOOP = ['Bb', 'C', 'Am', 'Dm']
# the 2-bar hook, as one cell per chord: (16th within the cell, note, length in 16ths)
MEL = {'Bb': [(0, 'D6', 2), (3, 'C6', 1), (4, 'A5', 2), (7, 'F5', 1)],
       'C': [(2, 'G5', 1), (3, 'A5', 1), (4, 'C6', 2), (6, 'D6', 2)],
       'Am': [(0, 'E6', 2), (3, 'D6', 1), (4, 'C6', 2), (7, 'A5', 1)],
       'Dm': [(2, 'F5', 1), (3, 'G5', 1), (4, 'A5', 3), (7, 'C6', 1)]}
BAS = {'Bb': [(0, 'Bb1', 2), (3, 'Bb2', 1), (6, 'Bb1', 1)], 'C': [(0, 'C2', 2), (3, 'C3', 1), (6, 'C2', 1)],
       'Am': [(0, 'A1', 2), (3, 'A2', 1), (6, 'A1', 1)], 'Dm': [(0, 'D2', 2), (3, 'D3', 1), (6, 'F2', 1)]}


# ============================================================================== voices (sound design)
def keytap(r, vel=1.0):
    """a laptop key: top click, a small plastic body, the bottom-out click 9-16 ms later"""
    d = 0.07; t = tt(d)
    c1 = bp(noise(d), 2200, 9000) * np.exp(-t / 0.0012)
    body = np.sin(2 * np.pi * r.uniform(260, 420) * t) * np.exp(-t / 0.01) * 0.4
    c2 = np.zeros_like(t); b2 = bp(noise(0.01), 1200, 6000) * np.exp(-tt(0.01) / 0.0018) * 0.6
    o = int(r.uniform(0.009, 0.016) * SR); c2[o:o + len(b2)] = b2[:len(c2) - o]
    return fade(hp(c1 * 0.7 + body + c2, 150) * vel * 0.5, 0.0002, 0.01)


def hook_hit(f_sub, vel=1.0):
    """the hook's punch-in: a dry woody tick + a sub tap (pitched)"""
    d = 0.5; t = tt(d)
    tk = bp(noise(d), 2500, 9000) * np.exp(-t / 0.0025) * 1.25
    ping = phase_osc(1900 * (1 + 0.25 * np.exp(-t / 0.003)), d, 'tri') * np.exp(-t / 0.018) * 0.5
    thock = lp(noise(d, 'brown'), 400) * np.exp(-t / 0.03) * 0.4
    sb = phase_osc(f_sub * (1 + np.exp(-t / 0.012)), d) * env_exp(d, 0.11, 0.001) * 0.9
    sb2 = phase_osc(2 * f_sub * (1 + np.exp(-t / 0.012)), d) * env_exp(d, 0.06, 0.001) * 0.3
    return fade(sat((tk + ping + thock + sb + sb2) * vel, 1.3), 0.0003, 0.05)


def dive_whoosh(d):
    """the push into the laptop screen: a rising band sweep + a rising tone, cut dead at the end (3 ms)"""
    y = ta.svf_sweep(noise(d, 'pink'), 250, 9000, q=2.2) * 1.4
    f = np.geomspace(180, 1400, n_(d))
    y = y + phase_osc(f, d) * 0.12 + phase_osc(f * 1.5, d) * 0.05
    y = y * np.linspace(0, 1, n_(d)) ** 2.4
    return fade(stereo(y, 0, width=0.6), 0.01, 0.003)


def blip():
    d = 0.18; t = tt(d)
    f = 1320 + 440 * (1 - np.exp(-t / 0.01))
    y = phase_osc(f, d) * env_exp(d, 0.045, 0.001) * 0.6 + phase_osc(f * 2, d) * env_exp(d, 0.015, 0.001) * 0.15
    y = y + lp(noise(d, 'pink'), 1200) * env_exp(d, 0.05, 0.002) * 0.25
    return fade(y, 0.0005, 0.03)


def buzz(pulses=((0.0, 0.16), (0.24, 0.16))):
    """the phone vibrating on the desk: a 165 Hz motor + the desk's rattle, two pulses"""
    out = np.zeros(n_(pulses[-1][0] + pulses[-1][1] + 0.05))
    for t0, dd in pulses:
        t = tt(dd); f = 165 * (1 + 0.02 * np.sin(2 * np.pi * 9 * t))
        motor = phase_osc(f, dd, 'saw') * 0.5 + phase_osc(f, dd) * 0.5
        rattle = bp(noise(dd), 400, 2500) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)))
        e = np.minimum(1, t / 0.012) * np.minimum(1, (dd - t) / 0.03)
        y = lp(motor * 0.6 + rattle * 0.35, 2800) * e
        out[n_(t0):n_(t0) + len(y)] += y
    return fade(out * 0.6, 0.002, 0.02)


def ding():
    """the deadline reminder: a two-tone chime, E6 then C6 (a 'ding-dong' going down)"""
    out = np.zeros(n_(1.4))
    for t0, f, a in ((0.0, nf('E6'), 1.0), (0.11, nf('C6'), 0.85)):
        d = 0.5; t = tt(d)                    # (fix round 2) τ 0.35 → 0.18, body 1.2 → 0.5 s: done before the voice
        y = (np.sin(2 * np.pi * f * t) * np.exp(-t / 0.18) + 0.35 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.12)
             + 0.12 * np.sin(2 * np.pi * 3.01 * f * t) * np.exp(-t / 0.05)) * np.minimum(1, t / 0.0015) * a
        out[n_(t0):n_(t0) + len(y)] += fade(y, 0.0005, 0.2)
    return fade(out * 0.35, 0.0005, 0.1)


def clock_tick(tock=False):
    d = 0.08; t = tt(d); f = 2300 if tock else 3300
    y = (bp(noise(d), 2500, 9000) * np.exp(-t / 0.0007) * 0.8 + np.sin(2 * np.pi * f * t) * np.exp(-t / 0.005) * 0.35
         + np.sin(2 * np.pi * f * 0.37 * t) * np.exp(-t / 0.009) * 0.25)
    return fade(y * 0.6, 0.0002, 0.02)


def paper_flip(r, d=0.16):
    """a page/slide flick: band noise with a flutter, landing with a small slap"""
    t = tt(d)
    y = bp(noise(d), r.uniform(700, 1100), r.uniform(5000, 8000))
    fl = 0.55 + 0.45 * np.sin(2 * np.pi * r.uniform(35, 60) * t + r.uniform(0, 6))
    e = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.5
    sl = bp(noise(d), 2500, 9000) * np.exp(-np.maximum(t - d * 0.8, 0) / 0.003) * (t >= d * 0.8) * 0.8
    return fade((y * fl * e + sl) * 0.5, 0.002, 0.01)


def card_hit(f0=150, vel=1.0):
    """one percussive hit per card: a tight tom + a short kick + a paper-ish slap"""
    tom = membrane(f0, 0.45, 0.11, pitch_drop=0.3, strike=0.7)
    k = kick(f0=150, f1=55, d=0.28, punch=0.9, click=0.35)
    sl = bp(noise(0.08), 1200, 7000) * env_exp(0.08, 0.01) * 0.6
    y = np.zeros(max(len(tom), len(k))); y[:len(tom)] += tom * 0.9; y[:len(k)] += k * 0.35; y[:len(sl)] += sl
    return fade(sat(y * vel, 1.4), 0.0003, 0.05)


def click_pop(f, vel=1.0):
    """a mouse click with a pitched pop (the file chips)"""
    d = 0.12; t = tt(d)
    clk = bp(noise(d), 3000, 10000) * np.exp(-t / 0.0008) * 0.9 + np.sin(2 * np.pi * 2700 * t) * np.exp(-t / 0.003) * 0.25
    p = phase_osc(f * (0.75 + 0.25 * (1 - np.exp(-t / 0.01))), d) * env_exp(d, 0.035, 0.001) * 0.5
    return fade((clk + p) * vel, 0.0002, 0.02)


def snapper():
    """a crisp finger snap (the lock-up)"""
    d = 0.16; t = tt(d)
    nz = bp(noise(d), 1800, 7000) * np.exp(-t / 0.018)
    return fade((nz + np.sin(2 * np.pi * 1350 * t) * np.exp(-t / 0.01) * 0.3) * 0.7, 0.0002, 0.02)


def water_splash(d=1.4, seed_=31):
    """the «طشّ» water: a broadband body, a granular spray tail, a low sploosh and ~40 rising-pitch droplets"""
    r = np.random.default_rng(seed_); N = n_(d); t = tt(d); att = np.minimum(1, t / 0.004)
    body = [bp(r.standard_normal(N), 300, 6000) for _ in range(2)]
    spray = [hp(r.standard_normal(N), 3500) for _ in range(2)]
    g = lp(np.abs(r.standard_normal(N)) ** 3, 80); g /= np.abs(g).max()
    benv = att * np.exp(-t / 0.13); senv = att * np.exp(-t / 0.38) * (0.4 + 0.6 * g)
    low = lp(r.standard_normal(N), 220); low /= np.abs(low).max(); lenv = att * np.exp(-t / 0.09)
    out = np.stack([body[c] * benv * 0.7 + spray[c] * senv * 0.35 + low * lenv * 0.8 for c in (0, 1)], axis=1)
    for _ in range(46):
        t0 = 0.02 + r.exponential(0.22)
        if t0 > d - 0.1: continue
        f0 = r.uniform(650, 2800); dd = 0.05; td = tt(dd)
        f = f0 * (1 + 0.6 * (1 - np.exp(-td / 0.01)))
        y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-td / 0.012) * r.uniform(0.2, 0.7) * math.exp(-t0 / 0.45)
        pn = r.uniform(-0.9, 0.9); i0 = n_(t0)
        out[i0:i0 + len(y), 0] += y * 0.6 * math.cos((pn + 1) * math.pi / 4)
        out[i0:i0 + len(y), 1] += y * 0.6 * math.sin((pn + 1) * math.pi / 4)
    return fade(out, 0.0005, 0.15)


def sub_drop(d=1.1, f0=120.0, f1=None):
    f1 = f1 or nf('Bb1'); t = tt(d); f = f1 + (f0 - f1) * np.exp(-t / 0.12)
    return fade(sat(phase_osc(f, d) * env_exp(d, 0.45, 0.002) * 1.3, 1.4), 0.0005, 0.1)


def room_bed(d):
    """the night room: a low rumble + faint air (decorrelated L/R)"""
    st = np.stack([hp(lp(noise(d, 'brown'), 300), 35) * 0.5 + lp(noise(d, 'pink'), 6000) * 0.012 for _ in range(2)], axis=1)
    return fade(st, 0.005, 0.003)


def fan(d):
    """the laptop fan: soft band noise breathing at 0.3 Hz, a faint 118 Hz hum and whine"""
    t = tt(d)
    y = bp(noise(d, 'pink'), 250, 2500) * 0.25 * (0.85 + 0.15 * np.sin(2 * np.pi * 0.3 * t))
    y += (np.sin(2 * np.pi * 118 * t) * 0.05 + np.sin(2 * np.pi * 236 * t) * 0.02 + np.sin(2 * np.pi * 1890 * t) * 0.004)
    return fade(stereo(y, 0.15, width=0.5), 0.005, 0.003)


def tension(d):
    """low tension drone D/A/Bb (the A-Bb rub) whose low-pass and level open towards the hit; 8th-note tremolo"""
    t = tt(d)
    x = sum(phase_osc(nf(n) * (1 + dd), d, 'saw') for n in ('D2', 'A2', 'Bb2', 'D3') for dd in (-0.003, 0.003)) / 8
    k = (t / d) ** 1.5
    y = (lp(x, 400) * (1 - k) + lp(x, 2000) * k) * (0.55 + 0.45 * k) * (1 + 0.12 * np.sin(2 * np.pi * 2 / BEAT * t))
    return stereo(fade(hp(y, 95, order=2), 0.05, 0.02), 0, width=0.8)


def room_air(d):
    st = np.stack([hp(lp(noise(d, 'pink'), 2600), 140) * 0.12 for _ in range(2)], axis=1)
    return fade(st, 0.01, 0.02)


def swell(d):
    """the low swell into the payoff: C9sus4 (C2 G2 C3 F3 Bb3) rising out of a soft floor, its filter opening, with a
    reverse-cymbal air on top that is cut on the chord"""
    t = tt(d)
    x = sum(phase_osc(nf(n) * (1 + dd), d, 'saw') for n in ('C2', 'G2', 'C3', 'F3', 'Bb3') for dd in (-0.004, 0.004)) / 10
    k = (t / d) ** 1.6
    y = (lp(x, 350) * (1 - k) + lp(x, 2600) * k) * (0.25 + 0.75 * k)
    air = hp(noise(d, 'pink'), 2500) * k ** 2.5 * 0.35
    return fade(np.stack([y + air, y + hp(noise(d, 'pink'), 2500) * k ** 2.5 * 0.35], axis=1), 0.02, 0.012)


def breath_pad(d):
    """the breath before the rule line: Bbmaj9 → (the rule line) held softly, swelling a little into beat 38"""
    t = tt(d); k = (t / d) ** 1.4
    x = sum(phase_osc(nf(n) * (1 + dd), d, 'saw') for n in ('Bb2', 'F3', 'A3', 'C4', 'D4') for dd in (-0.004, 0.004)) / 10
    y = (lp(x, 700) * (1 - k) + lp(x, 1600) * k) * (0.6 + 0.4 * k)
    return fade(stereo(y, 0, width=0.9), 0.06, 0.03)


def applause(d, n=32, seed_=21):
    """a small room applauding: n clappers, each its own hand tone, rate (3.6-5.6/s) and seat (pan), in a room"""
    r = np.random.default_rng(seed_); N = n_(d); out = np.zeros((N, 2))
    for _ in range(n):
        lo, hi = r.uniform(700, 1300), r.uniform(2800, 5500)
        tmpl = bp(r.standard_normal(n_(0.03)), lo, hi) * np.exp(-tt(0.03) / r.uniform(0.004, 0.008))
        pn = r.uniform(-0.95, 0.95); l, rr = math.cos((pn + 1) * math.pi / 4), math.sin((pn + 1) * math.pi / 4)
        amp = r.uniform(0.35, 1.0); rate = r.uniform(3.6, 5.6); t = r.uniform(0, 0.3)
        while t < d - 0.035:
            i0 = n_(t); seg = tmpl * amp * r.uniform(0.7, 1.0)
            out[i0:i0 + len(seg), 0] += seg * l; out[i0:i0 + len(seg), 1] += seg * rr
            t += r.uniform(0.85, 1.15) / rate
    return reverb(out / math.sqrt(n) * 1.2, decay=1.1, mix=0.3, tone=6000)[:N]


# ============================================================================== the VO chain
def shelf_lo(x, f0, gain_db, S=1.0):
    A = 10 ** (gain_db / 40); w0 = 2 * np.pi * f0 / SR; cw, sw = np.cos(w0), np.sin(w0)
    al = sw / 2 * np.sqrt((A + 1 / A) * (1 / S - 1) + 2); sA = 2 * np.sqrt(A) * al
    b = [A * ((A + 1) - (A - 1) * cw + sA), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - sA)]
    a = [(A + 1) + (A - 1) * cw + sA, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - sA]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x, axis=0)


def shelf_hi(x, f0, gain_db, S=1.0):
    A = 10 ** (gain_db / 40); w0 = 2 * np.pi * f0 / SR; cw, sw = np.cos(w0), np.sin(w0)
    al = sw / 2 * np.sqrt((A + 1 / A) * (1 / S - 1) + 2); sA = 2 * np.sqrt(A) * al
    b = [A * ((A + 1) + (A - 1) * cw + sA), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - sA)]
    a = [(A + 1) - (A - 1) * cw + sA, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - sA]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x)


PHRASES = [(p['id'], p['film_in'], p['film_out']) for p in V['phrases']]


def phrase_lufs(x, a, b):
    return lufs(x[int(a * SR):int(b * SR)])


def level_phrases(x, target, lo=-10.0, hi=11.0):
    """one gain per phrase (to `target` LUFS); between phrases the lower of the two gains (so no breath or tail is
    pushed up); edges smoothed ~30 ms. Returns the levelled signal and the gains."""
    gains = [float(np.clip(target - phrase_lufs(x, a, b + 0.02), lo, hi)) for _, a, b in PHRASES]
    curve = np.empty(len(x))
    curve[:int(PHRASES[0][1] * SR)] = gains[0]
    for i, (_, a, b) in enumerate(PHRASES):
        i0 = int(a * SR); nxt = PHRASES[i + 1][1] if i + 1 < len(PHRASES) else None
        e = int(min(b + 0.02, nxt) * SR) if nxt else len(x)
        curve[i0:e] = gains[i]
        if nxt and e < int(nxt * SR): curve[e:int(nxt * SR)] = min(gains[i], gains[i + 1])
    w = n_(0.015)
    curve = uniform_filter1d(uniform_filter1d(curve, w, mode='nearest'), w, mode='nearest')
    return x * db(curve), gains


def deess(x, lo=5000, hi=10000, rel_db=-12.0, ratio=4.0, max_red=8.0):
    """split-band de-esser: only the 5-10 kHz band is turned down, and only where it rises above (phrase RMS - 12 dB)"""
    band = signal.sosfiltfilt(signal.butter(4, [lo / (SR / 2), hi / (SR / 2)], 'band', output='sos'), x)
    env = 10 * np.log10(uniform_filter1d(band ** 2, n_(0.005)) + 1e-14)
    ref = np.full(len(x), 300.0)
    for _, a, b in PHRASES:
        i0, i1 = int(a * SR), int(b * SR)
        ref[i0:i1] = 10 * np.log10((x[i0:i1] ** 2).mean() + 1e-14)
    red = np.clip((env - (ref + rel_db)) * (1 - 1 / ratio), 0, max_red)
    red = uniform_filter1d(maximum_filter1d(red, n_(0.004)), n_(0.004))
    return x - band + band * db(-red), red


def vo_chain(raw):
    x = signal.sosfiltfilt(signal.butter(2, 70 / (SR / 2), 'high', output='sos'), raw)
    x = peak_eq(x, 260, -2.5, 1.0)
    x = peak_eq(x, 3200, 2.5, 0.8)
    x = shelf_hi(x, 9000, 1.5)
    x, red = deess(x)
    x, g1 = level_phrases(x, -20.0)
    x = compress(x, thresh_db=-18, ratio=2.5, attack=0.004, release=0.09)[:, 0]
    vgr = np.zeros(len(x))
    for _ in range(6):
        x, g2 = level_phrases(x, -20.0, -6.0, 6.0)
        x, vg = limit(stereo(x), VO_CEIL_DB)
        x = x[:, 0]; vgr = np.maximum(vgr, -20 * np.log10(np.maximum(vg, 1e-9)))
    return x, {'vo_limiter_max_gr_db': round(float(vgr.max()), 2), 'vo_limiter_gr_over_1db_s': round(float((vgr > 1).sum() / SR), 3),
               'phrase_lufs_after_chain': [round(phrase_lufs(x, a, b + 0.02), 2) for _, a, b in PHRASES],'deess_max_db': float(red.max()), 'deess_p99_db': float(np.percentile(red[red > 0], 99)) if (red > 0).any() else 0.0,
               'level_gains_db': [round(g, 2) for g in g1], 'trim_gains_db': [round(g, 2) for g in g2]}


VO_CEIL_DB = -8.5          # VO true-peak ceiling inside the chain (phrases at −20 LUFS): peak-to-loudness 11.5 dB


def vo_duck(vo, depth_db, look=0.05, attack=0.04, bridge=0.35, release=0.30, thr_db=-42.0):
    """look-ahead side-chain from the VO envelope → a gain curve (dB) for the music. Speech = 20 ms RMS above −42 dBFS
    (words sit at −24 median, the one breath before the rule line peaks at −45, so the bed is not ducked by a breath);
    gaps shorter than 350 ms are bridged (no pumping between words) while real pauses let the bed breathe; moved 50 ms
    earlier (the music is down before the first consonant); two cascaded asymmetric one-poles (40 ms down, 300 ms up)
    at a 1 kHz control rate."""
    env = np.sqrt(np.maximum(uniform_filter1d(vo ** 2, n_(0.02)), 0))
    on = (env > db(thr_db)).astype(float)[::48]                       # 1 kHz control rate
    b = int(bridge * 1000) | 1
    on = minimum_filter1d(maximum_filter1d(on, b), b)                  # closing: bridges gaps < 350 ms
    L = int(look * 1000); ctrl = np.concatenate([on[L:], np.zeros(L)])  # look-ahead
    for tau_a, tau_r in ((attack / 2, release / 2), (attack / 2, release / 2)):
        aa, ar = math.exp(-1 / (tau_a * 1000)), math.exp(-1 / (tau_r * 1000)); y = np.empty_like(ctrl); s = 0.0
        for i, v in enumerate(ctrl.tolist()):
            c = aa if v > s else ar
            s = c * s + (1 - c) * v; y[i] = s
        ctrl = y
    k = np.interp(np.arange(len(vo)), np.arange(len(ctrl)) * 48, ctrl)
    return depth_db * np.clip(k, 0, 1)


# ============================================================================== mastering
def tp_env(x):
    up = signal.resample_poly(x, 4, 1, axis=0)
    a = np.abs(up).max(axis=1)
    return a[:len(x) * 4].reshape(-1, 4).max(axis=1)


def limit(x, ceiling_db, look=0.003, release=0.08):
    """true-peak look-ahead limiter with ZERO latency (offline): the gain at each sample is the windowed minimum of what
    the 4x-oversampled peaks need, ramped over 3 ms before the peak (centred average) and released exponentially."""
    need = np.minimum(1.0, db(ceiling_db) / (tp_env(x) + 1e-12))
    L = n_(look)
    g = uniform_filter1d(minimum_filter1d(need, 2 * L + 1, mode='nearest'), L + 1, mode='nearest')
    g = np.minimum(g, need)
    a = math.exp(-1 / (release * SR)); out = np.empty_like(g); prev = 1.0
    for i, v in enumerate(g.tolist()):
        prev = prev * a + (1 - a)
        if v < prev: prev = v
        out[i] = prev
    return x * out[:, None], out


def master(x, target=-14.0, tp_max=-1.7):
    """hp 25 Hz → light glue (2:1 above −12 dBFS at about −16 LUFS) → gain to `target` → true-peak limiter; the gain
    and the ceiling are iterated until the integrated loudness is within 0.05 LU and the true peak ≤ tp_max."""
    y = hp(x, 25, order=4)
    y = y * db(-16.0 - lufs(y))
    y = compress(y, thresh_db=-12, ratio=2.0, attack=0.012, release=0.16)
    gain = target - lufs(y); ceil = tp_max - 0.15
    for _ in range(10):
        z, g = limit(y * db(gain), ceil)
        L, tp = lufs(z), true_peak_db(z)
        if tp > tp_max: ceil -= tp - tp_max + 0.03; continue
        if abs(L - target) < 0.05: break
        gain += target - L
    z = fade(z, 0.003, 0.06)                                           # the very first/last frame only
    gr = -20 * np.log10(np.maximum(g, 1e-9))
    return z, {'lufs': round(lufs(z), 2), 'true_peak_dbtp': round(true_peak_db(z), 2), 'gain_db': round(gain, 2),
               'limiter_max_gr_db': round(float(gr.max()), 2), 'limiter_gr_over_1db_s': round(float((gr > 1).sum() / SR), 3),
               '_gr': gr}


# ============================================================================== the arrangement
G = dict(kick=0.66, clap=0.6, hat=1.3, ohat=0.26, shk=1.2, rim=0.13, bass=0.55, pluck=0.37, stab=0.2, pad=0.08)


def build():
    ta.seed(1207); R = np.random.default_rng(1207); EVENTS.clear()
    m = Mix(DUR, tail=1.0); KICKS = []
    KICK, KSOFT, CRASH, OH = kick_g(), kick_soft(), crash(), ohat()
    CLAPS = [clap_g() for _ in range(4)]; HATS = [hat(0.045) for _ in range(4)]; SHK = [shaker(0.07) for _ in range(3)]
    RIM = rim(0.06)
    KPAT = {'2step': (0, 10), 'fill': (0, 8, 11, 12, 14, 15), 'roll': (0, 6, 7)}

    def drums(k0, k1, kick_='2step', fills=(), claps=True, hats=True, ohats=True, shk=True, rims=True, vel=1.0, skip=(), fill_vel=1.0, clap_skip=()):
        for i in range(int(round(k0 * 4)), int(round(k1 * 4))):
            b = i % 16; bar = (i // 16) * 4
            pat = KPAT['fill'] if bar in fills else KPAT[kick_]
            t0, tsw = i16(i, False), i16(i)
            if b in pat and not any(abs(t0 - s) < 0.02 for s in skip):
                fv = fill_vel if (bar in fills and b >= 8) else 1.0
                m.add(KICK, t0, gain=G['kick'] * vel * fv * (1.0 if b == 0 else 0.92), bus='drums'); KICKS.append(t0)
            if claps and b in (4, 12) and i not in clap_skip: m.add(CLAPS[(i // 4) % 4], t0, gain=G['clap'] * vel, bus='drums')
            if hats:
                if b % 4 == 2 and ohats: m.add(OH, t0, gain=G['ohat'] * vel, bus='drums', pan=0.2)
                else: m.add(HATS[i % 4], tsw, gain=(0.16, 0.24, 0.2, 0.26)[b % 4] * G['hat'] * vel, bus='drums', pan=0.25)
            if shk: m.add(SHK[i % 3], tsw, gain=(0.05, 0.09, 0.06, 0.09)[b % 4] * G['shk'] * vel, bus='drums', pan=-0.3)
            if rims and b in (7, 13): m.add(RIM, tsw, gain=G['rim'] * vel, bus='drums', pan=-0.15)

    def cell(k, ch, n16=8, parts=('bass', 'pluck', 'stab', 'pad'), vel=1.0, plp=None, keep=lambda t: True, gp=1.0, gpad=1.0):
        i0 = int(round(k * 4))
        if 'bass' in parts:
            for pos, note, ln in BAS[ch]:
                t = i16(i0 + pos)
                if pos < n16 and keep(t): m.add(bass_g(nf(note), ln * S16 * 0.92, vel), t, gain=G['bass'], bus='bass')
        if 'pluck' in parts:
            for pos, note, ln in MEL[ch]:
                t = i16(i0 + pos)
                if pos >= n16 or not keep(t): continue
                y = pluck_syn(nf(note), 0.45, vel * (1.0 if ln > 1 else 0.85))
                m.add(lp(y, plp) if plp else y, t, gain=G['pluck'] * gp, bus='pluck', pan=0.12 if pos % 2 else -0.08)
        if 'stab' in parts:
            for pos in (3, 6):
                t = i16(i0 + pos)
                if pos >= n16 or not keep(t): continue
                for j, note in enumerate(CH[ch]):
                    m.add(stab(nf(note), 0.2, vel), t + j * 0.003, gain=G['stab'], bus='keys', pan=(j / 3 - 0.5) * 0.6)
        if 'pad' in parts:
            p = pad([nf(n) for n in CH[ch][:3]], n16 * S16 + 0.2, cutoff=1300, detune=0.08, attack=0.04, release=0.2)
            m.add(lp(p, plp) if plp else p, kt(k) - 0.01, gain=G['pad'] * gpad, bus='keys')

    T_HIT = cue('SPLASH'); T_CUT = cue('class_cut'); T_CHORD = cue('wide_chord'); T_END = cue('end_cut')
    T_LOGO = cue('sonic_logo_hit')

    # ---------------------------------------------------------------- HOOK (0 – 2.6): the room at 2 a.m.
    m.add(room_bed(cue('push_whoosh') + 0.4), 0.0, gain=0.7, bus='amb'); mark('hook_bed', 0.0, 'bed')
    m.add(fan(cue('screen_on')), 0.0, gain=1.1, bus='amb')
    m.add(tension(T_HIT + 0.02), 0.0, gain=0.36, bus='amb')
    # (lead, integration) no key taps: the plate shows both hands in the hair from 0 to 1.6 s, so nothing on screen is
    # typing (house rule: no foley without a visible cause). The room, the fan and the tension drone carry the hook.
    taps = []
    for j, dt in enumerate(taps):
        t = cue('kbd_taps') + dt
        m.add(keytap(R, 0.9 - 0.06 * j), t, gain=0.45, bus='sfx', pan=R.uniform(-0.25, 0.1))
        if j == 0: mark('kbd_taps', t)
    for name, f_sub, v in (('hook_hit_1', nf('D2'), 0.85), ('hook_hit_2', nf('F2'), 0.92), ('hook_hit_3', nf('A2'), 1.0)):
        m.add(hook_hit(f_sub, v), cue(name), gain=0.65, bus='hits'); mark(name, cue(name))
    dv = cue('screen_on') - cue('push_whoosh')
    m.add(dive_whoosh(dv), cue('push_whoosh'), gain=0.55, bus='sfx'); mark('push_whoosh', cue('push_whoosh'), 'ramp', 'rises f66-f77, cut dead on the white f78')

    # ---------------------------------------------------------------- SCREEN (2.6 – 4.77): inside the laptop
    m.add(blip(), cue('screen_on'), gain=0.45, bus='sfx'); mark('screen_on', cue('screen_on'))
    m.add(pop(420, 1100, 0.07), cue('chat_pop'), gain=0.6, bus='sfx', pan=-0.1); mark('chat_pop', cue('chat_pop'))
    m.add(buzz(((0.0, 0.14), (0.19, 0.04))), cue('chat_pop'), gain=0.6, bus='sfx', pan=0.35)   # (fix round 2) ends 2.99 s, before «والتسليم…»
    m.add(ding(), cue('notif_ding'), gain=0.75, bus='sfx', pan=0.05); mark('notif_ding', cue('notif_ding'))
    k0 = int(round((cue('clock_ticks') - PHASE) / BEAT))                       # beat 4 … beat 11, stops at the hit
    for k in range(k0, 12):
        m.add(clock_tick(tock=(k % 2 == 1)), kt(k), gain=0.4, bus='sfx', pan=-0.2)
        m.add(KSOFT, kt(k), gain=0.22 + 0.03 * (k - k0), bus='amb')           # a muffled heartbeat under the ticks
        if k == k0: mark('clock_ticks', kt(k), 'onset', 'beat 4; then every beat to beat 11')

    # ---------------------------------------------------------------- TASH bubble + typing + the build (4.77 – 7.16)
    tb = cue('tash_bubble_pop')
    m.add(pop(300, 700, 0.09), tb, gain=0.5, bus='sfx'); mark('tash_bubble_pop', tb)
    m.add(tick(2200), tb + 0.045, gain=0.32, bus='sfx', pan=0.25); m.add(tick(2500), tb + 0.125, gain=0.3, bus='sfx')
    first = True
    for wid in ('L3.1', 'L3.2a'):
        for w in TXT[wid]['words']:
            if w['text'] == '•••': continue
            nt = 2 if len(w['text']) <= 4 else 3
            for j in range(nt):
                t = ft(w['land']) + j * 0.055
                m.add(keytap(R, 0.75), t, gain=0.3, bus='sfx', pan=R.uniform(-0.2, 0.2))
                if first: mark('typing', t); first = False
    cell(8, 'Bb', parts=('pluck', 'pad'), vel=0.7, plp=1500, gp=1.2)             # the hook, heard through a wall
    cell(10, 'C', parts=('pluck', 'pad'), vel=0.85, plp=2800, gp=1.35)
    rd = T_HIT - cue('splash_riser')
    m.add(fade(riser(rd, 300, 9000), 0.005, 0.002), cue('splash_riser'), gain=0.32, bus='sfx')
    mark('splash_riser', cue('splash_riser'), 'ramp', 'rises to the hit, cut dead on it')

    # ---------------------------------------------------------------- SPLASH (f215, bar line): the groove drops
    ta.seed(2150)                                   # the brand hits get their own fixed noise (no drift when code above changes)
    sp = np.zeros((n_(2.6), 2)); th = tash_hit(); ws = reverb(water_splash(), 1.2, 0.14, 0.01, 7000); sd = stereo(sub_drop())
    sp[:len(th)] += th[:len(sp)] * 0.55; sp[:min(len(ws), len(sp))] += ws[:len(sp)] * 0.9; sp[:len(sd)] += sd * 0.8
    # (fix round 2) the spoken «طَ» (7.14-7.22 s) sits under the hit: a -6 dB cut of the splash's 0.4-3 kHz band over its
    # first 0.13 s, back by 0.20 s (zero-phase band subtract, like the music carve); the sub, the clap transient and the
    # air above 4 kHz are untouched
    spb = signal.sosfiltfilt(signal.butter(2, [400 / (SR / 2), 3000 / (SR / 2)], 'band', output='sos'), sp, axis=0)
    tsp = np.arange(len(sp)) / SR
    wcut = np.clip((0.20 - tsp) / 0.07, 0, 1); wcut = wcut * wcut * (3 - 2 * wcut)
    sp = sp - spb * ((1 - db(-6.0)) * wcut)[:, None]
    m.add(fade(sp, 0.0005, 0.3), T_HIT - 0.002, gain=0.47, bus='logo'); mark('SPLASH', T_HIT)
    m.add(snapper(), cue('lockup_snap'), gain=0.45, bus='sfx', pan=0.1); mark('lockup_snap', cue('lockup_snap'))
    drums(12, 32, fills=(16, 28), fill_vel=0.7, skip=(kt(12),) + tuple(ft(c['land']) for c in C['cards']))  # the splash / a card hit IS that kick
    for k in range(12, 32, 2):
        cell(k, LOOP[((k - 12) // 2) % 4], keep=lambda t: t > T_HIT + 0.05)  # the sub drop is the first bass note

    # ---------------------------------------------------------------- PARADE: one hit per card, on its frame
    whoosh_in = dict(pan_from=0.5, pan_to=-0.4, peak=0.85)
    for j, c in enumerate(C['cards']):
        t = ft(c['land']); name = f"card{c['card']}"
        m.add(whoosh(0.22, 500, 5000, **whoosh_in), t - 0.187, gain=0.22, bus='sfx')
        m.add(card_hit(140 + 11 * j, 1.0 if c['card'] in (1, 2) else 0.92), t, gain=0.45, bus='hits', pan=(-0.08, 0.08)[j % 2])
        mark(name, t)
    t1 = cue('card1')
    m.add(whoosh(0.35, 600, 7000, pan_from=-0.5, pan_to=0.6, peak=0.35), t1, gain=0.25, bus='sfx')   # the slides fan out
    for j in range(6):
        m.add(paper_flip(R, 0.12), t1 + 0.02 + 0.055 * j, gain=0.3, bus='sfx', pan=-0.6 + 0.24 * j)
    # (fix round 2) the report's two page turns, on the picture's own turn frames (cues card2_turn1/2: f342, f357)
    for j, nm in enumerate(('card2_turn1', 'card2_turn2')):
        m.add(paper_flip(R, 0.15), cue(nm), gain=0.34, bus='sfx', pan=0.2 - 0.3 * j); mark(nm, cue(nm))
    # (fix round 2) the school deck grows out from behind card 1 on the beat (f287-f295): a fan flick + three flicks
    tds = cue('deck_school')
    m.add(whoosh(0.22, 600, 6000, pan_from=-0.4, pan_to=0.4, peak=0.6), tds, gain=0.2, bus='sfx'); mark('deck_school', tds)
    for j in range(3): m.add(paper_flip(R, 0.1), tds + 0.13 + 0.04 * j, gain=0.26, bus='sfx', pan=-0.5 + 0.5 * j)
    m.add(paper_flip(R, 0.16), cue('card3') + 0.06, gain=0.34, bus='sfx', pan=-0.15)
    m.add(whoosh(0.32, 400, 6000, pan_from=-0.6, pan_to=0.5, peak=0.6), cue('card4') - 0.19, gain=0.22, bus='sfx')
    m.add(shutter(), cue('card5') + 0.03, gain=0.45, bus='sfx', pan=0.1)
    for j, n in enumerate(('G5', 'A5', 'C6', 'D6', 'E6')):                      # the chart draws (over C6/9)
        m.add(pluck_syn(nf(n), 0.35, 0.8 + 0.05 * j), cue('card7') + 0.03 + 0.06 * j, gain=0.13, bus='pluck', pan=-0.3 + 0.15 * j)
    for name in ('answer1', 'answer2'):
        m.add(pop(500, 1200, 0.06), cue(name), gain=0.33, bus='sfx', pan=0.15); mark(name, cue(name))
    for j, wid in enumerate(('ui.research_tag1', 'ui.research_tag2', 'ui.research_tag3')):
        t = ft(TXT[wid]['land']); m.add(tick(2600 + 400 * j), t, gain=0.35, bus='sfx', pan=0.3 - 0.3 * j)
        mark('research_tags' if j == 0 else f'research_tag{j + 1}', t)
    for j, n in enumerate(('C6', 'D6', 'E6', 'G6', 'A6')):                     # five rising mouse-click pops
        t = ft(TXT[f'ui.file_chip{j + 1}']['land'])
        m.add(click_pop(nf(n), 0.85 + 0.04 * j), t, gain=0.32, bus='sfx', pan=-0.4 + 0.2 * j)
        mark('file_chips' if j == 0 else f'file_chip{j + 1}', t)
    # the fan hold: Am7 held on the full fan, one kick + crash, the drums out to the cut
    tf = cue('fan_hold')
    m.add(KICK, kt(32), gain=G['kick'], bus='drums'); KICKS.append(kt(32)); m.add(CRASH, kt(32), gain=0.5, bus='drums')
    for j, note in enumerate(CH['Am']): m.add(stab(nf(note), 0.5, 0.9), kt(32) + j * 0.004, gain=G['stab'] * 1.2, bus='keys', pan=(j / 3 - 0.5) * 0.7)
    m.add(bass_g(nf('A1'), 0.42), kt(32), gain=G['bass'], bus='bass'); mark('fan_hold', kt(32), 'onset', 'beat 32')
    cell(32, 'Am', parts=('pad',), gpad=4.0)

    # ---------------------------------------------------------------- DETAILS (17.23 – 22.77): filtered, calm
    td = cue('details_in')
    m.add(whoosh(0.6, 200, 2500, q=1.5, pan_from=0.3, pan_to=-0.3, peak=0.35), td - 0.21, gain=0.3, bus='sfx')
    mark('details_in', td, 'ramp', 'soft macro whoosh peaking on the cut')
    drums(33, 37, hats=False, ohats=False, shk=True, rims=False, vel=0.85)
    drums(38, 40, hats=False, ohats=False, shk=True, rims=False, vel=0.9)       # the rule line: the beat comes back,
    m.add(KICK, kt(38), gain=G['kick'] * 0.95, bus='drums'); KICKS.append(kt(38))  # on beat 38 itself (beat 3: no 2-step kick)
    drums(40, 45, ohats=False, rims=False, vel=0.8)                             # after the swipe: light hats (to the cut)
    gap = (kt(37), kt(38))
    cell(32, 'Am', parts=('bass',), keep=lambda t: t >= kt(33))
    for k, ch in ((34, 'Dm'), (36, 'Bb'), (38, 'C'), (40, 'Am'), (42, 'Dm'), (44, 'Bb')):
        parts = ('bass', 'pad')                                                   # nothing busy under the rule line
        cell(k, ch, n16=4 if k == 44 else 8, parts=parts, vel=0.85, gpad=4.0, keep=lambda t: not (gap[0] <= t < gap[1]) and t < T_CUT)
    ts = cue('margin_snap')
    m.add(click_pop(nf('E6'), 0.9), ts, gain=0.42, bus='sfx'); m.add(bell(nf('E7'), 0.9, 0.6), ts + 0.004, gain=0.12, bus='sfx', pan=0.2)
    m.add(tick(3200), ts + 2 / FPS, gain=0.16, bus='sfx', pan=-0.3); m.add(tick(3600), ts + 4 / FPS, gain=0.13, bus='sfx', pan=0.3)
    mark('margin_snap', ts)
    m.add(breath_pad(kt(38) - kt(37) + 0.06), kt(37) - 0.03, gain=0.5, bus='amb')     # low, not a hole
    mark('breath_gap', kt(37) - 0.03, 'level', 'no drums, a soft Bbmaj9 pad: low, not a hole')
    mark('rule_line', kt(38), 'onset', 'the kick comes back on beat 38')
    tw = cue('ba_swipe')
    m.add(whoosh(0.4, 400, 7000, pan_from=0.6, pan_to=-0.6, peak=0.55), tw - 0.22, gain=0.32, bus='sfx')
    mark('ba_swipe', tw, 'ramp', 'whoosh peaking on the bar line')

    # ---------------------------------------------------------------- PAYOFF (22.77 – 25.4): the lecture hall
    m.add(room_air(T_END - T_CUT), T_CUT, gain=1.1, bus='amb'); mark('class_cut', T_CUT, 'bed', 'room air + swell')
    m.add(swell(T_CHORD - T_CUT), T_CUT, gain=1.3, bus='amb')
    big = ['C3', 'F3', 'A3', 'E4', 'G4', 'C5']
    m.add(supersaw([nf(n) for n in big], T_END - T_CHORD + 0.35, release=0.3), T_CHORD, gain=0.5, bus='big')
    for j, n in enumerate(('A3', 'E4', 'G4', 'C5')):
        m.add(epiano(nf(n), 2.0, 0.75, 0.6, pan=(j / 3 - 0.5) * 0.6), T_CHORD + j * 0.012, gain=0.3, bus='big')
    for n, dt, g in (('C6', 0.0, 0.07), ('A5', 0.09, 0.06), ('E6', 0.2, 0.05), ('G6', 0.34, 0.04)):
        m.add(bell(nf(n), 2.0, 0.5), T_CHORD + dt, gain=g, bus='big', pan=0.3 if n in ('A5', 'G6') else -0.3)
    m.add(impact(1.6, sub_f=nf('F1'), bright=0.35, sub_decay=0.3, space=0.35), T_CHORD - 0.002, gain=0.35, bus='hits')
    mark('wide_chord', T_CHORD)
    m.add(bass_g(nf('F1'), kt(48) - T_CHORD, 1.0), T_CHORD, gain=G['bass'], bus='bass')
    for i in range(48 * 4, 50 * 4, 2):                                            # the octave bass builds on 8ths
        m.add(bass_g(nf('F2') if (i // 2) % 2 else nf('F1'), S16 * 1.8, 0.9), i16(i), gain=G['bass'], bus='bass')
    m.add(KICK, kt(47), gain=G['kick'] * 0.9, bus='drums'); KICKS.append(kt(47))
    drums(48, 50, kick_='roll', ohats=False, rims=False, vel=0.85)               # … Jersey roll into the end card
    ap = applause(T_END - 24.15 + 0.1)
    ae = np.clip((tt(len(ap) / SR) - 0.0) / 0.9, 0, 1)[:, None] ** 1.6
    m.add(fade(ap * ae, 0.01, 0.06), 24.15, gain=0.55, bus='amb')

    # ---------------------------------------------------------------- END CARD (25.4 – 29.23)
    eh = np.zeros((n_(1.4), 2)); k_ = stereo(KICK); c_ = stereo(CLAPS[0])
    eh[:len(k_)] += k_ * 0.9; eh[:len(c_)] += c_ * 0.7; eh[:len(CRASH)] += CRASH[:len(eh)] * 0.8
    m.add(eh, T_END, gain=0.75, bus='hits'); KICKS.append(T_END); mark('end_cut', T_END)
    # (fix round 2) the bar-52 fill keeps its roll but drops the two kicks and the clap that sat on «ليلة.» (28.16 / 28.28 s):
    # the roll now starts on 16th 14 (28.52 s), after the last word
    drums(50, 55, fills=(52,), skip=(i16(219, False), i16(220, False)), clap_skip=(220,))
    cell(50, 'Bb'); cell(52, 'C'); cell(54, 'Dm', n16=4)
    m.add(pop(420, 1100, 0.07), cue('cta_pop'), gain=0.42, bus='sfx'); mark('cta_pop', cue('cta_pop'))
    m.add(tick(2800), cue('handles_pop'), gain=0.32, bus='sfx', pan=0.2); mark('handles_pop', cue('handles_pop'))
    t2 = ft(TXT['end.tt']['land']); m.add(tick(3200), t2, gain=0.3, bus='sfx', pan=-0.2); mark('handles_pop2', t2)
    tg = cue('tag_pop')            # the wink: E6 C6 then G6, its attack in the gap BEFORE «بس» (fix round), short tails
    for j, (n, dt) in enumerate((('E6', 0.0), ('C6', 0.06), ('G6', 0.12))):
        m.add(pluck_syn(nf(n), 0.22, 0.95), tg + dt, gain=0.3, bus='sfx', pan=(-0.3, 0.3, 0.0)[j])
    m.add(pop(600, 1500, 0.05), tg + 0.14, gain=0.16, bus='sfx'); mark('tag_pop', tg)
    # the cadence under the logo: Csus from the ticks (after the last word), Fmaj9 on the hit, held to the last frame
    tk0 = V['vo_last_end'] + 0.02
    m.add(pad([nf(n) for n in CH['Csus']], T_LOGO - tk0 + 0.08, cutoff=1500, detune=0.08, attack=0.03, release=0.06), tk0 - 0.01, gain=0.32, bus='big')
    m.add(pad([nf(n) for n in ('F3', 'A3', 'C4', 'E4', 'G4')], DUR - T_LOGO + 1.0, cutoff=2400, detune=0.08, attack=0.01, release=0.4), T_LOGO, gain=0.5, bus='big')
    for j, n in enumerate(('A3', 'E4', 'G4', 'C5')):
        m.add(epiano(nf(n), 1.6, 0.6, 0.5, pan=(j / 3 - 0.5) * 0.5), T_LOGO + 0.01 + j * 0.01, gain=0.32, bus='big')
    m.add(bass_g(nf('F2'), DUR - T_LOGO + 0.1, 0.7), T_LOGO, gain=G['bass'] * 0.5, bus='bass')

    # ---------------------------------------------------------------- the TASH sonic logo, alone
    ta.seed(8480)
    # (fix round) the typing ticks start AFTER the voice (vo_last_end + 0.02), three ticks 0.09 s apart into the hit:
    # before, they and the tail lift landed on «ليلة.»
    for j, (f, pn) in enumerate(((2200, 0.25), (2500, 0.0), (2800, -0.25))):
        m.add(tick(f), tk0 + j * 0.09, gain=0.85, bus='logo', pan=pn)
    mark('sonic_logo_ticks', tk0)
    m.add(whoosh(0.3, 400, 6000, pan_from=0.4, pan_to=-0.2, peak=0.8), T_LOGO - 0.255, gain=0.5, bus='logo')
    m.add(tash_hit(), T_LOGO - 0.004, gain=0.66, bus='logo'); mark('sonic_logo_hit', T_LOGO)
    m.add(pop(500, 1300, 0.06), T_LOGO + 0.18, gain=0.4, bus='logo')
    for j, f in enumerate((2600, 2900, 3200)): m.add(tick(f), kt(57) + j * S16, gain=0.24 - 0.02 * j, bus='logo')

    # ============================================================== buses
    N = len(m.buf); tl = np.arange(N) / SR

    def ramp(t0, t1, a, b):
        k = np.clip((tl - t0) / max(1e-6, t1 - t0), 0, 1); k = k * k * (3 - 2 * k)
        return (a + (b - a) * k)[:, None]

    kd = duck_curve(N, KICKS, depth_db=-4.5, attack=0.003, hold=0.02, release=0.15)[:, None]
    kd2 = duck_curve(N, KICKS, depth_db=-2.5, attack=0.003, hold=0.02, release=0.15)[:, None]
    m.process_bus('bass', lambda b: hp(b, 30) * kd + hp(sat(b * 3, 2.5), 220) * 0.11 * kd)   # + phone-audible harmonics
    m.process_bus('keys', lambda b: reverb(b, 1.3, 0.18, 0.015, 6000)[:N] * kd2)
    m.process_bus('pluck', lambda b: reverb(pingpong(b, 0.36, 0.3, 0.2), 1.6, 0.2, 0.02, 7000)[:N] * kd2)
    m.process_bus('drums', lambda b: hp(reverb(sat(b * 2.2, 1.6) / 2.2, 0.45, 0.07, 0.005, 7000), 30))   # soft-clipped transients
    m.process_bus('big', lambda b: reverb(b, 2.6, 0.26, 0.02, 7000))
    m.process_bus('sfx', lambda b: reverb(b, 0.6, 0.08, 0.005, 7500))
    m.process_bus('hits', lambda b: reverb(b, 1.2, 0.1, 0.01, 6500))

    groove = shelf_lo(sum(m.buses[b] for b in ('drums', 'bass', 'keys', 'pluck')), 110, -3.0)
    # details: the whole groove filtered (muffled macro), half-open on the rule line, open after the swipe
    w = ramp(cue('details_in') - 0.02, cue('details_in') + 0.03, 0, 0.75) * ramp(kt(38) - 0.03, kt(38) + 0.03, 1, 0.45 / 0.75) \
        * ramp(cue('ba_swipe') - 0.05, cue('ba_swipe') + 0.1, 1, 0.12 / 0.45) * ramp(21.6, 22.4, 1, 0.0)
    groove = groove * (1 - w) + lp(groove, 1100) * w
    # the lecture-hall cut: the groove stops with the picture and comes back on the wide chord
    gate = ramp(T_CUT - 0.003, T_CUT + 0.012, 1, 0) + ramp(T_CHORD - 0.012, T_CHORD - 0.002, 0, 1)
    groove = groove * np.clip(gate, 0, 1)
    amb = m.buses['amb'] * ramp(T_END - 0.01, T_END + 0.01, 1, 0)               # the room cuts with the end card
    music = groove + m.buses['big'] + amb
    stems = {'music': music, 'sfx': m.buses['sfx'], 'hits': m.buses['hits'], 'logo': m.buses['logo']}
    end = lambda x: x[:NS]
    stems = {k: end(v) for k, v in stems.items()}

    # ============================================================== VO
    raw, sr = sf.read(VO_WAV, always_2d=False)
    assert sr == SR
    raw = np.concatenate([raw, np.zeros(max(0, NS - len(raw)))])[:NS]
    vo, vinfo = vo_chain(raw)
    stems['vo'] = stereo(vo) * db(VO_GAIN_DB)
    # after the last word the duck lets go in 150 ms (the sonic logo and the end pad come up in the clear)
    free = 1 - np.clip((np.arange(NS) / SR - V['vo_last_end']) / 0.15, 0, 1) ** 2
    duck_m = vo_duck(vo, -7.0) * free
    duck_s = vo_duck(vo, -6.0) * free                                  # (fix round) -3 → -6: pops and ticks under the voice
    duck_h = vo_duck(vo, -2.0) * free
    return stems, {'vo': vinfo, 'duck_music_db': duck_m, 'duck_sfx_db': duck_s, 'duck_hits_db': duck_h}


VO_GAIN_DB = 10.5
MUSIC_GAIN_DB = 0.0
TAIL_LIFT_DB = 3.5          # VO mix only: after the last word (vo_last_end) the bed and the logo come up
CARVE_DB = -5.0             # VO mix only: an extra cut of the music's 1.5-5 kHz band while the voice speaks


def mixes(stems, info):
    dm = db(info['duck_music_db'])[:, None]; ds = db(info['duck_sfx_db'])[:, None]; dh = db(info['duck_hits_db'])[:, None]
    mus = stems['music'] * db(MUSIC_GAIN_DB)
    novo = mus + stems['sfx'] + stems['hits'] + stems['logo']
    lift = db(TAIL_LIFT_DB * np.clip((np.arange(NS) / SR - V['vo_last_end']) / 0.15, 0, 1) ** 2)[:, None]
    # (fix round) the carve: keyed to the same voice side-chain (k = 0..1), an extra CARVE_DB on 1.5-5 kHz only, zero-phase
    # so the cut is clean (the band is subtracted in phase)
    k = np.clip(info['duck_music_db'] / -7.0, 0, 1)
    md = mus * dm
    mb = signal.sosfiltfilt(signal.butter(2, [1500 / (SR / 2), 5000 / (SR / 2)], 'band', output='sos'), md, axis=0)
    mus_v = md - mb * (1 - db(CARVE_DB * k))[:, None]
    bed = (mus_v + stems['sfx'] * ds + stems['hits'] * dh + stems['logo']) * lift
    info['bed_vo'] = bed
    vo = bed + stems['vo']
    return novo, vo


def write(path, x):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sf.write(path, x.astype(np.float64), SR, subtype='PCM_24')


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--stems', default=None); a = ap.parse_args()
    if a.stems: os.makedirs(a.stems, exist_ok=True)
    stems, info = build()
    novo, vo = mixes(stems, info)
    report = {}
    for name, x in (('novo', novo), ('vo', vo)):
        y, mi = master(x)
        assert len(y) == NS
        for p in OUT[name]: write(p, y)
        gr = mi.pop('_gr'); report[name] = mi
        print(f"{name}: {mi}")
        if a.stems: np.save(os.path.join(a.stems, f'gr_{name}.npy'), gr.astype(np.float32))
    speech = np.sqrt(np.maximum(uniform_filter1d(mono(stems['vo']) ** 2, n_(0.02)), 0)) > db(-50)
    dm = info['duck_music_db'][speech]
    print('VO chain:', info['vo'])
    print(f"music duck while the VO speaks: median {np.median(dm):.2f} dB, 5-95 % {np.percentile(dm, 5):.2f} … {np.percentile(dm, 95):.2f} dB")
    if a.stems:
        write(os.path.join(a.stems, 'bed_vo.wav'), info['bed_vo'])
        for k, v in stems.items(): write(os.path.join(a.stems, f'{k}.wav'), v)
        for k in ('duck_music_db', 'duck_sfx_db', 'duck_hits_db'): np.save(os.path.join(a.stems, f'{k}.npy'), info[k])
        json.dump({'events': EVENTS, 'report': report, 'vo': info['vo']}, open(os.path.join(a.stems, 'events.json'), 'w'),
                  ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
