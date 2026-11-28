"""Kling clip QC: extract frames (BT.601 default decode, matches the start stills), per-frame stats, contact sheet.
usage: python3 -I kling_qc.py <clip.mp4> <start still.png> <work dir> <label>
"""
import sys, os, json, subprocess
import numpy as np
from PIL import Image, ImageDraw
clip, still, work, label = sys.argv[1:5]
fd = os.path.join(work, 'frames'); os.makedirs(fd, exist_ok=True)
subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-i', clip, '-vsync', '0', os.path.join(fd, '%04d.png')])
fs = sorted(os.listdir(fd)); fr = [np.asarray(Image.open(os.path.join(fd, f)).convert('RGB')).astype(float) for f in fs]
st = np.asarray(Image.open(still).convert('RGB').resize(fr[0].shape[1::-1])).astype(float)
bg = np.median(st[:860].reshape(-1, 3), axis=0)
rows = []; prev = None
for i, a in enumerate(fr):
    top = np.abs(a[:880] - bg).max(axis=2); above = int((top > 40).sum())
    hb = a[930:1610, 300:780]
    me = None if prev is None else round(float(np.abs(hb - prev[930:1610, 300:780]).mean()), 2)
    cs = [a[:200, :200], a[:200, -200:], a[-150:, :150], a[-150:, -150:]]
    corner = round(float(np.mean([np.abs(c - s).mean() for c, s in zip(cs, [st[:200, :200], st[:200, -200:], st[-150:, :150], st[-150:, -150:]])])), 2)
    rows.append({'n': i, 't': round(i / 24, 3), 'px_above_880': above, 'motion_hero': me, 'corners_vs_still': corner})
    prev = a
d0 = float(np.abs(fr[0] - st).mean())
out = {'label': label, 'frames': len(fr), 'f0_mean_abs_diff_vs_still': round(d0, 2), 'per_frame': rows}
json.dump(out, open(os.path.join(work, 'qc.json'), 'w'), indent=1)
idx = list(range(0, len(fr), 4)); tw, th = 216, 384; cols = 10
S = Image.new('RGB', (cols * (tw + 4), ((len(idx) + cols - 1) // cols) * (th + 20)), (20, 20, 18)); dr = ImageDraw.Draw(S)
for k, i in enumerate(idx):
    x, y = (k % cols) * (tw + 4), (k // cols) * (th + 20)
    S.paste(Image.fromarray(fr[i].astype(np.uint8)).resize((tw, th), Image.LANCZOS), (x, y)); dr.line([x, y + int(880 / 1920 * th), x + tw, y + int(880 / 1920 * th)], fill=(255, 255, 0))
    dr.text((x + 4, y + th + 4), f'{label} n{i} {i/24:.2f}s', fill=(198, 255, 0))
S.save(os.path.join(work, 'contact.jpg'), quality=88)
print(label, 'frames', len(fr), 'f0 diff', round(d0, 2), 'max px above 880', max(r['px_above_880'] for r in rows), 'at', [r['n'] for r in rows if r['px_above_880'] > 0][:6])
print('motion', [r['motion_hero'] for r in rows][:40])
