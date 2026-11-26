"""«طشّ للطلاب»: the VO edit. Cuts take1.mp3 into phrases (tools/vo_pieces.py, measured), re-times the gaps so the
read is tight and musical, tempo-ups the voice (rubberband, pitch kept) and places it on the FILM timeline.

    python3 src/tools/vo_edit.py --search      # print the best tempo / BPM / grid phase (the numbers behind the choice)
    python3 src/tools/vo_edit.py               # write src/vo/vo_edit.wav + src/vo/vo_timeline.json with the frozen choice

Gap rules (gap = the next phrase's acoustic onset - the previous phrase's cut-out, which already carries a 30-60 ms
tail, so a heard gap is ~0.04 s longer):
  list items 0.06-0.16 (heard 0.10-0.20) · section turns 0.25-0.45 · the splash air after «طشّ» 0.70-1.00
  (script: "about 0.9 s without voice") · the held fan before the details 0.40-0.65 · one real breath before the rule
  line 0.40-0.62 (the take's own inhale is moved there) and before the payoff 0.35-0.55.
Each phrase's placement is chosen inside its range so its key word lands on the grid (bar / beat / half-beat), the
choice closest to the preferred gap winning; the search scores tempo x BPM x phase on the squared misses (weighted:
the splash on a bar line, the cards, the rule line and the payoff on beats) plus how far each gap sits from its
preference. The VO acoustic onset is aimed LEAD seconds before the grid point (a consonant onset sounds 'on' the beat
when it leads it a little; the type lands on the grid frame itself)."""
import json, os, subprocess, sys
import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)
AD = os.path.dirname(SRC)
sys.path.insert(0, HERE)
from vo_pieces import PIECES, JOINED, BREATH  # noqa: E402

TAKE = os.path.join(AD, 'vo', 'take1.mp3')
OUT_WAV = os.path.join(SRC, 'vo', 'vo_edit.wav')
OUT_JSON = os.path.join(SRC, 'vo', 'vo_timeline.json')
SR = 48000
LEAD = 0.02

# piece -> (gap min, gap max, preferred gap, grid kind of its key event, weight, key event src time or None = onset)
RULES = {
    'h1': (0.06, 0.40, 0.10, 'beat', 3.0, 0.370),     # lead-in (film time of «عندك»); key = «برزنتيشن؟» (the stress)
    'h2': (0.06, 0.20, 0.10, 'half', 3.0, None),
    'h3': (0.06, 0.24, 0.12, 'half', 3.0, None),      # «تقرير؟» is 0.5 s: 1 beat is out of reach, 1.5 beats is not
    'd1': (0.25, 0.45, 0.35, 'half', 1.0, None),
    't1': (0.25, 0.45, 0.32, 'half', 1.0, None),
    't2': (0.06, 0.35, 0.15, 'bar', 8.0, 7.310),      # «طشّ» = the splash hit, on a bar line
    'p1a': (0.70, 1.00, 0.85, 'beat', 4.0, None),     # card 1
    'p1b': (0.06, 0.20, 0.10, 'half', 0.5, None),
    'p2a': (0.05, 0.22, 0.10, 'half', 3.0, None),     # card 2
    'p2b': (0.05, 0.18, 0.08, None, 0.0, None),
    'p3a': (0.12, 0.22, 0.125, None, 0.0, None),     # card 3 (fix round: off the grid, +0.07 s: «نرتّبه.» → «بحث؟» had a
                                                      # 65 ms heard gap, the only joint between two lines under 199 ms)
    'p3b': (0.05, 0.18, 0.08, None, 0.0, None),
    'p4a': (0.05, 0.22, 0.10, 'half', 3.0, None),     # cards 4-6
    'p4b': (0.06, 0.14, 0.08, None, 0.0, None),       # «بوستر.» then «فيديو.» (fix round: keep the take's own pause:
                                                      # a 0.00 gap ran them together as «بوسترفيديو»; card 5 stays on f431)
    'p4c': (0.00, 0.20, 0.06, 'half', 3.0, None),     # «فيديو.» is 0.57 s: «سي ڤي.» 1.5 beats after it
    'p5': (0.05, 0.24, 0.10, 'half', 3.0, None),      # card 7 + «وأي ملف أوفيس.»
    'm1': (0.40, 0.65, 0.50, 'half', 1.5, None),      # hold on the full fan, then the details
    'm2': (0.02, 0.30, 0.12, 'half', 1.5, None),      # «نضبّطها.» on the snap
    'r1': (0.40, 0.62, 0.50, 'beat', 4.0, None),      # breath, then THE RULE LINE
    'r2': (0.02, 0.30, 0.12, 'half', 2.0, None),      # the before/after swipe on the pause
    'c1': (0.25, 0.45, 0.32, None, 0.0, None),        # breath, then the payoff (fix round: 0.12 s earlier, off the grid,
                                                      # so «خلّ» gets ~160 ms of air at the «…» instead of 35 ms)
    'c2': (0.00, 0.25, 0.08, 'beat', 3.0, None),      # «خلّ شغلك…» on the wide chord (still beat 47)
    'e1': (0.55, 0.85, 0.70, 'half', 2.0, None),      # end card (fix round: one beat later, so «خلّ شغلك يسولف عنك.»
                                                      # holds ~1 s after its last word before the end card)
    'e2': (0.15, 0.35, 0.22, 'half', 2.0, None),      # the twist pay-off
}
DUR = (28.4, 29.75)          # preferred film length (hard max 30.0; fix round: one beat longer, 29.70 s)
TAIL = (1.10, 1.40)          # the sonic logo alone after the last word; the film ends on a beat in this window
BEAM = 24                    # states kept per phrase in the DP
GAP_W = 0.6                  # weight of a gap's distance from its preference (relative to its range)

