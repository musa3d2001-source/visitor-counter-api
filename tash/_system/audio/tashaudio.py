"""
TASH audio engine — original music & sound design, synthesised from scratch (no samples, no licences needed).
Everything here is © TASH: rhythms, sounds and melodies are generated procedurally by this code.

Conventions: 48 kHz, float32 stereo numpy arrays shaped (n, 2). Times in seconds.

    from tashaudio import *
    m = Mix(26.0)
    m.add(kick(), 0.0, gain=0.9)
    m.add(sonic_logo(), 22.0)
    m.master('out.wav')
"""
import json, math, os
import numpy as np
from scipy import signal
from scipy.io import wavfile
from scipy.ndimage import maximum_filter1d

SR = 48000
_rng = np.random.default_rng(7)


def seed(s):
    global _rng
    _rng = np.random.default_rng(s)


# ----------------------------------------------------------------------------- basics
def n_(d): return max(1, int(round(d * SR)))
def tt(d): return np.arange(n_(d)) / SR
def db(x): return 10 ** (x / 20)
def mono(x): return x if x.ndim == 1 else x.mean(axis=1)


def stereo(x, pan=0.0, width=0.0):
    """mono → stereo with equal-power pan (-1..1). width>0 adds a Haas-style decorrelation."""
    if x.ndim == 2:
        return x
    l, r = math.cos((pan + 1) * math.pi / 4), math.sin((pan + 1) * math.pi / 4)
    out = np.stack([x * l, x * r], axis=1) * math.sqrt(2)
    if width > 0:
        d = int(0.012 * SR * width)
        out[:, 1] = np.concatenate([np.zeros(d), out[:-d, 1]]) if d else out[:, 1]
    return out


def noise(d, color='white'):
    w = _rng.standard_normal(n_(d))
    if color == 'pink':
        b, a = [0.049922035, -0.095993537, 0.050612699, -0.004408786], [1, -2.494956002, 2.017265875, -0.522189400]
        w = signal.lfilter(b, a, w) * 3.5
    elif color == 'brown':
        w = np.cumsum(w); w = signal.lfilter([1, -1], [1, -0.995], w); w /= np.abs(w).max() + 1e-9
    return w


def phase_osc(freq, d, shape='sine'):
    """Oscillator with per-sample frequency (scalar or array) — glides are click-free."""
    N = n_(d)
    f = np.full(N, float(freq)) if np.isscalar(freq) else np.interp(np.arange(N), np.linspace(0, N - 1, len(freq)), freq)
    ph = np.cumsum(f) / SR
    if shape == 'sine':
        return np.sin(2 * np.pi * ph)
    if shape == 'tri':
        return 2 * np.abs(2 * (ph % 1) - 1) - 1
    if shape == 'saw':  # polyBLEP-ish via additive-free cheap approach: integrate band-limited by lowpass later
        s = 2 * (ph % 1) - 1
        dt = f / SR; p = ph % 1
        blep = np.where(p < dt, p / dt + p / dt - (p / dt) ** 2 - 1, 0) + np.where(p > 1 - dt, ((p - 1) / dt) ** 2 + 2 * (p - 1) / dt + 1, 0)
        return s - blep
    if shape == 'square':
        return np.sign(np.sin(2 * np.pi * ph))
    raise ValueError(shape)


def env_exp(d, decay, attack=0.002):
    t = tt(d)
    a = np.clip(t / max(attack, 1e-6), 0, 1)
    return a * np.exp(-t / max(decay, 1e-6))


def env_adsr(d, a=0.01, dc=0.1, s=0.7, r=0.2):
    N = n_(d); t = np.arange(N) / SR
    e = np.where(t < a, t / a, np.where(t < a + dc, 1 - (1 - s) * (t - a) / dc, s))
    rel = n_(r)
    if rel < N:
        e[-rel:] *= np.linspace(1, 0, rel) ** 2
    return e


