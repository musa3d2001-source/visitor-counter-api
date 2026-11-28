"""Measure a Seedance opener draft against the STORYBOARD section 4 gates (numbers only; judgement is separate).
usage: python3 -I gates.py <clip.mp4> <start_still.png> <work dir>
Coordinates are reported in the 1080x1920 layout (draft pixels scaled up).
"""
import sys, os, json, subprocess
import numpy as np
from PIL import Image
clip, still, work = sys.argv[1:4]
os.makedirs(work, exist_ok=True)
pr = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries',
     'stream=width,height,r_frame_rate,avg_frame_rate,nb_read_frames,duration,codec_name,pix_fmt', '-of', 'json', clip]))['streams'][0]
W, H = int(pr['width']), int(pr['height'])
fdir = os.path.join(work, 'frames'); os.makedirs(fdir, exist_ok=True)
subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-i', clip, '-vsync', '0', os.path.join(fdir, '%04d.png')])
files = sorted(f for f in os.listdir(fdir) if f.endswith('.png'))
num, den = map(int, pr['r_frame_rate'].split('/')); fps = num / den
S = 1920 / H                                   # draft -> layout scale
st = np.asarray(Image.open(still).convert('RGB').resize((W, H), Image.LANCZOS)).astype(float)
def L(a): return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
def ssim(a, b):
    a, b = L(a), L(b); C1, C2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    from numpy.lib.stride_tricks import sliding_window_view as sw
    k = 7
    A, B = sw(a, (k, k)), sw(b, (k, k))
    ma, mb = A.mean((-1, -2)), B.mean((-1, -2)); va, vb = A.var((-1, -2)), B.var((-1, -2)); cov = ((A - ma[..., None, None]) * (B - mb[..., None, None])).mean((-1, -2))
    return float((((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma ** 2 + mb ** 2 + C1) * (va + vb + C2))).mean())
fr = [np.asarray(Image.open(os.path.join(fdir, f)).convert('RGB')).astype(float) for f in files]
f0 = fr[0]
out = {'probe': pr, 'fps': fps, 'frames_decoded': len(fr), 'scale_to_layout': S}
out['ssim_f0_vs_still'] = round(ssim(f0, st), 4)
out['ssim_f0_vs_still_layout_rows_880_1920'] = round(ssim(f0[int(880 / S):], st[int(880 / S):]), 4)
# backdrop reference from frame 0: rows above the ice (layout y 0-880) are flat backdrop
bg = np.median(f0[: int(870 / S)].reshape(-1, 3), axis=0)
y880 = int(round(880 / S))
rows = []
prev = None
for i, a in enumerate(fr):
    d = np.abs(a - bg).max(axis=2)                                 # deviation from backdrop colour
    top = a[:y880]; dev_top = np.abs(top - bg).max(axis=2)
    # what sits above y 880: count pixels deviating > 40 levels from the flat backdrop
    above = int((dev_top > 40).sum())
    # highest non-backdrop row in the centre band (x 300-780), layout coords
    band = d[:, int(300 / S):int(780 / S)] > 40
    rr = np.where(band.any(axis=1))[0]
    highest = round(float(rr.min() * S), 1) if len(rr) else None
    # motion energy vs previous frame inside the hero box and in the corners (camera check)
    me = None; corner = None
    if prev is not None:
        hb = (slice(int(930 / S), int(1610 / S)), slice(int(300 / S), int(780 / S)))
        me = round(float(np.abs(a[hb] - prev[hb]).mean()), 3)
        cs = [(slice(0, int(250 / S)), slice(0, int(250 / S))), (slice(0, int(250 / S)), slice(W - int(250 / S), W)), (slice(int(1700 / S), H), slice(0, int(200 / S))), (slice(int(1700 / S), H), slice(W - int(200 / S), W))]
        corner = round(float(np.mean([np.abs(a[c] - prev[c]).mean() for c in cs])), 3)
    # diff to frame 0 in the corners (drift / exposure change)
    cs0 = [(slice(0, int(250 / S)), slice(0, int(250 / S))), (slice(int(1700 / S), H), slice(W - int(200 / S), W))]
    drift = round(float(np.mean([np.abs(a[c] - f0[c]).mean() for c in cs0])), 3)
    rows.append({'i': i, 't': round(i / fps, 3), 'pixels_above_880': above, 'highest_nonbg_y_centre': highest, 'motion_hero': me, 'motion_corners': corner, 'corner_drift_vs_f0': drift})
    prev = a
out['per_frame'] = rows
# mpdecimate duplicate count
md = subprocess.run(['ffmpeg', '-v', 'info', '-i', clip, '-vf', 'mpdecimate,showinfo', '-f', 'null', '-'], capture_output=True, text=True).stderr
out['mpdecimate_kept'] = md.count('showinfo') and sum(1 for l in md.splitlines() if 'Parsed_showinfo' in l and ' n:' in l)
out['mpdecimate_dropped'] = len(fr) - out['mpdecimate_kept']
json.dump(out, open(os.path.join(work, 'gates.json'), 'w'), indent=1)
print(json.dumps({k: v for k, v in out.items() if k != 'per_frame' and k != 'probe'}, indent=1))
print('probe', {k: pr[k] for k in pr})
for r in rows: print(r)
