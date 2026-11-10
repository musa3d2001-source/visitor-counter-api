"""Compare the 1080p final with the 480p draft frame by frame (does the final keep the draft's motion?).
usage: python3 -I compare_final.py <final.mp4> <draft frames dir> <work dir>
"""
import sys, os, json, subprocess
import numpy as np
from PIL import Image
final, dframes, work = sys.argv[1:4]
os.makedirs(work, exist_ok=True)
pr = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries',
     'stream=width,height,r_frame_rate,nb_read_frames,duration,codec_name,pix_fmt,bit_rate', '-of', 'json', final]))['streams'][0]
print('final probe', pr)
small = os.path.join(work, 'small'); full = os.path.join(work, 'full'); os.makedirs(small, exist_ok=True); os.makedirs(full, exist_ok=True)
subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-i', final, '-vsync', '0', '-vf', 'scale=480:854:flags=area', os.path.join(small, '%04d.png')])
subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-i', final, '-vsync', '0', '-q:v', '2', os.path.join(full, '%04d.jpg')])
def L(a): return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
def ssim(a, b):
    from numpy.lib.stride_tricks import sliding_window_view as sw
    a, b = L(a), L(b); C1, C2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2; k = 7
    A, B = sw(a, (k, k))[::2, ::2], sw(b, (k, k))[::2, ::2]
    ma, mb = A.mean((-1, -2)), B.mean((-1, -2)); va, vb = A.var((-1, -2)), B.var((-1, -2)); cov = ((A - ma[..., None, None]) * (B - mb[..., None, None])).mean((-1, -2))
    return float((((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma ** 2 + mb ** 2 + C1) * (va + vb + C2))).mean())
fs = sorted(os.listdir(small)); ds = sorted(os.listdir(dframes))
n = min(len(fs), len(ds)); rows = []
hero = (slice(int(930 / 2.2482) - 60, int(1610 / 2.2482)), slice(int(300 / 2.2482), int(780 / 2.2482)))
for i in range(n):
    a = np.asarray(Image.open(os.path.join(small, fs[i])).convert('RGB')).astype(float)
    b = np.asarray(Image.open(os.path.join(dframes, ds[i])).convert('RGB')).astype(float)
    rows.append((i, round(ssim(a, b), 4), round(ssim(a[hero], b[hero]), 4), round(float(np.abs(a - b).mean()), 2)))
out = {'probe': pr, 'frames_final': len(fs), 'frames_draft': len(ds), 'per_frame': rows,
       'ssim_whole_min': min(r[1] for r in rows), 'ssim_whole_mean': round(sum(r[1] for r in rows) / n, 4),
       'ssim_hero_min': min(r[2] for r in rows), 'ssim_hero_mean': round(sum(r[2] for r in rows) / n, 4)}
json.dump(out, open(os.path.join(work, 'compare.json'), 'w'), indent=1)
print({k: v for k, v in out.items() if k not in ('per_frame', 'probe')})
for r in rows: print(r)