# the frozen choice (from --search, 26 Nov). Best cost per tempo at 125 BPM: 1.06x 3.12 (end 29.38), 1.07x 2.65
# (29.37), 1.08x 2.36 (29.24); at 1.08x: 124 BPM 4.51, 125 BPM 2.36, 126.5 BPM 2.0 (but further from the brief's ~124).
# 1.08x is also the tightest read the brief allows (50 words in 22.0 s of speech instead of 23.8 s): taken.
# 125 BPM: beat = 0.480 s exactly, bar = 1.920 s; phase = the film time of a bar line (bar lines at 1.401 + 1.92k).
CHOICE = {'tempo': 1.08, 'bpm': 125.0, 'phase': 1.401,
          'note': 'search over tempo 1.00-1.08 x BPM 121-127 x bar phase (DP placer, see module doc). Chosen 1.08x, '
                  '125 BPM, bar phase 1.401 s: every key word within 8 ms of its grid point; film end 29.241 s (beat 58). '
                  '1.06x: cost 3.12, end 29.38 · 1.07x: 2.65, 29.37 · 1.08x: 2.36, 29.24 (124 BPM: 4.51; 126.5 BPM: 2.0).'}


def grid_points(kind, lo, hi, beat, phase):
    step = {'bar': 4 * beat, 'beat': beat, 'half': beat / 2}[kind]
    k0, k1 = int(np.ceil((lo - phase) / step - 1e-9)), int(np.floor((hi - phase) / step + 1e-9))
    return [phase + k * step for k in range(k0, k1 + 1)], step


