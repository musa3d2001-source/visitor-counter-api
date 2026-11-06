"""Brand guide — media prep (run from anywhere):  python3 -I tash/01-brand-guide/src/prep-media.py
Pulls real frames from the studio's own deliverables and measures the real sonic logo, so every
visual in the guide comes from the system (no placeholders, nothing hand-typed).
Outputs → 01-brand-guide/assets/ (images) and 01-brand-guide/src/data/ (json)."""
import json, os, re, subprocess, sys
import numpy as np
from PIL import Image
from scipy.io import wavfile

HERE = os.path.dirname(os.path.abspath(__file__))
TASH = os.path.abspath(os.path.join(HERE, '..', '..'))
ASSETS = os.path.join(TASH, '01-brand-guide', 'assets')
DATA = os.path.join(HERE, 'data')
os.makedirs(ASSETS, exist_ok=True); os.makedirs(DATA, exist_ok=True)


def frame(video, t, out, w=540):
    tmp = out + '.tmp.png'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{t:.3f}', '-i', video, '-frames:v', '1', tmp], check=True)
    im = Image.open(tmp).convert('RGB'); os.remove(tmp)
    im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    im.save(out, quality=88, optimize=True, progressive=True)
    return im


# ---------------------------------------------------------------- concept-ad frames (client palette vs TASH tail)
ads = {
    'layl': ('05-concept-ads/01-perfume-layl/LAYL-concept-9x16.mp4', {'card': 12.7, 'tail': 15.7}),
    'stakk': ('05-concept-ads/02-burger-stakk/STAKK-concept-9x16.mp4', {'card': 11.1, 'tail': 13.7}),
}
palettes = {}
for name, (rel, times) in ads.items():
    v = os.path.join(TASH, rel)
    for k, t in times.items():
        frame(v, t, os.path.join(ASSETS, f'ad-{name}-{k}.jpg'))
    # hero = the teammate's text-free hero still (same frames as the film)
    im = Image.open(os.path.join(TASH, os.path.dirname(rel), 'still-hero.png')).convert('RGB')
    im = im.resize((540, 960), Image.LANCZOS); im.save(os.path.join(ASSETS, f'ad-{name}-hero.jpg'), quality=88, optimize=True, progressive=True)
    # measured palette of the client's own picture: median-cut quantise, keep the most used colours
    q = im.resize((180, 320)).quantize(colors=6, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()[:18]; counts = sorted(q.getcolors(), reverse=True)
    palettes[name] = [{'hex': '#%02X%02X%02X' % tuple(pal[i * 3:i * 3 + 3]), 'share': round(c / (180 * 320), 3)} for c, i in counts[:6]]

# ---------------------------------------------------------------- sonic logo: waveform + measured loudness
wav = os.path.join(TASH, '02-logo/motion/tash-sonic-logo.wav')
sr, x = wavfile.read(wav)
x = x.astype(np.float64); m = x.mean(axis=1) if x.ndim == 2 else x
bins = 420; n = len(m) // bins
peaks = [[round(float(m[i * n:(i + 1) * n].min()), 4), round(float(m[i * n:(i + 1) * n].max()), 4)] for i in range(bins)]


def ebur(path):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    s = r[r.rfind('Summary:'):]
    g = lambda k: float(re.search(k + r':\s+(-?[\d.]+)', s).group(1))
    return {'I': g('I'), 'LRA': g('LRA'), 'TP': g('Peak')}


loud = {'wav': ebur(wav), 'mp4': ebur(os.path.join(TASH, '02-logo/motion/tash-logo-sting-9x16.mp4'))}
json.dump({'sr': int(sr), 'duration': round(len(m) / sr, 3), 'bins': bins, 'peaks': peaks, 'loudness': loud,
           'palettes': palettes}, open(os.path.join(DATA, 'media.json'), 'w'))
print('media.json:', loud, palettes)
