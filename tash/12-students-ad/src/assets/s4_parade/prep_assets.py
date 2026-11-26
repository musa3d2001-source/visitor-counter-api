#!/usr/bin/env python3
"""s4_parade assets: pre-scaled copies of the sample works (Lanczos, so text stays crisp in the 3D cards instead of being
minified by the compositor), soft reflection textures, and one edited plate: the video frame without its playhead (the
scene draws a moving playhead and a running timecode on top). Re-run after the samples change:
    python3 src/assets/s4_parade/prep_assets.py        (from tash/12-students-ad/)
Reads ../samples/*.png (read-only); writes only into this folder."""
from pathlib import Path
from PIL import Image, ImageFilter, ImageDraw

HERE = Path(__file__).resolve().parent
SAMPLES = HERE.parents[2] / 'samples'

WIDE = ['deck-uni-01-title', 'deck-uni-02-problem', 'deck-uni-03-data', 'deck-uni-04-thanks', 'deck-school-01-title',
        'deck-school-02-cycle', 'deck-school-03-quiz', 'sheet-dashboard', 'video-frame']
TALL = ['report-01-cover', 'report-02-contents', 'report-03-chart', 'research-01-first', 'research-02-refs',
        'cv-student', 'poster-recycle']
REFL = ['deck-uni-01-title', 'report-01-cover', 'report-03-chart', 'research-01-first', 'research-02-refs',
        'poster-recycle', 'video-frame', 'cv-student', 'sheet-dashboard']


def save_jpg(im, name):
    im.convert('RGB').save(HERE / f'{name}.jpg', quality=93, subsampling=0, optimize=True)


def video_without_playhead(im):
    """remove the red playhead (x 979-1000, y 800-1080 in the 1920x1080 plate) by copying the columns just left of it;
    the tracks are horizontal bands, so the patch is invisible at card size"""
    im = im.copy()
    src = im.crop((955, 798, 978, 1080))
    im.paste(src, (979, 798))
    return im


def main():
    for n in WIDE:
        im = Image.open(SAMPLES / f'{n}.png').convert('RGB')
        if n == 'video-frame':
            im = video_without_playhead(im)
        save_jpg(im.resize((1280, 720), Image.LANCZOS), n)
    for n in TALL:
        im = Image.open(SAMPLES / f'{n}.png').convert('RGB')
        save_jpg(im.resize((800, round(800 * im.height / im.width)), Image.LANCZOS), n)
    for n in REFL:
        im = Image.open(SAMPLES / f'{n}.png').convert('RGB')
        if n == 'video-frame':
            im = video_without_playhead(im)
        w = 220
        sm = im.resize((w, round(w * im.height / im.width)), Image.LANCZOS).filter(ImageFilter.GaussianBlur(3.2))
        # the floor fade is baked into the alpha (the bottom of the card meets the floor at full strength), so the page
        # needs no CSS mask: 1.0 at the bottom row → 0.35 at 22 % up → 0 at 48 % up
        a = Image.new('L', sm.size)
        h = sm.height
        for y in range(h):
            u = (h - 1 - y) / (h - 1)
            v = 1 - u / 0.22 * 0.65 if u < 0.22 else max(0.0, 0.35 * (1 - (u - 0.22) / 0.26))
            a.paste(round(255 * v), (0, y, sm.width, y + 1))
        rgba = sm.convert('RGBA'); rgba.putalpha(a)
        rgba.save(HERE / f'refl-{n}.png', optimize=True)
    print('ok', sorted(p.name for p in HERE.glob('*.jpg')))


if __name__ == '__main__':
    main()