def place(T, bpm, phase):
    """dynamic programme over the phrases: each phrase's candidate onsets are the grid points its key word can reach
    inside its gap range (plus the preferred gap and the range ends); the cheapest path wins (miss² x weight + gap
    distance from its preference), then the film end goes on a beat TAIL after the last word"""
    beat = 60.0 / bpm
    states = {None: (0.0, None, None)}             # key: rounded onset of the previous phrase -> (cost, row, parent)
    layers = []
    for pid, line, a, b, on, words in PIECES:
        gmin, gmax, gpref, kind, w, ev = RULES[pid]
        ev_src = on if ev is None else ev
        d_ev = (ev_src - on) / T
        new = {}
        for key, (cost0, row0, _) in states.items():
            t_end = 0.0 if row0 is None else row0['film_out']
            if pid == 'h1': lo, hi, pref = gmin, gmax, gpref
            else:
                lo, hi, pref = t_end + gmin, t_end + gmax, t_end + gpref
                if pid not in JOINED: lo = max(lo, t_end + (on - a) / T)
            cands = [(pref, None)]
            if kind:
                pts, step = grid_points(kind, lo + d_ev + LEAD, hi + d_ev + LEAD, beat, phase)
                cands = [(g - LEAD - d_ev, 0.0) for g in pts] + [(lo, None), (hi, None)]
            for on_f, miss in cands:
                if miss is None:
                    if kind:
                        e = on_f + d_ev + LEAD - phase; miss = abs(e - step * round(e / step))
                    else: miss = 0.0
                gap = on_f - (0.0 if pid == 'h1' else t_end)
                c = cost0 + w * (miss / 0.033) ** 2 + GAP_W * ((gap - gpref) / max(1e-3, gmax - gmin)) ** 2
                in_f = on_f - (on - a) / T
                row = dict(id=pid, line=line, src=[a, b], on_src=on, film_in=in_f, film_on=on_f, film_out=in_f + (b - a) / T,
                           gap=gap, key_src=ev_src, key_film=on_f + d_ev, grid=kind, miss=miss)
                k = round(on_f, 3)
                if k not in new or c < new[k][0]: new[k] = (c, row, key)
        new = dict(sorted(new.items(), key=lambda kv: kv[1][0])[:BEAM])
        layers.append(new); states = new
    best = None
    for key, (c, row, parent) in states.items():
        pts, _ = grid_points('beat', row['film_out'] + TAIL[0], row['film_out'] + TAIL[1], beat, phase)
        end = min(pts, key=lambda p: abs(p - row['film_out'] - 1.2)) if pts else row['film_out'] + 1.2
        cc = c + (0.0 if DUR[0] <= end <= DUR[1] else 50.0 * min(abs(end - DUR[0]), abs(end - DUR[1])) ** 2) + (1e6 if end > 30.0 else 0)
        if best is None or cc < best[0]: best = (cc, key, end)
    cost, key, end = best
    rows = []
    for L in range(len(layers) - 1, -1, -1):
        c, row, parent = layers[L][key]; rows.append(row); key = parent
    return cost, rows[::-1], end


def search():
    best = []
    for T in np.arange(1.00, 1.0801, 0.005):
        for bpm in np.arange(121.0, 127.01, 0.1):
            beat = 60 / bpm
            for phase in np.arange(0.0, 4 * beat, 0.004):
                c, rows, end = place(T, bpm, phase)
                best.append((c, round(T, 3), round(bpm, 2), round(phase, 3), round(end, 3)))
    best.sort()
    print('best 15 (cost, tempo, bpm, phase of a bar line, film end):')
    for r in best[:15]: print('  ', r)
    # the best per tempo, so the tempo choice can be read from the numbers
    print('best per tempo:')
    for T in sorted({r[1] for r in best}):
        r = min(x for x in best if x[1] == T); print('  ', r)
    return best


def stretch(T):
    """the whole take, decoded to 48 kHz mono float and tempo-scaled by T with pitch kept (rubberband, speech-friendly
    settings), so source time s maps to s / T (checked against the envelope in check_alignment)"""
    p = subprocess.run(['ffmpeg', '-v', 'error', '-i', TAKE, '-ac', '1', '-ar', str(SR), '-af',
                        f'rubberband=tempo={T}:transients=mixed:detector=soft:window=standard:pitchq=quality:formant=preserved',
                        '-f', 'f32le', '-'], stdout=subprocess.PIPE, check=True)
    y = np.frombuffer(p.stdout, np.float32).astype(np.float64)
    p0 = subprocess.run(['ffmpeg', '-v', 'error', '-i', TAKE, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], stdout=subprocess.PIPE, check=True)
    x = np.frombuffer(p0.stdout, np.float32).astype(np.float64)
    return x, y