def fade(x, fi=0.002, fo=0.01):
    x = x.copy(); a, b = n_(fi), n_(fo)
    ramp_in = np.linspace(0, 1, a); ramp_out = np.linspace(1, 0, b)
    if x.ndim == 2: ramp_in, ramp_out = ramp_in[:, None], ramp_out[:, None]
    x[:a] *= ramp_in[:len(x[:a])]; x[-b:] *= ramp_out[-len(x[-b:]):]
    return x


# ----------------------------------------------------------------------------- filters
def _sos(kind, f, q=0.707, order=2):
    nyq = SR / 2
    if kind == 'bp':
        lo, hi = f
        return signal.butter(order, [max(lo, 10) / nyq, min(hi, nyq * 0.98) / nyq], btype='band', output='sos')
    return signal.butter(order, min(f, nyq * 0.98) / nyq, btype={'lp': 'low', 'hp': 'high'}[kind], output='sos')


def lp(x, f, order=2): return signal.sosfilt(_sos('lp', f, order=order), x, axis=0)
def hp(x, f, order=2): return signal.sosfilt(_sos('hp', f, order=order), x, axis=0)
def bp(x, lo, hi, order=2): return signal.sosfilt(_sos('bp', (lo, hi), order=order), x, axis=0)


def peak_eq(x, f, gain_db, q=1.0):
    A = 10 ** (gain_db / 40); w0 = 2 * np.pi * f / SR; al = np.sin(w0) / (2 * q)
    b = [1 + al * A, -2 * np.cos(w0), 1 - al * A]; a = [1 + al / A, -2 * np.cos(w0), 1 - al / A]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x, axis=0)


def svf_sweep(x, f_start, f_end, q=4.0, mode='bp', curve='exp'):
    """Time-varying state-variable filter (TPT). Per-sample loop — fine for SFX-length signals."""
    N = len(x)
    if curve == 'exp':
        fc = f_start * (f_end / f_start) ** (np.arange(N) / max(N - 1, 1))
    else:
        fc = np.linspace(f_start, f_end, N)
    g = np.tan(np.pi * np.clip(fc, 20, SR * 0.45) / SR); k = 1 / q
    a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2
    ic1 = ic2 = 0.0; y = np.empty(N)
    xs = x.tolist(); A1, A2, A3 = a1.tolist(), a2.tolist(), a3.tolist()
    for i in range(N):
        v3 = xs[i] - ic2
        v1 = A1[i] * ic1 + A2[i] * v3
        v2 = ic2 + A2[i] * ic1 + A3[i] * v3
        ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2
        y[i] = v1 if mode == 'bp' else v2 if mode == 'lp' else xs[i] - k * v1 - v2
    return y


# ----------------------------------------------------------------------------- dynamics / space
def sat(x, drive=1.5):
    return np.tanh(x * drive) / np.tanh(drive)


def reverb(x, decay=1.6, mix=0.25, pre=0.012, tone=6500, width=1.0, seed_=11):
    """Convolution reverb with a synthetic stereo IR (decorrelated exponentially-decaying noise)."""
    r = np.random.default_rng(seed_)
    L = n_(decay * 1.4)
    t = np.arange(L) / SR
    e = np.exp(-6.9 * t / decay)
    irl = r.standard_normal(L) * e; irr = r.standard_normal(L) * e
    # darken the tail over time (air absorption)
    irl = lp(irl, tone); irr = lp(irr, tone)
    irl[:n_(pre)] = 0; irr[:n_(pre)] = 0
    irl /= np.sqrt((irl ** 2).sum()); irr /= np.sqrt((irr ** 2).sum())
    xs = stereo(x)
    M = len(xs) + L
    pad = lambda v: np.concatenate([v, np.zeros(max(0, M - len(v)))])[:M]
    wl = pad(signal.fftconvolve(xs[:, 0], irl)); wr = pad(signal.fftconvolve(xs[:, 1], irr))
    wet = np.stack([wl, wr], axis=1)
    mid = wet.mean(axis=1, keepdims=True); wet = mid + (wet - mid) * width
    dry = np.vstack([xs, np.zeros((L, 2))])
    return dry * (1 - mix) + wet * mix * 0.9


