"""TASH boost ad «نقاط مشروعك»: export the dotless word bodies the film is built on.
For each ش-word, shape it with HarfBuzz (Alexandria 900), replace every ش glyph by its س base component (every ش in
Alexandria is a composite: س form + `threedotsupabovear`), union all glyphs into ONE outline (skia-pathops, so the 3D
extrusion has no overlapping joins), and record where the native three dots sat (the ش slot, where TASH's dots go).
Writes src/assets/word.json, in px at 140 px type, origin = left end of the advance on the baseline, y DOWN:
  {words: {key: {text, d, adv, ink:[x0,y0,x1,y1], slot:[cx,cy]}}, lines: {text: width_px}, size, weight}
Run: python3 tools/word_export.py   (needs: pip install skia-pathops)
"""
import os, sys, json
import pathops
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

HERE = os.path.dirname(os.path.abspath(__file__))
TASH = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(TASH, '_system', 'tools'))
from glyphs import shape  # noqa: E402

FONTS = os.path.join(TASH, '_system', 'fonts')
ALEX = os.path.join(FONTS, 'Alexandria-VF.ttf')
SIZE, WEIGHT = 140, 900
DOTS = 'threedotsupabovear'
WORDS = {'mashrou3ak': 'مشروعك', 'shalayh': 'شاليه؟', 'mashawi': 'مشاوي؟', 'shmoo3': 'شموع؟'}
LINES = [  # (text, font, weight, size): widths for the layout record (the page shapes its own text in the browser)
    ('حلو…', ALEX, 800, 84), ('محد يسولف عنه؟', ALEX, 800, 84), ('خلّ إعلانك علينا', ALEX, 800, 80),
    ('من وين طلبتيه؟!', ALEX, 800, 84), ('خلّهم يسولفون عنك!', ALEX, 700, 64), ('اطلب إعلانك بالخاص', ALEX, 700, 64),
    ('دزّ لنا بالخاص', ALEX, 700, 64), ('وين هالمكان؟', ALEX, 800, 84),
    ('@tash.creative.kw', os.path.join(FONTS, 'JetBrainsMono-VF.ttf'), 600, 40),
    ('@tash.creative', os.path.join(FONTS, 'JetBrainsMono-VF.ttf'), 600, 40),
]

tt = instancer.instantiateVariableFont(TTFont(ALEX), {'wght': WEIGHT})
gs, glyf = tt.getGlyphSet(), tt['glyf']
upem = tt['head'].unitsPerEm
k = SIZE / upem


def export(text):
    r = shape(ALEX, str(WEIGHT), text)
    path = pathops.Path()
    slot = None
    for g in r['glyphs']:
        name, gx, gy = g['name'], g['x'], g['y']
        parts = [(name, 0, 0)]
        gl = glyf[name]
        if gl.isComposite() and any(c.glyphName == DOTS for c in gl.components):
            parts = [(c.glyphName, c.x, c.y) for c in gl.components if c.glyphName != DOTS]
            c = next(c for c in gl.components if c.glyphName == DOTS)
            bp = BoundsPen(gs); gs[DOTS].draw(bp); x0, y0, x1, y1 = bp.bounds
            slot = (gx + c.x + (x0 + x1) / 2, gy + c.y + (y0 + y1) / 2)
        for pn, ox, oy in parts:
            p = pathops.Path()
            gs[pn].draw(TransformPen(p.getPen(glyphSet=gs), (1, 0, 0, 1, gx + ox, gy + oy)))
            path = pathops.op(path, p, pathops.PathOp.UNION)
    assert slot is not None, text
    # font units (y up) → px (y down) at SIZE
    svg = SVGPathPen(None, ntos=lambda v: f'{v:.2f}'.rstrip('0').rstrip('.'))
    path.draw(TransformPen(svg, (k, 0, 0, -k, 0, 0)))
    bp = BoundsPen(None); path.draw(bp); x0, y0, x1, y1 = bp.bounds
    return {'text': text, 'd': svg.getCommands(), 'adv': round(r['advance'] * k, 2),
            'ink': [round(x0 * k, 2), round(-y1 * k, 2), round(x1 * k, 2), round(-y0 * k, 2)],
            'slot': [round(slot[0] * k, 2), round(-slot[1] * k, 2)]}


out = {'size': SIZE, 'weight': WEIGHT, 'words': {key: export(t) for key, t in WORDS.items()}, 'lines': {}}
for text, font, w, size in LINES:
    out['lines'][text] = round(shape(font, str(w), text)['advance'] * size / TTFont(font)['head'].unitsPerEm, 1)
json.dump(out, open(os.path.join(HERE, '..', 'src', 'assets', 'word.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
for key, w in out['words'].items():
    print(f"{key:11s} {w['text']:8s} adv {w['adv']:6.1f}  ink {w['ink']}  slot {w['slot']}  d {len(w['d'])} chars")
print(out['lines'])
