#!/usr/bin/env python3
"""Package the four reels that other teams made (posts 1, 2, 3, 9) into 08-instagram.

  python3 08-instagram/src/package_reels.py          # copy + verify + write covers, record source hashes
  python3 08-instagram/src/package_reels.py --check  # only report whether any source changed since packaging

For each reel: copies the delivered 9:16 MP4 unchanged (byte-identical, so the upload is the team's master) and
writes cover.png from the team's poster.png. A cover may be moved down by `shift` px when its top block sits on the
profile-grid crop line (the grid shows the centre 3:4, y 240-1680 of a 9:16 cover). The rows uncovered at the very
top are filled from the poster's own top rows, translated along the background's pattern direction, so stripes or
gradients continue; nothing inside the 3:4 crop is invented. Run from anywhere; paths are resolved from tash/.
"""
import hashlib, json, shutil, subprocess, sys
from pathlib import Path

import numpy as np
from PIL import Image

TASH = Path(__file__).resolve().parents[2]
OUT = TASH / '08-instagram'
REC = OUT / 'src' / 'sources.json'

REELS = [
    # post, folder, video, poster, shift (px down), why[, clear = first poster row holding type or picture]
    (1, '01-habba-concept-reel', '05-concept-ads/03-coffee-habba/HABBA-concept-9x16.mp4', '05-concept-ads/03-coffee-habba/poster.png', 0,
     'photoreal cut (18:22): its poster already keeps the TASH pill at y≈290, inside the grid crop; the old CGI poster needed 30 px'),
    (2, '02-stakk-concept-reel', '05-concept-ads/02-burger-stakk/STAKK-concept-9x16.mp4', '05-concept-ads/02-burger-stakk/poster.png', 0, ''),
    (3, '03-layl-concept-reel', '05-concept-ads/01-perfume-layl/LAYL-concept-9x16.mp4', '05-concept-ads/01-perfume-layl/poster.png', 30,
     'TASH mark shadda at y≈235 crossed the grid crop (240)'),
    (9, '09-launch-reel', '04-launch-ad/TASH-launch-9x16.mp4', '04-launch-ad/poster.png', 24,
     'top line «هذا منتجك.» started 10 px inside the grid crop: the pinned-first tile looked guillotined', 244),
]


def sha1(p: Path) -> str:
    h = hashlib.sha1()
    with open(p, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def probe(p: Path) -> dict:
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries',
                          'stream=codec_type,codec_name,profile,width,height,r_frame_rate,pix_fmt,sample_rate,channels:format=duration',
                          '-of', 'json', str(p)], capture_output=True, text=True, check=True).stdout
    j = json.loads(out)
    v = next(s for s in j['streams'] if s['codec_type'] == 'video')
    a = next((s for s in j['streams'] if s['codec_type'] == 'audio'), None)
    return {'w': v['width'], 'h': v['height'], 'fps': v['r_frame_rate'], 'vcodec': v['codec_name'], 'profile': v.get('profile'),
            'pix': v['pix_fmt'], 'acodec': a and a['codec_name'], 'ar': a and a['sample_rate'], 'ch': a and a['channels'],
            'dur': round(float(j['format']['duration']), 3)}


def check_spec(s: dict) -> list:
    bad = []
    if (s['w'], s['h']) != (1080, 1920): bad.append(f"size {s['w']}x{s['h']}")
    if s['fps'] != '30/1': bad.append(f"fps {s['fps']}")
    if s['vcodec'] != 'h264' or s['pix'] != 'yuv420p': bad.append(f"video {s['vcodec']} {s['pix']}")
    if s['acodec'] != 'aac' or s['ar'] != '48000': bad.append(f"audio {s['acodec']} {s['ar']}")
    if not 3 <= s['dur'] <= 90: bad.append(f"duration {s['dur']}")
    return bad


def make_cover(poster: Path, out: Path, shift: int, clear: int = 215) -> str:
    """clear = first poster row that holds type or picture (everything above it is plain background)."""
    im = Image.open(poster).convert('RGB')
    assert im.size == (1080, 1920), f'{poster} is {im.size}'
    if not shift:
        im.save(out, optimize=True)
        return 'unchanged'
    a = np.asarray(im).astype(np.float32)
    # new row y samples old row g(y). Below Y1: a plain shift, g(y) = y - shift (all type and pictures move intact).
    # Above Y1 (background only, no type): g(y) = A·y + B·y², with g(Y1) = Y1 - shift and g'(Y1) = 1, so the empty
    # background band is stretched smoothly (1.3× at the very top, 1× at the join): no seam, no invented content.
    Y1 = clear + shift
    B = shift / Y1 ** 2
    A = 1 - 2 * shift / Y1
    y = np.arange(1920, dtype=np.float64)
    g = np.where(y < Y1, A * y + B * y * y, y - shift)
    y0 = np.clip(np.floor(g).astype(int), 0, 1919); y1 = np.clip(y0 + 1, 0, 1919); f = (g - np.floor(g))[:, None, None]
    new = a[y0] * (1 - f) + a[y1] * f
    Image.fromarray(np.clip(new + 0.5, 0, 255).astype(np.uint8)).save(out, optimize=True)
    return f'moved down {shift}px (empty background above y={clear} stretched smoothly to fill the top)'


def main():
    check_only = '--check' in sys.argv
    rec = json.loads(REC.read_text()) if REC.exists() else {}
    changed = []
    for n, folder, vid, pst, shift, why, *rest in REELS:
        clear = rest[0] if rest else 215
        V, P = TASH / vid, TASH / pst
        hv, hp = sha1(V), sha1(P)
        old = rec.get(str(n), {})
        if old and (old.get('video_sha1') != hv or old.get('poster_sha1') != hp):
            changed.append(n)
        if check_only:
            print(f"post {n}: {'CHANGED since packaging' if n in changed else 'unchanged'}  ({vid})")
            continue
        d = OUT / folder; d.mkdir(parents=True, exist_ok=True)
        spec = probe(V)
        bad = check_spec(spec)
        shutil.copy2(V, d / 'reel.mp4')
        assert sha1(d / 'reel.mp4') == hv
        how = make_cover(P, d / 'cover.png', shift, clear)
        rec[str(n)] = {'folder': folder, 'video': vid, 'video_sha1': hv, 'poster': pst, 'poster_sha1': hp,
                       'spec': spec, 'cover': how, 'why': why}
        print(f"post {n} → {folder}/reel.mp4 {spec['w']}x{spec['h']} {spec['fps']} {spec['dur']}s {spec['vcodec']}/{spec['acodec']} {spec['ar']}"
              f"{'  SPEC PROBLEM: ' + ', '.join(bad) if bad else ''}\n         cover.png: {how}")
    if not check_only:
        REC.write_text(json.dumps(rec, indent=2, ensure_ascii=False) + '\n')
    elif changed:
        print('\nRe-run without --check, then re-check covers in the profile preview.')
        sys.exit(2)


if __name__ == '__main__':
    main()