def compress(x, thresh_db=-18, ratio=3.0, attack=0.005, release=0.12, makeup_db=0):
    xs = stereo(x); lvl = np.abs(xs).max(axis=1)
    hop = 32; blocks = maximum_filter1d(lvl, hop)[::hop]
    env = np.zeros_like(blocks); a = math.exp(-hop / (attack * SR)); r = math.exp(-hop / (release * SR)); e = 0.0
    for i, v in enumerate(blocks):
        e = a * e + (1 - a) * v if v > e else r * e + (1 - r) * v
        env[i] = e
    env = np.repeat(env, hop)[:len(lvl)]
    edb = 20 * np.log10(env + 1e-9)
    over = np.maximum(edb - thresh_db, 0)
    gain = db(-over * (1 - 1 / ratio) + makeup_db)
    return xs * gain[:, None]


def limiter(x, ceiling_db=-1.0, look=0.004, release=0.08):
    xs = stereo(x); c = db(ceiling_db)
    pk = maximum_filter1d(np.abs(xs).max(axis=1), n_(look) * 2 + 1)
    g = np.minimum(1.0, c / (pk + 1e-9))
    g = signal.lfilter([1 - math.exp(-1 / (release * SR))], [1, -math.exp(-1 / (release * SR))], g)  # smooth recovery
    g = np.minimum(g, np.minimum(1.0, c / (pk + 1e-9)))
    d = n_(look)
    xs = np.vstack([np.zeros((d, 2)), xs])[:len(xs)]
    return np.clip(xs * g[:, None], -c, c)


def duck_curve(N, times, depth_db=-8, attack=0.004, hold=0.03, release=0.22):
    """Sidechain gain curve (array length N) from trigger times."""
    g = np.ones(N); d = db(depth_db)
    for t0 in times:
        i0 = int(t0 * SR); a, h, r = n_(attack), n_(hold), n_(release)
        seg = np.concatenate([np.linspace(1, d, a), np.full(h, d), d + (1 - d) * (1 - np.exp(-np.linspace(0, 5, r)))])
        i1 = min(N, i0 + len(seg))
        if i0 < N: g[i0:i1] = np.minimum(g[i0:i1], seg[:i1 - i0])
    return g



def lufs(x):
    """Integrated loudness (ITU-R BS.1770-4, K-weighted, gated) in LUFS at 48 kHz."""
    xs = stereo(x)
    # K-weighting stage 1 (high shelf) + stage 2 (RLB high-pass), BS.1770 coefficients for 48 kHz
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]
    k = signal.lfilter(b2, a2, signal.lfilter(b1, a1, xs, axis=0), axis=0)
    blk, hop = n_(0.4), n_(0.1)
    if len(k) < blk: return -70.0
    ms = np.array([(k[i:i + blk] ** 2).mean(axis=0).sum() for i in range(0, len(k) - blk + 1, hop)])
    L = -0.691 + 10 * np.log10(ms + 1e-12)
    ms = ms[L > -70]
    if not len(ms): return -70.0
    rel = -0.691 + 10 * np.log10(ms.mean()) - 10
    ms = ms[(-0.691 + 10 * np.log10(ms)) > rel]
    return float(-0.691 + 10 * np.log10(ms.mean()))


def true_peak_db(x, os_=4):
    xs = stereo(x)
    up = signal.resample_poly(xs, os_, 1, axis=0)
    return float(20 * np.log10(np.abs(up).max() + 1e-12))