def envelope(x, hop=0.002, win=0.01):
    w, h = int(win * SR), int(hop * SR)
    return 20 * np.log10(np.sqrt(np.convolve(x * x, np.ones(w) / w, 'same'))[::h] + 1e-9)


def check_alignment(x, y, T):
    """cross-correlate the stretched envelope with the source envelope resampled by 1/T: returns the lag (s) to add to
    s / T to find a source moment in the stretched file"""
    ex, ey = envelope(x), envelope(y)
    n = len(ey); src_t = np.arange(n) * 0.002 * T
    exr = np.interp(src_t, np.arange(len(ex)) * 0.002, ex)
    a, b = np.clip(exr, -70, 0), np.clip(ey, -70, 0)
    a -= a.mean(); b -= b.mean()
    lags = range(-60, 61)
    cc = [np.dot(a[max(0, -L):n - max(0, L)], b[max(0, L):n - max(0, -L)]) for L in lags]
    L = list(lags)[int(np.argmax(cc))]
    return L * 0.002, float(np.max(cc) / (np.linalg.norm(a) * np.linalg.norm(b)))


def hann_fade(n, rising=True):
    k = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, n)) if n > 1 else np.ones(1)
    return k if rising else k[::-1]


def render(T, bpm, phase, search_note=None):
    cost, rows, end = place(T, bpm, phase)
    x, y = stretch(T)
    lag, corr = check_alignment(x, y, T)
    print(f'rubberband alignment: lag {lag * 1000:+.0f} ms, envelope correlation {corr:.3f}')
    N = int(np.ceil(end * SR)) + 1
    out = np.zeros(N)
    for k, r in enumerate(rows):
        a, b = r['src']
        i0, i1 = int(round((a / T + lag) * SR)), int(round((b / T + lag) * SR))
        seg = y[i0:i1].copy()
        nxt = rows[k + 1] if k + 1 < len(rows) else None
        joined_in = r['id'] in JOINED                                     # cut inside a dip: short fades
        joined_out = nxt is not None and nxt['id'] in JOINED and nxt['film_in'] - r['film_out'] < 0.03
        fi = int((0.010 if joined_in else 0.006) * SR)
        fo = int((0.012 if joined_out else 0.035) * SR)                   # else: the natural tail fades out
        seg[:fi] *= hann_fade(fi, True); seg[-fo:] *= hann_fade(fo, False)
        j0 = int(round(r['film_in'] * SR))
        out[j0:j0 + len(seg)] += seg
    # the take's inhale, moved into the breath before the rule line: it ends 40 ms before «المعلومة»
    rr = next(r for r in rows if r['id'] == 'r1')
    a, b = BREATH
    i0, i1 = int(round((a / T + lag) * SR)), int(round((b / T + lag) * SR))
    br = y[i0:i1].copy() * 10 ** (-2 / 20)
    f = int(0.03 * SR); br[:f] *= hann_fade(f, True); br[-f:] *= hann_fade(f, False)
    j1 = int(round((rr['film_on'] - 0.04) * SR)); j0 = j1 - len(br)
    prev = rows[[r['id'] for r in rows].index('r1') - 1]
    if j0 < prev['film_out'] * SR: raise SystemExit('breath does not fit before the rule line')
    out[j0:j1] += br
    breath = [j0 / SR, j1 / SR]
    # peak-safe: sample peak -3 dBFS (true peak checked by ffmpeg below), 24-bit
    pk = np.abs(out).max(); g = 10 ** (-3 / 20) / pk
    out *= g
    os.makedirs(os.path.dirname(OUT_WAV), exist_ok=True)
    sf.write(OUT_WAV, out.astype(np.float32), SR, subtype='PCM_24')
    meas = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', OUT_WAV, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                          capture_output=True, text=True).stderr
    I = float(meas.split('I:')[-1].split('LUFS')[0]); TP = float(meas.split('Peak:')[-1].split('dBFS')[0])
    # words on the film timeline
    words = []
    for r in rows:
        ws = next(p for p in PIECES if p[0] == r['id'])[5]
        for k, (txt, s0) in enumerate(ws):
            st = r['film_on'] + (s0 - r['on_src']) / T
            en = (r['film_on'] + (ws[k + 1][1] - r['on_src']) / T) if k + 1 < len(ws) else r['film_out'] - 0.03
            words.append({'text': txt, 'line': r['line'], 'phrase': r['id'], 'start': round(st, 3), 'end': round(en, 3)})
    beat = 60 / bpm
    J = {
        '_note': 'The VO on the FILM timeline (seconds). Built by src/tools/vo_edit.py from vo/take1.mp3 (cut list: '
                 'src/tools/vo_pieces.py). Phrase in/on/out are measured to ±10 ms; inner word starts ±60 ms. word.end = '
                 "the next word's start inside a phrase, or the phrase's voiced end. Grid: beat k is at phase + k*60/bpm; "
                 'k % 4 == 0 is a bar line. Words are spelled as script.json vo lines (byte for byte; on screen «سي ڤي» is «CV»).',
        'source': 'vo/take1.mp3 (ElevenLabs eleven_v4, Jassim Almathkour, generation 78njtU9gFZpS7XmjjyqV)',
        'tempo': T, 'stretch': 'ffmpeg rubberband (pitch kept, formant preserved, transients mixed, soft detector)',
        'rubberband_lag_s': round(lag, 4), 'bpm': bpm, 'beat': round(beat, 6), 'phase': phase,
        'film_end': round(end, 3), 'vo_first_onset': round(rows[0]['film_on'], 3),
        'vo_last_end': round(rows[-1]['film_out'], 3), 'vo_edit_length': round(rows[-1]['film_out'] - rows[0]['film_in'], 3),
        'wav': {'file': 'src/vo/vo_edit.wav', 'sr': SR, 'channels': 1, 'format': 'PCM 24-bit', 'length_s': round(N / SR, 3),
                'gain_db': round(20 * np.log10(g), 2), 'integrated_lufs': I, 'true_peak_dbtp': TP,
                'note': 'sample peak normalised to -3 dBFS; the mix sets the speech level'},
        'breath': {'src': list(BREATH), 'film': [round(v, 3) for v in breath], 'gain_db': -2,
                   'note': "the take's one inhale, moved from before «حتى الهوامش» to before the rule line"},
        'phrases': [{'id': r['id'], 'line': r['line'], 'src': r['src'], 'src_on': r['on_src'], 'film_in': round(r['film_in'], 3),
                     'film_on': round(r['film_on'], 3), 'film_out': round(r['film_out'], 3), 'gap_before': round(r['gap'], 3),
                     'key_word_src': r['key_src'], 'key_word_film': round(r['key_film'], 3), 'grid': r['grid'],
                     'grid_miss_s': round(r['miss'], 3)} for r in rows],
        'words': words,
        'search': search_note,
    }
    json.dump(J, open(OUT_JSON, 'w'), ensure_ascii=False, indent=1)
    print(f'wrote {OUT_WAV} ({N / SR:.3f} s, {I} LUFS, TP {TP} dBTP) and {OUT_JSON}')
    for r in rows:
        bk = (r['key_film'] + LEAD - phase) / beat
        print(f"  {r['id']:4s} {r['line']}  in {r['film_in']:7.3f}  on {r['film_on']:7.3f}  out {r['film_out']:7.3f}  gap {r['gap']:.3f}"
              f"  key {r['key_film']:.3f} = beat {bk:6.2f} ({r['grid']}, miss {r['miss'] * 1000:.0f} ms)")
    print(f'  film end {end:.3f} = beat {(end - phase) / beat:.2f}')
    return J


if __name__ == '__main__':
    if '--search' in sys.argv:
        search()
    else:
        c = CHOICE
        if c['tempo'] is None: raise SystemExit('run --search and freeze CHOICE first')
        render(c['tempo'], c['bpm'], c['phase'], c.get('note'))
