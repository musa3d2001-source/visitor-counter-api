"""Contact sheet of all guide pages (review aid): python3 -I contact.py <pages-dir> <out.png> [cols] [width]"""
import sys, glob, os
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 5
w = int(sys.argv[4]) if len(sys.argv) > 4 else 560
fs = sorted(glob.glob(os.path.join(src, 'page-*.png')))
h = round(w * 210 / 297); g = 10
rows = (len(fs) + cols - 1) // cols
sheet = Image.new('RGB', (cols * (w + g) + g, rows * (h + g) + g), (60, 60, 56))
for i, f in enumerate(fs):
    im = Image.open(f).convert('RGB').resize((w, h), Image.LANCZOS)
    sheet.paste(im, (g + (i % cols) * (w + g), g + (i // cols) * (h + g)))
sheet.save(out); print(out, sheet.size)