# ----------------------------------------------------------------------------- the mix bus
class Mix:
    def __init__(self, duration, tail=2.0):
        self.d = duration; self.buf = np.zeros((n_(duration + tail), 2))
        self.buses = {}

    def add(self, x, at, gain=1.0, pan=0.0, bus=None, width=0.0):
        xs = stereo(x, pan, width) * gain
        target = self.buses.setdefault(bus, np.zeros_like(self.buf)) if bus else self.buf
        i0 = int(round(at * SR))
        if i0 < 0: xs = xs[-i0:]; i0 = 0
        i1 = min(len(target), i0 + len(xs))
        if i1 > i0: target[i0:i1] += xs[:i1 - i0]
        return self

    def bus(self, name):
        return self.buses.setdefault(name, np.zeros_like(self.buf))

    def process_bus(self, name, fn):
        if name in self.buses:
            y = fn(self.buses[name])
            self.buses[name] = y[:len(self.buf)] if len(y) >= len(self.buf) else np.vstack([y, np.zeros((len(self.buf) - len(y), 2))])

    def render(self, ceiling_db=-1.5, glue=True):
        out = self.buf.copy()
        for b in self.buses.values(): out += b[:len(out)]
        out = hp(out, 24, order=4)
        if glue: out = compress(out, thresh_db=-14, ratio=2.0, attack=0.01, release=0.15)
        out = sat(out * 1.05, 1.15)
        out = limiter(out, ceiling_db)
        return out[:n_(self.d)]

    def master(self, path, ceiling_db=-1.5, glue=True, target_lufs=-14.0):
        """Render, normalise to target_lufs (None = skip) and limit so TRUE peak stays ≤ ceiling_db.
        Pre-mastering here means the renderer's linear loudnorm only nudges the level (no pumping)."""
        out = self.render(ceiling_db, glue)
        if target_lufs is not None:
            for _ in range(3):
                g = target_lufs - lufs(out)
                if abs(g) < 0.3: break
                out = out * db(g)
                c = ceiling_db
                for _ in range(4):
                    y = limiter(out, c)
                    over = true_peak_db(y) - ceiling_db
                    if over <= 0: break
                    c -= over + 0.05
                out = y
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        wavfile.write(path, SR, out.astype(np.float32))
        print(f'wrote {path}  dur={len(out) / SR:.2f}s  loudness={lufs(out):.1f} LUFS  true-peak={true_peak_db(out):.1f} dBTP')
        return out


# ----------------------------------------------------------------------------- pitch helpers
NOTE = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}


def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)


def nf(name):
    """'D3' → Hz. Quarter tones: 'Ed4' = E half-flat (Bayati 2nd degree), 'Bd3' = B half-flat."""
    half = name[1] == 'd' and name[0] in 'ABCDEFG' and name[2:].lstrip('-').isdigit()
    if half: base, octv = name[0], int(name[2:]); off = -0.5
    else:
        base = name[:2] if len(name) > 2 and name[1] in '#b' else name[0]; octv = int(name[len(base):]); off = 0
    return mtof(12 * (octv + 1) + NOTE[base] + off)


class Grid:
    """Tempo grid: g.t(bar, beat=0, sub=0) → seconds. 4/4, beats are quarter notes."""
    def __init__(self, bpm, offset=0.0): self.bpm, self.off = bpm, offset; self.beat = 60 / bpm
    def t(self, bar, beat=0.0, sub=0.0): return self.off + (bar * 4 + beat + sub) * self.beat
    def steps(self, bar, pattern, step=0.25):
        """pattern: string like 'x...x...x.x.x...' (16ths). returns list of (time, velocity)."""
        out = []
        for i, ch in enumerate(pattern):
            if ch in 'xX>': out.append((self.t(bar, i * step), 1.0 if ch != 'x' else 0.8))
            elif ch == 'o': out.append((self.t(bar, i * step), 0.5))
        return out


# ----------------------------------------------------------------------------- drums
def kick(f0=150, f1=44, d=0.55, punch=1.0, click=0.35):
    t = tt(d)
    f = f1 + (f0 - f1) * np.exp(-t / 0.045)
    body = phase_osc(f, d) * env_exp(d, 0.24 * (d / 0.55), 0.001)
    cl = hp(noise(0.012), 1500) * env_exp(0.012, 0.003) * click
    body[:len(cl)] += cl
    return fade(sat(body * (1 + punch), 1.6) * 0.8, 0.0005, 0.03)


