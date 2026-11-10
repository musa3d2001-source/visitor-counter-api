"""Contact board of every example → 03-templates/examples/_overview.png (2400 px wide).
Run after `node 03-templates/render.mjs --all` (and after re-rendering the animated story's poster):
    python3 03-templates/src/overview.py
Rows are fixed so the board reads the same way every time: posts · carousel (+ its cover on lime and paper) + client 4:5 + safe zones ·
9:16 covers and stories · highlights, motion poster, guide versions, profile preview."""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
EX = os.path.join(HERE, '..', 'examples')
FONT = ImageFont.truetype(os.path.join(HERE, '..', '..', '_system', 'fonts', 'JetBrainsMono-VF.ttf'), 17)
W, PAD, GAP, LAB = 2400, 14, 10, 30
INK, BOARD, SMOKE = (11, 11, 11), (26, 26, 24), (142, 144, 136)

ROWS = [
    ['post-statement-01', 'post-statement-02', 'post-service-01', 'post-service-02',
     'post-before-after-01', 'post-before-after-02', 'post-cta-01', 'post-cta-02'],
    ['carousel-how-to-order-01-cover', 'carousel-how-to-order-02', 'carousel-how-to-order-03', 'carousel-how-to-order-04',
     'carousel-how-to-order-05', 'carousel-how-to-order-06-closing', 'carousel-cover-lime', 'carousel-cover-paper',
     'client-poster-looma-4x5', 'safe-zones'],
    ['reel-cover-launch', 'reel-cover-concept', 'reel-cover-bts', 'reel-cover-launch-guide', 'story-new-work-01',
     'story-new-work-02', 'story-how-to-order', 'story-qa-poll', 'story-qa-answer', 'client-poster-looma-9x16'],
    ['highlight-1-work', 'highlight-2-services', 'highlight-3-order', 'highlight-4-prices', 'highlight-5-faq',
     'story-new-work-anim-poster', 'story-qa-poll-guide', 'story-how-to-order-guide', 'client-poster-looma-9x16-guide',
     'highlight-guide', 'highlights-preview'],
]


def row_images(names):
    ims = []
    for n in names:
        p = os.path.join(EX, n + '.png')
        if os.path.exists(p):
            ims.append((n, Image.open(p).convert('RGB')))
        else:
            print('missing:', n)
    return ims


def main():
    rows, total_h = [], PAD
    for names in ROWS:
        ims = row_images(names)
        avail = W - 2 * PAD - GAP * (len(ims) - 1)
        h = avail / sum(im.width / im.height for _, im in ims)       # one height that fills the row exactly
        rows.append((ims, h))
        total_h += h + LAB + GAP
    board = Image.new('RGB', (W, int(total_h + PAD)), BOARD)
    d = ImageDraw.Draw(board)
    y = PAD
    for ims, h in rows:
        x = PAD
        for n, im in ims:
            w = im.width * h / im.height
            board.paste(im.resize((round(w), round(h)), Image.LANCZOS), (round(x), round(y)))
            label = n if d.textlength(n, font=FONT) <= w else n[: max(4, int(len(n) * w / d.textlength(n, font=FONT)) - 1)] + '…'
            d.text((round(x), round(y + h + 6)), label, font=FONT, fill=SMOKE)
            x += w + GAP
        y += h + LAB + GAP
    out = os.path.join(EX, '_overview.png')
    board.save(out, optimize=True)
    print(out, board.size)


if __name__ == '__main__':
    main()
