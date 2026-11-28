#!/usr/bin/env python3
"""Pictures for post 7 (services carousel) cut from the launch ad master, so they always match post 9.

  python3 08-instagram/src/launch_frames.py

Each asset is one frame of `04-launch-ad/TASH-launch-9x16.mp4` (decoded by FFmpeg to RGB PNG), cropped, saved as JPEG q93:
  launch-storyboard.jpg  frame 336 (11.20 s)  the script card + pencil boards     crop x40  y470  1000×890   (slide 05)
  launch-timeline.jpg    frame 414 (13.80 s)  the edit timeline (00:00:13:24)      crop x60  y330  960×1180   (slide 06)
  launch-phone.jpg       frame 474 (15.80 s)  the phone + «منو مسوي هالإعلان؟!»   crop x150 y250  780×1320   (slide 03)
The timeline's V1 thumbnails show the launch ad's own clips, so when the launch ad swapped its CGI burger and coffee for
the photoreal ones (6 Nov), slide 06 had to be re-cut. The crop + q93 recipe reproduces the earlier three files byte
for byte from the frames they were cut from, so only the pixels of the master change them. Run from anywhere; paths are
resolved from tash/.
"""
import subprocess, tempfile
from pathlib import Path

from PIL import Image

TASH = Path(__file__).resolve().parents[2]
MASTER = TASH / '04-launch-ad' / 'TASH-launch-9x16.mp4'
OUT = TASH / '08-instagram' / 'src' / 'assets'
JOBS = [('launch-storyboard.jpg', 336, (40, 470, 1000, 890)),
        ('launch-timeline.jpg', 414, (60, 330, 960, 1180)),
        ('launch-phone.jpg', 474, (150, 250, 780, 1320))]


def frame(n: int, tmp: Path) -> Image.Image:
    p = tmp / f'f{n}.png'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(MASTER), '-vf', f'select=eq(n\\,{n})', '-vsync', '0',
                    '-frames:v', '1', str(p)], check=True)
    return Image.open(p).convert('RGB')


def main():
    with tempfile.TemporaryDirectory() as d:
        for name, n, (x, y, w, h) in JOBS:
            im = frame(n, Path(d))
            assert im.size == (1080, 1920), im.size
            im.crop((x, y, x + w, y + h)).save(OUT / name, 'JPEG', quality=93)
            print(f'{name}: frame {n} ({n / 30:.2f} s), {w}×{h}')


if __name__ == '__main__':
    main()