def sub808(freq, d=1.2, glide_from=None, glide_t=0.06, drive=2.2, decay=None):
    t = tt(d)
    f = np.full_like(t, freq) if glide_from is None else freq + (glide_from - freq) * np.exp(-t / glide_t)
    x = phase_osc(f, d) + 0.18 * phase_osc(f * 2, d)
    e = env_adsr(d, 0.003, 0.25, 0.65, min(0.25, d * 0.4)) if decay is None else env_exp(d, decay, 0.003)
    return fade(lp(sat(x * e, drive), 900), 0.001, 0.04) * 0.85


def clap(d=0.32, tone=(900, 3200), spread=0.011, bursts=4):
    out = np.zeros(n_(d))
    for k in range(bursts):
        i0 = n_(k * spread * (0.8 + 0.4 * _rng.random()))
        b = bp(noise(0.03), *tone) * env_exp(0.03, 0.006)
        out[i0:i0 + len(b)] += b[:len(out) - i0] * (0.75 if k < bursts - 1 else 1.0)
    tail = bp(noise(d), tone[0] * 0.9, tone[1]) * env_exp(d, 0.07) * 0.6
    tail[:n_(bursts * spread)] = 0
    return fade((out + tail) * 1.4, 0.0005, 0.02)


def claps_ensemble(n=6, d=0.4, humanize=0.009, seed_=3):
    """Khaleeji-style group handclap (تصفيق) — several players, slightly loose, wide stereo."""
    r = np.random.default_rng(seed_)
    out = np.zeros((n_(d + 0.05), 2))
    for p in range(n):
        off = abs(r.normal(0, humanize))
        lo = r.uniform(700, 1100); hi = r.uniform(2400, 4200)
        c = clap(d, (lo, hi), spread=r.uniform(0.006, 0.012), bursts=int(r.integers(2, 4))) * r.uniform(0.55, 1.0)
        i0 = n_(off); seg = stereo(c, r.uniform(-0.8, 0.8))
        out[i0:i0 + len(seg)] += seg[:len(out) - i0]
    return reverb(out * (1.6 / n), decay=0.9, mix=0.22, tone=5000)[:len(out) + n_(0.6)]


def membrane(f0, d, decay, ratios=(1.0, 1.59, 2.14, 2.30, 2.65, 2.92), amps=(1, .55, .38, .3, .22, .16), pitch_drop=0.12, strike=0.6, strike_band=(1500, 6000)):
    """Modal drum synthesis (circular membrane modes) — tabl / mirwas / doumbek family."""
    t = tt(d); out = np.zeros_like(t)
    for rt, a in zip(ratios, amps):
        f = f0 * rt * (1 + pitch_drop * np.exp(-t / 0.03))
        out += a * phase_osc(f, d) * np.exp(-t / (decay / (rt ** 0.9)))
    s = bp(noise(0.02), *strike_band) * env_exp(0.02, 0.004) * strike
    out[:len(s)] += s
    return fade(out * 0.5, 0.0005, 0.02)


def mirwas_dum(): return sat(membrane(118, 0.5, 0.13, pitch_drop=0.18, strike=0.35), 1.3)       # مرواس — low open stroke
def mirwas_tak(): return membrane(420, 0.18, 0.035, pitch_drop=0.06, strike=1.0, strike_band=(2000, 8000)) * 0.8  # rim / slap
def tabl(): return sat(lp(membrane(62, 0.9, 0.28, pitch_drop=0.25, strike=0.3), 2200) * 1.4, 1.5)  # طبل — deep


def hat(d=0.06, open_=False):
    d = 0.35 if open_ else d
    t = tt(d); f0 = 320
    x = sum(phase_osc(f0 * r, d, 'square') for r in (1, 1.342, 1.2312, 1.6532, 1.9523, 2.1523))
    x = hp(bp(x, 6000, 14000), 7000) + hp(noise(d), 9000) * 0.4
    return fade(x * env_exp(d, 0.11 if open_ else 0.018) * 0.35, 0.0003, 0.01)


def shaker(d=0.12):
    e = np.sin(np.linspace(0, np.pi, n_(d))) ** 2
    return bp(noise(d), 4500, 11000) * e * 0.35


def rim(d=0.08):
    return fade(bp(phase_osc(1700, d, 'tri') * env_exp(d, 0.012) + noise(d) * env_exp(d, 0.004) * 0.4, 600, 5000) * 0.6)


def snare(d=0.35, tone=200):
    body = phase_osc(tone * (1 + 0.3 * np.exp(-tt(d) / 0.01)), d) * env_exp(d, 0.05)
    nz = bp(noise(d), 1200, 9000) * env_exp(d, 0.09)
    return fade(sat(body * 0.7 + nz * 0.9, 1.4), 0.0005, 0.02)


# ----------------------------------------------------------------------------- tonal
def pluck(freq, d=1.2, bright=0.55, decay=0.996, body=True):
    """Karplus–Strong plucked string (oud/qanun-ish when filtered). Implemented as IIR — fast."""
    N = n_(d); P = SR / freq; Pi = int(P); frac = P - Pi
    exc = np.zeros(N); burst = lp(_rng.uniform(-1, 1, Pi + 2), 600 + bright * 7000)
    exc[:len(burst)] = burst
    a = np.zeros(Pi + 3); a[0] = 1
    # fractional delay via linear split, two-tap average (string loss)
    a[Pi] -= decay * 0.5 * (1 - frac); a[Pi + 1] -= decay * 0.5; a[Pi + 2] -= decay * 0.5 * frac
    y = signal.lfilter([1], a, exc)
    if body:
        y = peak_eq(y, 210, 5, 1.2); y = peak_eq(y, 2800, 3, 2.0)
    y /= np.abs(y).max() + 1e-9
    return fade(y * 0.6, 0.0005, 0.06)


def pad(freqs, d, cutoff=1800, detune=0.11, attack=0.6, release=0.8):
    out = np.zeros(n_(d))
    for f in freqs:
        for dt in (-detune, 0, detune):
            out += phase_osc(f * 2 ** (dt / 12), d, 'saw')
    out = lp(out, cutoff, order=2) / (len(freqs) * 3)
    return stereo(out * env_adsr(d, attack, 0.3, 0.85, release), 0, width=1.0)


def bass_synth(freq, d=0.4, cutoff=500, env_amt=1800, drive=1.8):
    x = phase_osc(freq, d, 'saw') * 0.6 + phase_osc(freq / 2, d) * 0.7
    e = env_exp(d, 0.09)
    y = svf_sweep(x, cutoff + env_amt, cutoff, q=1.4, mode='lp')
    return fade(sat(y * env_adsr(d, 0.004, 0.1, 0.7, 0.06), drive) * 0.7, 0.001, 0.02)


def bell(freq, d=2.5, bright=1.0):
    """Inharmonic bell/glass partials — perfume sparkle, premium 'ting'."""
    t = tt(d); out = np.zeros_like(t)
    for r, a, dec in ((1, 1, 1.0), (2.76, .5, .5), (5.4, .3 * bright, .28), (8.93, .18 * bright, .16), (13.34, .1 * bright, .09)):
        out += a * phase_osc(freq * r, d) * np.exp(-t / (d * dec * 0.35))
    return fade(out * 0.3, 0.001, 0.05)


# ----------------------------------------------------------------------------- SFX
def tick(freq=2300, d=0.045):
    """Typing-dot tick: tiny, rounded, a little 'wet'."""
    t = tt(d)
    x = phase_osc(freq * (1 + 0.35 * np.exp(-t / 0.004)), d) * env_exp(d, 0.008, 0.0004)
    x += hp(noise(d), 4000) * env_exp(d, 0.0015) * 0.25
    return fade(x * 0.55, 0.0002, 0.005)


def pop(f0=380, f1=980, d=0.07):
    """Chat-bubble pop: upward pitch glide (a bubble surfacing)."""
    t = tt(d); f = f0 + (f1 - f0) * (1 - np.exp(-t / 0.012))
    return fade(phase_osc(f, d) * env_exp(d, 0.016, 0.0008) * 0.6, 0.0002, 0.01)


def whoosh(d=0.6, f_lo=300, f_hi=4500, q=2.5, pan_from=-0.7, pan_to=0.7, peak=0.6):
    N = n_(d); x = noise(d, 'pink')
    half = int(N * peak)
    up = svf_sweep(x[:half], f_lo, f_hi, q=q)
    dn = svf_sweep(x[half:], f_hi, f_lo * 1.5, q=q)
    y = np.concatenate([up, dn])
    e = np.concatenate([np.linspace(0, 1, half) ** 2.2, np.linspace(1, 0, N - half) ** 1.4])
    y = y * e * 1.4
    pans = np.linspace(pan_from, pan_to, N)
    l, r = np.cos((pans + 1) * np.pi / 4), np.sin((pans + 1) * np.pi / 4)
    return np.stack([y * l, y * r], axis=1) * 1.2


def riser(d=2.0, f_lo=200, f_hi=9000, tonal=True):
    N = n_(d); x = noise(d, 'pink')
    y = svf_sweep(x, f_lo, f_hi, q=3.0) * 1.3
    if tonal:
        f = np.geomspace(110, 880, N)
        y += phase_osc(f, d, 'saw') * 0.12 + phase_osc(f * 1.5, d, 'saw') * 0.06
        y = lp(y, 9000)
    e = np.linspace(0, 1, N) ** 2.6
    return stereo(y * e, 0, width=0.8)


def downlifter(d=1.4):
    N = n_(d); y = svf_sweep(noise(d, 'pink'), 7000, 150, q=2.0)
    return stereo(y * np.linspace(1, 0, N) ** 1.5 * 1.2, 0, width=0.6)


def impact(d=2.2, sub_f=52, bright=1.0, sub_decay=0.22, space=0.3):
    """Cinematic hit: sub drop + transient + low thump + air. Sub stays dry and tight; only the top gets the room."""
    t = tt(d)
    sub = phase_osc(sub_f * (1 + 1.4 * np.exp(-t / 0.05)), d) * env_exp(d, sub_decay)
    thump = lp(noise(d, 'brown'), 260) * env_exp(d, 0.09) * 0.8
    crack = np.zeros_like(t); c = bp(noise(0.25), 800, 9000) * env_exp(0.25, 0.03) * 0.9 * bright; crack[:len(c)] = c
    low = fade(sat(sub * 1.1 + thump, 1.4), 0.0005, 0.3)
    top = hp(crack + low * 0.25, 220)
    wet = reverb(top, decay=2.0, mix=1.0, tone=5000)
    out = np.zeros((len(wet), 2)); out[:len(low)] += stereo(low) * 0.7; out[:len(top)] += stereo(top) * 0.6
    out += wet * space
    return fade(out, 0.0002, 0.4)


def tash_hit():
    """The 'طشّ' moment: impact + group clap + a short splash of air. The brand's sonic full stop."""
    a = impact(1.8, sub_f=48, bright=0.8)
    c = claps_ensemble(8, 0.35)
    s = stereo(hp(noise(0.5), 3500) * env_exp(0.5, 0.09) * 0.35, 0, width=1)
    out = np.zeros((max(len(a), len(c), len(s)), 2))
    out[:len(a)] += a; out[:len(c)] += c * 0.9; out[:len(s)] += s
    return out


def shimmer(d=2.5, base=1760, n=7, seed_=5):
    r = np.random.default_rng(seed_); out = np.zeros((n_(d + 0.5), 2))
    for k in range(n):
        f = base * r.choice([1, 1.5, 2, 2.25, 3, 4]) * r.uniform(0.995, 1.005)
        b = bell(f, 1.6, 0.6) * 0.5
        i0 = n_(k * d / n * r.uniform(0.6, 1.0)); s = stereo(b, r.uniform(-0.9, 0.9))
        out[i0:i0 + len(s)] += s[:len(out) - i0]
    return reverb(out, decay=3.0, mix=0.45, tone=9000)


def spray(d=0.45):
    """Perfume atomiser 'psst'."""
    e = np.concatenate([np.linspace(0, 1, n_(0.02)), np.ones(n_(d - 0.12)), np.linspace(1, 0, n_(0.1)) ** 2])
    x = bp(noise(len(e) / SR), 3000, 12000) * e[:n_(len(e) / SR)]
    return stereo(x * 0.5, 0, width=0.7)


def sizzle(d=2.0, density=900, seed_=9):
    """Grill sizzle: crackle impulses + hiss."""
    r = np.random.default_rng(seed_); N = n_(d)
    imp = np.zeros(N); idx = r.integers(0, N, int(density * d)); imp[idx] = r.uniform(-1, 1, len(idx)) ** 3
    crack = hp(imp, 2500) * 2.5
    hiss = bp(noise(d), 2500, 9000) * 0.18 * (0.7 + 0.3 * np.sin(np.linspace(0, 9, N)))
    return stereo((crack + hiss) * 0.45, 0, width=1)


def pour(d=2.0, seed_=13):
    """Liquid pour: lowpassed turbulent noise + gurgle blips."""
    r = np.random.default_rng(seed_); N = n_(d)
    base = lp(noise(d, 'pink'), 1400) * (0.6 + 0.4 * lp(r.standard_normal(N), 6) * 8)
    gl = np.zeros(N)
    for _ in range(int(d * 14)):
        f = r.uniform(280, 900); g = pop(f, f * 1.6, 0.05) * r.uniform(0.2, 0.5); i0 = r.integers(0, max(1, N - len(g)))
        gl[i0:i0 + len(g)] += g
    e = np.minimum(1, np.linspace(0, 6, N)) * np.minimum(1, np.linspace(6, 0, N))
    return stereo((base * 0.35 + gl * 0.6) * e, 0, width=0.5)


def shutter():
    a = bp(noise(0.03), 1500, 8000) * env_exp(0.03, 0.004)
    b = bp(noise(0.05), 800, 6000) * env_exp(0.05, 0.008)
    out = np.zeros(n_(0.12)); out[:len(a)] += a; out[n_(0.055):n_(0.055) + len(b)] += b * 0.8
    return out * 0.8


def tape_stop(x, d=0.5):
    """Pitch-down 'tape stop' on the tail of a signal (stereo or mono)."""
    xs = stereo(x); N = len(xs); M = n_(d)
    rate = np.linspace(1, 0, M) ** 1.6
    pos = np.cumsum(rate); pos = pos - pos[0] + (N - M)
    out = xs.copy()
    for c in range(2):
        out[N - M:, c] = np.interp(pos, np.arange(N), xs[:, c])
    return out


def sonic_logo(cues_path=None):
    """The TASH audio signature, aligned to _system/motion/endcard-cues.json:
    tick-tick-tick (typing) → whoosh as dots fly → 'طشّ' hit on the snap → tiny pop on the shadda → soft tail."""
    if cues_path is None:
        cues_path = os.path.join(os.path.dirname(__file__), '..', 'motion', 'endcard-cues.json')
    C = json.load(open(cues_path))
    out = Mix(C['duration'], tail=2.5)
    pitches = [2200, 2500, 2800]
    for k, t0 in enumerate(C['ticks']):
        out.add(tick(pitches[k % 3]), t0, gain=0.55, pan=[0.25, 0, -0.25][k % 3])
    out.add(pop(300, 700, 0.09), 0.02, gain=0.45)
    out.add(whoosh(0.5, 400, 6000, pan_from=0.4, pan_to=-0.2), C['snap'] - 0.42, gain=0.55)
    out.add(tash_hit(), C['snap'] - 0.004, gain=0.95)
    out.add(pop(500, 1300, 0.06), C['shadda'] + 0.06, gain=0.4)
    out.add(tick(2600), C['pulse'] + 0.18, gain=0.25)
    out.add(tick(2900), C['pulse'] + 0.30, gain=0.22)
    out.add(tick(3200), C['pulse'] + 0.42, gain=0.2)
    y = out.buf.copy()
    return y[:n_(C['duration'] + 1.5)]
